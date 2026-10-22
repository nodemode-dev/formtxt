import type { DocEditor } from '../../../editor/editor';
import { commands as registry } from '../../../engine/registry';
import { el, escapeHtml, patchList, setChecked, setClass, setDisabled, setHidden, setStyleVar, setText, setValue } from '../../dom';
import { icon } from '../../icons';
import { onCmdStateChange, shellCommands } from '../cmd';
import { bi } from './icons-b';

export const env: { ed: DocEditor | null } = { ed: null };

export type Info = Record<string, any>;

export interface Ctl {
  root: HTMLElement;
  needs?: string[];
  patch?: (info: Info) => void;
}

export const run = (id: string, params?: Record<string, unknown>): void => { shellCommands.run(id, params); };
export const call = (id: string, params?: Record<string, unknown>): Promise<unknown> => registry.run(id, params ?? {});
export const has = (id: string): boolean => shellCommands.has(id);

const tracked: Ctl[] = [];
let raf = 0;
let busy = false;
let again = false;

const sweep = async (): Promise<void> => {
  if (busy) { again = true; return; }
  busy = true;
  try {
    const live = tracked.filter((c) => c.root.isConnected && c.root.getClientRects().length > 0);
    const ids = new Set<string>();
    for (const c of live) for (const n of c.needs ?? []) ids.add(n);
    const info: Info = {};
    await Promise.all(Array.from(ids).map(async (id) => {
      try { info[id] = registry.has(id) ? await registry.run(id, {}) : null; } catch { info[id] = null; }
    }));
    for (const c of live) c.patch?.(info);
  } finally {
    busy = false;
    if (again) { again = false; schedule(); }
  }
};

export function schedule(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; void sweep(); });
}

let wired = false;
const wire = (): void => {
  if (wired) return;
  wired = true;
  onCmdStateChange(schedule);
  document.addEventListener('click', () => schedule(), true);
  document.addEventListener('keyup', () => schedule(), true);
  window.addEventListener('resize', () => schedule());
};

export function track<T extends Ctl>(c: T): T {
  wire();
  tracked.push(c);
  if (c.patch) c.patch({});
  schedule();
  return c;
}

const keepFocus = (node: HTMLElement): void => {
  node.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT' && t.tagName !== 'SELECT' && t.tagName !== 'TEXTAREA') e.preventDefault();
  });
};

export const overlay = (): HTMLElement => document.getElementById('overlay-root') ?? document.body;

export class Pop {
  static current: Pop | null = null;
  readonly root: HTMLElement;
  anchor: HTMLElement | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(cls = '', private readonly host: HTMLElement | null = null) {
    this.root = el(`<div class="ft-rb-pop ft-bpop ${cls}" hidden></div>`);
    overlay().appendChild(this.root);
    keepFocus(this.root);
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!this.root.hidden && !this.root.contains(t) && !this.anchor?.contains(t) && !(t as HTMLElement).closest?.('.ft-popm.ft-bmenu')) this.close();
    }, true);
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); this.anchor?.focus(); } });
    window.addEventListener('resize', () => this.close());
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(anchor: HTMLElement): void {
    if (Pop.current && Pop.current !== this) Pop.current.close();
    Pop.current = this;
    this.anchor = anchor;
    this.onOpen?.();
    this.root.style.visibility = 'hidden';
    setHidden(this.root, false);
    const r = (this.host ?? anchor).getBoundingClientRect();
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4));
    const below = r.bottom + 2;
    const top = below + h <= window.innerHeight - 4 ? below : Math.max(4, Math.min(r.top - h - 2, window.innerHeight - h - 4));
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
    this.root.style.visibility = '';
    anchor.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    if (this.root.hidden) return;
    setHidden(this.root, true);
    this.anchor?.setAttribute('aria-expanded', 'false');
    if (Pop.current === this) Pop.current = null;
    this.onClose?.();
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) this.close(); else this.open(anchor);
  }
}

export type MI =
  | { sep: true }
  | { head: string }
  | { node: () => HTMLElement; key: string }
  | { label: string; icon?: string; run?: () => void; cmd?: string; params?: Record<string, unknown>; checked?: () => boolean; disabled?: () => boolean; sub?: MI[] | (() => MI[]); keys?: string; radio?: boolean };

const isSep = (i: MI): i is { sep: true } => 'sep' in i;
const isHead = (i: MI): i is { head: string } => 'head' in i;
const isNode = (i: MI): i is { node: () => HTMLElement; key: string } => 'node' in i;

export const SEP: MI = { sep: true };
export const cmdItem = (cmd: string, label?: string, params?: Record<string, unknown>, o: Partial<{ icon: string; checked: () => boolean }> = {}): MI => ({ label: label ?? '', cmd, params, ...o });

interface Row { item: Extract<MI, { label: string }>; node: HTMLButtonElement; subMenu?: BMenu }

export class BMenu {
  readonly panel: HTMLElement;
  private rows: Row[] = [];
  private sig = '';
  private openSub: BMenu | null = null;
  onClose: (() => void) | null = null;
  anchor: HTMLElement | null = null;

