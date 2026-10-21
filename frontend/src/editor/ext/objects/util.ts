import { api } from '../../../io/api';
import { type Dialog } from '../../../ui/dialog';
import { el, escapeHtml, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';

export function input(type: string, value: string, attrs = ''): HTMLInputElement {
  const n = el<HTMLInputElement>(`<input class="ft-input" type="${type}" ${attrs}>`);
  if (type === 'checkbox') n.checked = value === 'true'; else n.value = value;
  return n;
}

export function select(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = el<HTMLSelectElement>(`<select class="ft-input">${options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>`);
  s.value = value;
  return s;
}

export function grid(d: Dialog, rows: Array<[string, HTMLElement]>, cols = 2): HTMLElement {
  const g = el(`<div class="ft-form-grid ft-objects-grid" data-cols="${cols}"></div>`);
  for (const [label, control] of rows) {
    const l = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    setText(l.querySelector('.ft-field-label'), label);
    l.appendChild(control);
    g.appendChild(l);
  }
  d.body.appendChild(g);
  return g;
}

export function note(d: Dialog, text: string): HTMLElement {
  const n = el('<p class="ft-note"></p>');
  setText(n, text);
  d.body.appendChild(n);
  return n;
}

export function picker(accept: string, multiple: boolean, onFiles: (files: File[]) => void): () => void {
  const node = el<HTMLInputElement>(`<input type="file" accept="${escapeHtml(accept)}"${multiple ? ' multiple' : ''} hidden>`);
  document.body.appendChild(node);
  node.addEventListener('change', () => {
    const files = Array.from(node.files ?? []);
    node.value = '';
    if (files.length) onFiles(files);
  });
  return () => node.click();
}

export function fail(prefix: string): (e: Error) => void {
  return (e) => toast(`${prefix}: ${e.message}`, 'error');
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
}

export interface UploadedFile { name: string; kind: string; type: string; bytes: number; source: string; rows?: string[][]; thumb?: string; pages?: number }

export async function uploadObjectFiles(docId: string, files: File[]): Promise<UploadedFile[]> {
  const out = await api.upload<{ files: UploadedFile[]; errors: string[] }>(`/objects/${encodeURIComponent(docId)}/files`, files);
  for (const e of out.errors) toast(e, 'error');
  return out.files;
}

export function objectUrl(docId: string, name: string, download = ''): string {
  return name && docId ? `/api/objects/${encodeURIComponent(docId)}/file/${encodeURIComponent(name)}${download ? `?download=${encodeURIComponent(download)}` : ''}` : '';
}
