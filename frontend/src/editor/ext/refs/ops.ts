import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, type Selection, TextSelection } from 'prosemirror-state';
import { api } from '../../../io/api';
import type { Style } from '../../../engine/model';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { type CiteItem, blankSource } from './cite';
import { buildUpdate, updateAll } from './compute';
import { type Heading, captions, headings, inlineNodes, insertBlock, locate, newId, plainText, saveSources, sourcesOf } from './util';

const BOOKMARK_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const CAPTION_STYLE: Style = { type: 'paragraph', name: 'Caption', basedOn: 'Normal', next: 'Normal', run: { size: 9, italic: true, color: '#44546a' }, para: { spaceBefore: 4, spaceAfter: 10 } };

function view(ed: DocEditor) {
  if (!ed.view) throw new Error('Open a document first.');
  return ed.view;
}

export function quick(ed: DocEditor, pages = false): void {
  const v = view(ed);
  if (pages) ed.paginator.layoutNow();
  const u = buildUpdate(ed, v, { blocks: false, pages });
  if (u) v.dispatch(u.tr.setMeta('addToHistory', false).setMeta('refs', true));
}

export function refreshAll(ed: DocEditor): number {
  let hasToc = false;
  view(ed).state.doc.forEach((n) => { if (n.type === schema.nodes.ref_toc) hasToc = true; });
  if (hasToc) ensureHeadingIds(ed);
  return updateAll(ed);
}

function insertInline(ed: DocEditor, node: PMNode, afterSelection = false): void {
  const v = view(ed);
  const { state } = v;
  if (afterSelection && !state.selection.empty && !(state.selection instanceof NodeSelection)) {
    v.dispatch(state.tr.insert(state.selection.to, node).scrollIntoView());
  } else v.dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
  v.focus();
}

function ensureHeadingIds(ed: DocEditor): void {
  const v = view(ed);
  const missing = headings(v.state.doc).filter((h) => !h.id);
  if (!missing.length) return;
  const tr = v.state.tr;
  for (const h of missing) {
    const n = tr.doc.nodeAt(h.pos);
    if (n) tr.setNodeMarkup(h.pos, undefined, { ...n.attrs, id: newId('h_') });
  }
  v.dispatch(tr.setMeta('addToHistory', false).setMeta('refs', true));
}

export interface TocSpot { sel: Selection; doc: PMNode }

export function tocSpot(ed: DocEditor): TocSpot {
  const v = view(ed);
  return { sel: v.state.selection, doc: v.state.doc };
}

function tocAt(doc: PMNode, sel: Selection): { pos: number; node: PMNode } | null {
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.ref_toc) return { pos: sel.from, node: sel.node };
  if (sel.$from.depth >= 1 && sel.$from.node(1).type === schema.nodes.ref_toc) return { pos: sel.$from.before(1), node: sel.$from.node(1) };
  if (sel.$from.depth === 0) {
    const after = doc.nodeAt(sel.from);
    if (after && after.type === schema.nodes.ref_toc && sel.from !== sel.to) return { pos: sel.from, node: after };
  }
  return null;
}

export function insertToc(ed: DocEditor, from: number, to: number, pages: boolean, links: boolean, spot?: TocSpot): void {
  const lo = Math.max(1, Math.min(9, from));
  const hi = Math.max(lo, Math.min(9, to));
  const v = view(ed);
  const sameDoc = !!spot && spot.doc === v.state.doc;
  const sel = sameDoc && spot ? spot.sel : v.state.selection;
  const opts = { from: lo, to: hi, pages, links };
  const existing = tocAt(v.state.doc, sel);
  if (existing) {
    const rep = v.state.tr.setNodeMarkup(existing.pos, undefined, { ...existing.node.attrs, opts });
    v.dispatch(rep.setSelection(NodeSelection.create(rep.doc, existing.pos)));
    ensureHeadingIds(ed);
    refreshAll(ed);
    v.focus();
    return;
  }
  const doc = v.state.doc;
  const node = schema.nodes.ref_toc.create({ title: 'Contents', entries: [], opts });
  const tr = v.state.tr;
  let at: number;
  let replaceTo = -1;
  const $from = sel.$from;
  if (sel instanceof TextSelection && $from.depth >= 1) {
    const topNode = $from.node(1);
    const start = $from.before(1);
    const end = $from.after(1);
    if ($from.depth === 1 && topNode.isTextblock) {
      if (topNode.content.size === 0) { at = start; replaceTo = end; }
      else if ($from.parentOffset === 0) at = start;
      else if ($from.parentOffset === topNode.content.size) at = end;
      else {
        tr.split(sel.from);
        at = sel.from + 1;
      }
    } else at = end;
  } else if (sel.$from.depth >= 1) at = sel.$from.after(1);
  else at = Math.min(sel.to, doc.content.size);
  if (replaceTo >= 0) tr.replaceWith(at, replaceTo, node);
  else tr.insert(at, node);
  const afterPos = at + node.nodeSize;
  if (afterPos >= tr.doc.content.size) tr.insert(afterPos, schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(afterPos + 1, tr.doc.content.size)), 1));
  v.dispatch(tr.scrollIntoView());
  ensureHeadingIds(ed);
  refreshAll(ed);
  v.focus();
}

