import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { api } from '../io/api';
import { el, patchList, setClass, setHidden, setText } from '../ui/dom';
import { type ChipAttrs, type ChipOption, chipLabel, cleanChip, formatChipDate, isoDate, parseIsoDate, schema } from './schema';

export const CHIP_COLORS = ['#9ca3af', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];

export const DROPDOWN_PRESETS: Array<{ id: string; name: string; options: ChipOption[] }> = [
  { id: 'status', name: 'Status', options: [{ label: 'Not started', color: '#9ca3af' }, { label: 'In progress', color: '#3b82f6' }, { label: 'Blocked', color: '#ef4444' }, { label: 'Done', color: '#22c55e' }] },
  { id: 'priority', name: 'Priority', options: [{ label: 'Low', color: '#22c55e' }, { label: 'Medium', color: '#f59e0b' }, { label: 'High', color: '#ef4444' }] },
  { id: 'review', name: 'Review', options: [{ label: 'Draft', color: '#9ca3af' }, { label: 'In review', color: '#f59e0b' }, { label: 'Approved', color: '#22c55e' }, { label: 'Changes needed', color: '#ef4444' }] },
];

export interface ChipHost {
  docId: () => string;
  openDoc: (id: string) => void;
  dialog: (kind: string, current: { node: PMNode; pos: number } | null) => void;
}

let host: ChipHost | null = null;
export function setChipHost(h: ChipHost): void { host = h; }

interface MentionState { active: boolean; from: number; query: string }
export const chipKey = new PluginKey<MentionState>('chips');
const IDLE: MentionState = { active: false, from: 0, query: '' };

interface Item { key: string; group: string; label: string; hint?: string; run: (view: EditorView) => void }

let docsCache: { at: number; list: Array<{ id: string; title: string }> } | null = null;
let authorCache: string | null = null;

async function loadDocs(): Promise<void> {
  if (docsCache && Date.now() - docsCache.at < 30000) return;
  try {
    const r = await api.get<{ documents: Array<{ id: string; title: string }> }>('/documents');
    docsCache = { at: Date.now(), list: r.documents.map((d) => ({ id: d.id, title: d.title })) };
  } catch { docsCache = { at: Date.now(), list: docsCache?.list ?? [] }; }
}

async function loadAuthor(): Promise<void> {
  if (authorCache !== null) return;
  try { authorCache = String((await api.get<Record<string, unknown>>('/settings')).author ?? ''); } catch { authorCache = ''; }
}

export function peopleIn(doc: PMNode): Array<{ name: string; email: string }> {
  const seen = new Map<string, { name: string; email: string }>();
  doc.descendants((n) => {
    if (n.type === schema.nodes.chip && n.attrs.kind === 'person') {
      const k = String(n.attrs.email || n.attrs.name).toLowerCase();
      if (k && !seen.has(k)) seen.set(k, { name: String(n.attrs.name), email: String(n.attrs.email) });
    }
    return true;
  });
  if (authorCache && !seen.has(authorCache.toLowerCase())) seen.set(authorCache.toLowerCase(), { name: authorCache, email: '' });
  return [...seen.values()];
}

export function chipNode(attrs: Partial<ChipAttrs>): PMNode {
  return schema.nodes.chip.create(cleanChip(attrs) ?? { kind: 'date', date: isoDate(new Date()) });
}

