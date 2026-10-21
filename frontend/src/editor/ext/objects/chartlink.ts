import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { CommandRegistry } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { type ChartData, SAMPLE, insertChart, parseGrid, selectedChart } from '../../chart/chart';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { onDocumentLoaded } from '../plugins';
import { fail, grid, input, note, picker, select } from './util';

export interface ChartSource { path: string; sheet: string; mtime: number; name: string }
interface Read { changed: boolean; mtime: number; name: string; rows?: string[][]; sheets?: string[] }

const sourceOf = (n: PMNode): ChartSource | null => {
  const s = (n.attrs.options as { source?: ChartSource } | null)?.source;
  return s && typeof s.path === 'string' && s.path ? s : null;
};

function dataFrom(rows: string[][], old: ChartData | undefined): ChartData {
  const data = parseGrid(rows.map((r) => r.join('\t')).join('\n'));
  data.series.forEach((s, i) => {
    const prev = old?.series.find((o) => o.name === s.name) ?? old?.series[i];
    if (prev?.color) s.color = prev.color;
  });
  return data;
}

async function read(path: string, sheet: string, mtime?: number): Promise<Read> {
  return api.post<Read>('/objects/chart-source', { path, sheet, ...(mtime !== undefined ? { mtime } : {}) });
}

function chartsWithSource(ed: DocEditor): Array<{ id: string; node: PMNode }> {
  const out: Array<{ id: string; node: PMNode }> = [];
  ed.view?.state.doc.descendants((n) => {
    if (n.type === schema.nodes.chart && sourceOf(n)) out.push({ id: String(n.attrs.id), node: n });
    return true;
  });
  return out;
}

export async function refreshCharts(ed: DocEditor, force: boolean, only?: string): Promise<{ updated: number; failed: string[] }> {
  const list = chartsWithSource(ed).filter((c) => !only || c.id === only);
  const results = await Promise.all(list.map(async (c) => {
    const s = sourceOf(c.node)!;
    try { return { id: c.id, s, r: await read(s.path, s.sheet, force ? undefined : s.mtime) }; } catch (e) { return { id: c.id, s, err: (e as Error).message }; }
  }));
  const failed: string[] = [];
  let updated = 0;
  const view = ed.view;
  if (!view) return { updated, failed };
  let tr = view.state.tr;
  view.state.doc.descendants((n, pos) => {
    if (n.type !== schema.nodes.chart) return true;
    const res = results.find((x) => x.id === String(n.attrs.id));
    if (!res) return true;
    if ('err' in res) { failed.push(res.err ?? res.s.name); return true; }
    if (!res.r.changed || !res.r.rows) return true;
    const options = { ...(n.attrs.options as object), source: { ...res.s, mtime: res.r.mtime, name: res.r.name } };
    tr = tr.setNodeMarkup(pos, undefined, { ...n.attrs, options, data: dataFrom(res.r.rows, n.attrs.data as ChartData) });
    updated += 1;
    return true;
  });
  if (updated) view.dispatch(tr);
  return { updated, failed };
}

async function applyLink(ed: DocEditor, path: string, sheet: string): Promise<boolean> {
  if (!ed.view) throw new Error('Open a document first.');
  const r = await read(path, sheet);
  if (!r.rows?.length) throw new Error('The file has no rows to chart.');
  const source: ChartSource = { path, sheet, mtime: r.mtime, name: r.name };
  const sel = selectedChart(ed.view.state);
  if (sel) {
    const options = { ...(sel.node.attrs.options as object), source };
    const tr = ed.view.state.tr.setNodeMarkup(sel.pos, undefined, { ...sel.node.attrs, options, data: dataFrom(r.rows, sel.node.attrs.data as ChartData) });
    tr.setSelection(NodeSelection.create(tr.doc, sel.pos));
    ed.view.dispatch(tr);
    return true;
  }
  const data = dataFrom(r.rows, SAMPLE);
  return ed.run(insertChart({ kind: 'bar', title: '', width: Math.min(468, ed.bodyWidth()), height: 252, align: 'center', options: { legend: true, source }, data }));
}

function unlink(ed: DocEditor): boolean {
  const sel = ed.view ? selectedChart(ed.view.state) : null;
  if (!sel || !sourceOf(sel.node)) throw new Error('Select a chart that is linked to a file first.');
  const { source: _drop, ...rest } = sel.node.attrs.options as Record<string, unknown>;
  void _drop;
  const tr = ed.view!.state.tr.setNodeMarkup(sel.pos, undefined, { ...sel.node.attrs, options: rest });
  tr.setSelection(NodeSelection.create(tr.doc, sel.pos));
  ed.view!.dispatch(tr);
  return true;
}

