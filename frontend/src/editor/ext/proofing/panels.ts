import type { DocEditor } from '../../editor';
import { el, patchList, setClass, setDisabled, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { panelOpen } from '../ui';
import { type A11yIssue, accessibilityIssues, applyFix as applyA11yFix, describe, goToIssue as goToA11y } from './access';
import { accept, addToDictionary, changeAll, current, ignoreAll, ignoreOnce, move } from './actions';
import { counts, goToIssue, issuesOf, onIssues, scanning, suggestionsFor } from './check';
import { announce } from './kit';
import { engineAvailable, getPrefs, onChange } from './state';
import { CATEGORIES, CATEGORY_LABEL, type Category, type Issue } from './types';

type Located = Issue & { from: number; to: number };

export const EDITOR_PANEL = 'editor';
export const ACCESS_PANEL = 'accessibility';

const WEIGHT: Record<Category, number> = { spelling: 3, grammar: 2, clarity: 1, conciseness: 0.75, formality: 0.75, inclusiveness: 1 };

export function editorScore(c: Record<Category, number>, words: number): number {
  const weighted = CATEGORIES.reduce((n, k) => n + c[k] * WEIGHT[k], 0);
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp((-3 * weighted) / Math.max(words, 50)))));
}

function raf(fn: () => void): () => void {
  let queued = false;
  return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
}

export class EditorPanel {
  readonly root: HTMLElement;
  private filter: Category | null = null;
  private sugKey = '';
  private sugToken = 0;
  private wordsDoc: unknown = null;
  private wordCount = 0;
  private readonly refs: Record<string, HTMLElement>;
  private readonly catButtons: Record<Category, HTMLButtonElement>;
  readonly schedule = raf(() => this.patch());

