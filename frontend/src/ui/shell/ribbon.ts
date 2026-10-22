import { el, escapeHtml, setClass, setDisabled, setHidden, setStyleVar } from '../dom';
import { icon } from '../icons';
import type { Commands } from './cmd';
import type { TipHost } from './key-tips';
import { ActionMenu, PopupMenu, type MenuRow } from './menu';
import { iconOf, plainLabel, richTip, tipOf, type Qat } from './qat';
import { openPanel, panelEnabled, registerAllPanels, warmAllPanels } from './controls';
import type { GroupDef, Item, MenuItem, Rows, TabDef, Unit } from './types';

export type { GroupDef, Item, MenuItem, Rows, TabDef, Unit };

export const RIBBON_KEY = 'formtxt.ribbon';

export interface CustomGroup { id: string; label: string; cmds: string[] }
export interface CustomTab { id: string; label: string; groups: CustomGroup[] }
export interface RibbonConfig { hiddenTabs: string[]; hiddenGroups: string[]; custom: CustomTab[] }
export interface RibbonOpts {
  tabs: TabDef[];
  slots: Record<string, () => HTMLElement>;
  act: (act: string, anchor: HTMLElement) => void;
  onFile: () => void;
  customize: (what: 'ribbon' | 'qat') => void;
  qatHost: () => HTMLElement | null;
  after?: () => void;
  simple?: HTMLElement;
}

interface Step { lv: number; gal: number }
interface Meas { rev: number; steps: Step[]; w: number[] }
interface Saved extends Partial<RibbonConfig> { collapsed?: boolean; simplified?: boolean; compact?: boolean; tab?: string }

const readJson = <T,>(key: string): Partial<T> => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as Partial<T>) : {}; } catch { return {}; }
};

const parseParams = (b: HTMLElement): Record<string, unknown> | undefined => {
  const raw = b.dataset.params;
  if (!raw) return undefined;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return undefined; }
};

export interface GalleryTile { cmd: string; params?: Record<string, unknown>; label: string; glyph: string; group?: string }

export function buildGallery(commands: Commands, o: { label: string; tiles: GalleryTile[] }): HTMLElement {
  const tile = (t: GalleryTile): string => `<button class="ft-rb-btn ft-gal-tile" type="button" data-tip="1" data-cmd="${escapeHtml(t.cmd)}"${t.params ? ` data-params="${escapeHtml(JSON.stringify(t.params))}"` : ''} data-label="${escapeHtml(t.label)}" aria-label="${escapeHtml(t.label)}"><span class="ft-gal-glyph">${t.glyph}</span><span class="ft-gal-name">${escapeHtml(t.label)}</span></button>`;
  const node = el(`<div class="ft-gal ft-rb-slot" role="group" aria-label="${escapeHtml(o.label)}"><div class="ft-gal-view"><div class="ft-gal-strip">${o.tiles.map(tile).join('')}</div></div><div class="ft-gal-nav"><button class="ft-gal-nb" type="button" data-n="prev" aria-label="Previous">${icon('chevronUp', 12)}</button><button class="ft-gal-nb" type="button" data-n="next" aria-label="Next">${icon('chevronDown', 12)}</button><button class="ft-gal-nb" type="button" data-n="more" aria-label="More" aria-haspopup="dialog" aria-expanded="false">${icon('moreH', 12)}</button></div></div>`);
  const view = node.querySelector('.ft-gal-view') as HTMLElement;
  let pop: HTMLElement | null = null;
  const close = (): void => { if (pop && !pop.hidden) { pop.hidden = true; node.querySelector('[data-n="more"]')?.setAttribute('aria-expanded', 'false'); } };
  const open = (anchor: HTMLElement): void => {
    if (!pop) {
      pop = el('<div class="ft-rb-pop ft-gal-pop" role="dialog" tabindex="0" hidden></div>');
      pop.setAttribute('aria-label', o.label);
      const groups = new Map<string, GalleryTile[]>();
      for (const t of o.tiles) groups.set(t.group ?? '', [...(groups.get(t.group ?? '') ?? []), t]);
      pop.innerHTML = Array.from(groups).map(([g, list]) => `${g ? `<div class="ft-rb-pop-head">${escapeHtml(g)}</div>` : ''}<div class="ft-gal-grid">${list.map(tile).join('')}</div>`).join('');
      (document.getElementById('overlay-root') ?? document.body).appendChild(pop);
      pop.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
      pop.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
        if (!b) return;
        close();
        commands.run(b.dataset.cmd as string, parseParams(b));
      });
      richTip().attach(pop, (n) => tipOf(commands, n));
      document.addEventListener('pointerdown', (e) => { const t = e.target as Node; if (pop && !pop.hidden && !pop.contains(t) && !node.contains(t)) close(); }, true);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop && !pop.hidden) { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); } }, true);
    }
    if (!pop.hidden) { close(); return; }
    for (const b of Array.from(pop.querySelectorAll<HTMLButtonElement>('[data-cmd]'))) {
      const c = commands.get(b.dataset.cmd as string);
      setDisabled(b, !!c && !commands.enabled(c));
      setClass(b, 'is-on', !b.dataset.params && !!c?.checked?.());
    }
    anchor.setAttribute('aria-expanded', 'true');
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = `${Math.round(Math.min(Math.max(r.left, 4), window.innerWidth - w - 4))}px`;
    pop.style.top = `${Math.round(r.bottom + 4 + h <= window.innerHeight - 4 ? r.bottom + 4 : Math.max(4, r.top - h - 4))}px`;
    pop.querySelector<HTMLElement>('.is-on, button:not(:disabled)')?.focus();
  };
  node.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
  node.querySelector('.ft-gal-nav')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-n]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.n === 'more') open(b);
    else view.scrollLeft += (b.dataset.n === 'next' ? 1 : -1) * Math.max(60, view.clientWidth - 30);
  });
  return node;
}

