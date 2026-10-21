import { closeHistory } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { getPrefs } from './state';
import { isAbbreviation } from './text';

const MISSPELLINGS = 'teh:the,adn:and,taht:that,thier:their,recieve:receive,recieved:received,wierd:weird,freind:friend,beleive:believe,occured:occurred,occurence:occurrence,seperate:separate,definately:definitely,definatly:definitely,accomodate:accommodate,acheive:achieve,agressive:aggressive,alot:a lot,apparant:apparent,begining:beginning,calender:calendar,collegue:colleague,comming:coming,committe:committee,concious:conscious,dissapear:disappear,embarass:embarrass,enviroment:environment,existance:existence,foriegn:foreign,goverment:government,gaurd:guard,happend:happened,independant:independent,knowlege:knowledge,liason:liaison,lisence:license,maintainance:maintenance,millenium:millennium,neccessary:necessary,necesary:necessary,noticable:noticeable,occassion:occasion,paralell:parallel,persue:pursue,posession:possession,prefered:preferred,priviledge:privilege,probly:probably,publically:publicly,realy:really,refered:referred,relevent:relevant,religous:religious,remeber:remember,resistence:resistance,rythm:rhythm,sieze:seize,succesful:successful,sucess:success,supercede:supersede,suprise:surprise,tommorow:tomorrow,tounge:tongue,truely:truly,untill:until,wich:which,wether:whether,woudl:would,wouldnt:wouldn\'t,couldnt:couldn\'t,shouldnt:shouldn\'t,dont:don\'t,doesnt:doesn\'t,didnt:didn\'t,isnt:isn\'t,arent:aren\'t,wasnt:wasn\'t,werent:weren\'t,hasnt:hasn\'t,havent:haven\'t,youre:you\'re,thats:that\'s,whats:what\'s,theyre:they\'re,i:I,abotu:about,aboutthe:about the,afterall:after all,alwasy:always,becuase:because,beacuse:because,bcause:because,beleif:belief,buisness:business,coudl:could,diffrent:different,differnt:different,eigth:eighth,equiptment:equipment,excercise:exercise,experiance:experience,familar:familiar,fourty:forty,fullfil:fulfil,grammer:grammar,gratefull:grateful,guidence:guidance,harrass:harass,heigth:height,humourous:humorous,immediatly:immediately,inteligent:intelligent,interupt:interrupt,jewelery:jewellery,kernal:kernel,libary:library,mispell:misspell,mischievious:mischievous,naturaly:naturally,ocasion:occasion,oppurtunity:opportunity,orignal:original,pasttime:pastime,peice:piece,percieve:perceive,playwrite:playwright,potatos:potatoes,presance:presence,proffesional:professional,pronounciation:pronunciation,questionaire:questionnaire,reccomend:recommend,recomend:recommend,rediculous:ridiculous,reponse:response,responsability:responsibility,scedule:schedule,sentance:sentence,similiar:similar,sincerly:sincerely,speach:speech,strenght:strength,studing:studying,temperture:temperature,thourough:thorough,throught:thought,tyrany:tyranny,unfortunatly:unfortunately,usualy:usually,vaccuum:vacuum,vegtable:vegetable,visable:visible,wensday:Wednesday,withold:withhold,writting:writing,yeild:yield';

const SYMBOLS: Record<string, string> = {
  '(c)': '\u00a9',
  '(r)': '\u00ae',
  '(tm)': '\u2122',
  '(e)': '\u20ac',
};

const ARROWS: Array<[string, string]> = [
  ['<-->', '\u2194'],
  ['<==>', '\u21d4'],
  ['-->', '\u2192'],
  ['<--', '\u2190'],
  ['==>', '\u21d2'],
  ['<==', '\u21d0'],
  ['->', '\u2192'],
  ['<-', '\u2190'],
];

const FRACTIONS: Record<string, string> = {
  '1/2': '\u00bd',
  '1/4': '\u00bc',
  '3/4': '\u00be',
  '1/3': '\u2153',
  '2/3': '\u2154',
  '1/8': '\u215b',
};

