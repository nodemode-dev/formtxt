import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { Block, FtxtDocument, TextRun } from '../engine/model';
import { TableMap } from 'prosemirror-tables';
import { BORDER_SIDES, BORDER_STYLES, type CellBorders, type ListFmt, chipLabel, cleanChip, cleanListFmt, schema } from './schema';
import { BLOCK_BY_NODE, BLOCK_BY_TYPE, INLINE_BY_NODE, INLINE_BY_TYPE, MARK_BY_KEY, MARK_BY_NAME } from './ext/codecs';
import { EXT_PARA } from './ext/specs';

const FLAG_MARKS = ['bold', 'italic', 'strike', 'superscript', 'subscript', 'smallCaps', 'allCaps', 'code'] as const;
const PROPS = ['align', 'indent', 'indentRight', 'indentFirst', 'spaceBefore', 'spaceAfter', 'lineSpacing', 'keepNext', 'keepLines', 'widowControl', 'border', 'shading', 'tabs', 'collapsed'] as const;
const PIC_KEYS = ['media', 'alt', 'width', 'height', 'crop', 'rotate', 'brightness', 'contrast', 'saturation', 'transparency', 'wrap', 'side', 'x', 'y', 'border', 'borderWidth', 'radius', 'shadow', 'relative'] as const;
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
  for (const [k, codec] of Object.entries(MARK_BY_KEY)) {
    if (m[k] === undefined || m[k] === null || m[k] === false) continue;
    const mk = codec.toPM(m[k], schema);
    if (mk) out.push(mk);
  }
  return out;
}

function inlineNodes(content: TextRun[] | undefined): PMNode[] {
  const out: PMNode[] = [];
  for (const r of content ?? []) {
    const run = r as unknown as { type: string; text: string; marks?: Record<string, unknown> };
    if (run.type === 'break') out.push(schema.nodes.hard_break.create());
    else if (run.type === 'tab') out.push(schema.nodes.tab.create());
    else if (run.type === 'chip') {
      const c = cleanChip(r);
      if (c) out.push(schema.nodes.chip.create(c));
    }
    else if (run.type === 'field') {
      const f = r as unknown as Record<string, unknown>;
      out.push(schema.nodes.field.create({ kind: String(f.kind ?? 'formula'), code: String(f.code ?? ''), format: String(f.format ?? ''), result: String(f.result ?? ''), error: String(f.error ?? '') }));
    }
    else if (run.type === 'math') {
      const m = r as unknown as { latex?: string; display?: boolean };
      out.push(schema.nodes.math.create({ latex: String(m.latex ?? ''), display: !!m.display }));
    }
    else if (run.type === 'shape') {
      const s = r as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = {};
      for (const k of Object.keys(schema.nodes.shape.spec.attrs ?? {})) if (s[k] !== undefined && s[k] !== null) attrs[k] = s[k];
      out.push(schema.nodes.shape.create(attrs));
    }
    else if (run.type === 'image') {
      const pic = r as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = {};
      for (const k of PIC_KEYS) if (pic[k] !== undefined && pic[k] !== null) attrs[k] = pic[k];
      out.push(schema.nodes.image.create(attrs));
    }
    else if (INLINE_BY_TYPE[run.type]) {
      const n = INLINE_BY_TYPE[run.type].toPM(r as unknown as Record<string, unknown>, schema);
      if (n) out.push(n);
    }
    else if (run.type === 'text' && run.text) out.push(schema.text(run.text, marksFrom(run.marks)));
  }
  return out;
}

interface FtxtCell { header?: boolean; colspan?: number; rowspan?: number; shading?: string; valign?: string; borders?: CellBorders; textDirection?: string; body?: Block[] }

function cleanBorders(b: unknown): CellBorders | null {
  if (!b || typeof b !== 'object') return null;
  const out: CellBorders = {};
  for (const s of BORDER_SIDES) {
    const e = (b as Record<string, unknown>)[s] as Record<string, unknown> | undefined;
    if (e && typeof e === 'object' && (BORDER_STYLES as readonly string[]).includes(String(e.style))) out[s] = { style: String(e.style), width: Math.max(0.25, Math.min(6, Number(e.width) || 0.75)), color: /^#[0-9a-f]{6}$/i.test(String(e.color)) ? String(e.color) : '#000000' };
  }
  return Object.keys(out).length ? out : null;
}
interface FtxtTable { id?: string; look?: string; style?: string; repeatHeader?: boolean; rowSplit?: boolean; align?: string; columns?: number[]; cellMargins?: { top: number; right: number; bottom: number; left: number }; rows?: Array<{ height?: number; cells?: FtxtCell[] }> }

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
      cells.push(type.create({ colspan: span, rowspan, colwidth: widths.length === span && widths.every((w) => w > 0) ? widths : null, shading: c.shading ?? '', valign: c.valign ?? '', borders: cleanBorders(c.borders), textDirection: c.textDirection === 'rotate90' || c.textDirection === 'rotate270' ? c.textDirection : '' }, body));
      col += span;
    }
    for (let k = 0; k < taken.length; k++) if (taken[k]) taken[k]--;
    if (cells.length) rows.push(schema.nodes.table_row.create({ height: Number(r.height) > 0 ? Number(r.height) : 0 }, cells));
  }
  if (!rows.length) return null;
  return schema.nodes.table.create({ id: t.id || newId('t_'), look: t.look || 'grid', repeatHeader: !!t.repeatHeader, rowSplit: t.rowSplit !== false, align: t.align || '', tstyle: typeof t.style === 'string' ? t.style : '', cellMargins: t.cellMargins ?? null }, rows);
}

