import { el, setClass, setDisabled, setHidden, setText } from '../dom';
import { icon } from '../icons';
import { onCmdStateChange as shellOnChange, shellCommands } from './cmd';
import { combo, openPanel, paraInfo, spin } from './controls';
import type { ParaInfo } from './controls/state';

export interface Probe {
  style(): string;
  font(): string;
  size(): string;
  styles(): string[];
  fonts(): string[];
  onChange(fn: () => void): void;
}

const run = (id: string, params: Record<string, unknown>): void => { shellCommands.run(id, params); };

const keepFocus = (node: HTMLElement): void => {
  node.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT') e.preventDefault();
  });
};

class Pop {
  readonly root: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(cls: string) {
    this.root = el(`<div class="ft-wpop ${cls}" hidden></div>`);
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.root);
    keepFocus(this.root);
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.root.hidden && !this.root.contains(t) && !this.anchor?.contains(t)) this.close();
    }, true);
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    window.addEventListener('resize', () => this.close());
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(anchor: HTMLElement): void {
    this.anchor = anchor;
    setHidden(this.root, false);
    const r = anchor.getBoundingClientRect();
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 2;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 2) : below;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  close(): void { setHidden(this.root, true); }

  toggle(anchor: HTMLElement): boolean {
    if (this.isOpen) { this.close(); return false; }
    this.open(anchor);
    return true;
  }
}


const STYLE_LOOK: Record<string, { size: number; weight: number; italic?: boolean; muted?: boolean; tracking?: number }> = {
  Normal: { size: 12, weight: 400 },
  NoSpacing: { size: 12, weight: 400 },
  Title: { size: 14, weight: 300, tracking: -0.02 },
  Subtitle: { size: 11, weight: 400, muted: true },
  Quote: { size: 12, weight: 400, italic: true },
  Heading1: { size: 13.5, weight: 700 },
  Heading2: { size: 12.5, weight: 700 },
  Heading3: { size: 12, weight: 700 },
  Heading4: { size: 12, weight: 600 },
  Heading5: { size: 12, weight: 500 },
  Heading6: { size: 12, weight: 500, italic: true },
  Heading7: { size: 11.5, weight: 500, italic: true },
  Heading8: { size: 11.5, weight: 400, italic: true },
  Heading9: { size: 11, weight: 400, italic: true },
};

const styleName = (id: string): string => id.replace(/([a-z])(\d)/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2');

function gallery(probe: Probe): HTMLElement {
  const root = el(`<div class="ft-wgal"><div class="ft-wgal-list" role="listbox" aria-label="Styles"></div><div class="ft-wgal-nav"><button class="ft-wgal-prev" type="button" tabindex="-1" aria-label="Scroll styles back">${icon('chevronUp', 12)}</button><button class="ft-wgal-next" type="button" tabindex="-1" aria-label="Scroll styles forward">${icon('chevronDown', 12)}</button><button class="ft-wgal-more" type="button" tabindex="-1" aria-label="More styles" aria-haspopup="listbox" aria-expanded="false">${icon('galleryMore', 12)}</button></div></div>`);
  const list = root.querySelector('.ft-wgal-list') as HTMLElement;
  const prev = root.querySelector('.ft-wgal-prev') as HTMLButtonElement;
  const next = root.querySelector('.ft-wgal-next') as HTMLButtonElement;
  const more = root.querySelector('.ft-wgal-more') as HTMLButtonElement;
  const tiles = new Map<string, HTMLButtonElement>();
  const popTiles = new Map<string, HTMLButtonElement>();
  const pop = new Pop('ft-wgal-pop');
  pop.root.setAttribute('role', 'listbox');
  pop.root.setAttribute('aria-label', 'Styles');
  const foot = el(`<div class="ft-wgal-foot"><button class="ft-wlist-row" type="button" data-a="create">${icon('styles', 16)}<span>Create a Style...</span></button><button class="ft-wlist-row" type="button" data-a="clear">${icon('clearFormat', 16)}<span>Clear Formatting</span></button><button class="ft-wlist-row" type="button" data-a="apply">${icon('paragraph', 16)}<span>Apply Styles...</span></button></div>`);
  pop.root.appendChild(foot);
  foot.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    pop.close();
    more.setAttribute('aria-expanded', 'false');
    if (a === 'create') run('format.styles', {});
    else if (a === 'clear') run('format.clear', {});
    else openPanel('applystyles', more, true);
  });
  let active = '';

  const arrows = (): void => {
    const max = list.scrollWidth - list.clientWidth;
    setDisabled(prev, list.scrollLeft <= 1);
    setDisabled(next, list.scrollLeft >= max - 1);
  };

  const tile = (id: string): HTMLButtonElement => {
    const look = STYLE_LOOK[id] ?? STYLE_LOOK.Normal;
    const t = el<HTMLButtonElement>(`<button class="ft-wtile" type="button" role="option" data-style="${id}" title="${styleName(id)}"><span class="ft-wtile-sample">AaBbCcDd</span><span class="ft-wtile-name"></span></button>`);
    const sample = t.querySelector('.ft-wtile-sample') as HTMLElement;
    sample.style.fontSize = `${look.size}px`;
    sample.style.fontWeight = String(look.weight);
    if (look.italic) sample.style.fontStyle = 'italic';
    if (look.muted) sample.style.color = 'var(--text-secondary)';
    if (look.tracking) sample.style.letterSpacing = `${look.tracking}em`;
    setText(t.querySelector('.ft-wtile-name'), styleName(id));
    return t;
  };

  const patch = (): void => {
    const ids = probe.styles();
    const want = new Set(ids);
    for (const id of ids) {
      if (!tiles.has(id)) {
        const t = tile(id);
        tiles.set(id, t);
        list.appendChild(t);
        const pt = tile(id);
        popTiles.set(id, pt);
        pop.root.insertBefore(pt, foot);
      }
    }
    const now = probe.style();
    for (const group of [tiles, popTiles]) {
      for (const [id, t] of group) {
        setHidden(t, !want.has(id));
        setClass(t, 'is-active', id === now);
        t.setAttribute('aria-selected', id === now ? 'true' : 'false');
      }
    }
    arrows();
    if (now !== active) {
      active = now;
      const t = tiles.get(now);
      if (t) {
        const l = t.offsetLeft;
        const r = l + t.offsetWidth;
        if (l < list.scrollLeft) list.scrollLeft = l;
        else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth;
      }
    }
  };

  const pick = (e: Event): void => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.ft-wtile');
    if (!t?.dataset.style) return;
    run('paragraph.style', { style: t.dataset.style });
    pop.close();
    more.setAttribute('aria-expanded', 'false');
  };
  list.addEventListener('click', pick);
  pop.root.addEventListener('click', pick);
  list.addEventListener('scroll', arrows, { passive: true });
  const step = (dir: number): void => { list.scrollBy({ left: dir * Math.max(68, list.clientWidth - 34), behavior: 'smooth' }); };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  more.addEventListener('click', () => {
    const on = pop.toggle(root);
    more.setAttribute('aria-expanded', String(on));
  });
  pop.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') more.setAttribute('aria-expanded', 'false'); });
  new ResizeObserver(arrows).observe(list);
  keepFocus(root);
  patch();
  probe.onChange(patch);
  return root;
}

const SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72'];
const ZOOMS = ['50%', '75%', '100%', '125%', '150%', '200%'];

const paraSpin = (o: { label: string; glyph: string; unit: 'in' | 'pt'; step: number; max: number; read: (p: ParaInfo) => number; key: string }): HTMLElement => {
  const k = o.unit === 'in' ? 72 : 1;
  const s = spin({
    label: o.label, glyph: o.glyph, unit: o.unit, step: o.step, min: 0, max: o.max,
    read: () => o.read(paraInfo()) / k,
    apply: (v) => run('paragraph.set', { [o.key]: v * k }),
  });
  let raf = 0;
  shellOnChange(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (s.root.offsetParent) s.patch(); }); });
  return s.root;
};

export function wordSlots(probe: Probe): Record<string, () => HTMLElement> {
  return {
    'style-gallery': () => gallery(probe),
    'sp-left': () => paraSpin({ label: 'Left:', glyph: 'indent', unit: 'in', step: 0.1, max: 22, read: (p) => p.left, key: 'indent' }),
    'sp-right': () => paraSpin({ label: 'Right:', glyph: 'outdent', unit: 'in', step: 0.1, max: 22, read: (p) => p.right, key: 'indentRight' }),
    'sp-before': () => paraSpin({ label: 'Before:', glyph: 'spaceBefore', unit: 'pt', step: 6, max: 1584, read: (p) => p.before, key: 'spaceBefore' }),
    'sp-after': () => paraSpin({ label: 'After:', glyph: 'spaceAfter', unit: 'pt', step: 6, max: 1584, read: (p) => p.after, key: 'spaceAfter' }),
    font: () => {
      const c = combo({
        cls: 'ft-wfont',
        label: 'Font',
        read: () => probe.font(),
        options: () => probe.fonts(),
        apply: (v) => run('format.font', { family: v }),
        preview: true,
        recentKey: 'formtxt.recentFonts',
        heads: ['Recently Used Fonts', 'All Fonts'],
      });
      probe.onChange(c.patch);
      return c.root;
    },
    size: () => {
      const c = combo({
        cls: 'ft-wsize',
        label: 'Font size',
        read: () => probe.size(),
        options: () => SIZES,
        apply: (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) run('format.size', { pt: n }); },
      });
      probe.onChange(c.patch);
      return c.root;
    },
    zoom: () => {
      let text = '100%';
      const c = combo({
        cls: 'ft-wzoom',
        label: 'Zoom',
        read: () => text,
        options: () => ZOOMS,
        apply: (v) => {
          const n = Math.round(Number(v.replace('%', '')));
          if (!Number.isFinite(n)) return;
          const pct = Math.max(25, Math.min(300, n));
          text = `${pct}%`;
          run('view.zoom', { percent: pct });
          c.patch();
        },
      });
      return c.root;
    },
  };
}
