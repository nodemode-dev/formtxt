import { commands } from '../../../engine/registry';
import { EngineError } from '../../../io/api';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { drawings } from './raster';

export interface PdfExport { name: string; pages: number; bytes: number; notes: string[]; tagged: { elements: number; headings: number } }
export interface PdfOpen { id: string; title: string; pages: number; notes: string[]; paragraphs: number; headings: number; tables: number; pictures: number; lists: number }

async function fail(res: Response): Promise<never> {
  let detail = res.statusText;
  try { detail = (await res.json()).detail ?? detail; } catch { void 0; }
  throw new EngineError(String(detail), res.status);
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportPdf(ed: DocEditor, tagged: boolean, id: string): Promise<PdfExport> {
  const doc = id ? null : ed.current();
  if (!id && !doc) throw new Error('Open a document first.');
  const flag = `tagged=${tagged ? 'true' : 'false'}`;
  const res = id
    ? await fetch(`/api/documents/${encodeURIComponent(id)}/export.pdf?${flag}`)
    : await fetch(`/api/print/export.pdf?${flag}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...doc, _drawings: await drawings(ed).catch(() => ({ blocks: {}, shapes: {} })) }) });
  if (!res.ok) return fail(res);
  const blob = await res.blob();
  const title = (doc?.title ?? ed.current()?.title ?? 'document').replace(/[^\w .-]+/g, '').trim() || 'document';
  const name = `${title}.pdf`;
  let notes: string[] = [];
  try { notes = JSON.parse(res.headers.get('x-formtxt-notes') ?? '[]') as string[]; } catch { notes = []; }
  let stats = { elements: 0, headings: 0 };
  try { stats = JSON.parse(res.headers.get('x-formtxt-tagged') ?? '{}') as typeof stats; } catch { void 0; }
  const pages = Number(res.headers.get('x-formtxt-pages') ?? 0);
  save(blob, name);
  toast(notes.length ? `Saved ${name} (${pages} ${pages === 1 ? 'page' : 'pages'}). ${notes[0]}` : `Saved ${name} (${pages} ${pages === 1 ? 'page' : 'pages'}).`);
  return { name, pages, bytes: blob.size, notes, tagged: stats };
}

let picker: HTMLInputElement | null = null;

function filePicker(): HTMLInputElement {
  if (!picker) {
    picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/pdf,.pdf';
    picker.hidden = true;
    document.body.appendChild(picker);
  }
  return picker;
}

async function finishOpen(res: Response): Promise<PdfOpen> {
  if (!res.ok) return fail(res);
  const body = (await res.json()) as { document: { id: string; title: string }; report: Omit<PdfOpen, 'id' | 'title'> };
  await commands.run('file.open', { id: body.document.id });
  const note = body.report.notes[0] ?? '';
  toast(`Opened ${body.document.title} from PDF: ${body.report.paragraphs + body.report.headings} paragraphs, ${body.report.tables} tables, ${body.report.pictures} pictures. ${note}`.trim());
  return { id: body.document.id, title: body.document.title, ...body.report };
}

export async function openPdf(path: string): Promise<PdfOpen> {
  if (path) {
    return finishOpen(await fetch('/api/print/open-pdf-path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) }));
  }
  const input = filePicker();
  input.value = '';
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
  if (!file) throw new Error('No PDF was chosen.');
  const form = new FormData();
  form.append('file', file, file.name);
  return finishOpen(await fetch('/api/print/open-pdf', { method: 'POST', body: form }));
}
