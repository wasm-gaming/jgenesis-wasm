import {
  JGENESIS_ENGINE_DEFAULTS,
  JGENESIS_ENGINE_OPTIONS,
  jgenesisOption,
} from './jgenesis.options.js';

export type JgenesisOptionValue = boolean | string;

/**
 * Typed façade over the wasm `WebConfigRef`. The emulator loop holds a clone of
 * the same shared reference and re-reads it every frame, so writes here take
 * effect on the running game without a restart.
 *
 * Every accessor is looked up by name and feature-detected: a runtime built
 * from an older or newer jgenesis revision simply reports the knobs it is
 * missing as unsupported instead of throwing.
 */
export interface JgenesisConfig {
  supports(key: string): boolean;
  read(key: string): JgenesisOptionValue | undefined;
  /** Returns `false` when the key is unknown, unsupported, or the value invalid. */
  write(key: string, value: JgenesisOptionValue): boolean;
  /** Current value of every supported option. */
  values(): Record<string, JgenesisOptionValue>;
  /** Restores `JGENESIS_ENGINE_DEFAULTS` — this package's defaults, not the wasm build's. */
  restoreDefaults(): void;
}

type ConfigRef = Record<string, unknown>;

export function bindConfig(ref: unknown): JgenesisConfig {
  const target = ref as ConfigRef;

  const accessor = (name: string): ((...args: unknown[]) => unknown) | null => {
    const fn = target?.[name];
    return typeof fn === 'function' ? (fn as (...args: unknown[]) => unknown).bind(target) : null;
  };

  const supports = (key: string): boolean => {
    const option = jgenesisOption(key);
    return Boolean(option && accessor(option.get) && accessor(option.set));
  };

  const read = (key: string): JgenesisOptionValue | undefined => {
    const option = jgenesisOption(key);
    const get = option && accessor(option.get);
    if (!option || !get) return undefined;

    const raw = get();
    if (raw == null) return undefined;
    // `genesis_m68k_divider` reads back as a number but is written as a string,
    // so enum values are normalized to strings on both sides.
    return option.type === 'boolean' ? Boolean(raw) : String(raw);
  };

  const write = (key: string, value: JgenesisOptionValue): boolean => {
    const option = jgenesisOption(key);
    const set = option && accessor(option.set);
    if (!option || !set) return false;

    if (option.type === 'boolean') {
      set(Boolean(value));
      return true;
    }

    const next = String(value);
    if (!option.values.some((choice) => choice.value === next)) return false;
    set(next);
    return true;
  };

  return {
    supports,
    read,
    write,
    values() {
      const snapshot: Record<string, JgenesisOptionValue> = {};
      for (const option of JGENESIS_ENGINE_OPTIONS) {
        const value = read(option.key);
        if (value !== undefined) snapshot[option.key] = value;
      }
      return snapshot;
    },
    restoreDefaults() {
      // Not the ref's own `restore_defaults()`: that would restore jgenesis'
      // built-ins, which differ from this package's declared defaults, so the
      // menu and a fresh load would disagree about what "default" means. The
      // catalog covers every setter the ref exposes, so nothing is left behind.
      for (const option of JGENESIS_ENGINE_OPTIONS) {
        write(option.key, JGENESIS_ENGINE_DEFAULTS[option.key]);
      }
    },
  };
}

/** Per-namespace persistence for menu tweaks, so they survive a page reload. */
export interface JgenesisSettingsStore {
  load(): Record<string, JgenesisOptionValue>;
  save(values: Record<string, JgenesisOptionValue>): void;
  clear(): void;
}

export function createSettingsStore(namespace: string): JgenesisSettingsStore {
  const storageKey = `jgenesis:options:${namespace}`;

  // Storage access throws outright in some privacy modes, so every call is
  // guarded — losing persistence must never take the emulator down with it.
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };

  return {
    load() {
      try {
        const raw = storage()?.getItem(storageKey);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

        const values: Record<string, JgenesisOptionValue> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (jgenesisOption(key) && (typeof value === 'boolean' || typeof value === 'string')) {
            values[key] = value;
          }
        }
        return values;
      } catch {
        return {};
      }
    },
    save(values) {
      try {
        storage()?.setItem(storageKey, JSON.stringify(values));
      } catch {
        // persistence is best-effort
      }
    },
    clear() {
      try {
        storage()?.removeItem(storageKey);
      } catch {
        // persistence is best-effort
      }
    },
  };
}
