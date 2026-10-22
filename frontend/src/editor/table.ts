import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { CellSelection, TableMap, TableView, columnResizing, findTable, isInTable, selectedRect, tableEditing } from 'prosemirror-tables';
import { type BorderEdge, type CellBorders, schema, tableAttrs } from './schema';

class FtTableView extends TableView {
  constructor(node: PMNode, minWidth: number) {
    super(node, minWidth);
    this.apply(node);
  }

  update(node: PMNode): boolean {
    if (!super.update(node)) return false;
    this.apply(node);
    return true;
  }

  private apply(node: PMNode): void {
    const attrs = tableAttrs(node);
    for (const k of ['data-look', 'data-repeat', 'data-align', 'data-id', 'data-row-split']) {
      const v = attrs[k];
      if (v === undefined) { if (this.table.hasAttribute(k)) this.table.removeAttribute(k); }
      else if (this.table.getAttribute(k) !== v) this.table.setAttribute(k, v);
    }
    const cm = node.attrs.cellMargins as { top: number; right: number; bottom: number; left: number } | null;
    const k = 96 / 72;
    const pad = cm ? `${cm.top * k}px ${cm.right * k}px ${cm.bottom * k}px ${cm.left * k}px` : '';
    if (this.table.style.getPropertyValue('--cell-pad') !== pad) { if (pad) this.table.style.setProperty('--cell-pad', pad); else this.table.style.removeProperty('--cell-pad'); }
    if (!this.table.classList.contains('ft-table')) this.table.classList.add('ft-table');
    const align = node.attrs.align ? String(node.attrs.align) : '';
    if (this.dom.dataset.align !== align) this.dom.dataset.align = align;
  }
}

export function tablePlugins() {
  return [columnResizing({ View: FtTableView as unknown as typeof TableView, cellMinWidth: 24, defaultCellMinWidth: 48 }), tableEditing()];
}

const PX = 96 / 72;

function cellPara(text = ''): PMNode {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
}

function buildTable(grid: string[][], widthPx: number, header: boolean): PMNode {
  const cols = Math.max(1, ...grid.map((r) => r.length));
  const w = Math.max(24, Math.floor((widthPx - 1) / cols));
  const rows = grid.map((r, i) => schema.nodes.table_row.create(null, Array.from({ length: cols }, (_, c) => (header && i === 0 ? schema.nodes.table_header : schema.nodes.table_cell).create({ colwidth: [w] }, cellPara(r[c] ?? '')))));
  return schema.nodes.table.create({ look: 'grid', repeatHeader: header }, rows);
}

export function insertTable(rows: number, cols: number, widthPt: number, header = true): Command {
  return (state, dispatch) => {
    const r = Math.max(1, Math.min(200, Math.round(rows)));
    const c = Math.max(1, Math.min(40, Math.round(cols)));
    const table = buildTable(Array.from({ length: r }, () => Array.from({ length: c }, () => '')), widthPt * PX, header);
    if (!dispatch) return true;
    const $from = state.selection.$from;
    const atEmpty = $from.parent.type === schema.nodes.paragraph && !$from.parent.content.size && $from.depth >= 1;
    const tr = state.tr;
    let at: number;
    if (atEmpty) { at = $from.before(); tr.replaceWith(at, $from.after(), [table, cellPara()]); }
    else { at = $from.depth ? $from.after() : state.selection.from; tr.insert(at, [table, cellPara()]); }
    tr.setSelection(TextSelection.near(tr.doc.resolve(at + 3)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

function tableAround(state: EditorState): { node: PMNode; pos: number } | null {
  const t = findTable(state.selection.$from);
  return t ? { node: t.node, pos: t.pos } : null;
}

export function setTableAttr(name: string, value: unknown): Command {
  return (state, dispatch) => {
    const t = tableAround(state);
    if (!t) return false;
    dispatch?.(state.tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, [name]: value }));
    return true;
  };
}

export function distributeColumns(totalPt?: number): Command {
  return (state, dispatch) => {
    const t = tableAround(state);
    if (!t) return false;
    const map = TableMap.get(t.node);
    let total = totalPt ? totalPt * PX - 1 : 0;
    if (!total) {
      for (let c = 0; c < map.width; c++) {
        const at = map.map[c];
        const cell = t.node.nodeAt(at);
        total += (cell?.attrs.colwidth as number[] | null)?.[c - map.colCount(at)] ?? 48;
      }
    }
    const w = Math.max(24, Math.floor(total / map.width));
    if (!dispatch) return true;
    const tr = state.tr;
    const seen = new Set<number>();
    for (const at of map.map) {
      if (seen.has(at)) continue;
      seen.add(at);
      const cell = t.node.nodeAt(at)!;
      tr.setNodeMarkup(t.pos + 1 + at, undefined, { ...cell.attrs, colwidth: Array.from({ length: cell.attrs.colspan as number }, () => w) });
    }
    dispatch(tr);
    return true;
  };
}

export function setCellShading(color: string): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    const sel = state.selection;
    if (sel instanceof CellSelection) sel.forEachCell((cell, pos) => { tr.setNodeMarkup(pos, undefined, { ...cell.attrs, shading: color }); });
    else {
      const rect = selectedRect(state);
      const at = rect.map.map[rect.top * rect.map.width + rect.left];
      const cell = rect.table.nodeAt(at)!;
      tr.setNodeMarkup(rect.tableStart + at, undefined, { ...cell.attrs, shading: color });
    }
    dispatch(tr);
    return true;
  };
}