export function insertFiguresTable(ed: DocEditor, label: string): void {
  insertBlock(view(ed), schema.nodes.ref_figures.create({ title: `Table of ${label.toLowerCase()}s`, entries: [], opts: { label } }));
  refreshAll(ed);
}

export function insertIndex(ed: DocEditor): void {
  insertBlock(view(ed), schema.nodes.ref_index.create({ title: 'Index', entries: [], opts: {} }));
  refreshAll(ed);
}

export function insertBibliography(ed: DocEditor, all: boolean): void {
  insertBlock(view(ed), schema.nodes.ref_bibliography.create({ title: 'References', entries: [], opts: { scope: all ? 'all' : 'cited' } }));
  refreshAll(ed);
}

export function insertNote(ed: DocEditor, kind: 'footnote' | 'endnote', text: string): string {
  const id = newId('n_');
  insertInline(ed, schema.nodes.note_ref.create({ id, kind, n: '', text }));
  quick(ed);
  return id;
}

export function noteAt(ed: DocEditor): { id: string; text: string; kind: string } | null {
  const sel = view(ed).state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.note_ref) return { id: String(sel.node.attrs.id), text: String(sel.node.attrs.text), kind: String(sel.node.attrs.kind) };
  return null;
}

export function setNoteText(ed: DocEditor, id: string, text: string): boolean {
  const v = view(ed);
  const pos = locate(v.state.doc, `note:${id}`);
  const node = pos === null ? null : v.state.doc.nodeAt(pos);
  if (pos === null || !node) return false;
  v.dispatch(v.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text }));
  quick(ed);
  return true;
}

export function convertNotes(ed: DocEditor, to: 'footnote' | 'endnote'): number {
  const v = view(ed);
  const sel = v.state.selection;
  const only = sel instanceof NodeSelection && sel.node.type === schema.nodes.note_ref ? sel.from : -1;
  const tr = v.state.tr;
  let n = 0;
  for (const { pos, node } of inlineNodes(v.state.doc, 'note_ref')) {
    if (node.attrs.kind === to || (only >= 0 && pos !== only)) continue;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, kind: to });
    n++;
  }
  if (n) { v.dispatch(tr); quick(ed); }
  return n;
}

export function bookmarkNames(ed: DocEditor): string[] {
  return inlineNodes(view(ed).state.doc, 'bookmark').map((b) => String(b.node.attrs.name)).sort((a, b) => a.localeCompare(b));
}

export function addBookmark(ed: DocEditor, name: string): string | void {
  if (!BOOKMARK_NAME.test(name)) return 'Use a name that starts with a letter and has only letters, digits and underscores (up to 40).';
  const v = view(ed);
  const { state } = v;
  const sel = state.selection;
  const covered = state.doc.textBetween(sel.from, sel.to, ' ').trim().slice(0, 80);
  const text = covered || plainText(sel.$from.parent).slice(0, 60);
  const old = inlineNodes(state.doc, 'bookmark').find((b) => b.node.attrs.name === name);
  const tr = state.tr;
  let at = sel.from;
  if (old) { tr.delete(old.pos, old.pos + 1); at = tr.mapping.map(sel.from); }
  tr.insert(at, schema.nodes.bookmark.create({ name, text }));
  v.dispatch(tr.scrollIntoView());
  v.focus();
  quick(ed);
}

export function removeBookmark(ed: DocEditor, name: string): boolean {
  const v = view(ed);
  const b = inlineNodes(v.state.doc, 'bookmark').find((x) => x.node.attrs.name === name);
  if (!b) return false;
  v.dispatch(v.state.tr.delete(b.pos, b.pos + 1));
  quick(ed);
  return true;
}

export interface Target { value: string; label: string }

