import type { EnginePayloads, EngineSpec, PropertySpec } from '@wasm-gaming/engine-specs';

/**
 * The jgenesis runtime keeps its settings in a `WebConfigRef` that the emulator
 * loop re-reads every frame, so every knob below can be changed while a game is
 * running. The catalog in this file is the single source of truth for them: the
 * manifest's options schema, the defaults, and the in-game ESC menu are all
 * derived from it, so adding a row here is enough to expose a new setting.
 */

/** jgenesis groups its settings per emulated system, not per ROM extension. */
export type JgenesisSystem = 'genesis' | 'smsgg' | 'snes' | 'gba';

interface OptionSpecBase {
  /** Option key, as used in `EngineConfig.options` and the manifest schema. */
  key: string;
  label: string;
  description: string;
  /** `WebConfigRef` accessor pair backing this option. */
  get: string;
  set: string;
  /** Takes effect on the next power-on rather than immediately. */
  requiresReset?: boolean;
}

export type JgenesisOptionSpec = OptionSpecBase &
  (
    | { type: 'boolean'; default: boolean }
    | { type: 'enum'; default: string; values: Array<{ value: string; label: string }> }
  );

export interface JgenesisOptionGroup {
  id: string;
  label: string;
  /** `null` for settings that apply to every system. */
  system: JgenesisSystem | null;
  options: JgenesisOptionSpec[];
}

