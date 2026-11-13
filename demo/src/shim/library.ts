import { unzip } from './ftxt';

interface Run { text?: unknown }
interface Block { content?: Run[] }
interface Doc { id: string; title: string; meta: { created: number; modified: number }; tabs?: Array<{ body?: Block[] }>; media?: Record<string, { type?: string }> }
interface Held { doc: Doc; media: Map<string, string> }

const held = new Map<string, Held>();
const now = (): number => Date.now() / 1000;
const freshId = (): string => `d_${Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36]).join('')}`;

const words = (d: Doc): number => (d.tabs ?? []).flatMap((t) => t.body ?? []).flatMap((b) => b.content ?? [])
  .reduce((n, r) => n + (typeof r.text === 'string' ? r.text.split(/\s+/).filter(Boolean).length : 0), 0);

export const summary = (d: Doc) => ({ id: d.id, title: d.title, modified: d.meta.modified, created: d.meta.created, words: words(d), bytes: 0 });

export const list = () => Array.from(held.values()).map((h) => summary(h.doc)).sort((a, b) => b.modified - a.modified);

export const read = (id: string): Doc | null => held.get(id)?.doc ?? null;

export function write(id: string, doc: Doc): Doc | null {
  const h = held.get(id);
  if (!h) return null;
  h.doc = { ...doc, id, meta: { ...doc.meta, modified: now() } };
  return h.doc;
}

export const mediaUrl = (id: string, name: string): string | null => held.get(id)?.media.get(name) ?? null;

export async function importFtxt(file: Blob): Promise<Doc> {
  const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
  const json = entries.find((e) => e.name === 'document.json');
  if (!json) throw new Error('The .ftxt file has no document.json.');
  const doc = JSON.parse(new TextDecoder().decode(json.data)) as Doc;
  const t = now();
  doc.id = freshId();
  doc.meta = { ...doc.meta, created: t, modified: t };
  const media = new Map<string, string>();
  for (const e of entries) {
    if (!e.name.startsWith('media/')) continue;
    const name = e.name.slice(6);
    media.set(name, URL.createObjectURL(new Blob([e.data as BlobPart], { type: doc.media?.[name]?.type ?? 'application/octet-stream' })));
  }
  held.set(doc.id, { doc, media });
  return doc;
}
