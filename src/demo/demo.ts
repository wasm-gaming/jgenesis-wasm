import { load } from '@wasm-gaming/jgenesis-wasm';
import type { EngineEvent } from '@wasm-gaming/engine-specs';

const picker = document.getElementById('picker') as HTMLDivElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fileInput = document.getElementById('file') as HTMLInputElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let booting = false;

function getEngineErrorMessage(ev: EngineEvent): string | null {
  if (ev.type !== 'error') return null;
  return ev.error?.message ?? 'Unknown error';
}

async function bootFromBytes(rom: Uint8Array, fileName = 'game.bin'): Promise<void> {
  if (booting) return;
  booting = true;
  picker.classList.add('hidden');

  try {
    const engine = await load({
      canvas,
      assets: { rom },
      options: { romFileName: fileName },
      onEvent: (ev: EngineEvent) => {
        console.log('[demo] engine event', ev);
        const message = getEngineErrorMessage(ev);
        if (message) alert('Engine error: ' + message);
      },
    });

    (window as any).__engine = engine;
  } catch (e) {
    booting = false;
    picker.classList.remove('hidden');
    throw e;
  }
}

async function bootFromFile(file: File): Promise<void> {
  try {
    await bootFromBytes(new Uint8Array(await file.arrayBuffer()), file.name || 'game.bin');
  } catch (e) {
    console.error('[demo] boot failed', e);
  }
}

function offerPicker(): void {
  status.textContent = 'Pick a ROM file or drag-and-drop it anywhere on the page.';

  fileInput.hidden = false;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void bootFromFile(file);
  });

  const stop = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  for (const t of ['dragenter', 'dragover'] as const) {
    window.addEventListener(t, (e) => {
      stop(e);
      picker.classList.add('dragover');
    });
  }
  for (const t of ['dragleave', 'dragend'] as const) {
    window.addEventListener(t, (e) => {
      stop(e);
      picker.classList.remove('dragover');
    });
  }

  window.addEventListener('drop', (e) => {
    stop(e);
    picker.classList.remove('dragover');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) void bootFromFile(file);
  });
}

offerPicker();
