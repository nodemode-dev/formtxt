import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { schema } from './schema';

const PX = 96 / 72;
const NS = 'http://www.w3.org/2000/svg';
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

export const SHAPES = ['rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown', 'chevron', 'callout', 'cloud', 'heart', 'plus', 'line', 'textBox', 'wordArt'] as const;
export const SHAPE_LABELS: Record<string, string> = {
  rect: 'Rectangle', roundRect: 'Rounded rectangle', ellipse: 'Oval', triangle: 'Triangle', rightTriangle: 'Right triangle', diamond: 'Diamond', pentagon: 'Pentagon', hexagon: 'Hexagon', octagon: 'Octagon', star: 'Star',
  arrowRight: 'Right arrow', arrowLeft: 'Left arrow', arrowUp: 'Up arrow', arrowDown: 'Down arrow', chevron: 'Chevron', callout: 'Speech callout', cloud: 'Cloud', heart: 'Heart', plus: 'Plus', line: 'Line', textBox: 'Text box', wordArt: 'WordArt',
};
export const WORDART = ['fill', 'outline', 'shadow', 'gradient', 'glow', 'retro'] as const;
export const SHAPE_WRAPS = ['inline', 'square', 'topBottom', 'behind', 'front'] as const;

const poly = (pts: Array<[number, number]>, w: number, h: number): string => `M${pts.map(([x, y]) => `${(x * w).toFixed(2)},${(y * h).toFixed(2)}`).join('L')}Z`;
const regular = (n: number, w: number, h: number, rot = -Math.PI / 2): string => poly(Array.from({ length: n }, (_, i) => [0.5 + 0.5 * Math.cos(rot + (i * 2 * Math.PI) / n), 0.5 + 0.5 * Math.sin(rot + (i * 2 * Math.PI) / n)] as [number, number]), w, h);