export const JGENESIS_OPTION_GROUPS: JgenesisOptionGroup[] = [
  {
    id: 'video',
    label: 'Video',
    system: null,
    options: [
      {
        key: 'filterMode',
        label: 'Image filtering',
        description:
          'Texture sampling used when scaling the emulated picture to the canvas. Nearest keeps pixel art crisp; linear softens it.',
        type: 'enum',
        default: 'Nearest',
        values: [
          { value: 'Nearest', label: 'Nearest' },
          { value: 'Linear', label: 'Linear' },
        ],
        get: 'filter_mode',
        set: 'set_filter_mode',
      },
      {
        key: 'preprocessShader',
        label: 'Blending shader',
        description: 'Pre-scaling shader applied to the frame buffer.',
        type: 'enum',
        default: 'None',
        values: [
          { value: 'None', label: 'None' },
          { value: 'NtscComposite', label: 'NTSC composite' },
          { value: 'Xbrz4x', label: 'xBRZ 4x' },
          { value: 'HorizontalBlurThreePixels', label: 'Horizontal blur' },
        ],
        get: 'preprocess_shader',
        set: 'set_preprocess_shader',
      },
      {
        key: 'autoPrescale',
        label: 'Prescaling',
        description: 'Integer-prescale the frame before filtering to sharpen upscaled output.',
        type: 'boolean',
        default: true,
        get: 'auto_prescale',
        set: 'set_auto_prescale',
      },
    ],
  },
  {
    id: 'genesis',
    label: 'Genesis / Mega Drive',
    system: 'genesis',
    options: [
      {
        key: 'genesisRegion',
        label: 'Region',
        description:
          'Genesis hardware region. Auto detects from cartridge header; Americas and Japan use NTSC timing, Europe uses PAL timing.',
        type: 'enum',
        default: 'Auto',
        values: [
          { value: 'Auto', label: 'Auto' },
          { value: 'Americas', label: 'Americas (NTSC)' },
          { value: 'Japan', label: 'Japan (NTSC)' },
          { value: 'Europe', label: 'Europe (PAL)' },
        ],
        get: 'genesis_region',
        set: 'set_genesis_region',
      },
      {
        key: 'genesisAspectRatio',
        label: 'Aspect ratio',
        description: 'Display aspect ratio for Genesis / Sega CD / 32X output.',
        type: 'enum',
        default: 'Auto',
        values: [
          { value: 'Auto', label: 'Auto' },
          { value: 'Ntsc', label: 'NTSC' },
          { value: 'Pal', label: 'PAL' },
          { value: 'SquarePixels', label: 'Square' },
        ],
        get: 'genesis_aspect_ratio',
        set: 'set_genesis_aspect_ratio',
      },
      {
        key: 'genesisM68kDivider',
        label: 'Main CPU speed',
        description:
          'Motorola 68000 clock divider; lower divides less and overclocks the main CPU (7 = 100%).',
        type: 'enum',
        default: '7',
        values: [
          { value: '7', label: '100%' },
          { value: '6', label: '117%' },
          { value: '5', label: '140%' },
          { value: '4', label: '175%' },
          { value: '3', label: '233%' },
        ],
        get: 'genesis_m68k_divider',
        set: 'set_genesis_m68k_divider',
      },
      {
        key: 'genesisNonLinearColorScale',
        label: 'Non-linear color scale',
        description: 'Emulate the VDP’s non-linear color ramp instead of a linear one.',
        type: 'boolean',
        default: true,
        get: 'genesis_non_linear_color_scale',
        set: 'set_genesis_non_linear_color_scale',
      },
      {
        key: 'genesisRemoveSpriteLimits',
        label: 'Remove sprite limits',
        description: 'Lift the per-scanline sprite and sprite-pixel limits (reduces flicker).',
        type: 'boolean',
        default: false,
        get: 'genesis_remove_sprite_limits',
        set: 'set_genesis_remove_sprite_limits',
      },
      {
        key: 'genesisEmulateLowPass',
        label: 'Low-pass filter',
        description: 'Emulate the console’s 3.39 KHz audio low-pass filter.',
        type: 'boolean',
        default: true,
        get: 'genesis_emulate_low_pass',
        set: 'set_genesis_emulate_low_pass',
      },
      {
        key: 'genesisRenderVerticalBorder',
        label: 'Vertical border',
        description: 'Render the top and bottom overscan borders.',
        type: 'boolean',
        default: false,
        get: 'genesis_render_vertical_border',
        set: 'set_genesis_render_vertical_border',
      },
      {
        key: 'genesisRenderHorizontalBorder',
        label: 'Horizontal border',
        description: 'Render the left and right overscan borders.',
        type: 'boolean',
        default: false,
        get: 'genesis_render_horizontal_border',
        set: 'set_genesis_render_horizontal_border',
      },
    ],
  },
  {
    id: 'smsgg',
    label: 'Master System / Game Gear',
    system: 'smsgg',
    options: [
      {
        key: 'smsTimingMode',
        label: 'Timing mode',
        description: 'Master System refresh rate and display timing.',
        type: 'enum',
        default: 'Ntsc',
        values: [
          { value: 'Ntsc', label: 'NTSC' },
          { value: 'Pal', label: 'PAL' },
        ],
        get: 'sms_timing_mode',
        set: 'set_sms_timing_mode',
      },
      {
        key: 'smsRegion',
        label: 'Hardware region',
        description: 'Master System / Game Gear hardware region. Auto detects from the cartridge header.',
        type: 'enum',
        default: 'Auto',
        values: [
          { value: 'Auto', label: 'Auto' },
          { value: 'International', label: 'International' },
          { value: 'Domestic', label: 'Domestic' },
        ],
        get: 'sms_region',
        set: 'set_sms_region',
      },
      {
        key: 'smsAspectRatio',
        label: 'SMS aspect ratio',
        description: 'Display aspect ratio for Master System output.',
        type: 'enum',
        default: 'Ntsc',
        values: [
          { value: 'Ntsc', label: 'NTSC' },
          { value: 'Pal', label: 'PAL' },
          { value: 'SquarePixels', label: 'Square' },
        ],
        get: 'sms_aspect_ratio',
        set: 'set_sms_aspect_ratio',
      },
      {
        key: 'ggAspectRatio',
        label: 'Game Gear aspect ratio',
        description: 'Display aspect ratio for Game Gear output.',
        type: 'enum',
        default: 'GgLcd',
        values: [
          { value: 'GgLcd', label: 'GG LCD' },
          { value: 'SquarePixels', label: 'Square' },
        ],
        get: 'gg_aspect_ratio',
        set: 'set_gg_aspect_ratio',
      },
      {
        key: 'smsCropVerticalBorder',
        label: 'Crop vertical border',
        description: 'Crop the Master System top and bottom borders.',
        type: 'boolean',
        default: true,
        get: 'sms_crop_vertical_border',
        set: 'set_sms_crop_vertical_border',
      },
      {
        key: 'smsCropLeftBorder',
        label: 'Crop left border',
        description: 'Crop the Master System left border column.',
        type: 'boolean',
        default: false,
        get: 'sms_crop_left_border',
        set: 'set_sms_crop_left_border',
      },
      {
        key: 'smsFmEnabled',
        label: 'FM sound unit',
        description: 'Enable the YM2413 FM sound unit.',
        type: 'boolean',
        default: true,
        requiresReset: true,
        get: 'sms_fm_enabled',
        set: 'set_sms_fm_enabled',
      },
      {
        key: 'smsRemoveSpriteLimit',
        label: 'Remove sprite limit',
        description: 'Lift the per-scanline sprite limit (reduces flicker).',
        type: 'boolean',
        default: false,
        get: 'sms_remove_sprite_limit',
        set: 'set_sms_remove_sprite_limit',
      },
    ],
  },
  {
    id: 'snes',
    label: 'SNES',
    system: 'snes',
    options: [
      {
        key: 'snesAspectRatio',
        label: 'Aspect ratio',
        description: 'Display aspect ratio for SNES output.',
        type: 'enum',
        default: 'Ntsc',
        values: [
          { value: 'Ntsc', label: 'NTSC' },
          { value: 'Pal', label: 'PAL' },
          { value: 'SquarePixels', label: 'Square' },
        ],
        get: 'snes_aspect_ratio',
        set: 'set_snes_aspect_ratio',
      },
      {
        key: 'snesAudioInterpolation',
        label: 'ADPCM interpolation',
        description: 'Sample interpolation used by the SPC700 audio DSP.',
        type: 'enum',
        default: 'Gaussian',
        values: [
          { value: 'Gaussian', label: 'Gaussian' },
          { value: 'Hermite', label: 'Cubic Hermite' },
        ],
        get: 'snes_audio_interpolation',
        set: 'set_snes_audio_interpolation',
      },
    ],
  },
  {
    id: 'gba',
    label: 'Game Boy Advance',
    system: 'gba',
    options: [
      {
        key: 'gbaColorCorrection',
        label: 'Color correction',
        description: 'Compensate for the washed-out palette of the original GBA LCD.',
        type: 'enum',
        default: 'None',
        values: [
          { value: 'None', label: 'None' },
          { value: 'GbaLcd', label: 'GBA LCD' },
        ],
        get: 'gba_color_correction',
        set: 'set_gba_color_correction',
      },
      {
        key: 'gbaAudioInterpolation',
        label: 'Audio interpolation',
        description: 'Resampling applied to the GBA audio output.',
        type: 'enum',
        default: 'NearestNeighbor',
        values: [
          { value: 'NearestNeighbor', label: 'Nearest' },
          { value: 'CubicHermite', label: 'Cubic Hermite' },
          { value: 'WindowedSinc', label: 'Windowed sinc' },
        ],
        get: 'gba_audio_interpolation',
        set: 'set_gba_audio_interpolation',
      },
      {
        key: 'gbaSkipBiosAnimation',
        label: 'Skip BIOS intro',
        description: 'Boot straight into the ROM instead of playing the BIOS animation.',
        type: 'boolean',
        default: false,
        requiresReset: true,
        get: 'gba_skip_bios_animation',
        set: 'set_gba_skip_bios_animation',
      },
      {
        key: 'gbaFrameBlending',
        label: 'Interframe blending',
        description: 'Blend consecutive frames to emulate LCD ghosting.',
        type: 'boolean',
        default: false,
        get: 'gba_frame_blending',
        set: 'set_gba_frame_blending',
      },
      {
        key: 'gbaPsgLowPass',
        label: 'PSG low-pass',
        description: 'Low-pass the PSG channels (enhanced interpolation only).',
        type: 'boolean',
        default: false,
        get: 'gba_psg_low_pass',
        set: 'set_gba_psg_low_pass',
      },
    ],
  },
];

