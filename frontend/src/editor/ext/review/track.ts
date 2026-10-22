import { Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { joinBackward, joinForward, selectNodeBackward, selectNodeForward } from 'prosemirror-commands';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { AddMarkStep, AttrStep, Mapping, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, type Step } from 'prosemirror-transform';
import { schema } from '../../schema';
import { type Mode, type Range, allComments, commentRanges, ed, me, newId, nowSec, notify, sameName, view } from './core';
import { REVIEW_META } from './comments';
import { api } from '../../../io/api';

export const trackKey = new PluginKey('review-track');
const REUSE_SECONDS = 600;

let mode: Mode = 'editing';
let modeListener: (m: Mode) => void = () => undefined;
let asAuthor = '';

export function suggestAs<T>(author: string, fn: () => T): T {
  const was = asAuthor;
  asAuthor = author.trim() || 'Agent';
  try { return fn(); } finally { asAuthor = was; }
}

const who = (): string => asAuthor || me();

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

type ChangeKind = 'ins' | 'del' | 'fmt' | 'split' | 'join' | 'pfmt';
type Op = { op: string; mark: string; attrs: Record<string, unknown> };
type Stamp = { id: string; author: string; time: number };
type PFmt = Stamp & { old: Record<string, unknown> };
export interface Change { key: string; id: string; kind: ChangeKind; author: string; time: number; ranges: Range[]; text: string; ops?: Op[]; para?: number }

export const KIND_LABEL: Record<ChangeKind, string> = { ins: 'inserted', del: 'deleted', fmt: 'formatted', split: 'new paragraph', join: 'joined paragraphs', pfmt: 'paragraph formatting' };

const PARA_KEYS = ['style', 'align', 'indent', 'indentRight', 'indentFirst', 'keepNext', 'keepLines', 'widowControl', 'border', 'shading', 'tabs', 'spaceBefore', 'spaceAfter', 'lineSpacing', 'list', 'level', 'checked', 'listFmt', 'dir', 'noHyphen', 'dropCap'];
const PARA_LABEL: Record<string, string> = { style: 'style', align: 'alignment', indent: 'indent', indentRight: 'right indent', indentFirst: 'first line indent', keepNext: 'keep with next', keepLines: 'keep lines together', widowControl: 'widow control', border: 'border', shading: 'shading', tabs: 'tab stops', spaceBefore: 'space before', spaceAfter: 'space after', lineSpacing: 'line spacing', list: 'list', level: 'list level', checked: 'checked', listFmt: 'list format', dir: 'direction', noHyphen: 'hyphenation', dropCap: 'drop cap' };

function markOf(node: PMNode, kind: 'ins' | 'del' | 'fmt'): Mark | undefined {
  return node.marks.find((m) => m.type === schema.marks[kind]);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function collectChanges(doc: PMNode): Change[] {
  const map = new Map<string, Change>();
  doc.descendants((node, pos) => {
    if (node.type === schema.nodes.paragraph) {
      const inner = { from: pos + 1, to: pos + node.nodeSize - 1 };
      for (const kind of ['split', 'join'] as const) {
        const a = node.attrs[kind === 'split' ? 'rvSplit' : 'rvJoin'] as { id?: string; author?: string; time?: number } | null;
        if (a?.id) map.set(`${kind}:${a.id}`, { key: `${kind}:${a.id}`, id: a.id, kind, author: String(a.author ?? ''), time: Number(a.time ?? 0), ranges: [{ ...inner }], para: pos, text: kind === 'split' ? 'Paragraph break' : 'Paragraph mark' });
      }
      const pf = node.attrs.rvFmt as PFmt | null;
      if (pf?.id) {
        const keys = Object.keys(pf.old ?? {}).map((k) => PARA_LABEL[k] ?? k);
        map.set(`pfmt:${pf.id}`, { key: `pfmt:${pf.id}`, id: pf.id, kind: 'pfmt', author: String(pf.author ?? ''), time: Number(pf.time ?? 0), ranges: [{ ...inner }], para: pos, text: keys.join(', ') || 'Paragraph' });
      }
    }
    if (!node.isInline) return true;
    for (const fm of node.marks.filter((m) => m.type === schema.marks.fmt)) {
      const key = `fmt:${fm.attrs.id}:${pos}`;
      const prevKey = [...map.keys()].reverse().find((k) => k.startsWith(`fmt:${fm.attrs.id}:`));
      const prev = prevKey ? map.get(prevKey) : undefined;
      const last = prev?.ranges[prev.ranges.length - 1];
      if (prev && last && last.to === pos && JSON.stringify(prev.ops) === JSON.stringify(fm.attrs.ops)) { last.to = pos + node.nodeSize; prev.text += node.isText ? node.text ?? '' : ''; }
      else map.set(key, { key, id: String(fm.attrs.id), kind: 'fmt', author: String(fm.attrs.author), time: Number(fm.attrs.time), ranges: [{ from: pos, to: pos + node.nodeSize }], text: node.isText ? node.text ?? '' : '', ops: fm.attrs.ops as Change['ops'] });
    }
    for (const kind of ['ins', 'del'] as const) {
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

function attrsFor(doc: PMNode, from: number, to: number, kind: 'ins' | 'del'): Stamp {
  const name = who();
  const t = nowSec();
  const near = [doc.resolve(from).nodeBefore, doc.resolve(to).nodeAfter];
  for (const n of near) {
    const m = n ? markOf(n, kind) : undefined;
    if (m && sameName(String(m.attrs.author), name) && (kind === 'ins' || t - Number(m.attrs.time) < REUSE_SECONDS)) return { id: String(m.attrs.id), author: name, time: Number(m.attrs.time) };
  }
  return { id: newId('r_'), author: name, time: t };
}

function isMine(node: PMNode): boolean {
  const m = markOf(node, 'ins');
  return !!m && sameName(String(m.attrs.author), who());
}

function skip(tr: Transaction): boolean {
  return !!(tr.getMeta(REVIEW_META) || tr.getMeta(trackKey) || tr.getMeta('history$') || tr.getMeta('fields') || tr.getMeta('collabRemote') || tr.getMeta('collabInit') || tr.getMeta('addToHistory') === false);
}

const UNTRACKED = new Set(['ins', 'del', 'fmt', 'comment']);

function trackMark(fix: Transaction, s: AddMarkStep | RemoveMarkStep): void {
  if (UNTRACKED.has(s.mark.type.name)) return;
  const fmt = schema.marks.fmt;
  const name = who();
  const op: Op = { op: s instanceof AddMarkStep ? 'add' : 'remove', mark: s.mark.type.name, attrs: s.mark.attrs };
  const inverse = (o: Op): boolean => o.mark === op.mark && o.op !== op.op && same(o.attrs, op.attrs);
  const pieces: Array<{ from: number; to: number; prev: Mark | undefined; own: boolean }> = [];
  fix.doc.nodesBetween(s.from, s.to, (node, pos) => {
    if (!node.isInline) return true;
    pieces.push({ from: Math.max(pos, s.from), to: Math.min(pos + node.nodeSize, s.to), prev: node.marks.find((m) => m.type === fmt && sameName(String(m.attrs.author), name)), own: isMine(node) });
    return false;
  });
  const fresh = newId('r_');
  for (const p of pieces) {
    if (p.own) continue;
    const before = ((p.prev?.attrs.ops as Op[] | undefined) ?? []).slice();
    if (before.length && inverse(before[before.length - 1])) before.pop(); else before.push(op);
    if (p.prev) fix.removeMark(p.from, p.to, p.prev);
    if (before.length) fix.addMark(p.from, p.to, fmt.create({ id: p.prev ? String(p.prev.attrs.id) : fresh, author: name, time: p.prev ? Number(p.prev.attrs.time) : nowSec(), ops: before }));
  }
}

function trackParaAttrs(fix: Transaction, pos: number, before: Record<string, unknown>): void {
  const node = fix.doc.nodeAt(pos);
  if (!node || node.type !== schema.nodes.paragraph) return;
  const prev = node.attrs.rvFmt as PFmt | null;
  const old: Record<string, unknown> = { ...(prev?.old ?? {}) };
  for (const k of PARA_KEYS) if (!same(before[k], node.attrs[k]) && !(k in old)) old[k] = before[k];
  for (const k of Object.keys(old)) if (same(old[k], node.attrs[k])) delete old[k];
  const next = Object.keys(old).length ? { id: prev?.id ?? newId('r_'), author: prev?.author ?? who(), time: prev?.time ?? nowSec(), old } : null;
  if (!same(next, prev)) fix.setNodeMarkup(pos, undefined, { ...node.attrs, rvFmt: next });
}

function markGone(fix: Transaction, from: number, to: number): number {
  const name = who();
  const segs: Array<{ from: number; to: number; own: boolean; del: boolean }> = [];
  const blocks: Array<{ from: number; to: number }> = [];
  fix.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isInline) { segs.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to), own: isMine(node), del: !!markOf(node, 'del') }); return false; }
    if (node.isLeaf && node.isBlock && pos >= from && pos + node.nodeSize <= to) { blocks.push({ from: pos, to: pos + node.nodeSize }); return false; }
    return true;
  });
  const attrs = attrsFor(fix.doc, from, to, 'del');
  for (const s of segs) if (!s.own && !s.del) fix.addMark(s.from, s.to, schema.marks.del.create(attrs));
  const dead = [...segs.filter((s) => s.own), ...blocks].sort((a, b) => b.from - a.from);
  let end = to;
  for (const d of dead) { fix.delete(d.from, d.to); end -= d.to - d.from; }
  const ends: number[] = [];
  fix.doc.nodesBetween(from, Math.max(from, end), (node, pos) => {
    if (node.type === schema.nodes.paragraph) { const e = pos + node.nodeSize; if (e > from && e <= end) ends.push(e); return false; }
    return true;
  });
  for (const e of ends.reverse()) {
    const $e = fix.doc.resolve(e);
    const a = $e.nodeBefore;
    const b = $e.nodeAfter;
    if (!a || a.type !== schema.nodes.paragraph) continue;
    const rs = b?.type === schema.nodes.paragraph ? (b.attrs.rvSplit as Stamp | null) : null;
    if (b && rs && sameName(String(rs.author), name)) {
      fix.join(e);
      fix.setNodeMarkup(e - a.nodeSize, undefined, { ...a.attrs, rvJoin: b.attrs.rvJoin ?? null });
      end -= 2;
    } else if (!a.attrs.rvJoin) fix.setNodeMarkup(e - a.nodeSize, undefined, { ...a.attrs, rvJoin: { id: newId('r_'), author: name, time: nowSec() } });
  }
  return end;
}

