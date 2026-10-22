import { el, setClass, setHidden, setStyleVar, setText, setValue } from '../dom';
import { icon } from '../icons';
import { shellCommands } from './cmd';

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

interface ComboOptions {
  cls: string;
  label: string;
  read: () => string;
  options: () => string[];
  apply: (value: string) => void;
  decorate?: (node: HTMLElement, value: string) => void;
}

function combo(o: ComboOptions): { root: HTMLElement; patch: () => void } {
  const root = el(`<div class="ft-wcombo ${o.cls}"><input class="ft-wcombo-in" type="text" spellcheck="false" autocomplete="off" aria-label="${o.label}" title="${o.label}"><button class="ft-wcombo-btn" type="button" tabindex="-1" aria-label="${o.label} list">${icon('chevronDown', 12)}</button></div>`);
  const input = root.querySelector('input') as HTMLInputElement;
  const btn = root.querySelector('button') as HTMLButtonElement;
  const pop = new Pop(`ft-wlist ${o.cls}-pop`);
  const rows = new Map<string, HTMLButtonElement>();

  const sync = (): void => {
    const current = o.read();
    for (const v of o.options()) {
      let row = rows.get(v);
      if (!row) {
        row = el<HTMLButtonElement>('<button class="ft-wlist-row" type="button" role="option"></button>');
        row.textContent = v;
        row.dataset.v = v;
        o.decorate?.(row, v);
        rows.set(v, row);
        pop.root.appendChild(row);
      }
    }
    for (const [v, row] of rows) setClass(row, 'is-active', v === current);
  };

  const commit = (v: string): void => {
    const value = v.trim();
    if (value) o.apply(value);
    pop.close();
  };

  pop.root.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.ft-wlist-row');
    if (row?.dataset.v !== undefined) commit(row.dataset.v);
  });
  btn.addEventListener('click', () => { sync(); pop.toggle(root); });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(input.value); input.blur(); }
    else if (e.key === 'Escape') { setValue(input, o.read()); pop.close(); input.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sync(); pop.open(root); }
  });
  input.addEventListener('blur', () => { if (input.value !== o.read()) input.value = o.read(); });

  const patch = (): void => {
    setValue(input, o.read());
    if (pop.isOpen) for (const [v, row] of rows) setClass(row, 'is-active', v === o.read());
  };
  patch();
  return { root, patch };
}

const mix = (hex: string, with_: string, t: number): string => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(with_.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

const GREYS = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'];
const HUES = ['#dc2626', '#f97316', '#facc15', '#16a34a', '#0d9488', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#78350f'];
const HILITES = ['#fde047', '#86efac', '#67e8f9', '#f9a8d4', '#fdba74', '#c4b5fd', '#fca5a5', '#bef264', '#a5f3fc', '#e5e7eb'];

interface SplitOptions {
  cls: string;
  label: string;
  glyph: string;
  cmd: string;
  initial: string;
  rows: string[][];
  none: string;
}

function split(o: SplitOptions): HTMLElement {
  const root = el(`<div class="ft-wsplit ${o.cls}"><button class="ft-wsplit-main" type="button" aria-label="${o.label}" title="${o.label}">${icon(o.glyph, 16)}<span class="ft-wsplit-bar"></span></button><button class="ft-wsplit-arrow" type="button" tabindex="-1" aria-label="${o.label} colours">${icon('chevronDown', 12)}</button></div>`);
  const main = root.querySelector('.ft-wsplit-main') as HTMLButtonElement;
  const arrow = root.querySelector('.ft-wsplit-arrow') as HTMLButtonElement;
  const bar = root.querySelector('.ft-wsplit-bar') as HTMLElement;
  const pop = new Pop('ft-wcolors');
  let current = o.initial;
  setStyleVar(bar, '--sw', current);

  const grids = o.rows.map((row) => `<div class="ft-wcolors-row">${row.map((c) => `<button class="ft-wswatch" type="button" data-c="${c}" style="--sw:${c}" title="${c}" aria-label="${c}"></button>`).join('')}</div>`).join('');
  pop.root.innerHTML = `<div class="ft-wcolors-grid">${grids}</div><div class="ft-wcolors-foot"><button class="ft-wcolors-none" type="button" data-none>${o.none}</button><label class="ft-wcolors-custom">More colours<input type="color" value="${current}" aria-label="Custom colour"></label></div>`;
  const custom = pop.root.querySelector('input') as HTMLInputElement;

  const pick = (c: string): void => {
    if (c) { current = c; setStyleVar(bar, '--sw', c); }
    run(o.cmd, { value: c });
    pop.close();
  };
  main.addEventListener('click', () => run(o.cmd, { value: current }));
  arrow.addEventListener('click', () => pop.toggle(root));
  pop.root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const sw = t.closest<HTMLElement>('.ft-wswatch');
    if (sw?.dataset.c) pick(sw.dataset.c);
    else if (t.closest('[data-none]')) pick('');
  });
  custom.addEventListener('change', () => pick(custom.value));
  keepFocus(root);
  return root;
}