export interface CellFmt { shading: string; valign: string; borders: CellBorders | null }
export interface TableStyleDef { look: string; align: string; repeatHeader: boolean; header: CellFmt | null; firstCol: CellFmt | null; body: CellFmt; band: CellFmt | null }

const fmtOf = (cell: PMNode): CellFmt => ({ shading: String(cell.attrs.shading || ''), valign: String(cell.attrs.valign || ''), borders: (cell.attrs.borders as CellBorders | null) ?? null });
const sameFmt = (a: CellFmt, b: CellFmt): boolean => JSON.stringify(a) === JSON.stringify(b);

export function captureTableStyle(table: PMNode): TableStyleDef {
  const map = TableMap.get(table);
  const at = (r: number, c: number): PMNode => table.nodeAt(map.map[Math.min(map.height - 1, r) * map.width + Math.min(map.width - 1, c)])!;
  const headerRow = table.firstChild?.firstChild?.type === schema.nodes.table_header;
  const bodyRow = headerRow && map.height > 1 ? 1 : 0;
  const bodyCol = map.width > 1 ? 1 : 0;
  const body = fmtOf(at(bodyRow, bodyCol));
  const first = fmtOf(at(bodyRow, 0));
  const band = map.height > bodyRow + 1 ? fmtOf(at(bodyRow + 1, bodyCol)) : null;
  return {
    look: String(table.attrs.look || 'grid'), align: String(table.attrs.align || ''), repeatHeader: !!table.attrs.repeatHeader,
    header: headerRow ? fmtOf(at(0, bodyCol)) : null,
    firstCol: map.width > 1 && !sameFmt(first, body) ? first : null,
    body,
    band: band && !sameFmt(band, body) ? band : null,
  };
}

function styleTableAt(tr: Transaction, tablePos: number, def: TableStyleDef, styleId: string): void {
  const table = tr.doc.nodeAt(tablePos);
  if (!table || table.type !== schema.nodes.table) return;
  tr.setNodeMarkup(tablePos, undefined, { ...table.attrs, look: def.look, align: def.align, repeatHeader: def.repeatHeader, tstyle: styleId });
  const map = TableMap.get(table);
  const headerRow = table.firstChild?.firstChild?.type === schema.nodes.table_header;
  const bodyRow = headerRow ? 1 : 0;
  const seen = new Set<number>();
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const off = map.map[r * map.width + c];
      if (seen.has(off)) continue;
      seen.add(off);
      const cell = table.nodeAt(off)!;
      const f = r === 0 && headerRow && def.header ? def.header : c === 0 && def.firstCol ? def.firstCol : def.band && r >= bodyRow && (r - bodyRow) % 2 === 1 ? def.band : def.body;
      tr.setNodeMarkup(tablePos + 1 + off, undefined, { ...cell.attrs, shading: f.shading, valign: f.valign, borders: f.borders });
    }
  }
}

