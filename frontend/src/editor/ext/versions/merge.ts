import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { commands } from '../../../engine/registry';
import { el, setDisabled, setText, setValue } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { parseData, vx } from './api';
import { docSettings, parseCsv, requireView, setSetting } from './core';
import { MERGE_AGGS } from '../versions-spec';

interface Query { path: string; sql: string }
interface Data { source: string; columns: string[]; rows: string[][]; query?: Query }

const key = new PluginKey('ftxt-merge');
let editor: DocEditor | null = null;
let preview = 0;
let root: HTMLElement | null = null;

export function mergeData(ed: DocEditor): Data | null {
  const d = docSettings(ed).mailMerge as Data | undefined;
  return d && Array.isArray(d.columns) && Array.isArray(d.rows) ? d : null;
}

export const mergePlugin = new Plugin({
  key,
  props: {
    decorations(state) {
      if (!preview || !editor) return null;
      const data = mergeData(editor);
      if (!data) return null;
      const rec = data.rows[preview - 1];
      if (!rec) return null;
      const out: Decoration[] = [];
      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'merge_field') return true;
        const i = data.columns.indexOf(String(node.attrs.name));
        const shown = i < 0 ? '' : node.attrs.agg ? total(String(node.attrs.agg), data.rows.map((r) => r[i] ?? '')) : rec[i] ?? '';
        out.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-previewed', 'data-preview': shown }));
        return false;
      });
      return DecorationSet.create(state.doc, out);
    },
  },
});

function total(kind: string, values: string[]): string {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (kind === 'count') return String(filled.length);
  const nums = filled.map((v) => Number(v.replace(/,/g, ''))).filter((n) => Number.isFinite(n));
  if (!nums.length) return '';
  const sum = nums.reduce((a, b) => a + b, 0);
  const out = kind === 'sum' ? sum : kind === 'avg' ? sum / nums.length : kind === 'min' ? Math.min(...nums) : Math.max(...nums);
  return String(Math.round(out * 1e6) / 1e6);
}

function repaint(): void {
  editor?.view?.dispatch(editor.view.state.tr.setMeta(key, true));
}

export function bindMerge(ed: DocEditor): void {
  editor = ed;
}

export function setData(ed: DocEditor, d: Data): Data {
  requireView(ed);
  const columns = d.columns.map((c) => c.trim()).filter(Boolean).slice(0, 60);
  if (!columns.length) throw new Error('The data needs a header row with column names.');
  const rows = d.rows.slice(0, 2000).map((r) => columns.map((_, i) => String(r[i] ?? '').slice(0, 500)));
  const data: Data = { source: d.source.slice(0, 120), columns, rows, ...(d.query ? { query: { path: d.query.path.slice(0, 4096), sql: d.query.sql.slice(0, 20000) } } : {}) };
  setSetting(ed, 'mailMerge', data);
  preview = Math.min(preview, rows.length);
  paint();
  repaint();
  return data;
}

export async function loadFile(ed: DocEditor, file: File): Promise<Data> {
  const out = await parseData(file);
  const [head, ...rows] = out.rows;
  if (!head) throw new Error('That file has no rows.');
  return setData(ed, { source: file.name, columns: head, rows });
}

export async function listTables(path: string): Promise<string[]> {
  if (!path.trim()) return [];
  return (await vx.sqlite(path.trim(), '')).sheets;
}

export async function setQuery(ed: DocEditor, path: string, sql: string): Promise<Data> {
  requireView(ed);
  const p = path.trim();
  const q = sql.trim();
  if (!p) throw new Error('path needs the full path of a SQLite database file.');
  if (!q) throw new Error('sql needs a SELECT statement.');
  const out = await vx.sqlite(p, q);
  const [head, ...rows] = out.rows;
  if (!head) throw new Error('The query returned no columns.');
  return setData(ed, { source: p.split(/[\\/]/).pop() || p, columns: head, rows, query: { path: p, sql: q } });
}

export async function refreshQuery(ed: DocEditor): Promise<Data> {
  const d = mergeData(ed);
  if (!d?.query) throw new Error('The mail merge data does not come from a database file. Set a query with merge.setQuery first.');
  return setQuery(ed, d.query.path, d.query.sql);
}

export function setCsv(ed: DocEditor, text: string, source = 'pasted data'): Data {
  const [head, ...rows] = parseCsv(text);
  if (!head) throw new Error('The data has no rows.');
  return setData(ed, { source, columns: head, rows });
}