  constructor(private readonly spec: MI[] | (() => MI[]), private readonly parent: BMenu | null = null) {
    this.panel = el('<div class="ft-popm ft-bmenu" role="menu" hidden></div>');
    overlay().appendChild(this.panel);
    keepFocus(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    this.panel.addEventListener('keydown', (e) => this.onKey(e));
    if (!parent) document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.contains(e.target as Node) && !this.anchor?.contains(e.target as Node)) this.close(); }, true);
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  contains(t: Node): boolean { return this.panel.contains(t) || !!this.openSub?.contains(t); }

  private root(): BMenu { let m: BMenu = this; while (m.parent) m = m.parent; return m; }

  private onKey(e: KeyboardEvent): void {
    const items = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('.ft-pm-item:not(:disabled)'));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (items.length) items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1) + (at < 0 ? 1 : 0)) % items.length].focus();
    } else if (e.key === 'ArrowRight' && document.activeElement?.classList.contains('ft-pm-sub')) {
      e.preventDefault(); e.stopPropagation();
      (document.activeElement as HTMLElement).click();
      this.openSub?.panel.querySelector<HTMLButtonElement>('.ft-pm-item:not(:disabled)')?.focus();
    } else if (e.key === 'ArrowLeft' && this.parent) {
      e.preventDefault(); e.stopPropagation();
      this.close();
      this.parent.panel.querySelector<HTMLElement>('.ft-pm-sub.is-open')?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      const a = this.root().anchor;
      this.root().close();
      a?.focus();
    }
  }

  private items(): MI[] { return typeof this.spec === 'function' ? this.spec() : this.spec; }

  private signature(items: MI[]): string {
    return JSON.stringify(items.map((i) => {
      if (isSep(i)) return '-';
      if (isHead(i)) return `#${i.head}`;
      if (isNode(i)) return `@${i.key}`;
      return [i.label, i.icon ?? '', i.cmd ?? '', i.keys ?? '', i.sub ? 1 : 0, i.params ? JSON.stringify(i.params) : ''];
    }));
  }

  private build(items: MI[]): void {
    this.closeSub();
    for (const r of this.rows) r.subMenu?.panel.remove();
    this.panel.textContent = '';
    this.rows = [];
    const anyCheck = items.some((i) => !isSep(i) && !isHead(i) && !isNode(i) && (!!i.checked || (!!i.cmd && !!shellCommands.get(i.cmd)?.checked)));
    const anyIcon = items.some((i) => !isSep(i) && !isHead(i) && !isNode(i) && !!i.icon);
    setClass(this.panel, 'has-checks', anyCheck);
    setClass(this.panel, 'has-icons', anyIcon);
    for (const item of items) {
      if (isSep(item)) { this.panel.appendChild(el('<div class="ft-pm-sep" role="separator"></div>')); continue; }
      if (isHead(item)) { const h = el('<div class="ft-bm-head"></div>'); h.textContent = item.head; this.panel.appendChild(h); continue; }
      if (isNode(item)) { this.panel.appendChild(item.node()); continue; }
      const c = item.cmd ? shellCommands.get(item.cmd) : undefined;
      if (item.cmd && !c) continue;
      const label = item.label || (c ? shellCommands.label(c).replace(/\.\.\.$/, '') : '');
      const node = el<HTMLButtonElement>(`<button class="ft-pm-item${item.sub ? ' ft-pm-sub' : ''}" role="${item.radio ? 'menuitemradio' : 'menuitem'}" type="button"><span class="ft-pm-check">${icon(item.radio ? 'dots' : 'check', 14)}</span><span class="ft-bm-ic">${item.icon ? bi(item.icon, 16) : ''}</span><span class="ft-pm-label"></span><span class="ft-pm-keys">${item.sub ? icon('chevronRight', 12) : escapeHtml(item.keys ?? (c && !item.params ? shellCommands.keyLabel(c) : ''))}</span></button>`);
      setText(node.querySelector('.ft-pm-label'), label);
      const row: Row = { item, node };
      if (item.sub) {
        const sub = new BMenu(item.sub, this);
        row.subMenu = sub;
        node.setAttribute('aria-haspopup', 'menu');
        node.addEventListener('pointerenter', () => this.showSub(sub, node));
        node.addEventListener('click', () => this.showSub(sub, node));
      } else {
        node.addEventListener('pointerenter', () => this.closeSub());
        node.addEventListener('click', () => {
          this.root().close();
          if (item.run) item.run();
          else if (item.cmd) run(item.cmd, item.params);
        });
      }
      this.rows.push(row);
      this.panel.appendChild(node);
    }
  }

  private patch(): void {
    for (const r of this.rows) {
      const i = r.item;
      const c = i.cmd ? shellCommands.get(i.cmd) : undefined;
      if (!i.label && c) setText(r.node.querySelector('.ft-pm-label'), shellCommands.label(c).replace(/\.\.\.$/, ''));
      const off = i.disabled ? i.disabled() : c ? !shellCommands.enabled(c) : false;
      setDisabled(r.node, off && !i.sub);
      const on = i.checked ? i.checked() : c && !i.params ? !!c.checked?.() : false;
      setClass(r.node, 'is-checked', on);
      r.subMenu?.refresh();
    }
  }

  refresh(): void {
    const items = this.items();
    const s = this.signature(items);
    if (s !== this.sig) { this.sig = s; this.build(items); }
    else {
      this.rows.forEach((r) => { const cur = items.find((x) => !isSep(x) && !isHead(x) && !isNode(x) && x.label === r.item.label && x.cmd === r.item.cmd); if (cur && !isSep(cur) && !isHead(cur) && !isNode(cur)) r.item = cur; });
    }
    this.patch();
  }

  private showSub(menu: BMenu, row: HTMLElement): void {
    if (this.openSub === menu && menu.isOpen) return;
    this.closeSub();
    this.openSub = menu;
    setClass(row, 'is-open', true);
    menu.onClose = () => setClass(row, 'is-open', false);
    menu.refresh();
    menu.panel.style.visibility = 'hidden';
    menu.panel.hidden = false;
    const r = row.getBoundingClientRect();
    const w = menu.panel.offsetWidth, h = menu.panel.offsetHeight;
    const x = r.right - 2 + w <= window.innerWidth - 4 ? r.right - 2 : Math.max(4, r.left - w + 2);
    const y = Math.max(4, Math.min(r.top - 4, window.innerHeight - h - 4));
    menu.panel.style.left = `${Math.round(x)}px`;
    menu.panel.style.top = `${Math.round(y)}px`;
    menu.panel.style.visibility = '';
  }

  private closeSub(): void {
    const s = this.openSub;
    this.openSub = null;
    s?.close();
  }

  openAt(anchor: HTMLElement): void {
    this.anchor = anchor;
    this.refresh();
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    const r = anchor.getBoundingClientRect();
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
    const left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4));
    const below = r.bottom + 2;
    const top = below + h <= window.innerHeight - 4 ? below : Math.max(4, Math.min(r.top - h - 2, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
    anchor.setAttribute('aria-expanded', 'true');
    this.panel.querySelector<HTMLButtonElement>('.ft-pm-item:not(:disabled)')?.focus({ preventScroll: true });
  }

  close(): void {
    this.closeSub();
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.anchor?.setAttribute('aria-expanded', 'false');
    this.onClose?.();
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) this.close(); else this.openAt(anchor);
  }
}

