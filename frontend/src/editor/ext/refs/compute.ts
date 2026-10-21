import type { Node as PMNode } from 'prosemirror-model';
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { DocEditor } from '../../editor';
import { numberFormat } from '../../pages';
import { schema } from '../../schema';
import type { RefEntry } from '../refs-spec';
import { type CiteItem, type Source, inText, reference, sortKey, styleTitle } from './cite';
import { type Caption, captions, headings, inlineNodes, newId, pageLabeler, plainText, sourcesOf, styleOf } from './util';

export interface UpdateOpts { blocks: boolean; pages: boolean }

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function citeOrder(cites: Array<{ node: PMNode }>): Map<string, number> {
  const order = new Map<string, number>();
  for (const c of cites) for (const it of c.node.attrs.items as CiteItem[]) if (!order.has(it.id)) order.set(it.id, order.size + 1);
  return order;
}

export function buildUpdate(ed: DocEditor, view: EditorView, opts: UpdateOpts): { tr: Transaction; count: number } | null {
  const doc = view.state.doc;
  const tr = view.state.tr;
  let count = 0;
  const setAttrs = (pos: number, node: PMNode, patch: Record<string, unknown>): void => {
    const next = { ...node.attrs, ...patch };
    if (!same(next, node.attrs)) { tr.setNodeMarkup(pos, undefined, next); count++; }
  };
  const style = styleOf(ed);
  const sources = sourcesOf(ed);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const label = opts.pages ? pageLabeler(ed) : null;

  const noteRefs = inlineNodes(doc, 'note_ref');
  const perKind: Record<string, number> = {};
  const seen = new Set<string>();
  const notes: Array<{ kind: string; id: string; n: string; text: string; pos: number }> = [];
  const noteById = new Map<string, { n: string; pos: number }>();
  for (const { pos, node } of noteRefs) {
    const kind = node.attrs.kind === 'endnote' ? 'endnote' : 'footnote';
    perKind[kind] = (perKind[kind] ?? 0) + 1;
    const n = kind === 'endnote' ? numberFormat(perKind[kind], 'lowerRoman') : String(perKind[kind]);
    let id = String(node.attrs.id);
    if (!id || seen.has(id)) id = newId('n_');
    seen.add(id);
    setAttrs(pos, node, { n, id });
    notes.push({ kind, id, n, text: String(node.attrs.text), pos });
    noteById.set(id, { n, pos });
  }

  const seqCount: Record<string, number> = {};
  const caps: Caption[] = [];
  const capSeen = new Set<number>();
  for (const { pos, node } of inlineNodes(doc, 'seq')) {
    const lab = String(node.attrs.label);
    const n = String((seqCount[lab] = (seqCount[lab] ?? 0) + 1));
    setAttrs(pos, node, { n });
    const $p = doc.resolve(pos);
    const para = $p.parent;
    const paraPos = $p.before();
    if (capSeen.has(paraPos)) continue;
    capSeen.add(paraPos);
    caps.push({ pos: paraPos, id: String((para.attrs.id as string | null) ?? ''), label: lab, n, text: plainText(para).replace(`${lab} ${String(node.attrs.n)}`, `${lab} ${n}`) });
  }

  const cites = inlineNodes(doc, 'citation');
  const order = citeOrder(cites);
  for (const { pos, node } of cites) setAttrs(pos, node, { result: inText(style, node.attrs.items as CiteItem[], byId, order) });

  const hs = headings(doc);
  const bookmarks = inlineNodes(doc, 'bookmark');
  const pageAt = (pos: number): string => (label ? label(pos) : '');
  for (const { pos, node } of inlineNodes(doc, 'xref')) {
    const target = String(node.attrs.target);
    const what = String(node.attrs.what);
    let result = '';
    let at = -1;
    const kind = String(node.attrs.kind);
    if (kind === 'heading') {
      const h = hs.find((x) => x.id === target);
      if (h) { at = h.pos + 1; result = h.text; }
    } else if (kind === 'bookmark') {
      const b = bookmarks.find((x) => x.node.attrs.name === target);
      if (b) { at = b.pos; result = String(b.node.attrs.text || b.node.attrs.name); }
    } else if (kind === 'caption') {
      const c = caps.find((x) => x.id === target);
      if (c) { at = c.pos + 1; result = what === 'number' ? c.n : what === 'label' ? `${c.label} ${c.n}` : c.text; }
    } else if (kind === 'note') {
      const nn = noteById.get(target);
      if (nn) { at = nn.pos; result = nn.n; }
    }
    if (at >= 0 && what === 'page') result = label ? pageAt(at) : String(node.attrs.result);
    setAttrs(pos, node, { result });
  }

  if (opts.blocks) {
    doc.forEach((node, pos) => {
      const name = node.type.name;
      const o = node.attrs.opts as Record<string, unknown>;
      let entries: RefEntry[] | null = null;
      let title = String(node.attrs.title);
      if (name === 'ref_toc') {
        const from = Number(o.from) || 1;
        const to = Number(o.to) || 3;
        entries = hs.filter((h) => h.level >= from && h.level <= to).map((h) => ({ text: h.text, level: h.level - from, ...(o.pages !== false && label ? { page: pageAt(h.pos + 1) } : {}), ...(o.links !== false && h.id ? { target: h.id } : {}) }));
      } else if (name === 'ref_figures') {
        entries = caps.filter((c) => c.label === String(o.label || 'Figure')).map((c) => ({ text: c.text, ...(label ? { page: pageAt(c.pos + 1) } : {}), ...(c.id ? { target: c.id } : {}) }));
      } else if (name === 'ref_index') {
        entries = indexEntries(doc, label);
      } else if (name === 'ref_bibliography') {
        entries = bibliography(style, sources, order, o.scope === 'all');
        title = styleTitle(style);
        setAttrs(pos, node, { opts: { ...o, style } });
      }
      if (entries && (!same(entries, node.attrs.entries) || title !== node.attrs.title)) {
        const fresh = tr.doc.nodeAt(pos);
        if (fresh) { tr.setNodeMarkup(pos, undefined, { ...fresh.attrs, entries, title }); count++; }
      }
    });
  }

  const wanted = (['footnote', 'endnote'] as const).map((kind) => ({ kind, entries: notes.filter((x) => x.kind === kind).map((x): RefEntry => ({ n: x.n, text: x.text, target: `note:${x.id}` })) })).filter((x) => x.entries.length);
  const existing: Array<{ pos: number; node: PMNode }> = [];
  doc.forEach((node, pos) => { if (node.type === schema.nodes.ref_notes) existing.push({ pos, node }); });
  const tailOk = existing.length === wanted.length && existing.every((e, i) => e.node.attrs.opts.kind === wanted[i].kind && e.pos + e.node.nodeSize + existing.slice(i + 1).reduce((a, x) => a + x.node.nodeSize, 0) === doc.content.size);
  const titleOf = (k: string): string => (k === 'endnote' ? 'Endnotes' : 'Footnotes');
  if (tailOk) {
    existing.forEach((e, i) => {
      if (!same(e.node.attrs.entries, wanted[i].entries)) { tr.setNodeMarkup(e.pos, undefined, { ...e.node.attrs, entries: wanted[i].entries }); count++; }
    });
  } else {
    for (const e of [...existing].reverse()) tr.delete(e.pos, e.pos + e.node.nodeSize);
    let at = tr.doc.content.size;
    for (const w of wanted) {
      const block = schema.nodes.ref_notes.create({ title: titleOf(w.kind), entries: w.entries, opts: { kind: w.kind } });
      tr.insert(at, block);
      at += block.nodeSize;
    }
    count++;
  }
  return count ? { tr, count } : null;
}