function markAdded(fix: Transaction, from: number, to: number): void {
  if (to <= from) return;
  const a = attrsFor(fix.doc, from, to, 'ins');
  fix.removeMark(from, to, schema.marks.del);
  fix.removeMark(from, to, schema.marks.fmt);
  fix.addMark(from, to, schema.marks.ins.create(a));
  const born: number[] = [];
  fix.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === schema.nodes.paragraph) { if (pos >= from && pos < to) born.push(pos); return false; }
    return true;
  });
  for (const pos of born) {
    const node = fix.doc.nodeAt(pos);
    if (!node) continue;
    fix.setNodeMarkup(pos, undefined, { ...node.attrs, rvSplit: { id: newId('r_'), author: who(), time: nowSec() } });
    const before = fix.doc.resolve(pos).nodeBefore;
    const j = node.attrs.rvJoin as Stamp | null;
    if (before && j && before.type === schema.nodes.paragraph && same((before.attrs.rvJoin as Stamp | null)?.id, j.id)) fix.setNodeMarkup(pos - before.nodeSize, undefined, { ...before.attrs, rvJoin: null });
  }
}

type Item = { step: Step; raw: boolean; before: PMNode };

function paraSetter(step: Step, doc: PMNode): { pos: number; attrs: Record<string, unknown> } | null {
  if (step instanceof AttrStep) {
    const n = doc.nodeAt(step.pos);
    return n && n.type === schema.nodes.paragraph ? { pos: step.pos, attrs: n.attrs } : null;
  }
  if (step instanceof ReplaceAroundStep) {
    const s = step as ReplaceAroundStep & { from: number; to: number; gapFrom: number; gapTo: number; insert: number };
    const n = doc.nodeAt(s.from);
    const k = s.slice.content.firstChild;
    if (n && k && n.type === schema.nodes.paragraph && k.type === n.type && s.slice.content.childCount === 1 && s.insert === 1 && s.gapFrom === s.from + 1 && s.gapTo === s.to - 1 && s.to === s.from + n.nodeSize) return { pos: s.from, attrs: n.attrs };
  }
  return null;
}