/** Flat view of every runtime-tweakable option across all groups. */
export const JGENESIS_ENGINE_OPTIONS: JgenesisOptionSpec[] = JGENESIS_OPTION_GROUPS.flatMap(
  (group) => group.options,
);

/**
 * This package's defaults, which are applied to the config ref on load and are
 * what "restore defaults" restores. They deliberately do not all match the wasm
 * build's own built-ins — `filterMode` defaults to nearest-neighbour here so
 * pixel art stays crisp, where jgenesis itself starts on linear.
 */
export const JGENESIS_ENGINE_DEFAULTS: Record<string, boolean | string> = Object.fromEntries(
  JGENESIS_ENGINE_OPTIONS.map((option) => [option.key, option.default]),
);

const OPTION_BY_KEY = new Map(JGENESIS_ENGINE_OPTIONS.map((option) => [option.key, option]));

export function jgenesisOption(key: string): JgenesisOptionSpec | undefined {
  return OPTION_BY_KEY.get(key);
}

/** Runtime-tweakable settings, all optional and all defaulted by the catalog. */
export type JgenesisEngineOptions = Partial<Record<string, boolean | string>>;

export interface JgenesisOptions extends JgenesisEngineOptions {
  /** ROM filename used when sending bytes to jgenesis. */
  romFileName?: string;
  /** Alias for `romFileName`; the shared demo template passes the file name here. */
  fileName?: string;
  /** Console target hint used by host-side UI. */
  console?: 'megadrive' | 'snes' | 'sms' | 'gg' | 'nes' | 'gba';
  /** Genesis hardware region override used by host-side UI. */
  genesisRegion?: 'Auto' | 'Americas' | 'Japan' | 'Europe';
  /** Master System / Game Gear hardware region override used by host-side UI. */
  smsRegion?: 'Auto' | 'International' | 'Domestic';
  /** Show the built-in in-game settings menu on ESC. Defaults to `true`. */
  escMenu?: boolean;
}

