import { TextSelection } from 'prosemirror-state';
import { api } from '../../../io/api';
import { el, escapeHtml, patchList, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';

export interface Sense { pos: string; definition: string; examples: string[]; synonyms: string[]; antonyms: string[]; broader: string[] }
export interface Lookup { word: string; lemma?: string; available: boolean; senses: Sense[] }

export function wordAtCaret(ed: DocEditor): { from: number; to: number; text: string } | null {
  const view = ed.view;
  if (!view) return null;
  const { from, to, $from } = view.state.selection;
  if (from !== to) return { from, to, text: view.state.doc.textBetween(from, to, ' ').trim() };
  const text = $from.parent.textContent;
  const at = $from.parentOffset;
  const re = /[\p{L}\p{N}'’-]+/gu;
  for (const m of text.matchAll(re)) {
    if (m.index <= at && at <= m.index + m[0].length) {
      const start = $from.start() + m.index;
      return { from: start, to: start + m[0].length, text: m[0] };
    }
  }
  return null;
}

function caseLike(src: string, word: string): string {
  if (src && src === src.toUpperCase() && src.length > 1) return word.toUpperCase();
  if (src[0] && src[0] === src[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

export class ThesaurusPanel {
  readonly root: HTMLElement;
  private range: { from: number; to: number; text: string } | null = null;
  private last: Lookup | null = null;

  constructor(private readonly ed: DocEditor) {
    this.root = el(`<div class="ft-th">
<form class="ft-th-search" role="search"><input class="ft-input" type="search" placeholder="Look up a word" aria-label="Word to look up" spellcheck="false"><button type="submit" class="ft-btn sm">Look up</button></form>
<p class="ft-th-note" aria-live="polite"></p>
<div class="ft-th-list" role="list"></div></div>`);
    const input = this.root.querySelector('input') as HTMLInputElement;
    this.root.querySelector('form')?.addEventListener('submit', (e) => { e.preventDefault(); void this.lookup(input.value, false); });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-word]');
      if (!b?.dataset.word) return;
      if ((e as MouseEvent).altKey) { void this.lookup(b.dataset.word, false); return; }
      this.replace(b.dataset.word);
    });
  }

  async lookup(word: string, fromDoc = true): Promise<Lookup> {
    const w = word.trim();
    if (!w) throw new Error('Select a word or type one to look up.');
    if (!fromDoc) this.range = null;
    const input = this.root.querySelector('input') as HTMLInputElement;
    if (input.value !== w) input.value = w;
    const r = await api.get<Lookup>(`/proofing/thesaurus?word=${encodeURIComponent(w)}`);
    this.last = r;
    setText(this.root.querySelector('.ft-th-note'), !r.available ? 'The thesaurus data is not installed (frontend dependency wordnet-db).' : r.senses.length ? `${r.senses.length} meaning${r.senses.length === 1 ? '' : 's'} of "${r.lemma ?? w}". Click a word to replace${this.range ? ' the selection' : ''}; Alt+click looks it up.` : `No entries for "${w}".`);
    patchList(this.root.querySelector('.ft-th-list') as HTMLElement, r.senses.map((s, i) => ({ s, i })), {
      key: (x) => `${r.lemma ?? w}:${x.i}`,
      create: (x) => {
        const n = el('<div class="ft-th-sense" role="listitem"></div>');
        const chips = (label: string, list: string[]): string => list.length ? `<div class="ft-th-row"><span class="ft-th-label">${label}</span>${list.map((s2) => `<button type="button" class="ft-th-word" data-word="${escapeHtml(s2)}">${escapeHtml(s2)}</button>`).join('')}</div>` : '';
        n.innerHTML = `<div class="ft-th-pos">${escapeHtml(x.s.pos)}</div><div class="ft-th-def">${escapeHtml(x.s.definition)}</div>${x.s.examples.length ? `<div class="ft-th-ex">${x.s.examples.map((e2) => escapeHtml(e2)).join('; ')}</div>` : ''}${chips('Synonyms', x.s.synonyms)}${chips('Antonyms', x.s.antonyms)}${chips('Broader', x.s.broader)}`;
        return n;
      },
      update: () => undefined,
    });
    setHidden(this.root.querySelector('.ft-th-list') as HTMLElement, !r.senses.length);
    return r;
  }

  async fromSelection(): Promise<Lookup> {
    this.range = wordAtCaret(this.ed);
    if (!this.range?.text) throw new Error('Put the caret in a word or select one first.');
    return this.lookup(this.range.text);
  }

  replace(word: string): string {
    const view = this.ed.view;
    if (!view || !this.range) { void navigator.clipboard?.writeText(word).then(() => toast(`Copied "${word}".`), () => undefined); return word; }
    const cur = view.state.doc.textBetween(this.range.from, this.range.to, ' ');
    if (cur !== this.range.text) { toast('The text changed; look the word up again.', 'error'); return ''; }
    const marks = view.state.doc.resolve(this.range.from + 1).marks();
    const next = caseLike(cur, word);
    const tr = view.state.tr.replaceWith(this.range.from, this.range.to, schema.text(next, marks));
    tr.setSelection(TextSelection.create(tr.doc, this.range.from, this.range.from + next.length));
    view.dispatch(tr.scrollIntoView());
    this.range = { from: this.range.from, to: this.range.from + next.length, text: next };
    view.focus();
    return next;
  }

  current(): Lookup | null { return this.last; }
}