export interface BtnOpt {
  label: string;
  icon: string;
  large?: boolean;
  text?: boolean;
  cmd?: string;
  params?: Record<string, unknown>;
  run?: () => void;
  menu?: MI[] | (() => MI[]);
  pop?: () => Pop;
  split?: boolean;
  checked?: (info: Info) => boolean;
  enabled?: (info: Info) => boolean;
  dyn?: (info: Info) => { label?: string; icon?: string } | null;
  needs?: string[];
  desc?: string;
  keep?: boolean;
}

const setIcon = (holder: Element | null, name: string, size: number): void => {
  if (!holder) return;
  const h = holder as HTMLElement;
  if (h.dataset.ic === name) return;
  h.dataset.ic = name;
  h.innerHTML = bi(name, size);
};

export function button(o: BtnOpt): Ctl {
  const large = !!o.large;
  const drop = !!(o.menu || o.pop);
  const attrs = `type="button" data-tip="1" data-label="${escapeHtml(o.label)}"${o.desc ? ` data-desc="${escapeHtml(o.desc)}"` : ''}${o.keep ? ' data-keep="1"' : ''} aria-label="${escapeHtml(o.label)}"`;
  let menu: BMenu | null = null;
  let pop: Pop | null = null;
  const toggleDrop = (anchor: HTMLElement): void => {
    if (o.pop) { pop ??= o.pop(); pop.toggle(anchor); return; }
    if (o.menu) { menu ??= new BMenu(o.menu); menu.toggle(anchor); }
  };
  const act = (): void => {
    if (o.run) o.run();
    else if (o.cmd) run(o.cmd, o.params);
  };
  let rootEl: HTMLElement;
  let main: HTMLButtonElement;
  let arrow: HTMLButtonElement | null = null;
  if (large && o.split && drop) {
    rootEl = el(`<span class="ft-bsplit"><button class="ft-rb-btn ft-bb-top" ${attrs}><span class="ft-bb-ic"></span></button><button class="ft-rb-btn ft-bb-bot" ${attrs.replace('data-tip="1"', 'data-tip="1" data-arrow="1"')} aria-haspopup="menu" aria-expanded="false"><span class="ft-bb-lbl"><span class="ft-bb-t"></span>&#8288;${icon('chevronDown', 10)}</span></button></span>`);
    main = rootEl.querySelector('.ft-bb-top') as HTMLButtonElement;
    arrow = rootEl.querySelector('.ft-bb-bot') as HTMLButtonElement;
    main.addEventListener('click', act);
    arrow.addEventListener('click', () => toggleDrop(arrow as HTMLElement));
  } else if (large) {
    rootEl = el(`<span class="ft-bslot"><button class="ft-rb-btn ft-bb" ${attrs}${drop ? ' aria-haspopup="menu" aria-expanded="false"' : ''}><span class="ft-bb-ic"></span><span class="ft-bb-lbl"><span class="ft-bb-t"></span>${drop ? `&#8288;${icon('chevronDown', 10)}` : ''}</span></button></span>`);
    main = rootEl.querySelector('button') as HTMLButtonElement;
    main.addEventListener('click', () => { if (drop) toggleDrop(main); else act(); });
  } else if (o.split && drop) {
    rootEl = el(`<span class="ft-bsplit-s"><button class="ft-rb-btn is-small${o.text ? ' has-text' : ''} ft-bs-main" ${attrs}><span class="ft-bs-ic"></span>${o.text ? '<span class="ft-rb-t"></span>' : ''}</button><button class="ft-rb-btn is-small ft-bs-arrow" type="button" data-tip="1" data-label="${escapeHtml(o.label)} options" aria-label="${escapeHtml(o.label)} options" aria-haspopup="menu" aria-expanded="false">${icon('chevronDown', 10)}</button></span>`);
    main = rootEl.querySelector('.ft-bs-main') as HTMLButtonElement;
    arrow = rootEl.querySelector('.ft-bs-arrow') as HTMLButtonElement;
    main.addEventListener('click', act);
    arrow.addEventListener('click', () => toggleDrop(arrow as HTMLElement));
  } else {
    rootEl = el(`<span class="ft-bslot-s"><button class="ft-rb-btn is-small${o.text ? ' has-text' : ''}" ${attrs}${drop ? ' aria-haspopup="menu" aria-expanded="false"' : ''}><span class="ft-bs-ic"></span>${o.text ? '<span class="ft-rb-t"></span>' : ''}${drop && o.text ? icon('chevronDown', 10) : ''}</button></span>`);
    main = rootEl.querySelector('button') as HTMLButtonElement;
    main.addEventListener('click', () => { if (drop) toggleDrop(main); else act(); });
  }
  const ic = rootEl.querySelector('.ft-bb-ic, .ft-bs-ic');
  const lbl = rootEl.querySelector('.ft-bb-t, .ft-rb-t');
  setIcon(ic, o.icon, large ? 28 : 16);
  if (lbl) setText(lbl, o.label);
  const labelled = Array.from(rootEl.querySelectorAll<HTMLElement>('[data-label]'));
  const patch = (info: Info): void => {
    const d = o.dyn?.(info) ?? null;
    const label = d?.label ?? o.label;
    if (main.dataset.label !== label && !arrow) {
      main.dataset.label = label;
      main.setAttribute('aria-label', label);
    }
    for (const n of labelled) if (!n.dataset.arrow && n.dataset.label !== label && !n.classList.contains('ft-bs-arrow')) { n.dataset.label = label; n.setAttribute('aria-label', label); }
    if (lbl && lbl.textContent !== label) setText(lbl, label);
    setIcon(ic, d?.icon ?? o.icon, large ? 28 : 16);
    const c = o.cmd ? shellCommands.get(o.cmd) : undefined;
    const off = o.enabled ? !o.enabled(info) : c ? !shellCommands.enabled(c) : false;
    for (const b of [main, arrow]) if (b) setDisabled(b, off && b === main ? true : off);
    const on = o.checked ? o.checked(info) : false;
    setClass(main, 'is-on', on);
    main.setAttribute('aria-pressed', o.checked ? String(on) : 'false');
    if (!o.checked) main.removeAttribute('aria-pressed');
  };
  return { root: rootEl, needs: o.needs, patch };
}

export function check(o: { label: string; get: (info: Info) => boolean; set: (on: boolean) => void; needs?: string[]; enabled?: (info: Info) => boolean; desc?: string; title?: string }): Ctl {
  const root = el<HTMLLabelElement>(`<label class="ft-bchk" data-tip="1" data-label="${escapeHtml(o.label)}"${o.desc ? ` data-desc="${escapeHtml(o.desc)}"` : ''}><input type="checkbox"><span class="ft-bchk-t"></span></label>`);
  const input = root.querySelector('input') as HTMLInputElement;
  setText(root.querySelector('.ft-bchk-t'), o.label);
  keepFocus(root);
  input.addEventListener('change', () => { o.set(input.checked); schedule(); });
  return {
    root,
    needs: o.needs,
    patch: (info) => {
      setChecked(input, !!o.get(info));
      const off = o.enabled ? !o.enabled(info) : false;
      setDisabled(input, off);
      setClass(root, 'is-off', off);
    },
  };
}

export function spinner(o: { label: string; icon?: string; min: number; max: number; step: number; decimals?: number; unit?: string; get: (info: Info) => number | null; set: (v: number) => void; needs?: string[]; enabled?: (info: Info) => boolean }): Ctl {
  const dec = o.decimals ?? 2;
  const root = el(`<span class="ft-bsp" data-tip="1" data-label="${escapeHtml(o.label)}"><span class="ft-bsp-l"></span><span class="ft-bsp-box"><input class="ft-bsp-in" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(o.label)}"><span class="ft-bsp-btns"><button class="ft-bsp-up" type="button" tabindex="-1" aria-label="Increase ${escapeHtml(o.label)}">${icon('chevronUp', 8)}</button><button class="ft-bsp-dn" type="button" tabindex="-1" aria-label="Decrease ${escapeHtml(o.label)}">${icon('chevronDown', 8)}</button></span></span></span>`);
  const input = root.querySelector('input') as HTMLInputElement;
  const up = root.querySelector('.ft-bsp-up') as HTMLButtonElement;
  const dn = root.querySelector('.ft-bsp-dn') as HTMLButtonElement;
  setText(root.querySelector('.ft-bsp-l'), o.label);
  let cur: number | null = null;
  const fmt = (v: number | null): string => (v === null || !Number.isFinite(v) ? '' : `${v.toFixed(dec)}${o.unit ?? ''}`);
  const clamp = (v: number): number => Math.max(o.min, Math.min(o.max, v));
  const commit = (v: number): void => {
    const n = clamp(Math.round(v * 10 ** dec) / 10 ** dec);
    cur = n;
    input.value = fmt(n);
    o.set(n);
    schedule();
  };
  const parse = (): number | null => { const m = input.value.replace(',', '.').match(/-?\d*\.?\d+/); return m ? Number(m[0]) : null; };
  const stepBy = (dir: number): void => { const base = cur ?? parse() ?? o.min; commit(base + dir * o.step); };
  up.addEventListener('click', () => stepBy(1));
  dn.addEventListener('click', () => stepBy(-1));
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = parse(); if (v !== null) commit(v); input.blur(); }
    else if (e.key === 'Escape') { input.value = fmt(cur); input.blur(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => { const v = parse(); if (v !== null && v !== cur && fmt(v) !== input.value.trim()) commit(v); else input.value = fmt(cur); });
  keepFocus(root);
  return {
    root,
    needs: o.needs,
    patch: (info) => {
      const v = o.get(info);
      cur = v;
      setValue(input, fmt(v));
      const off = o.enabled ? !o.enabled(info) : v === null;
      setDisabled(input, off);
      setDisabled(up, off);
      setDisabled(dn, off);
      setClass(root, 'is-off', off);
    },
  };
}

export const GREYS = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'];
export const HUES = ['#dc2626', '#f97316', '#facc15', '#16a34a', '#0d9488', '#2563eb', '#4f46e5', '#9333ea', '#db2777', '#78350f'];
export const STANDARD = ['#7f1d1d', '#dc2626', '#f97316', '#facc15', '#84cc16', '#16a34a', '#0ea5e9', '#2563eb', '#4f46e5', '#9333ea'];

export const mix = (hex: string, withHex: string, t: number): string => {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(withHex.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export interface PaletteOpt {
  onPick: (color: string) => void;
  none?: string;
  noneValue?: string;
  automatic?: { label: string; color: string };
  current?: () => string;
  extras?: Array<{ label: string; icon?: string; menu: MI[] | (() => MI[]) }>;
  more?: boolean;
}

export function palette(o: PaletteOpt): Pop {
  const pop = new Pop('ft-bpal');
  const rows = [GREYS, HUES, HUES.map((h) => mix(h, '#ffffff', 0.8)), HUES.map((h) => mix(h, '#ffffff', 0.55)), HUES.map((h) => mix(h, '#ffffff', 0.3)), HUES.map((h) => mix(h, '#000000', 0.25))];
  const sw = (c: string, extra = ''): string => `<button class="ft-bsw${extra}" type="button" data-c="${c}" style="--sw:${c}" title="${c}" aria-label="${c}" tabindex="-1"></button>`;
  const none = o.none ? `<button class="ft-bpal-line" type="button" data-none="1" tabindex="-1"><span class="ft-bpal-nosw"></span><span>${escapeHtml(o.none)}</span></button>` : '';
  const auto = o.automatic ? `<button class="ft-bpal-line" type="button" data-c="${o.automatic.color}" tabindex="-1"><span class="ft-bsw is-mini" style="--sw:${o.automatic.color}"></span><span>${escapeHtml(o.automatic.label)}</span></button>` : '';
  pop.root.innerHTML = `${auto}${none}<div class="ft-bpal-cap">Theme Colors</div><div class="ft-bpal-grid">${rows.map((r) => `<div class="ft-bpal-row">${r.map((c) => sw(c)).join('')}</div>`).join('')}</div><div class="ft-bpal-cap">Standard Colors</div><div class="ft-bpal-row">${STANDARD.map((c) => sw(c)).join('')}</div><div class="ft-bpal-foot"></div>`;
  const foot = pop.root.querySelector('.ft-bpal-foot') as HTMLElement;
  if (o.more !== false) foot.appendChild(el(`<label class="ft-bpal-line ft-bpal-more"><span class="ft-bpal-more-ic">${bi('palette', 16)}</span><span>More Colors...</span><input type="color" value="#2563eb" aria-label="More colors"></label>`));
  const menus: BMenu[] = [];
  for (const x of o.extras ?? []) {
    const b = el<HTMLButtonElement>(`<button class="ft-bpal-line" type="button" aria-haspopup="menu" tabindex="-1"><span class="ft-bpal-more-ic">${x.icon ? bi(x.icon, 16) : ''}</span><span>${escapeHtml(x.label)}</span><span class="ft-bpal-arrow">${icon('chevronRight', 12)}</span></button>`);
    const m = new BMenu(x.menu);
    menus.push(m);
    b.addEventListener('click', () => { const r = b.getBoundingClientRect(); m.openAt(b); m.panel.style.left = `${Math.min(r.right - 2, window.innerWidth - m.panel.offsetWidth - 4)}px`; m.panel.style.top = `${r.top - 4}px`; });
    foot.appendChild(b);
  }
  const pick = (c: string): void => { pop.close(); for (const m of menus) m.close(); o.onPick(c); };
  pop.root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest<HTMLElement>('[data-c], [data-none]');
    if (!b) return;
    if (b.dataset.none) pick(o.noneValue ?? '');
    else pick(b.dataset.c as string);
  });
  pop.root.querySelector<HTMLInputElement>('input[type="color"]')?.addEventListener('change', (e) => pick((e.target as HTMLInputElement).value));
  pop.onOpen = () => {
    const cur = (o.current?.() ?? '').toLowerCase();
    for (const b of Array.from(pop.root.querySelectorAll<HTMLElement>('.ft-bsw'))) setClass(b, 'is-on', !!cur && b.dataset.c === cur);
  };
  pop.onClose = () => { for (const m of menus) m.close(); };
  return pop;
}

export function colorButton(o: { label: string; icon: string; large?: boolean; text?: boolean; palette: PaletteOpt; swatch?: () => string; apply?: (color: string) => void; split?: boolean; needs?: string[]; enabled?: (info: Info) => boolean }): Ctl {
  let pop: Pop | null = null;
  let last = '';
  const base = button({
    label: o.label, icon: o.icon, large: o.large, text: o.text, split: o.split, needs: o.needs, enabled: o.enabled,
    run: () => { if (o.split && o.apply && last) o.apply(last); else if (pop) pop.toggle(base.root.querySelector('button') as HTMLElement); },
    pop: () => (pop ??= palette({ ...o.palette, onPick: (c) => { last = c || last; if (c) setStyleVar(base.root, '--sw', c); o.palette.onPick(c); } })),
  });
  base.root.classList.add('ft-bcolor');
  const prev = base.patch;
  base.patch = (info) => {
    prev?.(info);
    const c = o.swatch?.() ?? last;
    if (c) { setStyleVar(base.root, '--sw', c); if (!last) last = c; }
  };
  return base;
}

export interface GItem {
  id: string;
  name: string;
  thumb: () => HTMLElement | string;
  run: () => void;
  group?: string;
  title?: string;
  disabled?: boolean;
}

const mkTile = (g: GItem): HTMLButtonElement => {
  const b = el<HTMLButtonElement>(`<button class="ft-btile" type="button" data-id="${escapeHtml(g.id)}" data-tip="1" data-label="${escapeHtml(g.title ?? g.name)}" aria-label="${escapeHtml(g.title ?? g.name)}" tabindex="-1"><span class="ft-btile-t"></span></button>`);
  const t = g.thumb();
  const holder = b.querySelector('.ft-btile-t') as HTMLElement;
  if (typeof t === 'string') holder.innerHTML = t; else holder.appendChild(t);
  return b;
};

export interface GalleryOpt {
  label: string;
  items: GItem[] | (() => GItem[]);
  tw: number;
  th: number;
  popCols?: number;
  active?: (info: Info) => string | null;
  needs?: string[];
  footer?: MI[] | (() => MI[]);
  names?: boolean;
  enabled?: (info: Info) => boolean;
  popHead?: string;
}

class Tiles {
  readonly nodes = new Map<string, HTMLButtonElement>();
  constructor(readonly host: HTMLElement, private readonly onPick: (g: GItem) => void, private readonly names: boolean) {
    host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ft-btile');
      if (!b || b.disabled) return;
      const g = this.items.find((x) => x.id === b.dataset.id);
      if (g) this.onPick(g);
    });
  }
  items: GItem[] = [];
  set(items: GItem[]): void {
    const sig = items.map((i) => i.id + (i.disabled ? '!' : '')).join('|');
    if (sig === this.sig) { this.items = items; return; }
    this.sig = sig;
    this.items = items;
    const names = this.names;
    patchList(this.host, items, {
      key: (i) => i.id,
      create: (i) => { const b = mkTile(i); this.nodes.set(i.id, b); if (names) { const n = el('<span class="ft-btile-n"></span>'); n.textContent = i.name; b.appendChild(n); } return b; },
      update: (n, i) => { const b = n as HTMLButtonElement; setDisabled(b, !!i.disabled); },
    });
    for (const [id, n] of Array.from(this.nodes)) if (!n.isConnected) this.nodes.delete(id);
  }
  private sig = '';
  mark(id: string | null): void {
    for (const [k, n] of this.nodes) { const on = k === id; setClass(n, 'is-on', on); n.setAttribute('aria-pressed', String(on)); }
  }
}

