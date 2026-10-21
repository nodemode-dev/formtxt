import { api } from '../../../io/api';
import { commands } from '../../../engine/registry';
import { el, patchList, setClass, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { openPanel, panelOpen, closePanel } from '../ui';
import { libraryDocs, matchFormat } from './format';
import { type Made, generateOptions, insertBanner, insertGenerated, insertMade } from './image';
import { mediaUrl } from '../../schema';
import { applyParagraphText, collectParagraphs, docMarkdown, insertAtCaret, insertBelow, insertQuote, replaceInline, replaceRange, selectionRange, setSummary, summaryRange, wordCount, wordRange, type Range } from './insert';
import { Listener, speechAvailable, voiceList, type ListenState } from './listen';
import { stripMarkdown } from './markdown';
import { LANGUAGES, PANEL_HTML } from './panel-html';
import { attachPicker } from './picker';
import { openSettings } from './settings-dialog';
import { suggestAs } from '../review/track';
import { ask, cached, loadStatus, onStatus, requireOn, saveSettings, type AIStatus, type SourceRef } from './state';

interface ChatMsg { id: string; role: 'user' | 'assistant'; text: string; src?: string; pending?: boolean; error?: boolean }
interface Proposal { key: string; id: string; old: string; text: string }
interface Preview { title: string; range: Range; result: string; retry: () => Promise<void> }
interface Result { id: string; title: string; snippet: string; words: number }

const MODES: Record<string, string> = { shorter: 'Shorter', longer: 'Longer', formal: 'More formal', casual: 'More casual', simpler: 'Simpler' };
let seq = 0;
const uid = (): string => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export class AIPanel {
  readonly root: HTMLElement;
  private readonly nodes = new Map<string, HTMLElement>();
  private sources: SourceRef[] = [];
  private msgs: ChatMsg[] = [];
  private proposals: Proposal[] = [];
  private pv: Preview | null = null;
  private results: Result[] = [];
  private summary = '';
  private answer = '';
  private word: Range | null = null;
  private busy = 0;
  private tab = '';
  private readonly listener: Listener;

  constructor(private readonly ed: DocEditor) {
    this.root = el(PANEL_HTML);
    this.listener = new Listener((s, done, total) => this.listenState(s, done, total));
    const lang = this.q<HTMLSelectElement>('lang');
    for (const [name, code] of LANGUAGES) lang.appendChild(el(`<option value="${code}">${name}</option>`));
    this.root.addEventListener('click', (e) => this.click(e.target as HTMLElement));
    this.q('styleFrom').addEventListener('change', () => setHidden(this.q('styleSample'), (this.q<HTMLSelectElement>('styleFrom')).value !== 'pasted'));
    this.q('model').addEventListener('change', () => this.persist({ model: (this.q<HTMLInputElement>('model')).value.trim() }));
    this.q('effort').addEventListener('change', () => this.persist({ effort: (this.q<HTMLSelectElement>('effort')).value }));
    this.q('file').addEventListener('change', () => void this.attachFile());
    this.q('chatInput').addEventListener('keydown', (e) => {
      const k = e as KeyboardEvent;
      if (k.key === 'Enter' && !k.shiftKey && !k.isComposing && this.q('chatInput').parentElement?.querySelector('.ft-ai-picker')?.hasAttribute('hidden') !== false) { k.preventDefault(); void this.guard(() => this.send()); }
    });
    this.q('rsInput').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); void this.guard(() => this.search(this.q<HTMLInputElement>('rsInput').value)); } });
    for (const name of ['chatInput', 'writeInput']) {
      const input = this.q<HTMLTextAreaElement>(name);
      attachPicker(input.parentElement as HTMLElement, input, () => this.ed.docId(), (p) => this.addSource({ id: p.id, title: p.title, kind: 'library' }));
    }
    this.q('pvReplace').addEventListener('click', () => this.applyPreview('replace'));
    this.q('pvBelow').addEventListener('click', () => this.applyPreview('below'));
    this.q('pvRetry').addEventListener('click', () => { const p = this.pv; if (p) void this.guard(p.retry); });
    this.q('pvDiscard').addEventListener('click', () => this.setPreview(null));
    this.q('acceptAll').addEventListener('click', () => this.acceptProposal('all'));
    this.q('rejectAll').addEventListener('click', () => this.rejectProposal('all'));
    this.q('suggestAll').addEventListener('click', () => this.suggestProposal('all'));
    this.q('sumInsert').addEventListener('click', () => { if (this.summary) this.say(`Inserted ${insertAtCaret(this.ed, this.summary)} words at the caret.`); });
    this.q('sumBlock').addEventListener('click', () => { if (this.summary) this.say(`Summary block ${setSummary(this.ed, this.summary)} at the top.`); this.syncSummaryLabel(); });
    this.q('rsInsert').addEventListener('click', () => { if (this.answer) this.say(`Inserted ${insertAtCaret(this.ed, this.answer)} words at the caret.`); });
    this.q('pause').addEventListener('click', () => { if (this.listener.state === 'paused') this.listener.resume(); else this.listener.pause(); });
    this.q('stop').addEventListener('click', () => this.listener.stop());
    this.q('log').addEventListener('click', (e) => this.logClick(e.target as HTMLElement));
    this.q('props').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (b?.dataset.p) { if (b.dataset.do === 'accept') this.acceptProposal(b.dataset.p); else if (b.dataset.do === 'suggest') this.suggestProposal(b.dataset.p); else this.rejectProposal(b.dataset.p); }
    });
    this.q('results').addEventListener('click', (e) => this.resultClick(e.target as HTMLElement));
    this.q('wordSyn').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-syn]');
      if (b?.dataset.syn && this.word) this.swapWord(b.dataset.syn);
    });
    for (const name of ['chatChips', 'writeChips']) {
      this.q(name).addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-rm]')?.dataset.rm;
        if (id) { this.sources = this.sources.filter((s) => s.id !== id); this.renderChips(); }
      });
    }
    if ('speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', () => this.fillVoices());
    this.fillVoices();
    onStatus((s) => this.syncStatus(s));
    this.setTab('chat');
    this.loadHistory();
    this.syncPv();
  }

  private q<T extends HTMLElement = HTMLElement>(name: string): T {
    let n = this.nodes.get(name);
    if (!n) {
      n = this.root.querySelector<HTMLElement>(`[data-q="${name}"]`) ?? undefined;
      if (!n) throw new Error(`missing panel node ${name}`);
      this.nodes.set(name, n);
    }
    return n as T;
  }

  private on(): boolean { const s = cached(); return !!s && s.enabled && !s.needsKey; }

  say(text: string, error = false): void {
    setText(this.q('status'), text);
    setClass(this.q('status'), 'is-error', error);
  }

  private async guard(fn: () => Promise<unknown>): Promise<void> {
    this.busy++;
    this.syncEnabled();
    try { await fn(); } catch (e) { this.say(e instanceof Error ? e.message : String(e), true); } finally { this.busy--; this.syncEnabled(); }
  }

  private syncEnabled(): void {
    const off = !this.on() || this.busy > 0;
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-ai]'))) if (b.disabled !== off) b.disabled = off;
    this.syncPv();
  }

  private syncStatus(s: AIStatus): void {
    const ready = s.enabled && !s.needsKey;
    const banner = this.root.querySelector<HTMLElement>('[data-off]');
    if (banner) {
      setHidden(banner, ready);
      setText(banner.querySelector('span'), s.enabled && s.needsKey ? 'Add your API key to use AI.' : 'AI is off. Nothing leaves this computer until you turn it on.');
    }
    const model = this.q<HTMLInputElement>('model');
    if (document.activeElement !== model && model.value !== s.model) model.value = s.model;
    const effort = this.q<HTMLSelectElement>('effort');
    if (document.activeElement !== effort && effort.value !== s.effort) effort.value = s.effort;
    const list = this.q('modelList');
    patchList(list, s.models, { key: (m) => m, create: (m) => { const o = el('<option></option>'); o.setAttribute('value', m); return o; }, update: () => undefined });
    setHidden(this.q('noImage'), s.imageAvailable || !s.enabled);
    this.syncEnabled();
  }

  private persist(patch: Record<string, unknown>): void {
    void saveSettings(patch).catch((e: Error) => this.say(e.message, true));
  }

  show(tab?: string): void {
    if (!panelOpen('ai')) openPanel('ai', 'AI assistant', this.root);
    void loadStatus().catch(() => undefined);
    if (tab) this.setTab(tab);
  }

  toggle(): boolean {
    if (panelOpen('ai')) { closePanel('ai'); return false; }
    this.show();
    return true;
  }

  setTab(tab: string): void {
    if (this.tab === tab) return;
    this.tab = tab;
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('[data-tab]'))) {
      const on = b.dataset.tab === tab;
      setClass(b, 'is-active', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const v of Array.from(this.root.querySelectorAll<HTMLElement>('[data-view]'))) setHidden(v, v.dataset.view !== tab);
    if (tab === 'document') void this.fillDocs();
    if (tab === 'summary') this.syncSummaryLabel();
    this.syncEnabled();
  }

  focusInput(tab: string, name: string): void {
    this.show(tab);
    requestAnimationFrame(() => this.q(name).focus());
  }

  private click(t: HTMLElement): void {
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn?.dataset.tab) { this.setTab(tabBtn.dataset.tab); return; }
    const b = t.closest<HTMLElement>('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const v = (name: string): string => (this.q<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(name)).value;
    switch (act) {
      case 'settings': void openSettings().catch((e: Error) => toast(e.message, 'error')); break;
      case 'attach': this.q<HTMLInputElement>('file').click(); break;
      case 'clearChat': this.msgs = []; this.saveHistory(); this.renderLog(); break;
      case 'send': void this.guard(() => this.send()); break;
      case 'draft': void this.guard(() => this.draft(v('writeInput'), false)); break;
      case 'create': void this.guard(() => this.draft(v('writeInput'), true)); break;
      case 'rewrite': void this.guard(() => this.rewrite(b.dataset.mode ?? '', '')); break;
      case 'rewriteCustom': void this.guard(() => this.rewrite('custom', v('custom'))); break;
      case 'matchStyle': void this.guard(() => this.matchStyle(v('styleFrom') === 'pasted' ? v('styleSample') : '')); break;
      case 'lookup': void this.guard(() => this.lookup()); break;
      case 'revise': void this.guard(() => this.revise(v('reviseInput'))); break;
      case 'translate': void this.guard(() => this.translate(v('lang'), v('tScope') === 'selection')); break;
      case 'matchFormat': void this.guard(async () => { this.say(await matchFormat(this.ed, v('fmtDoc'), { styles: (this.q<HTMLInputElement>('fmtStyles')).checked, page: (this.q<HTMLInputElement>('fmtPage')).checked })); }); break;
      case 'summarize': void this.guard(() => this.summarize(v('sumScope') === 'selection')); break;
      case 'play': void this.guard(() => this.play(v('listenSrc'))); break;
      case 'search': void this.guard(() => this.search(v('rsInput'))); break;
      case 'rsAskGo': void this.guard(() => this.askResults(v('rsAsk'))); break;
      case 'image': void this.guard(() => this.image(v('imgPrompt'), v('imgSize'))); break;
      case 'imageOptions': void this.guard(() => this.imageOptions(v('imgPrompt'), v('imgSize'))); break;
      case 'banner': void this.guard(() => this.banner(v('imgPrompt'), v('bannerTitle'))); break;
      case 'stock': void commands.run('insert.stockImage').catch((e: Error) => toast(e.message, 'error')); break;
      default: break;
    }
  }

  addSource(ref: SourceRef): void {
    if (!this.sources.some((s) => s.id === ref.id)) this.sources = [...this.sources, ref];
    this.renderChips();
  }

  setSources(refs: SourceRef[]): void {
    this.sources = refs;
    this.renderChips();
  }

  sourceList(): SourceRef[] { return this.sources; }

  private renderChips(): void {
    for (const name of ['chatChips', 'writeChips']) {
      patchList(this.q(name), this.sources, {
        key: (s) => s.id,
        create: (s) => {
          const c = el('<span class="ft-ai-chip"><span class="ft-ai-chip-t"></span><button type="button" class="ft-ai-chip-x" aria-label="Remove source">×</button></span>');
          (c.querySelector('[data-rm]') ?? c.querySelector('button'))?.setAttribute('data-rm', s.id);
          setText(c.querySelector('.ft-ai-chip-t'), s.title);
          c.title = s.kind === 'file' ? 'Attached file' : 'Library document';
          return c;
        },
        update: () => undefined,
      });
    }
  }

  private async attachFile(): Promise<void> {
    const input = this.q<HTMLInputElement>('file');
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const text = (await f.text()).slice(0, 60000);
    this.addSource({ id: `file:${f.name}:${f.size}`, title: f.name, kind: 'file', text });
    this.say(`Attached ${f.name}.`);
  }

  private opts(): { model: string; effort: string } {
    return { model: this.q<HTMLInputElement>('model').value.trim() || cached()?.model || '', effort: this.q<HTMLSelectElement>('effort').value };
  }

  private view(): NonNullable<DocEditor['view']> {
    if (!this.ed.view) throw new Error('Open a document first.');
    return this.ed.view;
  }

  private chatKey(): string { return `ft.ai.chat.${this.ed.docId()}`; }

  loadHistory(): void {
    let list: ChatMsg[] = [];
    try { list = JSON.parse(localStorage.getItem(this.chatKey()) ?? '[]') as ChatMsg[]; } catch { list = []; }
    this.msgs = Array.isArray(list) ? list.filter((m) => m && typeof m.text === 'string') : [];
    this.renderLog();
  }

  private saveHistory(): void {
    try { localStorage.setItem(this.chatKey(), JSON.stringify(this.msgs.filter((m) => !m.pending).slice(-40))); } catch { void 0; }
  }

  private renderLog(): void {
    const log = this.q('log');
    const paint = (n: HTMLElement, m: ChatMsg): void => {
      setClass(n, 'is-user', m.role === 'user');
      setClass(n, 'is-pending', !!m.pending);
      setClass(n, 'is-error', !!m.error);
      setText(n.querySelector('.ft-ai-msg-role'), m.role === 'user' ? 'You' : 'Assistant');
      setText(n.querySelector('.ft-ai-msg-text'), m.pending ? 'Thinking...' : m.text);
      const src = n.querySelector<HTMLElement>('.ft-ai-msg-src');
      setText(src, m.src ?? '');
      if (src) setHidden(src, !m.src);
      setClass(n.querySelector('.ft-ai-msg-act'), 'is-quiet', m.role === 'user' || !!m.pending || !!m.error);
    };
    patchList(log, this.msgs, {
      key: (m) => m.id,
      create: (m) => {
        const n = el('<div class="ft-ai-msg"><div class="ft-ai-msg-role"></div><div class="ft-ai-msg-text"></div><div class="ft-ai-msg-src"></div><div class="ft-ai-msg-act"><button type="button" class="ft-btn sm" data-a="insert">Insert at caret</button><button type="button" class="ft-btn sm ghost" data-a="copy">Copy</button></div></div>');
        paint(n, m);
        return n;
      },
      update: paint,
    });
    log.scrollTop = log.scrollHeight;
  }

  private logClick(t: HTMLElement): void {
    const b = t.closest<HTMLElement>('[data-a]');
    const id = t.closest<HTMLElement>('.ft-ai-msg')?.dataset.key;
    const m = this.msgs.find((x) => x.id === id);
    if (!b || !m) return;
    if (b.dataset.a === 'insert') this.say(`Inserted ${insertAtCaret(this.ed, m.text)} words at the caret.`);
    else void navigator.clipboard?.writeText(m.text).then(() => this.say('Copied.')).catch(() => this.say('Copy is not allowed here.', true));
  }

  private citeLine(sources: Array<{ title: string; cited: boolean }>): string {
    if (!sources.length) return '';
    const used = sources.filter((s) => s.cited).map((s) => s.title);
    return used.length ? `Used: ${used.join(', ')}` : 'None of the sources were cited.';
  }

  private scopeText(scope: string): { text: string; selection: boolean } {
    const view = this.view();
    if (scope === 'none') return { text: '', selection: false };
    if (scope === 'selection') {
      const r = selectionRange(view);
      if (!r) throw new Error('Select some text first, or choose Whole document.');
      return { text: r.text, selection: true };
    }
    return { text: docMarkdown(view.state.doc), selection: false };
  }

  async chat(prompt: string, scope = 'document'): Promise<string> {
    const text = prompt.trim();
    if (!text) throw new Error('Type a question first.');
    await requireOn();
    const ctx = this.scopeText(scope);
    const history = this.msgs.filter((m) => !m.pending && !m.error).slice(-10).map((m) => ({ role: m.role, content: m.text }));
    const mine: ChatMsg = { id: uid(), role: 'assistant', text: '', pending: true };
    this.msgs = [...this.msgs, { id: uid(), role: 'user', text }, mine];
    this.renderLog();
    try {
      const r = await ask({ task: 'chat', instruction: text, text: ctx.text, selection: ctx.selection, sources: this.sources, history, ...this.opts() });
      Object.assign(mine, { text: r.text, pending: false, src: this.citeLine(r.sources) });
      return r.text;
    } catch (e) {
      Object.assign(mine, { text: e instanceof Error ? e.message : String(e), pending: false, error: true });
      throw e;
    } finally {
      this.renderLog();
      this.saveHistory();
    }
  }

  private async send(): Promise<void> {
    const input = this.q<HTMLTextAreaElement>('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await this.chat(text, (this.q<HTMLSelectElement>('scope')).value); } catch (e) { input.value = text; throw e; }
  }

  async draft(prompt: string, full: boolean): Promise<string> {
    const text = prompt.trim();
    if (!text) throw new Error('Describe what to write first.');
    await requireOn();
    const view = this.view();
    const before = view.state.doc.textBetween(0, view.state.selection.from, '\n', ' ');
    this.say(full ? 'Writing a first draft...' : 'Drafting...');
    const r = await ask({ task: full ? 'create' : 'draft', instruction: text, text: full ? '' : before, sources: this.sources, ...this.opts() });
    const md = r.text;
    const words = insertAtCaret(this.ed, md, { title: full });
    const cite = this.citeLine(r.sources);
    const msg = `Inserted ${words} words${cite ? `. ${cite}` : ''}. Undo takes it back.`;
    setText(this.q('writeNote'), msg);
    this.say(msg);
    return md;
  }

  private syncPv(): void {
    const on = !!this.pv;
    const ok = this.on() && this.busy === 0;
    (this.q<HTMLButtonElement>('pvReplace')).disabled = !on;
    (this.q<HTMLButtonElement>('pvBelow')).disabled = !on;
    (this.q<HTMLButtonElement>('pvDiscard')).disabled = !on;
    (this.q<HTMLButtonElement>('pvRetry')).disabled = !on || !ok;
  }

  private setPreview(p: Preview | null): void {
    this.pv = p;
    setText(this.q('pvTitle'), p ? p.title : 'Suggestion');
    setText(this.q('pvText'), p ? p.result : 'Your suggestion appears here.');
    this.syncPv();
  }

  private applyPreview(how: 'replace' | 'below'): void {
    const p = this.pv;
    if (!p) return;
    try {
      if (how === 'replace') replaceRange(this.ed, p.range, p.result); else insertBelow(this.ed, p.range, p.result);
      this.say(how === 'replace' ? 'Replaced the selection. Undo brings it back.' : 'Inserted below the selection.');
      this.setPreview(null);
    } catch (e) { this.say(e instanceof Error ? e.message : String(e), true); }
  }

  async rewrite(mode: string, instruction: string, apply: 'preview' | 'replace' | 'below' = 'preview', task = 'rewrite', language = '', title = ''): Promise<string> {
    await requireOn();
    const range = selectionRange(this.view());
    if (!range) throw new Error('Select the text to change first.');
    if (task === 'rewrite' && mode === 'custom' && !instruction.trim()) throw new Error('Say how to change the text.');
    const label = title || MODES[mode] || (task === 'style' ? 'Matched style' : task === 'translate' ? `Translated to ${language}` : 'Custom rewrite');
    const run = async (): Promise<string> => {
      this.say('Working...');
      const r = await ask({ task, mode, instruction, text: range.text, language, selection: true, ...this.opts() });
      this.setPreview({ title: label, range, result: r.text, retry: async () => { await run(); } });
      this.say('Review the suggestion, then choose Replace or Insert below.');
      return r.text;
    };
    const result = await run();
    if (apply === 'replace' || apply === 'below') this.applyPreview(apply);
    else this.show('rewrite');
    return result;
  }

  async matchStyle(sample: string, apply: 'preview' | 'replace' | 'below' = 'preview'): Promise<string> {
    const view = this.view();
    const r = selectionRange(view);
    if (!r) throw new Error('Select the paragraphs to restyle first.');
    let ref = sample.trim();
    if (!ref) {
      const doc = view.state.doc;
      ref = `${doc.textBetween(0, r.from, '\n\n', ' ')}\n\n${doc.textBetween(r.to, doc.content.size, '\n\n', ' ')}`.trim().slice(0, 2500);
    }
    if (!ref) throw new Error('The document has no other text to learn the style from. Paste a sample.');
    return this.rewrite('style', ref, apply, 'style', '', 'Matched style');
  }

  async translate(code: string, selection: boolean): Promise<string> {
    const name = LANGUAGES.find((l) => l[1] === code)?.[0] ?? code;
    if (selection) return this.rewrite('', '', 'preview', 'translate', name, `Translated to ${name}`);
    await requireOn();
    const doc = this.ed.current();
    if (!doc) throw new Error('Open a document first.');
    this.say(`Translating into ${name}. Long documents take a minute...`);
    const out = await api.post<{ id: string; title: string; translated: number; paragraphs: number }>('/ai/translate', { language: name, languageCode: code, doc, ...this.opts() });
    this.say(`Translated ${out.translated} of ${out.paragraphs} paragraphs into "${out.title}".`);
    await commands.run('file.open', { id: out.id });
    return out.id;
  }

  async lookup(): Promise<string> {
    await requireOn();
    const view = this.view();
    const r = wordRange(view);
    if (!r) throw new Error('Select a word, or put the caret in one.');
    this.word = r;
    const $p = view.state.doc.resolve(r.from);
    const r2 = await ask({ task: 'thesaurus', text: r.text, instruction: $p.parent.textContent.slice(0, 300), effort: 'fast', model: this.opts().model });
    let info: { definition?: string; partOfSpeech?: string; synonyms?: unknown[] } = {};
    try { info = JSON.parse(r2.text.slice(r2.text.indexOf('{'), r2.text.lastIndexOf('}') + 1)) as typeof info; } catch { info = { definition: r2.text }; }
    const syn = (info.synonyms ?? []).map((s) => String(s)).filter(Boolean).slice(0, 12);
    setText(this.q('wordHead'), `${r.text}${info.partOfSpeech ? ` (${info.partOfSpeech})` : ''}`);
    setText(this.q('wordDef'), info.definition || 'No definition came back.');
    patchList(this.q('wordSyn'), syn, {
      key: (s) => s,
      create: (s) => { const b = el('<button type="button" class="ft-ai-chip ft-ai-syn-btn"></button>'); b.dataset.syn = s; b.title = 'Replace the word'; setText(b, s); return b; },
      update: () => undefined,
    });
    this.say(syn.length ? 'Click a synonym to replace the word.' : 'No synonyms came back.');
    return r2.text;
  }

  private swapWord(syn: string): void {
    const r = this.word;
    if (!r) return;
    const word = /^\p{Lu}/u.test(r.text) ? syn.charAt(0).toUpperCase() + syn.slice(1) : syn;
    try {
      replaceInline(this.ed, r, word);
      this.word = { from: r.from, to: r.from + word.length, text: word };
      this.say(`Replaced with ${word}.`);
    } catch (e) { this.say(e instanceof Error ? e.message : String(e), true); }
  }

  async summarize(selection: boolean, into: 'panel' | 'block' | 'caret' = 'panel'): Promise<string> {
    await requireOn();
    const ctx = this.scopeText(selection ? 'selection' : 'document');
    if (!ctx.text.trim()) throw new Error('There is nothing to summarize yet.');
    this.say('Summarizing...');
    const r = await ask({ task: 'summarize', text: ctx.text, selection: ctx.selection, ...this.opts() });
    this.summary = r.text;
    setText(this.q('sumText'), r.text);
    (this.q<HTMLButtonElement>('sumInsert')).disabled = false;
    (this.q<HTMLButtonElement>('sumBlock')).disabled = false;
    if (into === 'block') this.say(`Summary block ${setSummary(this.ed, r.text)} at the top.`);
    else if (into === 'caret') this.say(`Inserted ${insertAtCaret(this.ed, r.text)} words at the caret.`);
    else this.say('Summary ready.');
    this.syncSummaryLabel();
    return r.text;
  }

  private syncSummaryLabel(): void {
    const has = !!this.ed.view && !!summaryRange(this.ed.view.state.doc);
    setText(this.q('sumBlock'), has ? 'Refresh Summary block' : 'Insert Summary block');
  }

  async revise(instruction: string): Promise<number> {
    await requireOn();
    const text = instruction.trim();
    if (!text) throw new Error('Say what to change in the document.');
    const paras = collectParagraphs(this.view());
    if (!paras.length) throw new Error('The document has no text to revise.');
    this.say('Reading the whole document...');
    const out = await api.post<{ changes: Array<{ n: number; text: string }> }>('/ai/revise', { instruction: text, paragraphs: paras.map((p) => p.text), ...this.opts() });
    this.proposals = out.changes.filter((c) => paras[c.n]).map((c, i) => ({ key: `r${i}`, id: paras[c.n].id, old: paras[c.n].text, text: c.text }));
    this.renderProposals();
    this.say(this.proposals.length ? `${this.proposals.length} paragraphs have a proposed change.` : 'No paragraph needed a change.');
    this.show('document');
    return this.proposals.length;
  }

  proposalList(): Proposal[] { return this.proposals; }

  private renderProposals(): void {
    patchList(this.q('props'), this.proposals, {
      key: (p) => p.key,
      create: (p) => {
        const n = el('<div class="ft-ai-prop"><div class="ft-ai-prop-old"></div><div class="ft-ai-prop-new"></div><div class="ft-ai-row"><button type="button" class="ft-btn sm primary" data-do="accept">Accept</button><button type="button" class="ft-btn sm" data-do="suggest">Suggest</button><button type="button" class="ft-btn sm ghost" data-do="reject">Reject</button></div></div>');
        for (const b of Array.from(n.querySelectorAll<HTMLElement>('[data-do]'))) b.dataset.p = p.key;
        setText(n.querySelector('.ft-ai-prop-old'), p.old);
        setText(n.querySelector('.ft-ai-prop-new'), p.text);
        return n;
      },
      update: () => undefined,
    });
    const none = this.proposals.length === 0;
    (this.q<HTMLButtonElement>('acceptAll')).disabled = none;
    (this.q<HTMLButtonElement>('rejectAll')).disabled = none;
    (this.q<HTMLButtonElement>('suggestAll')).disabled = none;
    setText(this.q('reviseNote'), none ? 'Proposed changes appear here, paragraph by paragraph.' : `${this.proposals.length} proposed changes. Accept or reject each, or all at once.`);
  }

  acceptProposal(key: string): number {
    const list = key === 'all' ? [...this.proposals] : this.proposals.filter((p) => p.key === key);
    let applied = 0;
    for (const p of list) {
      if (applyParagraphText(this.view(), p.id, p.old, p.text)) applied++;
      else this.say('A paragraph changed since the proposal; it was skipped.', true);
      this.proposals = this.proposals.filter((x) => x.key !== p.key);
    }
    this.renderProposals();
    if (applied) this.say(`Accepted ${applied} change${applied === 1 ? '' : 's'}. Undo takes them back one by one.`);
    return applied;
  }

  suggestProposal(key: string): number {
    const list = key === 'all' ? [...this.proposals] : this.proposals.filter((p) => p.key === key);
    let applied = 0;
    for (const p of list) {
      if (suggestAs('AI', () => applyParagraphText(this.view(), p.id, p.old, p.text))) applied++;
      else this.say('A paragraph changed since the proposal; it was skipped.', true);
      this.proposals = this.proposals.filter((x) => x.key !== p.key);
    }
    this.renderProposals();
    if (applied) this.say(`Added ${applied} suggestion${applied === 1 ? '' : 's'} by AI. Review them in Review > Show comments and changes.`);
    return applied;
  }

  rejectProposal(key: string): number {
    const before = this.proposals.length;
    this.proposals = key === 'all' ? [] : this.proposals.filter((p) => p.key !== key);
    this.renderProposals();
    return before - this.proposals.length;
  }

  private async fillDocs(): Promise<void> {
    try {
      const docs = await libraryDocs(this.ed.docId());
      patchList(this.q('fmtDoc'), docs, {
        key: (d) => d.id,
        create: (d) => { const o = el('<option></option>'); o.setAttribute('value', d.id); setText(o, d.title || 'Untitled'); return o; },
        update: (n, d) => setText(n, d.title || 'Untitled'),
      });
    } catch { void 0; }
  }

  async search(query: string): Promise<Result[]> {
    const q = query.trim();
    if (!q) throw new Error('Type what to look for.');
    const out = await api.get<{ results: Result[] }>(`/ai/library?${new URLSearchParams({ q, limit: '20', skip: this.ed.docId() })}`);
    this.results = out.results;
    const paint = (n: HTMLElement, r: Result): void => { setText(n.querySelector('.ft-ai-result-title'), r.title || 'Untitled'); setText(n.querySelector('.ft-ai-result-snip'), r.snippet); };
    patchList(this.q('results'), this.results, {
      key: (r) => r.id,
      create: (r) => {
        const n = el('<div class="ft-ai-result"><div class="ft-ai-result-title"></div><div class="ft-ai-result-snip"></div><div class="ft-ai-row"><button type="button" class="ft-btn sm" data-r="quote">Insert quote</button><button type="button" class="ft-btn sm ghost" data-r="source">Use as source</button><button type="button" class="ft-btn sm ghost" data-r="open">Open</button></div></div>');
        n.dataset.doc = r.id;
        paint(n, r);
        return n;
      },
      update: paint,
    });
    setText(this.q('rsNote'), this.results.length ? `${this.results.length} matching documents.` : 'No documents match.');
    this.show('research');
    return this.results;
  }

  private resultClick(t: HTMLElement): void {
    const b = t.closest<HTMLElement>('[data-r]');
    const id = t.closest<HTMLElement>('.ft-ai-result')?.dataset.doc;
    const r = this.results.find((x) => x.id === id);
    if (!b || !r) return;
    if (b.dataset.r === 'quote') {
      if (!r.snippet) { this.say('This result has no text to quote.', true); return; }
      insertQuote(this.ed, r.snippet, r.id, r.title);
      this.say('Inserted the quote with a link to its document. Ctrl-click the chip to open it.');
    } else if (b.dataset.r === 'source') {
      this.addSource({ id: r.id, title: r.title, kind: 'library' });
      this.say(`Added ${r.title} as a source for chat and drafting.`);
    } else void commands.run('file.open', { id: r.id }).catch((e: Error) => toast(e.message, 'error'));
  }

  async askResults(question: string): Promise<string> {
    await requireOn();
    const q = question.trim();
    if (!q) throw new Error('Type a question first.');
    if (!this.results.length) throw new Error('Search the library first.');
    const refs: SourceRef[] = this.results.slice(0, 5).map((r) => ({ id: r.id, title: r.title, kind: 'library' }));
    this.say('Asking...');
    const r = await ask({ task: 'research', instruction: q, sources: refs, ...this.opts() });
    this.answer = r.text;
    setText(this.q('rsAnswer'), r.text);
    setText(this.q('rsSrc'), this.citeLine(r.sources));
    (this.q<HTMLButtonElement>('rsInsert')).disabled = false;
    this.say('Answer ready.');
    return r.text;
  }

  private fillVoices(): void {
    const sel = this.q<HTMLSelectElement>('voice');
    const voices = voiceList();
    patchList(sel, voices, {
      key: (v) => v.name,
      create: (v) => { const o = el('<option></option>'); o.setAttribute('value', v.name); setText(o, `${v.name} (${v.lang})`); return o; },
      update: () => undefined,
    });
  }

  private listenState(s: ListenState, done: number, total: number): void {
    (this.q<HTMLButtonElement>('pause')).disabled = s === 'idle';
    (this.q<HTMLButtonElement>('stop')).disabled = s === 'idle';
    setText(this.q('pause'), s === 'paused' ? 'Resume' : 'Pause');
    setText(this.q('listenNote'), s === 'idle' ? '' : `${s === 'paused' ? 'Paused' : 'Reading'}, part ${Math.min(done + 1, total)} of ${total}.`);
  }

  async play(src: string): Promise<string> {
    if (!speechAvailable()) throw new Error('This browser has no speech synthesis. Install system voices to listen.');
    const view = this.view();
    let text = '';
    if (src === 'selection') {
      const r = selectionRange(view);
      if (!r) throw new Error('Select some text to read.');
      text = r.text;
    } else if (src === 'overview') {
      await requireOn();
      this.say('Writing the overview...');
      const r = await ask({ task: 'overview', text: docMarkdown(view.state.doc), ...this.opts() });
      text = stripMarkdown(r.text);
      this.say('Reading the overview.');
    } else text = stripMarkdown(docMarkdown(view.state.doc));
    this.listener.play(text, (this.q<HTMLSelectElement>('voice')).value, Number((this.q<HTMLSelectElement>('rate')).value) || 1);
    return text;
  }

  pause(): void { this.listener.pause(); }
  resume(): void { this.listener.resume(); }
  stop(): void { this.listener.stop(); }
  listening(): ListenState { return this.listener.state; }

  async image(prompt: string, size: string): Promise<string> {
    const text = prompt.trim();
    if (!text) throw new Error('Describe the picture first.');
    this.say('Generating the picture. This can take a minute...');
    const name = await insertGenerated(this.ed, text, size);
    setText(this.q('imgNote'), 'Inserted at the caret. Undo takes it back.');
    this.say('Picture inserted.');
    return name;
  }

  private options: Made[] = [];
  private optionPrompt = '';

  async imageOptions(prompt: string, size: string, count = 3): Promise<string[]> {
    const text = prompt.trim();
    if (!text) throw new Error('Describe the picture first.');
    this.say('Generating options. This can take a minute...');
    this.options = await generateOptions(this.ed, text, size, count);
    this.optionPrompt = text;
    const box = this.q('imgOptions');
    patchList(box, this.options, {
      key: (m) => m.name,
      create: (m) => {
        const b = el<HTMLButtonElement>(`<button type="button" class="ft-ai-img" title="Insert this picture" aria-label="Insert this picture"><img alt="" width="96" height="96"></button>`);
        b.dataset.media = m.name;
        (b.querySelector('img') as HTMLImageElement).src = mediaUrl(m.name);
        return b;
      },
      update: () => undefined,
    });
    if (!box.dataset.wired) {
      box.dataset.wired = '1';
      box.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-media]');
        if (b?.dataset.media) void this.guard(async () => this.pickOption(b.dataset.media ?? ''));
      });
    }
    this.say(`${this.options.length} option${this.options.length === 1 ? '' : 's'}. Click one to insert it.`);
    return this.options.map((m) => m.name);
  }

  pickOption(name: string): string {
    const m = this.options.find((x) => x.name === name);
    if (!m) throw new Error('That option is no longer available; generate again.');
    insertMade(this.ed, m, this.optionPrompt);
    this.say('Picture inserted. Undo takes it back.');
    return name;
  }

  async banner(prompt: string, title: string): Promise<string> {
    const text = prompt.trim();
    if (!text) throw new Error('Describe the banner picture first.');
    this.say('Generating the banner...');
    const name = await insertBanner(this.ed, text, title);
    setText(this.q('imgNote'), 'Banner inserted at the top of the document.');
    this.say('Banner inserted.');
    return name;
  }

  words(md: string): number { return wordCount(md); }
}
