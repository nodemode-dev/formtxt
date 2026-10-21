import type { DOMOutputSpec, NodeSpec } from 'prosemirror-model';
import { type AreaSpec, emptySpec } from './types';

export interface RefEntry {
  text: string;
  level?: number;
  page?: string;
  target?: string;
  n?: string;
  heading?: boolean;
  em?: string[];
}

type Child = string | DOMOutputSpec;

function parts(text: string, em: string[] | undefined): Child[] {
  for (const e of em ?? []) {
    const at = e ? text.indexOf(e) : -1;
    if (at >= 0) return [text.slice(0, at), ['em', e] as DOMOutputSpec, ...parts(text.slice(at + e.length), (em ?? []).filter((x) => x !== e))];
  }
  return [text];
}

function entryDom(e: RefEntry): DOMOutputSpec {
  if (e.heading) return ['div', { class: 'ft-ref-entry ft-ref-letter' }, e.text];
  const kids: DOMOutputSpec[] = [];
  if (e.n) kids.push(['span', { class: 'ft-ref-n' }, e.n]);
  kids.push(['span', { class: 'ft-ref-text' }, ...parts(e.text, e.em)]);
  if (e.page) kids.push(['span', { class: 'ft-ref-dots' }], ['span', { class: 'ft-ref-page' }, e.page]);
  return ['div', { class: `ft-ref-entry lv${Math.max(0, Math.min(8, Number(e.level) || 0))}`, 'data-target': e.target ?? '' }, ...kids];
}

function readRef(dom: HTMLElement): Record<string, unknown> {
  try { return JSON.parse(dom.dataset.ref ?? '{}') as Record<string, unknown>; } catch { return {}; }
}

function block(kind: string, title: string): NodeSpec {
  return {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { title: { default: title }, entries: { default: [] }, opts: { default: {} } },
    parseDOM: [{ tag: `div.ft-refblock[data-kind="${kind}"]`, getAttrs: (dom: HTMLElement) => readRef(dom) }],
    toDOM: (n) => {
      const opts = n.attrs.opts as Record<string, unknown>;
      return ['div', { class: 'ft-refblock', 'data-kind': kind, 'data-style': String(opts.style ?? ''), contenteditable: 'false', 'data-ref': JSON.stringify({ title: n.attrs.title, entries: n.attrs.entries, opts }) },
        ['div', { class: 'ft-refblock-head' }, ['span', { class: 'ft-refblock-title' }, String(n.attrs.title)], ['button', { type: 'button', class: 'ft-refblock-update', 'data-update': '1' }, 'Update']],
        ...(n.attrs.entries as RefEntry[]).map(entryDom)];
    },
  };
}

const inline = (extra: NodeSpec): NodeSpec => ({ inline: true, group: 'inline', atom: true, selectable: true, ...extra });

export const SPEC: AreaSpec = emptySpec();

SPEC.nodes.ref_toc = block('toc', 'Contents');
SPEC.nodes.ref_bibliography = block('bibliography', 'References');
SPEC.nodes.ref_figures = block('figures', 'Table of figures');
SPEC.nodes.ref_index = block('index', 'Index');
SPEC.nodes.ref_notes = block('notes', 'Notes');

SPEC.nodes.note_ref = inline({
  attrs: { id: { default: '' }, kind: { default: 'footnote' }, n: { default: '' }, text: { default: '' } },
  parseDOM: [{ tag: 'sup.ft-noteref', getAttrs: (dom: HTMLElement) => ({ id: dom.dataset.id || '', kind: dom.dataset.kind || 'footnote', n: dom.textContent || '', text: dom.dataset.text || '' }) }],
  toDOM: (n) => ['sup', { class: 'ft-noteref', contenteditable: 'false', 'data-id': String(n.attrs.id), 'data-kind': String(n.attrs.kind), 'data-text': String(n.attrs.text), title: String(n.attrs.text) }, String(n.attrs.n)],
});