export function targetsFor(ed: DocEditor, kind: string): Target[] {
  const doc = view(ed).state.doc;
  if (kind === 'heading') return headings(doc).filter((h) => h.id).map((h: Heading) => ({ value: h.id, label: `${'  '.repeat(h.level - 1)}${h.text}` }));
  if (kind === 'bookmark') return bookmarkNames(ed).map((n) => ({ value: n, label: n }));
  if (kind === 'caption') return captions(doc).filter((c) => c.id).map((c) => ({ value: c.id, label: c.text.slice(0, 70) }));
  if (kind === 'note') return inlineNodes(doc, 'note_ref').map((x) => ({ value: String(x.node.attrs.id), label: `${x.node.attrs.kind === 'endnote' ? 'Endnote' : 'Footnote'} ${String(x.node.attrs.n)}: ${String(x.node.attrs.text).slice(0, 50)}` }));
  return [];
}

export const XREF_WHAT: Record<string, Array<[string, string]>> = {
  heading: [['text', 'Heading text'], ['page', 'Page number']],
  bookmark: [['text', 'Bookmark text'], ['page', 'Page number']],
  caption: [['label', 'Label and number'], ['number', 'Number only'], ['text', 'Entire caption'], ['page', 'Page number']],
  note: [['number', 'Note number'], ['page', 'Page number']],
};

export function insertCrossRef(ed: DocEditor, kind: string, target: string, what: string): string | void {
  if (!XREF_WHAT[kind]) return 'Choose what to refer to.';
  if (!targetsFor(ed, kind).some((t) => t.value === target)) return 'That target is not in this document.';
  if (!XREF_WHAT[kind].some((w) => w[0] === what)) what = XREF_WHAT[kind][0][0];
  insertInline(ed, schema.nodes.xref.create({ kind, target, what, result: '' }));
  quick(ed, what === 'page');
}

export function insertIndexEntry(ed: DocEditor, main: string, sub: string): string | void {
  if (!main.trim()) return 'Type the main entry.';
  insertInline(ed, schema.nodes.index_entry.create({ main: main.trim(), sub: sub.trim() }), true);
}

export function selectedText(ed: DocEditor): string {
  const { state } = view(ed);
  return state.selection.empty ? '' : state.doc.textBetween(state.selection.from, state.selection.to, ' ').trim().slice(0, 120);
}

export function insertCitation(ed: DocEditor, id: string, locator: string): string | void {
  const ids = id.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const known = new Set(sourcesOf(ed).map((s) => s.id));
  if (!ids.length || ids.some((x) => !known.has(x))) return 'Choose a source.';
  const locs = locator.split(';').map((x) => x.trim());
  const items: CiteItem[] = ids.filter((x, i) => ids.indexOf(x) === i).map((x, i) => ({ id: x, ...(locs[i] ? { locator: locs[i] } : {}) }));
  insertInline(ed, schema.nodes.citation.create({ items, result: '' }));
  refreshAll(ed);
}

export function addSource(ed: DocEditor, fields: Record<string, unknown>): string {
  const s = blankSource(newId('s_'));
  for (const [k, v] of Object.entries(fields)) if (k in s && k !== 'id' && k !== 'authors') (s as unknown as Record<string, unknown>)[k] = String(v ?? '');
  const raw = fields.authors;
  if (typeof raw === 'string') s.authors = raw.split(/\n|;/).map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf(','); return i < 0 ? { family: l, given: '' } : { family: l.slice(0, i).trim(), given: l.slice(i + 1).trim() }; });
  if (!s.title) throw new Error('A source needs a title.');
  saveSources(ed, [...sourcesOf(ed), s]);
  return s.id;
}

export interface CaptionSpot { at: number; label: string }

export function captionSpot(ed: DocEditor, above: boolean): CaptionSpot {
  const { state } = view(ed);
  const sel = state.selection;
  const kindLabel = (n: PMNode): string => (n.type === schema.nodes.image || n.type === schema.nodes.chart || n.type === schema.nodes.diagram || n.type === schema.nodes.mermaid || n.type === schema.nodes.shape ? 'Figure' : n.type === schema.nodes.math ? 'Equation' : 'Figure');
  if (sel instanceof NodeSelection && sel.$from.depth === 0) return { at: above ? sel.from : sel.to, label: sel.node.type.name === 'table' ? 'Table' : kindLabel(sel.node) };
  let label = 'Figure';
  if (sel instanceof NodeSelection) label = kindLabel(sel.node);
  for (let d = sel.$from.depth; d > 0; d--) if (sel.$from.node(d).type === schema.nodes.table) return { at: above ? sel.$from.before(d) : sel.$from.after(d), label: 'Table' };
  const d = Math.max(1, sel.$from.depth ? Math.min(sel.$from.depth, 1) : 1);
  return sel.$from.depth ? { at: above ? sel.$from.before(d) : sel.$from.after(d), label } : { at: sel.to, label };
}

