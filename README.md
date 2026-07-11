# @wasm-gaming/jgenesis-wasm

[![Build](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/build.yml/badge.svg)](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/build.yml)
[![Release](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/release.yml/badge.svg)](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/release.yml)

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
make build-wasm   # builds jgenesis-web in Docker (local scripts)
make preview      # serves dist/ with COOP/COEP
```

### dist/original and dist/index.html

`make build-wasm` clones `jsgroth/jgenesis`, builds `frontend/jgenesis-web`, and writes:

- runtime package files to `dist/jgenesis/`
  - `jgenesis.js` + `jgenesis.threaded.wasm(.d.ts)` — threaded build (needs cross-origin isolation)
  - `jgenesis.single.js` + `jgenesis.single.wasm(.d.ts)` — single-thread build (no COOP/COEP needed)
  - `jgenesis.d.ts`
  - `js/audio-processor.js` (threaded, SharedArrayBuffer queue) and
    `js/audio-processor-single.js` (plain-JS MessagePort queue)
- upstream web snapshot to `dist/original/`:
  - `dist/original/index.html`
  - `dist/original/pkg/`
  - `dist/original/js/`

Then `build-demo` compiles this package demo shell and writes it to:

- `dist/index.html`

`build-demo` will not overwrite an existing upstream `dist/original/index.html`.

If `build-demo` runs before `build-wasm`, and `dist/index.html` already exists, it may still be preserved at:

- `dist/original/index.html`

## Notes

- WASM build orchestration is local to this repo via `scripts/build-docker.sh` and
  `scripts/build-jgenesis.sh`.
- SDK selects the runtime pair automatically (glue and wasm must always match —
  wasm-bindgen export names embed per-build crate hashes):
  - `jgenesis.js` + `jgenesis.threaded.wasm` when `crossOriginIsolated === true`
  - `jgenesis.single.js` + `jgenesis.single.wasm` otherwise;
    this build is compiled without atomics/shared memory and streams audio to
    the worklet over a MessagePort instead of a SharedArrayBuffer
- The GitHub Pages demo deploy injects [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)
  (vendored at `src/demo/vendor/`) into `dist/index.html` so the page becomes
  cross-origin isolated and gets the threaded build; the single-thread pair
  remains the fallback for browsers without service workers. This is Pages-only:
  the local `dist/` is untouched, so `make preview.single` still exercises the
  single-threaded build.
- ROM files are user-provided and never committed.
