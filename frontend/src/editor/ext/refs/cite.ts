export const STYLES = [['apa', 'APA 7'], ['mla', 'MLA 9'], ['chicago', 'Chicago author-date'], ['ieee', 'IEEE']] as const;
export const SOURCE_TYPES = [['book', 'Book'], ['chapter', 'Book section'], ['article', 'Journal article'], ['newspaper', 'Newspaper or magazine article'], ['conference', 'Conference paper'], ['website', 'Website'], ['report', 'Report'], ['thesis', 'Thesis or dissertation']] as const;

export interface Person { family: string; given: string }
export interface Source {
  id: string;
  type: string;
  authors: Person[];
  title: string;
  year: string;
  month: string;
  day: string;
  container: string;
  publisher: string;
  place: string;
  edition: string;
  volume: string;
  issue: string;
  pages: string;
  number: string;
  url: string;
  doi: string;
  accessed: string;
}
export interface CiteItem { id: string; locator?: string }
export interface Formatted { text: string; em: string[] }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TEXT_KEYS = ['title', 'year', 'month', 'day', 'container', 'publisher', 'place', 'edition', 'volume', 'issue', 'pages', 'number', 'url', 'doi', 'accessed'] as const;

export const styleTitle = (s: string): string => (s === 'mla' ? 'Works cited' : 'References');

export function blankSource(id: string): Source {
  return { id, type: 'book', authors: [], title: '', year: '', month: '', day: '', container: '', publisher: '', place: '', edition: '', volume: '', issue: '', pages: '', number: '', url: '', doi: '', accessed: '' };
}

export function cleanSource(raw: unknown): Source | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const s = blankSource(String(r.id ?? ''));
  if (!s.id) return null;
  s.type = SOURCE_TYPES.some((t) => t[0] === r.type) ? String(r.type) : 'book';
  for (const k of TEXT_KEYS) s[k] = String(r[k] ?? '').slice(0, 500);
  if (Array.isArray(r.authors)) s.authors = r.authors.slice(0, 50).map((a) => ({ family: String((a as Person)?.family ?? '').slice(0, 120), given: String((a as Person)?.given ?? '').slice(0, 120) })).filter((a) => a.family || a.given);
  return s;
}

export function parseAuthors(text: string): Person[] {
  return text.split(/\n|;/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(',');
    return i < 0 ? { family: l, given: '' } : { family: l.slice(0, i).trim(), given: l.slice(i + 1).trim() };
  });
}

export const authorsText = (a: Person[]): string => a.map((p) => (p.given ? `${p.family}, ${p.given}` : p.family)).join('\n');

const initials = (given: string): string => given.split(/\s+/).filter(Boolean).map((w) => w.split('-').filter(Boolean).map((x) => `${x[0].toUpperCase()}.`).join('-')).join(' ');
const full = (p: Person): string => (p.given ? `${p.given} ${p.family}` : p.family);
const end = (s: string): string => (!s || /[.?!]$/.test(s) ? s : `${s}.`);
const monthName = (m: string): string => { const i = Number(m); return i >= 1 && i <= 12 ? MONTHS[i - 1] : m; };
const short = (s: string, n = 3): string => s.split(/\s+/).slice(0, n).join(' ');
const doiUrl = (s: Source): string => (s.doi ? (/^https?:/.test(s.doi) ? s.doi : `https://doi.org/${s.doi}`) : s.url);
const isPage = (l: string): boolean => /^\d+([-–]\d+)?$/.test(l.trim());
const pageWord = (l: string): string => (isPage(l) ? (/[-–]/.test(l) ? 'pp. ' : 'p. ') : '');
const lead = (s: Source): string => s.authors[0]?.family || short(s.title);
const ordinal = (e: string): string => (/^\d+$/.test(e) ? `${e}${/1$/.test(e) && !/11$/.test(e) ? 'st' : /2$/.test(e) && !/12$/.test(e) ? 'nd' : /3$/.test(e) && !/13$/.test(e) ? 'rd' : 'th'}` : e);

