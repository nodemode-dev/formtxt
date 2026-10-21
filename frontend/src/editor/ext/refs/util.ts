import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { DocEditor } from '../../editor';
import { numberFormat } from '../../pages';
import { schema } from '../../schema';
import { type Source, cleanSource } from './cite';

export function newId(prefix: string): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

const leafText = (n: PMNode): string => {
  const a = n.attrs;
  switch (n.type.name) {
    case 'seq': return `${String(a.label)} ${String(a.n)}`;
    case 'xref': case 'citation': return String(a.result);
    case 'field': return String(a.result);
    case 'math': return String(a.latex);
    case 'tab': case 'hard_break': return ' ';
    default: return '';
  }
};

export function plainText(node: PMNode): string {
  return node.textBetween(0, node.content.size, '', leafText).replace(/\s+/g, ' ').trim();
}

export interface Heading { pos: number; id: string; level: number; text: string }
export interface Caption { pos: number; id: string; label: string; n: string; text: string }
export interface Mark { pos: number; node: PMNode }

export function headingLevel(node: PMNode): number {
  const m = /^Heading([1-9])$/.exec(String(node.attrs.style ?? ''));
  return m ? Number(m[1]) : 0;
}

export function headings(doc: PMNode): Heading[] {
  const out: Heading[] = [];
  doc.forEach((node, pos) => {
    const level = node.type === schema.nodes.paragraph ? headingLevel(node) : 0;
    const text = level ? plainText(node) : '';
    if (level && text) out.push({ pos, id: String(node.attrs.id ?? ''), level, text });
  });
  return out;
}

export function captions(doc: PMNode): Caption[] {
  const out: Caption[] = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.paragraph) return node.isBlock && !node.isTextblock;
    let seq: PMNode | null = null;
    node.forEach((c) => { if (!seq && c.type === schema.nodes.seq) seq = c; });
    if (seq) out.push({ pos, id: String((node.attrs.id as string | null) ?? ''), label: String((seq as PMNode).attrs.label), n: String((seq as PMNode).attrs.n), text: plainText(node) });
    return false;
  });
  return out;
}

export function inlineNodes(doc: PMNode, typeName: string): Mark[] {
  const out: Mark[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === typeName) out.push({ pos, node });
    return true;
  });
  return out;
}

export function locate(doc: PMNode, target: string): number | null {
  if (!target) return null;
  let found: number | null = null;
  const bm = target.startsWith('bm:') ? target.slice(3) : '';
  const note = target.startsWith('note:') ? target.slice(5) : '';
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (bm) { if (node.type.name === 'bookmark' && node.attrs.name === bm) found = pos; }
    else if (note) { if (node.type.name === 'note_ref' && node.attrs.id === note) found = pos; }
    else if (!node.isInline && node.attrs.id === target) found = pos;
    return found === null;
  });
  return found;
}

export function jump(view: EditorView, target: string): boolean {
  const pos = locate(view.state.doc, target);
  if (pos === null) return false;
  const node = view.state.doc.nodeAt(pos);
  const sel = node && !node.isInline && node.isAtom ? NodeSelection.create(view.state.doc, pos) : TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)));
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  const dom = view.nodeDOM(pos);
  const target$ = dom instanceof HTMLElement ? dom : dom?.parentElement;
  target$?.scrollIntoView({ block: 'center' });
  return true;
}

export function pageLabeler(ed: DocEditor): ((pos: number) => string) | null {
  const view = ed.view;
  if (!view || ed.viewMode !== 'print' || (ed.doc?.settings as unknown as Record<string, unknown>)?.pageless) return null;
  const sheets = Array.from(ed.root.querySelectorAll<HTMLElement>('.ft-sheets .ft-sheet'));
  if (!sheets.length) return null;
  const tops = sheets.map((s) => s.getBoundingClientRect().top);
  if (tops.every((t) => t === 0)) return null;
  const starts = ed.paginator.sectionStarts.length ? ed.paginator.sectionStarts : [{ page: 0, id: ed.doc?.sections[0]?.id ?? '' }];
  const byId = new Map((ed.doc?.sections ?? []).map((s) => [s.id, s]));
  const labels: string[] = [];
  let prev = 0;
  for (let i = 0; i < sheets.length; i++) {
    let st = starts[0];
    for (const x of starts) if (x.page <= i) st = x;
    const sec = byId.get(st.id) ?? ed.doc!.sections[0];
    const restart = sec.pageNumberStart;
    const num = i === 0 ? Number(restart ?? 1) || 1 : st.page === i && typeof restart === 'number' && st.page > 0 ? restart : prev + 1;
    prev = num;
    labels.push(numberFormat(num, String(sec.pageNumberFormat ?? 'decimal')));
  }
  return (pos) => {
    let y: number;
    try { y = view.coordsAtPos(Math.max(1, Math.min(pos, view.state.doc.content.size))).top + 1; } catch { return ''; }
    let at = 0;
    for (let k = 0; k < tops.length; k++) if (tops[k] <= y) at = k;
    return labels[at] ?? '';
  };
}

export function insertBlock(view: EditorView, node: PMNode): void {
  const { state } = view;
  const sel = state.selection;
  const top = sel instanceof NodeSelection && sel.$from.depth === 0 ? null : sel.$from.depth ? sel.$from.node(1) : null;
  let from = sel.to;
  let to = sel.to;
  if (top) {
    from = sel.$from.before(1);
    to = sel.$from.after(1);
    if (!(top.type === schema.nodes.paragraph && top.childCount === 0)) from = to;
  }
  const nodes: PMNode[] = [node];
  if (to >= state.doc.content.size) nodes.push(schema.nodes.paragraph.create());
  const tr = state.tr.replaceWith(from, to, nodes);
  view.dispatch(tr.scrollIntoView());
}

export function sourcesOf(ed: DocEditor): Source[] {
  const raw = (ed.doc as unknown as { sources?: unknown } | null)?.sources;
  return Array.isArray(raw) ? raw.map(cleanSource).filter((s): s is Source => !!s) : [];
}

export function styleOf(ed: DocEditor): string {
  const s = (ed.doc?.settings as unknown as Record<string, unknown> | undefined)?.citationStyle;
  return typeof s === 'string' && ['apa', 'mla', 'chicago', 'ieee'].includes(s) ? s : 'apa';
}

export function touch(ed: DocEditor): void {
  const view = ed.view;
  if (!view) return;
  const first = view.state.doc.firstChild;
  if (!first || first.isText) return;
  view.dispatch(view.state.tr.setNodeMarkup(0, undefined, first.attrs).setMeta('addToHistory', false).setMeta('refs', true));
}

export function saveSources(ed: DocEditor, sources: Source[]): void {
  if (!ed.doc) return;
  ed.doc = { ...ed.doc, sources } as typeof ed.doc;
  touch(ed);
}

export function saveStyle(ed: DocEditor, style: string): void {
  if (!ed.doc) return;
  ed.doc = { ...ed.doc, settings: { ...ed.doc.settings, citationStyle: style } } as typeof ed.doc;
  touch(ed);
}
