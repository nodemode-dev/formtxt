import type { Node as PMNode } from 'prosemirror-model';
import { NO_CHECK } from '../proofing-spec';

export interface LangSpan { start: number; end: number; lang: string; skip: boolean; link: boolean; code: boolean }

export interface ParaText {
  text: string;
  map: number[];
  spans: LangSpan[];
  pos: number;
  node: PMNode;
}

export const OBJECT = '\ufffc';

export const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'cf', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'no', 'nos', 'fig', 'figs', 'approx', 'inc', 'ltd', 'co', 'corp', 'jr', 'sr', 'sen', 'rep', 'gov', 'gen', 'col', 'lt', 'sgt', 'capt', 'mt', 'al', 'est', 'dept', 'vol', 'ed', 'eds', 'p', 'pp', 'ch', 'sec', 'u.s', 'a.m', 'p.m', 'ca', 'viz', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec']);

export function paraText(node: PMNode, pos: number, defaultLang: string): ParaText {
  let text = '';
  const map: number[] = [];
  const spans: LangSpan[] = [];
  node.forEach((child, offset) => {
    const at = pos + 1 + offset;
    if (child.isText) {
      const raw = child.text ?? '';
      const langMark = child.marks.find((m) => m.type.name === 'lang');
      const lang = langMark ? String(langMark.attrs.code) : defaultLang;
      const link = child.marks.some((m) => m.type.name === 'link');
      const code = child.marks.some((m) => m.type.name === 'code');
      const start = text.length;
      for (let i = 0; i < raw.length; i++) {
        if (raw.charCodeAt(i) === 0xad) continue;
        text += raw[i];
        map.push(at + i);
      }
      if (text.length > start) {
        const last = spans[spans.length - 1];
        if (last && last.end === start && last.lang === lang && last.link === link && last.code === code) last.end = text.length;
        else spans.push({ start, end: text.length, lang, skip: lang === NO_CHECK, link, code });
      }
    } else {
      const ch = child.type.name === 'hard_break' ? '\n' : child.type.name === 'tab' ? '\t' : OBJECT;
      const start = text.length;
      text += ch;
      map.push(at);
      spans.push({ start, end: text.length, lang: defaultLang, skip: true, link: false, code: false });
    }
  });
  return { text, map, spans, pos, node };
}

export function spanAt(p: ParaText, index: number): LangSpan | undefined {
  let lo = 0;
  let hi = p.spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = p.spans[mid];
    if (index < s.start) hi = mid - 1;
    else if (index >= s.end) lo = mid + 1;
    else return s;
  }
  return undefined;
}

export function docRange(p: ParaText, from: number, to: number): { from: number; to: number } {
  return { from: p.map[from], to: p.map[Math.max(from, to - 1)] + 1 };
}

export function indexOfDoc(p: ParaText, docPos: number): number {
  let lo = 0;
  let hi = p.map.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (p.map[mid] < docPos) lo = mid + 1; else hi = mid - 1;
  }
  return lo;
}

export const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'\u2019]*/gu;

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) ?? []).length;
}

export function isAbbreviation(before: string): boolean {
  const m = /([\p{L}.]+)$/u.exec(before);
  if (!m) return false;
  const tok = m[1].toLowerCase().replace(/^\.+/, '');
  if (ABBREVIATIONS.has(tok)) return true;
  return /^\p{Lu}$/u.test(m[1]) || /^(\p{L}\.)+\p{L}$/u.test(m[1]);
}

export function sentences(text: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const re = /[.!?]+["')\]\u201d\u2019]*(?=\s|$)/g;
  let start = 0;
  const push = (end: number): void => {
    let from = start;
    let to = end;
    while (from < to && /\s/.test(text[from])) from++;
    while (to > from && /\s/.test(text[to - 1])) to--;
    if (to > from && /[\p{L}\p{N}]/u.test(text.slice(from, to))) out.push({ from, to });
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[0][0] === '.' && m[0].length === 1 && isAbbreviation(text.slice(0, m.index))) continue;
    push(end);
    start = end;
  }
  push(text.length);
  return out;
}