export function insertCaption(ed: DocEditor, label: string, text: string, above: boolean): void {
  const v = view(ed);
  if (!ed.doc?.styles.Caption) ed.setStyles({ ...ed.doc!.styles, Caption: CAPTION_STYLE });
  const spot = captionSpot(ed, above);
  const lab = label.trim() || spot.label;
  const kids: PMNode[] = [schema.nodes.seq.create({ label: lab, n: '1' })];
  if (text.trim()) kids.push(schema.text(`: ${text.trim()}`));
  const para = schema.nodes.paragraph.create({ style: 'Caption' }, kids);
  const tr = v.state.tr.insert(spot.at, para);
  tr.setSelection(TextSelection.near(tr.doc.resolve(spot.at + para.nodeSize - 1), -1));
  v.dispatch(tr.scrollIntoView());
  v.focus();
  quick(ed);
}

export function defaultCaptionLabel(ed: DocEditor): string {
  return captionSpot(ed, false).label;
}

export function linkToTarget(ed: DocEditor, target: string, text: string): string | void {
  const v = view(ed);
  if (!locate(v.state.doc, target)) return 'That target is not in this document.';
  const mark = schema.marks.link.create({ href: `#${target}` });
  const { state } = v;
  const sel = state.selection;
  if (sel.empty || sel instanceof NodeSelection) {
    const label = text.trim() || 'link';
    v.dispatch(state.tr.replaceSelectionWith(schema.text(label, [mark]), false).scrollIntoView());
  } else v.dispatch(state.tr.addMark(sel.from, sel.to, mark));
  v.focus();
}

export interface PageInfo { url: string; title: string; site: string; fetched: boolean; description?: string }

export async function fetchPage(url: string): Promise<PageInfo> {
  try {
    const r = await api.get<PageInfo>(`/refs/link-title?url=${encodeURIComponent(url)}`);
    const host = hostOf(url);
    return { url, title: r.title || host, site: r.site || host, fetched: !!r.title, description: r.description ?? '' };
  } catch {
    const host = hostOf(url);
    return { url, title: host, site: host, fetched: false };
  }
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

export function linkUnderSelection(ed: DocEditor): { href: string; from: number; to: number } | null {
  const { state } = view(ed);
  const sel = state.selection;
  const linkMark = schema.marks.link;
  let found: { href: string; from: number; to: number } | null = null;
  const probe = sel.empty ? [sel.$from.pos - 1, sel.$from.pos] : [sel.from, sel.to];
  state.doc.nodesBetween(Math.max(0, probe[0]), Math.min(state.doc.content.size, Math.max(probe[1], probe[0] + 1)), (node, pos) => {
    if (found || !node.isText) return;
    const m = node.marks.find((x) => x.type === linkMark);
    if (m) found = { href: String(m.attrs.href), from: pos, to: pos + node.nodeSize };
  });
  if (found) {
    const f = found as { href: string; from: number; to: number };
    let from = f.from, to = f.to;
    const href = f.href;
    const $f = state.doc.resolve(from);
    const parent = $f.parent;
    const start = $f.start();
    parent.forEach((child, off) => {
      const a = start + off, b = a + child.nodeSize;
      if (child.isText && child.marks.some((x) => x.type === linkMark && x.attrs.href === href)) { if (b === from) from = a; if (a === to) to = b; }
    });
    return { href, from, to };
  }
  return null;
}

export async function makeLinkChip(ed: DocEditor, url: string, fetchTitle: boolean): Promise<PageInfo> {
  const clean = normalizeUrl(url);
  if (!clean) throw new Error('Type a web address that starts with http or https.');
  const info = fetchTitle ? await fetchPage(clean) : { url: clean, title: hostOf(clean), site: hostOf(clean), fetched: false };
  const v = view(ed);
  const under = linkUnderSelection(ed);
  const node = schema.nodes.link_chip.create({ href: clean, title: info.title, site: info.site, desc: info.description ?? '' });
  const tr = v.state.tr;
  if (under && under.href === clean) tr.replaceWith(under.from, under.to, node);
  else tr.replaceSelectionWith(node, false);
  v.dispatch(tr.scrollIntoView());
  v.focus();
  return info;
}

export function chipToLink(ed: DocEditor): boolean {
  const v = view(ed);
  const sel = v.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.link_chip) return false;
  const a = sel.node.attrs;
  v.dispatch(v.state.tr.replaceWith(sel.from, sel.to, schema.text(String(a.title || a.href), [schema.marks.link.create({ href: String(a.href) })])));
  return true;
}
