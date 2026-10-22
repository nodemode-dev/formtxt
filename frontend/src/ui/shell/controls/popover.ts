import { el, escapeHtml, setClass, setDisabled, setHidden, setStyleVar, setText } from '../../dom';
import { icon } from '../../icons';
import { toast } from '../../toast';
import { cmdStateChanged, shellCommands } from '../cmd';
import { onPage, refreshPage } from './state';
import { HIGHLIGHTS, STANDARD, pushRecent, recentColors, themeGrid } from './colors';
import type { GridSec, PAct, PItem, PalSec, PanelSpec, Sec } from './types';

const specs = new Map<string, PanelSpec>();

export function registerPanel(spec: PanelSpec): void { specs.set(spec.id, spec); }
export function panelSpec(id: string): PanelSpec | undefined { return specs.get(id); }
export function panelIds(): string[] { return Array.from(specs.keys()); }

interface Row { node: HTMLButtonElement; it: PItem; label: HTMLElement | null }
interface Built { spec: PanelSpec; node: HTMLElement; rows: Row[]; patches: Array<() => void> }

const built = new Map<string, Built>();
let cur: { id: string; anchor: HTMLElement } | null = null;
let wired = false;
const closers: Array<() => void> = [];

export function exec(a: PAct): void {
  if (a.run) {
    void Promise.resolve()
      .then(() => a.run?.())
      .catch((e: Error) => toast(e.message, 'error'))
      .finally(cmdStateChanged);
    return;
  }
  if (a.cmd) shellCommands.run(a.cmd, a.params);
}

const label = (it: PItem): string => (typeof it.label === 'function' ? it.label() : it.label);

function rowHtml(it: PItem, i: number): string {
  const ic = it.glyph ? `<span class="ft-pp-ic ft-pp-glyph">${it.glyph}</span>` : it.icon ? `<span class="ft-pp-ic">${icon(it.icon, 16)}</span>` : '<span class="ft-pp-ic"></span>';
  return `<button class="ft-pp-row" type="button" role="menuitem" data-i="${i}">${ic}<span class="ft-pp-tx"><span class="ft-pp-lb">${escapeHtml(label(it))}</span>${it.sub ? `<span class="ft-pp-sub">${escapeHtml(it.sub)}</span>` : ''}</span>${it.keys ? `<span class="ft-pp-keys">${escapeHtml(it.keys)}</span>` : ''}</button>`;
}

