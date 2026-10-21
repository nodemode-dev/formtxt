import { el, setHidden, setHtml } from '../ui/dom';
import { PX } from './pages';

export interface RulerState {
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
  indent: number;
  indentFirst: number;
  indentRight: number;
  tabs: Array<{ pos: number; align: string }>;
  zoom: number;
}

type Marker = 'first' | 'left' | 'right';

export class Ruler {
  readonly root: HTMLElement;
  private readonly scale: HTMLElement;
  private readonly first: HTMLElement;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly tabsHost: HTMLElement;
  private state: RulerState | null = null;

  constructor(host: HTMLElement, private readonly apply: (props: Record<string, number>) => void) {
    this.root = el(`<div class="ft-ruler" aria-hidden="true"><div class="ft-ruler-track"><div class="ft-ruler-scale"></div><div class="ft-ruler-tabs"></div>
<span class="ft-ruler-mark ft-ruler-first" data-m="first" title="First line indent"></span><span class="ft-ruler-mark ft-ruler-left" data-m="left" title="Left indent"></span><span class="ft-ruler-mark ft-ruler-right" data-m="right" title="Right indent"></span></div></div>`);
    this.scale = this.root.querySelector('.ft-ruler-scale') as HTMLElement;
    this.tabsHost = this.root.querySelector('.ft-ruler-tabs') as HTMLElement;
    this.first = this.root.querySelector('.ft-ruler-first') as HTMLElement;
    this.left = this.root.querySelector('.ft-ruler-left') as HTMLElement;
    this.right = this.root.querySelector('.ft-ruler-right') as HTMLElement;
    host.prepend(this.root);
    this.root.addEventListener('pointerdown', (e) => this.drag(e));
  }

  show(on: boolean): void { setHidden(this.root, !on); }

  update(s: RulerState): void {
    this.state = s;
    const track = this.root.querySelector('.ft-ruler-track') as HTMLElement;
    const width = `${(s.pageWidth * PX * s.zoom).toFixed(1)}px`;
    if (track.style.width !== width) track.style.width = width;
    const z = s.zoom;
    const inches = s.pageWidth / 72;
    let ticks = '';
    for (let q = 0; q <= inches * 8; q++) {
      const x = (q / 8) * 72 * PX * z;
      const kind = q % 8 === 0 ? 'in' : q % 4 === 0 ? 'half' : q % 2 === 0 ? 'qtr' : 'eighth';
      ticks += `<i class="t-${kind}" style="left:${x.toFixed(1)}px"></i>`;
      if (q % 8 === 0 && q > 0 && q < inches * 8) ticks += `<b style="left:${x.toFixed(1)}px">${q / 8}</b>`;
    }
    const ml = s.marginLeft * PX * z, mr = s.marginRight * PX * z;
    ticks += `<span class="ft-ruler-margin" style="left:0;width:${ml.toFixed(1)}px"></span><span class="ft-ruler-margin" style="right:0;width:${mr.toFixed(1)}px"></span>`;
    setHtml(this.scale, ticks, `${s.pageWidth}:${s.marginLeft}:${s.marginRight}:${z}`);
    const pos = (pt: number): string => `${(pt * PX * z).toFixed(1)}px`;
    const setLeft = (n: HTMLElement, v: string): void => { if (n.style.left !== v) n.style.left = v; };
    setLeft(this.left, pos(s.marginLeft + s.indent));
    setLeft(this.first, pos(s.marginLeft + s.indent + s.indentFirst));
    setLeft(this.right, pos(s.pageWidth - s.marginRight - s.indentRight));
    setHtml(this.tabsHost, s.tabs.map((t) => `<i class="ft-ruler-tab t-${t.align}" style="left:${pos(s.marginLeft + t.pos)}"></i>`).join(''), JSON.stringify([s.tabs, s.marginLeft, z]));
  }

  private drag(e: PointerEvent): void {
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m as Marker | undefined;
    if (!m || !this.state) return;
    e.preventDefault();
    const s = { ...this.state };
    const track = this.root.querySelector('.ft-ruler-track') as HTMLElement;
    const node = m === 'first' ? this.first : m === 'left' ? this.left : this.right;
    const toPt = (clientX: number): number => Math.round(((clientX - track.getBoundingClientRect().left) / (PX * s.zoom)) / 4.5) * 4.5;
    let last: Record<string, number> | null = null;
    const move = (ev: PointerEvent): void => {
      const x = toPt(ev.clientX);
      if (m === 'left') last = { indent: Math.max(0, x - s.marginLeft), indentFirst: s.indentFirst };
      else if (m === 'first') last = { indentFirst: x - s.marginLeft - s.indent };
      else last = { indentRight: Math.max(0, s.pageWidth - s.marginRight - x) };
      node.style.left = `${(x * PX * s.zoom).toFixed(1)}px`;
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (last) this.apply(last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