function track(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  const chain = trs.filter((t) => t.docChanged);
  const root = chain[0];
  if (!root || root !== trs[0] || root.getMeta('appendedTransaction') || skip(root)) return null;
  if (chain.slice(1).some((t) => !t.getMeta('appendedTransaction') || t.getMeta(trackKey))) return null;
  const items: Item[] = [];
  for (const t of chain) t.steps.forEach((step, i) => items.push({ step, raw: t !== root && skip(t), before: t.docs[i] }));
  const wants = (it: Item): boolean => !it.raw && (it.step instanceof ReplaceStep || ((it.step instanceof AddMarkStep || it.step instanceof RemoveMarkStep) && !UNTRACKED.has(it.step.mark.type.name)) || !!paraSetter(it.step, it.before));
  if (!items.some(wants)) return null;
  const fix = newState.tr.setMeta(trackKey, true).setMeta('addToHistory', true);
  for (let i = items.length - 1; i >= 0; i--) fix.step(items[i].step.invert(items[i].before));
  if (!fix.doc.eq(items[0].before)) return null;
  let path: Mapping['maps'] = [];
  for (const it of items) {
    const m = new Mapping(path);
    const start = fix.steps.length;
    const step = it.step;
    if (!it.raw && step instanceof ReplaceStep) {
      const s = step as ReplaceStep & { from: number; to: number };
      const f = m.map(s.from, 1);
      const t = s.to > s.from ? Math.max(f, m.map(s.to, -1)) : f;
      const at = t > f ? markGone(fix, f, t) : f;
      const slice = s.slice;
      if (slice.size) {
        const size0 = fix.doc.content.size;
        const direct = fix.maybeStep(new ReplaceStep(at, at, slice));
        if (direct.failed) fix.replace(at, at, slice);
        markAdded(fix, at, at + (fix.doc.content.size - size0));
      }
    } else {
      const mapped = step.map(m);
      if (mapped) {
        const para = paraSetter(mapped, fix.doc);
        const was = para ? { ...para.attrs } : null;
        const res = fix.maybeStep(mapped);
        if (!res.failed && para && was) {
          const now = fix.doc.nodeAt(para.pos);
          const keep = { rvSplit: was.rvSplit ?? null, rvJoin: was.rvJoin ?? null, rvFmt: was.rvFmt ?? null };
          if (now && now.type === schema.nodes.paragraph && (!same(now.attrs.rvSplit, keep.rvSplit) || !same(now.attrs.rvJoin, keep.rvJoin) || !same(now.attrs.rvFmt, keep.rvFmt))) fix.setNodeMarkup(para.pos, undefined, { ...now.attrs, ...keep });
          if (!it.raw) trackParaAttrs(fix, para.pos, was);
        } else if (!res.failed && !it.raw && (mapped instanceof AddMarkStep || mapped instanceof RemoveMarkStep)) trackMark(fix, mapped);
      }
    }
    path = [step.getMap().invert(), ...path, ...fix.mapping.maps.slice(start)];
  }
  if (!fix.docChanged) return null;
  const m = new Mapping(path);
  const sel = newState.selection;
  let head = m.map(sel.head, 1);
  let anchor = m.map(sel.anchor, 1);
  if (items.length === 1 && items[0].step instanceof ReplaceStep) {
    const s = items[0].step as ReplaceStep & { from: number; to: number };
    if (s.slice.size === 0 && s.to > s.from) {
      const forward = oldState.selection.empty && oldState.selection.head === s.from;
      head = anchor = forward ? m.map(s.from, 1) : m.map(s.from, -1);
    }
  }
  const pos = Math.max(0, Math.min(head, fix.doc.content.size));
  const $p = fix.doc.resolve(pos);
  if (sel instanceof TextSelection && $p.parent.inlineContent) {
    const a = Math.max(0, Math.min(anchor, fix.doc.content.size));
    fix.setSelection(fix.doc.resolve(a).parent.inlineContent ? TextSelection.create(fix.doc, a, pos) : TextSelection.create(fix.doc, pos));
  } else fix.setSelection(Selection.near($p));
  return fix;
}