export class Ribbon {
  readonly root: HTMLElement;
  collapsed = false;
  simplified = false;
  compact = false;
  tab = '';
  config: RibbonConfig = { hiddenTabs: [], hiddenGroups: [], custom: [] };
  private float = false;
  private readonly tabsEl: HTMLElement;
  private readonly body: HTMLElement;
  private readonly list: HTMLElement;
  private readonly simple: HTMLElement;
  private readonly tabBtns = new Map<string, HTMLButtonElement>();
  private readonly panels = new Map<string, HTMLElement>();
  private readonly defs = new Map<string, TabDef>();
  private readonly ctxShown = new Set<string>();
  private readonly rover = new Map<HTMLElement, HTMLElement>();
  private readonly menus = new Map<string, PopupMenu>();
  private readonly menuItems = new Map<string, MenuItem[]>();
  private readonly closedAt = new Map<string, number>();
  private readonly actions = new ActionMenu();
  private readonly collapseBtn: HTMLButtonElement;
  private readonly displayBtn: HTMLButtonElement;
  private readonly fileBtn: HTMLButtonElement;
  private mark = '';
  private readonly gpop: HTMLElement;
  private popGroup: HTMLElement | null = null;
  private readonly meas = new WeakMap<HTMLElement, Meas>();
  private rev = 0;
  private fitKey = '';
  private fitRaf = 0;
  private syncRaf = 0;
  private look = '';
  private firstTab = '';

  constructor(host: HTMLElement, private readonly commands: Commands, readonly qat: Qat, private readonly opts: RibbonOpts) {
    const s = readJson<Saved>(RIBBON_KEY);
    this.collapsed = !!s.collapsed;
    this.simplified = !!s.simplified;
    this.compact = !!s.compact;
    this.config = { hiddenTabs: Array.isArray(s.hiddenTabs) ? s.hiddenTabs : [], hiddenGroups: Array.isArray(s.hiddenGroups) ? s.hiddenGroups : [], custom: Array.isArray(s.custom) ? s.custom : [] };
    this.firstTab = opts.tabs.find((t) => !t.ctx)?.id ?? opts.tabs[0]?.id ?? '';
    this.tab = typeof s.tab === 'string' ? s.tab : this.firstTab;
    this.root = el(`<div class="ft-rb">
<div class="ft-rb-tabs"><button class="ft-rb-file" type="button" aria-label="File">File</button><div class="ft-rb-tablist" role="tablist" aria-label="Ribbon tabs"></div><div class="ft-rb-tools"><button class="ft-rb-tool" type="button" data-tool="display" aria-haspopup="menu" aria-expanded="false" aria-label="Ribbon display options" data-tip="1" data-label="Ribbon display options">${icon('ribbon', 14)}</button><button class="ft-rb-tool" type="button" data-tool="collapse" aria-expanded="true" aria-label="Collapse the ribbon" data-tip="1" data-label="Collapse the ribbon" data-desc="Show only the tab names. Click a tab to show its commands.">${icon('chevronUp', 14)}</button></div></div>
<div class="ft-rb-body"></div>
</div>`);
    this.tabsEl = this.root.querySelector('.ft-rb-tabs') as HTMLElement;
    this.list = this.root.querySelector('.ft-rb-tablist') as HTMLElement;
    this.body = this.root.querySelector('.ft-rb-body') as HTMLElement;
    this.fileBtn = this.root.querySelector('.ft-rb-file') as HTMLButtonElement;
    this.collapseBtn = this.root.querySelector('[data-tool="collapse"]') as HTMLButtonElement;
    this.displayBtn = this.root.querySelector('[data-tool="display"]') as HTMLButtonElement;
    this.gpop = el('<div class="ft-rb-gpop" role="toolbar" hidden></div>');
    this.root.appendChild(this.gpop);
    this.simple = opts.simple ?? el('<div class="ft-rb-simple" role="toolbar" aria-label="Simplified ribbon" hidden></div>');
    const qh = opts.qatHost();
    if (qh) qh.prepend(qat.node); else this.root.insertBefore(qat.node, this.tabsEl);
    host.append(this.root, this.simple);
    for (const t of opts.tabs) this.buildTab(t);
    this.buildCustom();
    if (!opts.simple) this.buildSimple();
    this.wire();
    qat.onContext = (id, x, y) => this.contextMenu(id, x, y);
    qat.onMore = (a) => this.qatMenu(a);
    qat.onChange = () => this.opts.after?.();
    qat.render();
    registerAllPanels();
    warmAllPanels();
    this.applyVisibility();
    if (!this.defs.has(this.tab) || this.tabHidden(this.tab)) this.tab = this.firstTab;
    this.showTab(this.tab);
    this.applyMode();
    this.watchLayout();
  }

  private watchLayout(): void {
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fit()).observe(this.body);
    const bump = (): void => { this.rev++; this.queueFit(); };
    document.fonts?.addEventListener?.('loadingdone', bump);
    this.look = this.lookKey();
    const check = (): void => { const k = this.lookKey(); if (k !== this.look) { this.look = k; bump(); } };
    new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  private lookKey(): string {
    const cs = getComputedStyle(document.body);
    return `${document.body.className}|${document.documentElement.className}|${document.documentElement.dataset.theme}|${cs.fontFamily}|${cs.fontSize}|${getComputedStyle(document.documentElement).getPropertyValue('--ctl-sm')}`;
  }

