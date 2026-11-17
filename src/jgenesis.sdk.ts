/**
 * The engine package's entry point: an `EngineSDK` for jgenesis, the multi-system
 * emulator (Mega Drive / Genesis, Sega CD, 32X, Master System, Game Gear, SNES, GBA).
 *
 * ```js
 * import JgenesisSDK from '@wasm-gaming/jgenesis-wasm';
 *
 * const play = await new JgenesisSDK()
 *   .options({ romFileName: 'sonic.md' })      // the extension picks the system
 *   .assets({ rom: () => readRom() })
 *   .storage({ namespace: 'sonic' })           // save states → OPFS jgenesis/sonic/
 *   .mount(document.querySelector('#stage'))
 *   .start();
 *
 * play.pause('menu'); play.resume('menu');
 * await play.states.save(0, { thumbnail: await play.snapshot() });
 * play.states.load(0);
 * ```
 *
 * The same surface as blastem-wasm, fbneo-wasm and snes9x-wasm, so the engine app is one
 * app. Upstream's web frontend (Rust, winit, WebGPU) is patched at build time
 * (`scripts/patch-jgenesis-web.mjs`): ROM bytes from the host, save states and a pause
 * on the emulator channel. Gamepads: upstream's web build reads only the keyboard, so the
 * SDK reads `navigator.getGamepads()` and presses jgenesis' default keys for the system —
 * physical pads and engine-specs' touch pad both play.
 */
import {
  EnginePlayBase,
  EngineSDKBase,
  EventEmitter,
  type EngineInit,
  type EngineSDKConstructor,
  type EventsOf,
} from '@wasm-gaming/engine-specs';
import {
  bindConfig,
  createSettingsStore,
  type JgenesisConfig,
  type JgenesisOptionValue,
} from './jgenesis.config.js';
import { createMenu, type JgenesisMenu } from './jgenesis.menu.js';
import {
  DEFAULT_JGENESIS_OPTIONS,
  JGENESIS_ENGINE_DEFAULTS,
  JGENESIS_ENGINE_OPTIONS,
  JGENESIS_SPEC,
  resolveSystem,
  type JgenesisAsset,
  type JgenesisEngineConfig,
  type JgenesisOptions,
  type JgenesisPayloads,
  type JgenesisSystem,
} from './jgenesis.options.js';

export type {
  JgenesisAsset,
  JgenesisAssets,
  JgenesisEngineConfig,
  JgenesisEvents,
  JgenesisOptions,
  JgenesisPayloads,
  JgenesisStorage,
  JgenesisSystem,
} from './jgenesis.options.js';
export type { JgenesisConfig } from './jgenesis.config.js';
export { JGENESIS_OPTION_SYSTEM, JGENESIS_SPEC } from './jgenesis.options.js';

const ENGINE_ID = 'jgenesis';
const DEFAULT_STORAGE_NAMESPACE = 'default';

type EmulatorChannel = {
  clone(): EmulatorChannel;
  request_open_rom_bytes?: (rom: Uint8Array, rom_file_name: string) => void;
  request_reset(): void;
  // Added by scripts/patch-jgenesis-web.mjs — optional so an older build still loads.
  request_save_state?: () => void;
  take_saved_state?: () => Uint8Array | undefined;
  request_load_state?: (bytes: Uint8Array) => void;
  take_load_result?: () => boolean | undefined;
  set_paused?: (paused: boolean) => void;
};

type JgenesisModule = {
  default: (init?: { module_or_path?: unknown; memory?: WebAssembly.Memory }) => Promise<unknown>;
  EmulatorChannel: new () => EmulatorChannel;
  WebConfigRef: new () => { clone(): unknown };
  run_emulator(config_ref: unknown, emulator_channel: unknown): Promise<void>;
};

const MOUNT_TARGET_ID = 'jgenesis-wasm';

// wasm-bindgen glue is generated per-binary (its closure export names embed
// crate hashes that differ between the two builds), so the JS glue and the
// wasm file must always be picked as a matching pair.
function defaultRuntimeFiles(): { js: string; wasm: string } {
  if (typeof window !== 'undefined' && window.crossOriginIsolated) {
    return { js: 'jgenesis.js', wasm: 'jgenesis.threaded.wasm' };
  }

  return { js: 'jgenesis.single.js', wasm: 'jgenesis.single.wasm' };
}

