import type { CommandRegistry } from '../../../engine/registry';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { fail } from './util';

interface Overlay {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  sel: HTMLElement;
  hint: HTMLElement;
  insert: HTMLButtonElement;
  full: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

let overlay: Overlay | null = null;
let busy = false;

function build(): Overlay {
  if (overlay) return overlay;
  const root = el(`<div class="ft-clip" role="dialog" aria-modal="true" aria-label="Screen clipping" hidden>
<canvas class="ft-clip-canvas"></canvas><div class="ft-clip-sel" hidden></div>
<div class="ft-clip-bar"><span class="ft-clip-hint"></span><button type="button" class="ft-btn ghost sm" data-act="cancel">Cancel</button><button type="button" class="ft-btn sm" data-act="full">Insert whole capture</button><button type="button" class="ft-btn primary sm" data-act="clip" disabled>Insert clip</button></div></div>`);
  document.getElementById('overlay-root')?.appendChild(root);
  if (!root.isConnected) document.body.appendChild(root);
  overlay = {
    root,
    canvas: root.querySelector('.ft-clip-canvas') as HTMLCanvasElement,
    sel: root.querySelector('.ft-clip-sel') as HTMLElement,
    hint: root.querySelector('.ft-clip-hint') as HTMLElement,
    insert: root.querySelector('[data-act="clip"]') as HTMLButtonElement,
    full: root.querySelector('[data-act="full"]') as HTMLButtonElement,
    cancel: root.querySelector('[data-act="cancel"]') as HTMLButtonElement,
  };
  return overlay;
}

async function grab(): Promise<HTMLCanvasElement> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot capture the screen.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.videoWidth) { resolve(); return; }
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      setTimeout(resolve, 2000);
    });
    await new Promise((r) => setTimeout(r, 150));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) throw new Error('The capture had no picture.');
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    return canvas;
  } finally {
    for (const t of stream.getTracks()) t.stop();
  }
}

function toFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('Could not encode the picture.'))), 'image/png');
  });
}

function cropOf(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w));
  out.height = Math.max(1, Math.round(h));
  out.getContext('2d')!.drawImage(src, Math.round(x), Math.round(y), out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function choose(shot: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const o = build();
  return new Promise((resolve) => {
    const fit = Math.min(window.innerWidth / shot.width, (window.innerHeight - 64) / shot.height, 1);
    o.canvas.width = shot.width;
    o.canvas.height = shot.height;
    o.canvas.getContext('2d')!.drawImage(shot, 0, 0);
    o.canvas.style.width = `${Math.round(shot.width * fit)}px`;
    o.canvas.style.height = `${Math.round(shot.height * fit)}px`;
    setText(o.hint, 'Drag over the part to keep. Enter inserts, Esc cancels.');
    setHidden(o.sel, true);
    o.insert.disabled = true;
    setHidden(o.root, false);
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    let start: { x: number; y: number } | null = null;
    const bounds = (): DOMRect => o.canvas.getBoundingClientRect();
    const finish = (value: HTMLCanvasElement | null): void => {
      o.root.removeEventListener('pointerdown', down);
      o.root.removeEventListener('pointermove', move);
      o.root.removeEventListener('pointerup', up);
      o.root.removeEventListener('click', click);
      document.removeEventListener('keydown', key, true);
      setHidden(o.root, true);
      resolve(value);
    };
    const clipOut = (): HTMLCanvasElement | null => {
      if (!rect || rect.w < 4 || rect.h < 4) return null;
      const k = shot.width / bounds().width;
      return cropOf(shot, rect.x * k, rect.y * k, rect.w * k, rect.h * k);
    };
    const paint = (): void => {
      if (!rect) { setHidden(o.sel, true); return; }
      const b = bounds();
      setHidden(o.sel, false);
      o.sel.style.left = `${b.left + rect.x}px`;
      o.sel.style.top = `${b.top + rect.y}px`;
      o.sel.style.width = `${rect.w}px`;
      o.sel.style.height = `${rect.h}px`;
      o.insert.disabled = rect.w < 4 || rect.h < 4;
    };
    const down = (e: PointerEvent): void => {
      if ((e.target as HTMLElement).closest('.ft-clip-bar')) return;
      const b = bounds();
      start = { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)) };
      rect = { x: start.x, y: start.y, w: 0, h: 0 };
      o.root.setPointerCapture(e.pointerId);
      paint();
    };
    const move = (e: PointerEvent): void => {
      if (!start) return;
      const b = bounds();
      const x = Math.max(0, Math.min(b.width, e.clientX - b.left)), y = Math.max(0, Math.min(b.height, e.clientY - b.top));
      rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
      paint();
    };
    const up = (): void => { start = null; };
    const click = (e: MouseEvent): void => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'cancel') finish(null);
      else if (act === 'full') finish(shot);
      else if (act === 'clip') finish(clipOut());
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(clipOut() ?? shot); }
    };
    o.root.addEventListener('pointerdown', down);
    o.root.addEventListener('pointermove', move);
    o.root.addEventListener('pointerup', up);
    o.root.addEventListener('click', click);
    document.addEventListener('keydown', key, true);
    o.insert.focus();
  });
}

export async function captureScreen(ed: DocEditor, mode: 'clip' | 'full'): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    const shot = await grab();
    const picked = mode === 'full' ? shot : await choose(shot);
    if (!picked) return false;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = await toFile(picked, `Screenshot ${stamp}.png`);
    await ed.insertPictures([file]);
    return true;
  } catch (e) {
    const err = e as Error;
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') { toast('Screen capture was cancelled.'); return false; }
    throw err;
  } finally {
    busy = false;
  }
}

export function registerScreenshot(reg: CommandRegistry, ed: DocEditor): void {
  reg.register({
    id: 'insert.screenshot', label: 'Screenshot or screen clip', group: 'Insert',
    description: 'Capture a screen, window or tab with the browser\'s share picker, choose a region to keep, and insert it as a picture. Needs a click or key press in the app, so it cannot run from the command line.',
    params: [{ name: 'mode', type: 'string', description: 'clip (choose a region, default) or full (insert the whole capture)' }],
    run: (p) => captureScreen(ed, p.mode === 'full' ? 'full' : 'clip').catch((e: Error) => { fail('Could not capture the screen')(e); return false; }),
  });
}