SPEC.nodes.bookmark = inline({
  attrs: { name: { default: '' }, text: { default: '' } },
  parseDOM: [{ tag: 'span.ft-bookmark', getAttrs: (dom: HTMLElement) => ({ name: dom.dataset.name || '', text: dom.dataset.text || '' }) }],
  toDOM: (n) => ['span', { class: 'ft-bookmark', contenteditable: 'false', 'data-name': String(n.attrs.name), 'data-text': String(n.attrs.text), title: `Bookmark: ${String(n.attrs.name)}` }],
});

SPEC.nodes.seq = inline({
  attrs: { label: { default: 'Figure' }, n: { default: '1' } },
  parseDOM: [{ tag: 'span.ft-seq', getAttrs: (dom: HTMLElement) => ({ label: dom.dataset.label || 'Figure', n: dom.dataset.n || '1' }) }],
  toDOM: (n) => ['span', { class: 'ft-seq', contenteditable: 'false', 'data-label': String(n.attrs.label), 'data-n': String(n.attrs.n) }, `${String(n.attrs.label)} ${String(n.attrs.n)}`],
});

SPEC.nodes.xref = inline({
  attrs: { kind: { default: 'heading' }, target: { default: '' }, what: { default: 'text' }, result: { default: '' } },
  parseDOM: [{ tag: 'span.ft-xref', getAttrs: (dom: HTMLElement) => ({ kind: dom.dataset.kind || 'heading', target: dom.dataset.target || '', what: dom.dataset.what || 'text', result: dom.textContent || '' }) }],
  toDOM: (n) => ['span', { class: 'ft-xref', contenteditable: 'false', 'data-kind': String(n.attrs.kind), 'data-target': String(n.attrs.target), 'data-what': String(n.attrs.what), ...(n.attrs.result ? {} : { 'data-missing': '1' }) }, String(n.attrs.result || 'Reference not found')],
});

SPEC.nodes.index_entry = inline({
  attrs: { main: { default: '' }, sub: { default: '' } },
  parseDOM: [{ tag: 'span.ft-idx', getAttrs: (dom: HTMLElement) => ({ main: dom.dataset.main || '', sub: dom.dataset.sub || '' }) }],
  toDOM: (n) => ['span', { class: 'ft-idx', contenteditable: 'false', 'data-main': String(n.attrs.main), 'data-sub': String(n.attrs.sub) }, `Index: ${String(n.attrs.main)}${n.attrs.sub ? ` / ${String(n.attrs.sub)}` : ''}`],
});

SPEC.nodes.citation = inline({
  attrs: { items: { default: [] }, result: { default: '' } },
  parseDOM: [{ tag: 'span.ft-cite', getAttrs: (dom: HTMLElement) => { try { return { items: JSON.parse(dom.dataset.items ?? '[]') as unknown, result: dom.textContent || '' }; } catch { return { items: [], result: dom.textContent || '' }; } } }],
  toDOM: (n) => ['span', { class: 'ft-cite', contenteditable: 'false', 'data-items': JSON.stringify(n.attrs.items) }, String(n.attrs.result || '(source)')],
});

SPEC.nodes.link_chip = inline({
  attrs: { href: { default: '' }, title: { default: '' }, site: { default: '' } },
  parseDOM: [{ tag: 'a.ft-linkchip', getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute('href') || '', title: dom.dataset.title || '', site: dom.dataset.site || '' }) }],
  toDOM: (n) => ['a', { class: 'ft-linkchip', href: String(n.attrs.href), rel: 'noopener', target: '_blank', contenteditable: 'false', 'data-title': String(n.attrs.title), 'data-site': String(n.attrs.site), title: String(n.attrs.href) }, ['span', { class: 'ft-linkchip-site' }, String(n.attrs.site)], ['span', { class: 'ft-linkchip-title' }, String(n.attrs.title)]],
});
