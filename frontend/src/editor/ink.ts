import { schema } from './schema';
import { insertShape } from './shape';
import type { DocEditor } from './editor';

const PX = 96 / 72;
const NS = 'http://www.w3.org/2000/svg';

export class InkTool {
  on = false;
  color = '#c2410c';
  width = 2;
  tool: 'pen' | 'highlighter' | 'eraser' = 'pen';
  highlightColor = '#facc15';
  highlightWidth = 12;
  private bar: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private live: SVGPolylineElement | null = null;
  private points: Array<[number, number]> = [];
  private readonly key = (e: KeyboardEvent): void => { if (e.key === 'Escape' && this.on) { e.preventDefault(); this.toggle(false); } };

  constructor(private readonly ed: DocEditor, private readonly host: () => HTMLElement, private readonly changed: (on: boolean) => void) {}

  toggle(on = !this.on): boolean {
    if (on === this.on) return on;
    this.on = on;
    if (on) {
      const o = document.createElement('div');
      o.className = 'ft-ink-layer';
      o.setAttribute('aria-label', 'Drawing layer: drag to draw, Esc to stop');
      const svg = o.appendChild(document.createElementNS(NS, 'svg'));
      this.live = svg.appendChild(document.createElementNS(NS, 'polyline'));
      o.addEventListener('pointerdown', (e) => this.down(e));
      this.host().appendChild(o);
      this.overlay = o;
      this.bar = this.makeBar();
      document.getElementById('overlay-root')?.appendChild(this.bar);
      this.paintBar();
      document.addEventListener('keydown', this.key, true);
    } else {
      this.overlay?.remove();
      this.overlay = null;
      this.bar?.remove();
      this.bar = null;
      this.live = null;
      document.removeEventListener('keydown', this.key, true);
    }
    this.changed(on);
    return on;
  }

  setTool(tool: string, color?: string, width?: number): void {
    if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') this.tool = tool;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) { if (this.tool === 'highlighter') this.highlightColor = color; else this.color = color; }
    if (width && width > 0) { if (this.tool === 'highlighter') this.highlightWidth = Math.max(4, Math.min(36, width)); else this.width = Math.max(0.5, Math.min(24, width)); }
    this.paintBar();
  }