function paletteNode(sec: PalSec, reg: (b: HTMLButtonElement, it: PItem) => void, pick: (hex: string) => void): { node: HTMLElement; patch: () => void } {
  const node = el('<div class="ft-pp-pal"></div>');
  const sw = (hex: string, name: string, cls = ''): string => `<button class="ft-pp-sw ${cls}" type="button" role="menuitem" data-c="${hex}" style="--c:${hex}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}"></button>`;
  const parts: string[] = [];
  const noneBtn = (text: string, value: string, cls: string): string => `<button class="ft-pp-row ft-pp-pw ${cls}" type="button" role="menuitem" data-c="${value}" data-none="1"><span class="ft-pp-ic"><span class="ft-pp-nosw"></span></span><span class="ft-pp-tx"><span class="ft-pp-lb">${escapeHtml(text)}</span></span></button>`;
  if (sec.auto) parts.push(noneBtn(sec.auto, sec.autoValue ?? '', 'is-auto'));
  if (sec.none) parts.push(noneBtn(sec.none, sec.noneValue ?? '', 'is-none'));
  if (sec.theme) {
    parts.push('<div class="ft-pp-head">Theme Colors</div><div class="ft-pp-theme">');
    for (const row of themeGrid()) parts.push(`<div class="ft-pp-swrow">${row.map((s) => sw(s.hex, s.name)).join('')}</div>`);
    parts.push('</div>');
  }
  if (sec.standard) parts.push(`<div class="ft-pp-head">Standard Colors</div><div class="ft-pp-swrow">${STANDARD.map(([n, h]) => sw(h, n)).join('')}</div>`);
  if (sec.hl) parts.push(`<div class="ft-pp-hl">${HIGHLIGHTS.map(([n, h]) => sw(h, n, 'is-big')).join('')}</div>`);
  if (sec.recent) parts.push(`<div class="ft-pp-head ft-pp-rhead">Recent Colors</div><div class="ft-pp-swrow ft-pp-recent">${Array.from({ length: 10 }, () => '<button class="ft-pp-sw" type="button" role="menuitem" hidden></button>').join('')}</div>`);
  if (sec.more) parts.push(`<button class="ft-pp-row ft-pp-pw ft-pp-more" type="button" role="menuitem"><span class="ft-pp-ic">${icon('palette', 16)}</span><span class="ft-pp-tx"><span class="ft-pp-lb">${escapeHtml(sec.more)}</span></span></button><input class="ft-pp-native" type="color" tabindex="-1" aria-hidden="true">`);
  node.innerHTML = parts.join('');
  const recent = Array.from(node.querySelectorAll<HTMLButtonElement>('.ft-pp-recent .ft-pp-sw'));
  const native = node.querySelector<HTMLInputElement>('.ft-pp-native');
  const all = Array.from(node.querySelectorAll<HTMLButtonElement>('button[data-c], .ft-pp-more, .ft-pp-recent .ft-pp-sw'));
  for (const b of all) reg(b, { label: '' });
  node.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || !node.contains(b)) return;
    if (b.classList.contains('ft-pp-more')) { native?.click(); return; }
    if (b.dataset.c !== undefined) pick(b.dataset.c);
  });
  native?.addEventListener('change', () => pick(native.value.toUpperCase()));
  const patch = (): void => {
    const now = (sec.current?.() ?? '').toLowerCase();
    for (const b of Array.from(node.querySelectorAll<HTMLButtonElement>('button[data-c]'))) {
      if (b.dataset.none) setClass(b, 'is-on', !!sec.current && now === (b.dataset.c ?? '').toLowerCase());
      else setClass(b, 'is-on', !!now && now === (b.dataset.c ?? '').toLowerCase());
    }
    if (sec.recent) {
      const list = recentColors(sec.recent);
      recent.forEach((b, i) => {
        const c = list[i];
        setHidden(b, !c);
        if (c) { b.dataset.c = c; setStyleVar(b, '--c', c); b.title = c; b.setAttribute('aria-label', c); }
      });
      const head = node.querySelector<HTMLElement>('.ft-pp-rhead');
      if (head) setHidden(head, list.length === 0);
    }
  };
  return { node, patch };
}

function gridNode(sec: GridSec, run: (a: PAct) => void): HTMLElement {
  const node = el(`<div class="ft-pp-grid" tabindex="0" role="grid" aria-label="Insert table"><div class="ft-pp-gh">${escapeHtml(sec.idle)}</div><div class="ft-pp-gcells" style="--gc:${sec.cols}">${Array.from({ length: sec.rows * sec.cols }, () => '<span class="ft-pp-gcell"></span>').join('')}</div></div>`);
  const head = node.querySelector('.ft-pp-gh') as HTMLElement;
  const cells = Array.from(node.querySelectorAll<HTMLElement>('.ft-pp-gcell'));
  let r = 0, c = 0;
  const paint = (): void => {
    cells.forEach((n, i) => setClass(n, 'is-in', Math.floor(i / sec.cols) < r && (i % sec.cols) < c));
    setText(head, r && c ? sec.label(c, r) : sec.idle);
  };
  const at = (e: PointerEvent): void => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.ft-pp-gcell');
    if (!t) return;
    const i = cells.indexOf(t);
    r = Math.floor(i / sec.cols) + 1;
    c = (i % sec.cols) + 1;
    paint();
  };
  node.addEventListener('pointermove', at);
  node.addEventListener('pointerleave', () => { if (document.activeElement !== node) { r = 0; c = 0; paint(); } });
  node.addEventListener('click', (e) => { at(e as PointerEvent); if (r && c) run(sec.act(c, r)); });
  node.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Enter' || k === ' ') { e.preventDefault(); if (r && c) run(sec.act(c, r)); return; }
    const d: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (!d[k]) return;
    e.preventDefault();
    e.stopPropagation();
    r = Math.min(sec.rows, Math.max(1, (r || 1) + d[k][0]));
    c = Math.min(sec.cols, Math.max(1, (c || 1) + d[k][1]));
    paint();
  });
  node.addEventListener('blur', () => { r = 0; c = 0; paint(); });
  return node;
}

