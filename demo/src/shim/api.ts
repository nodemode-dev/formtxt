import { importFtxt, list, mediaUrl, read, summary, write } from './library';

const NEEDS = 'This needs the FormTxt engine. Start it with ./formtxt. The demo page keeps its documents in the page; new documents and templates, opening other formats, export, proofing, versions, sharing, the assistant and the terminal belong to the engine.';
const BLANK = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E';
const SHIPPED = import.meta.glob<string>('../../../frontend/public/demos/*.ftxt', { query: '?inline', import: 'default', eager: true });

const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const needs = (): Response => answer({ detail: NEEDS }, 503);

const shipped = (url: string): string | null => {
  const file = /(?:^|\/)demos\/([\w.-]+\.ftxt)$/.exec(url)?.[1];
  return file ? Object.entries(SHIPPED).find(([path]) => path.endsWith(`/${file}`))?.[1] ?? null : null;
};

async function importForm(init?: RequestInit): Promise<Response> {
  const documents: ReturnType<typeof summary>[] = [];
  const errors: string[] = [];
  const form = init?.body instanceof FormData ? init.body : null;
  for (const f of form ? form.getAll('files') : []) {
    if (!(f instanceof File)) continue;
    if (!/\.ftxt$/i.test(f.name)) { errors.push(`${f.name}: ${NEEDS}`); continue; }
    try { documents.push(summary(await importFtxt(f))); } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
  }
  return answer({ documents, errors });
}

async function route(path: string, method: string, init?: RequestInit): Promise<Response> {
  const at = path.split('?')[0];
  if (method === 'GET' && at === '/documents') return answer({ documents: list() });
  if (method === 'GET' && at === '/documents/trash') return answer({ documents: [] });
  if (method === 'GET' && at === '/templates') return answer({ categories: [], templates: [] });
  if (method === 'POST' && at === '/documents/import') return importForm(init);
  const media = /^\/documents\/([^/]+)\/media\/([^/]+)$/.exec(at);
  if (media && method === 'GET') {
    const url = mediaUrl(decodeURIComponent(media[1]), decodeURIComponent(media[2]));
    return url ? fetch(url) : answer({ detail: 'No such picture.' }, 404);
  }
  const doc = /^\/documents\/([^/]+)$/.exec(at);
  if (doc) {
    const id = decodeURIComponent(doc[1]);
    if (method === 'GET') { const d = read(id); return d ? answer(d) : answer({ detail: 'No such document.' }, 404); }
    if (method === 'PUT' && typeof init?.body === 'string') { const d = write(id, JSON.parse(init.body)); return d ? answer(summary(d)) : answer({ detail: 'No such document.' }, 404); }
  }
  return needs();
}

declare const __FT_DEMO_PACKS__: string;
declare global { interface Window { FT_PACKS?: Record<string, unknown> } }

const packs = new Map<string, Promise<Response>>();
const pack = (name: string): Promise<Response> => {
  let p = packs.get(name);
  if (!p) {
    p = new Promise<Response>((done) => {
      const s = document.createElement('script');
      s.src = `${__FT_DEMO_PACKS__}/${name}.js`;
      s.onload = () => done(window.FT_PACKS?.[name] === undefined ? answer({ detail: 'The page could not read its data.' }, 500) : answer(window.FT_PACKS[name]));
      s.onerror = () => { packs.delete(name); done(answer({ detail: 'The page could not load its data.' }, 500)); };
      document.head.append(s);
    });
    packs.set(name, p);
  }
  return p.then((r) => r.clone());
};

const native = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const api = /^(?:file:\/\/[^?]*)?\/api(\/[^#]*)$/.exec(raw);
  if (api) return route(api[1], (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(), init);
  if (raw.startsWith('formtxt-pack:')) return pack(raw.slice(13));
  const ftxt = shipped(raw);
  return ftxt ? native(ftxt) : native(input, init);
};

const picture = (src: string): string => {
  if (!src.startsWith('/api/')) return src;
  const m = /^\/api\/documents\/([^/]+)\/media\/([^/?]+)/.exec(src);
  return (m && mediaUrl(decodeURIComponent(m[1]), decodeURIComponent(m[2]))) || BLANK;
};

const srcProp = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
if (srcProp?.set) {
  const set = srcProp.set;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...srcProp, set(this: HTMLImageElement, v: string) { set.call(this, picture(String(v))); } });
}
const setAttr = Element.prototype.setAttribute;
Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
  setAttr.call(this, name, this instanceof HTMLImageElement && name === 'src' ? picture(String(value)) : value);
};

class QuietSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((e: Event) => void) | null = null;
  onclose: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: Event) => void) | null = null;
  constructor(readonly url: string) {
    super();
    window.setTimeout(() => { this.readyState = 3; const e = new Event('close'); this.onclose?.(e); this.dispatchEvent(e); }, 0);
  }
  send(): void { return; }
  close(): void { this.readyState = 3; }
}

const NativeSocket = window.WebSocket;
window.WebSocket = new Proxy(NativeSocket, {
  construct(target, args: ConstructorParameters<typeof WebSocket>) {
    const url = String(args[0]);
    return url.includes('/api/') ? new QuietSocket(url) as unknown as WebSocket : new target(...args);
  },
});
