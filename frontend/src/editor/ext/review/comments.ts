import { TextSelection } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { schema } from '../../schema';
import { type Comment, type Reply, allComments, commentRanges, ed, me, newId, notify, nowSec, patchComment, putComments, sameName, view } from './core';

export const REVIEW_META = 'review';

const trash = new Map<string, Comment>();
let active = '';
let sheet: HTMLStyleElement | null = null;
let sheetKey = '';

export function activeId(): string { return active; }

export function setActive(id: string): void {
  if (id === active) return;
  active = id;
  paintSheet();
  notify();
}

export function paintSheet(): void {
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.dataset.review = 'comments';
    document.head.appendChild(sheet);
  }
  const rules: string[] = [];
  for (const c of Object.values(allComments())) if (c.resolved) rules.push(`.ft-cm[data-cm="${c.id}"]{background:transparent}`);
  if (active) rules.push(`.ft-cm[data-cm~="${active}"]{background:var(--rv-cm-active)}`);
  const key = rules.join('');
  if (key !== sheetKey) { sheetKey = key; sheet.textContent = key; }
}

function rewrite(tr: Transaction, from: number, to: number, fn: (ids: string[]) => string[]): void {
  const type = schema.marks.comment;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return true;
    const s = Math.max(pos, from);
    const e = Math.min(pos + node.nodeSize, to);
    if (s >= e) return false;
    const cur = node.marks.find((m) => m.type === type);
    const before = cur ? (cur.attrs.ids as string[]) : [];
    const next = fn(before);
    if (next.length === before.length && next.every((x, i) => x === before[i])) return false;
    if (next.length) tr.addMark(s, e, type.create({ ids: next })); else tr.removeMark(s, e, type);
    return false;
  });
}

export function selectionRange(): { from: number; to: number } {
  const v = view();
  const sel = v.state.selection;
  if (!sel.empty) return { from: sel.from, to: sel.to };
  const $p = sel.$from;
  if (!$p.parent.isTextblock) throw new Error('Select some text to comment on.');
  const text = $p.parent.textContent;
  let a = $p.parentOffset;
  let b = a;
  while (a > 0 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && /\S/.test(text[b])) b++;
  if (a === b) throw new Error('Select some text to comment on.');
  const start = $p.start();
  return { from: start + a, to: start + b };
}

export interface NewComment { text: string; author?: string; assignee?: string; reactions?: Record<string, string[]>; range?: { from: number; to: number } }

export function addComment(opts: NewComment): Comment {
  const v = view();
  const { from, to } = opts.range ?? selectionRange();
  const who = opts.author?.trim() || me();
  const text = opts.text.trim();
  if (!text && !opts.reactions) throw new Error('A comment needs some text.');
  const id = newId('c_');
  const comment: Comment = {
    id, author: who, time: nowSec(), text: text.slice(0, 8000),
    quote: v.state.doc.textBetween(from, to, ' ').slice(0, 240),
    resolved: false, assignee: opts.assignee?.trim() ?? '', mentions: mentionsIn(text), reactions: opts.reactions ?? {}, replies: [],
  };
  const tr = v.state.tr.setMeta(REVIEW_META, true);
  rewrite(tr, from, to, (ids) => [...ids, id]);
  v.dispatch(tr);
  putComments({ ...allComments(), [id]: comment });
  setActive(id);
  return comment;
}

export function mentionsIn(text: string, known: string[] = []): string[] {
  const names = known.length ? known : knownNames();
  return names.filter((n) => text.toLowerCase().includes(`@${n.toLowerCase()}`));
}

let knownNames = (): string[] => [];
export function setKnownNames(fn: () => string[]): void { knownNames = fn; }

function ownerCheck(author: string, as: string | undefined): void {
  if (!sameName(author, as?.trim() || me())) throw new Error(`Only ${author} can change this.`);
}

export function replyTo(id: string, text: string, as?: string, assignee?: string): Reply {
  const body = text.trim();
  if (!body) throw new Error('A reply needs some text.');
  const reply: Reply = { id: newId('r_'), author: as?.trim() || me(), time: nowSec(), text: body.slice(0, 8000), reactions: {} };
  patchComment(id, (c) => ({ ...c, replies: [...(c.replies ?? []), reply], mentions: [...new Set([...(c.mentions ?? []), ...mentionsIn(body)])], assignee: assignee ?? c.assignee }));
  return reply;
}