function build(spec: PanelSpec): Built {
  const node = el(`<div class="ft-rb-pop ft-pp ${spec.cls ?? ''}" role="menu" aria-label="${escapeHtml(spec.id)}" tabindex="-1" hidden></div>`);
  if (spec.w) node.style.setProperty('--pw', `${spec.w}px`);
  const b: Built = { spec, node, rows: [], patches: [] };
  const reg = (n: HTMLButtonElement, it: PItem): Row => { const r: Row = { node: n, it, label: n.querySelector('.ft-pp-lb') }; b.rows.push(r); return r; };
  const close = (): void => closePanel();
  const live = (it: PItem): boolean => !it.cmd || shellCommands.has(it.cmd);
  const add = (sec0: Sec): void => {
    let sec = sec0;
    if (sec.t === 'rows') sec = { ...sec, rows: sec.rows.filter(live) };
    else if (sec.t === 'tiles') sec = { ...sec, tiles: sec.tiles.filter(live) };
    if ((sec.t === 'rows' && !sec.rows.length) || (sec.t === 'tiles' && !sec.tiles.length)) return;
    if (sec.t === 'head') node.appendChild(el(`<div class="ft-pp-head">${escapeHtml(sec.text)}</div>`));
    else if (sec.t === 'sep') node.appendChild(el('<div class="ft-pp-sep" role="separator"></div>'));
    else if (sec.t === 'rows') {
      const box = el('<div class="ft-pp-rows"></div>');
      box.innerHTML = sec.rows.map((it, i) => rowHtml(it, i)).join('');
      Array.from(box.children).forEach((n, i) => reg(n as HTMLButtonElement, sec.rows[i]));
      node.appendChild(box);
    } else if (sec.t === 'tiles') {
      const box = el(`<div class="ft-pp-tiles" style="--cols:${sec.cols};--tw:${sec.tw}px;--th:${sec.th}px"></div>`);
      box.innerHTML = sec.tiles.map((it) => `<button class="ft-pp-tile" type="button" role="menuitem" title="${escapeHtml(label(it))}"><span class="ft-pp-thumb">${it.glyph ?? ''}</span>${sec.names === false ? '' : `<span class="ft-pp-name ft-pp-lb">${escapeHtml(label(it))}</span>`}</button>`).join('');
      Array.from(box.children).forEach((n, i) => reg(n as HTMLButtonElement, sec.tiles[i]));
      node.appendChild(box);
    } else if (sec.t === 'palette') {
      const pal = paletteNode(sec, (n, it) => reg(n, it), (hex) => {
        const params = { [sec.key]: hex, ...(sec.extra ?? {}) };
        if (hex && sec.recent) pushRecent(sec.recent, hex);
        if (sec.swatch && cur) {
          const main = cur.anchor.closest('.ft-rb-split')?.querySelector<HTMLElement>('[data-cmd]');
          if (main) { main.dataset.params = JSON.stringify(params); setStyleVar(main, '--swatch', hex || ''); }
        }
        closePanel();
        shellCommands.run(sec.cmd, params);
      });
      b.patches.push(pal.patch);
      node.appendChild(pal.node);
    } else if (sec.t === 'grid') node.appendChild(gridNode(sec, (a) => { closePanel(); exec(a); }));
    else if (sec.t === 'custom') {
      node.appendChild(sec.build(close));
      if (sec.patch) b.patches.push(sec.patch);
    }
  };
  for (const s of spec.secs) add(s);
  b.rows = b.rows.filter((r) => r.it.label !== '' || r.it.cmd || r.it.run);
  node.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault(); });
  node.addEventListener('click', (e) => {
    const n = (e.target as HTMLElement).closest<HTMLButtonElement>('.ft-pp-row, .ft-pp-tile');
    if (!n || n.disabled || n.dataset.c !== undefined || n.classList.contains('ft-pp-more')) return;
    const row = b.rows.find((r) => r.node === n);
    if (!row) return;
    if (spec.remember && cur && row.it.cmd) {
      const main = cur.anchor.closest('.ft-rb-split')?.querySelector<HTMLElement>('[data-cmd]');
      if (main) { main.dataset.cmd = row.it.cmd; main.dataset.params = JSON.stringify(row.it.params ?? {}); }
    }
    if (!row.it.keep) closePanel();
    exec(row.it);
  });
  document.getElementById('overlay-root')?.appendChild(node) ?? document.body.appendChild(node);
  built.set(spec.id, b);
  return b;
}

function ensure(id: string): Built | null {
  const have = built.get(id);
  if (have) return have;
  const spec = specs.get(id);
  return spec ? build(spec) : null;
}

