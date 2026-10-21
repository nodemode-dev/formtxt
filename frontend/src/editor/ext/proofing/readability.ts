import type { Node as PMNode } from 'prosemirror-model';
import { passiveMatches } from './grammar';
import { countWords, sentences } from './text';

export interface Readability {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  sentences: number;
  syllables: number;
  wordsPerSentence: number;
  sentencesPerParagraph: number;
  charactersPerWord: number;
  passivePercent: number;
  fleschEase: number;
  gradeLevel: number;
  band: string;
}

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function band(ease: number): string {
  if (ease >= 90) return 'Very easy to read';
  if (ease >= 80) return 'Easy to read';
  if (ease >= 70) return 'Fairly easy to read';
  if (ease >= 60) return 'Plain English';
  if (ease >= 50) return 'Fairly difficult to read';
  if (ease >= 30) return 'Difficult to read';
  return 'Very difficult to read';
}

export function readability(doc: PMNode): Readability {
  let words = 0;
  let chars = 0;
  let noSpaces = 0;
  let paragraphs = 0;
  let sentenceCount = 0;
  let syl = 0;
  let passive = 0;
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, ' ', ' ').replace(/\u00ad/g, '');
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    paragraphs++;
    chars += text.length;
    noSpaces += text.replace(/\s/g, '').length;
    words += countWords(text);
    for (const w of text.match(/[\p{L}][\p{L}'\u2019-]*/gu) ?? []) syl += syllables(w);
    for (const s of sentences(text)) {
      sentenceCount++;
      if (passiveMatches(text.slice(s.from, s.to)).length) passive++;
    }
    return false;
  });
  const sc = Math.max(1, sentenceCount);
  const wc = Math.max(1, words);
  const ease = Math.round((206.835 - 1.015 * (words / sc) - 84.6 * (syl / wc)) * 10) / 10;
  const grade = Math.round((0.39 * (words / sc) + 11.8 * (syl / wc) - 15.59) * 10) / 10;
  return {
    words,
    characters: chars,
    charactersNoSpaces: noSpaces,
    paragraphs,
    sentences: sentenceCount,
    syllables: syl,
    wordsPerSentence: Math.round((words / sc) * 10) / 10,
    sentencesPerParagraph: Math.round((sentenceCount / Math.max(1, paragraphs)) * 10) / 10,
    charactersPerWord: Math.round((noSpaces / wc) * 10) / 10,
    passivePercent: Math.round((passive / sc) * 1000) / 10,
    fleschEase: words ? Math.max(-50, Math.min(120, ease)) : 0,
    gradeLevel: words ? Math.max(0, grade) : 0,
    band: words ? band(ease) : 'No text to measure',
  };
}