function skipGone(doc: PMNode, pos: number, dir: -1 | 1): number {
  let at = pos;
  for (;;) {
    const $p = doc.resolve(at);
    const n = dir < 0 ? $p.nodeBefore : $p.nodeAfter;
    if (n && n.isInline && markOf(n, 'del')) at += dir * n.nodeSize; else return at;
  }
}

function eraseKey(v: EditorView, dir: -1 | 1, word: boolean): boolean {
  const sel = v.state.selection;
  if (!(sel instanceof TextSelection) || !sel.empty) return false;
  const pos = skipGone(v.state.doc, sel.head, dir);
  const $p = v.state.doc.resolve(pos);
  const atEdge = dir < 0 ? $p.parentOffset === 0 : $p.parentOffset === $p.parent.content.size;
  if (pos !== sel.head) v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)));
  if (atEdge) {
    const run = dir < 0 ? joinBackward(v.state, v.dispatch, v) || selectNodeBackward(v.state, v.dispatch, v) : joinForward(v.state, v.dispatch, v) || selectNodeForward(v.state, v.dispatch, v);
    return run || pos !== sel.head;
  }
  let len = 0;
  const side = dir < 0 ? $p.nodeBefore : $p.nodeAfter;
  if (word) {
    const text = dir < 0 ? $p.parent.textBetween(0, $p.parentOffset, undefined, '￼') : $p.parent.textBetween($p.parentOffset, $p.parent.content.size, undefined, '￼');
    len = (dir < 0 ? /([^\s]+\s*|\s+)$/ : /^(\s*[^\s]+|\s+)/).exec(text)?.[0].length ?? 1;
  } else if (side?.isText) {
    const s = side.text ?? '';
    const pair = dir < 0 ? /[\uD800-\uDBFF][\uDC00-\uDFFF]$/ : /^[\uD800-\uDBFF][\uDC00-\uDFFF]/;
    len = pair.test(s) ? 2 : 1;
  } else len = side ? side.nodeSize : 1;
  const from = dir < 0 ? pos - len : pos;
  v.dispatch(v.state.tr.delete(from, from + len).scrollIntoView());
  return true;
}

