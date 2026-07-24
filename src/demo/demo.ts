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

// On launch the template mounts a `section.file-info` panel (ROM name, size,
// checksums) into shadow DOM, floating over the emulator picture — so
// theme.genesis.css hides it while running and we log its rows instead.
//
// The panel renders twice: once with checksums as "computing…" placeholders,
// then again with the real digests. Rows are logged as they settle, each label
// only once, so both passes together produce one complete set of lines.
const LOG_PREFIX = '[demo]';
const PENDING = '…';

function mirrorFileInfoToConsole(panel: Element): void {
  const logged = new Set<string>();

  const flush = (): void => {
    const root = panel.shadowRoot;
    if (!root) return;

    const title = root.querySelector('h2')?.textContent?.trim();
    if (title && !logged.has('#title')) {
      logged.add('#title');
      console.log(`${LOG_PREFIX} ROM: ${title}`);
    }

    root.querySelectorAll('.row').forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.trim();
      const value = row.querySelector('dd')?.textContent?.trim();
      if (!label || !value || value.includes(PENDING) || logged.has(label)) return;
      logged.add(label);
      console.log(`${LOG_PREFIX} ${label}: ${value}`);
    });
  };

  // The panel's shadow root is attached by the template's own mount() call, so
  // it may not exist yet on the mutation that revealed the host element.
  const observer = new MutationObserver(flush);
  const observeShadow = (): boolean => {
    const root = panel.shadowRoot;
    if (!root) return false;
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    flush();
    return true;
  };

  if (!observeShadow()) {
    const retry = new MutationObserver(() => {
      if (observeShadow()) retry.disconnect();
    });
    retry.observe(panel, { childList: true, subtree: true });
  }
}

const mainEl = document.querySelector('main');
if (mainEl) {
  const pageObserver = new MutationObserver(() => {
    const panel = mainEl.querySelector('section.file-info');
    if (!panel) return;
    pageObserver.disconnect();
    mirrorFileInfoToConsole(panel);
  });
  pageObserver.observe(mainEl, { childList: true, subtree: true });
}
