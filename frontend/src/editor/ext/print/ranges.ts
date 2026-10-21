export interface RangeResult { pages: number[]; error: string }

export function parseRange(text: string, total: number): RangeResult {
  const pages = new Set<number>();
  const parts = text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { pages: [], error: 'Type the pages to print, such as 1-3, 5.' };
  for (const part of parts) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let a: number, b: number;
    if (m && (m[1] || m[2])) {
      a = m[1] ? Number(m[1]) : 1;
      b = m[2] ? Number(m[2]) : total;
    } else if (/^\d+$/.test(part)) {
      a = b = Number(part);
    } else {
      return { pages: [], error: `"${part}" is not a page or a range.` };
    }
    if (a < 1 || b < 1) return { pages: [], error: 'Pages start at 1.' };
    if (a > b) return { pages: [], error: `The range ${part} runs backwards.` };
    if (a > total) return { pages: [], error: `The document has ${total} ${total === 1 ? 'page' : 'pages'}; ${part} is past the end.` };
    for (let p = a; p <= Math.min(b, total); p++) pages.add(p - 1);
  }
  return { pages: Array.from(pages).sort((x, y) => x - y), error: '' };
}

export interface PrintOptions {
  range: 'all' | 'current' | 'selection' | 'custom';
  pages: string;
  copies: number;
  collate: boolean;
  sides: 'one' | 'two';
}

export function sheetOrder(selected: number[], opts: PrintOptions): Array<number | null> {
  const copies = Math.max(1, Math.min(99, Math.floor(opts.copies) || 1));
  const collate = opts.sides === 'two' ? true : opts.collate;
  const one = [...selected] as Array<number | null>;
  if (opts.sides === 'two' && one.length % 2 === 1) one.push(null);
  if (collate) return Array.from({ length: copies }, () => one).flat();
  return one.flatMap((p) => Array.from({ length: copies }, () => p));
}
