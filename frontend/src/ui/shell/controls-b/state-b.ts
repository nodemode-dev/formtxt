import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { schema } from '../../../editor/schema';
import { currentTable, tableInfo } from '../../../editor/table';
import { env } from './kit';

export const selNode = (type: string): { node: PMNode; pos: number } | null => {
  const v = env.ed?.view;
  if (!v) return null;
  const s = v.state.selection;
  return s instanceof NodeSelection && s.node.type.name === type ? { node: s.node, pos: s.from } : null;
};

export const selDom = (type: string): HTMLElement | null => {
  const n = selNode(type);
  const v = env.ed?.view;
  if (!n || !v) return null;
  const d = v.nodeDOM(n.pos);
  return d instanceof HTMLElement ? d : null;
};

export interface TableFlags {
  headerRow: boolean;
  headerCol: boolean;
  look: string;
  repeat: boolean;
  rows: number;
  cols: number;
  row: number;
  col: number;
  valign: string;
  align: string;
  rowHeight: number;
  colWidth: number;
  tstyle: string;
  rowSplit: boolean;
}

export const tableFlags = (): TableFlags | null => {
  const v = env.ed?.view;
  if (!v) return null;
  const t = currentTable(v.state);
  const info = tableInfo(v.state);
  if (!t || !info) return null;
  const first = t.node.firstChild;
  let headerRow = false;
  first?.forEach((c) => { if (c.type === schema.nodes.table_header) headerRow = true; });
  let headerCol = false;
  t.node.forEach((r) => { const c = r.firstChild; if (c && c.type === schema.nodes.table_header && r !== first) headerCol = true; });
  const rowNode = t.node.maybeChild(info.row);
  let rowHeight = Number(rowNode?.attrs.height ?? 0);
  let colWidth = 0;
  const dom = v.nodeDOM(t.pos);
  const table = dom instanceof HTMLElement ? (dom.tagName === 'TABLE' ? dom : dom.querySelector('table')) : null;
  const PXPT = 96 / 72;
  const tr = table?.querySelectorAll('tr')[info.row] as HTMLElement | undefined;
  if (!rowHeight && tr) rowHeight = tr.getBoundingClientRect().height / (env.ed?.zoom ?? 1) / PXPT;
  const cell = tr?.children[info.col] as HTMLElement | undefined;
  if (cell) colWidth = cell.getBoundingClientRect().width / (env.ed?.zoom ?? 1) / PXPT;
  return {
    headerRow, headerCol, look: info.look, repeat: info.repeatHeader, rows: info.rows, cols: info.cols, row: info.row, col: info.col,
    valign: info.valign, align: info.align, rowHeight, colWidth, tstyle: String(t.node.attrs.tstyle ?? ''), rowSplit: info.rowSplit,
  };
};

export const paraAlign = (): string => {
  const v = env.ed?.view;
  if (!v) return 'left';
  const a = v.state.selection.$from.parent.attrs.align;
  return typeof a === 'string' && a ? a : 'left';
};

export const paraStyle = (): string => {
  const v = env.ed?.view;
  if (!v) return 'Normal';
  const a = v.state.selection.$from.parent.attrs.style;
  return typeof a === 'string' && a ? a : 'Normal';
};

export const mergeInfo = (info: Record<string, any>): { source: string; columns: string[]; records: number; preview: number } | null => (info['merge.info'] ?? null);
