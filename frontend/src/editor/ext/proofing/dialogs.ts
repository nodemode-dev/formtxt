import { Dialog } from '../../../ui/dialog';
import { el, patchList, setChecked, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { NO_CHECK } from '../proofing-spec';
import { allEntries } from './autocorrect';
import { btn, check, labelDialog } from './kit';
import { LANGUAGES, docLanguage, languageAtSelection, languageLabel, setLanguage } from './layout';
import { readability } from './readability';
import { addWord } from './spell';
import { getPrefs, onChange, savePrefs } from './state';
import { RULE_LABELS, type AutoCorrectRules, type GrammarRules } from './types';

interface Built { d: Dialog; sync: () => void }

const cache: Record<string, Built> = {};

function once(id: string, build: () => Built): Built {
  if (!cache[id]) cache[id] = build();
  return cache[id];
}

const AC_LABELS: Record<keyof AutoCorrectRules, string> = {
  list: 'Replace text as you type (the list below)',
  smartQuotes: 'Straight quotes with smart quotes',
  dashes: 'Two hyphens between words with an en dash',
  symbols: 'Symbols such as (c), (r), (tm) and (e)',
  arrows: 'Arrows: -> and <- and ==>',
  fractions: 'Fractions such as 1/2 and 3/4',
  capitalize: 'Capitalize the first letter of sentences',
  ellipsis: 'Three periods with an ellipsis',
};

export function proofingOptionsDialog(ed: DocEditor): void {
  const b = once('options', () => {
    const d = new Dialog('Spelling and grammar options', 520);
    const boxes: Record<string, HTMLInputElement> = {};
    const note = el('<p class="ft-note" data-describes>Underlines appear as you type. Red wavy lines are spelling, blue lines are grammar, clarity and conciseness suggestions. Spelling uses the dictionary in the engine; text marked with another language or marked not to be checked is skipped.</p>');
    d.body.appendChild(note);
    const add = (key: string, label: string, on: (v: boolean) => void): void => {
      const c = check(label, false, on);
      boxes[key] = c.input;
      d.body.appendChild(c.row);
    };
    add('spelling', 'Check spelling as you type', (v) => void savePrefs({ spelling: v }));
    add('grammar', 'Check grammar and style as you type', (v) => void savePrefs({ grammar: v }));
    d.body.appendChild(el('<h3 class="ft-pf-h3">Grammar and style rules</h3>'));
    for (const k of Object.keys(RULE_LABELS) as Array<keyof GrammarRules>) add(`rule:${k}`, RULE_LABELS[k], (v) => void savePrefs({ grammarRules: { [k]: v } }));
    const row = el('<div class="ft-pf-row"></div>');
    row.append(
      btn('Custom dictionary', '', () => customDictionaryDialog()),
      btn('AutoCorrect options', '', () => autoCorrectDialog()),
    );
    d.body.appendChild(row);
    d.button('Done', 'primary', () => d.close());
    labelDialog(d, true);
    const sync = (): void => {
      const p = getPrefs();
      setChecked(boxes.spelling, p.spelling);
      setChecked(boxes.grammar, p.grammar);
      for (const k of Object.keys(RULE_LABELS) as Array<keyof GrammarRules>) setChecked(boxes[`rule:${k}`], p.grammarRules[k]);
    };
    onChange(sync);
    return { d, sync };
  });
  void ed;
  b.sync();
  b.d.open();
}

export function languageDialog(ed: DocEditor): void {
  const b = once('language', () => {
    const d = new Dialog('Language', 460);
    d.body.appendChild(el('<p class="ft-note" data-describes>Pick the language of the selected text, or of the whole document. English text is checked with the bundled dictionary. Other languages are not checked by the engine; the browser checker handles them where it has a dictionary, and hyphenation follows the language.</p>'));
    const select = el<HTMLSelectElement>('<select class="ft-input" aria-label="Language"></select>');
    select.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
    d.field('Language', select);
    const scope = el<HTMLSelectElement>('<select class="ft-input" aria-label="Apply to"><option value="selection">Selected text</option><option value="document">Whole document default</option></select>');
    d.field('Apply to', scope);
    const skip = check('Do not check spelling or grammar', false, () => { select.disabled = skip.input.checked || scope.value === 'document'; });
    d.body.appendChild(skip.row);
    scope.addEventListener('change', () => { skip.input.disabled = scope.value === 'document'; if (scope.value === 'document') skip.input.checked = false; select.disabled = skip.input.checked; });
    const current = el('<p class="ft-note" role="status"></p>');
    d.body.appendChild(current);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('OK', 'primary', () => {
      try {
        if (scope.value === 'document') setLanguage(ed, select.value, 'document');
        else setLanguage(ed, skip.input.checked ? NO_CHECK : select.value, 'selection');
        d.close();
      } catch (e) { toast((e as Error).message, 'error'); }
    });
    labelDialog(d, true);
    const sync = (): void => {
      const at = languageAtSelection(ed);
      setText(current, `Selection: ${at === 'mixed' ? 'mixed languages' : languageLabel(at)}. Document default: ${languageLabel(docLanguage(ed))}.`);
      select.value = LANGUAGES.some((l) => l.code === (at === NO_CHECK || at === 'mixed' ? docLanguage(ed) : at)) ? (at === NO_CHECK || at === 'mixed' ? docLanguage(ed) : at) : docLanguage(ed);
      skip.input.checked = at === NO_CHECK;
      scope.value = 'selection';
      skip.input.disabled = false;
      select.disabled = skip.input.checked;
    };
    return { d, sync };
  });
  b.sync();
  b.d.open();
}

export function customDictionaryDialog(): void {
  const b = once('dictionary', () => {
    const d = new Dialog('Custom dictionary', 440);
    d.body.appendChild(el('<p class="ft-note" data-describes>Words you add here are never marked as misspelled. The list is kept by the engine and applies to every document.</p>'));
    const input = el<HTMLInputElement>('<input class="ft-input" type="text" aria-label="Word to add" placeholder="Word">');
    const add = btn('Add', 'primary', () => void submit());
    const addRow = el('<div class="ft-pf-row ft-pf-addrow"></div>');
    addRow.append(input, add);
    d.body.appendChild(addRow);
    const list = el('<ul class="ft-pf-words" aria-label="Words in the custom dictionary"></ul>');
    const empty = el('<p class="ft-note">The custom dictionary is empty.</p>');
    d.body.append(list, empty);
    const submit = async (): Promise<void> => {
      const w = input.value.trim();
      if (!w) return;
      try {
        await addWord(w);
        input.value = '';
        await savePrefs({});
      } catch (e) { toast((e as Error).message, 'error'); }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
    list.addEventListener('click', (e) => {
      const word = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]')?.dataset.remove;
      if (word) void addWord(word, true).then(() => savePrefs({})).catch((err: Error) => toast(err.message, 'error'));
    });
    d.button('Done', 'primary', () => d.close());
    labelDialog(d, true);
    const sync = (): void => {
      const words = getPrefs().dictionary;
      patchList(list, words, {
        key: (w) => w,
        create: (w) => {
          const li = el<HTMLElement>('<li class="ft-pf-dictword"><span></span><button type="button" class="ft-btn sm ghost">Remove</button></li>');
          setText(li.querySelector('span'), w);
          const rm = li.querySelector('button') as HTMLButtonElement;
          rm.dataset.remove = w;
          rm.setAttribute('aria-label', `Remove ${w}`);
          return li;
        },
        update: () => undefined,
      });
      setHidden(empty, words.length > 0);
    };
    onChange(sync);
    return { d, sync };
  });
  b.sync();
  b.d.open();
}

export function autoCorrectDialog(): void {
  const b = once('autocorrect', () => {
    const d = new Dialog('AutoCorrect', 620);
    d.body.appendChild(el('<p class="ft-note" data-describes>AutoCorrect fixes text as you type. Right after a correction, press Backspace or Ctrl+Z to turn it back into what you typed.</p>'));
    const master = check('Use AutoCorrect', true, (v) => void savePrefs({ autocorrect: { enabled: v } }));
    d.body.appendChild(master.row);
    const boxes: Record<string, HTMLInputElement> = {};
    for (const k of Object.keys(AC_LABELS) as Array<keyof AutoCorrectRules>) {
      const c = check(AC_LABELS[k], false, (v) => void savePrefs({ autocorrect: { rules: { [k]: v } } }));
      boxes[k] = c.input;
      d.body.appendChild(c.row);
    }
    d.body.appendChild(el('<h3 class="ft-pf-h3">Replacement list</h3>'));
    const filter = el<HTMLInputElement>('<input class="ft-input" type="search" aria-label="Filter the list" placeholder="Filter">');
    d.body.appendChild(filter);
    const addRow = el('<div class="ft-pf-row ft-pf-addrow"></div>');
    const from = el<HTMLInputElement>('<input class="ft-input" type="text" aria-label="Replace" placeholder="Replace">');
    const to = el<HTMLInputElement>('<input class="ft-input" type="text" aria-label="With" placeholder="With">');
    const add = btn('Add', 'primary', () => submit());
    addRow.append(from, to, add);
    d.body.appendChild(addRow);
    const list = el('<div class="ft-pf-ac" role="list" aria-label="AutoCorrect entries"></div>');
    d.body.appendChild(list);
    const more = el('<p class="ft-note" hidden></p>');
    d.body.appendChild(more);
    const patch = (patchBody: Record<string, unknown>): void => void savePrefs({ autocorrect: patchBody }).catch((e: Error) => toast(e.message, 'error'));
    const submit = (): void => {
      const f = from.value.trim();
      if (!f || /\s/.test(f) || !to.value) { toast('Type the text to replace (no spaces) and what to replace it with.', 'error'); return; }
      const p = getPrefs().autocorrect;
      patch({ entries: { ...p.entries, [f]: to.value }, removed: p.removed.filter((x) => x !== f), disabled: p.disabled.filter((x) => x !== f) });
      from.value = '';
      to.value = '';
      from.focus();
    };
    list.addEventListener('change', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.ft-pf-ac-row');
      if (!row) return;
      const key = row.dataset.key ?? '';
      const p = getPrefs().autocorrect;
      const on = (e.target as HTMLInputElement).checked;
      patch({ disabled: on ? p.disabled.filter((x) => x !== key) : [...p.disabled, key] });
    });
    list.addEventListener('click', (e) => {
      const key = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]')?.dataset.remove;
      if (key === undefined) return;
      const p = getPrefs().autocorrect;
      if (key in p.entries) {
        const entries = { ...p.entries };
        delete entries[key];
        patch({ entries });
      } else patch({ removed: [...p.removed, key] });
    });
    d.button('Reset the list', 'ghost', () => patch({ entries: {}, removed: [], disabled: [] }));
    d.button('Done', 'primary', () => d.close());
    filter.addEventListener('input', () => sync());
    from.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); to.focus(); } });
    to.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    labelDialog(d, true);
    const sync = (): void => {
      const p = getPrefs().autocorrect;
      setChecked(master.input, p.enabled);
      for (const k of Object.keys(AC_LABELS) as Array<keyof AutoCorrectRules>) setChecked(boxes[k], p.rules[k]);
      const q = filter.value.trim().toLowerCase();
      const rows = allEntries().filter((r) => !q || r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q));
      const cap = rows.slice(0, 400);
      patchList(list, cap, {
        key: (r) => r.from,
        create: (r) => {
          const row = el<HTMLElement>('<div class="ft-pf-ac-row" role="listitem"><input type="checkbox"><span class="ft-pf-ac-from"></span><span class="ft-pf-ac-to"></span><button type="button" class="ft-btn sm ghost">Remove</button></div>');
          fillRow(row, r);
          return row;
        },
        update: (n, r) => fillRow(n, r),
      });
      setHidden(more, rows.length <= cap.length);
      setText(more, `Showing ${cap.length} of ${rows.length}. Use the filter to narrow the list.`);
    };
    const fillRow = (row: HTMLElement, r: { from: string; to: string; custom: boolean; on: boolean }): void => {
      row.dataset.key = r.from;
      const cb = row.querySelector('input') as HTMLInputElement;
      setChecked(cb, r.on);
      cb.setAttribute('aria-label', `Use ${r.from}`);
      setText(row.querySelector('.ft-pf-ac-from'), r.from);
      setText(row.querySelector('.ft-pf-ac-to'), r.to);
      const rm = row.querySelector('button') as HTMLButtonElement;
      rm.dataset.remove = r.from;
      rm.setAttribute('aria-label', `Remove ${r.from}`);
    };
    onChange(sync);
    return { d, sync };
  });
  b.sync();
  b.d.open();
}

