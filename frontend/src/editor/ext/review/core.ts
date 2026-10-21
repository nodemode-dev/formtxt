import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { api } from '../../../io/api';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { peopleIn } from '../../chips';

export type Mode = 'editing' | 'suggesting' | 'viewing';
export type Reactions = Record<string, string[]>;

export interface Reply { id: string; author: string; time: number; text: string; reactions: Reactions }

export interface Comment {
  id: string;
  author: string;
  time: number;
  text: string;
  quote: string;
  resolved: boolean;
  assignee: string;
  mentions: string[];
  reactions: Reactions;
  replies: Reply[];
}

export interface Range { from: number; to: number }

let editor: DocEditor | null = null;
let author = '';
const listeners = new Set<() => void>();
let frame = 0;

export function bind(e: DocEditor): void {
  editor = e;
  void api.get<Record<string, unknown>>('/settings').then((s) => { author = String(s.author ?? '').trim(); notify(); }).catch(() => undefined);
}

export function ed(): DocEditor {
  if (!editor) throw new Error('The editor is not ready.');
  return editor;
}

export function view(): EditorView {
  const v = ed().view;
  if (!v) throw new Error('Open a document first.');
  return v;
}

export function me(): string {
  return author || ed().doc?.meta.author || 'Me';
}

export function onChange(fn: () => void): void { listeners.add(fn); }

export function notify(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; for (const fn of listeners) fn(); });
}

export const nowSec = (): number => Math.floor(Date.now() / 1000);

export function newId(prefix: string): string {
  return prefix + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('');
}

export function allComments(): Record<string, Comment> {
  const c = ed().doc?.comments;
  return c && typeof c === 'object' ? (c as Record<string, Comment>) : {};
}

export function putComments(next: Record<string, Comment>): void {
  const e = ed();
  if (!e.doc) throw new Error('Open a document first.');
  e.doc = { ...e.doc, comments: next };
  e['emitChange']();
  notify();
}

export function patchComment(id: string, fn: (c: Comment) => Comment): void {
  const cur = allComments()[id];
  if (!cur) throw new Error(`No comment has the id ${id}.`);
  putComments({ ...allComments(), [id]: fn(cur) });
}

export function commentRanges(doc: PMNode): Map<string, Range> {
  const out = new Map<string, Range>();
  const type = schema.marks.comment;
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const m of node.marks) {
      if (m.type !== type) continue;
      for (const id of m.attrs.ids as string[]) {
        const r = out.get(id);
        if (r) { r.from = Math.min(r.from, pos); r.to = Math.max(r.to, pos + node.nodeSize); } else out.set(id, { from: pos, to: pos + node.nodeSize });
      }
    }
    return false;
  });
  return out;
}

export function people(): string[] {
  const seen = new Map<string, string>();
  const add = (n: string): void => { const t = n.trim(); if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); };
  add(me());
  add('Agent');
  if (editor?.view) for (const p of peopleIn(editor.view.state.doc)) add(p.name || p.email);
  for (const c of Object.values(allComments())) { add(c.author); for (const r of c.replies ?? []) add(r.author); }
  return [...seen.values()];
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function when(t: number): string {
  if (!t) return '';
  return new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