export function shapePath(kind: string, w: number, h: number, s: number): string {
  const i = s / 2;
  const W = Math.max(1, w - s), H = Math.max(1, h - s);
  const at = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(Number(x) + i).toFixed(2)},${(Number(y) + i).toFixed(2)}`);
  switch (kind) {
    case 'roundRect': { const r = Math.min(W, H) * 0.18; return at(`M${r},0L${W - r},0Q${W},0 ${W},${r}L${W},${H - r}Q${W},${H} ${W - r},${H}L${r},${H}Q0,${H} 0,${H - r}L0,${r}Q0,0 ${r},0Z`); }
    case 'ellipse': return at(`M0,${H / 2}A${W / 2} ${H / 2} 0 1 0 ${W},${H / 2}A${W / 2} ${H / 2} 0 1 0 0,${H / 2}Z`);
    case 'triangle': return at(poly([[0.5, 0], [1, 1], [0, 1]], W, H));
    case 'rightTriangle': return at(poly([[0, 0], [1, 1], [0, 1]], W, H));
    case 'diamond': return at(poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], W, H));
    case 'pentagon': return at(regular(5, W, H));
    case 'hexagon': return at(poly([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]], W, H));
    case 'octagon': return at(poly([[0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71], [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29]], W, H));
    case 'star': return at(poly(Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5; const r = k % 2 ? 0.2 : 0.5; return [0.5 + r * Math.cos(a), 0.52 + r * Math.sin(a)] as [number, number]; }), W, H));
    case 'arrowRight': return at(poly([[0, 0.3], [0.62, 0.3], [0.62, 0], [1, 0.5], [0.62, 1], [0.62, 0.7], [0, 0.7]], W, H));
    case 'arrowLeft': return at(poly([[1, 0.3], [0.38, 0.3], [0.38, 0], [0, 0.5], [0.38, 1], [0.38, 0.7], [1, 0.7]], W, H));
    case 'arrowUp': return at(poly([[0.3, 1], [0.3, 0.38], [0, 0.38], [0.5, 0], [1, 0.38], [0.7, 0.38], [0.7, 1]], W, H));
    case 'arrowDown': return at(poly([[0.3, 0], [0.3, 0.62], [0, 0.62], [0.5, 1], [1, 0.62], [0.7, 0.62], [0.7, 0]], W, H));
    case 'chevron': return at(poly([[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1], [0.3, 0.5]], W, H));
    case 'plus': return at(poly([[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]], W, H));
    case 'callout': { const b = H * 0.75, r = Math.min(W, b) * 0.12; return at(`M${r},0L${W - r},0Q${W},0 ${W},${r}L${W},${b - r}Q${W},${b} ${W - r},${b}L${W * 0.4},${b}L${W * 0.2},${H}L${W * 0.25},${b}L${r},${b}Q0,${b} 0,${b - r}L0,${r}Q0,0 ${r},0Z`); }
    case 'heart': return at(`M${W / 2},${H}C${W * 0.1},${H * 0.68} 0,${H * 0.42} 0,${H * 0.27}C0,${H * 0.08} ${W * 0.16},0 ${W * 0.29},0C${W * 0.4},0 ${W * 0.47},${H * 0.07} ${W / 2},${H * 0.16}C${W * 0.53},${H * 0.07} ${W * 0.6},0 ${W * 0.71},0C${W * 0.84},0 ${W},${H * 0.08} ${W},${H * 0.27}C${W},${H * 0.42} ${W * 0.9},${H * 0.68} ${W / 2},${H}Z`);
    case 'cloud': return at(`M${W * 0.25},${H * 0.85}C${W * 0.05},${H * 0.85} 0,${H * 0.62} ${W * 0.12},${H * 0.5}C${W * 0.02},${H * 0.3} ${W * 0.22},${H * 0.12} ${W * 0.38},${H * 0.22}C${W * 0.45},${H * 0.02} ${W * 0.72},${H * 0.02} ${W * 0.75},${H * 0.25}C${W * 0.95},${H * 0.2} ${W},${H * 0.45} ${W * 0.9},${H * 0.55}C${W},${H * 0.75} ${W * 0.85},${H * 0.9} ${W * 0.7},${H * 0.85}C${W * 0.6},${H} ${W * 0.35},${H} ${W * 0.25},${H * 0.85}Z`);
    case 'line': return `M${i},${(h / 2).toFixed(2)}L${(w - i).toFixed(2)},${(h / 2).toFixed(2)}`;
    case 'wordArt': return '';
    default: return at(`M0,0L${W},0L${W},${H}L0,${H}Z`);
  }
}

function set(n: HTMLElement | SVGElement, prop: string, value: string): void {
  if (n.style.getPropertyValue(prop) !== value) { if (value) n.style.setProperty(prop, value); else n.style.removeProperty(prop); }
}

function round(n: number): number { return Math.round(n * 100) / 100; }

export class ShapeView implements NodeView {
  dom: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly path: SVGPathElement;
  private readonly text: HTMLElement;
  private node: PMNode;
  private drag: { kind: string; x: number; y: number; w: number; h: number; ox: number; oy: number; ratio: number; cx: number; cy: number; r0: number } | null = null;
  private editing = false;
  private readonly gid = `ftg${Math.random().toString(36).slice(2, 10)}`;

  constructor(node: PMNode, private readonly view: EditorView, private readonly getPos: () => number | undefined) {
    this.node = node;
    this.dom = document.createElement('span');
    this.dom.className = 'ft-shape';
    this.frame = this.dom.appendChild(document.createElement('span'));
    this.frame.className = 'ft-shape-frame';
    this.svg = this.frame.appendChild(document.createElementNS(NS, 'svg'));
    this.svg.setAttribute('aria-hidden', 'true');
    this.path = this.svg.appendChild(document.createElementNS(NS, 'path'));
    this.text = this.frame.appendChild(document.createElement('span'));
    this.text.className = 'ft-shape-text';
    for (const h of [...HANDLES, 'rot']) {
      const n = this.dom.appendChild(document.createElement('span'));
      n.className = h === 'rot' ? 'ft-pic-handle ft-rot-handle' : 'ft-pic-handle';
      n.dataset.h = h;
      if (h === 'rot') n.title = 'Drag to rotate (Shift snaps to 15 degrees)';
    }
    this.dom.addEventListener('pointerdown', (e) => this.down(e));
    this.dom.addEventListener('dblclick', (e) => { if (this.view.editable && !['line', 'icon', 'ink'].includes(String(this.node.attrs.kind))) { e.preventDefault(); e.stopPropagation(); this.edit(); } });
    this.text.addEventListener('keydown', (e) => {
      if (!this.editing) return;
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.finish(false); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.finish(true); }
    });
    this.text.addEventListener('blur', () => { if (this.editing) this.finish(true); });
    this.apply();
  }

  private apply(): void {
    const a = this.node.attrs;
    const w = Number(a.width) * PX, h = Number(a.height) * PX;
    const kind = String(a.kind);
    const wrap = String(a.wrap || 'front');
    for (const [k, v] of [['wrap', wrap], ['side', String(a.side || 'left')], ['kind', kind], ['wordart', kind === 'wordArt' ? String(a.wordart || 'fill') : '']] as const) if ((this.dom.dataset[k] ?? '') !== v) { if (v) this.dom.dataset[k] = v; else delete this.dom.dataset[k]; }
    set(this.frame, 'width', `${w.toFixed(2)}px`);
    set(this.frame, 'height', `${h.toFixed(2)}px`);
    set(this.frame, 'transform', Number(a.rotate) ? `rotate(${Number(a.rotate)}deg)` : '');
    const sw = a.stroke ? Math.max(0, Number(a.strokeWidth) || 0) * PX : 0;
    const custom = kind === 'icon' || kind === 'ink';
    const box = Array.isArray(a.box) ? (a.box as number[]) : [24, 24];
    const vb = custom ? `0 0 ${box[0]} ${box[1]}` : `0 0 ${w.toFixed(2)} ${h.toFixed(2)}`;
    const attr = (n: Element, k: string, v: string | null): void => { if (v === null) { if (n.hasAttribute(k)) n.removeAttribute(k); } else if (n.getAttribute(k) !== v) n.setAttribute(k, v); };
    attr(this.svg, 'viewBox', vb);
    attr(this.svg, 'preserveAspectRatio', kind === 'ink' ? 'none' : kind === 'icon' ? 'xMidYMid meet' : null);
    const d = custom ? String(a.path || '') : shapePath(kind, w, h, kind === 'line' ? 0 : sw);
    attr(this.path, 'd', d);
    const grad = !custom && kind !== 'line' && a.gradient && a.fill ? String(a.gradient) : '';
    if (grad) {
      let defs = this.svg.querySelector('defs');
      if (!defs) { defs = document.createElementNS(NS, 'defs'); this.svg.prepend(defs); }
      if (!defs.querySelector('linearGradient')) defs.insertAdjacentHTML('beforeend', `<linearGradient id="${this.gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0"/><stop offset="1"/></linearGradient>`);
      const stops = defs.querySelectorAll('linearGradient stop');
      attr(stops[0], 'stop-color', String(a.fill));
      attr(stops[1], 'stop-color', grad);
    } else this.svg.querySelector('linearGradient')?.remove();
    const fill = kind === 'line' || kind === 'ink' ? 'none' : grad ? `url(#${this.gid})` : String(a.fill || 'none');
    attr(this.path, 'fill', fill);
    attr(this.path, 'fill-rule', kind === 'icon' && a.fill ? 'evenodd' : null);
    const stroke = a.stroke ? String(a.stroke) : 'none';
    attr(this.path, 'stroke', stroke);
    const swt = kind === 'icon' ? '2' : String(round(kind === 'ink' ? Math.max(0.5, Number(a.strokeWidth) || 2) * PX : sw || (kind === 'line' ? PX : 0)));
    attr(this.path, 'stroke-width', swt);
    attr(this.path, 'stroke-linecap', custom ? 'round' : null);
    attr(this.path, 'stroke-linejoin', custom ? 'round' : null);
    attr(this.path, 'vector-effect', kind === 'ink' ? 'non-scaling-stroke' : null);
    set(this.svg, 'filter', a.shadow ? 'drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3))' : '');
    attr(this.svg, 'role', kind === 'icon' && a.alt ? 'img' : null);
    attr(this.svg, 'aria-label', kind === 'icon' && a.alt ? String(a.alt) : null);
    attr(this.svg, 'aria-hidden', kind === 'icon' && a.alt ? null : 'true');
    const free = wrap === 'behind' || wrap === 'front';
    const page = free && a.relative === 'page';
    if ((this.dom.dataset.rel ?? '') !== (page ? 'page' : '')) { if (page) this.dom.dataset.rel = 'page'; else { delete this.dom.dataset.rel; delete this.dom.dataset.ox; delete this.dom.dataset.oy; } }
    set(this.dom, 'left', free ? `${(Number(a.x) * PX + (page ? Number(this.dom.dataset.ox) || 0 : 0)).toFixed(2)}px` : '');
    set(this.dom, 'top', free ? `${(Number(a.y) * PX + (page ? Number(this.dom.dataset.oy) || 0 : 0)).toFixed(2)}px` : '');
    const arrows = kind === 'line' && (a.arrowStart || a.arrowEnd);
    if (arrows && !this.svg.querySelector('marker')) {
      const defs = this.svg.querySelector('defs') ?? this.svg.insertBefore(document.createElementNS(NS, 'defs'), this.svg.firstChild);
      defs.insertAdjacentHTML('beforeend', `<marker id="${this.gid}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M10,0L0,5L10,10z"/></marker><marker id="${this.gid}e" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z"/></marker>`);
    }
    if (arrows) for (const m of Array.from(this.svg.querySelectorAll('marker path'))) attr(m, 'fill', stroke);
    attr(this.path, 'marker-start', kind === 'line' && a.arrowStart ? `url(#${this.gid}s)` : null);
    attr(this.path, 'marker-end', kind === 'line' && a.arrowEnd ? `url(#${this.gid}e)` : null);
    if (!this.editing && this.text.textContent !== String(a.text ?? '')) this.text.textContent = String(a.text ?? '');
    set(this.text, 'color', kind === 'wordArt' ? '' : String(a.color || ''));
    set(this.text, 'font-size', `${(Number(a.size) || 11) * PX}px`);
    set(this.text, 'font-weight', a.bold ? '700' : '');
    set(this.text, 'font-family', a.font ? `'${String(a.font)}'` : '');
    set(this.text, 'text-align', String(a.align || 'center'));
    set(this.text, 'justify-content', a.valign === 'top' ? 'flex-start' : a.valign === 'bottom' ? 'flex-end' : 'center');
    set(this.text, '--wa-color', kind === 'wordArt' ? String(a.color || '#1a1a1a') : '');
    set(this.text, '--wa-accent', kind === 'wordArt' ? String(a.fill && a.fill !== 'none' ? a.fill : '#f97316') : '');
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.drag) this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  stopEvent(e: Event): boolean { return this.editing || !!this.drag || (e.target instanceof HTMLElement && e.target.classList.contains('ft-pic-handle')); }
  ignoreMutation(): boolean { return true; }

  edit(): void {
    if (this.editing) return;
    this.editing = true;
    this.text.setAttribute('contenteditable', 'plaintext-only');
    this.dom.classList.add('is-editing');
    this.text.focus();
    const sel = window.getSelection();
    if (sel) { const r = document.createRange(); r.selectNodeContents(this.text); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }

  private finish(save: boolean): void {
    this.editing = false;
    this.text.removeAttribute('contenteditable');
    this.dom.classList.remove('is-editing');
    const value = (this.text.innerText ?? '').replace(/\n$/, '');
    const pos = this.getPos();
    if (save && pos !== undefined && value !== String(this.node.attrs.text ?? '')) {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, text: value });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      this.view.dispatch(tr);
    } else this.text.textContent = String(this.node.attrs.text ?? '');
    this.view.focus();
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.view.editable || this.editing) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('.ft-pic-handle')?.dataset.h;
    const wrap = this.dom.dataset.wrap;
    const free = wrap === 'behind' || wrap === 'front';
    if (!handle && !(free && this.dom.classList.contains('is-selected'))) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.dom.getBoundingClientRect();
    const ratio = rect.width && this.dom.offsetWidth ? rect.width / this.dom.offsetWidth : 1;
    this.drag = { kind: handle ?? 'move', x: e.clientX, y: e.clientY, w: this.frame.offsetWidth, h: this.frame.offsetHeight, ox: parseFloat(this.dom.style.left) || 0, oy: parseFloat(this.dom.style.top) || 0, ratio, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r0: Number(this.node.attrs.rotate) || 0 };
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
    if (d.kind.length === 2 && ev.shiftKey) { const k = Math.max(w / d.w, h / d.h); w = d.w * k; h = d.h * k; }
    return { w: Math.max(8, w), h: Math.max(4, h) };
  }

  private move(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'move') {
      set(this.dom, 'left', `${(d.ox + (ev.clientX - d.x) / d.ratio).toFixed(2)}px`);
      set(this.dom, 'top', `${(d.oy + (ev.clientY - d.y) / d.ratio).toFixed(2)}px`);
      return;
    }
    if (d.kind === 'rot') { set(this.frame, 'transform', `rotate(${angleOf(d, ev)}deg)`); return; }
    const { w, h } = this.size(ev);
    set(this.frame, 'width', `${w.toFixed(2)}px`);
    set(this.frame, 'height', `${h.toFixed(2)}px`);
    if (['icon', 'ink'].includes(String(this.node.attrs.kind))) return;
    this.svg.setAttribute('viewBox', `0 0 ${w.toFixed(2)} ${h.toFixed(2)}`);
    const sw = this.node.attrs.stroke ? Math.max(0, Number(this.node.attrs.strokeWidth) || 0) * PX : 0;
    this.path.setAttribute('d', shapePath(String(this.node.attrs.kind), w, h, String(this.node.attrs.kind) === 'line' ? 0 : sw));
  }

  private commit(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const pos = this.getPos();
    if (Math.abs(ev.clientX - d.x) < 1 && Math.abs(ev.clientY - d.y) < 1) { this.drag = null; this.apply(); return; }
    let patch: Record<string, unknown>;
    if (d.kind === 'move') patch = { x: round((d.ox + (ev.clientX - d.x) / d.ratio - (Number(this.dom.dataset.ox) || 0)) / PX), y: round((d.oy + (ev.clientY - d.y) / d.ratio - (Number(this.dom.dataset.oy) || 0)) / PX) };
    else if (d.kind === 'rot') patch = { rotate: angleOf(d, ev) };
    else { const { w, h } = this.size(ev); patch = { width: round(w / PX), height: round(h / PX) }; }
    this.drag = null;
    if (pos === undefined) { this.apply(); return; }
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...patch });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
  }
}