export function warmPanel(id: string): void { ensure(id); }

function patch(b: Built): void {
  for (const r of b.rows) {
    const it = r.it;
    if (!r.node.classList.contains('ft-pp-sw') && !r.node.classList.contains('ft-pp-more') && r.node.dataset.c === undefined) {
      setClass(r.node, 'is-on', !!it.on?.());
      setDisabled(r.node, !!it.off?.());
      if (typeof it.label === 'function' && r.label) setText(r.label, it.label());
    }
  }
  for (const p of b.patches) p();
}

export function patchPanel(id: string): void { const b = built.get(id); if (b && !b.node.hidden) patch(b); }

export function panelOpen(id?: string): boolean { return !!cur && (!id || cur.id === id); }

export function panelEnabled(id: string): boolean { return specs.get(id)?.enabled ? !!specs.get(id)?.enabled?.() : true; }

export function closePanel(): void {
  if (!cur) return;
  const b = built.get(cur.id);
  if (b) setHidden(b.node, true);
  cur.anchor.setAttribute('aria-expanded', 'false');
  cur = null;
  for (const fn of closers) fn();
}

export function onPanelClose(fn: () => void): void { closers.push(fn); }

function nav(b: Built, e: KeyboardEvent): void {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLInputElement || t.closest('.ft-pp-grid')) return;
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const list = Array.from(b.node.querySelectorAll<HTMLElement>('button:not(:disabled):not([hidden]), .ft-pp-grid')).filter((n) => n.offsetParent !== null);
  if (!list.length) return;
  e.preventDefault();
  const from = list.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'Home') { list[0].focus(); return; }
  if (e.key === 'End') { list[list.length - 1].focus(); return; }
  if (from < 0) { list[0].focus(); return; }
  const a = list[from].getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let score = Infinity;
  list.forEach((n, i) => {
    if (i === from) return;
    const r = n.getBoundingClientRect();
    const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
    const ok = e.key === 'ArrowDown' ? dy > 3 : e.key === 'ArrowUp' ? dy < -3 : e.key === 'ArrowRight' ? dx > 3 && Math.abs(dy) < a.height : dx < -3 && Math.abs(dy) < a.height;
    if (!ok) return;
    const s = e.key === 'ArrowDown' || e.key === 'ArrowUp' ? Math.abs(dy) * 4 + Math.abs(dx) : Math.abs(dx) * 4 + Math.abs(dy);
    if (s < score) { score = s; best = n; }
  });
  (best ?? list[from]).focus();
}

function wire(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    const t = e.target as Node;
    const b = built.get(cur.id);
    if (b?.node.contains(t) || cur.anchor.contains(t) || (t as HTMLElement).closest?.('.ft-pp, .ft-popm')) return;
    closePanel();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!cur) return;
    const b = built.get(cur.id);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const a = cur.anchor; const had = b?.node.contains(document.activeElement); closePanel(); if (had) a.focus(); return; }
    if (b && b.node.contains(e.target as Node)) nav(b, e);
  }, true);
  window.addEventListener('resize', () => closePanel());
  window.addEventListener('blur', () => closePanel());
  onPage(() => { const b = cur ? built.get(cur.id) : null; if (b) patch(b); });
}

export function openPanel(id: string, anchor: HTMLElement, viaKey = false): void {
  wire();
  if (cur && cur.id === id && cur.anchor === anchor) { closePanel(); return; }
  closePanel();
  const b = ensure(id);
  if (!b) return;
  refreshPage();
  patch(b);
  cur = { id, anchor };
  anchor.setAttribute('aria-expanded', 'true');
  setHidden(b.node, false);
  const host = anchor.closest<HTMLElement>('.ft-rb-split') ?? anchor;
  const r = host.getBoundingClientRect();
  const w = b.node.offsetWidth, h = b.node.offsetHeight;
  b.node.style.left = `${Math.round(Math.min(Math.max(r.left, 4), Math.max(4, window.innerWidth - w - 4)))}px`;
  const below = r.bottom + 2;
  b.node.style.top = `${Math.round(below + h <= window.innerHeight - 4 ? below : Math.max(4, r.top - h - 2))}px`;
  if (viaKey) (b.node.querySelector<HTMLElement>('.is-on, button:not(:disabled), .ft-pp-grid, input') ?? b.node).focus();
}
