import { EngineError } from '../../../io/api';
import type { DocSummary } from '../../../engine/model';

export const FORMATS: Array<{ id: string; label: string; ext: string }> = [
  { id: 'docx', label: 'Word document', ext: '.docx' },
  { id: 'dotx', label: 'Word template', ext: '.dotx' },
  { id: 'odt', label: 'OpenDocument text', ext: '.odt' },
  { id: 'rtf', label: 'Rich text', ext: '.rtf' },
  { id: 'txt', label: 'Plain text', ext: '.txt' },
  { id: 'html', label: 'Web page', ext: '.html' },
  { id: 'md', label: 'Markdown', ext: '.md' },
  { id: 'epub', label: 'EPUB book', ext: '.epub' },
];

export const ACCEPT = '.docx,.dotx,.docm,.odt,.ott,.rtf,.html,.htm,.xhtml,.doc,.dot,.md,.markdown,.txt,.ftxt';

async function failure(res: Response): Promise<EngineError> {
  let detail = res.statusText;
  try { detail = (await res.json()).detail ?? detail; } catch { void 0; }
  return new EngineError(String(detail), res.status);
}

function fileName(res: Response, fallback: string): string {
  const h = res.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(h);
  if (star) { try { return decodeURIComponent(star[1]); } catch { void 0; } }
  const plain = /filename="([^"]+)"/i.exec(h);
  return plain ? plain[1] : fallback;
}

export async function fetchExport(id: string, format: string, live: unknown): Promise<{ blob: Blob; name: string }> {
  const url = `/api/documents/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`;
  const res = live === undefined
    ? await fetch(url)
    : await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(live) });
  if (!res.ok) throw await failure(res);
  return { blob: await res.blob(), name: fileName(res, `document.${format}`) };
}

export function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10000);
}

export async function sendFiles(files: File[]): Promise<{ documents: DocSummary[]; errors: string[] }> {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  const res = await fetch('/api/exchange/import', { method: 'POST', body: form });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as { documents: DocSummary[]; errors: string[] };
}

export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(Array.from(input.files ?? [])); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