  private watchSlot(n: HTMLElement): void {
    const bump = (): void => { this.rev++; this.queueFit(); };
    new MutationObserver(bump).observe(n, { childList: true, subtree: true });
    new MutationObserver(bump).observe(n, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }

  private wire(): void {
    richTip().attach(this.root, (n) => tipOf(this.commands, n));
    richTip().attach(this.simple, (n) => tipOf(this.commands, n));
    this.simple.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.ft-rb-btn')) e.preventDefault(); });
    this.simple.addEventListener('click', (e) => this.onClick(e));
    this.simple.addEventListener('contextmenu', (e) => { e.preventDefault(); this.contextMenu((e.target as HTMLElement).closest<HTMLElement>('.ft-rb-btn[data-cmd]')?.dataset.cmd ?? null, e.clientX, e.clientY); });
    this.root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.ft-rb-btn, .ft-rb-tool, .ft-rb-file')) e.preventDefault(); });
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('.ft-rb-tab')) this.setCollapsed(!this.collapsed); });
    this.root.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      e.preventDefault();
      const b = (e.target as HTMLElement).closest<HTMLElement>('.ft-rb-btn[data-cmd]');
      this.contextMenu(b?.dataset.cmd ?? null, e.clientX, e.clientY);
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      const panel = t.closest<HTMLElement>('.ft-rb-panel');
      if (panel && (t instanceof HTMLButtonElement || t instanceof HTMLInputElement)) this.setRove(panel, t);
    });
    this.root.addEventListener('wheel', (e) => {
      const sc = (e.target as HTMLElement).closest<HTMLElement>('.ft-rb-body');
      if (sc && Math.abs(e.deltaY) > Math.abs(e.deltaX)) sc.scrollLeft += e.deltaY;
    }, { passive: true });
    const keepOpen = '.ft-popm, .ft-rb-pop, .ft-dd-pop, .ft-pop, .ft-flyout, .ft-scrim';
    document.addEventListener('pointerdown', (e) => { const t = e.target as HTMLElement; if (this.popGroup && !this.gpop.contains(t) && !t.closest?.(`.ft-rb-gbtn, ${keepOpen}`)) this.closePop(false); }, true);
    this.root.addEventListener('focusout', (e) => { const to = e.relatedTarget as HTMLElement | null; if (this.popGroup && to && !this.gpop.contains(to) && !to.closest(`.ft-rb-gbtn, ${keepOpen}`)) this.closePop(false); });
    document.addEventListener('pointerdown', (e) => { if (this.float && !this.root.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(keepOpen)) this.setFloat(false); }, true);
  }

  private buildTab(def: TabDef): void {
    this.defs.set(def.id, def);
    const tab = el<HTMLButtonElement>(`<button class="ft-rb-tab${def.ctx ? ' is-ctx' : ''}" type="button" role="tab" id="ft-rbt-${def.id}" aria-controls="ft-rbp-${def.id}" aria-selected="false" tabindex="-1" data-tab="${def.id}"></button>`);
    tab.textContent = def.label;
    const panel = el(`<div class="ft-rb-panel" role="tabpanel" id="ft-rbp-${def.id}" aria-labelledby="ft-rbt-${def.id}" data-tab="${def.id}" hidden></div>`);
    if (def.custom) { tab.dataset.custom = '1'; panel.dataset.custom = '1'; }
    for (const g of def.groups) {
      const node = this.buildGroup(def, g);
      if (node) panel.appendChild(node);
    }
    for (const n of Array.from(panel.querySelectorAll<HTMLElement>('button, input'))) n.setAttribute('tabindex', '-1');
    this.tabBtns.set(def.id, tab);
    this.panels.set(def.id, panel);
    this.list.appendChild(tab);
    this.body.appendChild(panel);
  }

  private buildGroup(tab: TabDef, g: GroupDef): HTMLElement | null {
    const label = escapeHtml(g.label);
    const node = el(`<div class="ft-rb-group" role="toolbar" aria-label="${label}" data-g="${tab.id}.${g.id}"><button class="ft-rb-btn ft-rb-gbtn is-large" type="button" data-group="1" data-tip="1" data-label="${label}" aria-haspopup="true" aria-expanded="false" aria-label="${label}"><span class="ft-rb-ic">${icon(g.icon ?? this.groupIcon(g), 28)}</span><span class="ft-rb-lbl"><span>${label}</span>${icon('chevronDown', 10)}</span></button><div class="ft-rb-gbody"></div><div class="ft-rb-glabel" aria-hidden="true">${label}</div></div>`);
    if (g.rank) node.dataset.rank = String(g.rank);
    const body = node.querySelector('.ft-rb-gbody') as HTMLElement;
    let maxRows = 0;
    for (const u of g.units) {
      if ('rows' in u) {
        const col = el('<div class="ft-rb-stack"></div>');
        let n = 0;
        for (const r of u.rows) {
          const row = el('<div class="ft-rb-row"></div>');
          for (const it of r) { const x = this.item(it, false); if (x) row.appendChild(x); }
          if (row.childElementCount) { col.appendChild(row); n++; }
        }
        if (col.childElementCount) { body.appendChild(col); maxRows = Math.max(maxRows, n); }
      } else {
        const n = this.item(u, true);
        if (n) body.appendChild(n);
      }
    }
    if (body.querySelector(':scope > .is-large')) node.dataset.big = '1';
    node.dataset.n = maxRows > 0 && maxRows <= 2 ? '2' : '3';
    if (g.launcher && this.commands.has(g.launcher)) {
      const lb = el<HTMLButtonElement>(`<button class="ft-rb-launch" type="button" data-cmd="${escapeHtml(g.launcher)}" data-ic0="launcher" data-tip="1" aria-label="${label}">${icon('launcher', 10)}</button>`);
      lb.dataset.label = plainLabel(this.commands, g.launcher);
      node.dataset.launch = '1';
      node.appendChild(lb);
    }
    return body.childElementCount ? node : null;
  }

  private groupIcon(g: GroupDef): string {
    for (const u of g.units) {
      for (const it of 'rows' in u ? u.rows.flat() : [u]) {
        if (it.k === 'slot') continue;
        if (it.k === 'cmd') return iconOf(this.commands.get(it.id), it.id, it.icon);
        if (it.icon) return it.icon;
      }
    }
    return 'more';
  }

  private item(it: Item, large: boolean): HTMLElement | null {
    if (it.k === 'slot') {
      const make = this.opts.slots[it.id];
      const n = make ? make() : null;
      if (n) { if (!n.classList.contains('ft-rb-slot')) n.classList.add('ft-rb-slot'); this.watchSlot(n); }
      return n;
    }
    if (it.k === 'sep') return el('<span class="ft-rb-sep ft-rb-isep" aria-hidden="true"></span>');
    if (it.k === 'pop' || it.k === 'split') return this.popItem(it, large);
    const cmd = it.k === 'cmd' ? this.commands.get(it.id) : undefined;
    if (it.k === 'cmd' && !cmd) return null;
    const label = it.label ?? (it.k === 'cmd' ? plainLabel(this.commands, it.id) : it.id);
    const ic = it.k === 'cmd' ? iconOf(cmd, it.id, it.icon) : it.icon ?? 'more';
    const params = it.params ? ` data-params="${escapeHtml(JSON.stringify(it.params))}"` : '';
    const attrs = it.k === 'cmd' ? `data-cmd="${escapeHtml(it.id)}"${params}` : it.k === 'act' ? `data-act="${escapeHtml(it.id)}" aria-haspopup="true"` : `data-menu="${escapeHtml(it.id)}" aria-haspopup="menu" aria-expanded="false"`;
    const drop = it.k === 'menu' || it.k === 'act';
    if (it.k === 'menu') this.menuItems.set(it.id, it.items ?? []);
    const cls = `ft-rb-btn${large ? ' is-large' : ' is-small'}${it.text ? ' has-text' : ''}${it.swatch ? ' ft-rb-color' : ''}${large && label.trim().split(/\s+/).length <= 2 ? ' is-w2' : ''}`;
    const common = `type="button" ${attrs}${it.keep ? ' data-keep="1"' : ''} data-tip="1" data-label="${escapeHtml(it.title ?? label)}" data-ic="${ic}" data-ic0="${escapeHtml(it.icon ?? '')}"${it.label ? '' : ' data-dyn="1"'} aria-label="${escapeHtml(label)}"`;
    if (large) return el(`<button class="${cls}" ${common}><span class="ft-rb-ic">${icon(ic, 28)}</span><span class="ft-rb-lbl"><span>${escapeHtml(label)}</span>${drop ? `&#8288;${icon('chevronDown', 10)}` : ''}</span></button>`);
    return el(`<button class="${cls}" ${common}><span class="ft-rb-ic">${icon(ic, 16)}</span>${it.text ? `<span class="ft-rb-t">${escapeHtml(label)}</span>` : ''}${drop && it.text ? icon('chevronDown', 10) : ''}</button>`);
  }

  private popItem(it: Item, large: boolean): HTMLElement | null {
    const split = it.k === 'split';
    if (split && !this.commands.has(it.id)) return null;
    const pop = split ? (it.pop as string) : it.id;
    const label = it.label ?? it.id;
    const ic = it.icon ?? 'more';
    const tip = `data-tip="1" data-label="${escapeHtml(it.title ?? label)}" aria-label="${escapeHtml(label)}"`;
    const drop = `data-pop="${escapeHtml(pop)}" aria-haspopup="true" aria-expanded="false"`;
    const chev = icon('chevronDown', 10);
    const swatch = it.swatch ? ' ft-rb-color' : '';
    const text = it.text ? ' has-text' : '';
    if (!split) {
      if (large) return el(`<button class="ft-rb-btn is-large${label.trim().split(/\s+/).length <= 2 ? ' is-w2' : ''}" type="button" ${drop} ${tip} data-ic="${ic}" data-ic0="${escapeHtml(ic)}"><span class="ft-rb-ic">${icon(ic, 28)}</span><span class="ft-rb-lbl"><span>${escapeHtml(label)}</span>&#8288;${chev}</span></button>`);
      return el(`<button class="ft-rb-btn is-small${text}" type="button" ${drop} ${tip} data-ic="${ic}" data-ic0="${escapeHtml(ic)}"><span class="ft-rb-ic">${icon(ic, 16)}</span>${it.text ? `<span class="ft-rb-t">${escapeHtml(label)}</span>` : ''}${chev}</button>`);
    }
    const params = it.params ? ` data-params="${escapeHtml(JSON.stringify(it.params))}"` : '';
    const sv = it.swatchValue ? ` style="--swatch:${escapeHtml(it.swatchValue)}"` : '';
    const main = `type="button" data-cmd="${escapeHtml(it.id)}"${params}${it.keep ? ' data-keep="1"' : ''} ${tip} data-ic="${ic}" data-ic0="${escapeHtml(ic)}"${sv}`;
    if (large) return el(`<div class="ft-rb-split is-large" role="group" aria-label="${escapeHtml(label)}"><button class="ft-rb-btn ft-rb-sm is-large${swatch}" ${main}><span class="ft-rb-ic">${icon(ic, 28)}</span></button><button class="ft-rb-btn ft-rb-sd is-large" type="button" ${drop} data-tip="1" data-label="${escapeHtml(label)} options" aria-label="${escapeHtml(label)} options"><span class="ft-rb-lbl"><span>${escapeHtml(label)}</span>&#8288;${chev}</span></button></div>`);
    return el(`<div class="ft-rb-split is-small" role="group" aria-label="${escapeHtml(label)}"><button class="ft-rb-btn ft-rb-sm is-small${text}${swatch}" ${main}><span class="ft-rb-ic">${icon(ic, 16)}</span>${it.text ? `<span class="ft-rb-t">${escapeHtml(label)}</span>` : ''}</button><button class="ft-rb-btn ft-rb-sd is-small" type="button" ${drop} data-tip="1" data-label="${escapeHtml(label)} options" aria-label="${escapeHtml(label)} options">${chev}</button></div>`);
  }

  private buildSimple(): void {
    this.simple.appendChild(el(`<button class="ft-rb-btn is-small" type="button" data-act="ribbon-full" data-tip="1" data-label="Show the full ribbon" aria-label="Show the full ribbon">${icon('ribbon', 16)}</button>`));
    const def = this.defs.get(this.firstTab);
    if (!def) return;
    for (const g of def.groups) {
      const frag = document.createDocumentFragment();
      for (const u of g.units) {
        for (const it of 'rows' in u ? u.rows.flat() : [u]) {
          if (it.k === 'slot' || it.k === 'sep') continue;
          const n = this.item({ ...it, text: false, swatch: it.swatch }, false);
          if (n) frag.appendChild(n);
        }
      }
      if (frag.childElementCount) { this.simple.appendChild(el('<span class="ft-rb-sep" aria-hidden="true"></span>')); this.simple.appendChild(frag); }
    }
    for (const n of Array.from(this.simple.querySelectorAll<HTMLElement>('button'))) n.setAttribute('tabindex', '0');
  }

  private buildCustom(): void {
    for (const n of Array.from(this.root.querySelectorAll('[data-custom]'))) n.remove();
    for (const [id, d] of Array.from(this.defs)) if (d.custom) { this.defs.delete(id); this.tabBtns.delete(id); this.panels.delete(id); }
    const firstCtx = this.list.querySelector('.is-ctx');
    for (const c of this.config.custom) {
      const def: TabDef = { id: c.id, label: c.label, custom: true, groups: c.groups.map((g) => ({ id: g.id, label: g.label, units: g.cmds.map((id): Item => ({ k: 'cmd', id })) })) };
      this.buildTab(def);
      const btn = this.tabBtns.get(c.id) as HTMLButtonElement;
      if (firstCtx) this.list.insertBefore(btn, firstCtx);
    }
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const tab = t.closest<HTMLButtonElement>('.ft-rb-tab');
    if (tab) {
      const id = tab.dataset.tab as string;
      if (this.collapsed) { this.setFloat(this.float && this.tab === id ? false : true); this.select(id); } else this.select(id);
      return;
    }
    if (t.closest('.ft-rb-file')) { this.setFloat(false); this.opts.onFile(); return; }
    const tool = t.closest<HTMLButtonElement>('.ft-rb-tool');
    if (tool) {
      if (tool.dataset.tool === 'collapse') this.setCollapsed(!this.collapsed);
      else this.displayMenu(tool);
      return;
    }
    const b = t.closest<HTMLButtonElement>('.ft-rb-btn, .ft-rb-launch');
    if (!b || b.disabled) return;
    if (b.dataset.group) { this.openPop(b.closest('.ft-rb-group') as HTMLElement); return; }
    if (b.dataset.pop) { openPanel(b.dataset.pop, b, e.detail === 0); return; }
    if (b.dataset.cmd) this.commands.run(b.dataset.cmd, parseParams(b));
    else if (b.dataset.act === 'ribbon-full') { this.setSimplified(false); return; }
    else if (b.dataset.act) this.opts.act(b.dataset.act, b);
    else if (b.dataset.menu) { this.openMenu(b); return; }
    if (this.popGroup && b.dataset.cmd && this.gpop.contains(b)) this.closePop(false);
    if (this.float) this.setFloat(false);
    this.opts.after?.();
    this.refresh();
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === 'Escape' && this.popGroup) { e.preventDefault(); e.stopPropagation(); this.closePop(true); return; }
    if (t.closest('.ft-rb-tablist')) this.tabKey(e);
    else if (t.closest('.ft-rb-gpop')) this.popKey(e);
    else if (t.closest('.ft-rb-panel')) this.panelKey(e);
    if (e.key === 'Escape' && this.float) { this.setFloat(false); this.tabBtns.get(this.tab)?.focus(); }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
  }

  private visibleTabs(): string[] {
    return Array.from(this.list.children).filter((n) => !(n as HTMLElement).hidden).map((n) => (n as HTMLElement).dataset.tab as string);
  }

  private tabKey(e: KeyboardEvent): void {
    const ids = this.visibleTabs();
    const at = ids.indexOf((e.target as HTMLElement).dataset.tab as string);
    if (at < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (at + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (at + ids.length - 1) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.collapsed && !this.float) this.setFloat(true);
      this.select(ids[at]);
      this.focusPanel();
      return;
    } else return;
    e.preventDefault();
    this.select(ids[next]);
    this.tabBtns.get(ids[next])?.focus();
  }

  private panelKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const panel = t.closest('.ft-rb-panel') as HTMLElement;
    if (e.key === 'ArrowDown' && t.dataset.group) { e.preventDefault(); this.openPop(t.closest('.ft-rb-group') as HTMLElement); return; }
    if (e.key === 'ArrowUp' && !(t instanceof HTMLInputElement)) { e.preventDefault(); this.tabBtns.get(this.tab)?.focus(); return; }
    if (!(t instanceof HTMLButtonElement) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const all = this.controls(panel);
    const at = all.indexOf(t);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length;
    all[next].focus();
  }

  private controls(panel: HTMLElement): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')).filter((n) => !n.closest('[hidden]') && (panel === this.gpop ? !n.dataset.group : n.dataset.group ? n.closest('.ft-rb-group')?.getAttribute('data-lv') === '3' : !n.closest('.ft-rb-group[data-lv="3"]')));
  }

  private popKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || t instanceof HTMLInputElement || (vertical && t.closest('.ft-dd-btn'))) return;
    const all = this.controls(this.gpop);
    const at = all.indexOf(t);
    if (at < 0) return;
    e.preventDefault();
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    all[e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (fwd ? 1 : all.length - 1)) % all.length].focus();
  }

  private openPop(g: HTMLElement): void {
    if (this.popGroup === g) { this.closePop(true); return; }
    this.closePop(false);
    const gbtn = g.querySelector('.ft-rb-gbtn') as HTMLElement;
    const body = g.querySelector('.ft-rb-gbody') as HTMLElement;
    this.popGroup = g;
    this.gpop.setAttribute('aria-label', g.getAttribute('aria-label') ?? '');
    this.gpop.dataset.n = g.dataset.n ?? '3';
    this.gpop.appendChild(body);
    gbtn.setAttribute('aria-expanded', 'true');
    setHidden(this.gpop, false);
    this.placePop();
    this.sync();
    this.controls(this.gpop)[0]?.focus();
  }

  private placePop(): void {
    const g = this.popGroup;
    if (!g) return;
    const r = g.getBoundingClientRect();
    const w = this.gpop.offsetWidth;
    this.gpop.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - w - 4)))}px`;
    this.gpop.style.top = `${Math.round(r.bottom)}px`;
    this.gpop.tabIndex = this.gpop.scrollWidth > this.gpop.clientWidth ? 0 : -1;
  }

  private closePop(focusBtn: boolean): void {
    const g = this.popGroup;
    if (!g) return;
    const body = this.gpop.firstElementChild as HTMLElement | null;
    const had = this.gpop.contains(document.activeElement);
    if (body) g.insertBefore(body, g.querySelector('.ft-rb-glabel'));
    this.popGroup = null;
    setHidden(this.gpop, true);
    const gbtn = g.querySelector<HTMLElement>('.ft-rb-gbtn');
    gbtn?.setAttribute('aria-expanded', 'false');
    if ((focusBtn || had) && gbtn && g.dataset.lv === '3') gbtn.focus();
  }

  private setRove(panel: HTMLElement, t: HTMLElement): void {
    const prev = this.rover.get(panel);
    if (prev === t) return;
    prev?.setAttribute('tabindex', '-1');
    t.setAttribute('tabindex', '0');
    this.rover.set(panel, t);
  }

  private ensureRove(panel: HTMLElement): void {
    const cur = this.rover.get(panel);
    if (cur && !(cur as HTMLButtonElement).disabled && !cur.closest('[hidden]')) return;
    const first = this.controls(panel)[0];
    if (first) this.setRove(panel, first);
  }

  focusPanel(): void {
    const panel = this.panels.get(this.tab);
    if (!panel) return;
    this.ensureRove(panel);
    (this.rover.get(panel) ?? this.controls(panel)[0])?.focus();
  }

  tipHost(): TipHost {
    return {
      ready: () => !this.simplified && !this.root.hidden && this.root.isConnected,
      file: () => this.fileBtn,
      qat: () => Array.from(this.qat.node.querySelectorAll<HTMLElement>('button:not(:disabled)')).filter((n) => !n.closest('[hidden]')),
      tabs: () => this.visibleTabs().map((id) => ({ id, node: this.tabBtns.get(id) as HTMLElement })),
      open: (id) => { if (this.collapsed) this.setFloat(true); this.select(id); },
      controls: () => { const p = this.popGroup ? this.gpop : this.panels.get(this.tab); return p && !this.body.hidden ? this.controls(p) : []; },
      close: () => { this.closePop(false); if (this.float) this.setFloat(false); },
    };
  }

  private openMenu(b: HTMLButtonElement): void {
    const key = b.dataset.menu as string;
    let m = this.menus.get(key);
    if (!m) {
      m = new PopupMenu(this.commands, null, true);
      this.menus.set(key, m);
    }
    m.onClose = () => { this.closedAt.set(key, performance.now()); b.setAttribute('aria-expanded', 'false'); };
    if (m.isOpen) { m.close(); return; }
    if (performance.now() - (this.closedAt.get(key) ?? 0) < 250) return;
    m.setItems(this.menuItems.get(key) ?? []);
    const r = b.getBoundingClientRect();
    m.openAt(r.left, r.bottom + 2, true);
    b.setAttribute('aria-expanded', 'true');
  }

  private displayMenu(anchor: HTMLElement): void {
    if (this.actions.isOpen) { this.actions.close(false); return; }
    const rows: MenuRow[] = [
      { label: 'Always Show Ribbon', checked: !this.collapsed && !this.simplified, run: () => { this.setSimplified(false); this.setCollapsed(false); } },
      { label: 'Show Tabs Only', checked: this.collapsed && !this.simplified, run: () => { this.setSimplified(false); this.setCollapsed(true); } },
      { label: 'Simplified Ribbon', checked: this.simplified, run: () => this.setSimplified(true) },
      { label: '', sep: true },
      { label: 'Icons-Only Ribbon', checked: this.compact, run: () => this.setCompact(!this.compact) },
      { label: '', sep: true },
      { label: 'Customize the Ribbon...', run: () => this.opts.customize('ribbon') },
      { label: 'Customize Quick Access Toolbar...', run: () => this.opts.customize('qat') },
    ];
    const r = anchor.getBoundingClientRect();
    this.actions.open(rows, r.right - 220, r.bottom + 2, anchor);
  }

  private contextMenu(id: string | null, x: number, y: number): void {
    const rows: MenuRow[] = [];
    if (id) {
      const on = this.qat.has(id);
      rows.push({ label: on ? 'Remove from Quick Access Toolbar' : 'Add to Quick Access Toolbar', run: () => this.qat.toggle(id) }, { label: '', sep: true });
    }
    rows.push(
      { label: 'Customize Quick Access Toolbar...', run: () => this.opts.customize('qat') },
      { label: '', sep: true },
      { label: 'Customize the Ribbon...', run: () => this.opts.customize('ribbon') },
      { label: this.collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon', run: () => this.setCollapsed(!this.collapsed) },
      { label: 'Icons-Only Ribbon', checked: this.compact, run: () => this.setCompact(!this.compact) },
      { label: 'Simplified Ribbon', checked: this.simplified, run: () => this.setSimplified(!this.simplified) },
    );
    this.actions.open(rows, x, y);
  }

  private qatMenu(anchor: HTMLElement): void {
    if (this.actions.isOpen) { this.actions.close(false); return; }
    const rows: MenuRow[] = this.qat.common.filter((id) => !!this.commands.get(id)).map((id) => ({ label: plainLabel(this.commands, id), checked: this.qat.has(id), run: () => this.qat.toggle(id) }));
    rows.push({ label: '', sep: true }, { label: 'More Commands...', run: () => this.opts.customize('qat') }, { label: this.collapsed ? 'Show Quick Access Toolbar Below the Ribbon' : 'Customize the Ribbon...', run: () => this.opts.customize('ribbon') }, { label: this.collapsed ? 'Expand the Ribbon' : 'Collapse the Ribbon', run: () => this.setCollapsed(!this.collapsed) });
    const r = anchor.getBoundingClientRect();
    this.actions.open(rows, r.left, r.bottom + 2, anchor);
  }

  private tabHidden(id: string): boolean {
    const d = this.defs.get(id);
    return !d || this.config.hiddenTabs.includes(id) || (!!d.ctx && !this.ctxShown.has(d.ctx));
  }

  private applyVisibility(): void {
    let ctxFirst = true;
    for (const node of Array.from(this.list.children)) {
      const btn = node as HTMLButtonElement;
      const id = btn.dataset.tab as string;
      const hide = this.tabHidden(id);
      setHidden(btn, hide);
      const first = !hide && ctxFirst && !!this.defs.get(id)?.ctx;
      if (first) ctxFirst = false;
      setClass(btn, 'is-ctx-first', first);
    }
    for (const panel of this.panels.values()) {
      for (const g of Array.from(panel.querySelectorAll<HTMLElement>('.ft-rb-group'))) setHidden(g, this.config.hiddenGroups.includes(g.dataset.g as string));
    }
    const key = Array.from(this.tabBtns).map(([id, b]) => (b.hidden ? '' : id)).join('|');
    if (key !== this.mark) { this.mark = key; this.rev++; if (this.tabBtns.get(this.tab)?.hidden) this.select(this.firstTab); }
  }

  showContext(ctx: string, on: boolean): void {
    if (this.ctxShown.has(ctx) === on) return;
    if (on) this.ctxShown.add(ctx); else this.ctxShown.delete(ctx);
    this.applyVisibility();
  }

  setContexts(ctxs: string[]): void {
    const want = new Set(ctxs);
    let changed = false;
    for (const c of Array.from(this.ctxShown)) if (!want.has(c)) { this.ctxShown.delete(c); changed = true; }
    for (const c of want) if (!this.ctxShown.has(c)) { this.ctxShown.add(c); changed = true; }
    if (changed) this.applyVisibility();
  }

  setTabLabel(id: string, label: string): void {
    const btn = this.tabBtns.get(id);
    if (btn && btn.textContent !== label) btn.textContent = label;
  }

  select(id: string): void {
    if (!this.defs.has(id) || this.tabBtns.get(id)?.hidden) return;
    this.showTab(id);
    this.persist();
    this.sync();
  }

  private showTab(id: string): void {
    if (this.tab !== id) this.closePop(false);
    this.tab = id;
    for (const [tid, btn] of this.tabBtns) {
      const on = tid === id;
      if ((btn.getAttribute('aria-selected') === 'true') !== on) btn.setAttribute('aria-selected', String(on));
      const want = on ? '0' : '-1';
      if (btn.getAttribute('tabindex') !== want) btn.setAttribute('tabindex', want);
      setClass(btn, 'is-on', on);
      const p = this.panels.get(tid);
      if (p) setHidden(p, !on);
    }
    this.fit();
  }

  setCollapsed(on: boolean): void {
    this.collapsed = on;
    if (!on) this.float = false;
    this.applyMode();
    this.persist();
    this.sync();
  }

  private setFloat(on: boolean): void {
    if (this.float === on) return;
    this.float = on;
    this.applyMode();
    this.sync();
  }

  setCompact(on: boolean): void {
    if (this.compact === on) return;
    this.compact = on;
    this.rev++;
    this.applyMode();
    this.persist();
    this.sync();
    this.opts.after?.();
  }

  setSimplified(on: boolean): void {
    this.simplified = on;
    this.applyMode();
    this.persist();
    this.sync();
    this.opts.after?.();
  }

  private applyMode(): void {
    setClass(this.root, 'is-collapsed', this.collapsed);
    setClass(this.root, 'is-float', this.collapsed && this.float);
    setClass(this.root, 'is-compact', this.compact);
    setHidden(this.root, this.simplified);
    setHidden(this.simple, !this.simplified);
    this.collapseBtn.setAttribute('aria-expanded', String(!this.collapsed));
    const lbl = this.collapsed ? 'Pin the ribbon' : 'Collapse the ribbon';
    if (this.collapseBtn.dataset.label !== lbl) {
      this.collapseBtn.dataset.label = lbl;
      this.collapseBtn.setAttribute('aria-label', lbl);
      this.collapseBtn.dataset.desc = this.collapsed ? 'Always keep the ribbon expanded.' : 'Show only the tab names. Click a tab to show its commands.';
    }
    const ic = this.collapsed ? 'pin' : 'chevronUp';
    if (this.collapseBtn.dataset.ic !== ic) { this.collapseBtn.dataset.ic = ic; this.collapseBtn.innerHTML = icon(ic, 14); }
    setHidden(this.body, this.collapsed && !this.float);
    if (this.simplified || this.body.hidden) this.closePop(false);
    this.fit();
    setStyleVar(document.documentElement, '--ft-ribbon-mode', this.simplified ? 'simple' : this.collapsed ? 'tabs' : this.compact ? 'compact' : 'full');
  }

  syncMode(): void { this.applyMode(); }

  refresh(): void {
    if (this.syncRaf) return;
    this.syncRaf = requestAnimationFrame(() => { this.syncRaf = 0; this.sync(); });
  }

  sync(): void {
    this.qat.sync();
    if (this.simplified) { this.patch(Array.from(this.simple.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))); return; }
    const panel = this.panels.get(this.tab);
    if (!panel || panel.hidden || this.body.hidden) return;
    const live = Array.from(panel.querySelectorAll<HTMLButtonElement>('button[data-cmd]'));
    if (this.popGroup) live.push(...Array.from(this.gpop.querySelectorAll<HTMLButtonElement>('button[data-cmd]')));
    this.patch(live);
    this.ensureRove(panel);
  }

  private patch(live: HTMLButtonElement[]): void {
    let relabel = false;
    const host: ParentNode = this.simplified ? this.simple : this.panels.get(this.tab) ?? this.root;
    for (const b of Array.from(host.querySelectorAll<HTMLButtonElement>('button[data-pop]'))) setDisabled(b, !panelEnabled(b.dataset.pop as string));
    if (this.popGroup) for (const b of Array.from(this.gpop.querySelectorAll<HTMLButtonElement>('button[data-pop]'))) setDisabled(b, !panelEnabled(b.dataset.pop as string));
    for (const b of live) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !b.dataset.params && !!cmd.checked?.());
      if (b.classList.contains('ft-rb-launch') || b.classList.contains('ft-gal-tile')) continue;
      if (b.dataset.dyn) {
        const label = plainLabel(this.commands, cmd.id);
        if (b.dataset.label !== label) {
          b.dataset.label = label;
          b.setAttribute('aria-label', label);
          const t = b.querySelector('.ft-rb-t, .ft-rb-lbl > span:first-child');
          if (t && t.textContent !== label) { t.textContent = label; relabel = true; }
        }
      }
      const ic = iconOf(cmd, cmd.id, b.dataset.ic0 || undefined);
      if (b.dataset.ic !== ic) {
        b.dataset.ic = ic;
        const holder = b.querySelector('.ft-rb-ic');
        if (holder) holder.innerHTML = icon(ic, b.classList.contains('is-large') ? 28 : 16);
      }
    }
    if (relabel) { this.rev++; this.queueFit(); }
  }

  private queueFit(): void {
    if (this.fitRaf) return;
    this.fitRaf = requestAnimationFrame(() => { this.fitRaf = 0; this.fit(); });
  }

  private fit(): void {
    if (this.simplified || this.root.hidden || this.body.hidden) return;
    const panel = this.panels.get(this.tab);
    const cw = this.body.clientWidth;
    if (!panel || panel.hidden || cw <= 0) return;
    const cs = getComputedStyle(panel);
    const avail = cw - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1;
    const groups = Array.from(panel.children).filter((n): n is HTMLElement => n.classList.contains('ft-rb-group') && !(n as HTMLElement).hidden);
    const key = `${this.tab}|${this.rev}|${this.compact ? 'c' : 'f'}|${Math.round(avail)}|${groups.map((g) => g.dataset.g).join(',')}`;
    if (!groups.length || key === this.fitKey) return;
    setStyleVar(panel, '--rb-gap', '');
    setStyleVar(panel, '--rb-pad', '');
    this.measure(groups);
    const ms = groups.map((g) => this.meas.get(g) as Meas);
    const pick = ms.map(() => 0);
    let total = ms.reduce((s, m) => s + m.w[0], 0);
    if (total > avail) {
      const order = groups.map((_, i) => i).sort((a, b) => Number(groups[b].dataset.rank ?? 0) - Number(groups[a].dataset.rank ?? 0) || b - a);
      const galRank = (s: Step): number => (s.lv === 0 && s.gal ? 8 - s.gal : 0);
      done: {
        for (let t = 1; t <= 6; t++) {
          for (const i of order) {
            let to = pick[i];
            while (to + 1 < ms[i].steps.length && galRank(ms[i].steps[to + 1]) > 0 && galRank(ms[i].steps[to + 1]) <= t) to++;
            if (to === pick[i]) continue;
            total += ms[i].w[to] - ms[i].w[pick[i]];
            pick[i] = to;
            if (total <= avail) break done;
          }
        }
        for (const i of order) {
          while (pick[i] + 1 < ms[i].steps.length) {
            total += ms[i].w[pick[i] + 1] - ms[i].w[pick[i]];
            pick[i]++;
            if (total <= avail) break done;
          }
        }
      }
    }
    const ae = document.activeElement as HTMLElement | null;
    groups.forEach((g, i) => this.setStep(g, ms[i].steps[pick[i]]));
    if (!this.compact) this.spread(panel, groups, avail);
    if (this.popGroup && this.popGroup.dataset.lv !== '3') this.closePop(false);
    else if (this.popGroup) this.placePop();
    const lost = ae?.closest?.('.ft-rb-group[data-lv="3"]');
    if (lost && ae?.closest('.ft-rb-gbody')) lost.querySelector<HTMLElement>('.ft-rb-gbtn')?.focus();
    this.fitKey = key;
  }

  private spread(panel: HTMLElement, groups: HTMLElement[], avail: number): void {
    const width = (): number => groups.reduce((s, g) => s + g.getBoundingClientRect().width, 0);
    const base = width();
    if (avail - base < 2) return;
    setStyleVar(panel, '--rb-gap', '1px');
    const slope = width() - base;
    const gap = slope > 0 ? Math.min(1, Math.floor(((avail - base) / 2 / slope) * 2) / 2) : 0;
    setStyleVar(panel, '--rb-gap', gap ? `${gap}px` : '');
    const pad = Math.min(3,Math.floor(((avail - width()) / (groups.length * 2)) * 2) / 2);
    setStyleVar(panel, '--rb-pad', pad > 0 ? `${pad}px` : '');
  }

  private candidates(g: HTMLElement): Step[] {
    if (this.compact) return g.querySelector('.ft-gal') ? [{ lv: 3, gal: 0 }] : [{ lv: 2, gal: 0 }, { lv: 3, gal: 0 }];
    const gal = g.querySelector('.ft-gal, .ft-wgal') ? 2 : 0;
    const out: Step[] = [{ lv: 0, gal: 0 }];
    if (gal) out.push({ lv: 0, gal: 6 }, { lv: 0, gal: 5 }, { lv: 0, gal: 4 }, { lv: 0, gal: 3 }, { lv: 0, gal: 2 });
    out.push({ lv: 1, gal }, { lv: 3, gal: 0 });
    return out;
  }

  private setStep(g: HTMLElement, s: Step): void {
    const lv = String(s.lv);
    if (g.dataset.lv !== lv) g.dataset.lv = lv;
    setStyleVar(g, '--gal-n', s.gal ? String(s.gal) : '');
  }

  private measure(groups: HTMLElement[]): void {
    const todo = groups.filter((g) => this.meas.get(g)?.rev !== this.rev);
    if (!todo.length) return;
    this.closePop(false);
    const cand = todo.map((g) => this.candidates(g));
    const w = todo.map(() => [] as number[]);
    const most = Math.max(...cand.map((c) => c.length));
    for (let k = 0; k < most; k++) {
      todo.forEach((g, i) => { if (k < cand[i].length) this.setStep(g, cand[i][k]); });
      todo.forEach((g, i) => { if (k < cand[i].length) w[i][k] = g.getBoundingClientRect().width; });
    }
    todo.forEach((g, i) => {
      const steps: Step[] = [];
      const ws: number[] = [];
      cand[i].forEach((s, k) => { if (!ws.length || w[i][k] < ws[ws.length - 1] - 0.5) { steps.push(s); ws.push(w[i][k]); } });
      this.meas.set(g, { rev: this.rev, steps, w: ws });
    });
  }

  catalog(): Array<{ id: string; label: string; ctx: string | undefined; custom: boolean; groups: Array<{ id: string; label: string; key: string }> }> {
    return Array.from(this.defs.values()).map((d) => ({ id: d.id, label: d.label, ctx: d.ctx, custom: !!d.custom, groups: d.groups.map((g) => ({ id: g.id, label: g.label, key: `${d.id}.${g.id}` })) }));
  }

  applyConfig(cfg: RibbonConfig): void {
    this.config = cfg;
    this.closePop(false);
    this.rev++;
    this.buildCustom();
    this.mark = '';
    this.applyVisibility();
    if (this.tabBtns.get(this.tab)?.hidden || !this.defs.has(this.tab)) this.showTab(this.firstTab);
    this.fitKey = '';
    this.fit();
    this.persist();
    this.sync();
  }

  persist(): void {
    try { localStorage.setItem(RIBBON_KEY, JSON.stringify({ collapsed: this.collapsed, simplified: this.simplified, compact: this.compact, tab: this.tab, ...this.config } satisfies Saved)); } catch { return; }
  }
}
