import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { Block, FtxtDocument, TextRun } from '../engine/model';
import { schema } from './schema';

const FLAG_MARKS = ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'smallCaps', 'allCaps', 'code'] as const;
const PROPS = ['align', 'indent', 'spaceBefore', 'spaceAfter', 'lineSpacing'] as const;

function newId(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'p_' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function marksFrom(m: Record<string, unknown> | undefined): Mark[] {
  if (!m) return [];
  const out: Mark[] = [];
  for (const k of FLAG_MARKS) if (m[k]) out.push(schema.marks[k].create());
  if (typeof m.font === 'string' && m.font) out.push(schema.marks.font.create({ family: m.font }));
  if (typeof m.size === 'number' && m.size > 0) out.push(schema.marks.size.create({ pt: m.size }));
  if (typeof m.color === 'string' && m.color) out.push(schema.marks.color.create({ value: m.color }));
  if (typeof m.highlight === 'string' && m.highlight) out.push(schema.marks.highlight.create({ value: m.highlight }));
  if (typeof m.link === 'string' && m.link) out.push(schema.marks.link.create({ href: m.link }));
  return out;
}

function inlineNodes(content: TextRun[] | undefined): PMNode[] {
  const out: PMNode[] = [];
  for (const r of content ?? []) {
    const run = r as unknown as { type: string; text: string; marks?: Record<string, unknown> };
    if (run.type === 'break') out.push(schema.nodes.hard_break.create());
    else if (run.type === 'text' && run.text) out.push(schema.text(run.text, marksFrom(run.marks)));
  }
  return out;
}

export function toPM(doc: FtxtDocument, tabIndex = 0): PMNode {
  const blocks: PMNode[] = [];
  for (const b of doc.tabs[tabIndex]?.body ?? []) {
    const blk = b as Block & { type: string; text?: string; props?: Record<string, unknown>; list?: { kind: string; level: number; checked?: boolean } };
    if (blk.type === 'code') blocks.push(schema.nodes.code_block.create({ id: blk.id }, blk.text ? schema.text(blk.text) : null));
    else if (blk.type === 'pageBreak') blocks.push(schema.nodes.page_break.create());
    else {
      const p = blk.props ?? {};
      blocks.push(schema.nodes.paragraph.create({
        id: blk.id || newId(),
        style: blk.style || 'Normal',
        align: typeof p.align === 'string' ? p.align : '',
        indent: typeof p.indent === 'number' ? p.indent : 0,
        spaceBefore: typeof p.spaceBefore === 'number' ? p.spaceBefore : null,
        spaceAfter: typeof p.spaceAfter === 'number' ? p.spaceAfter : null,
        lineSpacing: typeof p.lineSpacing === 'number' ? p.lineSpacing : null,
        list: blk.list?.kind ?? '',
        level: blk.list?.level ?? 0,
        checked: !!blk.list?.checked,
      }, inlineNodes(blk.content)));
    }
  }
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create({ id: newId() }));
  return schema.nodes.doc.create(null, blocks);
}

function runFrom(node: PMNode): Record<string, unknown> {
  if (node.type.name === 'hard_break') return { type: 'break' };
  const marks: Record<string, unknown> = {};
  for (const m of node.marks) {
    const n = m.type.name;
    if ((FLAG_MARKS as readonly string[]).includes(n)) marks[n] = true;
    else if (n === 'font') marks.font = m.attrs.family;
    else if (n === 'size') marks.size = m.attrs.pt;
    else if (n === 'color') marks.color = m.attrs.value;
    else if (n === 'highlight') marks.highlight = m.attrs.value;
    else if (n === 'link') marks.link = m.attrs.href;
  }
  const out: Record<string, unknown> = { type: 'text', text: node.text ?? '' };
  if (Object.keys(marks).length) out.marks = marks;
  return out;
}

export function fromPM(pm: PMNode, section: string): Block[] {
  const out: Block[] = [];
  pm.forEach((node) => {
    if (node.type.name === 'code_block') { out.push({ type: 'code', id: node.attrs.id || newId(), text: node.textContent } as unknown as Block); return; }
    if (node.type.name === 'page_break') { out.push({ type: 'pageBreak', id: newId() } as unknown as Block); return; }
    const a = node.attrs;
    const block: Record<string, unknown> = { type: 'paragraph', id: a.id || newId(), style: a.style, section, content: [] as unknown[] };
    const props: Record<string, unknown> = {};
    for (const k of PROPS) {
      const v = a[k];
      if (v !== null && v !== '' && !(k === 'indent' && v === 0)) props[k] = v;
    }
    if (Object.keys(props).length) block.props = props;
    if (a.list) block.list = { kind: a.list, level: a.level, ...(a.list === 'check' ? { checked: a.checked } : {}) };
    node.forEach((child) => (block.content as unknown[]).push(runFrom(child)));
    out.push(block as unknown as Block);
  });
  return out;
}
