import { Fragment, Slice, type Mark, type Node as PMNode } from 'prosemirror-model';
import { Selection, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { blocksToNodes } from '../../convert';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { isPlain, parseMarkdown, type MdOptions } from './markdown';

export interface Range { from: number; to: number; text: string }

export function docMarkdown(doc: PMNode): string {
  const out: string[] = [];
  const walk = (node: PMNode): void => {
    node.forEach((child) => {
      const name = child.type.name;
      if (name === 'paragraph') {
        const text = child.textContent.trim();
        if (!text) return;
        const style = String(child.attrs.style || '');
        const h = /^Heading(\d)$/.exec(style);
        if (h) out.push(`${'#'.repeat(Number(h[1]))} ${text}`);
        else if (style === 'Title') out.push(`# ${text}`);
        else if (child.attrs.list) {
          const pad = '  '.repeat(Number(child.attrs.level) || 0);
          out.push(`${pad}${child.attrs.list === 'number' ? '1.' : child.attrs.list === 'check' ? '- [ ]' : '-'} ${text}`);
        } else if (style === 'Quote') out.push(`> ${text}`);
        else out.push(text);
      } else if (name === 'code_block') out.push(child.textContent);
      else if (name === 'table') {
        child.forEach((row) => {
          const cells: string[] = [];
          row.forEach((cell) => cells.push(cell.textContent.replace(/\|/g, '/').trim()));
          out.push(`| ${cells.join(' | ')} |`);
        });
      }
    });
  };
  walk(doc);
  return out.join('\n\n');
}

export function selectionRange(view: EditorView): Range | null {
  const { from, to, empty } = view.state.selection;
  if (empty) return null;
  const text = view.state.doc.textBetween(from, to, '\n\n', ' ').trim();
  return text ? { from, to, text } : null;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function withBase(frag: Fragment, base: readonly Mark[]): Fragment {
  if (!base.length) return frag;
  const nodes: PMNode[] = [];
  frag.forEach((n) => nodes.push(n.isText ? n.mark(base.reduce((set, m) => m.addToSet(set), n.marks)) : n));
  return Fragment.fromArray(nodes);
}

function textblockDepth(view: EditorView, pos?: number): number {
  const $p = view.state.doc.resolve(pos ?? view.state.selection.to);
  let d = $p.depth;
  while (d > 0 && !$p.node(d).isTextblock) d--;
  return d;
}

export function insertAtCaret(ed: DocEditor, md: string, opts: MdOptions = {}): number {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const blocks = parseMarkdown(md.replace(/[ \t]?\[\d{1,2}\]/g, ''), opts);
  if (!blocks.length) throw new Error('The answer was empty.');
  const nodes = blocksToNodes(blocks);
  const tr = view.state.tr;
  if (isPlain(blocks) && nodes[0]?.type === schema.nodes.paragraph) {
    const sel = view.state.selection;
    const start = sel.from;
    const frag = withBase(nodes[0].content, sel.$from.marks());
    tr.replaceSelection(new Slice(frag, 0, 0));
    tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(start + frag.size, -1)), -1));
  } else {
    const d = textblockDepth(view);
    const $f = view.state.selection.$to;
    const blank = d > 0 && $f.node(d).type === schema.nodes.paragraph && $f.node(d).content.size === 0;
    const at = d > 0 ? (blank ? $f.before(d) : $f.after(d)) : $f.pos;
    const end = d > 0 && blank ? $f.after(d) : at;
    tr.replaceWith(at, end, nodes);
    const size = nodes.reduce((n, x) => n + x.nodeSize, 0);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, at + size)), -1));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return wordCount(md);
}

function currentText(view: EditorView, r: Range): boolean {
  return r.to <= view.state.doc.content.size && view.state.doc.textBetween(r.from, r.to, '\n\n', ' ').trim() === r.text;
}

export function replaceRange(ed: DocEditor, r: Range, md: string): void {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  if (!currentText(view, r)) throw new Error('The selection changed. Select the text again.');
  const blocks = parseMarkdown(md);
  if (!blocks.length) throw new Error('The answer was empty.');
  const nodes = blocksToNodes(blocks);
  const $f = view.state.doc.resolve(r.from);
  const $t = view.state.doc.resolve(r.to);
  const tr = view.state.tr;
  if (isPlain(blocks) && $f.parent === $t.parent && $f.parent.isTextblock) {
    const base = ($f.nodeAfter?.marks ?? $f.marks()).filter((m) => m.type !== schema.marks.link);
    const frag = withBase(nodes[0].content, base);
    tr.replaceWith(r.from, r.to, frag);
    tr.setSelection(TextSelection.create(tr.doc, r.from, r.from + frag.size));
  } else {
    tr.replaceRange(r.from, r.to, new Slice(Fragment.fromArray(nodes), 0, 0));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function insertBelow(ed: DocEditor, r: Range, md: string): void {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const nodes = blocksToNodes(parseMarkdown(md));
  const d = textblockDepth(view, r.to);
  const $t = view.state.doc.resolve(r.to);
  const at = d > 0 ? $t.after(d) : r.to;
  const tr = view.state.tr.insert(at, nodes);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function collectParagraphs(view: EditorView): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  view.state.doc.descendants((node) => {
    if (node.type !== schema.nodes.paragraph) return true;
    let pure = node.childCount > 0;
    node.forEach((c) => { if (!c.isText) pure = false; });
    if (pure && node.textContent.trim()) out.push({ id: String(node.attrs.id || ''), text: node.textContent });
    return false;
  });
  return out;
}

function findParagraph(view: EditorView, id: string, text: string): { node: PMNode; pos: number } | null {
  let hit: { node: PMNode; pos: number } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type !== schema.nodes.paragraph) return true;
    if ((id && node.attrs.id === id) || (!id && node.textContent === text)) hit = { node, pos };
    return false;
  });
  return hit;
}

