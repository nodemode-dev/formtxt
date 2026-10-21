import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { Block, FtxtDocument, TextRun } from '../engine/model';
import { TableMap } from 'prosemirror-tables';
import { schema } from './schema';

const FLAG_MARKS = ['bold', 'italic', 'strike', 'superscript', 'subscript', 'smallCaps', 'allCaps', 'code'] as const;
const PROPS = ['align', 'indent', 'indentRight', 'indentFirst', 'spaceBefore', 'spaceAfter', 'lineSpacing', 'keepNext', 'keepLines', 'widowControl', 'border', 'shading', 'tabs', 'collapsed'] as const;
const PIC_KEYS = ['media', 'alt', 'width', 'height', 'crop', 'rotate', 'brightness', 'contrast', 'saturation', 'transparency', 'wrap', 'side', 'x', 'y'] as const;
const PROP_DEFAULTS: Record<string, unknown> ={ align: '', indent: 0, indentRight: 0, indentFirst: 0, spaceBefore: null, spaceAfter: null, lineSpacing: null, keepNext: false, keepLines: false, widowControl: true, border: '', shading: '', tabs: null, collapsed: false };

function newId(prefix = 'p_'): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

function marksFrom(m: Record<string, unknown> | undefined): Mark[] {
  if (!m) return [];
  const out: Mark[] = [];
  for (const k of FLAG_MARKS) if (m[k]) out.push(schema.marks[k].create());
  if (m.underline) out.push(schema.marks.underline.create({ style: typeof m.underline === 'string' ? m.underline : 'single' }));
  if (typeof m.spacing === 'number' && m.spacing) out.push(schema.marks.spacing.create({ pt: m.spacing }));
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
    else if (run.type === 'tab') out.push(schema.nodes.tab.create());
    else if (run.type === 'image') {
      const pic = r as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = {};
      for (const k of PIC_KEYS) if (pic[k] !== undefined && pic[k] !== null) attrs[k] = pic[k];
      out.push(schema.nodes.image.create(attrs));
    }
    else if (run.type === 'text' && run.text) out.push(schema.text(run.text, marksFrom(run.marks)));
  }
  return out;
}

interface FtxtCell { header?: boolean; colspan?: number; rowspan?: number; shading?: string; valign?: string; body?: Block[] }
interface FtxtTable { id?: string; look?: string; repeatHeader?: boolean; align?: string; columns?: number[]; rows?: Array<{ cells?: FtxtCell[] }> }

const PX = 96 / 72;

function tableToPM(t: FtxtTable): PMNode | null {
  const columns = t.columns ?? [];
  const taken: number[] = [];
  const rows: PMNode[] = [];
  for (const r of t.rows ?? []) {
    const cells: PMNode[] = [];
    let col = 0;
    for (const c of r.cells ?? []) {
      while ((taken[col] ?? 0) > 0) col++;
      const span = Math.max(1, Number(c.colspan) || 1);
      const rowspan = Math.max(1, Number(c.rowspan) || 1);
      const widths = columns.slice(col, col + span).map((w) => Math.round((Number(w) || 0) * PX));
      for (let k = 0; k < span; k++) taken[col + k] = rowspan;
      const body = blocksToPM(c.body ?? [], false);
      const type = c.header ? schema.nodes.table_header : schema.nodes.table_cell;
      cells.push(type.create({ colspan: span, rowspan, colwidth: widths.length === span && widths.every((w) => w > 0) ? widths : null, shading: c.shading ?? '', valign: c.valign ?? '' }, body));
      col += span;
    }
    for (let k = 0; k < taken.length; k++) if (taken[k]) taken[k]--;
    if (cells.length) rows.push(schema.nodes.table_row.create(null, cells));
  }
  if (!rows.length) return null;
  return schema.nodes.table.create({ id: t.id || newId('t_'), look: t.look || 'grid', repeatHeader: !!t.repeatHeader, align: t.align || '' }, rows);
}

function blocksToPM(body: Block[], top: boolean): PMNode[] {
  const blocks: PMNode[] = [];
  for (const b of body) {
    const blk = b as Block & { type: string; text?: string; props?: Record<string, unknown>; list?: { kind: string; level: number; checked?: boolean } };
    if (blk.type === 'code') blocks.push(schema.nodes.code_block.create({ id: blk.id }, blk.text ? schema.text(blk.text) : null));
    else if (blk.type === 'table') { const t = tableToPM(blk as unknown as FtxtTable); if (t) blocks.push(t); }
    else if (blk.type === 'chart') {
      const c = blk as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = { id: c.id || newId('c_') };
      for (const k of ['kind', 'title', 'width', 'height', 'align', 'options', 'data']) if (c[k] !== undefined && c[k] !== null) attrs[k] = c[k];
      blocks.push(schema.nodes.chart.create(attrs));
    }
    else if (blk.type === 'pageBreak') { if (top) blocks.push(schema.nodes.page_break.create()); }
    else if (blk.type === 'sectionBreak') { if (top) blocks.push(schema.nodes.section_break.create({ section: (blk as unknown as { next?: string }).next ?? null })); }
    else {
      const p = blk.props ?? {};
      const props: Record<string, unknown> = {};
      for (const k of PROPS) props[k] = p[k] !== undefined && p[k] !== null ? p[k] : PROP_DEFAULTS[k];
      blocks.push(schema.nodes.paragraph.create({
        ...props,
        id: blk.id || newId(),
        style: blk.style || 'Normal',
        list: blk.list?.kind ?? '',
        level: blk.list?.level ?? 0,
        checked: !!blk.list?.checked,
      }, inlineNodes(blk.content)));
    }
  }
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create({ id: newId() }));
  return blocks;
}