function indexEntries(doc: PMNode, label: ((pos: number) => string) | null): RefEntry[] {
  interface Slot { text: string; pages: string[]; target: string }
  const groups = new Map<string, { main: Slot; subs: Map<string, Slot> }>();
  const add = (slot: Slot, page: string, target: string): void => {
    if (page && !slot.pages.includes(page)) slot.pages.push(page);
    if (!slot.target) slot.target = target;
  };
  for (const { pos, node } of inlineNodes(doc, 'index_entry')) {
    const main = String(node.attrs.main).trim();
    if (!main) continue;
    const sub = String(node.attrs.sub).trim();
    const key = main.toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { main: { text: main, pages: [], target: '' }, subs: new Map() }; groups.set(key, g); }
    const target = String((doc.resolve(pos).parent.attrs.id as string | null) ?? '');
    const page = label ? label(pos) : '';
    if (!sub) add(g.main, page, target);
    else {
      let s = g.subs.get(sub.toLowerCase());
      if (!s) { s = { text: sub, pages: [], target: '' }; g.subs.set(sub.toLowerCase(), s); }
      add(s, page, target);
    }
  }
  const out: RefEntry[] = [];
  let letter = '';
  const mk = (s: Slot, level: number): RefEntry => ({ text: s.text, ...(level ? { level } : {}), ...(s.pages.length ? { page: s.pages.join(', ') } : {}), ...(s.target ? { target: s.target } : {}) });
  for (const g of Array.from(groups.values()).sort((a, b) => a.main.text.localeCompare(b.main.text, undefined, { sensitivity: 'base' }))) {
    const first = g.main.text[0].toUpperCase();
    const l = /[A-Z]/.test(first) ? first : '#';
    if (l !== letter) { letter = l; out.push({ text: l, heading: true }); }
    out.push(mk(g.main, 0));
    for (const s of Array.from(g.subs.values()).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }))) out.push(mk(s, 1));
  }
  return out;
}

function bibliography(style: string, sources: Source[], order: Map<string, number>, all: boolean): RefEntry[] {
  let list = sources.filter((s) => all || order.has(s.id));
  if (style === 'ieee') list = [...list].sort((a, b) => (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
  else list = [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  let uncited = order.size;
  return list.map((s) => {
    const f = reference(style, s);
    const e: RefEntry = { text: f.text };
    if (f.em.length) e.em = f.em;
    if (style === 'ieee') e.n = `[${order.get(s.id) ?? ++uncited}]`;
    return e;
  });
}

export function updateAll(ed: DocEditor): number {
  const view = ed.view;
  if (!view) return 0;
  let changed = 0;
  ed.paginator.layoutNow();
  for (let pass = 0; pass < 3; pass++) {
    const u = buildUpdate(ed, view, { blocks: true, pages: true });
    if (!u) break;
    view.dispatch(u.tr.setMeta('addToHistory', false).setMeta('refs', true));
    changed += u.count;
    ed.paginator.layoutNow();
  }
  return changed;
}