function blocksToPM(body: Block[], top: boolean): PMNode[] {
  const blocks: PMNode[] = [];
  for (const b of body) {
    const blk = b as Block & { type: string; text?: string; props?: Record<string, unknown>; list?: { kind: string; level: number; checked?: boolean } };
    if (blk.type === 'code') blocks.push(schema.nodes.code_block.create({ id: blk.id }, blk.text ? schema.text(blk.text) : null));
    else if (blk.type === 'table') { const t = tableToPM(blk as unknown as FtxtTable); if (t) blocks.push(t); }
    else if (blk.type === 'mermaid') {
      const c = blk as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = { id: c.id || newId('m_'), code: String(c.code ?? '') };
      for (const k of ['svg', 'w', 'h', 'width', 'align', 'alt', 'error']) if (c[k] !== undefined && c[k] !== null) attrs[k] = c[k];
      blocks.push(schema.nodes.mermaid.create(attrs));
    }
    else if (blk.type === 'diagram') {
      const c = blk as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = { id: c.id || newId('g_') };
      for (const k of ['layout', 'items', 'style', 'colors', 'width', 'height', 'align']) if (c[k] !== undefined && c[k] !== null) attrs[k] = c[k];
      blocks.push(schema.nodes.diagram.create(attrs));
    }
    else if (blk.type === 'chart') {
      const c = blk as unknown as Record<string, unknown>;
      const attrs: Record<string, unknown> = { id: c.id || newId('c_') };
      for (const k of ['kind', 'title', 'width', 'height', 'align', 'options', 'data']) if (c[k] !== undefined && c[k] !== null) attrs[k] = c[k];
      blocks.push(schema.nodes.chart.create(attrs));
    }
    else if (blk.type === 'pageBreak') { if (top) blocks.push(schema.nodes.page_break.create()); }
    else if (blk.type === 'columnBreak') { if (top) blocks.push(schema.nodes.column_break.create()); }
    else if (blk.type === 'sectionBreak') { if (top) blocks.push(schema.nodes.section_break.create({ section: (blk as unknown as { next?: string }).next ?? null })); }
    else if (BLOCK_BY_TYPE[blk.type]) {
      const n = BLOCK_BY_TYPE[blk.type].toPM(blk as unknown as Record<string, unknown>, schema, top);
      if (n) blocks.push(n);
    }
    else {
      const p = blk.props ?? {};
      const props: Record<string, unknown> = {};
      for (const k of PROPS) props[k] = p[k] !== undefined && p[k] !== null ? p[k] : PROP_DEFAULTS[k];
      for (const [k, spec] of Object.entries(EXT_PARA)) props[k] = (p as Record<string, unknown>)[k] !== undefined && (p as Record<string, unknown>)[k] !== null ? (p as Record<string, unknown>)[k] : spec.default;
      blocks.push(schema.nodes.paragraph.create({
        ...props,
        id: blk.id || newId(),
        style: blk.style || 'Normal',
        list: blk.list?.kind ?? '',
        level: blk.list?.level ?? 0,
        checked: !!blk.list?.checked,
        listFmt: blk.list ? cleanListFmt(blk.list) : null,
      }, inlineNodes(blk.content)));
    }
  }
  if (!blocks.length) blocks.push(schema.nodes.paragraph.create({ id: newId() }));
  return blocks;
}

export function blocksToNodes(body: Block[]): PMNode[] {
  return blocksToPM(body, false);
}

export function toPM(doc: FtxtDocument, tabIndex = 0): PMNode {
  return schema.nodes.doc.create(null, blocksToPM(doc.tabs[tabIndex]?.body ?? [], true));
}

