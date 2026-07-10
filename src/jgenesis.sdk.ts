import type { AssetData, EngineConfig, EngineEvent, EngineInstance, InputPreset, KeyMap } from '@wasm-gaming/engine-specs';
import { manifest } from './jgenesis.manifest.js';
import { DEFAULT_JGENESIS_OPTIONS, type JgenesisOptions } from './jgenesis.options.js';

export { manifest };

type JgenesisModule = {
  default: (module_or_path?: unknown, memory?: WebAssembly.Memory) => Promise<unknown>;
  EmulatorChannel: new () => {
    request_open_rom_bytes(rom: Uint8Array, rom_file_name: string): void;
    request_reset(): void;
  };
  WebConfigRef: new () => unknown;
  run_emulator(config_ref: unknown, emulator_channel: unknown): Promise<void>;
  init_logger?: () => void;
};

export type JgenesisInstance = EngineInstance & {
  storageNamespace: string;
};

export type JgenesisLoadConfig = EngineConfig & {
  romProvider?: () => Promise<AssetData> | AssetData;
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

export async function load(config: JgenesisLoadConfig): Promise<JgenesisInstance> {
  const { canvas, assets, onEvent } = config;
  if (!canvas) throw new Error('jgenesis: config.canvas is required');

  const emit = (e: EngineEvent): void => {
    try {
      onEvent?.(e);
    } catch {
      // host callback should not break engine runtime
    }
  };

  const jsUrl = config.jsUrl ?? new URL('./jgenesis_web.js', import.meta.url).href;
  const wasmUrl = config.wasmUrl ?? new URL('./jgenesis_web_bg.wasm', import.meta.url).href;
  const opts = { ...DEFAULT_JGENESIS_OPTIONS, ...(config.options as JgenesisOptions | undefined) };

  if (canvas.id !== 'canvas') canvas.id = 'canvas';

  let romBytes = toUint8(assets?.rom ?? assets?.data);
  if (!romBytes && config.romProvider) {
    romBytes = toUint8(await config.romProvider());
  }
  if (!romBytes) {
    throw new Error('jgenesis: no ROM bytes provided — pass assets.rom or romProvider');
  }

  const mod = (await import(/* @vite-ignore */ jsUrl)) as JgenesisModule;
  await mod.default(wasmUrl);

  try {
    mod.init_logger?.();
  } catch {
    // logger init may fail harmlessly in some browser contexts
  }

  const channel = new mod.EmulatorChannel();
  const configRef = new mod.WebConfigRef();

  mod.run_emulator(configRef, channel).catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    emit({ type: 'error', error });
  });

  channel.request_open_rom_bytes(romBytes, opts.romFileName);

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
      // wasm-bindgen currently has no top-level shutdown hook for this runtime.
    },
    storageNamespace: normalizeStorageNamespace(config.storageNamespace),
  };
}

export default { manifest, load };
