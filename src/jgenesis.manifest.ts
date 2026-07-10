import type { EngineManifest } from '@wasm-gaming/engine-specs';
import { JGENESIS_OPTIONS_SCHEMA } from './jgenesis.options.js';

export const manifest: EngineManifest = {
  id: 'jgenesis',
  version: '0.1.0',
  name: 'JGenesis (WebAssembly)',
  artifacts: {
    wasm: 'jgenesis/jgenesis_web_bg.wasm',
    js: 'jgenesis/jgenesis_web.js',
  },
  assets: [
    {
      key: 'rom',
      mountPath: '/roms/game.bin',
      required: true,
      accept: ['.bin', '.gen', '.md', '.smd', '.sfc', '.smc', '.nes', '.gb', '.gba'],
      description: 'ROM bytes loaded at runtime and sent into jgenesis via EmulatorChannel.',
    },
  ],
  input: 'jgenesis',
  video: { baseWidth: 320, baseHeight: 224, aspect: '4:3' },
  options: JGENESIS_OPTIONS_SCHEMA,
  capabilities: { saveStates: false, sram: true, coreSelectable: false },
};

export default manifest;