export function sortKey(s: Source): string {
  return `${(s.authors[0]?.family || s.title).toLowerCase()}|${s.year}|${s.title.toLowerCase()}`;
}

export function inText(style: string, items: CiteItem[], byId: Map<string, Source>, order: Map<string, number>): string {
  const parts: string[] = [];
  const nums: string[] = [];
  for (const it of items) {
    const s = byId.get(it.id);
    if (!s) { parts.push('source missing'); nums.push('?'); continue; }
    const loc = (it.locator ?? '').trim();
    const a = s.authors;
    const year = s.year || 'n.d.';
    if (style === 'ieee') nums.push(`${order.get(s.id) ?? '?'}${loc ? `, ${pageWord(loc)}${loc}` : ''}`);
    else if (style === 'apa') parts.push(`${a.length >= 3 ? `${a[0].family} et al.` : a.length === 2 ? `${a[0].family} & ${a[1].family}` : lead(s)}, ${year}${loc ? `, ${pageWord(loc)}${loc}` : ''}`);
    else if (style === 'mla') parts.push(`${a.length >= 3 ? `${a[0].family} et al.` : a.length === 2 ? `${a[0].family} and ${a[1].family}` : lead(s)}${loc ? ` ${loc}` : ''}`);
    else parts.push(`${a.length >= 4 ? `${a[0].family} et al.` : a.length === 3 ? `${a[0].family}, ${a[1].family}, and ${a[2].family}` : a.length === 2 ? `${a[0].family} and ${a[1].family}` : lead(s)} ${year}${loc ? `, ${loc}` : ''}`);
  }
  if (style === 'ieee') return `[${nums.join('], [')}]`;
  return `(${parts.join('; ')})`;
}

function apaNames(a: Person[]): string {
  const f = (p: Person): string => (p.given ? `${p.family}, ${initials(p.given)}` : p.family);
  if (a.length <= 1) return a.map(f).join('');
  if (a.length === 2) return `${f(a[0])}, & ${f(a[1])}`;
  if (a.length > 20) return `${a.slice(0, 19).map(f).join(', ')}, . . . ${f(a[a.length - 1])}`;
  return `${a.slice(0, -1).map(f).join(', ')}, & ${f(a[a.length - 1])}`;
}

function mlaNames(a: Person[]): string {
  if (!a.length) return '';
  const first = a[0].given ? `${a[0].family}, ${a[0].given}` : a[0].family;
  if (a.length === 1) return first;
  return a.length === 2 ? `${first}, and ${full(a[1])}` : `${first}, et al.`;
}

function chicagoNames(a: Person[]): string {
  if (!a.length) return '';
  const first = a[0].given ? `${a[0].family}, ${a[0].given}` : a[0].family;
  if (a.length === 1) return first;
  if (a.length > 10) return `${[first, ...a.slice(1, 7).map(full)].join(', ')}, et al.`;
  const rest = a.slice(1).map(full);
  return rest.length === 1 ? `${first}, and ${rest[0]}` : `${first}, ${rest.slice(0, -1).join(', ')}, and ${rest[rest.length - 1]}`;
}

function ieeeNames(a: Person[]): string {
  const f = (p: Person): string => (p.given ? `${initials(p.given)} ${p.family}` : p.family);
  if (a.length > 6) return `${f(a[0])} et al.`;
  if (a.length <= 2) return a.map(f).join(' and ');
  return `${a.slice(0, -1).map(f).join(', ')}, and ${f(a[a.length - 1])}`;
}

