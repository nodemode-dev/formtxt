import type { Node as PMNode } from 'prosemirror-model';
import type { RefEntry } from './refs-spec';
import { type AreaCodec, type BlockCodec, type InlineCodec, emptyCodec } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));

function rid(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'r_' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function cleanEntries(v: unknown): RefEntry[] {
  if (!Array.isArray(v)) return [];
  const out: RefEntry[] = [];
  for (const raw of v.slice(0, 5000)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const e: RefEntry = { text: str(r.text) };
    if (typeof r.level === 'number' && r.level > 0) e.level = Math.min(8, Math.floor(r.level));
    if (r.page) e.page = str(r.page);
    if (r.target) e.target = str(r.target);
    if (r.n) e.n = str(r.n);
    if (r.heading) e.heading = true;
    if (Array.isArray(r.em) && r.em.length) e.em = r.em.map(str).filter(Boolean);
    out.push(e);
  }
  return out;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});

function blockCodec(node: string): BlockCodec {
  return {
    node,
    toPM: (b, schema) => schema.nodes[node].create({ title: str(b.title) || schema.nodes[node].spec.attrs?.title?.default, entries: cleanEntries(b.entries), opts: obj(b.opts) }),
    fromPM: (n: PMNode) => {
      const out: Record<string, unknown> = { id: rid(), title: n.attrs.title, entries: cleanEntries(n.attrs.entries) };
      const opts = obj(n.attrs.opts);
      if (Object.keys(opts).length) out.opts = opts;
      return out;
    },
  };
}

function inlineCodec(node: string, keys: string[], textOf: (n: PMNode) => string): InlineCodec {
  return {
    node,
    toPM: (run, schema) => {
      const attrs: Record<string, unknown> = {};
      for (const k of keys) if (run[k] !== undefined && run[k] !== null) attrs[k] = run[k];
      return schema.nodes[node].create(attrs);
    },
    fromPM: (n) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = n.attrs[k];
      out.text = textOf(n);
      return out;
    },
  };
}

export const CODEC: AreaCodec = emptyCodec();

CODEC.blocks.toc = blockCodec('ref_toc');
CODEC.blocks.bibliography = blockCodec('ref_bibliography');
CODEC.blocks.tableOfFigures = blockCodec('ref_figures');
CODEC.blocks.index = blockCodec('ref_index');
CODEC.blocks.notes = blockCodec('ref_notes');

CODEC.inline.noteRef = inlineCodec('note_ref', ['id', 'kind', 'n'], () => '');
CODEC.inline.noteRef.fromPM = (n) => ({ id: n.attrs.id, kind: n.attrs.kind, n: n.attrs.n, note: n.attrs.text, text: n.attrs.n });
CODEC.inline.noteRef.toPM = (run, schema) => schema.nodes.note_ref.create({ id: str(run.id), kind: run.kind === 'endnote' ? 'endnote' : 'footnote', n: str(run.n), text: str(run.note) });
CODEC.inline.bookmark = inlineCodec('bookmark', ['name'], () => '');
CODEC.inline.bookmark.fromPM = (n) => ({ name: n.attrs.name, ...(n.attrs.text ? { covers: n.attrs.text } : {}), text: '' });
CODEC.inline.bookmark.toPM = (run, schema) => schema.nodes.bookmark.create({ name: str(run.name), text: str(run.covers) });
CODEC.inline.sequence = inlineCodec('seq', ['label', 'n'], (n) => `${String(n.attrs.label)} ${String(n.attrs.n)}`);
CODEC.inline.crossRef = inlineCodec('xref', ['kind', 'target', 'what'], (n) => String(n.attrs.result));
CODEC.inline.crossRef.toPM = (run, schema) => schema.nodes.xref.create({ kind: str(run.kind) || 'heading', target: str(run.target), what: str(run.what) || 'text', result: str(run.text) });
CODEC.inline.indexEntry = inlineCodec('index_entry', ['main', 'sub'], () => '');
CODEC.inline.citation = inlineCodec('citation', ['items'], (n) => String(n.attrs.result));
CODEC.inline.citation.toPM = (run, schema) => schema.nodes.citation.create({
  items: Array.isArray(run.items) ? run.items.filter((i) => i && typeof i === 'object').map((i) => ({ id: str((i as Record<string, unknown>).id), ...((i as Record<string, unknown>).locator ? { locator: str((i as Record<string, unknown>).locator) } : {}) })) : [],
  result: str(run.text),
});
CODEC.inline.linkChip = inlineCodec('link_chip', ['href', 'title', 'site'], (n) => String(n.attrs.title || n.attrs.site || n.attrs.href));