export function trackPlugin(): Plugin {
  return new Plugin({
    key: trackKey,
    props: {
      handleKeyDown(v, e) {
        if ((mode !== 'suggesting' && !asAuthor) || e.isComposing || e.shiftKey || e.metaKey) return false;
        if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
        return eraseKey(v, e.key === 'Backspace' ? -1 : 1, e.ctrlKey || e.altKey);
      },
    },
    appendTransaction(trs, oldState, newState) {
      if (mode !== 'suggesting' && !asAuthor) return null;
      return track(trs, oldState, newState);
    },
  });
}

function findPara(doc: PMNode, attr: 'rvSplit' | 'rvJoin' | 'rvFmt', id: string): number {
  let at = -1;
  doc.descendants((node, pos) => {
    if (at >= 0) return false;
    if (node.type === schema.nodes.paragraph) { if (String((node.attrs[attr] as Stamp | null)?.id ?? '') === id) at = pos; return false; }
    return true;
  });
  return at;
}

function joinParas(tr: Transaction, pos: number, keepSecond: boolean): void {
  const $p = tr.doc.resolve(pos);
  const a = $p.nodeBefore;
  const b = $p.nodeAfter;
  if (!a || !b || a.type !== schema.nodes.paragraph || b.type !== schema.nodes.paragraph) return;
  const start = pos - a.nodeSize;
  if (keepSecond && a.content.size === 0) { tr.delete(start, pos); return; }
  tr.join(pos);
  tr.setNodeMarkup(start, undefined, { ...a.attrs, rvJoin: b.attrs.rvJoin ?? null });
}