export function editMessage(id: string, replyId: string, text: string, as?: string): void {
  const body = text.trim();
  const c = allComments()[id];
  if (!c) throw new Error(`No comment has the id ${id}.`);
  if (replyId) {
    const r = c.replies.find((x) => x.id === replyId);
    if (!r) throw new Error(`No reply has the id ${replyId}.`);
    ownerCheck(r.author, as);
    if (!body) throw new Error('A reply needs some text.');
    patchComment(id, (cur) => ({ ...cur, replies: cur.replies.map((x) => (x.id === replyId ? { ...x, text: body } : x)) }));
    return;
  }
  ownerCheck(c.author, as);
  if (!body && !Object.keys(c.reactions).length) throw new Error('A comment needs some text.');
  patchComment(id, (cur) => ({ ...cur, text: body, mentions: mentionsIn(body) }));
}

export function deleteMessage(id: string, replyId: string, as?: string): void {
  const c = allComments()[id];
  if (!c) throw new Error(`No comment has the id ${id}.`);
  if (replyId) {
    const r = c.replies.find((x) => x.id === replyId);
    if (!r) throw new Error(`No reply has the id ${replyId}.`);
    ownerCheck(r.author, as);
    patchComment(id, (cur) => ({ ...cur, replies: cur.replies.filter((x) => x.id !== replyId) }));
    return;
  }
  ownerCheck(c.author, as);
  const v = view();
  const tr = v.state.tr.setMeta(REVIEW_META, true);
  rewrite(tr, 0, tr.doc.content.size, (ids) => ids.filter((x) => x !== id));
  if (tr.docChanged) v.dispatch(tr);
  trash.set(id, c);
  const next = { ...allComments() };
  delete next[id];
  putComments(next);
  if (active === id) setActive('');
}

export function restoreFromTrash(): void {
  if (!trash.size) return;
  const ranges = commentRanges(view().state.doc);
  const all = allComments();
  let next = all;
  for (const [id, c] of trash) {
    if (ranges.has(id) && !all[id]) { next = { ...next, [id]: c }; trash.delete(id); }
  }
  if (next !== all) putComments(next);
}

export function clearTrash(): void { trash.clear(); }

export function setResolved(id: string, resolved: boolean): void {
  patchComment(id, (c) => ({ ...c, resolved }));
  paintSheet();
}

export function setAssignee(id: string, to: string): void {
  patchComment(id, (c) => ({ ...c, assignee: to.trim() }));
}

export function toggleReaction(id: string, replyId: string, key: string, as?: string): void {
  const who = as?.trim() || me();
  const flip = (r: Record<string, string[]>): Record<string, string[]> => {
    const have = r[key] ?? [];
    const next = have.some((n) => sameName(n, who)) ? have.filter((n) => !sameName(n, who)) : [...have, who];
    const out = { ...r };
    if (next.length) out[key] = next; else delete out[key];
    return out;
  };
  patchComment(id, (c) => (replyId
    ? { ...c, replies: c.replies.map((x) => (x.id === replyId ? { ...x, reactions: flip(x.reactions ?? {}) } : x)) }
    : { ...c, reactions: flip(c.reactions ?? {}) }));
}

export function reactToSelection(key: string, as?: string): Comment {
  return addComment({ text: '', author: as, reactions: { [key]: [as?.trim() || me()] } });
}

export function gotoComment(id: string): boolean {
  const v = view();
  const r = commentRanges(v.state.doc).get(id);
  if (!r) return false;
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, r.from, r.to)).scrollIntoView().setMeta(REVIEW_META, true));
  setActive(id);
  return true;
}

export function linkTo(id: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('doc', ed().docId());
  url.searchParams.set('comment', id);
  return url.toString();
}

export interface Thread { comment: Comment; from: number; to: number }

export function threads(): Thread[] {
  const all = allComments();
  const out: Thread[] = [];
  for (const [id, r] of commentRanges(view().state.doc)) if (all[id]) out.push({ comment: all[id], from: r.from, to: r.to });
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

export function detectActive(): void {
  const v = view();
  const sel = v.state.selection;
  const $h = sel.$head;
  const type = schema.marks.comment;
  const ids = (n: { marks: readonly { type: unknown; attrs: Record<string, unknown> }[] } | null | undefined): string[] => (n ? n.marks.filter((m) => m.type === type).flatMap((m) => m.attrs.ids as string[]) : []);
  const after = ids($h.nodeAfter);
  const before = ids($h.nodeBefore);
  const both = after.filter((x) => before.includes(x));
  const pick = both[0] ?? (sel.empty ? '' : after[0] ?? '');
  const all = allComments();
  if (pick && all[pick]) setActive(pick);
  else if (active && sel.empty && !(after.includes(active) && before.includes(active))) setActive('');
}
