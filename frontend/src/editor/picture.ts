import type { Node as PMNode } from 'prosemirror-model';
import { type Command, NodeSelection, type EditorState } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mediaUrl, schema } from './schema';

export const WRAPS = ['inline', 'square', 'tight', 'topBottom', 'behind', 'front'] as const;
const PX = 96 / 72;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export interface Crop { t: number; r: number; b: number; l: number }

function cropOf(v: unknown): Crop {
  const c = (v ?? {}) as Partial<Crop>;
  const f = (n: unknown): number => Math.max(0, Math.min(0.9, Number(n) || 0));
  return { t: f(c.t), r: f(c.r), b: f(c.b), l: f(c.l) };
}

export function filterOf(a: Record<string, unknown>): string {
  const parts: string[] = [];
  const b = Number(a.brightness ?? 100), c = Number(a.contrast ?? 100), s = Number(a.saturation ?? 100);
  if (b !== 100) parts.push(`brightness(${b}%)`);
  if (c !== 100) parts.push(`contrast(${c}%)`);
  if (s !== 100) parts.push(`saturate(${s}%)`);
  return parts.join(' ');
}

function set(n: HTMLElement, prop: string, value: string): void {
  if (n.style.getPropertyValue(prop) !== value) { if (value) n.style.setProperty(prop, value); else n.style.removeProperty(prop); }
}

export class PictureView implements NodeView {
  dom: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly img: HTMLImageElement;
  private node: PMNode;
  private drag: { kind: string; x: number; y: number; w: number; h: number; ox: number; oy: number; ratio: number } | null = null;

  constructor(node: PMNode, private readonly view: EditorView, private readonly getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'ft-pic';
    this.frame = this.dom.appendChild(document.createElement('span'));
    this.frame.className = 'ft-pic-frame';
    this.img = this.frame.appendChild(document.createElement('img'));
    this.img.draggable = false;
    this.img.decoding = 'async';
    for (const h of HANDLES) {
      const n = this.dom.appendChild(document.createElement('span'));
      n.className = 'ft-pic-handle';
      n.dataset.h = h;
    }
    this.dom.addEventListener('pointerdown', (e) => this.down(e));
    this.apply();
  }