export function applyChanges(list: Change[], accept: boolean): number {
  const v = view();
  const tr = v.state.tr.setMeta(REVIEW_META, true);
  const jobs: Array<{ from: number; to: number; c: Change }> = [];
  for (const c of list) if (c.para === undefined) for (const r of c.ranges) jobs.push({ from: r.from, to: r.to, c });
  jobs.sort((a, b) => b.from - a.from || (a.c.kind === 'fmt' ? -1 : 0) - (b.c.kind === 'fmt' ? -1 : 0));
  for (const j of jobs) {
    const from = tr.mapping.map(j.from, 1);
    const to = tr.mapping.map(j.to, -1);
    if (to <= from) continue;
    const kind = j.c.kind;
    if (kind === 'fmt') {
      const fm = tr.doc.nodeAt(from)?.marks.find((m) => m.type === schema.marks.fmt && String(m.attrs.id) === j.c.id);
      if (!accept) {
        for (const op of [...(j.c.ops ?? [])].reverse()) {
          const type = schema.marks[op.mark];
          if (!type) continue;
          if (op.op === 'add') tr.removeMark(from, to, type); else tr.addMark(from, to, type.create(op.attrs));
        }
      }
      if (fm) tr.removeMark(from, to, fm);
    } else if ((kind === 'ins') !== accept) tr.delete(from, to);
    else tr.removeMark(from, to, schema.marks[kind]);
  }
  for (const c of list) {
    if (c.para === undefined) continue;
    const attr = c.kind === 'split' ? 'rvSplit' : c.kind === 'join' ? 'rvJoin' : 'rvFmt';
    const pos = findPara(tr.doc, attr, c.id);
    const node = pos >= 0 ? tr.doc.nodeAt(pos) : null;
    if (!node) continue;
    if (c.kind === 'pfmt') {
      const old = accept ? {} : ((node.attrs.rvFmt as PFmt).old ?? {});
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...old, rvFmt: null });
      continue;
    }
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: null });
    if (c.kind === 'split' && !accept && pos > 0) joinParas(tr, pos, false);
    else if (c.kind === 'join' && accept) joinParas(tr, pos + node.nodeSize, true);
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

export interface Editor { author: string; inserted: number; deleted: number; commented: number; edited?: number; last?: number }

export async function editorsWithHistory(): Promise<Editor[]> {
  const v = view();
  const rows = editorsOf();
  const { from, to } = v.state.selection;
  const lo = from === to ? 0 : from;
  const hi = from === to ? v.state.doc.content.size : to;
  const ids: string[] = [];
  v.state.doc.nodesBetween(lo, hi, (node) => { if (node.type === schema.nodes.paragraph) { if (node.attrs.id) ids.push(String(node.attrs.id)); return false; } return true; });
  const docId = ed().docId();
  if (!ids.length || !docId) return rows;
  let hist: Record<string, Array<{ author: string; time: number }>> = {};
  try { hist = (await api.get<{ editors: typeof hist }>(`/versions/${encodeURIComponent(docId)}/editors?ids=${encodeURIComponent(ids.slice(0, 500).join(','))}`)).editors; } catch { return rows; }
  const byName = new Map(rows.map((r) => [r.author.toLowerCase(), r]));
  for (const list of Object.values(hist)) {
    const counted = new Set<string>();
    for (const h of list) {
      const k = h.author.toLowerCase();
      let r = byName.get(k);
      if (!r) { r = { author: h.author, inserted: 0, deleted: 0, commented: 0 }; byName.set(k, r); rows.push(r); }
      if (!counted.has(k)) { r.edited = (r.edited ?? 0) + 1; counted.add(k); }
      r.last = Math.max(r.last ?? 0, h.time);
    }
  }
  return rows.sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
}

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