export const DEFAULT_JGENESIS_OPTIONS = {
  romFileName: 'game.bin',
  console: 'megadrive',
  genesisRegion: 'Auto',
  smsRegion: 'Auto',
  escMenu: true,
  ...JGENESIS_ENGINE_DEFAULTS,
} as const as Required<
  Pick<JgenesisOptions, 'romFileName' | 'console' | 'genesisRegion' | 'smsRegion' | 'escMenu'>
> &
  Record<string, boolean | string>;

/** ROM extension → emulated system, mirroring jgenesis' own dispatch. */
const SYSTEM_BY_EXTENSION: Record<string, JgenesisSystem> = {
  md: 'genesis',
  gen: 'genesis',
  bin: 'genesis',
  smd: 'genesis',
  chd: 'genesis',
  cue: 'genesis',
  '32x': 'genesis',
  sms: 'smsgg',
  gg: 'smsgg',
  sfc: 'snes',
  smc: 'snes',
  gba: 'gba',
};

const SYSTEM_BY_CONSOLE: Record<string, JgenesisSystem> = {
  megadrive: 'genesis',
  sms: 'smsgg',
  gg: 'smsgg',
  snes: 'snes',
  gba: 'gba',
};

/**
 * Which settings group applies to a ROM. jgenesis picks its emulator from the
 * file extension, so that is the more reliable signal; the `console` hint is
 * only consulted when the extension is unknown.
 */
export function resolveSystem(romFileName?: string, consoleHint?: string): JgenesisSystem | null {
  const extension = romFileName?.toLowerCase().split('.').pop();
  if (extension && extension in SYSTEM_BY_EXTENSION) {
    return SYSTEM_BY_EXTENSION[extension];
  }
  return (consoleHint ? SYSTEM_BY_CONSOLE[consoleHint] : null) ?? null;
}

// ------------------------------------------------------------ contract

