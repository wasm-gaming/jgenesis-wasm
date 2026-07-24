import type { AssetData, EngineConfig, EngineEvent, EngineInstance, InputPreset, KeyMap } from '@wasm-gaming/engine-specs';
import { manifest } from './jgenesis.manifest.js';
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
  resolveSystem,
  type JgenesisOptions,
} from './jgenesis.options.js';

export { manifest };

type JgenesisModule = {
  default: (init?: { module_or_path?: unknown; memory?: WebAssembly.Memory }) => Promise<unknown>;
  EmulatorChannel: new () => {
    clone(): unknown;
    request_open_rom_bytes?: (rom: Uint8Array, rom_file_name: string) => void;
    request_open_file?: () => void;
    request_reset(): void;
  };
  WebConfigRef: new () => { clone(): unknown };
  run_emulator(config_ref: unknown, emulator_channel: unknown): Promise<void>;
  init_logger?: () => void;
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

function ensureMountTarget(canvas: HTMLCanvasElement | null, attachTo: HTMLElement | null): void {
  if (typeof document === 'undefined') return;

  if (document.getElementById(MOUNT_TARGET_ID)) {
    return;
  }

  const mountTarget = document.createElement('div');
  mountTarget.id = MOUNT_TARGET_ID;
  mountTarget.style.width = '100%';
  mountTarget.style.height = '100%';

  if (!canvas) {
    attachTo?.appendChild(mountTarget);
    return;
  }

  const parent = canvas.parentElement ?? attachTo ?? document.body;
  if (parent) {
    parent.insertBefore(mountTarget, canvas.parentElement ? canvas : null);
  }

  // Upstream jgenesis-web mounts its own canvas into #jgenesis-wasm.
  if (canvas.parentElement) {
    canvas.remove();
  }
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

export type JgenesisInstance = EngineInstance & {
  storageNamespace: string;
  /** Live handle on the emulator settings; writes apply to the running game. */
  config: JgenesisConfig;
  /** The in-game settings overlay, or `null` when `options.escMenu` is false. */
  menu: JgenesisMenu | null;
};

export type JgenesisLoadConfig = EngineConfig & {
  romProvider?: () => Promise<AssetData> | AssetData;
  /** Deprecated alias for `canvasEl`, kept for hosts written against 0.1.x. */
  canvas?: HTMLCanvasElement;
};

function toUint8(x: unknown): Uint8Array | null {
  if (x == null) return null;
  if (typeof x === 'string') return new TextEncoder().encode(x);
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('asset must be Uint8Array | ArrayBuffer | string');
}

function normalizeStorageNamespace(namespace: unknown): string {
  if (typeof namespace !== 'string' || !namespace.trim()) return 'default';

  const cleaned = namespace
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_'))
    .filter(Boolean)
    .join('/');

  return cleaned || 'default';
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

export async function load(config: JgenesisLoadConfig): Promise<JgenesisInstance> {
  const { assets, onEvent, attachTo } = config;
  const canvas = config.canvasEl ?? config.canvas ?? null;
  if (!canvas && !attachTo) {
    throw new Error('jgenesis: config.canvasEl or config.attachTo is required');
  }

  const emit = (e: EngineEvent): void => {
    try {
      onEvent?.(e);
    } catch {
      // host callback should not break engine runtime
    }
  };

  const runtimeFiles = defaultRuntimeFiles();
  const jsUrl = config.jsUrl ?? new URL(`./${runtimeFiles.js}`, import.meta.url).href;
  const wasmUrl = config.wasmUrl ?? new URL(`./${runtimeFiles.wasm}`, import.meta.url).href;
  const requested = (config.options ?? {}) as JgenesisOptions;
  const opts = { ...DEFAULT_JGENESIS_OPTIONS, ...requested };

  // jgenesis selects which console to emulate from the ROM file's extension, so
  // the real picked name has to win over the "game.bin" default. Hosts built on
  // the shared demo template report it as `fileName`.
  const romFileName = requested.romFileName ?? requested.fileName ?? opts.romFileName;
  const system = resolveSystem(romFileName, opts.console);

  installAudioWorkletRedirect(jsUrl);
  ensureUpstreamUiStubs();
  ensureMountTarget(canvas, attachTo ?? null);

  let romBytes = toUint8(assets?.rom ?? assets?.data);
  if (!romBytes && config.romProvider) {
    romBytes = toUint8(await config.romProvider());
  }
  if (!romBytes) {
    throw new Error('jgenesis: no ROM bytes provided — pass assets.rom or romProvider');
  }

  const mod = (await import(/* @vite-ignore */ jsUrl)) as JgenesisModule;
  // wasm-bindgen deprecated positional init args; both glue variants accept
  // the single-object form.
  await mod.default({ module_or_path: wasmUrl });

  const channel = new mod.EmulatorChannel();
  const configRef = new mod.WebConfigRef();

  const storageNamespace = normalizeStorageNamespace(config.storageNamespace);
  const settingsStore = createSettingsStore(storageNamespace);
  const engineConfig = bindConfig(configRef);

  // This package's defaults, then the player's persisted tweaks, then anything
  // the host asked for explicitly — a caller-supplied option is a deliberate
  // choice and outranks the last session. Seeding the defaults is what makes
  // them real: the wasm build boots with its own (linear filtering, notably),
  // so a default that is never written is only a claim in the schema.
  const initial: Record<string, JgenesisOptionValue> = {
    ...JGENESIS_ENGINE_DEFAULTS,
    ...settingsStore.load(),
  };
  for (const option of JGENESIS_ENGINE_OPTIONS) {
    const value = requested[option.key];
    if (typeof value === 'boolean' || typeof value === 'string') initial[option.key] = value;
  }
  for (const [key, value] of Object.entries(initial)) {
    engineConfig.write(key, value);
  }

  const menu = opts.escMenu
    ? createMenu({
        mount: attachTo ?? canvas?.parentElement ?? document.body,
        config: engineConfig,
        system,
        onReset: () => channel.request_reset(),
        onChange: (values) => settingsStore.save(values),
        onRestoreDefaults: () => settingsStore.clear(),
      })
    : null;

  // run_emulator consumes its arguments (wasm-bindgen moves them into Rust),
  // so pass clones to keep `channel` usable for later requests.
  mod.run_emulator(configRef.clone(), channel.clone()).catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    emit({ type: 'error', error });
  });

  if (typeof channel.request_open_rom_bytes === 'function') {
    channel.request_open_rom_bytes(romBytes, romFileName);
  } else {
    throw new Error(
      'jgenesis: runtime does not support request_open_rom_bytes; rebuild WASM with local patching enabled',
    );
  }

  emit({ type: 'ready' });

  return {
    start() {
      // jgenesis starts once run_emulator() is called
    },
    pause() {
      // No pause API is currently exposed by jgenesis-web bindings.
    },
    resume() {
      // No pause API is currently exposed by jgenesis-web bindings.
    },
    reset() {
      channel.request_reset();
    },
    setInput(map: InputPreset | KeyMap) {
      if (typeof window !== 'undefined') {
        (window as any).__gamepadKeyMap = map;
      }
    },
    destroy() {
      // wasm-bindgen currently has no top-level shutdown hook for this runtime,
      // so this only reclaims the DOM and listeners the SDK itself installed.
      menu?.destroy();
    },
    storageNamespace,
    config: engineConfig,
    menu,
  };
}

export default { manifest, load };