const itemsOf = (o: GalleryOpt): GItem[] => (typeof o.items === 'function' ? o.items() : o.items);

interface Section { head: HTMLElement | null; grid: HTMLElement; tiles: Tiles }

export function galleryPop(o: GalleryOpt): { pop: Pop; refresh: (info: Info) => void; tiles: { mark: (id: string | null) => void } } {
  const pop = new Pop('ft-bgal-pop');
  const body = el('<div class="ft-bgal-pb"></div>');
  const foot = el('<div class="ft-bgal-foot"></div>');
  if (o.popHead) { const h = el('<div class="ft-bm-head"></div>'); h.textContent = o.popHead; pop.root.appendChild(h); }
  pop.root.append(body, foot);
  const sections = new Map<string, Section>();
  let marked: string | null = null;
  const sectionFor = (g: string): Section => {
    let s = sections.get(g);
    if (s) return s;
    const grid = el('<div class="ft-bgal-pg"></div>');
    setStyleVar(grid, '--tw', `${o.tw}px`);
    setStyleVar(grid, '--th', `${o.th}px`);
    setStyleVar(grid, '--cols', String(o.popCols ?? 5));
    let head: HTMLElement | null = null;
    if (g) { head = el('<div class="ft-bm-head"></div>'); head.textContent = g; }
    s = { head, grid, tiles: new Tiles(grid, (it) => { pop.close(); it.run(); }, !!o.names) };
    sections.set(g, s);
    return s;
  };
  const renderTiles = (): void => {
    const items = itemsOf(o);
    const order = Array.from(new Set(items.map((i) => i.group ?? '')));
    for (const g of order) {
      const s = sectionFor(g);
      s.tiles.set(items.filter((i) => (i.group ?? '') === g));
      if (s.head && s.head.parentElement !== body) body.appendChild(s.head);
      if (s.grid.parentElement !== body) body.appendChild(s.grid);
    }
    for (const [g, s] of Array.from(sections)) if (!order.includes(g)) { s.head?.remove(); s.grid.remove(); sections.delete(g); }
    for (const s of sections.values()) s.tiles.mark(marked);
  };
  const tiles = { mark: (id: string | null): void => { marked = id; for (const s of sections.values()) s.tiles.mark(id); } };
  const renderFoot = (): void => {
    if (!o.footer) return;
    const list = typeof o.footer === 'function' ? o.footer() : o.footer;
    const sig = JSON.stringify(list.map((i) => ('label' in i ? i.label : 'sep' in i ? '-' : '')));
    if (foot.dataset.sig !== sig) {
      foot.dataset.sig = sig;
      foot.textContent = '';
      for (const it of list) {
        if ('sep' in it) { foot.appendChild(el('<div class="ft-pm-sep"></div>')); continue; }
        if (!('label' in it)) continue;
        const c = it.cmd ? shellCommands.get(it.cmd) : undefined;
        if (it.cmd && !c) continue;
        const b = el<HTMLButtonElement>(`<button class="ft-bgal-fl" type="button" tabindex="-1"><span class="ft-bm-ic">${it.icon ? bi(it.icon, 16) : ''}</span><span></span></button>`);
        setText(b.lastElementChild, it.label || (c ? shellCommands.label(c) : ''));
        b.addEventListener('click', () => { pop.close(); if (it.run) it.run(); else if (it.cmd) run(it.cmd, it.params); });
        foot.appendChild(b);
      }
    }
  };
  pop.onOpen = () => { renderTiles(); renderFoot(); };
  return { pop, tiles, refresh: (info) => { if (pop.isOpen) tiles.mark(o.active?.(info) ?? null); } };
}