function put(view: EditorView, attrs: Partial<ChipAttrs>): void {
  const st = chipKey.getState(view.state);
  if (!st?.active) return;
  const to = view.state.selection.from;
  const tr = view.state.tr.replaceWith(st.from, to, [chipNode(attrs), schema.text(' ')]).setMeta(chipKey, { close: true });
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function viaDialog(view: EditorView, kind: string): void {
  const st = chipKey.getState(view.state);
  if (!st?.active) return;
  view.dispatch(view.state.tr.delete(st.from, view.state.selection.from).setMeta(chipKey, { close: true }));
  host?.dialog(kind, null);
}

const dayOffset = (n: number): string => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

function typedDate(q: string): string {
  const iso = parseIsoDate(q.trim());
  if (iso) return q.trim();
  if (q.trim().length < 3 || !/\d/.test(q)) return '';
  const t = Date.parse(q);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  if (!/\d{4}/.test(q)) d.setFullYear(new Date().getFullYear());
  return isoDate(d);
}

function mentionItems(view: EditorView, query: string): Item[] {
  const q = query.trim().toLowerCase();
  const has = (...words: string[]): boolean => !q || words.some((w) => w.toLowerCase().includes(q));
  const out: Item[] = [];
  for (const [label, n] of [['Today', 0], ['Tomorrow', 1], ['Yesterday', -1]] as const) {
    if (has(label, 'date')) out.push({ key: `d:${label}`, group: 'Dates', label, hint: formatChipDate(dayOffset(n), 'short'), run: (v) => put(v, { kind: 'date', date: dayOffset(n), format: 'short' }) });
  }
  const typed = typedDate(query);
  if (typed) out.push({ key: `d:${typed}`, group: 'Dates', label: formatChipDate(typed, 'long'), hint: 'Date', run: (v) => put(v, { kind: 'date', date: typed, format: 'short' }) });
  if (has('date', 'pick a date')) out.push({ key: 'd:pick', group: 'Dates', label: 'Pick a date...', run: (v) => viaDialog(v, 'date') });
  for (const p of peopleIn(view.state.doc).filter((p) => has(p.name, p.email)).slice(0, 4)) {
    out.push({ key: `p:${p.email || p.name}`, group: 'People', label: p.name || p.email, hint: p.email, run: (v) => put(v, { kind: 'person', name: p.name, email: p.email }) });
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim())) out.push({ key: `p:new:${q}`, group: 'People', label: query.trim(), hint: 'Person', run: (v) => put(v, { kind: 'person', name: '', email: query.trim() }) });
  if (has('person', 'people')) out.push({ key: 'p:add', group: 'People', label: 'Person...', run: (v) => viaDialog(v, 'person') });
  const self = host?.docId() ?? '';
  for (const d of (docsCache?.list ?? []).filter((d) => d.id !== self && has(d.title)).slice(0, q ? 5 : 3)) {
    out.push({ key: `f:${d.id}`, group: 'Documents', label: d.title, run: (v) => put(v, { kind: 'doc', doc: d.id, title: d.title }) });
  }
  for (const p of DROPDOWN_PRESETS.filter((p) => has(p.name, 'dropdown'))) {
    out.push({ key: `o:${p.id}`, group: 'Dropdowns', label: p.name, hint: p.options.map((o) => o.label).join(', '), run: (v) => put(v, { kind: 'dropdown', options: p.options, value: p.options[0].label }) });
  }
  if (has('dropdown')) out.push({ key: 'o:new', group: 'Dropdowns', label: 'New dropdown...', run: (v) => viaDialog(v, 'dropdown') });
  return out;
}

function chipActions(view: EditorView, node: PMNode, pos: number): Item[] {
  const set = (attrs: Partial<ChipAttrs>) => (v: EditorView): void => {
    const cur = v.state.doc.nodeAt(pos);
    if (!cur || cur.type !== schema.nodes.chip) return;
    v.dispatch(v.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...cleanChip({ ...(cur.attrs as ChipAttrs), ...attrs }) }));
    v.focus();
  };
  const edit = (v: EditorView): void => { v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, pos))); host?.dialog(String(node.attrs.kind), { node, pos }); };
  const remove = (v: EditorView): void => { v.dispatch(v.state.tr.delete(pos, pos + node.nodeSize)); v.focus(); };
  const a = node.attrs;
  if (a.kind === 'dropdown') {
    return [...(a.options as ChipOption[]).map((o): Item => ({ key: `v:${o.label}`, group: '', label: o.label, hint: o.label === a.value ? 'Current' : '', run: set({ value: o.label }) })), { key: 'edit', group: '', label: 'Edit options...', run: edit }, { key: 'rm', group: '', label: 'Remove', run: remove }];
  }
  if (a.kind === 'date') {
    return [{ key: 'today', group: '', label: 'Today', hint: formatChipDate(dayOffset(0), 'short'), run: set({ date: dayOffset(0) }) }, { key: 'edit', group: '', label: 'Change date or format...', run: edit }, { key: 'text', group: '', label: 'Turn into text', run: (v) => { v.dispatch(v.state.tr.replaceWith(pos, pos + node.nodeSize, schema.text(chipLabel(a)))); v.focus(); } }, { key: 'rm', group: '', label: 'Remove', run: remove }];
  }
  if (a.kind === 'person') {
    const items: Item[] = [];
    if (a.email) items.push({ key: 'mail', group: '', label: 'Email', hint: String(a.email), run: () => { window.open(`mailto:${encodeURIComponent(String(a.email))}`, '_blank', 'noopener'); } });
    items.push({ key: 'copy', group: '', label: 'Copy email', hint: '', run: () => { void navigator.clipboard?.writeText(String(a.email || a.name)).catch(() => undefined); } });
    return [...items, { key: 'edit', group: '', label: 'Edit person...', run: edit }, { key: 'rm', group: '', label: 'Remove', run: remove }];
  }
  return [{ key: 'open', group: '', label: 'Open document', hint: String(a.title), run: () => { if (a.doc) host?.openDoc(String(a.doc)); } }, { key: 'edit', group: '', label: 'Change document...', run: edit }, { key: 'rm', group: '', label: 'Remove', run: remove }];
}