const STYLE_LOOK: Record<string, { size: number; weight: number; italic?: boolean; muted?: boolean; tracking?: number }> = {
  Normal: { size: 12, weight: 400 },
  NoSpacing: { size: 12, weight: 400 },
  Title: { size: 17, weight: 300, tracking: -0.01 },
  Subtitle: { size: 11, weight: 400, muted: true },
  Quote: { size: 12, weight: 400, italic: true },
  Heading1: { size: 15, weight: 700 },
  Heading2: { size: 13.5, weight: 700 },
  Heading3: { size: 12.5, weight: 700 },
  Heading4: { size: 12, weight: 600 },
  Heading5: { size: 12, weight: 500 },
  Heading6: { size: 12, weight: 500, italic: true },
  Heading7: { size: 11.5, weight: 500, italic: true },
  Heading8: { size: 11.5, weight: 400, italic: true },
  Heading9: { size: 11, weight: 400, italic: true },
};

const styleName = (id: string): string => id.replace(/([a-z])(\d)/g, '$1 $2').replace(/([a-z])([A-Z])/g, '$1 $2');

function gallery(probe: Probe): HTMLElement {
  const root = el(`<div class="ft-wgal"><div class="ft-wgal-list" role="listbox" aria-label="Styles"></div><div class="ft-wgal-nav"><button class="ft-wgal-prev" type="button" tabindex="-1" aria-label="Previous styles">${icon('chevronUp', 12)}</button><button class="ft-wgal-next" type="button" tabindex="-1" aria-label="More styles">${icon('chevronDown', 12)}</button></div></div>`);
  const list = root.querySelector('.ft-wgal-list') as HTMLElement;
  const tiles = new Map<string, HTMLButtonElement>();
  let active = '';

  const tile = (id: string): HTMLButtonElement => {
    const look = STYLE_LOOK[id] ?? STYLE_LOOK.Normal;
    const t = el<HTMLButtonElement>(`<button class="ft-wtile" type="button" role="option" data-style="${id}" title="${styleName(id)}"><span class="ft-wtile-sample">AaBbCc</span><span class="ft-wtile-name"></span></button>`);
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
      if (!tiles.has(id)) { const t = tile(id); tiles.set(id, t); list.appendChild(t); }
    }
    const now = probe.style();
    for (const [id, t] of tiles) {
      setHidden(t, !want.has(id));
      setClass(t, 'is-active', id === now);
      t.setAttribute('aria-selected', id === now ? 'true' : 'false');
    }
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

  list.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.ft-wtile');
    if (t?.dataset.style) run('paragraph.style', { style: t.dataset.style });
  });
  const step = (dir: number): void => { list.scrollBy({ left: dir * list.clientWidth * 0.8, behavior: 'smooth' }); };
  (root.querySelector('.ft-wgal-prev') as HTMLElement).addEventListener('click', () => step(-1));
  (root.querySelector('.ft-wgal-next') as HTMLElement).addEventListener('click', () => step(1));
  keepFocus(root);
  patch();
  probe.onChange(patch);
  return root;
}

const SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];
const SPACINGS: Array<[string, number]> = [['1.0', 1], ['1.15', 1.15], ['1.5', 1.5], ['2.0', 2], ['2.5', 2.5], ['3.0', 3], ['Match style', 0]];
const ZOOMS = ['50%', '75%', '100%', '125%', '150%', '200%'];

function lineSpacing(): HTMLElement {
  const root = el(`<div class="ft-wsplit ft-wspacing"><button class="ft-wspacing-main" type="button" aria-label="Line and paragraph spacing" title="Line and paragraph spacing">${icon('paraSpacing', 16)}${icon('chevronDown', 12)}</button></div>`);
  const btn = root.querySelector('button') as HTMLButtonElement;
  const pop = new Pop('ft-wlist ft-wspacing-pop');
  pop.root.innerHTML = `<div class="ft-wlist-head">Line spacing</div>${SPACINGS.map(([n, v]) => `<button class="ft-wlist-row" type="button" data-v="${v}">${n}</button>`).join('')}`;
  pop.root.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.ft-wlist-row');
    if (row?.dataset.v === undefined) return;
    run('paragraph.lineSpacing', { value: Number(row.dataset.v) });
    pop.close();
  });
  btn.addEventListener('click', () => pop.toggle(root));
  keepFocus(root);
  return root;
}

export function wordSlots(probe: Probe): Record<string, () => HTMLElement> {
  return {
    'style-gallery': () => gallery(probe),
    font: () => {
      const c = combo({
        cls: 'ft-wfont',
        label: 'Font',
        read: () => probe.font(),
        options: () => probe.fonts(),
        apply: (v) => run('format.font', { family: v }),
        decorate: (n, v) => { n.style.fontFamily = `"${v}", var(--font-ui)`; },
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
    'font-color': () => split({ cls: 'ft-wfontcolor', label: 'Font colour', glyph: 'textColor', cmd: 'format.color', initial: '#dc2626', none: 'Automatic', rows: [GREYS, HUES, HUES.map((h) => mix(h, '#ffffff', 0.8)), HUES.map((h) => mix(h, '#ffffff', 0.55)), HUES.map((h) => mix(h, '#000000', 0.25))] }),
    highlight: () => split({ cls: 'ft-whighlight', label: 'Text highlight colour', glyph: 'highlighter', cmd: 'format.highlight', initial: '#fde047', none: 'No colour', rows: [HILITES] }),
    'line-spacing': () => lineSpacing(),
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