const EN_DASH = '\u2013';
const ELLIPSIS = '\u2026';
const OPEN_DOUBLE = '\u201c';
const CLOSE_DOUBLE = '\u201d';
const OPEN_SINGLE = '\u2018';
const CLOSE_SINGLE = '\u2019';

export function defaultEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of MISSPELLINGS.split(',')) {
    const i = pair.indexOf(':');
    out[pair.slice(0, i)] = pair.slice(i + 1).replace(/\\'/g, "'");
  }
  for (const [k, v] of Object.entries(SYMBOLS)) out[k] = v;
  return out;
}

const DEFAULTS = defaultEntries();

export function allEntries(): Array<{ from: string; to: string; custom: boolean; on: boolean }> {
  const p = getPrefs().autocorrect;
  const removed = new Set(p.removed);
  const off = new Set(p.disabled);
  const rows = new Map<string, { from: string; to: string; custom: boolean; on: boolean }>();
  for (const [k, v] of Object.entries(DEFAULTS)) if (!removed.has(k)) rows.set(k, { from: k, to: v, custom: false, on: !off.has(k) });
  for (const [k, v] of Object.entries(p.entries)) rows.set(k, { from: k, to: v, custom: true, on: !off.has(k) });
  return Array.from(rows.values()).sort((a, b) => a.from.localeCompare(b.from));
}

function lookup(word: string): string | null {
  const p = getPrefs().autocorrect;
  const lower = word.toLowerCase();
  const find = (key: string): string | null => {
    if (p.disabled.includes(key)) return null;
    if (key in p.entries) return p.entries[key];
    if (p.removed.includes(key)) return null;
    return key in DEFAULTS ? DEFAULTS[key] : null;
  };
  const exact = find(word);
  if (exact !== null) return exact;
  const base = find(lower);
  if (base === null) return null;
  if (word === lower) return base;
  if (word.length > 1 && word === word.toUpperCase()) return base.toUpperCase();
  if (word[0] === word[0].toUpperCase() && word.slice(1) === lower.slice(1)) return base[0].toUpperCase() + base.slice(1);
  return null;
}

interface Last { start: number; end: number; original: string }

export const autocorrectKey = new PluginKey<Last | null>('autocorrect');

const BOUNDARY = /^[\s.,;:!?)\]}"'\u201d\u2019]$/;

function textBefore(view: EditorView, pos: number): { text: string; start: number } | null {
  const $ = view.state.doc.resolve(pos);
  const parent = $.parent;
  if (parent.type.name !== 'paragraph') return null;
  if ($.marks().some((m) => m.type.name === 'code')) return null;
  const start = $.start();
  return { text: parent.textBetween(0, $.parentOffset, undefined, '\ufffc'), start };
}