export function reference(style: string, s: Source): Formatted {
  const em: string[] = [];
  const I = (t: string): string => { if (t) em.push(t); return t; };
  const t = s.title;
  const link = doiUrl(s);
  const nth = ordinal(s.edition);
  const tail = link ? ` ${link}` : '';
  let text = '';
  if (style === 'apa') {
    const who = apaNames(s.authors);
    const when = (s.type === 'website' || s.type === 'newspaper') && s.month ? `${s.year || 'n.d.'}, ${monthName(s.month)}${s.day ? ` ${s.day}` : ''}` : s.year || 'n.d.';
    const head = who ? `${end(who)} (${when}). ` : '';
    const dt = who ? '' : ` (${when}).`;
    const pub = s.publisher ? ` ${end(s.publisher)}` : '';
    if (s.type === 'article') text = `${head}${end(t)}${dt} ${I(s.container)}${s.volume ? `, ${I(s.volume)}` : ''}${s.issue ? `(${s.issue})` : ''}${s.pages ? `, ${s.pages}` : ''}.${tail}`;
    else if (s.type === 'website') text = `${head}${I(t)}.${dt}${s.container ? ` ${end(s.container)}` : ''}${tail}`;
    else if (s.type === 'report') text = `${head}${I(t)}${s.number ? ` (Report No. ${s.number})` : ''}.${dt}${pub}${tail}`;
    else if (s.type === 'chapter' || s.type === 'conference') text = `${head}${end(t)}${dt} In ${I(s.container)}${s.pages ? ` (pp. ${s.pages})` : ''}.${pub}${tail}`;
    else if (s.type === 'newspaper') text = `${head}${end(t)}${dt} ${I(s.container)}${s.pages ? `, ${s.pages}` : ''}.${tail}`;
    else if (s.type === 'thesis') text = `${head}${I(t)}${dt} [${s.number || 'Doctoral dissertation'}${s.publisher ? `, ${s.publisher}` : ''}].${tail}`;
    else text = `${head}${I(t)}${nth ? ` (${nth} ed.)` : ''}.${dt}${pub}${tail}`;
  } else if (style === 'mla') {
    const who = mlaNames(s.authors);
    const head = who ? `${end(who)} ` : '';
    const date = [s.day, monthName(s.month), s.year].filter(Boolean).join(' ');
    const bare = link.replace(/^https?:\/\//, '');
    if (s.type === 'article') text = `${head}"${end(t)}" ${I(s.container)}, ${[s.volume ? `vol. ${s.volume}` : '', s.issue ? `no. ${s.issue}` : '', s.year, s.pages ? `pp. ${s.pages}` : ''].filter(Boolean).join(', ')}.${bare ? ` ${bare}.` : ''}`;
    else if (s.type === 'website') text = `${head}"${end(t)}" ${s.container ? `${I(s.container)}, ` : ''}${date}${bare ? `, ${bare}` : ''}.${s.accessed ? ` Accessed ${s.accessed}.` : ''}`;
    else if (s.type === 'report') text = `${head}${I(t)}. ${[s.publisher, s.year].filter(Boolean).join(', ')}.${bare ? ` ${bare}.` : ''}`;
    else if (s.type === 'chapter' || s.type === 'conference') text = `${head}"${end(t)}" ${I(s.container)}, ${[s.publisher, s.year, s.pages ? `pp. ${s.pages}` : ''].filter(Boolean).join(', ')}.${bare ? ` ${bare}.` : ''}`;
    else if (s.type === 'newspaper') text = `${head}"${end(t)}" ${I(s.container)}, ${date}${s.pages ? `, p. ${s.pages}` : ''}.${bare ? ` ${bare}.` : ''}`;
    else if (s.type === 'thesis') text = `${head}${I(t)}. ${[s.year, s.publisher, s.number || 'PhD dissertation'].filter(Boolean).join(', ')}.`;
    else text = `${head}${I(t)}. ${[nth ? `${nth} ed.` : '', s.publisher, s.year].filter(Boolean).join(', ')}.`;
  } else if (style === 'chicago') {
    const who = chicagoNames(s.authors);
    const head = `${who ? `${end(who)} ` : ''}${s.year || 'n.d.'}. `;
    const where = s.place && s.publisher ? `${s.place}: ${s.publisher}` : s.publisher || s.place;
    if (s.type === 'article') text = `${head}"${end(t)}" ${I(s.container)}${s.volume ? ` ${s.volume}` : ''}${s.issue ? ` (${s.issue})` : ''}${s.pages ? `: ${s.pages}` : ''}.${link ? ` ${link}.` : ''}`;
    else if (s.type === 'website') text = `${head}"${end(t)}" ${s.container ? `${end(s.container)} ` : ''}${s.month ? `${monthName(s.month)}${s.day ? ` ${s.day}` : ''}, ${s.year}. ` : ''}${link ? `${link}.` : ''}`;
    else if (s.type === 'report') text = `${head}${I(t)}.${where ? ` ${end(where)}` : ''}${link ? ` ${link}.` : ''}`;
    else if (s.type === 'chapter' || s.type === 'conference') text = `${head}"${end(t)}" In ${I(s.container)}${s.pages ? `, ${s.pages}` : ''}.${where ? ` ${end(where)}` : ''}${link ? ` ${link}.` : ''}`;
    else if (s.type === 'newspaper') text = `${head}"${end(t)}" ${I(s.container)}${s.month ? `, ${monthName(s.month)}${s.day ? ` ${s.day}` : ''}` : ''}.${link ? ` ${link}.` : ''}`;
    else if (s.type === 'thesis') text = `${head}"${end(t)}" ${[s.number || 'PhD diss.', s.publisher].filter(Boolean).join(', ')}.`;
    else text = `${head}${I(t)}.${nth ? ` ${nth} ed.` : ''}${where ? ` ${end(where)}` : ''}`;
  } else {
    const who = ieeeNames(s.authors);
    const head = who ? `${who}, ` : '';
    const mon = s.month ? `${monthName(s.month).slice(0, 3)}. ` : '';
    if (s.type === 'article') text = `${head}"${t}," ${I(s.container)}${s.volume ? `, vol. ${s.volume}` : ''}${s.issue ? `, no. ${s.issue}` : ''}${s.pages ? `, pp. ${s.pages}` : ''}, ${mon}${s.year}${s.doi ? `, doi: ${s.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : ''}.`;
    else if (s.type === 'website') text = `${head}"${t}," ${s.container ? end(s.container) : ''}${tail}${s.accessed ? ` (accessed ${s.accessed}).` : ''}`;
    else if (s.type === 'report') text = `${head}"${t}," ${[s.publisher, s.place, s.number ? `Rep. ${s.number}` : '', s.year].filter(Boolean).join(', ')}.${tail}`;
    else if (s.type === 'chapter') text = `${head}"${t}," in ${I(s.container)}. ${s.place && s.publisher ? `${s.place}: ${s.publisher}` : s.publisher || s.place}${s.year ? `, ${s.year}` : ''}${s.pages ? `, pp. ${s.pages}` : ''}.`;
    else if (s.type === 'conference') text = `${head}"${t}," in ${I(s.container)}${s.place ? `, ${s.place}` : ''}${s.year ? `, ${s.year}` : ''}${s.pages ? `, pp. ${s.pages}` : ''}.${tail}`;
    else if (s.type === 'newspaper') text = `${head}"${t}," ${I(s.container)}, ${mon}${s.day ? `${s.day}, ` : ''}${s.year}.${tail}`;
    else if (s.type === 'thesis') text = `${head}"${t}," ${[s.number || 'Ph.D. dissertation', s.publisher, s.place, s.year].filter(Boolean).join(', ')}.`;
    else text = `${head}${I(t)}${nth ? `, ${nth} ed` : ''}. ${s.place && s.publisher ? `${s.place}: ${s.publisher}` : s.publisher || s.place}${s.year ? `, ${s.year}` : ''}.`;
  }
  return { text: text.replace(/\s+/g, ' ').replace(/\.\./g, '.').replace(/ ,/g, ',').replace(/, \./g, '.').trim(), em };
}