// Upstream's ui.js snippet manipulates these elements by id without null
// checks (showUi, hideAllConfigsExcept, renderInputs, setRomTitle, …), and the
// wasm runtime calls them during startup. Stub any that the host page doesn't
// define so those calls are harmless no-ops.
const UPSTREAM_UI_STUB_IDS = [
  'loading-text',
  'header-text',
  'jgenesis',
  'footer',
  'smsgg-config',
  'genesis-config',
  'snes-config',
  'gba-config',
  'supported-files-info',
  'input-config',
  'controls',
  'jgenesis-rom-title',
];

function ensureUpstreamUiStubs(): void {
  if (typeof document === 'undefined') return;

  const missing = UPSTREAM_UI_STUB_IDS.filter((id) => !document.getElementById(id));
  if (missing.length === 0) return;

  const container = document.createElement('div');
  container.style.display = 'none';
  container.setAttribute('aria-hidden', 'true');
  for (const id of missing) {
    const stub = document.createElement('div');
    stub.id = id;
    container.appendChild(stub);
  }
  document.body?.appendChild(container);
}

// The wasm runtime loads its AudioWorklet processor from a page-relative URL
// ("./js/audio-processor.js?r=…" threaded, "./js/audio-processor-single.js?r=…"
// single-thread), which only resolves if the host page happens to sit next to
// that file. Redirect those requests to the copies shipped inside this package
// (next to the glue), preserving the requested filename so each runtime
// variant gets its own processor.
let workletJsBaseUrl = '';
let workletRedirectInstalled = false;