  private makeBar(): HTMLElement {
    const swatches = ['#1a1a1a', '#c2410c', '#2563eb', '#16a34a', '#9333ea', '#facc15', '#f472b6', '#22d3ee'];
    const bar = document.createElement('div');
    bar.className = 'ft-ink-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Drawing tools');
    bar.innerHTML = ['pen', 'highlighter', 'eraser'].map((t) => `<button type="button" class="ft-ink-tool" data-tool="${t}" aria-pressed="false">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')
      + '<span class="ft-ink-sep"></span>' + swatches.map((c) => `<button type="button" class="ft-ink-swatch" data-color="${c}" style="--sw:${c}" aria-label="Colour ${c}" aria-pressed="false"></button>`).join('')
      + '<span class="ft-ink-sep"></span>' + [[1, 'Fine'], [2, 'Medium'], [4, 'Thick']].map(([w, l]) => `<button type="button" class="ft-ink-width" data-width="${w}" aria-pressed="false">${l}</button>`).join('')
      + '<span class="ft-ink-sep"></span><button type="button" class="ft-ink-done" data-done>Done</button>';
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.done !== undefined) { this.toggle(false); return; }
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (b.dataset.color) this.setTool(this.tool === 'eraser' ? 'pen' : this.tool, b.dataset.color);
      else if (b.dataset.width) this.setTool(this.tool === 'eraser' ? 'pen' : this.tool, undefined, Number(b.dataset.width) * (this.tool === 'highlighter' ? 6 : 1));
    });
    return bar;
  }

  private paintBar(): void {
    const bar = this.bar;
    if (!bar) return;
    const color = this.tool === 'highlighter' ? this.highlightColor : this.color;
    const unit = this.tool === 'highlighter' ? this.highlightWidth / 6 : this.width;
    bar.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const on = b.dataset.tool ? b.dataset.tool === this.tool : b.dataset.color ? this.tool !== 'eraser' && b.dataset.color === color : b.dataset.width ? this.tool !== 'eraser' && Number(b.dataset.width) === unit : false;
      if (b.getAttribute('aria-pressed') !== String(on) && b.dataset.done === undefined) b.setAttribute('aria-pressed', String(on));
    });
    if (this.overlay) this.overlay.dataset.tool = this.tool;
  }

  private erase(e: PointerEvent): void {
    const view = this.ed.view;
    const o = this.overlay;
    if (!view || !o) return;
    e.preventDefault();
    o.setPointerCapture(e.pointerId);
    const hitAt = (x: number, y: number): void => {
      o.style.pointerEvents = 'none';
      const hits = document.elementsFromPoint(x, y);
      o.style.pointerEvents = '';
      for (const h of hits) {
        const s = h.closest<HTMLElement>('.ft-shape');
        if (!s || !view.dom.contains(s)) continue;
        let pos: number;
        try { pos = view.posAtDOM(s, 0); } catch { continue; }
        for (const at of [pos, pos - 1]) {
          const node = at >= 0 ? view.state.doc.nodeAt(at) : null;
          if (node?.type === schema.nodes.shape && node.attrs.kind === 'ink') { view.dispatch(view.state.tr.delete(at, at + node.nodeSize)); return; }
        }
      }
    };
    hitAt(e.clientX, e.clientY);
    const move = (ev: PointerEvent): void => hitAt(ev.clientX, ev.clientY);
    const up = (): void => { o.removeEventListener('pointermove', move); o.removeEventListener('pointerup', up); o.removeEventListener('pointercancel', up); };
    o.addEventListener('pointermove', move);
    o.addEventListener('pointerup', up);
    o.addEventListener('pointercancel', up);
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.overlay || !this.live) return;
    if (this.tool === 'eraser') { this.erase(e); return; }
    e.preventDefault();
    const o = this.overlay;
    const hl = this.tool === 'highlighter';
    const r = o.getBoundingClientRect();
    const ratio = r.width && o.offsetWidth ? r.width / o.offsetWidth : 1;
    this.points = [[e.clientX, e.clientY]];
    const draw = (): void => {
      const pts = this.points.map(([x, y]) => `${((x - r.left) / ratio).toFixed(1)},${((y - r.top) / ratio).toFixed(1)}`).join(' ');
      this.live!.setAttribute('points', pts);
      this.live!.setAttribute('stroke', hl ? this.highlightColor : this.color);
      this.live!.setAttribute('stroke-width', String((hl ? this.highlightWidth : this.width) * PX));
      this.live!.setAttribute('stroke-opacity', hl ? '0.45' : '1');
    };
    draw();
    o.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      const last = this.points[this.points.length - 1];
      if (Math.hypot(ev.clientX - last[0], ev.clientY - last[1]) < 1.5 * ratio) return;
      this.points.push([ev.clientX, ev.clientY]);
      draw();
    };
    const up = (): void => {
      o.removeEventListener('pointermove', move);
      o.removeEventListener('pointerup', up);
      o.removeEventListener('pointercancel', up);
      this.live?.setAttribute('points', '');
      this.commit(ratio, hl);
    };
    o.addEventListener('pointermove', move);
    o.addEventListener('pointerup', up);
    o.addEventListener('pointercancel', up);
  }

  private commit(ratio: number, hl = false): void {
    const view = this.ed.view;
    const pts = this.points;
    this.points = [];
    if (!view || pts.length < 2) return;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const sw = hl ? this.highlightWidth : this.width;
    const pad = (sw * PX) / 2 + 1;
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(2, (Math.max(...xs) - minX) / ratio + pad * 2), h = Math.max(2, (Math.max(...ys) - minY) / ratio + pad * 2);
    const d = 'M' + pts.map(([x, y]) => `${((x - minX) / ratio + pad).toFixed(1)},${((y - minY) / ratio + pad).toFixed(1)}`).join('L');
    const hit = view.posAtCoords({ left: minX, top: minY }) ?? view.posAtCoords({ left: minX, top: Math.max(...ys) });
    if (!hit) return;
    const $p = view.state.doc.resolve(hit.pos);
    let depth = $p.depth;
    while (depth > 0 && !$p.node(depth).isTextblock) depth--;
    if (depth === 0 || $p.node(depth).type !== schema.nodes.paragraph) return;
    const at = $p.start(depth);
    const para = view.nodeDOM($p.before(depth)) as HTMLElement | null;
    if (!para) return;
    const pr = para.getBoundingClientRect();
    const x = ((minX - pr.left) / ratio - pad) / PX, y = ((minY - pr.top) / ratio - pad) / PX;
    const r2 = (n: number): number => Math.round(n * 100) / 100;
    insertShape({ kind: 'ink', path: d, box: [r2(w), r2(h)], width: r2(w / PX), height: r2(h / PX), fill: '', stroke: hl ? this.highlightColor : this.color, strokeWidth: sw, text: '', wrap: hl ? 'behind' : 'front', x: r2(x), y: r2(y), ...(hl ? { opacity: 0.45 } : {}) }, at)(view.state, view.dispatch);
  }
}