export function galleryButton(o: GalleryOpt & { icon: string; large?: boolean; text?: boolean; btnLabel?: string }): Ctl {
  const g = galleryPop(o);
  let activeId: string | null = null;
  const b = button({
    label: o.btnLabel ?? o.label, icon: o.icon, large: o.large, text: o.text, needs: o.needs, enabled: o.enabled,
    pop: () => g.pop,
  });
  const prev = b.patch;
  b.patch = (info) => {
    prev?.(info);
    activeId = o.active?.(info) ?? null;
    g.tiles.mark(activeId);
  };
  const open = g.pop.onOpen;
  g.pop.onOpen = () => { open?.(); g.tiles.mark(activeId); };
  return b;
}

export function galleryInline(o: GalleryOpt): Ctl {
  const root = el(`<div class="ft-bgal ft-wgal" role="group" aria-label="${escapeHtml(o.label)}"><div class="ft-bgal-view"><div class="ft-bgal-grid"></div></div><div class="ft-bgal-nav"><button class="ft-bgal-up" type="button" tabindex="-1" aria-label="Scroll ${escapeHtml(o.label)} up">${icon('chevronUp', 10)}</button><button class="ft-bgal-dn" type="button" tabindex="-1" aria-label="Scroll ${escapeHtml(o.label)} down">${icon('chevronDown', 10)}</button><button class="ft-bgal-more" type="button" tabindex="-1" aria-label="More ${escapeHtml(o.label)}" aria-haspopup="true" aria-expanded="false">${icon('galleryMore', 12)}</button></div></div>`);
  setStyleVar(root, '--tw', `${o.tw}px`);
  setStyleVar(root, '--th', `${o.th}px`);
  const view = root.querySelector('.ft-bgal-view') as HTMLElement;
  const grid = root.querySelector('.ft-bgal-grid') as HTMLElement;
  const up = root.querySelector('.ft-bgal-up') as HTMLButtonElement;
  const dn = root.querySelector('.ft-bgal-dn') as HTMLButtonElement;
  const more = root.querySelector('.ft-bgal-more') as HTMLButtonElement;
  const tiles = new Tiles(grid, (g) => g.run(), !!o.names);
  const gp = galleryPop(o);
  const arrows = (): void => {
    setDisabled(up, view.scrollTop <= 1);
    setDisabled(dn, view.scrollTop >= view.scrollHeight - view.clientHeight - 1);
  };
  const step = (dir: number): void => { view.scrollBy({ top: dir * (o.th + 2), behavior: 'smooth' }); };
  up.addEventListener('click', () => step(-1));
  dn.addEventListener('click', () => step(1));
  more.addEventListener('click', () => gp.pop.toggle(root));
  view.addEventListener('scroll', arrows, { passive: true });
  const fit = (): void => {
    const room = root.clientHeight;
    if (!room) return;
    const row = o.th + 8;
    const rows = Math.max(1, Math.floor((room - 2) / row));
    setStyleVar(view, 'height', `${rows * row + 2}px`);
    arrows();
  };
  new ResizeObserver(fit).observe(root);
  keepFocus(root);
  let activeId: string | null = null;
  gp.pop.onClose = () => more.setAttribute('aria-expanded', 'false');
  const open = gp.pop.onOpen;
  gp.pop.onOpen = () => { open?.(); gp.tiles.mark(activeId); more.setAttribute('aria-expanded', 'true'); };
  const count = (n: number): void => setStyleVar(root, '--bn', String(Math.max(1, n)));
  tiles.set(itemsOf(o));
  count(tiles.items.length);
  return {
    root,
    needs: o.needs,
    patch: (info) => {
      tiles.set(itemsOf(o));
      count(tiles.items.length);
      activeId = o.active?.(info) ?? null;
      tiles.mark(activeId);
      gp.tiles.mark(activeId);
      const off = o.enabled ? !o.enabled(info) : false;
      setClass(root, 'is-off', off);
      for (const n of tiles.nodes.values()) if (off) n.disabled = true;
      arrows();
    },
  };
}