export function insertMergeField(ed: DocEditor, name: string, agg = ''): boolean {
  requireView(ed);
  const data = mergeData(ed);
  const n = name.trim();
  if (!n) throw new Error('name needs a column name.');
  if (data && !data.columns.includes(n)) throw new Error(`The data has no column ${n}. Columns: ${data.columns.join(', ')}.`);
  if (agg && !MERGE_AGGS.includes(agg)) throw new Error(`agg is one of ${MERGE_AGGS.join(', ')}, or empty for the value.`);
  const node = ed.view!.state.schema.nodes.merge_field.create({ name: n, agg });
  ed.view!.dispatch(ed.view!.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  return true;
}

export function setPreview(ed: DocEditor, record: number): number {
  requireView(ed);
  const data = mergeData(ed);
  if (record > 0 && !data) throw new Error('Choose a data file first.');
  preview = Math.max(0, Math.min(record, data?.rows.length ?? 0));
  paint();
  repaint();
  return preview;
}

export function previewRecord(): number {
  return preview;
}

export function toggleRepeatRow(ed: DocEditor): { repeat: boolean } {
  requireView(ed);
  const view = ed.view!;
  const { $from } = view.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name !== 'table_row') continue;
    const repeat = !node.attrs.repeat;
    view.dispatch(view.state.tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, repeat }));
    return { repeat };
  }
  throw new Error('Put the cursor in a table row first.');
}

export async function finishMerge(ed: DocEditor, title = '', mode = 'pages', groupBy = ''): Promise<{ id: string; title: string; records: number; mode: string }> {
  requireView(ed);
  const data = mergeData(ed);
  if (!data || !data.rows.length) throw new Error('Choose a data file with at least one record first.');
  if (mode !== 'pages' && mode !== 'list') throw new Error('mode is pages (a page per record) or list (one document, a table row per record).');
  if (groupBy && !data.columns.includes(groupBy)) throw new Error(`The data has no column ${groupBy}. Columns: ${data.columns.join(', ')}.`);
  const doc = ed.current()!;
  const records = data.rows.map((r) => Object.fromEntries(data.columns.map((c, i) => [c, r[i] ?? ''])));
  const made = await vx.merge({ source: doc.id, doc, tab: ed.activeTab, records, title: title || `${doc.title} (merged)`, mode, groupBy });
  await commands.run('file.open', { id: made.id });
  toast(mode === 'list' ? `Created ${made.title} listing ${records.length} record${records.length === 1 ? '' : 's'}.` : `Created ${made.title} with ${records.length} page${records.length === 1 ? '' : 's'}.`);
  return { id: made.id, title: made.title, records: records.length, mode };
}

