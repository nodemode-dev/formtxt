export interface RangeResult { pages: number[]; error: string }

export type RangeKind = 'all' | 'current' | 'selection' | 'custom' | 'odd' | 'even';
export type SidesKind = 'one' | 'two' | 'manual';
export type PerSheet = 1 | 2 | 4;
export type OrientKind = 'doc' | 'portrait' | 'landscape';
export type MarginKind = 'doc' | 'normal';

export interface PrintOptions {
  range: RangeKind;
  pages: string;
  copies: number;
  collate: boolean;
  sides: SidesKind;
  perSheet: PerSheet;
  paper: string;
  orient: OrientKind;
  margins: MarginKind;
}

export interface PaperSize { id: string; label: string; w: number; h: number }

export const PAPERS: PaperSize[] = [
  { id: 'letter', label: 'Letter (8.5 x 11 in)', w: 816, h: 1056 },
  { id: 'legal', label: 'Legal (8.5 x 14 in)', w: 816, h: 1344 },
  { id: 'executive', label: 'Executive (7.25 x 10.5 in)', w: 696, h: 1008 },
  { id: 'tabloid', label: 'Tabloid (11 x 17 in)', w: 1056, h: 1632 },
  { id: 'a3', label: 'A3 (297 x 420 mm)', w: 1122.52, h: 1587.4 },
  { id: 'a4', label: 'A4 (210 x 297 mm)', w: 793.7, h: 1122.52 },
  { id: 'a5', label: 'A5 (148 x 210 mm)', w: 559.37, h: 793.7 },
  { id: 'b5', label: 'B5 (176 x 250 mm)', w: 665.19, h: 944.88 },
];

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

export type SheetSlot = number[] | null;

export function groupSheets(selected: number[], perSheet: PerSheet): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < selected.length; i += perSheet) out.push(selected.slice(i, i + perSheet));
  return out;
}

export interface SheetRun { first: SheetSlot[]; second: SheetSlot[] | null }

export function sheetRun(selected: number[], opts: PrintOptions): SheetRun {
  const copies = Math.max(1, Math.min(99, Math.floor(opts.copies) || 1));
  const units = groupSheets(selected, opts.perSheet);
  const collate = opts.sides === 'one' ? opts.collate : true;
  let seq: SheetSlot[];
  if (collate) {
    const one = [...units] as SheetSlot[];
    if (opts.sides !== 'one' && one.length % 2 === 1) one.push(null);
    seq = Array.from({ length: copies }, () => one).flat();
  } else {
    seq = units.flatMap((u) => Array.from({ length: copies }, () => u));
  }
  if (opts.sides !== 'manual') return { first: seq, second: null };
  const fronts: SheetSlot[] = [];
  const backs: SheetSlot[] = [];
  seq.forEach((s, i) => (i % 2 === 0 ? fronts : backs).push(s));
  return { first: fronts, second: backs.reverse() };
}
