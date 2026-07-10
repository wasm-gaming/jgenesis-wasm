# @wasm-gaming/jgenesis-wasm

jgenesis (Rust, wasm-bindgen web frontend) packaged as a wasm-gaming engine SDK.

This subproject follows the same engine-package approach used by rsdkv3 and rsdkv4:
- typed `manifest`
- typed `options`
- `load(config)` engine SDK surface
- Makefile-driven build (`build-sdk`, `build-wasm`, `preview`)

## Contract surface

```js
import { manifest, load } from '@wasm-gaming/jgenesis-wasm';

const engine = await load({
  canvas,
  assets: { rom: romBytes },
  options: { romFileName: 'sonic-1.bin' },
  onEvent: (e) => { /* ready | error */ },
});

engine.reset();
engine.setInput('jgenesis');
engine.destroy();
```

## Build

```bash
make build        # WASM + SDK
make build-sdk    # TS only
make build-wasm   # invokes workspace jgenesis Docker build wrapper
make preview      # serves dist/ with COOP/COEP
```

### dist/index.html relocation rule

When the jgenesis runtime build produces its own `dist/index.html`, this package
preserves that file by moving it to:

- `dist/original/index.html`

Then `build-demo` writes this package demo shell to `dist/index.html`.

## Notes

- Runtime artifacts are mirrored from workspace public outputs to `dist/jgenesis/`
  by `scripts/build-docker.sh`.
- ROM files are user-provided and never committed.
