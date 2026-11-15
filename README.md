# @wasm-gaming/jgenesis-wasm

[![Build](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/build.yml/badge.svg)](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/build.yml)
[![Release](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/release.yml/badge.svg)](https://github.com/wasm-gaming/jgenesis-wasm/actions/workflows/release.yml)

jgenesis (Rust, wasm-bindgen web frontend) packaged as a wasm-gaming engine SDK: Mega Drive /
Genesis, Master System, Game Gear, SNES and Game Boy Advance. **Needs WebGPU** (jgenesis renders
with wgpu). Ships no games.

## Contract surface (engine-specs 1.0)

```js
import JgenesisSDK from '@wasm-gaming/jgenesis-wasm';

const play = await new JgenesisSDK()
  .options({ romFileName: 'sonic.md' })        // the extension picks the system
  .assets({ rom: () => file.arrayBuffer() })
  .storage({ namespace: 'sonic' })             // OPFS jgenesis/sonic/
  .on('error', ({ detail }) => console.error(detail))
  .mount(document.querySelector('#stage'))
  .start();

play.pause('host'); play.resume('host');
await play.restart();
play.settings.write('genesisM68kDivider', '5'); // live settings (see below)
await play.close();
```

- One game per page: the wasm module runs one emulator loop and owns `#jgenesis-wasm`.
- `romFileName` names the system; without it, `console` (`megadrive` | `snes` | `sms` | `gg` |
  `gba`) gives it.
- The SDK is self-contained ESM: `engine-specs.js` ships beside it and is imported relatively.

### Save states

```js
await play.states.save(0, { thumbnail: await play.snapshot() });
play.states.load(0);           // true when the running game took it
play.states.list();            // [{ slot, info: { savedAt, locked, thumbnail } }, …]
await play.states.copy(0, 9); await play.states.lock(0, true); await play.states.remove(0);
```

Slots 0–3 are the player's, 9 is the app's suspend point. Each slot is `slot_N.state` (the
emulator's own bincode state, as the native frontend's slots) + `slot_N.png` (+ `slot_N.lock`)
in OPFS `jgenesis/<namespace>/`. Upstream's web frontend has no states: the build patch adds
`request_save_state()` / `take_saved_state()` / `request_load_state(bytes)` /
`take_load_result()` and `set_paused()` to the emulator channel (see
[scripts/patch-jgenesis-web.mjs](scripts/patch-jgenesis-web.mjs)).

`snapshot()` copies the canvas in the task that renders the next frame (right after its
`GPUQueue.submit()`): a WebGPU canvas drops its picture once presented, so a later read is black.

### Gamepads and the touch pad

jgenesis-web reads the keyboard only. The SDK reads `navigator.getGamepads()` every frame and
presses jgenesis' default key bindings for the running system with `KeyboardEvent`s on its canvas,
so physical pads and the engine-specs touch pad (which exposes itself as a standard gamepad) both
play. Standard-pad mapping:

| System | Buttons |
|---|---|
| Mega Drive | A ← 0 · B ← 1 · C ← 5 · X ← 2 · Y ← 3 · Z ← 4 · Mode ← 8 · Start ← 9 |
| SNES | B ← 0 · A ← 1 · Y ← 2 · X ← 3 · L ← 4 · R ← 5 · Select ← 8 · Start ← 9 |
| SMS / Game Gear | 1 ← 0 · 2 ← 1 · Pause/Start ← 9 |
| GBA | A ← 0 · B ← 1 · L ← 4 · R ← 5 · Select ← 8 · Start ← 9 |

The d-pad (12–15) maps to the arrow keys. Keys are released whenever the game pauses.

## The engine app

`@wasm-gaming/jgenesis-wasm/app` is the wasm-gaming engine app (the same as BlastEm's, FBNeo's
and snes9x's): a suspend point on start, Select+Start / Escape / the touch pad's pause button
open the pause menu with the four slots in it (Cargar focused), Reiniciar, Volver al lanzador.

## In-game settings menu

jgenesis keeps its settings in a `WebConfigRef` that the emulator loop re-reads
every frame, so they can all be changed without restarting the game. With
`options: { escMenu: true }` (the default when the SDK is used on its own) the SDK
mounts a settings overlay over the viewport — **press Escape** to open it. The
engine app turns it off (its Escape opens the pause menu).

- ↑ ↓ select · ← → change · Enter apply · Esc close (mouse works too)
- Only the group for the system being emulated is shown, alongside the shared
  video settings.
- Changes persist per storage namespace in `localStorage` and are re-applied on
  the next start.
- Image filtering defaults to **nearest** here (crisp pixel art) where jgenesis
  itself starts on linear.
- Knobs the running WASM build doesn't expose are omitted rather than erroring.

```js
play.settings.write('genesisM68kDivider', '5');  // overclock the 68000 to 140%
play.settings.read('filterMode');                // 'Nearest'
play.menu?.toggle();
```

Every knob is declared once in [src/jgenesis.options.ts](src/jgenesis.options.ts).

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

Then `build-sdk` compiles the SDK, ships `engine-specs.js` beside it, copies the app to
`dist/jgenesis/app/` and the no-build demo page to `dist/index.html`.

The upstream revision is pinned (`JGENESIS_REV` in
[scripts/build-jgenesis.sh](scripts/build-jgenesis.sh)): the patch anchors on its source, so a
newer upstream needs the anchors checked.

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
