import type { Node as PMNode } from 'prosemirror-model';
import { type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { TableMap } from 'prosemirror-tables';
import { api } from '../io/api';
import { schema } from './schema';

export const FORMAT_PRESETS: Array<[string, string]> = [['', 'General'], ['#,##0', '1,234'], ['#,##0.00', '1,234.50'], ['$#,##0.00', '$1,234.50'], ['0%', '12%'], ['0.0%', '12.3%'], ['0.00', '1234.50']];

export interface EvalResult { ok: boolean; text: string; error?: string }
interface Item { code: string; format: string; grid: string[][] | null; row: number; col: number }

const cellText = (cell: PMNode): string => cell.textBetween(0, cell.content.size, ' ', (leaf) => (leaf.type === schema.nodes.field ? String(leaf.attrs.result ?? '') : leaf.type === schema.nodes.tab ? ' ' : ''));

export function gridOf(table: PMNode): string[][] {
  const map = TableMap.get(table);
  const grid: string[][] = [];
  for (let r = 0; r < map.height; r++) {
    const row: string[] = [];
    for (let c = 0; c < map.width; c++) {
      const at = map.map[r * map.width + c];
      const top = map.findCell(at);
      row.push(top.left === c && top.top === r ? cellText(table.nodeAt(at)!) : '');
    }
    grid.push(row);
  }
  return grid;
}

export function formulaSites(doc: PMNode): Array<{ pos: number; node: PMNode; item: Item }> {
  const out: Array<{ pos: number; node: PMNode; item: Item }> = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.field || node.attrs.kind !== 'formula') return true;
    const $p = doc.resolve(pos);
    let grid: string[][] | null = null, row = -1, col = -1;
    for (let d = $p.depth; d > 0; d--) {
      const n = $p.node(d);
      if (n.type.spec.tableRole === 'table') {
        const map = TableMap.get(n);
        const cellPos = $p.before(d + 2) - $p.start(d);
        try { const rect = map.findCell(cellPos); row = rect.top; col = rect.left; grid = gridOf(n); } catch { grid = null; }
        break;
      }
    }
    out.push({ pos, node, item: { code: String(node.attrs.code), format: String(node.attrs.format ?? ''), grid, row, col } });
    return false;
  });
  return out;
}

export async function evaluate(items: Item[]): Promise<EvalResult[]> {
  if (!items.length) return [];
  return (await api.post<{ results: EvalResult[] }>('/formula/eval', { items })).results;
}

export async function updateFields(view: EditorView, passes = 3): Promise<number> {
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    const doc = view.state.doc;
    const sites = formulaSites(doc);
    if (!sites.length) return changed;
    const results = await evaluate(sites.map((s) => s.item));
    if (view.state.doc !== doc) return changed;
    const tr = view.state.tr;
    let n = 0;
    sites.forEach((s, i) => {
      const r = results[i];
      const result = r.ok ? r.text : r.text || '!Error';
      const error = r.ok ? '' : String(r.error ?? 'error');
      if (s.node.attrs.result !== result || s.node.attrs.error !== error) { tr.setNodeMarkup(s.pos, undefined, { ...s.node.attrs, result, error }); n++; }
    });
    if (!n) return changed;
    changed += n;
    view.dispatch(tr.setMeta('addToHistory', false).setMeta('fields', true));
  }
  return changed;
}

export function selectedField(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.field) return { node: sel.node, pos: sel.from };
  return null;
}

export function defaultFormula(state: EditorState): string {
  const $p = state.selection.$from;
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.type.spec.tableRole === 'table') {
      const map = TableMap.get(n);
      const grid = gridOf(n);
      try {
        const rect = map.findCell($p.before(d + 2) - $p.start(d));
        const above = rect.top > 0 && /\d/.test(grid[rect.top - 1][rect.left] ?? '');
        return above ? '=SUM(ABOVE)' : '=SUM(LEFT)';
      } catch { return '=SUM(ABOVE)'; }
    }
  }
  return '=';
}