function replace(view: EditorView, from: number, to: number, insert: string, original: string, typed: string): boolean {
  const tr = closeHistory(view.state.tr);
  tr.insertText(insert + typed, from, to);
  const end = from + insert.length + typed.length;
  tr.setSelection(TextSelection.create(tr.doc, end));
  tr.setMeta(autocorrectKey, { start: from, end, original: original + typed } satisfies Last);
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function handleTextInput(view: EditorView, from: number, to: number, typed: string): boolean {
  const prefs = getPrefs().autocorrect;
  if (!prefs.enabled || typed.length !== 1) return false;
  const before = textBefore(view, from);
  if (!before) return false;
  const text = before.text;
  const rules = prefs.rules;

  if (rules.smartQuotes && (typed === '"' || typed === "'")) {
    const prev = text.slice(-1);
    const opening = !prev || /[\s([{<\u2014\u2013-]/.test(prev) || prev === OPEN_DOUBLE || prev === OPEN_SINGLE;
    const out = typed === '"' ? (opening ? OPEN_DOUBLE : CLOSE_DOUBLE) : (opening ? OPEN_SINGLE : CLOSE_SINGLE);
    view.dispatch(view.state.tr.insertText(out, from, to));
    return true;
  }

  if (rules.symbols && /[^\p{L}\p{N}]/u.test(typed)) {
    for (const row of allEntries()) {
      if (!row.on || row.from.length < 2 || !/[^\p{L}\p{N}]$/u.test(row.from) || typed !== row.from.slice(-1)) continue;
      if ((text + typed).toLowerCase().endsWith(row.from.toLowerCase())) {
        const start = from - (row.from.length - 1);
        return replace(view, start, to, row.to, view.state.doc.textBetween(start, from) + typed, '');
      }
    }
  }

  if (rules.arrows) {
    for (const [key, value] of ARROWS) {
      if (typed === key.slice(-1) && (text + typed).endsWith(key)) {
        const start = from - (key.length - 1);
        return replace(view, start, to, value, key, '');
      }
    }
  }

  if (rules.ellipsis && typed === '.' && text.endsWith('..')) {
    const start = from - 2;
    return replace(view, start, to, ELLIPSIS, '...', '');
  }

  if (!BOUNDARY.test(typed)) return false;

  const tail = /[\p{L}\p{N}'\u2019]+$/u.exec(text);
  if (rules.dashes && tail) {
    const lead = text.slice(0, text.length - tail[0].length);
    const m = /([\p{L}\p{N}])( ?)--( ?)$/u.exec(lead);
    if (m) {
      const dashEnd = from - tail[0].length - m[3].length;
      const dashAt = dashEnd - 2;
      if (view.state.doc.textBetween(dashAt, dashEnd) === '--') {
        const original = view.state.doc.textBetween(dashAt, from) + typed;
        const tr = closeHistory(view.state.tr).insertText(typed, from, to).insertText(EN_DASH, dashAt, dashEnd);
        const end = from - 1 + typed.length;
        tr.setSelection(TextSelection.create(tr.doc, end));
        tr.setMeta(autocorrectKey, { start: dashAt, end, original } satisfies Last);
        view.dispatch(tr.scrollIntoView());
        return true;
      }
    }
  }

  if (rules.fractions) {
    const m = /(?:^|[\s(])(\d\/\d)$/.exec(text);
    if (m && FRACTIONS[m[1]]) {
      const start = from - m[1].length;
      return replace(view, start, to, FRACTIONS[m[1]], m[1], typed);
    }
  }

  if (rules.list && tail) {
    const word = tail[0].replace(/^['\u2019]+/, '');
    if (word && typed !== "'" && typed !== '\u2019' && !(word === 'i' && typed === ')')) {
      const repl = lookup(word);
      if (repl !== null && repl !== word) {
        const start = from - word.length;
        return replace(view, start, to, repl, word, typed);
      }
    }
  }

  if (rules.capitalize && tail && /^\p{Ll}/u.test(tail[0]) && typed !== "'") {
    const lead = text.slice(0, text.length - tail[0].length);
    const stop = /([.!?])["')\]\u201d\u2019]*\s+$/.exec(lead);
    const startOfSentence = lead === '' || (!!stop && !(stop[1] === '.' && isAbbreviation(lead.slice(0, lead.length - stop[0].length))));
    if (startOfSentence && /^\p{L}[\p{L}'\u2019]*$/u.test(tail[0])) {
      const start = from - tail[0].length;
      return replace(view, start, to, tail[0][0].toUpperCase() + tail[0].slice(1), tail[0], typed);
    }
  }
  return false;
}

function undoLast(view: EditorView): boolean {
  const last = autocorrectKey.getState(view.state);
  const sel = view.state.selection;
  if (!last || !sel.empty || sel.head !== last.end) return false;
  const tr = closeHistory(view.state.tr).insertText(last.original, last.start, last.end);
  tr.setSelection(TextSelection.create(tr.doc, last.start + last.original.length));
  tr.setMeta(autocorrectKey, { cleared: true });
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function autocorrectPlugins(): Plugin[] {
  return [
    new Plugin<Last | null>({
      key: autocorrectKey,
      state: {
        init: () => null,
        apply(tr, value) {
          const meta = tr.getMeta(autocorrectKey) as (Last & { cleared?: boolean }) | undefined;
          if (meta) return 'cleared' in meta ? null : meta;
          if (tr.docChanged || tr.selectionSet) return null;
          return value;
        },
      },
      props: { handleTextInput },
    }),
    keymap({ Backspace: (_state, _dispatch, view) => (view ? undoLast(view) : false) }),
  ];
}
