import { schema } from './schema';
import { insertShape } from './shape';
import type { DocEditor } from './editor';

const PX = 96 / 72;
const NS = 'http://www.w3.org/2000/svg';

export class InkTool {
  on = false;
  color = '#c2410c';
  width = 2;
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
      document.addEventListener('keydown', this.key, true);
    } else {
      this.overlay?.remove();
      this.overlay = null;
      this.live = null;
      document.removeEventListener('keydown', this.key, true);
    }
    this.changed(on);
    return on;
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.overlay || !this.live) return;
    e.preventDefault();
    const o = this.overlay;
    const r = o.getBoundingClientRect();
    const ratio = r.width && o.offsetWidth ? r.width / o.offsetWidth : 1;
    this.points = [[e.clientX, e.clientY]];
    const draw = (): void => {
      const pts = this.points.map(([x, y]) => `${((x - r.left) / ratio).toFixed(1)},${((y - r.top) / ratio).toFixed(1)}`).join(' ');
      this.live!.setAttribute('points', pts);
      this.live!.setAttribute('stroke', this.color);
      this.live!.setAttribute('stroke-width', String(this.width * PX));
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
      this.commit(ratio);
    };
    o.addEventListener('pointermove', move);
    o.addEventListener('pointerup', up);
    o.addEventListener('pointercancel', up);
  }

  private commit(ratio: number): void {
    const view = this.ed.view;
    const pts = this.points;
    this.points = [];
    if (!view || pts.length < 2) return;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pad = (this.width * PX) / 2 + 1;
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
    insertShape({ kind: 'ink', path: d, box: [r2(w), r2(h)], width: r2(w / PX), height: r2(h / PX), fill: '', stroke: this.color, strokeWidth: this.width, text: '', wrap: 'front', x: r2(x), y: r2(y) }, at)(view.state, view.dispatch);
  }
}
