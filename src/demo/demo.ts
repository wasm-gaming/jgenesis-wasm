// Boot shim for the @wasm-gaming/engine-specs demo template.
//
// The template resolves its engine through `window.SDK` (see its demo/sdk.js),
// so this module only has to publish the jgenesis SDK before the template's
// own module script runs. Module scripts execute in document order, and
// index.html loads this one first.
import sdk from '@wasm-gaming/jgenesis-wasm';

declare global {
  interface Window {
    SDK?: typeof sdk;
  }
}

window.SDK = sdk;

// Mirrors the SDK's runtime selection (defaultRuntimeFiles): threaded when the
// page is cross-origin isolated, single-threaded otherwise.
const runtime = document.getElementById('runtime');
if (runtime) {
  runtime.textContent = window.crossOriginIsolated === true ? 'threaded' : 'single-threaded';
}