function installAudioWorkletRedirect(jsUrl: string): void {
  if (typeof AudioWorklet === 'undefined') return;

  workletJsBaseUrl = jsUrl;
  if (workletRedirectInstalled) return;
  workletRedirectInstalled = true;

  const originalAddModule = AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule = function (moduleURL: string | URL, options?: WorkletOptions) {
    const url = String(moduleURL);
    const match = url.match(/([\w-]*audio-processor[\w-]*\.js)(\?[^#]*)?$/);
    if (workletJsBaseUrl && match) {
      const target = new URL(`./js/${match[1]}`, workletJsBaseUrl).href;
      return originalAddModule.call(this, target + (match[2] ?? ''), options);
    }
    return originalAddModule.call(this, moduleURL, options);
  };
}


/**
 * Standard-gamepad button → jgenesis' default key (`KeyboardEvent.code`) for each system:
 * the same console buttons engine-specs' `TOUCH_LAYOUTS` put on those indices.
 */
export const JGENESIS_PAD_KEYS: Readonly<Record<JgenesisSystem, Readonly<Record<number, string>>>> = Object.freeze({
  // Mega Drive 6 buttons as BlastEm binds them: A 0, B 1, C 5, X 2, Y 3, Z 4, Mode 8, Start 9.
  genesis: { 0: 'KeyA', 1: 'KeyS', 5: 'KeyD', 2: 'KeyQ', 3: 'KeyW', 4: 'KeyE', 8: 'ShiftRight', 9: 'Enter' },
  // Master System / Game Gear: button 1 on A (0), button 2 on B (1), Start / Pause.
  smsgg: { 0: 'KeyS', 1: 'KeyA', 9: 'Enter' },
  // SNES by position: B 0, A 1, Y 2, X 3, L 4, R 5.
  snes: { 0: 'KeyX', 1: 'KeyS', 2: 'KeyZ', 3: 'KeyA', 4: 'KeyD', 5: 'KeyC', 8: 'ShiftRight', 9: 'Enter' },
  // GBA: A 0, B 1, L 4, R 5.
  gba: { 0: 'KeyA', 1: 'KeyS', 4: 'KeyQ', 5: 'KeyW', 8: 'ShiftRight', 9: 'Enter' },
});
const PAD_DIRECTIONS: Readonly<Record<number, string>> = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };

/** A console control a player can rebind: its name, and the key and pad button it has by default. */
export interface JgenesisControlSpec {
  id: string;
  label: string;
  /** The key jgenesis itself reads for it (`KeyboardEvent.code`). */
  code: string;
  /** Its gamepad button by default (standard mapping). */
  button: number;
}

const DIRECTION_CONTROLS: JgenesisControlSpec[] = [
  { id: 'up', label: 'Up', code: 'ArrowUp', button: 12 },
  { id: 'down', label: 'Down', code: 'ArrowDown', button: 13 },
  { id: 'left', label: 'Left', code: 'ArrowLeft', button: 14 },
  { id: 'right', label: 'Right', code: 'ArrowRight', button: 15 },
];
const controlsFrom = (labels: Record<number, [string, string]>, system: JgenesisSystem): JgenesisControlSpec[] => [
  ...Object.entries(labels).map(([button, [id, label]]) => ({
    id,
    label,
    code: JGENESIS_PAD_KEYS[system][Number(button)]!,
    button: Number(button),
  })),
  ...DIRECTION_CONTROLS,
];

/** Each system's controls, for remapping (`play.setControls()`). */
export const JGENESIS_CONTROLS: Readonly<Record<JgenesisSystem, readonly JgenesisControlSpec[]>> = Object.freeze({
  genesis: controlsFrom({ 0: ['a', 'A'], 1: ['b', 'B'], 5: ['c', 'C'], 2: ['x', 'X'], 3: ['y', 'Y'], 4: ['z', 'Z'], 8: ['mode', 'Mode'], 9: ['start', 'Start'] }, 'genesis'),
  smsgg: controlsFrom({ 0: ['one', '1'], 1: ['two', '2'], 9: ['start', 'Start / Pause'] }, 'smsgg'),
  snes: controlsFrom({ 0: ['b', 'B'], 1: ['a', 'A'], 2: ['y', 'Y'], 3: ['x', 'X'], 4: ['l', 'L'], 5: ['r', 'R'], 8: ['select', 'Select'], 9: ['start', 'Start'] }, 'snes'),
  gba: controlsFrom({ 0: ['a', 'A'], 1: ['b', 'B'], 4: ['l', 'L'], 5: ['r', 'R'], 8: ['select', 'Select'], 9: ['start', 'Start'] }, 'gba'),
});

/** The player's bindings for the running system, by control id: physical keys and pad buttons. */
export interface JgenesisControls {
  keys?: Record<string, string>;
  buttons?: Record<string, number>;
}

/**
 * What a set of bindings means for one system: the pad table (button → jgenesis' key) and,
 * for the keyboard, which physical key stands for which of jgenesis' keys, and which of its
 * default keys no control has any more (swallowed, so they do nothing).
 */
export function controlTables(system: JgenesisSystem, controls: JgenesisControls = {}) {
  const pad: Record<number, string> = {};
  const keys = new Map<string, string>();
  const bound = new Set<string>();
  for (const control of JGENESIS_CONTROLS[system]) {
    const button = controls.buttons?.[control.id] ?? control.button;
    pad[button] = control.code;
    const physical = controls.keys?.[control.id] ?? control.code;
    bound.add(physical);
    if (physical !== control.code) keys.set(physical, control.code);
  }
  const blocked = new Set(
    JGENESIS_CONTROLS[system].map((control) => control.code).filter((code) => !bound.has(code)),
  );
  return { pad, keys, blocked };
}

/** The keys a pad holds, for a system: buttons, d-pad and left stick. */
export function padKeys(
  system: JgenesisSystem,
  pad: { buttons: ReadonlyArray<{ pressed: boolean }>; axes: ReadonlyArray<number> } | null | undefined,
  table: Readonly<Record<number, string>> = { ...JGENESIS_PAD_KEYS[system], ...PAD_DIRECTIONS },
): Set<string> {
  const keys = new Set<string>();
  if (!pad) return keys;
  const map = table;
  pad.buttons.forEach((button, index) => {
    const code = map[index];
    if (button?.pressed && code) keys.add(code);
  });
  const [x = 0, y = 0] = pad.axes;
  if (x < -0.5) keys.add('ArrowLeft');
  if (x > 0.5) keys.add('ArrowRight');
  if (y < -0.5) keys.add('ArrowUp');
  if (y > 0.5) keys.add('ArrowDown');
  return keys;
}

const CONSOLE_ROM_NAME: Record<string, string> = {
  megadrive: 'game.md',
  snes: 'game.sfc',
  sms: 'game.sms',
  gg: 'game.gg',
  gba: 'game.gba',
};

const KEY_NAMES: Record<string, string> = {
  Enter: 'Enter',
  ShiftRight: 'Shift',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
};
const keyName = (code: string): string => KEY_NAMES[code] ?? code.replace(/^Key/, '').toLowerCase();

export function storagePath(
  engineId: string,
  namespace: unknown,
): { namespace: string; path: string; prefixed: boolean } {
  const segments =
    typeof namespace === 'string'
      ? namespace
          .split('/')
          .map((segment) => segment.trim())
          .filter((segment) => segment && segment !== '.' && segment !== '..')
          .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_'))
      : [];
  const prefixed = segments.length > 1 && segments[0] === engineId;
  if (prefixed) segments.shift();
  const cleaned = segments.join('/') || DEFAULT_STORAGE_NAMESPACE;
  return { namespace: cleaned, path: `${engineId}/${cleaned}`, prefixed };
}

async function opfsDir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    let dir = await navigator.storage.getDirectory();
    for (const segment of path.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  } catch {
    return null;
  }
}

async function resolveAsset(asset: JgenesisAsset | undefined): Promise<Uint8Array | null> {
  const value = typeof asset === 'function' ? await asset() : asset;
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('jgenesis: an asset must be a Uint8Array, an ArrayBuffer or a thunk returning one');
}


/** The player's save-state slots: 0-3. */
export const STATE_SLOTS = 4;
/** The *unsaved* suspend point: written when the player leaves, offered when they come back. */
export const AUTO_STATE_SLOT = 9;

export interface JgenesisStateSlot {
  slot: number;
  savedAt: Date | null;
  thumbnail: Blob | null;
  locked: boolean;
}

/** Save states: jgenesis' own snapshots (bincode, as its native driver writes them), in OPFS. */
export interface JgenesisStates {
  list(): JgenesisStateSlot[];
  get(slot: number): JgenesisStateSlot;
  /** Save the running game (paused or not) into `slot`. Refuses a locked slot. */
  save(slot: number, options?: { thumbnail?: Blob | null }): Promise<void>;
  /** Load `slot`; false when it is empty. Applies on the emulator loop's next turn. */
  load(slot: number): boolean;
  copy(from: number, to: number): Promise<void>;
  lock(slot: number, locked: boolean): Promise<void>;
  remove(slot: number): Promise<void>;
}

interface StoredFile {
  bytes: Uint8Array;
  at: number;
}

export class JgenesisPlay extends EnginePlayBase<JgenesisPayloads> {
  #channel: EmulatorChannel | null = null;
  #config: JgenesisConfig | null = null;
  #menu: JgenesisMenu | null = null;
  #system: JgenesisSystem = 'genesis';
  #destroyed = false;
  #pauseOwner: string | null = null;

  #box: HTMLElement | null = null;
  #mountTarget: HTMLElement | null = null;

  #namespace = DEFAULT_STORAGE_NAMESPACE;
  #storagePath = `${ENGINE_ID}/${DEFAULT_STORAGE_NAMESPACE}`;
  #persist = true;
  #files = new Map<string, StoredFile>();

  #padFrame = 0;
  #lastFrame: HTMLCanvasElement | null = null;
  #held = new Set<string>();
  #controls: JgenesisControls = {};
  #tables: ReturnType<typeof controlTables> | null = null;

  constructor(init?: EngineInit<JgenesisPayloads>, events?: EventEmitter<EventsOf<JgenesisPayloads>>) {
    super(JGENESIS_SPEC, init, events);
  }

  get namespace(): string {
    return this.#namespace;
  }

  get storagePath(): string {
    return this.#storagePath;
  }

  get pausedBy(): string | null {
    return this.#pauseOwner;
  }

  /** The system jgenesis emulates for this ROM (from its file name). */
  get system(): JgenesisSystem {
    return this.#system;
  }

  /**
   * Rebind the running system's controls (ids from {@link JGENESIS_CONTROLS}): physical keys
   * (`KeyboardEvent.code`) and gamepad buttons (standard mapping). What is left out keeps its
   * default. Live.
   */
  setControls(controls: JgenesisControls): void {
    this.#controls = controls;
    this.#tables = controlTables(this.#system, controls);
  }

  /** The live settings; writes apply to the running game. */
  get settings(): JgenesisConfig {
    if (!this.#config) throw new Error('jgenesis: the engine is not running — start() it first');
    return this.#config;
  }

  get menu(): JgenesisMenu | null {
    return this.#menu;
  }

  #canvas(): HTMLCanvasElement | null {
    return (this.#mountTarget?.querySelector('canvas') as HTMLCanvasElement | null) ?? null;
  }

  /**
   * The frame on screen, as a PNG.
   *
   * A WebGPU canvas drops its picture once it is presented, so a read outside the frame
   * comes back black: the copy is taken in the task that renders the next frame, right
   * after its `queue.submit()`. While paused no frame comes; the last copy stands in.
   */
  async snapshot(): Promise<Blob | null> {
    const canvas = this.#canvas();
    if (!canvas) return null;
    const copy = (this.#pauseOwner ? null : await captureNextFrame(canvas, 500)) ?? this.#lastFrame;
    if (!copy) return null;
    this.#lastFrame = copy;
    return new Promise((resolve) => copy.toBlob((blob) => resolve(blob), 'image/png'));
  }

  get states(): JgenesisStates {
    const channel = this.#requireChannel();
    const name = {
      state: (slot: number) => `slot_${slot}.state`,
      png: (slot: number) => `slot_${slot}.png`,
      lock: (slot: number) => `slot_${slot}.lock`,
    };
    const checkSlot = (slot: number): number => {
      if (slot === AUTO_STATE_SLOT || (Number.isInteger(slot) && slot >= 0 && slot < STATE_SLOTS)) return slot;
      throw new RangeError(`jgenesis: a state slot is 0-${STATE_SLOTS - 1} or ${AUTO_STATE_SLOT}, not ${slot}`);
    };
    const isLocked = (slot: number): boolean => this.#files.has(name.lock(slot));
    const refuseLocked = (slot: number): void => {
      if (isLocked(slot)) throw new Error(`jgenesis: state slot ${slot} is locked`);
    };
    const get = (slot: number): JgenesisStateSlot => {
      checkSlot(slot);
      const state = this.#files.get(name.state(slot));
      const png = state ? this.#files.get(name.png(slot)) : undefined;
      return {
        slot,
        savedAt: state ? new Date(state.at) : null,
        thumbnail: png ? new Blob([png.bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }) : null,
        locked: isLocked(slot),
      };
    };
    return {
      list: () => Array.from({ length: STATE_SLOTS }, (_, slot) => get(slot)),
      get,
      save: async (slot, options = {}) => {
        checkSlot(slot);
        refuseLocked(slot);
        if (!channel.request_save_state || !channel.take_saved_state) {
          throw new Error('jgenesis: this build has no save states — rebuild the wasm with the patch');
        }
        channel.request_save_state();
        // The emulator loop serves it on its next turn (every frame, or every 16 ms paused).
        let bytes: Uint8Array | undefined;
        const deadline = performance.now() + 3000;
        while (!(bytes = channel.take_saved_state()) && performance.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        if (!bytes || !bytes.length) throw new Error('jgenesis: the state was not written');
        const thumbnail = options.thumbnail ? new Uint8Array(await options.thumbnail.arrayBuffer()) : null;
        await this.#write(name.state(slot), bytes);
        if (thumbnail) await this.#write(name.png(slot), thumbnail);
        else await this.#forget([name.png(slot)]);
        this.emit('saves', { files: [name.state(slot), name.png(slot)] });
      },
      load: (slot) => {
        checkSlot(slot);
        const state = this.#files.get(name.state(slot));
        if (!state || !channel.request_load_state) return false;
        channel.request_load_state(state.bytes);
        return true;
      },
      copy: async (from, to) => {
        checkSlot(from);
        checkSlot(to);
        refuseLocked(to);
        const state = this.#files.get(name.state(from));
        if (!state) throw new Error(`jgenesis: state slot ${from} is empty`);
        const png = this.#files.get(name.png(from));
        await this.#write(name.state(to), state.bytes);
        if (png) await this.#write(name.png(to), png.bytes);
        else await this.#forget([name.png(to)]);
        this.emit('saves', { files: [name.state(to), name.png(to)] });
      },
      lock: async (slot, locked) => {
        checkSlot(slot);
        if (locked) {
          if (!this.#files.has(name.state(slot))) throw new Error(`jgenesis: state slot ${slot} is empty`);
          await this.#write(name.lock(slot), new Uint8Array([1]));
        } else await this.#forget([name.lock(slot)]);
        this.emit('saves', { files: [name.lock(slot)] });
      },
      remove: async (slot) => {
        checkSlot(slot);
        refuseLocked(slot);
        const names = [name.state(slot), name.png(slot)];
        await this.#forget(names);
        this.emit('saves', { files: names });
      },
    };
  }

  /** Freeze emulation and sound; the first caller owns the pause. */
  pause(owner = 'host'): void {
    const channel = this.#channel;
    if (!channel || this.#pauseOwner) return;
    this.#pauseOwner = owner;
    channel.set_paused?.(true);
    this.#releaseKeys();
    this.emit('pause', { owner });
  }

  resume(owner = 'host'): void {
    const channel = this.#channel;
    if (!channel || this.#pauseOwner !== owner) return;
    this.#pauseOwner = null;
    channel.set_paused?.(false);
    this.emit('resume', { owner });
  }

  // ---- Contract hooks ----

  protected override mounted(target: HTMLElement): void {
    this.#box = target;
  }

  protected override async open(_options: JgenesisOptions): Promise<void> {
    if (this.#destroyed) throw new Error('jgenesis: this engine has been destroyed — build a new JgenesisSDK');
    if (this.#channel) {
      if (this.#pauseOwner) this.resume(this.#pauseOwner);
      this.#channel.request_reset();
      return;
    }
    await this.#boot();
  }

  protected override patched(kind: string, patch: object): void {
    if (kind !== 'options' || !this.#config) return;
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === 'boolean' || typeof value === 'string') this.#config.write(key, value);
    }
  }

  protected override close(): void {
    window.removeEventListener('keydown', this.#onKey, true);
    window.removeEventListener('keyup', this.#onKey, true);
    cancelAnimationFrame(this.#padFrame);
    this.#padFrame = 0;
    this.#releaseKeys();
    // The wasm runtime has no shutdown hook: the loop is paused for good, and the DOM and
    // listeners the SDK installed go.
    this.#channel?.set_paused?.(true);
    this.#menu?.destroy();
    this.#mountTarget?.remove();
    this.#mountTarget = null;
    this.#channel = null;
    this.#pauseOwner = null;
    this.#destroyed = true;
  }

  // ---- Boot ----

  async #boot(): Promise<void> {
    const config = await this.#values<JgenesisEngineConfig>('config');
    const requested = await this.#values<JgenesisOptions>('options');
    const assets = await this.#values<{ rom?: JgenesisAsset }>('assets');
    const storage = await this.#values<{ namespace?: string; persist?: 'opfs' | null }>('storage');

    const box = this.#box;
    if (!box) throw new Error('jgenesis: mount() an element before start()');
    const rom = await resolveAsset(assets.rom);
    if (!rom) throw new Error('jgenesis: no ROM — hand one over as assets.rom (bytes or a thunk)');

    const resolved = storagePath(ENGINE_ID, storage.namespace);
    this.#namespace = resolved.namespace;
    this.#storagePath = resolved.path;
    this.#persist = storage.persist !== null;
    if (this.#persist) await this.#readFiles();

    const opts = { ...DEFAULT_JGENESIS_OPTIONS, ...requested };
    // A console hint without a name: a name with that console's extension, since the
    // extension is what jgenesis dispatches on ('game.bin' would always be a Genesis).
    const romFileName =
      requested.romFileName ??
      requested.fileName ??
      (requested.console ? CONSOLE_ROM_NAME[requested.console] : undefined) ??
      opts.romFileName;
    this.#system = resolveSystem(romFileName, opts.console) ?? 'genesis';

    const runtimeFiles = defaultRuntimeFiles();
    const jsUrl = config.jsUrl ?? new URL(`./${runtimeFiles.js}`, import.meta.url).href;
    const wasmUrl = config.wasmUrl ?? new URL(`./${runtimeFiles.wasm}`, import.meta.url).href;
    installAudioWorkletRedirect(jsUrl);
    ensureUpstreamUiStubs();
    this.#mountTarget = mountTarget(box);

    const mod = (await import(/* @vite-ignore */ jsUrl)) as JgenesisModule;
    await mod.default({ module_or_path: wasmUrl });
    const channel = new mod.EmulatorChannel();
    const configRef = new mod.WebConfigRef();
    this.#channel = channel;

    const settingsStore = createSettingsStore(this.#namespace);
    const engineConfig = bindConfig(configRef);
    this.#config = engineConfig;
    const initial: Record<string, JgenesisOptionValue> = { ...JGENESIS_ENGINE_DEFAULTS, ...settingsStore.load() };
    for (const option of JGENESIS_ENGINE_OPTIONS) {
      const value = requested[option.key];
      if (typeof value === 'boolean' || typeof value === 'string') initial[option.key] = value;
    }
    if (requested.genesisRegion) initial.genesisRegion = requested.genesisRegion;
    if (requested.smsRegion) initial.smsRegion = requested.smsRegion;
    for (const [key, value] of Object.entries(initial)) engineConfig.write(key, value);

    this.#menu = opts.escMenu
      ? createMenu({
          mount: box,
          config: engineConfig,
          system: this.#system,
          onReset: () => channel.request_reset(),
          onChange: (values) => settingsStore.save(values),
          onRestoreDefaults: () => settingsStore.clear(),
        })
      : null;

    // run_emulator consumes its arguments (wasm-bindgen moves them into Rust): clones.
    mod.run_emulator(configRef.clone(), channel.clone()).catch((err: unknown) => {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    });
    if (typeof channel.request_open_rom_bytes !== 'function') {
      throw new Error('jgenesis: this build cannot open ROM bytes — rebuild the wasm with the patch');
    }
    channel.request_open_rom_bytes(rom, romFileName);
    this.#pollPads();
    this.#tables = controlTables(this.#system, this.#controls);
    window.addEventListener('keydown', this.#onKey, true);
    window.addEventListener('keyup', this.#onKey, true);
  }

  async #values<T>(kind: 'config' | 'options' | 'assets' | 'storage'): Promise<T> {
    const described = (await this[kind]()) as Record<string, { value: unknown }>;
    const out: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(described)) {
      if (property.value !== undefined) out[key] = property.value;
    }
    return out as T;
  }

  #requireChannel(): EmulatorChannel {
    if (!this.#channel) throw new Error('jgenesis: the engine is not running — start() it first');
    return this.#channel;
  }

  // ---- Gamepads → jgenesis' keys ----

  #pollPads = (): void => {
    this.#padFrame = requestAnimationFrame(this.#pollPads);
    if (this.#pauseOwner) return;
    const pad = Array.from(globalThis.navigator?.getGamepads?.() ?? []).find((entry) => entry?.connected) ?? null;
    const now = padKeys(this.#system, pad, this.#tables?.pad);
    for (const code of this.#held) if (!now.has(code)) this.#key('keyup', code);
    for (const code of now) if (!this.#held.has(code)) this.#key('keydown', code);
    this.#held = now;
  };

  /**
   * The keyboard, remapped: a physical key bound to a control reaches jgenesis as that
   * control's own key, and a default key no control has any more is swallowed. Only real
   * presses (`isTrusted`): the ones this SDK sends pass through.
   */
  #onKey = (event: KeyboardEvent): void => {
    const tables = this.#tables;
    if (!tables || !event.isTrusted || this.#pauseOwner) return;
    const target = tables.keys.get(event.code);
    if (target === undefined && !tables.blocked.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target !== undefined && !event.repeat) this.#key(event.type as 'keydown' | 'keyup', target);
  };

  #key(type: 'keydown' | 'keyup', code: string): void {
    const canvas = this.#canvas();
    if (!canvas) return;
    canvas.dispatchEvent(new KeyboardEvent(type, { code, key: keyName(code), bubbles: true, cancelable: true }));
  }

  #releaseKeys(): void {
    for (const code of this.#held) this.#key('keyup', code);
    this.#held = new Set();
  }

  // ---- Files ----

  async #readFiles(): Promise<void> {
    const dir = await opfsDir(this.#storagePath, false);
    if (!dir) return;
    const iterable = dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> };
    for await (const [fileName, handle] of iterable.entries()) {
      if (handle.kind !== 'file' || !fileName.startsWith('slot_')) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      this.#files.set(fileName, { bytes: new Uint8Array(await file.arrayBuffer()), at: file.lastModified });
    }
  }

  async #write(fileName: string, bytes: Uint8Array): Promise<void> {
    this.#files.set(fileName, { bytes, at: Date.now() });
    if (!this.#persist) return;
    const dir = await opfsDir(this.#storagePath, true);
    if (!dir) return;
    const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
  }

  async #forget(fileNames: string[]): Promise<void> {
    for (const fileName of fileNames) this.#files.delete(fileName);
    if (!this.#persist) return;
    const dir = await opfsDir(this.#storagePath, false);
    for (const fileName of fileNames) await dir?.removeEntry(fileName).catch(() => {});
  }
}

type FrameWaiter = () => void;
const frameWaiters = new Set<FrameWaiter>();
let submitHooked = false;

/**
 * Wrap `GPUQueue.prototype.submit` once, so a waiter runs in the task that rendered a
 * frame — while the canvas still holds it. Costs nothing when nobody waits.
 */
function hookSubmit(): boolean {
  if (submitHooked) return true;
  const queue = (globalThis as { GPUQueue?: { prototype: { submit: (...args: unknown[]) => unknown } } }).GPUQueue;
  if (!queue) return false;
  const submit = queue.prototype.submit;
  queue.prototype.submit = function (this: unknown, ...args: unknown[]) {
    const result = submit.apply(this, args);
    if (frameWaiters.size) {
      queueMicrotask(() => {
        for (const waiter of [...frameWaiters]) waiter();
      });
    }
    return result;
  };
  submitHooked = true;
  return true;
}

/** A 2D copy of the canvas, taken right after the next frame is submitted; null on timeout. */
function captureNextFrame(canvas: HTMLCanvasElement, timeoutMs: number): Promise<HTMLCanvasElement | null> {
  if (!hookSubmit()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (copy: HTMLCanvasElement | null): void => {
      frameWaiters.delete(waiter);
      clearTimeout(timer);
      resolve(copy);
    };
    const waiter: FrameWaiter = () => {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d')?.drawImage(canvas, 0, 0);
      done(copy);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    frameWaiters.add(waiter);
  });
}

/** Upstream mounts its own canvas into `#jgenesis-wasm` (one per page); the SDK puts that element in the mount. */
function mountTarget(box: HTMLElement): HTMLElement {
  document.getElementById(MOUNT_TARGET_ID)?.remove();
  const target = document.createElement('div');
  target.id = MOUNT_TARGET_ID;
  target.style.cssText = 'width:100%;height:100%;display:grid;place-items:center;overflow:hidden;min-width:0;min-height:0';
  // winit sizes its canvas in device pixels and leaves its CSS size alone: fit it to the mount.
  const fit = document.createElement('style');
  fit.textContent = `#${MOUNT_TARGET_ID} > canvas { max-width:100%; max-height:100%; width:auto !important; height:auto !important; object-fit:contain; image-rendering:pixelated; }`;
  target.appendChild(fit);
  box.appendChild(target);
  return target;
}

export class JgenesisSDK extends EngineSDKBase<JgenesisPayloads> {
  static readonly id = ENGINE_ID;
  static readonly version = '0.1.1';
  static readonly name = 'jgenesis';
  static readonly description =
    'jgenesis, the multi-system emulator by James Groth (Mega Drive / Genesis, Sega CD, 32X, Master System, Game Gear, SNES, GBA), compiled to WebAssembly. Needs WebGPU. Ships no games.';

  protected override createPlay(
    init: EngineInit<JgenesisPayloads>,
    events: EventEmitter<EventsOf<JgenesisPayloads>>,
  ): JgenesisPlay {
    return new JgenesisPlay(init, events);
  }
}

export const JGENESIS_ENGINE: EngineSDKConstructor<JgenesisPayloads> = JgenesisSDK;

export default JgenesisSDK;