  constructor(private readonly ed: DocEditor) {
    this.root = el(`<section class="ft-pf-panel" aria-label="Editor">
<div class="ft-pf-score">
  <div class="ft-pf-score-main"><span class="ft-pf-score-num" data-ref="score">100</span><span class="ft-pf-score-label">Editor score</span></div>
  <div class="ft-pf-meter" role="presentation"><i data-ref="meter"></i></div>
  <p class="ft-pf-state" role="status" data-ref="state">Checking</p>
</div>
<div class="ft-pf-cats" role="group" aria-label="Filter suggestions by category"></div>
<div class="ft-pf-current" data-ref="card" hidden>
  <p class="ft-pf-current-cat" data-ref="cardCat"></p>
  <p class="ft-pf-current-msg" data-ref="cardMsg"></p>
  <p class="ft-pf-current-text" data-ref="cardText"></p>
  <div class="ft-pf-sugs" role="group" aria-label="Suggestions" data-ref="sugs"></div>
  <p class="ft-note" data-ref="noSug" hidden>No suggestions.</p>
  <div class="ft-pf-actions">
    <button type="button" class="ft-btn sm" data-act="once">Ignore once</button>
    <button type="button" class="ft-btn sm" data-act="all">Ignore all</button>
    <button type="button" class="ft-btn sm" data-act="dict" data-ref="dict">Add to dictionary</button>
  </div>
</div>
<div class="ft-pf-nav">
  <button type="button" class="ft-btn sm" data-act="prev">Previous</button>
  <button type="button" class="ft-btn sm" data-act="next">Next</button>
  <button type="button" class="ft-btn sm ghost" data-act="options">Options</button>
  <button type="button" class="ft-btn sm ghost" data-act="stats">Readability</button>
</div>
<ul class="ft-pf-list" aria-label="All suggestions" data-ref="list"></ul>
<p class="ft-note ft-pf-more" data-ref="more" hidden></p>
<p class="ft-note ft-pf-engine" data-ref="engine" hidden>The spelling engine is not reachable, so only the browser's own checker is active.</p>
</section>`);
    this.refs = {};
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-ref]'))) this.refs[n.dataset.ref ?? ''] = n;
    const cats = this.root.querySelector('.ft-pf-cats') as HTMLElement;
    this.catButtons = {} as Record<Category, HTMLButtonElement>;
    for (const c of CATEGORIES) {
      const b = el<HTMLButtonElement>(`<button type="button" class="ft-pf-cat" data-cat="${c}" aria-pressed="false"><span class="ft-pf-dot" data-cat="${c}" aria-hidden="true"></span><span class="ft-pf-cat-name">${CATEGORY_LABEL[c]}</span><span class="ft-pf-cat-count" data-count>0</span></button>`);
      b.addEventListener('click', () => { this.filter = this.filter === c ? null : c; this.schedule(); });
      this.catButtons[c] = b;
      cats.appendChild(b);
    }
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) void this.act(act).catch((err: Error) => toast(err.message, 'error'));
      const item = (e.target as HTMLElement).closest<HTMLElement>('.ft-pf-item');
      if (item && ed.view) {
        const hit = issuesOf(ed.view.state).find((i) => `${i.para}|${i.rule}|${i.text}|${i.nth}` === item.dataset.key);
        if (hit) goToIssue(ed.view, hit);
      }
      const sug = (e.target as HTMLElement).closest<HTMLElement>('[data-sug]');
      if (sug) void this.pick(Number(sug.dataset.sug)).catch((err: Error) => toast(err.message, 'error'));
    });
    onIssues(this.schedule);
    onChange(this.schedule);
  }

  private async act(act: string): Promise<void> {
    const ed = this.ed;
    const cur = current(ed);
    if (act === 'prev') { move(ed, -1, this.filter ?? undefined); return; }
    if (act === 'next') { move(ed, 1, this.filter ?? undefined); return; }
    if (act === 'options') { await import('./dialogs').then((m) => m.proofingOptionsDialog(ed)); return; }
    if (act === 'stats') { await import('./dialogs').then((m) => m.readabilityDialog(ed)); return; }
    if (!cur) return;
    if (act === 'once') { ignoreOnce(ed, cur); move(ed, 1, this.filter ?? undefined); }
    if (act === 'all') { ignoreAll(ed, cur); move(ed, 1, this.filter ?? undefined); }
    if (act === 'dict') { await addToDictionary(ed, cur); move(ed, 1, this.filter ?? undefined); }
  }

  private async pick(index: number): Promise<void> {
    const cur = current(this.ed);
    if (!cur) return;
    await accept(this.ed, cur, index);
    move(this.ed, 1, this.filter ?? undefined);
  }

  private async suggestionsInto(cur: Located): Promise<void> {
    const key = `${cur.para}|${cur.rule}|${cur.text}|${cur.nth}`;
    if (key === this.sugKey) return;
    this.sugKey = key;
    const token = ++this.sugToken;
    this.paintSuggestions([], true);
    const list = (await suggestionsFor(cur)).slice(0, 6);
    if (token !== this.sugToken) return;
    this.paintSuggestions(list, false);
  }

  private paintSuggestions(list: string[], loading: boolean): void {
    patchList(this.refs.sugs, list.map((text, i) => ({ text, i })), {
      key: (x) => `${x.i}:${x.text}`,
      create: (x) => { const b = el<HTMLButtonElement>('<button type="button" class="ft-btn sm ft-pf-sug"></button>'); b.dataset.sug = String(x.i); setText(b, x.text || '(delete)'); return b; },
      update: (n, x) => { n.dataset.sug = String(x.i); setText(n, x.text || '(delete)'); },
    });
    setHidden(this.refs.noSug, loading || list.length > 0);
  }

  patch(): void {
    const view = this.ed.view;
    if (!view || !panelOpen(EDITOR_PANEL)) return;
    const all = issuesOf(view.state);
    const c = counts(view.state);
    if (this.wordsDoc !== view.state.doc) { this.wordsDoc = view.state.doc; this.wordCount = this.ed.words(); }
    const words = this.wordCount;
    const score = editorScore(c, words);
    setText(this.refs.score, String(score));
    (this.refs.meter as HTMLElement).style.setProperty('--ft-pf-score', `${score}%`);
    const busy = scanning();
    setText(this.refs.state, busy ? 'Checking' : all.length ? `${all.length} suggestion${all.length === 1 ? '' : 's'}` : 'No suggestions. Nice work.');
    for (const k of CATEGORIES) {
      const b = this.catButtons[k];
      setText(b.querySelector('[data-count]'), String(c[k]));
      const on = this.filter === k;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
      setClass(b, 'is-on', on);
    }
    const shown = (this.filter ? all.filter((i) => i.cat === this.filter) : all);
    const cap = shown.slice(0, 120);
    patchList(this.refs.list, cap, {
      key: (i) => `${i.para}|${i.rule}|${i.text}|${i.nth}`,
      create: (i) => {
        const li = el<HTMLElement>('<li class="ft-pf-item"><button type="button" class="ft-pf-item-btn"><span class="ft-pf-dot" aria-hidden="true"></span><span class="ft-pf-item-text"></span><span class="ft-pf-item-msg"></span></button></li>');
        this.fillItem(li, i);
        return li;
      },
      update: (n, i) => this.fillItem(n, i),
    });
    setHidden(this.refs.more, shown.length <= cap.length);
    setText(this.refs.more, `Showing the first ${cap.length} of ${shown.length}.`);
    setHidden(this.refs.engine, engineAvailable() || !getPrefs().spelling);
    const cur = current(this.ed);
    setHidden(this.refs.card, !cur);
    if (cur) {
      setText(this.refs.cardCat, CATEGORY_LABEL[cur.cat]);
      (this.refs.cardCat as HTMLElement).dataset.cat = cur.cat;
      setText(this.refs.cardMsg, cur.message);
      setText(this.refs.cardText, cur.text);
      setHidden(this.refs.dict, cur.cat !== 'spelling');
      void this.suggestionsInto(cur);
    } else this.sugKey = '';
    const prev = this.root.querySelector<HTMLButtonElement>('[data-act="prev"]');
    const next = this.root.querySelector<HTMLButtonElement>('[data-act="next"]');
    if (prev) setDisabled(prev, shown.length === 0);
    if (next) setDisabled(next, shown.length === 0);
  }

  private fillItem(li: HTMLElement, i: Located): void {
    li.dataset.key = `${i.para}|${i.rule}|${i.text}|${i.nth}`;
    const dot = li.querySelector('.ft-pf-dot') as HTMLElement;
    if (dot.dataset.cat !== i.cat) dot.dataset.cat = i.cat;
    setText(li.querySelector('.ft-pf-item-text'), i.text.length > 48 ? `${i.text.slice(0, 45)}...` : i.text);
    setText(li.querySelector('.ft-pf-item-msg'), i.cat === 'spelling' ? CATEGORY_LABEL.spelling : i.message);
  }
}

