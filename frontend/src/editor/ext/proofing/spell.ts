import { api } from '../../../io/api';
import { engineAvailable, setEngineAvailable } from './state';

const unknown = new Map<string, boolean>();
const suggestions = new Map<string, string[]>();
const inflight = new Map<string, Promise<void>>();
let retryTimer = 0;

const key = (lang: string, word: string): string => `${lang}\u0000${word}`;

export function forgetWord(word: string): void {
  for (const k of Array.from(unknown.keys())) if (k.endsWith(`\u0000${word}`) || k.toLowerCase().endsWith(`\u0000${word.toLowerCase()}`)) unknown.delete(k);
}

export function forgetAll(): void { unknown.clear(); }

export async function unknownWords(lang: string, words: string[]): Promise<Set<string>> {
  const need = Array.from(new Set(words.filter((w) => !unknown.has(key(lang, w)))));
  for (let i = 0; i < need.length; i += 800) {
    const batch = need.slice(i, i + 800);
    const id = `${lang}:${batch.join('|')}`;
    let job = inflight.get(id);
    if (!job) {
      job = api.post<{ checked: boolean; unknown: string[] }>('/proofing/spell', { lang, words: batch }).then((r) => {
        setEngineAvailable(true);
        const bad = new Set(r.unknown);
        for (const w of batch) unknown.set(key(lang, w), r.checked && bad.has(w));
      }).catch(() => {
        setEngineAvailable(false);
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => setEngineAvailable(true), 20000);
      }).finally(() => { inflight.delete(id); });
      inflight.set(id, job);
    }
    await job;
  }
  return new Set(words.filter((w) => unknown.get(key(lang, w))));
}

export async function suggest(lang: string, word: string): Promise<string[]> {
  const k = key(lang, word);
  const hit = suggestions.get(k);
  if (hit) return hit;
  if (!engineAvailable()) return [];
  try {
    const r = await api.post<{ suggestions: string[] }>('/proofing/suggest', { lang, word, limit: 8 });
    suggestions.set(k, r.suggestions);
    return r.suggestions;
  } catch {
    return [];
  }
}

export async function addWord(word: string, remove = false): Promise<string[]> {
  const r = await api.post<{ dictionary: string[] }>('/proofing/dictionary', { word, remove });
  forgetWord(word);
  return r.dictionary;
}