class ChipMenu {
  readonly dom: HTMLElement;
  private list: HTMLElement;
  private items: Item[] = [];
  private index = 0;
  mode: 'none' | 'mention' | 'actions' = 'none';

  constructor(private view: EditorView) {
    this.dom = el('<div class="ft-menu ft-chip-menu" role="listbox" aria-label="Insert a smart chip" hidden><div class="ft-chip-menu-list"></div></div>');
    this.list = this.dom.firstElementChild as HTMLElement;
    document.getElementById('overlay-root')?.appendChild(this.dom);
    this.dom.addEventListener('mousedown', (e) => e.preventDefault());
    this.dom.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-key]')?.dataset.key;
      const it = this.items.find((i) => i.key === k);
      if (it) this.choose(it);
    });
  }

  show(items: Item[], at: { left: number; bottom: number; top: number }, mode: 'mention' | 'actions'): void {
    const sameSet = this.mode === mode && items.length === this.items.length && items.every((it, i) => it.key === this.items[i].key);
    this.mode = mode;
    this.items = items;
    if (!sameSet) this.index = 0;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    let group = '';
    const rows: Array<{ key: string; item?: Item; head?: string }> = [];
    for (const it of items) {
      if (it.group && it.group !== group) { group = it.group; rows.push({ key: `h:${group}`, head: group }); }
      rows.push({ key: it.key, item: it });
    }
    const fill = (n: HTMLElement, r: { key: string; item?: Item; head?: string }): void => {
      if (r.head !== undefined) { setText(n, r.head); return; }
      setText(n.firstElementChild, r.item!.label);
      setText(n.lastElementChild, r.item!.hint ?? '');
    };
    patchList(this.list, rows, {
      key: (r) => r.key,
      create: (r) => {
        const n = r.head !== undefined ? el('<div class="ft-chip-menu-head" role="presentation"></div>') : el('<button type="button" class="ft-menu-item ft-chip-menu-item" role="option"><span class="ft-chip-menu-label"></span><span class="ft-chip-menu-hint"></span></button>');
        fill(n, r);
        return n;
      },
      update: fill,
    });
    this.mark();
    if (!items.length) { this.hide(); return; }
    const wasHidden = this.dom.hidden;
    if (wasHidden) { this.dom.style.visibility = 'hidden'; setHidden(this.dom, false); }
    const w = this.dom.offsetWidth, h = this.dom.offsetHeight;
    const below = at.bottom + 4 + h < window.innerHeight - 4;
    this.dom.style.left = `${Math.round(Math.max(4, Math.min(at.left, window.innerWidth - w - 4)))}px`;
    this.dom.style.top = `${Math.round(below ? at.bottom + 4 : Math.max(4, at.top - h - 4))}px`;
    if (wasHidden) this.dom.style.visibility = '';
  }

  private mark(): void {
    const k = this.items[this.index]?.key;
    for (const n of this.list.querySelectorAll<HTMLElement>('.ft-chip-menu-item')) {
      const on = n.dataset.key === k;
      setClass(n, 'is-active', on);
      n.setAttribute('aria-selected', String(on));
      if (on) n.scrollIntoView({ block: 'nearest' });
    }
  }

  move(d: number): void { if (this.items.length) { this.index = (this.index + d + this.items.length) % this.items.length; this.mark(); } }

  chooseActive(): boolean { const it = this.items[this.index]; if (!it) return false; this.choose(it); return true; }

  private choose(it: Item): void {
    const mode = this.mode;
    if (mode === 'actions') this.hide();
    it.run(this.view);
    if (mode === 'mention') this.hide();
  }

  hide(): void { this.mode = 'none'; setHidden(this.dom, true); }
  destroy(): void { this.dom.remove(); }
}

let activeMenu: ChipMenu | null = null;

export function openChipActions(view: EditorView, pos: number): boolean {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type !== schema.nodes.chip || !activeMenu) return false;
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  const r = dom?.getBoundingClientRect() ?? view.coordsAtPos(pos);
  activeMenu.show(chipActions(view, node, pos), { left: r.left, top: r.top, bottom: r.bottom }, 'actions');
  return true;
}