export function paragraphText(view: EditorView, id: string): string | null {
  return findParagraph(view, id, '')?.node.textContent ?? null;
}

export function applyParagraphText(view: EditorView, id: string, oldText: string, next: string): boolean {
  const hit = findParagraph(view, id, oldText);
  if (!hit) return false;
  const cur = hit.node.textContent;
  if (cur !== oldText) return false;
  let pre = 0;
  while (pre < cur.length && pre < next.length && cur[pre] === next[pre]) pre++;
  let suf = 0;
  while (suf < cur.length - pre && suf < next.length - pre && cur[cur.length - 1 - suf] === next[next.length - 1 - suf]) suf++;
  const from = hit.pos + 1 + pre;
  const to = hit.pos + 1 + cur.length - suf;
  const insert = next.slice(pre, next.length - suf);
  const $f = view.state.doc.resolve(pre > 0 ? from - 1 : from);
  const marks = (pre > 0 ? $f.nodeBefore?.marks : view.state.doc.resolve(from).nodeAfter?.marks) ?? [];
  const tr = view.state.tr;
  if (insert) tr.replaceWith(from, to, schema.text(insert, marks)); else tr.delete(from, to);
  view.dispatch(tr);
  return true;
}

export function summaryRange(doc: PMNode): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  doc.forEach((node, pos) => {
    if (node.type === schema.nodes.paragraph && node.attrs.aiBlock === 'summary') {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
  });
  return from < 0 ? null : { from, to };
}

export function setSummary(ed: DocEditor, md: string): 'inserted' | 'refreshed' {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const body = parseMarkdown(md.replace(/^\s*#{1,6}\s+summary\s*\n+/i, ''));
  const nodes = blocksToNodes([{ type: 'paragraph', id: '', style: 'Heading2', content: [{ type: 'text', text: 'Summary' }] } as never, ...body]).map((n) =>
    n.type === schema.nodes.paragraph ? n.type.create({ ...n.attrs, aiBlock: 'summary' }, n.content, n.marks) : n);
  const existing = summaryRange(view.state.doc);
  const tr = view.state.tr;
  if (existing) {
    tr.replaceWith(existing.from, existing.to, nodes);
    view.dispatch(tr.scrollIntoView());
    return 'refreshed';
  }
  let at = 0;
  const first = view.state.doc.firstChild;
  if (first && first.type === schema.nodes.paragraph && first.attrs.style === 'Title') at = first.nodeSize;
  tr.insert(at, nodes);
  view.dispatch(tr.scrollIntoView());
  return 'inserted';
}

export function insertQuote(ed: DocEditor, quote: string, docId: string, title: string): void {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const chip = schema.nodes.chip.create({ kind: 'doc', doc: docId, title });
  const para = schema.nodes.paragraph.create({ style: 'Quote' }, [schema.text(`“${quote}” `), chip]);
  const d = textblockDepth(view);
  const $f = view.state.selection.$to;
  const blank = d > 0 && $f.node(d).type === schema.nodes.paragraph && $f.node(d).content.size === 0;
  const at = d > 0 ? (blank ? $f.before(d) : $f.after(d)) : $f.pos;
  view.dispatch(view.state.tr.replaceWith(at, d > 0 && blank ? $f.after(d) : at, para).scrollIntoView());
  view.focus();
}

export function replaceInline(ed: DocEditor, r: Range, text: string): void {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  if (!currentText(view, r)) throw new Error('The selection changed. Select the word again.');
  const $f = view.state.doc.resolve(r.from);
  const marks = $f.nodeAfter?.marks ?? $f.marks();
  const tr = view.state.tr.replaceWith(r.from, r.to, schema.text(text, marks));
  tr.setSelection(TextSelection.create(tr.doc, r.from, r.from + text.length));
  view.dispatch(tr);
  view.focus();
}

export function wordRange(view: EditorView): Range | null {
  const sel = selectionRange(view);
  if (sel) return sel.text.length <= 60 && !sel.text.includes('\n') ? sel : null;
  const $p = view.state.selection.$from;
  if (!$p.parent.isTextblock) return null;
  const text = $p.parent.textContent;
  const off = $p.parentOffset;
  let a = off;
  let b = off;
  const w = /[\p{L}\p{N}'-]/u;
  while (a > 0 && w.test(text[a - 1])) a--;
  while (b < text.length && w.test(text[b])) b++;
  if (a === b) return null;
  const start = $p.start();
  return { from: start + a, to: start + b, text: text.slice(a, b) };
}