/** Bytes, or a thunk that produces them only when the engine actually needs them. */
export type JgenesisAsset =
  | Uint8Array
  | ArrayBuffer
  | null
  | (() => Uint8Array | ArrayBuffer | null | Promise<Uint8Array | ArrayBuffer | null>);

/** The engine: fixed for the life of the wasm instance. */
export interface JgenesisEngineConfig {
  /** wasm-bindgen glue URL. Defaults to the build next to the SDK that fits the page (threaded when cross-origin isolated). */
  jsUrl?: string;
  /** WASM URL, matching the glue. */
  wasmUrl?: string;
}

export interface JgenesisAssets {
  /** The cartridge. Its file name's extension picks the system (see `options.romFileName`). */
  rom?: JgenesisAsset;
}

export interface JgenesisStorage {
  /**
   * Folder for this game's save states, inside the engine's own: OPFS
   * `jgenesis/<namespace>/`. (Cartridge saves are upstream's, in IndexedDB by ROM name.)
   *
   * @defaultValue `"default"`
   */
  namespace?: string;
  /** `null` keeps no save states; otherwise they are written to OPFS. */
  persist?: 'opfs' | null;
}

export interface JgenesisEvents {
  /** Files were just written to (or removed from) `jgenesis/<namespace>/`. */
  saves: { files: string[] };
}

export interface JgenesisPayloads extends EnginePayloads {
  config: JgenesisEngineConfig;
  options: JgenesisOptions;
  assets: JgenesisAssets;
  storage: JgenesisStorage;
  events: JgenesisEvents;
}

function specForOption(option: JgenesisOptionSpec): PropertySpec<boolean | string> {
  return {
    default: option.default,
    description: option.description,
    live: !option.requiresReset,
    enum: option.type === 'boolean' ? [true, false] : option.values.map((choice) => choice.value),
  };
}

export const JGENESIS_SPEC: EngineSpec<JgenesisPayloads> = {
  config: {
    jsUrl: { live: false, description: 'wasm-bindgen glue URL. Defaults to the build next to the SDK.' },
    wasmUrl: { live: false, description: 'WASM URL, matching the glue.' },
  },
  options: {
    ...(Object.fromEntries(JGENESIS_ENGINE_OPTIONS.map((option) => [option.key, specForOption(option)])) as Record<
      string,
      PropertySpec<boolean | string>
    >),
    // No declared default: a default here would always reach the SDK and win over the
    // `console` hint ('game.bin' is a Genesis). The SDK falls back to it itself.
    romFileName: {
      live: false,
      description: 'The name jgenesis is given for the ROM; its extension selects the system. Without it, `console` picks one (game.bin otherwise).',
    },
    fileName: { live: false, description: 'Alias for romFileName.' },
    console: {
      default: 'megadrive',
      enum: ['megadrive', 'snes', 'sms', 'gg', 'nes', 'gba'],
      live: false,
      description: 'The system, when the ROM name has no extension jgenesis knows.',
    },
    genesisRegion: {
      default: 'Auto',
      enum: ['Auto', 'Americas', 'Japan', 'Europe'],
      live: false,
      description: 'Genesis hardware region.',
    },
    smsRegion: {
      default: 'Auto',
      enum: ['Auto', 'International', 'Domestic'],
      live: false,
      description: 'Master System / Game Gear hardware region.',
    },
    escMenu: {
      default: true,
      enum: [true, false],
      live: false,
      description: 'The built-in settings overlay on Escape. Off when the engine app runs the game.',
    },
  },
  assets: {
    rom: {
      allowedTypes: ['.bin', '.gen', '.md', '.smd', '.32x', '.sms', '.gg', '.sfc', '.smc', '.gba'],
      live: false,
      description: 'The cartridge. Required to start.',
    },
  },
  storage: {
    namespace: {
      default: 'default',
      live: false,
      description: "Folder for this game's save states (OPFS jgenesis/<namespace>/).",
    },
    persist: { enum: ['opfs', null], live: false, description: 'null keeps no save states.' },
  },
};