function linkDialog(ed: DocEditor): void {
  if (!ed.view) throw new Error('Open a document first.');
  const cur = ed.view ? selectedChart(ed.view.state) : null;
  const src = cur ? sourceOf(cur.node) : null;
  const d = new Dialog('Link chart to a spreadsheet', 560);
  const where = select([['path', 'File on this computer'], ['library', 'Library file']], src?.path.startsWith('library:') ? 'library' : 'path');
  const path = input('text', src && !src.path.startsWith('library:') ? src.path : '', 'placeholder="/home/me/sales.xlsx" spellcheck="false"');
  const lib = select([['', 'Choose a file']], '');
  const sheet = input('text', src?.sheet ?? '', 'placeholder="First sheet" spellcheck="false"');
  grid(d, [['Source', where], ['Full path', path], ['Library file', lib], ['Sheet (.xlsx)', sheet]]);
  const status = note(d, cur ? (src ? `Linked to ${src.name}. The chart refreshes when it opens and when the file changes.` : 'The selected chart will take its data from the file.') : 'No chart is selected, so a new chart is inserted from the file.');
  const upload = picker('.csv,.tsv,.txt,.xlsx', false, (files) => {
    void api.upload<{ files: Array<{ name: string }> }>('/objects/library', files).then(async (r) => { await loadLib(r.files[0]?.name ?? ''); where.value = 'library'; sync(); }).catch(fail('Could not add the file'));
  });
  const loadLib = async (pick: string): Promise<void> => {
    const r = await api.get<{ files: Array<{ name: string }> }>('/objects/library');
    lib.replaceChildren(...[{ name: '' }, ...r.files].map((f) => { const o = document.createElement('option'); o.value = f.name; o.textContent = f.name || 'Choose a file'; return o; }));
    lib.value = pick || (src?.path.startsWith('library:') ? src.path.slice(8) : '');
  };
  const sync = (): void => { path.disabled = where.value !== 'path'; lib.disabled = where.value !== 'library'; };
  where.addEventListener('change', sync);
  sync();
  void loadLib('').catch(() => undefined);
  d.button('Add file to library...', 'ghost', upload);
  if (src) d.button('Unlink', 'ghost', () => { try { unlink(ed); d.close(); } catch (e) { setText(status, (e as Error).message); } });
  d.button('Cancel', 'ghost', () => d.close());
  d.button(cur ? 'Link and load' : 'Insert chart', 'primary', () => {
    const p = where.value === 'library' ? (lib.value ? `library:${lib.value}` : '') : path.value.trim();
    if (!p) { setText(status, 'Choose a file.'); return; }
    void applyLink(ed, p, sheet.value.trim()).then(() => d.close()).catch((e: Error) => setText(status, e.message));
  });
  d.open(path);
}

export function registerChartLink(reg: CommandRegistry, ed: DocEditor): void {
  reg.register({
    id: 'chart.linkSource', label: 'Link chart to a spreadsheet', group: 'Chart',
    description: 'Fill the selected chart (or a new one) from a .csv, .tsv or .xlsx file on this computer or in the library, and keep the link. With no path, opens a dialog. Library files are written as library:name.csv.',
    params: [{ name: 'path', type: 'string', description: 'Absolute file path, or library:name.csv' }, { name: 'sheet', type: 'string', description: 'Sheet name for .xlsx; first sheet when empty' }],
    run: (p) => { if (!p.path) { linkDialog(ed); return true; } return applyLink(ed, String(p.path), String(p.sheet ?? '')); },
  });
  reg.register({
    id: 'chart.refreshData', label: 'Refresh chart data', group: 'Chart',
    description: 'Reread the linked file of the selected chart, or of every linked chart when none is selected, and redraw.',
    run: async () => {
      const sel = ed.view ? selectedChart(ed.view.state) : null;
      const out = await refreshCharts(ed, true, sel ? String(sel.node.attrs.id) : undefined);
      if (out.failed.length) throw new Error(out.failed.join(' '));
      return out.updated;
    },
  });
  reg.register({
    id: 'chart.unlinkSource', label: 'Unlink chart data', group: 'Chart',
    description: 'Keep the selected chart\'s numbers but stop refreshing them from a file.',
    run: () => unlink(ed),
  });
  const quiet = (): void => {
    if (!chartsWithSource(ed).length) return;
    void refreshCharts(ed, false).then((r) => {
      if (r.updated) toast(`Updated ${r.updated} linked chart${r.updated === 1 ? '' : 's'} from ${r.updated === 1 ? 'its' : 'their'} data file.`);
      else if (r.failed.length) toast(`A linked chart could not refresh: ${r.failed[0]}`, 'error');
    }).catch(() => undefined);
  };
  onDocumentLoaded(() => window.setTimeout(quiet, 0));
  let timer = 0;
  window.addEventListener('focus', () => { window.clearTimeout(timer); timer = window.setTimeout(quiet, 400); });
}