export function applyTableStyle(def: TableStyleDef, styleId: string, everywhere = false): Command {
  return (state, dispatch) => {
    const targets: number[] = [];
    if (everywhere) state.doc.descendants((n, pos) => { if (n.type === schema.nodes.table && n.attrs.tstyle === styleId) targets.push(pos); return true; });
    else { const t = tableAround(state); if (t) targets.push(t.pos); }
    if (!targets.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const pos of targets) styleTableAt(tr, pos, def, styleId);
      dispatch(tr);
    }
    return true;
  };
}

export function currentTable(state: EditorState): { node: PMNode; pos: number } | null { return tableAround(state); }

export const BORDER_TARGETS = ['all', 'outside', 'inside', 'top', 'bottom', 'left', 'right', 'insideH', 'insideV', 'none', 'clear'] as const;

export function setCellBorders(target: string, edge: BorderEdge): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (!(BORDER_TARGETS as readonly string[]).includes(target)) return false;
    if (!dispatch) return true;
    const rect = selectedRect(state);
    const { map, table, tableStart } = rect;
    const tr = state.tr;
    const seen = new Set<number>();
    for (let r = rect.top; r < rect.bottom; r++) {
      for (let c = rect.left; c < rect.right; c++) {
        const at = map.map[r * map.width + c];
        if (seen.has(at)) continue;
        seen.add(at);
        const cell = table.nodeAt(at)!;
        const cr = map.findCell(at);
        const outer = { top: cr.top <= rect.top, bottom: cr.bottom >= rect.bottom, left: cr.left <= rect.left, right: cr.right >= rect.right };
        const pick: Record<string, boolean> = {
          top: ['all', 'none'].includes(target) || (target === 'outside' && outer.top) || (target === 'top' && outer.top) || (['inside', 'insideH'].includes(target) && !outer.top),
          bottom: ['all', 'none'].includes(target) || (target === 'outside' && outer.bottom) || (target === 'bottom' && outer.bottom) || (['inside', 'insideH'].includes(target) && !outer.bottom),
          left: ['all', 'none'].includes(target) || (target === 'outside' && outer.left) || (target === 'left' && outer.left) || (['inside', 'insideV'].includes(target) && !outer.left),
          right: ['all', 'none'].includes(target) || (target === 'outside' && outer.right) || (target === 'right' && outer.right) || (['inside', 'insideV'].includes(target) && !outer.right),
        };
        let next: CellBorders | null;
        if (target === 'clear') next = null;
        else {
          next = { ...((cell.attrs.borders as CellBorders | null) ?? {}) };
          const e = target === 'none' ? { style: 'none', width: 0, color: '' } : { ...edge };
          for (const s of ['top', 'right', 'bottom', 'left'] as const) if (pick[s]) next[s] = e;
        }
        if (JSON.stringify(next) !== JSON.stringify(cell.attrs.borders ?? null)) tr.setNodeMarkup(tableStart + at, undefined, { ...cell.attrs, borders: next });
      }
    }
    dispatch(tr);
    return true;
  };
}

function cellValue(text: string): number | null {
  const s = text.replace(/[\s,$%]/g, '');
  return s && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s) ? Number(s) : null;
}