export function toPM(doc: FtxtDocument, tabIndex = 0): PMNode {
  return schema.nodes.doc.create(null, blocksToPM(doc.tabs[tabIndex]?.body ?? [], true));
}

function runFrom(node: PMNode): Record<string, unknown> {
  if (node.type.name === 'hard_break') return { type: 'break' };
  if (node.type.name === 'tab') return { type: 'tab' };
  if (node.type.name === 'image') {
    const out: Record<string, unknown> = { type: 'image' };
    for (const k of PIC_KEYS) {
      const v = node.attrs[k];
      if (k === 'media' || k === 'width' || k === 'height' || JSON.stringify(v) !== JSON.stringify(schema.nodes.image.spec.attrs?.[k]?.default)) out[k] = v;
    }
    return out;
  }
  const marks: Record<string, unknown> = {};
  for (const m of node.marks) {
    const n = m.type.name;
    if ((FLAG_MARKS as readonly string[]).includes(n)) marks[n] = true;
    else if (n === 'underline') marks.underline = m.attrs.style === 'single' ? true : m.attrs.style;
    else if (n === 'spacing') marks.spacing = m.attrs.pt;
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

function tableFromPM(node: PMNode, section: string): Record<string, unknown> {
  const map = TableMap.get(node);
  const columns: number[] = [];
  for (let c = 0; c < map.width; c++) {
    let w = 0;
    for (let r = 0; r < map.height && !w; r++) {
      const at = map.map[r * map.width + c];
      const cell = node.nodeAt(at);
      const cw = cell?.attrs.colwidth as number[] | null;
      if (cw) w = cw[c - map.colCount(at)] ?? 0;
    }
    columns.push(Math.round((w / PX) * 100) / 100);
  }
  const rows: unknown[] = [];
  node.forEach((row) => {
    const cells: unknown[] = [];
    row.forEach((cell) => {
      const c: Record<string, unknown> = { body: fromPM(cell, section) };
      if (cell.type.name === 'table_header') c.header = true;
      if (cell.attrs.colspan > 1) c.colspan = cell.attrs.colspan;
      if (cell.attrs.rowspan > 1) c.rowspan = cell.attrs.rowspan;
      if (cell.attrs.shading) c.shading = cell.attrs.shading;
      if (cell.attrs.valign) c.valign = cell.attrs.valign;
      cells.push(c);
    });
    rows.push({ cells });
  });
  const a = node.attrs;
  const out: Record<string, unknown> = { type: 'table', id: a.id || newId('t_'), look: a.look || 'grid', columns, rows };
  if (a.repeatHeader) out.repeatHeader = true;
  if (a.align) out.align = a.align;
  return out;
}

export function fromPM(pm: PMNode, section: string): Block[] {
  const out: Block[] = [];
  pm.forEach((node) => {
    if (node.type.name === 'table') { out.push(tableFromPM(node, section) as unknown as Block); return; }
    if (node.type.name === 'chart') {
      const a = node.attrs;
      const c: Record<string, unknown> = { type: 'chart', id: a.id || newId('c_'), kind: a.kind, width: a.width, height: a.height, data: a.data };
      if (a.title) c.title = a.title;
      if (a.align && a.align !== 'center') c.align = a.align;
      if (a.options && Object.keys(a.options as object).length) c.options = a.options;
      out.push(c as unknown as Block);
      return;
    }
    if (node.type.name === 'code_block') { out.push({ type: 'code', id: node.attrs.id || newId(), text: node.textContent } as unknown as Block); return; }
    if (node.type.name === 'page_break') { out.push({ type: 'pageBreak', id: newId() } as unknown as Block); return; }
    if (node.type.name === 'section_break') { out.push({ type: 'sectionBreak', id: newId(), next: node.attrs.section } as unknown as Block); return; }
    const a = node.attrs;
    const block: Record<string, unknown> = { type: 'paragraph', id: a.id || newId(), style: a.style, section, content: [] as unknown[] };
    const props: Record<string, unknown> = {};
    for (const k of PROPS) {
      const v = a[k];
      if (v !== null && JSON.stringify(v) !== JSON.stringify(PROP_DEFAULTS[k])) props[k] = v;
    }
    if (Object.keys(props).length) block.props = props;
    if (a.list) block.list = { kind: a.list, level: a.level, ...(a.list === 'check' ? { checked: a.checked } : {}) };
    node.forEach((child) => (block.content as unknown[]).push(runFrom(child)));
    out.push(block as unknown as Block);
  });
  return out;
}