export function readabilityDialog(ed: DocEditor): void {
  const b = once('readability', () => {
    const d = new Dialog('Readability statistics', 420);
    d.body.appendChild(el('<p class="ft-note" data-describes>Computed from the text of the current tab with the standard Flesch formulas and a simple English syllable count, so treat the numbers as a guide.</p>'));
    const dl = el('<dl class="ft-tpl-facts ft-pf-facts"></dl>');
    const rows: Record<string, HTMLElement> = {};
    const groups: Array<[string, Array<[string, string]>]> = [
      ['Counts', [['words', 'Words'], ['characters', 'Characters'], ['paragraphs', 'Paragraphs'], ['sentences', 'Sentences']]],
      ['Averages', [['sentencesPerParagraph', 'Sentences per paragraph'], ['wordsPerSentence', 'Words per sentence'], ['charactersPerWord', 'Characters per word']]],
      ['Readability', [['passivePercent', 'Passive sentences'], ['fleschEase', 'Flesch Reading Ease'], ['gradeLevel', 'Flesch-Kincaid Grade Level'], ['band', 'Reading level']]],
    ];
    for (const [title, items] of groups) {
      dl.appendChild(el(`<div class="ft-pf-facts-title" role="presentation">${title}</div>`));
      for (const [key, label] of items) {
        const dt = el('<dt></dt>');
        const dd = el('<dd></dd>');
        setText(dt, label);
        rows[key] = dd;
        dl.append(dt, dd);
      }
    }
    d.body.appendChild(dl);
    d.button('Close', 'primary', () => d.close());
    labelDialog(d, true);
    const sync = (): void => {
      const view = ed.view;
      if (!view) return;
      const r = readability(view.state.doc);
      const fmt = (v: number | string, suffix = ''): string => (typeof v === 'number' ? `${v.toLocaleString()}${suffix}` : v);
      setText(rows.words, fmt(r.words));
      setText(rows.characters, fmt(r.characters));
      setText(rows.paragraphs, fmt(r.paragraphs));
      setText(rows.sentences, fmt(r.sentences));
      setText(rows.sentencesPerParagraph, fmt(r.sentencesPerParagraph));
      setText(rows.wordsPerSentence, fmt(r.wordsPerSentence));
      setText(rows.charactersPerWord, fmt(r.charactersPerWord));
      setText(rows.passivePercent, fmt(r.passivePercent, '%'));
      setText(rows.fleschEase, fmt(r.fleschEase));
      setText(rows.gradeLevel, fmt(r.gradeLevel));
      setText(rows.band, r.band);
    };
    return { d, sync };
  });
  b.sync();
  b.d.open();
}
