import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { commands } from '../../../engine/registry';
import { el, setDisabled, setText, setValue } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { parseData, vx } from './api';
import { docSettings, parseCsv, requireView, setSetting } from './core';

interface Data { source: string; columns: string[]; rows: string[][] }

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
        out.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-previewed', 'data-preview': i >= 0 ? rec[i] ?? '' : '' }));
        return false;
      });
      return DecorationSet.create(state.doc, out);
    },
  },
});

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
  const data: Data = { source: d.source.slice(0, 120), columns, rows };
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

export function setCsv(ed: DocEditor, text: string, source = 'pasted data'): Data {
  const [head, ...rows] = parseCsv(text);
  if (!head) throw new Error('The data has no rows.');
  return setData(ed, { source, columns: head, rows });
}

export function insertMergeField(ed: DocEditor, name: string): boolean {
  requireView(ed);
  const data = mergeData(ed);
  const n = name.trim();
  if (!n) throw new Error('name needs a column name.');
  if (data && !data.columns.includes(n)) throw new Error(`The data has no column ${n}. Columns: ${data.columns.join(', ')}.`);
  const node = ed.view!.state.schema.nodes.merge_field.create({ name: n });
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

export async function finishMerge(ed: DocEditor, title = ''): Promise<{ id: string; title: string; records: number }> {
  requireView(ed);
  const data = mergeData(ed);
  if (!data || !data.rows.length) throw new Error('Choose a data file with at least one record first.');
  const doc = ed.current()!;
  const records = data.rows.map((r) => Object.fromEntries(data.columns.map((c, i) => [c, r[i] ?? ''])));
  const made = await vx.merge({ source: doc.id, doc, tab: ed.activeTab, records, title: title || `${doc.title} (merged)` });
  await commands.run('file.open', { id: made.id });
  toast(`Created ${made.title} with ${records.length} page${records.length === 1 ? '' : 's'}.`);
  return { id: made.id, title: made.title, records: records.length };
}

export function mergePanel(ed: DocEditor): HTMLElement {
  editor = ed;
  if (root) return root;
  root = el(`<div class="ft-vx-merge">
<p class="ft-note">Choose a CSV or Excel file, insert its columns as merge fields, preview each record, then finish to one new document with a page per record.</p>
<div class="ft-vx-merge-src"><button type="button" class="ft-btn" data-a="load">Choose data file</button><span class="ft-vx-merge-name"></span><input type="file" accept=".csv,.tsv,.txt,.xlsx" hidden></div>
<label class="ft-field"><span class="ft-field-label">Merge field</span><select class="ft-input" data-k="field"></select></label>
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
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    const data = mergeData(ed);
    const run = async (): Promise<void> => {
      if (a === 'load') file.click();
      else if (a === 'insert') insertMergeField(ed, (root!.querySelector('[data-k="field"]') as HTMLSelectElement).value);
      else if (a === 'preview') setPreview(ed, preview ? 0 : 1);
      else if (a === 'prev') setPreview(ed, Math.max(1, preview - 1));
      else if (a === 'next') setPreview(ed, Math.min(data?.rows.length ?? 0, (preview || 0) + 1));
      else if (a === 'finish') await finishMerge(ed);
    };
    void run().catch((err: Error) => toast(err.message, 'error'));
  });
  paint();
  return root;
}

export function paint(): void {
  if (!root || !editor?.doc) return;
  const data = mergeData(editor);
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