export function sortTable(column: number, descending = false): Command {
  return (state, dispatch) => {
    const t = tableAround(state);
    if (!t) return false;
    const map = TableMap.get(t.node);
    let spans = false;
    t.node.descendants((n) => { if (n.attrs.rowspan > 1) spans = true; return n.type === schema.nodes.table_row; });
    if (spans) throw new Error('Tables with merged rows cannot be sorted. Split the merged cells first.');
    const col = Math.max(0, Math.min(map.width - 1, Math.round(column)));
    const rows: PMNode[] = [];
    t.node.forEach((r) => rows.push(r));
    let head = 0;
    while (head < rows.length && rows[head].firstChild?.type === schema.nodes.table_header && Array.from({ length: rows[head].childCount }, (_, i) => rows[head].child(i)).every((c) => c.type === schema.nodes.table_header)) head++;
    const key = (r: PMNode): string => {
      let x = 0, text = '';
      r.forEach((c) => { if (x <= col && col < x + (c.attrs.colspan as number)) text = c.textContent; x += c.attrs.colspan as number; });
      return text.trim();
    };
    const body = rows.slice(head).map((r, i) => ({ r, i, k: key(r), n: cellValue(key(r)) }));
    const numeric = body.every((b) => b.n !== null || !b.k);
    body.sort((a, b) => {
      let d = numeric ? (a.n ?? -Infinity) - (b.n ?? -Infinity) : a.k.localeCompare(b.k, undefined, { numeric: true, sensitivity: 'base' });
      if (descending) d = -d;
      return d || a.i - b.i;
    });
    if (!dispatch) return true;
    const next = t.node.copy(Fragment.fromArray([...rows.slice(0, head), ...body.map((b) => b.r)]));
    const tr = state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, next);
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(state.selection.from, t.pos + next.nodeSize - 1)))));
    return true;
  };
}

export function textToTable(separator: string, widthPt: number): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const $a = state.doc.resolve(from), $b = state.doc.resolve(to);
    if ($a.depth !== 1 || $b.depth !== 1) return false;
    const start = $a.before(1), end = $b.after(1);
    const lines: string[] = [];
    let ok = true;
    state.doc.nodesBetween(start, end, (n) => {
      if (n.type === schema.nodes.paragraph) { lines.push(n.textBetween(0, n.content.size, '', (leaf) => (leaf.type === schema.nodes.tab ? '\t' : ''))); return false; }
      if (n.isBlock) ok = false;
      return false;
    });
    if (!ok || !lines.length) return false;
    const sep = separator === 'comma' ? ',' : separator === 'semicolon' ? ';' : separator === 'pipe' ? '|' : '\t';
    const grid = lines.map((l) => {
      const cells = l.split(sep).map((s) => s.trim());
      return sep === '|' ? cells.filter((_, i, a) => !((i === 0 || i === a.length - 1) && !a[i])) : cells;
    }).filter((r) => !(sep === '|' && r.every((c) => /^:?-{2,}:?$/.test(c))));
    if (!dispatch) return true;
    const table = buildTable(grid, widthPt * PX, false);
    const tr = state.tr.replaceWith(start, end, table);
    tr.setSelection(TextSelection.near(tr.doc.resolve(start + 3)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function tableToText(): Command {
  return (state, dispatch) => {
    const t = tableAround(state);
    if (!t) return false;
    if (!dispatch) return true;
    const paras: PMNode[] = [];
    t.node.forEach((row) => {
      const inline: PMNode[] = [];
      row.forEach((cell, _o, i) => {
        if (i) inline.push(schema.nodes.tab.create());
        cell.forEach((b, _p, j) => { if (j) inline.push(schema.text(' ')); b.content.forEach((x) => { if (x.isInline) inline.push(x); }); });
      });
      paras.push(schema.nodes.paragraph.create(null, inline));
    });
    dispatch(state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, paras).scrollIntoView());
    return true;
  };
}

export function tableInfo(state: EditorState): { rows: number; cols: number; look: string; repeatHeader: boolean; rowSplit: boolean; align: string; row: number; col: number; shading: string; valign: string } | null {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const cell = rect.table.nodeAt(rect.map.map[rect.top * rect.map.width + rect.left]);
  return { rows: rect.map.height, cols: rect.map.width, look: String(rect.table.attrs.look), repeatHeader: !!rect.table.attrs.repeatHeader, rowSplit: rect.table.attrs.rowSplit !== false, align: String(rect.table.attrs.align || ''), row: rect.top, col: rect.left, shading: String(cell?.attrs.shading || ''), valign: String(cell?.attrs.valign || '') };
}