  private apply(): void {
    const a = this.node.attrs;
    const w = Number(a.width) * PX, h = Number(a.height) * PX;
    const crop = cropOf(a.crop);
    const wrap = (WRAPS as readonly string[]).includes(String(a.wrap)) ? String(a.wrap) : 'inline';
    if (this.dom.dataset.wrap !== wrap) this.dom.dataset.wrap = wrap;
    const side = String(a.side || 'left');
    if (this.dom.dataset.side !== side) this.dom.dataset.side = side;
    if (this.dom.dataset.media !== String(a.media)) this.dom.dataset.media = String(a.media);
    const src = mediaUrl(String(a.media));
    if (this.img.getAttribute('src') !== src) this.img.setAttribute('src', src);
    if (this.img.alt !== String(a.alt)) this.img.alt = String(a.alt);
    set(this.frame, 'width', `${w.toFixed(2)}px`);
    set(this.frame, 'height', `${h.toFixed(2)}px`);
    set(this.frame, 'transform', Number(a.rotate) ? `rotate(${Number(a.rotate)}deg)` : '');
    const iw = w / (1 - crop.l - crop.r), ih = h / (1 - crop.t - crop.b);
    set(this.img, 'width', `${iw.toFixed(2)}px`);
    set(this.img, 'height', `${ih.toFixed(2)}px`);
    set(this.img, 'left', `${(-crop.l * iw).toFixed(2)}px`);
    set(this.img, 'top', `${(-crop.t * ih).toFixed(2)}px`);
    set(this.img, 'filter', filterOf(a));
    set(this.img, 'opacity', Number(a.transparency) ? String(1 - Number(a.transparency) / 100) : '');
    const free = wrap === 'behind' || wrap === 'front';
    set(this.dom, 'left', free ? `${(Number(a.x) * PX).toFixed(2)}px` : '');
    set(this.dom, 'top', free ? `${(Number(a.y) * PX).toFixed(2)}px` : '');
    const tight = wrap === 'tight' && !Number(a.rotate) && !crop.t && !crop.r && !crop.b && !crop.l;
    set(this.dom, 'shape-outside', tight && src ? `url("${src}")` : '');
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.drag) this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  stopEvent(e: Event): boolean { return !!this.drag || (e.target instanceof HTMLElement && e.target.classList.contains('ft-pic-handle')); }
  ignoreMutation(): boolean { return true; }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.view.editable) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.ft-pic-handle')?.dataset.h;
    const wrap = this.dom.dataset.wrap;
    const free = wrap === 'behind' || wrap === 'front';
    if (!handle && !(free && this.dom.classList.contains('is-selected'))) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.dom.getBoundingClientRect();
    const ratio = rect.width && this.dom.offsetWidth ? rect.width / this.dom.offsetWidth : 1;
    this.drag = { kind: handle ?? 'move', x: e.clientX, y: e.clientY, w: this.frame.offsetWidth, h: this.frame.offsetHeight, ox: parseFloat(this.dom.style.left) || 0, oy: parseFloat(this.dom.style.top) || 0, ratio };
    this.dom.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => this.move(ev);
    const up = (ev: PointerEvent): void => {
      this.dom.removeEventListener('pointermove', move);
      this.dom.removeEventListener('pointerup', up);
      this.dom.removeEventListener('pointercancel', up);
      this.commit(ev);
    };
    this.dom.addEventListener('pointermove', move);
    this.dom.addEventListener('pointerup', up);
    this.dom.addEventListener('pointercancel', up);
  }

  private size(ev: PointerEvent): { w: number; h: number } {
    const d = this.drag!;
    const dx = (ev.clientX - d.x) / d.ratio, dy = (ev.clientY - d.y) / d.ratio;
    let w = d.w, h = d.h;
    if (d.kind.includes('e')) w = d.w + dx;
    if (d.kind.includes('w')) w = d.w - dx;
    if (d.kind.includes('s')) h = d.h + dy;
    if (d.kind.startsWith('n')) h = d.h - dy;
    if (d.kind.length === 2 && !ev.shiftKey) {
      const k = Math.max(w / d.w, h / d.h);
      w = d.w * k; h = d.h * k;
    }
    return { w: Math.max(12, w), h: Math.max(12, h) };
  }

  private move(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'move') {
      set(this.dom, 'left', `${(d.ox + (ev.clientX - d.x) / d.ratio).toFixed(2)}px`);
      set(this.dom, 'top', `${(d.oy + (ev.clientY - d.y) / d.ratio).toFixed(2)}px`);
      return;
    }
    const { w, h } = this.size(ev);
    const crop = cropOf(this.node.attrs.crop);
    set(this.frame, 'width', `${w.toFixed(2)}px`);
    set(this.frame, 'height', `${h.toFixed(2)}px`);
    const iw = w / (1 - crop.l - crop.r), ih = h / (1 - crop.t - crop.b);
    set(this.img, 'width', `${iw.toFixed(2)}px`);
    set(this.img, 'height', `${ih.toFixed(2)}px`);
    set(this.img, 'left', `${(-crop.l * iw).toFixed(2)}px`);
    set(this.img, 'top', `${(-crop.t * ih).toFixed(2)}px`);
  }

  private commit(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const pos = this.getPos();
    if (Math.abs(ev.clientX - d.x) < 1 && Math.abs(ev.clientY - d.y) < 1) { this.drag = null; this.apply(); return; }
    let patch: Record<string, unknown>;
    if (d.kind === 'move') patch = { x: round((d.ox + (ev.clientX - d.x) / d.ratio) / PX), y: round((d.oy + (ev.clientY - d.y) / d.ratio) / PX) };
    else { const { w, h } = this.size(ev); patch = { width: round(w / PX), height: round(h / PX) }; }
    this.drag = null;
    if (pos === undefined) { this.apply(); return; }
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }
}

function round(n: number): number { return Math.round(n * 100) / 100; }

export function selectedPicture(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.image) return { node: sel.node, pos: sel.from };
  const after = sel.$from.nodeAfter, before = sel.$from.nodeBefore;
  if (sel.empty && after?.type === schema.nodes.image) return { node: after, pos: sel.from };
  if (sel.empty && before?.type === schema.nodes.image) return { node: before, pos: sel.from - before.nodeSize };
  return null;
}

export function setPicture(patch: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const pic = selectedPicture(state);
    if (!pic) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(pic.pos, undefined, { ...pic.node.attrs, ...patch });
      tr.setSelection(NodeSelection.create(tr.doc, pic.pos));
      dispatch(tr);
    }
    return true;
  };
}

export function insertPicture(attrs: Record<string, unknown>, at?: number): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.image.create(attrs);
    const tr = at === undefined ? state.tr.replaceSelectionWith(node) : state.tr.insert(at, node);
    const pos = at === undefined ? tr.mapping.map(state.selection.from, -1) : at;
    try { tr.setSelection(NodeSelection.create(tr.doc, pos)); } catch { void 0; }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function naturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = url;
  });
}

export function fitSize(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  let width = w * 0.75, height = h * 0.75;
  const k = Math.min(1, maxW / width, maxH / height);
  width *= k; height *= k;
  return { width: round(width), height: round(height) };
}
