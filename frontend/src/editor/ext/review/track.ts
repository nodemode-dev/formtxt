import { Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import { Fragment, type Mark, type Node as PMNode } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';
import { schema } from '../../schema';
import { type Mode, type Range, allComments, commentRanges, ed, me, newId, nowSec, notify, sameName, view } from './core';
import { REVIEW_META } from './comments';

export const trackKey = new PluginKey('review-track');
const REUSE_SECONDS = 600;

let mode: Mode = 'editing';
let modeListener: (m: Mode) => void = () => undefined;

export function currentMode(): Mode { return mode; }
export function onMode(fn: (m: Mode) => void): void { modeListener = fn; }

export function syncModeFromDoc(): void {
  const d = ed().doc;
  const next: Mode = d?.settings?.trackChanges ? 'suggesting' : 'editing';
  if (mode === 'viewing') leaveViewing();
  mode = next;
  ed().root.dataset.review = mode;
  modeListener(mode);
}

function leaveViewing(): void {
  const e = ed();
  e.view?.setProps({ editable: () => e.viewMode !== 'read' });
}

export function setMode(next: Mode): Mode {
  const e = ed();
  if (!e.view || !e.doc) throw new Error('Open a document first.');
  if (next === mode) return mode;
  if (mode === 'viewing') leaveViewing();
  if (next === 'viewing') e.view.setProps({ editable: () => false });
  const track = next === 'suggesting';
  if (!!e.doc.settings.trackChanges !== track) {
    e.doc = { ...e.doc, settings: { ...e.doc.settings, trackChanges: track } };
    e['emitChange']();
  }
  mode = next;
  e.root.dataset.review = mode;
  modeListener(mode);
  return mode;
}

type ChangeKind = 'ins' | 'del';
export interface Change { key: string; id: string; kind: ChangeKind; author: string; time: number; ranges: Range[]; text: string }

function markOf(node: PMNode, kind: ChangeKind): Mark | undefined {
  return node.marks.find((m) => m.type === schema.marks[kind]);
}

export function collectChanges(doc: PMNode): Change[] {
  const map = new Map<string, Change>();
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    for (const kind of ['ins', 'del'] as ChangeKind[]) {
      const m = markOf(node, kind);
      if (!m) continue;
      const key = `${kind}:${m.attrs.id}`;
      let c = map.get(key);
      if (!c) { c = { key, id: String(m.attrs.id), kind, author: String(m.attrs.author), time: Number(m.attrs.time), ranges: [], text: '' }; map.set(key, c); }
      const last = c.ranges[c.ranges.length - 1];
      const end = pos + node.nodeSize;
      if (last && last.to === pos) last.to = end; else c.ranges.push({ from: pos, to: end });
      c.text += node.isText ? node.text ?? '' : '￼';
    }
    return false;
  });
  return [...map.values()].sort((a, b) => a.ranges[0].from - b.ranges[0].from);
}

function attrsFor(doc: PMNode, from: number, to: number, kind: ChangeKind): { id: string; author: string; time: number } {
  const who = me();
  const t = nowSec();
  const near = [doc.resolve(from).nodeBefore, doc.resolve(to).nodeAfter];
  for (const n of near) {
    const m = n ? markOf(n, kind) : undefined;
    if (m && sameName(String(m.attrs.author), who) && t - Number(m.attrs.time) < REUSE_SECONDS) return { id: String(m.attrs.id), author: who, time: Number(m.attrs.time) };
  }
  return { id: newId('r_'), author: who, time: t };
}

function isMine(node: PMNode): boolean {
  const m = markOf(node, 'ins');
  return !!m && sameName(String(m.attrs.author), me());
}

function flat(content: Fragment): boolean {
  let ok = content.childCount > 0;
  content.forEach((n) => { if (!n.isInline) ok = false; });
  return ok;
}

function skip(tr: Transaction): boolean {
  return !!(tr.getMeta(REVIEW_META) || tr.getMeta(trackKey) || tr.getMeta('history$') || tr.getMeta('fields') || tr.getMeta('appendedTransaction') || tr.getMeta('addToHistory') === false);
}

function track(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  const changed = trs.filter((t) => t.docChanged);
  if (changed.length !== 1 || trs[trs.length - 1] !== changed[0]) return null;
  const tr = changed[0];  if (skip(tr) || tr.steps.length !== 1 || !(tr.steps[0] instanceof ReplaceStep)) return null;
  const step = tr.steps[0] as ReplaceStep & { from: number; to: number };
  const prev = tr.docs[0];
  const { from, to } = step;
  const size = step.slice.size;
  if (from === to && size === 0) return null;
  const fix = newState.tr.setMeta(trackKey, true).setMeta('addToHistory', true);
  let gap = 0;
  let caret = from + size;
  if (to > from) {
    const gone = prev.slice(from, to);
    if (gone.openStart === 0 && gone.openEnd === 0 && flat(gone.content)) {
      const keep: PMNode[] = [];
      const attrs = attrsFor(newState.doc, from, from, 'del');
      gone.content.forEach((n) => {
        if (isMine(n)) return;
        keep.push(markOf(n, 'del') ? n : n.mark(schema.marks.del.create(attrs).addToSet(n.marks)));
      });
      if (keep.length) {
        const frag = Fragment.from(keep);
        fix.insert(from, frag);
        gap = frag.size;
      }
      caret = size ? from + gap + size : (oldState.selection.empty && oldState.selection.head === from ? from + gap : from);
    } else {
      fix.step(step.invert(prev));
      const attrs = attrsFor(fix.doc, from, to, 'del');
      fix.addMark(from, to, schema.marks.del.create(attrs));
      if (size && step.slice.openStart === 0 && step.slice.openEnd === 0 && flat(step.slice.content)) {
        fix.insert(to, step.slice.content);
        const a = attrsFor(fix.doc, to, to, 'ins');
        fix.addMark(to, to + size, schema.marks.ins.create(a));
        caret = to + size;
      } else caret = from;
      return finish(fix, caret);
    }
  }
  if (size) {
    const a = attrsFor(fix.doc, from + gap, from + gap, 'ins');
    fix.addMark(from + gap, from + gap + size, schema.marks.ins.create(a));
  }
  return finish(fix, caret);
}