export function closeChipMenu(): void { activeMenu?.hide(); }

function reduce(tr: Transaction, prev: MentionState, state: EditorState): MentionState {
  const meta = tr.getMeta(chipKey) as { activate?: number; close?: boolean } | undefined;
  if (meta?.close) return IDLE;
  let st = prev;
  if (meta?.activate !== undefined) st = { active: true, from: meta.activate, query: '' };
  if (!st.active) return st;
  const from = tr.mapping.map(st.from, -1);
  const sel = state.selection;
  if (!sel.empty || sel.from <= from) return IDLE;
  const $f = state.doc.resolve(from);
  if ($f.parent !== sel.$from.parent || state.doc.textBetween(from, from + 1) !== '@') return IDLE;
  const query = state.doc.textBetween(from + 1, sel.from, '\n', '￼');
  if (query.length > 40 || query.includes('￼') || /\s\s/.test(query) || (query.startsWith(' '))) return IDLE;
  return { active: true, from, query };
}

export const chipPlugin = new Plugin<MentionState>({
  key: chipKey,
  state: {
    init: () => IDLE,
    apply: (tr, prev, _old, state) => reduce(tr, prev, state),
  },
  props: {
    handleTextInput(view, from, to, text) {
      if (text !== '@' || !view.editable) return false;
      const $f = view.state.doc.resolve(from);
      if (!$f.parent.isTextblock || $f.parent.type.spec.code) return false;
      const before = $f.parent.textBetween(Math.max(0, $f.parentOffset - 1), $f.parentOffset, undefined, '￼');
      if (before && !/[\s(\[]/.test(before)) return false;
      view.dispatch(view.state.tr.insertText('@', from, to).setMeta(chipKey, { activate: from }));
      void Promise.all([loadDocs(), loadAuthor()]).then(() => { if (chipKey.getState(view.state)?.active) view.dispatch(view.state.tr.setMeta('chipsRefresh', true)); });
      return true;
    },
    handleKeyDown(view, e) {
      const m = activeMenu;
      if (!m || m.mode === 'none') return false;
      if (e.key === 'ArrowDown') { m.move(1); return true; }
      if (e.key === 'ArrowUp') { m.move(-1); return true; }
      if (e.key === 'Enter' || (e.key === 'Tab' && m.mode === 'mention')) return m.chooseActive();
      if (e.key === 'Escape') {
        if (m.mode === 'mention') view.dispatch(view.state.tr.setMeta(chipKey, { close: true }));
        m.hide();
        return true;
      }
      if (m.mode === 'actions') m.hide();
      return false;
    },
    handleClickOn(view, _pos, node, nodePos, e) {
      if (node.type !== schema.nodes.chip || !view.editable) return false;
      if (node.attrs.kind === 'doc' && (e.ctrlKey || e.metaKey)) { if (node.attrs.doc) host?.openDoc(String(node.attrs.doc)); return true; }
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
      openChipActions(view, nodePos);
      return true;
    },
  },
  view(view) {
    const menu = new ChipMenu(view);
    activeMenu = menu;
    const sync = (v: EditorView): void => {
      const st = chipKey.getState(v.state);
      if (st?.active) {
        const c = v.coordsAtPos(st.from);
        menu.show(mentionItems(v, st.query), { left: c.left, top: c.top, bottom: c.bottom }, 'mention');
      } else if (menu.mode === 'mention') menu.hide();
    };
    const onScroll = (): void => { if (menu.mode === 'actions') menu.hide(); else if (menu.mode === 'mention') sync(view); };
    const scroller = view.dom.closest('.ft-scroll');
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    const onDown = (e: MouseEvent): void => { if (menu.mode !== 'none' && !menu.dom.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.ft-smart-chip')) { if (menu.mode === 'mention') view.dispatch(view.state.tr.setMeta(chipKey, { close: true })); menu.hide(); } };
    document.addEventListener('mousedown', onDown, true);
    return {
      update: (v) => sync(v),
      destroy: () => { scroller?.removeEventListener('scroll', onScroll); document.removeEventListener('mousedown', onDown, true); if (activeMenu === menu) activeMenu = null; menu.destroy(); },
    };
  },
});

export function selectedChip(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type === schema.nodes.chip ? { node: sel.node, pos: sel.from } : null;
}

export { loadDocs, loadAuthor };
export function knownDocs(): Array<{ id: string; title: string }> { return docsCache?.list ?? []; }
