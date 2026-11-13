import { Plugin } from 'prosemirror-state';
import { Dialog } from '../../../ui/dialog';
import { el, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { vx } from './api';
import { type Loose, area, grid, input, requireView, setMeta, touch, when } from './core';

export function propertiesOf(ed: DocEditor): Loose {
  requireView(ed);
  const m = ed.doc!.meta as unknown as Loose;
  return { title: ed.doc!.title, author: m.author ?? '', subject: m.subject ?? '', keywords: Array.isArray(m.keywords) ? m.keywords.join(', ') : String(m.keywords ?? ''), category: m.category ?? '', comments: m.comments ?? '', created: m.created ?? 0, modified: m.modified ?? 0, words: ed.stats().words };
}

export function setProperties(ed: DocEditor, p: Loose): Loose {
  requireView(ed);
  const patch: Loose = {};
  for (const k of ['author', 'subject', 'category', 'comments']) if (p[k] !== undefined) patch[k] = String(p[k]).slice(0, k === 'comments' ? 2000 : 200);
  if (p.keywords !== undefined) patch.keywords = String(p.keywords).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const title = p.title !== undefined && String(p.title).trim() ? String(p.title).trim().slice(0, 200) : undefined;
  setMeta(ed, patch, title);
  if (title) {
    setText(document.querySelector('[data-ref="docname"]'), title);
    document.title = `${title} · FormTxt`;
  }
  return propertiesOf(ed);
}

export function propertiesDialog(ed: DocEditor): void {
  requireView(ed);
  const p = propertiesOf(ed);
  const d = new Dialog('Document properties', 520);
  const title = input('text', String(p.title), 'maxlength="200"');
  const subject = input('text', String(p.subject), 'maxlength="200"');
  const author = input('text', String(p.author), 'maxlength="200"');
  const keywords = input('text', String(p.keywords), 'placeholder="Separate with commas"');
  const category = input('text', String(p.category), 'maxlength="200"');
  const comments = area(String(p.comments), 3, 'maxlength="2000"');
  grid(d, [['Title', title], ['Subject', subject], ['Author', author], ['Keywords', keywords], ['Category', category], ['Comments', comments]]);
  const stats = el('<dl class="ft-vx-stats"><dt>Created</dt><dd data-k="created"></dd><dt>Modified</dt><dd data-k="modified"></dd><dt>Words</dt><dd data-k="words"></dd></dl>');
  setText(stats.querySelector('[data-k="created"]'), when(Number(p.created)));
  setText(stats.querySelector('[data-k="modified"]'), when(Number(p.modified)));
  setText(stats.querySelector('[data-k="words"]'), String(p.words));
  d.body.appendChild(stats);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Save', 'primary', () => {
    setProperties(ed, { title: title.value, subject: subject.value, author: author.value, keywords: keywords.value, category: category.value, comments: comments.value });
    d.close();
  });
  d.open(title);
}

interface Copy { id: string; savedAt: number; hash: string; doc: unknown }

const DB = 'formtxt-recovery';
const STORE = 'copies';
let timer = 0;
let editor: DocEditor | null = null;

function hashOf(tabs: unknown): string {
  const s = JSON.stringify(tabs);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function putCopy(rec: Copy): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return;
  } catch { void 0; }
  try { localStorage.setItem(`formtxt.recovery.${rec.id}`, JSON.stringify(rec)); } catch { void 0; }
}

async function getCopy(id: string): Promise<Copy | null> {
  try {
    const db = await openDb();
    const rec = await new Promise<Copy | null>((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => resolve((r.result as Copy | undefined) ?? null); r.onerror = () => reject(r.error); });
    db.close();
    if (rec) return rec;
  } catch { void 0; }
  try { const raw = localStorage.getItem(`formtxt.recovery.${id}`); return raw ? (JSON.parse(raw) as Copy) : null; } catch { return null; }
}

async function dropCopy(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
    db.close();
  } catch { void 0; }
  try { localStorage.removeItem(`formtxt.recovery.${id}`); } catch { void 0; }
}

const sealed = new Map<string, boolean>();

export function setSealed(id: string, on: boolean): void {
  sealed.set(id, on);
  if (on) void dropCopy(id);
}

async function isSealed(id: string): Promise<boolean> {
  const known = sealed.get(id);
  if (known !== undefined) return known;
  try {
    const s = (await vx.status(id)).protected;
    sealed.set(id, s);
    return s;
  } catch { return true; }
}

function capture(): void {
  const ed = editor;
  const doc = ed?.current();
  if (!ed || !doc) return;
  void isSealed(doc.id).then((s) => { if (!s) void putCopy({ id: doc.id, savedAt: Date.now(), hash: hashOf(doc.tabs), doc }); });
}

export const recoveryPlugin = new Plugin({
  view: () => ({
    update: (view, prev) => {
      if (view.state.doc === prev.doc) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(capture, 400);
    },
  }),
});

export function bindRecovery(ed: DocEditor): void {
  editor = ed;
}

export async function offerRecovery(ed: DocEditor, quiet = true): Promise<boolean> {
  const doc = ed.current();
  if (!doc) return false;
  const id = doc.id;
  if (await isSealed(id)) { if (sealed.get(id)) void dropCopy(id); if (!quiet) toast('No unsaved changes were found for this document.'); return false; }
  const now = hashOf(doc.tabs);
  const rec = await getCopy(id);
  if (!rec || rec.hash === now) { if (!quiet) toast('No unsaved changes were found for this document.'); return false; }
  const meta = doc.meta as unknown as Loose;
  if (quiet && rec.savedAt / 1000 <= Number(meta.modified ?? 0) + 1) { void dropCopy(id); return false; }
  const d = new Dialog('Recover unsaved changes', 460);
  const p = el('<p class="ft-note"></p>');
  setText(p, `A copy of this document was kept in this browser at ${when(rec.savedAt / 1000)}, and it is newer than the saved copy in the library. Recover it?`);
  d.body.appendChild(p);
  d.button('Discard it', 'ghost', () => { void dropCopy(id); d.close(); });
  d.button('Recover', 'primary', () => {
    d.close();
    void ed.load(rec.doc as never).then(() => { touch(ed); toast('Recovered the unsaved changes.'); });
  });
  d.open();
  return true;
}
