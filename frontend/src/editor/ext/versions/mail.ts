import { commands } from '../../../engine/registry';
import { Dialog } from '../../../ui/dialog';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { parseData, vx } from './api';
import { area, grid, input, pick, requireView } from './core';
import { mergeData } from './merge';

export const ENVELOPE_SIZES: Array<[string, string]> = [['dl', 'DL (110 x 220 mm)'], ['env10', 'No. 10 (4 1/8 x 9 1/2 in)'], ['c5', 'C5 (162 x 229 mm)'], ['monarch', 'Monarch (3 7/8 x 7 1/2 in)']];
export const LABEL_SHEETS: Array<[string, string]> = [['5160', 'Avery 5160 (30 per sheet, 1 x 2 5/8 in)'], ['5161', 'Avery 5161 (20 per sheet, 1 x 4 in)'], ['5163', 'Avery 5163 (10 per sheet, 2 x 4 in)']];

export async function makeEnvelope(p: { size: string; delivery: string; sender: string; fontSize?: number }): Promise<{ id: string; title: string }> {
  if (!p.delivery.trim()) throw new Error('Type the delivery address.');
  const made = await vx.envelope({ size: p.size, delivery: p.delivery, sender: p.sender, fontSize: p.fontSize ?? 12 });
  await commands.run('file.open', { id: made.id });
  return { id: made.id, title: made.title };
}

export async function makeLabels(p: { sheet: string; template: string; records?: Array<Record<string, string>> | null; count?: number; skip?: number; fontSize?: number }): Promise<{ id: string; title: string }> {
  if (!p.template.trim()) throw new Error('Type what each label should say.');
  const made = await vx.labels({ sheet: p.sheet, template: p.template, records: p.records ?? null, count: p.count ?? 0, skip: p.skip ?? 0, fontSize: p.fontSize ?? 10 });
  await commands.run('file.open', { id: made.id });
  return { id: made.id, title: made.title };
}

export function envelopeDialog(ed: DocEditor): void {
  requireView(ed);
  const d = new Dialog('Envelope', 480);
  const size = pick(ENVELOPE_SIZES, 'dl');
  const delivery = area('', 4, 'placeholder="Name&#10;Street&#10;City, region, postcode"');
  const sender = area(String((ed.doc?.meta as unknown as { author?: string }).author ?? ''), 3, 'placeholder="Your name and address"');
  grid(d, [['Envelope size', size], ['Delivery address', delivery], ['Return address', sender]]);
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Create envelope', 'primary', () => {
    void makeEnvelope({ size: size.value, delivery: delivery.value, sender: sender.value }).then(() => d.close()).catch((e: Error) => { err.textContent = e.message; err.hidden = false; });
  });
  d.open(delivery);
}

export function labelsDialog(ed: DocEditor): void {
  requireView(ed);
  const d = new Dialog('Labels', 520);
  const sheet = pick(LABEL_SHEETS, '5160');
  const text = area('', 4, 'placeholder="Name&#10;Street&#10;City"');
  const source = pick([['same', 'The same label on every label'], ['data', 'One label for each row of a data file']], 'same');
  const count = input('number', '30', 'min="1" max="2000"');
  const skip = input('number', '0', 'min="0" max="60"');
  const fileBtn = el<HTMLButtonElement>('<button type="button" class="ft-btn">Choose data file</button>');
  const file = el<HTMLInputElement>('<input type="file" accept=".csv,.tsv,.txt,.xlsx" hidden>');
  const info = el('<p class="ft-note"></p>');
  const rowsBox = grid(d, [['Label sheet', sheet], ['Label text', text], ['Fill with', source], ['How many labels', count], ['Skip used labels', skip]]);
  const dataRow = el('<div class="ft-field"></div>');
  dataRow.append(fileBtn, file, info);
  d.body.appendChild(dataRow);
  let columns: string[] = [];
  let records: Array<Record<string, string>> = [];
  const existing = mergeData(ed);
  if (existing) { columns = existing.columns; records = existing.rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))); }
  const sync = (): void => {
    const data = source.value === 'data';
    setHidden(rowsBox.children[3] as HTMLElement, data);
    setHidden(dataRow, !data);
    setText(info, columns.length ? `${records.length} rows from the data file. Use {${columns.slice(0, 3).join('}, {')}} in the label text${columns.length > 3 ? ' and the other columns' : ''}.` : 'Choose a CSV or Excel file whose first row has column names. Use {Column} in the label text.');
  };
  source.addEventListener('change', sync);
  fileBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    void parseData(f).then((out) => {
      const [head, ...rows] = out.rows;
      columns = head.map((c) => c.trim());
      records = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
      if (!text.value.trim()) text.value = columns.slice(0, 4).map((c) => `{${c}}`).join('\n');
      sync();
    }).catch((e: Error) => toast(e.message, 'error'));
  });
  sync();
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Create labels', 'primary', () => {
    const data = source.value === 'data';
    if (data && !records.length) { err.textContent = 'Choose a data file with at least one row.'; err.hidden = false; return; }
    void makeLabels({ sheet: sheet.value, template: text.value, records: data ? records : null, count: Number(count.value) || 0, skip: Number(skip.value) || 0 }).then(() => d.close()).catch((e: Error) => { err.textContent = e.message; err.hidden = false; });
  });
  d.open(text);
}
