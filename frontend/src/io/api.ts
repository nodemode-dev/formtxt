export class EngineError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function readable(detail: unknown): string {
  if (!Array.isArray(detail)) return String(detail);
  return detail.map((d: { loc?: unknown[]; msg?: unknown }) => {
    const at = Array.isArray(d?.loc) ? d.loc.filter((x) => x !== 'body').join('.') : '';
    const msg = String(d?.msg ?? d);
    return at ? `${at}: ${msg}` : msg;
  }).join('; ');
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { void 0; }
    throw new EngineError(readable(detail), res.status);
  }
  return (await res.json()) as T;
}

async function upload<T>(path: string, files: File[]): Promise<T> {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  const res = await fetch(`/api${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { void 0; }
    throw new EngineError(readable(detail), res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => call<T>('PUT', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
  upload,
};

export interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  layout: string;
  accent: string;
  fonts: { heading: string; body: string };
  description: string;
  tags: string[];
  size: string;
  builtin: boolean;
}
