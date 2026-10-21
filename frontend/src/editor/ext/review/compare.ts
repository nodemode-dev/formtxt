import { commands } from '../../../engine/registry';
import type { FtxtDocument } from '../../../engine/model';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { toPM } from '../../convert';
import { ed, notify, view } from './core';
import { REVIEW_META } from './comments';

export type CompareMode = 'compare' | 'suggest' | 'combine';

interface Row { id: string; title: string }

const TEXT: Record<CompareMode, { title: string; action: string; note: string }> = {
  compare: { title: 'Compare documents', action: 'Compare', note: 'Creates a new document that shows every difference as a tracked insertion or deletion by the other document\'s author. This document is not changed.' },
  suggest: { title: 'Suggest edits from another document', action: 'Suggest edits', note: 'Turns the differences into tracked insertions and deletions in this document, so you can accept or reject each one. You can undo it.' },
  combine: { title: 'Combine documents', action: 'Combine', note: 'Merges the other document into this one: its differences become tracked changes and its comments are copied over.' },
};

export async function listOthers(): Promise<Row[]> {
  const r = await api.get<{ documents: Row[] }>('/documents');
  const self = ed().docId();
  return r.documents.filter((d) => d.id !== self).map((d) => ({ id: d.id, title: d.title }));
}

function applyDocument(nd: FtxtDocument): void {
  const e = ed();
  const v = view();
  if (!e.doc) throw new Error('Open a document first.');
  e.doc = { ...e.doc, comments: nd.comments ?? {} };
  if (nd.tabs.length === 1 && e.doc.tabs.length === 1) {
    const pm = toPM(nd, 0);
    v.dispatch(v.state.tr.replaceWith(0, v.state.doc.content.size, pm.content).setMeta(REVIEW_META, true));
  } else {
    void e.load(nd).then(() => { e['emitChange'](); notify(); });
    return;
  }
  e['emitChange']();
  notify();
}

export async function runCompare(mode: CompareMode, other: string, author = ''): Promise<{ id?: string; title?: string; changes: number }> {
  const e = ed();
  const base = e.current();
  if (!base) throw new Error('Open a document first.');
  if (!other) throw new Error('Choose the document to compare with.');
  if (mode === 'compare') {
    const r = await api.post<{ id: string; title: string; changes: number }>('/review/compare', { other, base, baseId: e.docId(), mode, author });
    await commands.run('file.open', { id: r.id });
    return r;
  }
  const r = await api.post<{ document: FtxtDocument; changes: number }>('/review/compare', { other, base, baseId: e.docId(), mode, author });
  applyDocument(r.document);
  return { changes: r.changes };
}

export async function askCompare(mode: CompareMode): Promise<void> {
  const rows = await listOthers();
  if (!rows.length) throw new Error('There is no other document in the library to use.');
  const t = TEXT[mode];
  const d = new Dialog(t.title, 480);
  const pick = el<HTMLSelectElement>('<select class="ft-input" aria-label="Other document"></select>');
  for (const r of rows) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.title;
    pick.appendChild(o);
  }
  const who = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" placeholder="The other document\'s author">');
  d.field('Other document', pick);
  d.field('Attribute changes to', who);
  d.body.appendChild(el(`<p class="ft-note">${t.note}</p>`));
  d.button('Cancel', 'ghost', () => d.close());
  d.button(t.action, 'primary', () => {
    d.close();
    void runCompare(mode, pick.value, who.value).then((r) => toast(`${r.changes} difference${r.changes === 1 ? '' : 's'} found.`)).catch((err: Error) => toast(err.message, 'error'));
  });
  d.open(pick);
}