export class AccessPanel {
  readonly root: HTMLElement;
  private readonly refs: Record<string, HTMLElement>;
  private issues: A11yIssue[] = [];
  private timer = 0;

  constructor(private readonly ed: DocEditor) {
    this.root = el(`<section class="ft-pf-panel" aria-label="Accessibility checker">
<p class="ft-pf-state" role="status" data-ref="state">Checking</p>
<div class="ft-pf-nav"><button type="button" class="ft-btn sm" data-act="recheck">Check again</button></div>
<ul class="ft-pf-list ft-pf-a11y" aria-label="Accessibility issues" data-ref="list"></ul>
<p class="ft-note">Checks pictures, shapes, charts and diagrams for alt text, heading order, table header rows, text contrast, blank paragraphs, link text and the document title.</p>
</section>`);
    this.refs = {};
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-ref]'))) this.refs[n.dataset.ref ?? ''] = n;
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act="recheck"]')) { this.run(); return; }
      const li = t.closest<HTMLElement>('.ft-pf-a11y-item');
      if (!li) return;
      const issue = this.issues.find((x) => x.id === li.dataset.key);
      if (!issue || !ed.view) return;
      const what = t.closest<HTMLElement>('[data-go],[data-fix],[data-apply]');
      if (what?.hasAttribute('data-go')) goToA11y(ed.view, issue);
      else if (what?.hasAttribute('data-fix')) {
        if (issue.fix === 'input') {
          const row = li.querySelector<HTMLElement>('.ft-pf-fixrow');
          if (row) { setHidden(row, !row.hidden); if (!row.hidden) (row.querySelector('input') as HTMLInputElement).focus(); }
        } else { applyA11yFix(ed, issue, ''); this.run(); announce('Fixed'); }
      } else if (what?.hasAttribute('data-apply')) {
        const input = li.querySelector('input') as HTMLInputElement;
        if (applyA11yFix(ed, issue, input.value)) { this.run(); announce('Fixed'); } else toast('Type some text first.', 'error');
      }
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = (e.target as HTMLElement).closest('.ft-pf-fixrow input');
      if (input) { e.preventDefault(); (input.closest('.ft-pf-fixrow')?.querySelector('[data-apply]') as HTMLElement | null)?.click(); }
    });
  }

  run(): void {
    this.issues = accessibilityIssues(this.ed);
    this.patch();
  }

  later(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { if (panelOpen(ACCESS_PANEL)) this.run(); }, 600);
  }

  list(): A11yIssue[] { return this.issues; }

  private patch(): void {
    const n = this.issues.length;
    const errors = this.issues.filter((i) => i.level === 'error').length;
    setText(this.refs.state, n ? `${n} issue${n === 1 ? '' : 's'}${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}` : 'No accessibility issues found.');
    patchList(this.refs.list, this.issues, {
      key: (i) => i.id,
      create: (i) => {
        const li = el<HTMLElement>(`<li class="ft-pf-a11y-item"><div class="ft-pf-a11y-head"><span class="ft-pf-badge"></span><span class="ft-pf-a11y-msg"></span></div><div class="ft-pf-a11y-actions"><button type="button" class="ft-btn sm" data-go>Go to</button><button type="button" class="ft-btn sm" data-fix></button></div><div class="ft-pf-fixrow" hidden><input class="ft-input" type="text"><button type="button" class="ft-btn sm primary" data-apply>Apply</button></div></li>`);
        this.fill(li, i);
        return li;
      },
      update: (node, i) => this.fill(node, i),
    });
  }

  private fill(li: HTMLElement, i: A11yIssue): void {
    li.dataset.key = i.id;
    li.dataset.level = i.level;
    setText(li.querySelector('.ft-pf-badge'), describe(i.level));
    setText(li.querySelector('.ft-pf-a11y-msg'), i.message);
    const fix = li.querySelector('[data-fix]') as HTMLElement;
    setHidden(fix, !i.fix);
    setText(fix, i.fixLabel);
    const input = li.querySelector('input') as HTMLInputElement;
    const label = i.rule === 'alt' ? 'Alt text' : i.rule === 'link' ? 'Link text' : 'Title';
    if (input.getAttribute('aria-label') !== label) input.setAttribute('aria-label', label);
    if (!input.value && i.seed && document.activeElement !== input) input.value = i.seed;
  }
}