export function group3x3(o: { label: string; cells: Array<{ id: string; name: string; icon: string }>; run: (id: string) => void; active?: (info: Info) => string | null; needs?: string[]; enabled?: (info: Info) => boolean }): Ctl {
  const root = el(`<div class="ft-b33" role="group" aria-label="${escapeHtml(o.label)}">${o.cells.map((c) => `<button class="ft-rb-btn ft-b33-c" type="button" data-id="${c.id}" data-tip="1" data-label="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}" tabindex="-1">${bi(c.icon, 16)}</button>`).join('')}</div>`);
  root.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ft-b33-c'); if (b && !b.disabled) { o.run(b.dataset.id as string); schedule(); } });
  const nodes = Array.from(root.querySelectorAll<HTMLButtonElement>('.ft-b33-c'));
  return {
    root,
    needs: o.needs,
    patch: (info) => {
      const act = o.active?.(info) ?? null;
      const off = o.enabled ? !o.enabled(info) : false;
      for (const n of nodes) { setClass(n, 'is-on', n.dataset.id === act); setDisabled(n, off); }
    },
  };
}

export function field(o: { label: string; value: () => string; set: (v: string) => void; width?: number; align?: 'center'; needs?: string[]; enabled?: (info: Info) => boolean; get?: (info: Info) => string; numeric?: boolean }): Ctl {
  const root = el(`<span class="ft-bfield" data-tip="1" data-label="${escapeHtml(o.label)}"><input class="ft-bfield-in" type="text" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(o.label)}"${o.numeric ? ' inputmode="numeric"' : ''}></span>`);
  const input = root.querySelector('input') as HTMLInputElement;
  if (o.width) setStyleVar(root, '--w', `${o.width}px`);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); o.set(input.value); input.blur(); } else if (e.key === 'Escape') { input.value = o.value(); input.blur(); } });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('blur', () => { if (input.value !== o.value()) o.set(input.value); });
  keepFocus(root);
  return {
    root,
    needs: o.needs,
    patch: (info) => {
      setValue(input, o.get ? o.get(info) : o.value());
      setDisabled(input, o.enabled ? !o.enabled(info) : false);
    },
  };
}

export function composite(root: HTMLElement, parts: Ctl[]): Ctl {
  for (const p of parts) root.appendChild(p.root);
  const needs = Array.from(new Set(parts.flatMap((p) => p.needs ?? [])));
  return { root, needs, patch: (info) => { for (const p of parts) p.patch?.(info); } };
}

export const inch = (pt: number): number => pt / 72;
export const pts = (inches: number): number => inches * 72;

export const ed = (): DocEditor => {
  if (!env.ed) throw new Error('Open a document first.');
  return env.ed;
};

export const stack = (...rows: HTMLElement[]): HTMLElement => {
  const s = el('<span class="ft-bstack"></span>');
  for (const r of rows) s.appendChild(r);
  return s;
};

export const wrapRow = (...parts: HTMLElement[]): HTMLElement => {
  const r = el('<span class="ft-brow"></span>');
  for (const p of parts) r.appendChild(p);
  return r;
};