function finish(fix: Transaction, caret: number): Transaction | null {
  if (!fix.steps.length) return null;
  const pos = Math.max(0, Math.min(caret, fix.doc.content.size));
  const $p = fix.doc.resolve(pos);
  fix.setSelection($p.parent.inlineContent ? TextSelection.create(fix.doc, pos) : Selection.near($p));
  return fix;
}

export function trackPlugin(): Plugin {
  return new Plugin({
    key: trackKey,
    appendTransaction(trs, oldState, newState) {
      if (mode !== 'suggesting') return null;
      return track(trs, oldState, newState);
    },
  });
}

function wholeBlock(tr: Transaction, from: number, to: number): { from: number; to: number } {
  const $f = tr.doc.resolve(from);
  const $t = tr.doc.resolve(to);
  if ($f.parent === $t.parent && $f.parent.type === schema.nodes.paragraph && $f.parentOffset === 0 && $t.parentOffset === $t.parent.content.size && $f.node($f.depth - 1).childCount > 1) {
    return { from: $f.before(), to: $t.after() };
  }
  return { from, to };
}

export function applyChanges(list: Change[], accept: boolean): number {
  const v = view();
  const tr = v.state.tr.setMeta(REVIEW_META, true);
  const jobs: Array<{ from: number; to: number; remove: boolean; kind: ChangeKind }> = [];
  for (const c of list) for (const r of c.ranges) jobs.push({ from: r.from, to: r.to, remove: (c.kind === 'ins') !== accept, kind: c.kind });
  jobs.sort((a, b) => b.from - a.from);
  for (const j of jobs) {
    if (j.remove) {
      const w = wholeBlock(tr, j.from, j.to);
      tr.delete(w.from, w.to);
    } else tr.removeMark(j.from, j.to, schema.marks[j.kind]);
  }
  if (tr.docChanged) v.dispatch(tr);
  return list.length;
}

export function changesAtSelection(): Change[] {
  const v = view();
  const { from, to } = v.state.selection;
  return collectChanges(v.state.doc).filter((c) => c.ranges.some((r) => (from === to ? r.from <= from && from <= r.to : r.from < to && from < r.to)));
}

export function moveToChange(dir: 1 | -1): Change | null {
  const v = view();
  const all = collectChanges(v.state.doc);
  if (!all.length) return null;
  const at = v.state.selection.from;
  const starts = all.map((c) => c.ranges[0].from);
  let idx = -1;
  if (dir === 1) {
    idx = starts.findIndex((s) => s > at);
    if (idx < 0) idx = 0;
  } else {
    for (let i = starts.length - 1; i >= 0; i--) if (starts[i] < at) { idx = i; break; }
    if (idx < 0) idx = starts.length - 1;
  }
  const c = all[idx];
  const r = c.ranges[0];
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, r.from, c.ranges[c.ranges.length - 1].to)).scrollIntoView().setMeta(REVIEW_META, true));
  return c;
}

export interface Editor { author: string; inserted: number; deleted: number; commented: number }

export function editorsOf(): Editor[] {
  const v = view();
  const { from, to } = v.state.selection;
  const lo = from === to ? 0 : from;
  const hi = from === to ? v.state.doc.content.size : to;
  const out = new Map<string, Editor>();
  const row = (name: string): Editor => {
    const k = name.toLowerCase();
    let r = out.get(k);
    if (!r) { r = { author: name, inserted: 0, deleted: 0, commented: 0 }; out.set(k, r); }
    return r;
  };
  v.state.doc.nodesBetween(lo, hi, (node, pos) => {
    if (!node.isInline) return true;
    const len = Math.min(pos + node.nodeSize, hi) - Math.max(pos, lo);
    if (len <= 0) return false;
    const i = markOf(node, 'ins');
    const d = markOf(node, 'del');
    if (i) row(String(i.attrs.author)).inserted += len;
    if (d) row(String(d.attrs.author)).deleted += len;
    return false;
  });
  const all = allComments();
  for (const [id, r] of commentRanges(v.state.doc)) {
    if (!all[id] || r.to <= lo || r.from >= hi) continue;
    row(all[id].author).commented += 1;
  }
  return [...out.values()];
}

export function touch(): void { notify(); }
