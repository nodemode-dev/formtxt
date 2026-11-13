import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setClass, setText } from '../ui/dom';
import { toast } from '../ui/toast';
import { retiredEmoji } from './retired-icons';

export interface Emoji { char: string; label: string; group: number; tags: string[]; skins: string[] }

export const EMOJI_GROUPS: Array<[number, string]> = [[0, 'Smileys'], [1, 'People'], [3, 'Animals and nature'], [4, 'Food and drink'], [5, 'Travel and places'], [6, 'Activities'], [7, 'Objects'], [8, 'Symbols'], [9, 'Flags']];
export const SKIN_TONES: Array<[number, string]> = [[-1, 'Default'], [0, 'Light'], [1, 'Medium light'], [2, 'Medium'], [3, 'Medium dark'], [4, 'Dark']];

let data: Promise<Emoji[]> | null = null;

export function loadEmoji(): Promise<Emoji[]> {
  if (!data) {
    data = import('emojibase-data/en/compact.json').then((m) => {
      const raw = (m.default ?? m) as unknown as Array<{ unicode: string; label: string; group?: number; order?: number; tags?: string[]; skins?: Array<{ unicode: string }> }>;
      return raw.filter((e) => e.group !== undefined && e.group !== 2 && !retiredEmoji(e.unicode)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((e) => ({ char: e.unicode, label: e.label, group: e.group!, tags: e.tags ?? [], skins: (e.skins ?? []).map((s) => s.unicode) }));
    });
  }
  return data;
}

const RECENT_KEY = 'formtxt.emoji.recent';
const TONE_KEY = 'formtxt.emoji.tone';

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && !retiredEmoji(x)).slice(0, 32) : []; } catch { return []; }
}

function pushRecent(char: string): void {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([char, ...readRecent().filter((c) => c !== char)].slice(0, 32))); } catch { /* storage unavailable */ }
}

function readTone(): number {
  try { const n = Number(localStorage.getItem(TONE_KEY) ?? -1); return n >= 0 && n <= 4 ? n : -1; } catch { return -1; }
}

export function withTone(e: Emoji, tone: number): string {
  return tone >= 0 && e.skins.length >= 5 ? e.skins[tone] : e.char;
}

export function searchEmoji(all: Emoji[], q: string, limit = 240): Emoji[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const words = t.split(/\s+/);
  const scored: Array<[number, Emoji]> = [];
  for (const e of all) {
    let score = 0;
    for (const w of words) {
      if (e.label === t) score += 10;
      else if (e.label.startsWith(w)) score += 4;
      else if (e.label.split(/[\s:-]+/).some((x) => x.startsWith(w))) score += 3;
      else if (e.tags.some((x) => x.startsWith(w))) score += 2;
      else { score = 0; break; }
    }
    if (score) scored.push([score, e]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

export async function findEmoji(name: string): Promise<Emoji | null> {
  const all = await loadEmoji();
  const t = name.trim().toLowerCase().replace(/^:|:$/g, '').replace(/_/g, ' ');
  return all.find((e) => e.char === name.trim()) ?? all.find((e) => e.label === t) ?? searchEmoji(all, t, 1)[0] ?? null;
}

export async function emojiDialog(insert: (text: string) => void): Promise<void> {
  const all = await loadEmoji();
  const d = new Dialog('Emoji', 560);
  const search = el<HTMLInputElement>('<input class="ft-input" type="search" placeholder="Search emoji, such as smile or rocket" aria-label="Search emoji" spellcheck="false">');
  const tone = el<HTMLSelectElement>(`<select class="ft-input ft-emoji-tone" aria-label="Skin tone">${SKIN_TONES.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('')}</select>`);
  tone.value = String(readTone());
  const tabs = el(`<div class="ft-emoji-tabs" role="tablist">${[[-2, 'Recent'] as [number, string], ...EMOJI_GROUPS].map(([g, l]) => `<button type="button" role="tab" class="ft-emoji-tab" data-group="${g}">${escapeHtml(l)}</button>`).join('')}</div>`);
  const grid = el('<div class="ft-emoji-grid" role="listbox" aria-label="Emoji"></div>');
  const status = el('<p class="ft-emoji-status" aria-live="polite"></p>');
  const head = el('<div class="ft-emoji-head"></div>');
  head.append(search, tone);
  d.body.append(head, tabs, grid, status);
  const recent = readRecent();
  let group = recent.length ? -2 : 0;
  const byChar = new Map(all.map((e) => [e.char, e]));
  const render = (): void => {
    const t = Number(tone.value);
    const q = search.value;
    const list = q.trim() ? searchEmoji(all, q) : group === -2 ? readRecent().map((c) => byChar.get(c) ?? { char: c, label: c, group: -2, tags: [], skins: [] }) : all.filter((e) => e.group === group);
    for (const b of tabs.querySelectorAll<HTMLElement>('.ft-emoji-tab')) {
      const on = !q.trim() && Number(b.dataset.group) === group;
      setClass(b, 'is-active', on);
      b.setAttribute('aria-selected', String(on));
    }
    patchList(grid, list, {
      key: (e) => e.char,
      create: (e) => { const b = el<HTMLButtonElement>('<button type="button" class="ft-emoji" role="option"></button>'); b.dataset.char = e.char; b.title = e.label; b.setAttribute('aria-label', e.label); setText(b, withTone(e, t)); return b; },
      update: (b, e) => setText(b, withTone(e, t)),
    });
    setText(status, list.length ? (q.trim() ? `${list.length} found` : '') : q.trim() ? 'No emoji match that search.' : 'Emoji you insert appear here.');
  };
  tabs.addEventListener('click', (e) => {
    const g = (e.target as HTMLElement).closest<HTMLElement>('[data-group]')?.dataset.group;
    if (g === undefined) return;
    group = Number(g);
    search.value = '';
    render();
    grid.scrollTop = 0;
  });
  const choose = (char: string): void => {
    const e = byChar.get(char);
    const out = e ? withTone(e, Number(tone.value)) : char;
    pushRecent(char);
    insert(out);
    d.close();
  };
  grid.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.ft-emoji')?.dataset.char;
    if (c) choose(c);
  });
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = grid.querySelector<HTMLElement>('.ft-emoji')?.dataset.char;
    if (first) choose(first); else toast('No emoji match that search.', 'error');
  });
  tone.addEventListener('change', () => { try { localStorage.setItem(TONE_KEY, tone.value); } catch { /* storage unavailable */ } render(); });
  d.button('Close', 'ghost', () => d.close());
  render();
  d.open(search);
}
