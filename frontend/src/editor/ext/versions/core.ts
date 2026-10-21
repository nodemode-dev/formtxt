import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import type { DocEditor } from '../../editor';
import { Dialog } from '../../../ui/dialog';
import { el, escapeHtml } from '../../../ui/dom';

export const SYSTEM = 'ftxt-system';
export const FORM = 'ftxt-form';

export type Loose = Record<string, any>;

export function docSettings(ed: DocEditor): Loose {
  return ((ed.doc?.settings ?? {}) as unknown as Loose);
}

export function touch(ed: DocEditor): void {
  if (!ed.view) return;
  const tr = ed.view.state.tr;
  tr.step(new ReplaceStep(0, 0, Slice.empty));
  ed.view.dispatch(tr.setMeta('addToHistory', false).setMeta(SYSTEM, true));
}

export function setSetting(ed: DocEditor, key: string, value: unknown): void {
  if (!ed.doc) throw new Error('Open a document first.');
  const next: Loose = { ...docSettings(ed) };
  if (value === undefined || value === null) delete next[key]; else next[key] = value;
  ed.doc = { ...ed.doc, settings: next as never };
  touch(ed);
}

export function setMeta(ed: DocEditor, patch: Loose, title?: string): void {
  if (!ed.doc) throw new Error('Open a document first.');
  ed.doc = { ...ed.doc, ...(title !== undefined ? { title } : {}), meta: { ...(ed.doc.meta as unknown as Loose), ...patch } as never };
  touch(ed);
}

export function requireView(ed: DocEditor): void {
  if (!ed.view || !ed.doc) throw new Error('Open a document first.');
}

export function input(type: string, value = '', attrs = ''): HTMLInputElement {
  const n = el<HTMLInputElement>(`<input class="ft-input" type="${type}" ${attrs}>`);
  n.value = value;
  return n;
}

export function area(value = '', rows = 3, attrs = ''): HTMLTextAreaElement {
  const n = el<HTMLTextAreaElement>(`<textarea class="ft-input" rows="${rows}" ${attrs}></textarea>`);
  n.value = value;
  return n;
}

export function pick(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = el<HTMLSelectElement>(`<select class="ft-input">${options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>`);
  s.value = value;
  return s;
}

export function grid(d: Dialog, rows: Array<[string, HTMLElement]>): HTMLElement {
  const g = el('<div class="ft-form-grid"></div>');
  for (const [label, control] of rows) {
    const row = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    (row.firstElementChild as HTMLElement).textContent = label;
    row.appendChild(control);
    g.appendChild(row);
  }
  d.body.appendChild(g);
  return g;
}

export function note(d: Dialog, text: string): HTMLElement {
  const p = el('<p class="ft-note"></p>');
  p.textContent = text;
  d.body.appendChild(p);
  return p;
}

export function when(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ask(title: string, label: string, kind: 'text' | 'password', action: string, run: (value: string) => Promise<unknown>, detail = '', onCancel?: () => void): void {
  const d = new Dialog(title, 420);
  const box = input(kind, '', 'autocomplete="off" spellcheck="false"');
  if (detail) note(d, detail);
  d.field(label, box);
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  const go = async (): Promise<void> => {
    try { await run(box.value); d.close(); } catch (e) { err.textContent = (e as Error).message; err.hidden = false; box.select(); }
  };
  d.button('Cancel', 'ghost', () => { d.close(); onCancel?.(); });
  d.button(action, 'primary', () => void go());
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') void go(); });
  d.open(box);
}

export async function sha(text: string, salt: string): Promise<string> {
  if (!crypto.subtle) throw new Error('This browser cannot protect a document with a password here.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(text), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function saveNow(ed: DocEditor): Promise<void> {
  const cur = ed.current();
  if (!cur) throw new Error('Open a document first.');
  const { api } = await import('../../../io/api');
  await api.put(`/documents/${encodeURIComponent(cur.id)}`, cur);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delimiter = (text.split('\n', 1)[0].match(/\t/g)?.length ?? 0) > (text.split('\n', 1)[0].match(/,/g)?.length ?? 0) ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