function runFrom(node: PMNode): Record<string, unknown> {
  const ext = INLINE_BY_NODE[node.type.name];
  if (ext) return { type: ext[0], ...ext[1].fromPM(node) };
  if (node.type.name === 'hard_break') return { type: 'break' };
  if (node.type.name === 'tab') return { type: 'tab' };
  if (node.type.name === 'chip') return { type: 'chip', ...(cleanChip(node.attrs) ?? {}), text: chipLabel(node.attrs) };
  if (node.type.name === 'field') {
    const out: Record<string, unknown> = { type: 'field', kind: node.attrs.kind, code: node.attrs.code, result: node.attrs.result };
    if (node.attrs.format) out.format = node.attrs.format;
    if (node.attrs.error) out.error = node.attrs.error;
    return out;
  }
  if (node.type.name === 'math') return node.attrs.display ? { type: 'math', latex: node.attrs.latex, display: true } : { type: 'math', latex: node.attrs.latex };
  if (node.type.name === 'shape') {
    const out: Record<string, unknown> = { type: 'shape' };
    const specs = schema.nodes.shape.spec.attrs ?? {};
    for (const k of Object.keys(specs)) {
      const v = node.attrs[k];
      if (k === 'kind' || k === 'width' || k === 'height' || JSON.stringify(v) !== JSON.stringify(specs[k]?.default)) out[k] = v;
    }
    return out;
  }
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
    else if (MARK_BY_NAME[n]) marks[MARK_BY_NAME[n][0]] = MARK_BY_NAME[n][1].fromPM(m);
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
      if (cell.attrs.textDirection) c.textDirection = cell.attrs.textDirection;
      if (cell.attrs.borders) c.borders = cell.attrs.borders as CellBorders;
      cells.push(c);
    });
    rows.push(row.attrs.height ? { height: row.attrs.height, cells } : { cells });
  });
  const a = node.attrs;
  const out: Record<string, unknown> = { type: 'table', id: a.id || newId('t_'), look: a.look || 'grid', columns, rows };
  if (a.repeatHeader) out.repeatHeader = true;
  if (a.rowSplit === false) out.rowSplit = false;
  if (a.tstyle) out.style = a.tstyle;
  if (a.align) out.align = a.align;
  if (a.cellMargins) out.cellMargins = a.cellMargins;
  return out;
}

export function fromPM(pm: PMNode, section: string): Block[] {
  const out: Block[] = [];
  pm.forEach((node) => {
    const ext = BLOCK_BY_NODE[node.type.name];
    if (ext) { out.push({ type: ext[0], ...ext[1].fromPM(node, section) } as unknown as Block); return; }
    if (node.type.name === 'table') { out.push(tableFromPM(node, section) as unknown as Block); return; }
    if (node.type.name === 'mermaid') {
      const a = node.attrs;
      const m: Record<string, unknown> = { type: 'mermaid', id: a.id || newId('m_'), code: a.code, svg: a.svg, w: a.w, h: a.h };
      if (a.width) m.width = a.width;
      if (a.align && a.align !== 'center') m.align = a.align;
      if (a.alt) m.alt = a.alt;
      if (a.error) m.error = a.error;
      out.push(m as unknown as Block);
      return;
    }
    if (node.type.name === 'diagram') {
      const a = node.attrs;
      const g: Record<string, unknown> = { type: 'diagram', id: a.id || newId('g_'), layout: a.layout, items: a.items, width: a.width, height: a.height };
      if (a.style && a.style !== 'flat') g.style = a.style;
      if (a.colors && a.colors !== 'colorful') g.colors = a.colors;
      if (a.align && a.align !== 'center') g.align = a.align;
      out.push(g as unknown as Block);
      return;
    }
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
    if (node.type.name === 'column_break') { out.push({ type: 'columnBreak', id: newId() } as unknown as Block); return; }
    if (node.type.name === 'section_break') { out.push({ type: 'sectionBreak', id: newId(), next: node.attrs.section } as unknown as Block); return; }
    const a = node.attrs;
    const block: Record<string, unknown> = { type: 'paragraph', id: a.id || newId(), style: a.style, section, content: [] as unknown[] };
    const props: Record<string, unknown> = {};
    for (const k of PROPS) {
      const v = a[k];
      if (v !== null && JSON.stringify(v) !== JSON.stringify(PROP_DEFAULTS[k])) props[k] = v;
    }
    for (const [k, spec] of Object.entries(EXT_PARA)) {
      const v = a[k];
      if (v !== undefined && v !== null && JSON.stringify(v) !== JSON.stringify(spec.default)) props[k] = v;
    }
    if (Object.keys(props).length) block.props = props;
    if (a.list) block.list = { kind: a.list, level: a.level, ...(a.list === 'check' ? { checked: a.checked } : {}), ...(a.list !== 'check' && a.listFmt ? (a.listFmt as ListFmt) : {}) };
    node.forEach((child) => (block.content as unknown[]).push(runFrom(child)));
    out.push(block as unknown as Block);
  });
  return out;
}
