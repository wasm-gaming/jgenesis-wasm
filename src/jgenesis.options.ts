import type { JSONSchema } from '@wasm-gaming/engine-specs';

export interface JgenesisOptions {
  /** ROM filename used when sending bytes to jgenesis. */
  romFileName?: string;
  /** Console target hint used by host-side UI. */
  console?: 'megadrive' | 'snes' | 'sms' | 'gg' | 'nes' | 'gba';
  /** Genesis timing mode hint. */
  genesisTimingMode?: 'auto' | 'ntsc' | 'pal';
}

export const DEFAULT_JGENESIS_OPTIONS: Required<JgenesisOptions> = {
  romFileName: 'game.bin',
  console: 'megadrive',
  genesisTimingMode: 'auto',
};

export const JGENESIS_OPTIONS_SCHEMA: JSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    romFileName: {
      type: 'string',
      default: 'game.bin',
      description: 'ROM filename passed to jgenesis when opening bytes from host memory.',
    },
    console: {
      type: 'string',
      enum: ['megadrive', 'snes', 'sms', 'gg', 'nes', 'gba'],
      default: 'megadrive',
      description: 'Console target hint used by host-side pages and UI overlays.',
    },
    genesisTimingMode: {
      type: 'string',
      enum: ['auto', 'ntsc', 'pal'],
      default: 'auto',
      description: 'Genesis timing preference for host-level configuration UIs.',
    },
  },
};
