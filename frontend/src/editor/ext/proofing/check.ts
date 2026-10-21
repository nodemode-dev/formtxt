import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { grammarIssues } from './grammar';
import { forgetWord, suggest, unknownWords } from './spell';
import { checkVersion, documentLanguage, engineAvailable, getPrefs, ignoreAllHas, ignoreOnceHas, onChange } from './state';
import { type ParaText, WORD_RE, paraText, spanAt } from './text';
import type { Category, Issue, RawIssue } from './types';

export interface ProofState { decos: DecorationSet; rev: number }

export const proofKey = new PluginKey<ProofState>('proofing');

interface Replace { pos: number; size: number; issues: Issue[] }

const ENGINE_LANG = /^en(-|$)/i;
const listeners = new Set<() => void>();
let current: ProofView | null = null;
let busy = 0;

export function onIssues(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function scanning(): boolean { return busy > 0 || !!current?.pending(); }

export function ignoreKey(i: Pick<Issue, 'rule' | 'text' | 'cat'>): string {
  return `${i.cat === 'spelling' ? 's' : 'g'}:${i.rule}:${i.cat === 'spelling' ? i.text.toLowerCase() : i.text}`;
}

function onceKey(i: Pick<Issue, 'rule' | 'text' | 'para' | 'nth'>): string {
  return `${i.para}|${i.rule}|${i.text}|${i.nth}`;
}

function toDeco(i: Issue): Decoration {
  return Decoration.inline(i.from, i.to, { class: `ft-pf ft-pf-${i.cat}`, 'data-pf': i.cat }, { issue: i, inclusiveStart: false, inclusiveEnd: false });
}

type Located = Issue & { from: number; to: number };

const memo = new WeakMap<ProofState, { doc: PMNode; list: Located[] }>();

export function issuesOf(state: EditorState): Located[] {
  const s = proofKey.getState(state);
  if (!s) return [];
  const hit = memo.get(s);
  if (hit && hit.doc === state.doc) return hit.list;
  const list = s.decos.find().map((d) => {
    const issue = (d as unknown as { spec: { issue: Issue } }).spec.issue;
    return { ...issue, from: d.from, to: d.to, text: state.doc.textBetween(d.from, d.to, ' ', ' ') || issue.text };
  }).sort((a, b) => a.from - b.from || a.to - b.to);
  memo.set(s, { doc: state.doc, list });
  return list;
}

export function issueAt(state: EditorState, pos: number): (Issue & { from: number; to: number }) | null {
  return issuesOf(state).find((i) => pos >= i.from && pos <= i.to) ?? null;
}

function docIndexPos(p: ParaText, index: number): number {
  if (index < p.map.length) return p.map[index];
  return p.map.length ? p.map[p.map.length - 1] + 1 : p.pos + 1;
}

function toIssue(raw: RawIssue, p: ParaText, lang: string): Issue {
  const from = docIndexPos(p, raw.from);
  const to = raw.to > raw.from ? p.map[Math.min(raw.to - 1, p.map.length - 1)] + 1 : from;
  return {
    ...raw,
    from,
    to,
    text: p.text.slice(raw.from, raw.to),
    para: String(p.node.attrs.id ?? ''),
    nth: 0,
    lang,
    fixes: raw.fixes.map((f) => ({ label: f.label, text: f.text, from: docIndexPos(p, f.from) - from, to: docIndexPos(p, f.to) - from })),
  };
}

function wordsIn(p: ParaText): Array<{ from: number; to: number; word: string; lang: string }> {
  const out: Array<{ from: number; to: number; word: string; lang: string }> = [];
  for (const m of p.text.matchAll(WORD_RE)) {
    let from = m.index;
    let word = m[0];
    while (word.endsWith("'") || word.endsWith('\u2019')) word = word.slice(0, -1);
    while (word.startsWith("'") || word.startsWith('\u2019')) { word = word.slice(1); from++; }
    if (word.length < 2 || /\p{N}/u.test(word)) continue;
    if (word === word.toUpperCase() || /\p{Ll}\p{Lu}/u.test(word)) continue;
    const span = spanAt(p, from);
    if (!span || span.skip || span.code || !ENGINE_LANG.test(span.lang)) continue;
    const before = p.text[from - 1];
    const after = p.text[from + word.length];
    if (before === '_' || after === '_' || before === '@' || before === '/' || before === '#' || after === '@' || after === '/' || (after === '.' && /^[a-z]{2,4}\b/.test(p.text.slice(from + word.length + 1, from + word.length + 6)) && before === '.')) continue;
    if (span.link && /^www\./i.test(p.text.slice(Math.max(0, from - 4), from + 4))) continue;
    out.push({ from, to: from + word.length, word, lang: span.lang });
  }
  return out;
}

async function analyse(p: ParaText, fallback: string): Promise<Issue[]> {
  const prefs = getPrefs();
  const issues: Issue[] = [];
  if (prefs.grammar) {
    const skip = (i: number): boolean => { const s = spanAt(p, i); return !s || s.skip || s.code || !ENGINE_LANG.test(s.lang); };
    for (const raw of grammarIssues(p.text, prefs.grammarRules, skip)) issues.push(toIssue(raw, p, fallback));
  }
  if (prefs.spelling && engineAvailable()) {
    const words = wordsIn(p);
    const byLang = new Map<string, string[]>();
    for (const w of words) byLang.set(w.lang, [...(byLang.get(w.lang) ?? []), w.word]);
    const bad = new Map<string, Set<string>>();
    for (const [lang, list] of byLang) bad.set(lang, await unknownWords(lang, list));
    for (const w of words) {
      if (!bad.get(w.lang)?.has(w.word)) continue;
      issues.push(toIssue({ from: w.from, to: w.to, cat: 'spelling', rule: 'spelling', message: `Not in the dictionary: ${w.word}`, fixes: [] }, p, w.lang));
    }
  }
  issues.sort((a, b) => a.from - b.from);
  const seen = new Map<string, number>();
  for (const i of issues) {
    const k = `${i.rule}|${i.text}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    i.nth = n;
  }
  return issues.filter((i) => !ignoreAllHas(ignoreKey(i)) && !ignoreOnceHas(onceKey(i)));
}

class ProofView {
  private readonly checked = new WeakMap<PMNode, number>();
  private readonly deferred = new Set<PMNode>();
  private timer = 0;
  private running = false;
  private again = false;
  private spell = '';

  private readonly off: () => void;

  constructor(private readonly view: EditorView) {
    this.syncBrowser();
    this.schedule(250);
    this.off = onChange(() => this.schedule(40));
  }

  pending(): boolean { return this.timer !== 0 || this.running; }

  alive(): boolean { return this.view.dom.isConnected; }

  syncBrowser(): void {
    const prefs = getPrefs();
    const own = prefs.spelling && engineAvailable();
    const want = own ? 'false' : 'true';
    if (this.spell !== want) { this.spell = want; this.view.dom.setAttribute('spellcheck', want); }
  }

  update(view: EditorView, prev: EditorState): void {
    const s = view.state;
    this.syncBrowser();
    if (s.doc !== prev.doc) {
      this.deferred.clear();
      this.schedule(350);
    } else if (!s.selection.eq(prev.selection) && this.releaseDeferred()) this.schedule(200);
    if (proofKey.getState(s) !== proofKey.getState(prev) || !s.selection.eq(prev.selection)) for (const l of listeners) l();
  }

  schedule(delay: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = 0; void this.run(); }, delay);
  }

  rescan(): void { this.schedule(0); }

  destroy(): void { window.clearTimeout(this.timer); this.off(); }

  private async run(): Promise<void> {
    if (this.running) { this.again = true; return; }
    this.running = true;
    busy++;
    try {
      do {
        this.again = false;
        await this.pass();
      } while (this.again);
    } finally {
      this.running = false;
      busy--;
      for (const l of listeners) l();
    }
  }

  private async pass(): Promise<void> {
    const view = this.view;
    const prefs = getPrefs();
    const ver = checkVersion();
    const doc = view.state.doc;
    const head = view.state.selection.head;
    const dirty: Array<{ node: PMNode; pos: number }> = [];
    doc.descendants((node, pos) => {
      if (node.isTextblock) {
        if (node.type.name === 'paragraph' && this.checked.get(node) !== ver) dirty.push({ node, pos });
        return false;
      }
      return true;
    });
    const stale = !prefs.spelling && !prefs.grammar;
    const todo = dirty.filter((d) => !this.deferred.has(d.node) || stale);
    if (!todo.length) return;
    todo.sort((a, b) => Math.abs(a.pos - head) - Math.abs(b.pos - head));
    const batch = todo.slice(0, 30);
    const lang = documentLanguage();
    const results: Replace[] = [];
    const focused = view.hasFocus();
    for (const { node, pos } of batch) {
      const p = paraText(node, pos, lang);
      let issues = stale ? [] : await analyse(p, lang);
      if (view.state.doc !== doc) { this.again = true; return; }
      if (focused && view.state.selection.empty) {
        const caught = issues.filter((i) => i.cat === 'spelling' && i.from < head && i.to >= head);
        if (caught.length) { this.deferred.add(node); issues = issues.filter((i) => !caught.includes(i)); }
      }
      results.push({ pos, size: node.nodeSize, issues });
    }
    const tr = view.state.tr.setMeta(proofKey, { replace: results }).setMeta('addToHistory', false);
    view.dispatch(tr);
    for (const { node } of batch) if (!this.deferred.has(node)) this.checked.set(node, ver);
    if (todo.length > batch.length) this.again = true;
  }

  releaseDeferred(): boolean {
    if (!this.deferred.size) return false;
    const head = this.view.state.selection.head;
    const here = this.view.state.doc.resolve(Math.min(head, this.view.state.doc.content.size)).parent;
    let released = false;
    for (const node of Array.from(this.deferred)) {
      if (node !== here) { this.deferred.delete(node); this.checked.delete(node); released = true; }
    }
    return released;
  }
}

export function proofingPlugin(): Plugin<ProofState> {
  return new Plugin<ProofState>({
    key: proofKey,
    state: {
      init: () => ({ decos: DecorationSet.empty, rev: 0 }),
      apply(tr, value) {
        let decos = tr.docChanged ? value.decos.map(tr.mapping, tr.doc) : value.decos;
        const meta = tr.getMeta(proofKey) as { replace?: Replace[]; clear?: boolean; drop?: Array<{ from: number; to: number }> } | undefined;
        let rev = value.rev;
        if (meta?.clear) { decos = DecorationSet.empty; rev++; }
        if (meta?.drop) {
          for (const d of meta.drop) decos = decos.remove(decos.find(d.from, d.to).filter((x) => x.from === d.from && x.to === d.to));
          rev++;
        }
        if (meta?.replace) {
          for (const r of meta.replace) {
            const end = Math.min(r.pos + r.size - 1, tr.doc.content.size);
            decos = decos.remove(decos.find(r.pos + 1, end));
            if (r.issues.length) decos = decos.add(tr.doc, r.issues.map(toDeco));
          }
          rev++;
        }
        return decos === value.decos && rev === value.rev ? value : { decos, rev };
      },
    },
    props: {
      decorations: (state) => proofKey.getState(state)?.decos ?? null,
    },
    view(view) {
      if (current && current.alive()) return {};
      const pv = new ProofView(view);
      current = pv;
      return {
        update: (v, prev) => pv.update(v, prev),
        destroy: () => { pv.destroy(); if (current === pv) current = null; },
      };
    },
  });
}

export function rescanNow(): void { current?.rescan(); }

export function clearAll(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(proofKey, { clear: true }).setMeta('addToHistory', false));
  current?.rescan();
}

export async function waitForScan(timeout = 8000): Promise<void> {
  const start = performance.now();
  current?.rescan();
  await new Promise((r) => setTimeout(r, 20));
  while (scanning() && performance.now() - start < timeout) await new Promise((r) => setTimeout(r, 40));
}

export function counts(state: EditorState): Record<Category, number> {
  const c: Record<Category, number> = { spelling: 0, grammar: 0, clarity: 0, conciseness: 0 };
  for (const i of issuesOf(state)) c[i.cat]++;
  return c;
}

export function applyFix(view: EditorView, issue: { from: number; to: number; fixes: Issue['fixes'] }, index: number): boolean {
  const fix = issue.fixes[index];
  if (!fix) return false;
  const tr = view.state.tr;
  const a = issue.from + fix.from;
  const b = issue.from + fix.to;
  if (a === b) tr.insertText(fix.text, a);
  else tr.insertText(fix.text, a, b);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function goToIssue(view: EditorView, issue: { from: number; to: number }, focus = true): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, issue.from, issue.to));
  view.dispatch(tr);
  const at = view.domAtPos(issue.from);
  const node = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : (at.node as HTMLElement);
  node?.scrollIntoView({ block: 'center', inline: 'nearest' });
  if (focus) view.focus();
}

export function nextIssue(view: EditorView, dir: 1 | -1, filter?: Category): (Issue & { from: number; to: number }) | null {
  const all = issuesOf(view.state).filter((i) => !filter || i.cat === filter);
  if (!all.length) return null;
  const sel = view.state.selection;
  if (dir === 1) return all.find((i) => i.from >= sel.to && !(i.from === sel.from && i.to === sel.to)) ?? all[0];
  const back = all.filter((i) => i.to <= sel.from && !(i.from === sel.from && i.to === sel.to));
  return back.length ? back[back.length - 1] : all[all.length - 1];
}

export function issueKeys(i: Issue): { all: string; once: string } {
  return { all: ignoreKey(i), once: onceKey(i) };
}

export async function suggestionsFor(i: Issue): Promise<string[]> {
  if (i.cat !== 'spelling') return i.fixes.map((f) => f.text);
  return suggest(i.lang, i.text);
}

export { forgetWord };