export function mergePanel(ed: DocEditor): HTMLElement {
  editor = ed;
  if (root) return root;
  root = el(`<div class="ft-vx-merge">
<p class="ft-note">Choose a CSV or Excel file, or query a database file, insert its columns as merge fields, preview each record, then finish to one new document with a page per record.</p>
<div class="ft-vx-merge-src"><button type="button" class="ft-btn" data-a="load">Choose data file</button><span class="ft-vx-merge-name"></span><input type="file" accept=".csv,.tsv,.txt,.xlsx" hidden></div>
<label class="ft-field"><span class="ft-field-label">Database file</span><input class="ft-input" data-k="dbpath" spellcheck="false" autocomplete="off" placeholder="Full path to a SQLite file"></label>
<label class="ft-field"><span class="ft-field-label">Table</span><select class="ft-input" data-k="table"><option value="">Choose a table</option></select></label>
<label class="ft-field"><span class="ft-field-label">SQL</span><textarea class="ft-input" data-k="sql" rows="3" spellcheck="false" placeholder="select * from orders"></textarea></label>
<div class="ft-vx-merge-src"><button type="button" class="ft-btn" data-a="query">Run query</button><button type="button" class="ft-btn" data-a="refresh">Refresh data</button></div>
<label class="ft-field"><span class="ft-field-label">Merge field</span><select class="ft-input" data-k="field"></select></label>
<label class="ft-field"><span class="ft-field-label">Total</span><select class="ft-input" data-k="agg"><option value="">None, the record's value</option><option value="sum">Sum</option><option value="count">Count</option><option value="avg">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>
<button type="button" class="ft-btn" data-a="insert">Insert merge field</button>
<div class="ft-vx-pager"><button type="button" class="ft-btn sm" data-a="prev" aria-label="Previous record">Previous</button><span class="ft-vx-pager-count" aria-live="polite"></span><button type="button" class="ft-btn sm" data-a="next" aria-label="Next record">Next</button></div>
<button type="button" class="ft-btn" data-a="preview">Preview results</button>
<button type="button" class="ft-btn primary" data-a="finish">Finish and merge</button></div>`);
  const file = root.querySelector('input[type="file"]') as HTMLInputElement;
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (f) void loadFile(ed, f).then((d) => toast(`Loaded ${d.rows.length} record${d.rows.length === 1 ? '' : 's'} from ${d.source}.`)).catch((e: Error) => toast(e.message, 'error'));
  });
  const dbpath = root.querySelector('[data-k="dbpath"]') as HTMLInputElement;
  const table = root.querySelector('[data-k="table"]') as HTMLSelectElement;
  const sqlBox = root.querySelector('[data-k="sql"]') as HTMLTextAreaElement;
  dbpath.addEventListener('change', () => {
    void listTables(dbpath.value).then((names) => fillTables(table, names)).catch((e: Error) => { fillTables(table, []); toast(e.message, 'error'); });
  });
  table.addEventListener('change', () => {
    if (table.value) sqlBox.value = `select * from "${table.value.replace(/"/g, '""')}"`;
  });
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    const data = mergeData(ed);
    const run = async (): Promise<void> => {
      if (a === 'load') file.click();
      else if (a === 'insert') insertMergeField(ed, (root!.querySelector('[data-k="field"]') as HTMLSelectElement).value, (root!.querySelector('[data-k="agg"]') as HTMLSelectElement).value);
      else if (a === 'preview') setPreview(ed, preview ? 0 : 1);
      else if (a === 'prev') setPreview(ed, Math.max(1, preview - 1));
      else if (a === 'next') setPreview(ed, Math.min(data?.rows.length ?? 0, (preview || 0) + 1));
      else if (a === 'finish') await finishMerge(ed);
      else if (a === 'query' || a === 'refresh') {
        const d = a === 'query' ? await setQuery(ed, dbpath.value, sqlBox.value) : await refreshQuery(ed);
        toast(`Loaded ${d.rows.length} record${d.rows.length === 1 ? '' : 's'} from ${d.source}.`);
      }
    };
    void run().catch((err: Error) => toast(err.message, 'error'));
  });
  paint();
  return root;
}

function fillTables(sel: HTMLSelectElement, names: string[]): void {
  const want = names.join('\u0001');
  if (sel.dataset.tables === want) return;
  sel.dataset.tables = want;
  const first = document.createElement('option');
  first.value = '';
  first.textContent = names.length ? 'Choose a table' : 'No tables';
  sel.replaceChildren(first, ...names.map((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; return o; }));
}

export function paint(): void {
  if (!root || !editor?.doc) return;
  const data = mergeData(editor);
  if (data?.query) {
    setValue(root.querySelector('[data-k="dbpath"]') as HTMLInputElement, data.query.path);
    const box = root.querySelector('[data-k="sql"]') as HTMLTextAreaElement;
    if (box.value !== data.query.sql && document.activeElement !== box) box.value = data.query.sql;
  }
  setDisabled(root.querySelector('[data-a="refresh"]') as HTMLButtonElement, !data?.query);
  setText(root.querySelector('.ft-vx-merge-name'), data ? `${data.source}: ${data.rows.length} record${data.rows.length === 1 ? '' : 's'}` : 'No data file chosen');
  const sel = root.querySelector('[data-k="field"]') as HTMLSelectElement;
  const want = (data?.columns ?? []).join('\u0001');
  if (sel.dataset.cols !== want) {
    sel.dataset.cols = want;
    sel.replaceChildren(...(data?.columns ?? []).map((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; return o; }));
  }
  setValue(sel, sel.value);
  setText(root.querySelector('.ft-vx-pager-count'), data ? (preview ? `Record ${preview} of ${data.rows.length}` : `${data.rows.length} records`) : '');
  for (const a of ['insert', 'preview', 'finish', 'prev', 'next']) setDisabled(root.querySelector(`[data-a="${a}"]`) as HTMLButtonElement, !data || (a === 'prev' && !preview) || (a === 'next' && !data?.rows.length));
  setText(root.querySelector('[data-a="preview"]'), preview ? 'Show merge fields' : 'Preview results');
}