export function angleOf(d: { cx: number; cy: number; x: number; y: number; r0?: number }, ev: PointerEvent): number {
  const raw = (x: number, y: number): number => (Math.atan2(y - d.cy, x - d.cx) * 180) / Math.PI;
  let a = (d.r0 ?? 0) + raw(ev.clientX, ev.clientY) - raw(d.x, d.y);
  if (ev.shiftKey) a = Math.round(a / 15) * 15;
  a = ((Math.round(a) % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

export function selectedShape(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.shape) return { node: sel.node, pos: sel.from };
  return null;
}

export function setShape(patch: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const s = selectedShape(state);
    if (!s) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(s.pos, undefined, { ...s.node.attrs, ...patch });
      tr.setSelection(NodeSelection.create(tr.doc, s.pos));
      dispatch(tr);
    }
    return true;
  };
}

export function shapeDefaults(kind: string): Record<string, unknown> {
  if (kind === 'textBox') return { kind, width: 180, height: 72, fill: '#ffffff', stroke: '#1a1a1a', strokeWidth: 0.75, text: 'Text box', align: 'left', valign: 'top', wrap: 'square', size: 11, color: '#1a1a1a' };
  if (kind === 'wordArt') return { kind, width: 360, height: 72, fill: '', stroke: '', strokeWidth: 0, text: 'Your text here', wordart: 'gradient', size: 40, bold: true, wrap: 'topBottom', side: 'center', color: '#1a1a1a' };
  if (kind === 'line') return { kind, width: 144, height: 12, fill: '', stroke: '#1a1a1a', strokeWidth: 1.5, text: '', wrap: 'front' };
  const wide = kind.startsWith('arrow') && (kind === 'arrowRight' || kind === 'arrowLeft');
  return { kind, width: wide ? 120 : 96, height: wide ? 60 : 96, fill: '#f97316', stroke: '#c2410c', strokeWidth: 1, text: '', wrap: 'front', color: '#ffffff' };
}

export function insertShape(attrs: Record<string, unknown>, at?: number): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.shape.create(attrs);
    const tr = at === undefined ? state.tr.replaceSelectionWith(node) : state.tr.insert(at, node);
    const pos = at === undefined ? tr.mapping.map(state.selection.from, -1) : at;
    try { tr.setSelection(NodeSelection.create(tr.doc, pos)); } catch { void 0; }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
