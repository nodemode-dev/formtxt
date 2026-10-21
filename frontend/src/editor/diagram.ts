import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { NodeView } from 'prosemirror-view';
import { escapeHtml } from '../ui/dom';
import { schema } from './schema';
import { shapePath } from './shape';

const PX = 96 / 72;

export interface DiagramItem { text: string; children?: DiagramItem[] }
export interface LayoutInfo { id: string; label: string; category: string; tree?: boolean }

export const DIAGRAM_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'list', label: 'List' }, { id: 'process', label: 'Process' }, { id: 'cycle', label: 'Cycle' }, { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'relationship', label: 'Relationship' }, { id: 'matrix', label: 'Matrix' }, { id: 'pyramid', label: 'Pyramid' }, { id: 'timeline', label: 'Timeline' },
];
export const DIAGRAM_LAYOUTS: LayoutInfo[] = [
  { id: 'list-block', label: 'Basic block list', category: 'list' }, { id: 'list-vertical', label: 'Vertical bullet list', category: 'list' },
  { id: 'process-basic', label: 'Basic process', category: 'process' }, { id: 'process-chevron', label: 'Chevron process', category: 'process' },
  { id: 'cycle-basic', label: 'Basic cycle', category: 'cycle' }, { id: 'cycle-radial', label: 'Radial cycle', category: 'cycle' },
  { id: 'hier-org', label: 'Organization chart', category: 'hierarchy', tree: true }, { id: 'hier-horizontal', label: 'Horizontal hierarchy', category: 'hierarchy', tree: true },
  { id: 'rel-venn', label: 'Basic Venn', category: 'relationship' }, { id: 'matrix-basic', label: 'Basic matrix', category: 'matrix' },
  { id: 'pyramid-basic', label: 'Basic pyramid', category: 'pyramid' }, { id: 'timeline-basic', label: 'Basic timeline', category: 'timeline' },
];
export const DIAGRAM_STYLES = ['flat', 'outline', 'shadow'] as const;
export const DIAGRAM_COLORS = ['colorful', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'dark'] as const;
const PALETTE = ['', '#2563eb', '#0f766e', '#b45309', '#7c3aed', '#e11d48'];
const INK = '#1d1c1a', MUTED = '#57534e';

const mk = (texts: Array<string | [string, string[]]>): DiagramItem[] => texts.map((t) => (typeof t === 'string' ? { text: t } : { text: t[0], children: t[1].map((c) => ({ text: c })) }));

export function sampleItems(layout: string): DiagramItem[] {
  switch (layout) {
    case 'list-vertical': return mk([['Plan', ['Scope the work', 'Set the budget']], ['Build', ['Ship weekly']], ['Launch', ['Announce', 'Measure']]]);
    case 'process-basic': case 'process-chevron': return mk(['Plan', 'Build', 'Test', 'Launch']);
    case 'cycle-basic': return mk(['Plan', 'Do', 'Check', 'Act']);
    case 'cycle-radial': return mk(['Core', 'Speed', 'Quality', 'Cost', 'Reach']);
    case 'hier-org': case 'hier-horizontal': return [{ text: 'CEO', children: [{ text: 'Product', children: [{ text: 'Design' }, { text: 'Engineering' }] }, { text: 'Sales' }, { text: 'Finance' }] }];
    case 'rel-venn': return mk(['Design', 'Code', 'Data']);
    case 'matrix-basic': return mk(['Strengths', 'Weaknesses', 'Opportunities', 'Threats']);
    case 'pyramid-basic': return mk(['Vision', 'Strategy', 'Tactics', 'Execution']);
    case 'timeline-basic': return mk([['2023', ['Founded']], ['2024', ['First release']], ['2025', ['Series A']], ['2026', ['Global launch']]]);
    default: return mk(['First', 'Second', 'Third', 'Fourth']);
  }
}

export function itemsToText(items: DiagramItem[], lvl = 0): string {
  return items.map((it) => `${'  '.repeat(lvl)}${it.text}${it.children?.length ? `\n${itemsToText(it.children, lvl + 1)}` : ''}`).join('\n');
}

export function textToItems(text: string): DiagramItem[] {
  const root: DiagramItem[] = [];
  const stack: DiagramItem[][] = [root];
  let prev = -1;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = /^([ \t]*)(?:[-*•]\s+)?(.*)$/.exec(raw)!;
    const width = m[1].replace(/\t/g, '  ').length;
    const lvl = Math.max(0, Math.min(Math.floor(width / 2), prev + 1));
    const it: DiagramItem = { text: m[2].trim() };
    stack.length = lvl + 1;
    stack[lvl].push(it);
    stack[lvl + 1] = (it.children = []);
    prev = lvl;
  }
  const prune = (list: DiagramItem[]): void => { for (const it of list) { if (it.children && !it.children.length) delete it.children; else if (it.children) prune(it.children); } };
  prune(root);
  return root;
}

interface TLine { t: string; lvl: number }
interface Box { key: string; geom: string; x: number; y: number; w: number; h: number; fill: string; stroke: string; sw: number; opacity: number; rot: number; shadow: boolean; lines?: TLine[]; ink: string; align: 'l' | 'c'; anchor: 't' | 'm' | 'b'; max: number; bold: boolean; inset: [number, number, number, number] }
interface Ctx { f: { x: number; y: number; w: number; h: number }; style: string; colors: string; accent: string; out: Box[] }

const r2 = (v: number): number => Math.round(v * 100) / 100;

function hex(c: string): [number, number, number] { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function toHex([r, g, b]: number[]): string { return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`; }
function mix(a: string, b: string, t: number): string { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
function luminance(c: string): number { const [r, g, b] = hex(c).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function base(ctx: Ctx, i: number): string { const p = PALETTE[i % 6]; return p || ctx.accent; }

function pick(ctx: Ctx, i: number, s: number): string {
  if (ctx.colors === 'colorful') return base(ctx, i);
  const b = ctx.colors === 'dark' ? '#334155' : base(ctx, Math.max(0, DIAGRAM_COLORS.indexOf(ctx.colors as never) - 1));
  return s <= 0.5 ? mix(b, '#000000', 0.3 - 0.6 * s) : mix(b, '#ffffff', (s - 0.5) * 0.7);
}

const lighter = (c: string, a = 0.8): string => mix(c, '#ffffff', a);

interface NodeOpt { geom?: string; rot?: number; color: string; lines?: TLine[]; inset?: [number, number, number, number]; align?: 'l' | 'c'; anchor?: 't' | 'm' | 'b'; max?: number; mode?: 'solid' | 'soft' | 'bar' | 'plain'; alpha?: number; ink?: string; bold?: boolean }

function node(ctx: Ctx, key: string, x: number, y: number, w: number, h: number, o: NodeOpt): void {
  const mode = o.mode ?? 'solid';
  let fill = o.color, stroke = '', sw = 0, ink = o.ink ?? INK, shadow = false;
  if (mode === 'bar') { ink = INK; }
  else if (mode === 'plain') { fill = ''; ink = o.ink ?? INK; }
  else if (mode === 'soft') { fill = lighter(o.color); if (ctx.style === 'outline') { stroke = o.color; sw = 1.5; } ink = INK; }
  else if (ctx.style === 'outline') { fill = ''; stroke = o.color; sw = 2.25; ink = o.ink ?? INK; }
  else { ink = o.ink ?? (luminance(o.color) > 0.4 ? INK : '#ffffff'); shadow = ctx.style === 'shadow'; }
  ctx.out.push({ key, geom: o.geom ?? 'rect', x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill, stroke, sw, opacity: o.alpha ?? 1, rot: o.rot ?? 0, shadow, lines: o.lines, ink, align: o.align ?? 'c', anchor: o.anchor ?? 'm', max: o.max ?? 20, bold: !!o.bold, inset: o.inset ?? [6, 4, 6, 4] });
}

function bar(ctx: Ctx, key: string, x1: number, y1: number, x2: number, y2: number, color: string, t = 1.5): void {
  const vert = Math.abs(x1 - x2) < 0.01;
  node(ctx, key, vert ? x1 - t / 2 : Math.min(x1, x2), vert ? Math.min(y1, y2) : y1 - t / 2, vert ? t : Math.abs(x2 - x1), vert ? Math.abs(y2 - y1) : t, { color, mode: 'bar' });
}

function seg(ctx: Ctx, key: string, x1: number, y1: number, x2: number, y2: number, color: string): void {
  ctx.out.push({ key, geom: `line:${r2(x1)},${r2(y1)},${r2(x2)},${r2(y2)}`, x: 0, y: 0, w: 0, h: 0, fill: '', stroke: color, sw: 2, opacity: 1, rot: 0, shadow: false, ink: INK, align: 'c', anchor: 'm', max: 0, bold: false, inset: [0, 0, 0, 0] });
}

const flatLines = (it: DiagramItem): TLine[] => {
  const out: TLine[] = [{ t: it.text, lvl: 0 }];
  const walk = (list: DiagramItem[], lvl: number): void => { for (const c of list) { out.push({ t: c.text, lvl }); if (c.children) walk(c.children, lvl + 1); } };
  walk(it.children ?? [], 1);
  return out;
};
const share = (n: number, i: number): number => (n > 1 ? i / (n - 1) : 0.5);

function layoutBlock(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 12;
  let best = 1, bs = Infinity;
  for (let c = 1; c <= n; c++) { const rows = Math.ceil(n / c); const cw = (w - (c - 1) * g) / c, ch = (h - (rows - 1) * g) / rows; const sc = Math.abs(Math.log(cw / ch / 1.6)); if (sc < bs) { bs = sc; best = c; } }
  const cols = best, rows = Math.ceil(n / cols);
  const cw = (w - (cols - 1) * g) / cols, ch = Math.min((h - (rows - 1) * g) / rows, cw * 0.9);
  const top = y + (h - (rows * ch + (rows - 1) * g)) / 2;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = Math.min(cols, n - r * cols);
    const left = x + (w - (inRow * cw + (inRow - 1) * g)) / 2;
    node(ctx, `b${i}`, left + c * (cw + g), top + r * (ch + g), cw, ch, { geom: 'roundRect', color: pick(ctx, i, share(n, i)), lines: flatLines(it) });
  });
}

function layoutVertical(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 10, rh = Math.min((h - (n - 1) * g) / n, 120);
  const top = y + (h - (n * rh + (n - 1) * g)) / 2;
  items.forEach((it, i) => {
    const color = pick(ctx, i, share(n, i));
    const rows = flatLines(it).slice(1);
    const hw = rows.length ? w * 0.34 : w;
    const yy = top + i * (rh + g);
    node(ctx, `v${i}`, x, yy, hw, rh, { geom: 'roundRect', color, lines: [{ t: it.text, lvl: 0 }] });
    if (rows.length) node(ctx, `v${i}b`, x + hw + 6, yy, w - hw - 6, rh, { geom: 'rect', color, mode: 'soft', lines: rows, align: 'l', max: 18, inset: [10, 4, 8, 4] });
  });
}

function layoutProcess(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, pad = 6;
  const bw = (w - 2 * pad * (n - 1)) / (n + 0.28 * (n - 1));
  const aw = bw * 0.28, bh = Math.min(h, Math.max(bw * 0.9, 90));
  const top = y + (h - bh) / 2;
  items.forEach((it, i) => {
    const color = pick(ctx, i, share(n, i));
    const bx = x + i * (bw + aw + 2 * pad);
    node(ctx, `p${i}`, bx, top, bw, bh, { geom: 'roundRect', color, lines: flatLines(it) });
    if (i < n - 1) { const ah = Math.min(bh * 0.4, aw * 1.2); node(ctx, `p${i}a`, bx + bw + pad, top + (bh - ah) / 2, aw, ah, { geom: 'arrowRight', color: lighter(color, 0.45), mode: 'bar' }); }
  });
}

function layoutChevron(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, gap = 6;
  const ch = Math.min(h, (w / n) * 0.62);
  const d = ch * 0.4;
  const cw = (w + (n - 1) * (d - gap)) / n;
  const top = y + (h - ch) / 2;
  items.forEach((it, i) => {
    node(ctx, `c${i}`, x + i * (cw - d + gap), top, cw, ch, { geom: i === 0 ? 'homePlate' : 'chevron', color: pick(ctx, i, share(n, i)), lines: flatLines(it), max: 18, inset: [i === 0 ? 6 : d * 0.8, 3, d * 0.6, 3] });
  });
}

function layoutCycle(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, side = Math.min(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  let nd = Math.min(side * 0.32, 150);
  if (n > 1) nd = Math.min(nd, ((Math.PI * (side - nd)) / n) * 0.8);
  nd = Math.max(nd, 48);
  const Rx = (w - nd) / 2, Ry = (h - nd) / 2;
  const ang = (i: number): number => (2 * Math.PI * i) / n;
  items.forEach((it, i) => {
    const t = ang(i);
    const px = n === 1 ? cx : cx + Rx * Math.sin(t), py = n === 1 ? cy : cy - Ry * Math.cos(t);
    node(ctx, `y${i}`, px - nd / 2, py - nd / 2, nd, nd, { geom: 'ellipse', color: pick(ctx, i, share(n, i)), lines: flatLines(it), max: 16, inset: [3, 3, 3, 3] });
  });
  if (n < 2) return;
  items.forEach((_it, i) => {
    const t = ang(i) + Math.PI / n;
    const px = cx + Rx * Math.sin(t), py = cy - Ry * Math.cos(t);
    const tang = Math.atan2(Ry * Math.sin(t), Rx * Math.cos(t));
    const aw = Math.min(nd * 0.4, 36), ah = aw * 0.8;
    node(ctx, `y${i}a`, px - aw / 2, py - ah / 2, aw, ah, { geom: 'arrowRight', rot: (tang * 180) / Math.PI, color: lighter(pick(ctx, i, share(n, i)), 0.45), mode: 'bar' });
  });
}

function layoutRadial(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length - 1, side = Math.min(w, h);
  const cx = x + w / 2, cy = y + h / 2;
  let nd = Math.min(side * 0.26, 120);
  if (n > 1) nd = Math.min(nd, ((Math.PI * (side - nd)) / n) * 0.8);
  nd = Math.max(nd, 44);
  const cd = Math.min(nd * 1.35, side * 0.34);
  const Rx = (w - nd) / 2, Ry = (h - nd) / 2;
  items.slice(1).forEach((_it, k) => { const t = (2 * Math.PI * k) / n; seg(ctx, `r${k}l`, cx, cy, cx + Rx * Math.sin(t), cy - Ry * Math.cos(t), lighter(pick(ctx, k + 1, (k + 1) / Math.max(1, n)), 0.3)); });
  node(ctx, 'r0', cx - cd / 2, cy - cd / 2, cd, cd, { geom: 'ellipse', color: pick(ctx, 0, 0), lines: flatLines(items[0]), max: 18, inset: [3, 3, 3, 3] });
  items.slice(1).forEach((it, k) => {
    const t = (2 * Math.PI * k) / n;
    node(ctx, `r${k + 1}`, cx + Rx * Math.sin(t) - nd / 2, cy - Ry * Math.cos(t) - nd / 2, nd, nd, { geom: 'ellipse', color: pick(ctx, k + 1, (k + 1) / Math.max(1, n)), lines: flatLines(it), max: 15, inset: [3, 3, 3, 3] });
  });
}

interface TNode { item: DiagramItem; key: string; depth: number; c: number; kids: TNode[] }

function place(items: DiagramItem[], depth: number, cursor: { v: number }, prefix: string): TNode[] {
  return items.map((item, i) => {
    const key = `${prefix}${i}`;
    const kids = item.children?.length ? place(item.children, depth + 1, cursor, `${key}.`) : [];
    let c: number;
    if (!kids.length) { c = cursor.v + 0.5; cursor.v += 1; } else c = (kids[0].c + kids[kids.length - 1].c) / 2;
    return { item, key, depth, c, kids };
  });
}

function layoutTree(ctx: Ctx, items: DiagramItem[], horizontal: boolean): void {
  const { x, y, w, h } = ctx.f;
  const cursor = { v: 0 };
  const roots = place(items, 0, cursor, 't');
  const leaves = Math.max(1, cursor.v);
  let maxD = 0;
  const walk = (t: TNode): void => { maxD = Math.max(maxD, t.depth); t.kids.forEach(walk); };
  roots.forEach(walk);
  const levels = maxD + 1;
  const along = horizontal ? w : h, across = horizontal ? h : w;
  const lev = along / levels, slot = across / leaves;
  const nAlong = horizontal ? Math.min(lev * 0.62, 170) : Math.min(lev * 0.58, 64);
  const nAcross = horizontal ? Math.min(slot * 0.8, 52) : Math.min(slot * 0.86, 170);
  const depthEdge = (depth: number, edge: 'in' | 'out'): number => depth * lev + (lev - nAlong) / 2 + (edge === 'in' ? 0 : nAlong);
  const P = (depth: number, c: number, edge: 'in' | 'out'): [number, number] => { const a = depthEdge(depth, edge); const b = c * slot; return horizontal ? [x + a, y + b] : [x + b, y + a]; };
  const col = MUTED;
  const connect = (t: TNode): void => {
    if (!t.kids.length) return;
    const [px, py] = P(t.depth, t.c, 'out');
    const midA = (depthEdge(t.depth, 'out') + depthEdge(t.depth + 1, 'in')) / 2;
    const first = t.kids[0], last = t.kids[t.kids.length - 1];
    if (horizontal) {
      const mx = x + midA;
      bar(ctx, `${t.key}dn`, px, py, mx, py, col);
      if (t.kids.length > 1) bar(ctx, `${t.key}bus`, mx, y + first.c * slot, mx, y + last.c * slot, col);
      for (const k of t.kids) bar(ctx, `${k.key}up`, mx, y + k.c * slot, P(k.depth, k.c, 'in')[0], y + k.c * slot, col);
    } else {
      const my = y + midA;
      bar(ctx, `${t.key}dn`, px, py, px, my, col);
      if (t.kids.length > 1) bar(ctx, `${t.key}bus`, x + first.c * slot, my, x + last.c * slot, my, col);
      for (const k of t.kids) bar(ctx, `${k.key}up`, x + k.c * slot, my, x + k.c * slot, P(k.depth, k.c, 'in')[1], col);
    }
    t.kids.forEach(connect);
  };
  roots.forEach(connect);
  const draw = (t: TNode): void => {
    const [ax, ay] = P(t.depth, t.c, 'in');
    const nx = horizontal ? ax : x + t.c * slot - nAcross / 2, ny = horizontal ? y + t.c * slot - nAcross / 2 : ay;
    node(ctx, t.key, nx, ny, horizontal ? nAlong : nAcross, horizontal ? nAcross : nAlong, { geom: 'roundRect', color: pick(ctx, t.depth, levels > 1 ? t.depth / (levels - 1) : 0.5), lines: [{ t: t.item.text, lvl: 0 }], max: 16 });
    t.kids.forEach(draw);
  };
  roots.forEach(draw);
}

function layoutVenn(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, cx = x + w / 2, cy = y + h / 2;
  if (n === 3) {
    const d = Math.min(w / 1.62, h / 1.54);
    const s = 0.62 * d;
    const pts: Array<[number, number, [number, number, number, number], 't' | 'm']> = [
      [cx, cy - s / Math.sqrt(3) + s * 0.1, [d * 0.2, d * 0.1, d * 0.2, d * 0.42], 't'],
      [cx - s / 2, cy + s / (2 * Math.sqrt(3)) + s * 0.1, [d * 0.1, d * 0.2, d * 0.4, d * 0.1], 'm'],
      [cx + s / 2, cy + s / (2 * Math.sqrt(3)) + s * 0.1, [d * 0.4, d * 0.2, d * 0.1, d * 0.1], 'm'],
    ];
    items.forEach((it, i) => node(ctx, `n${i}`, pts[i][0] - d / 2, pts[i][1] - d / 2, d, d, { geom: 'ellipse', color: pick(ctx, i, i / 2), alpha: 0.6, ink: INK, lines: flatLines(it), inset: pts[i][2], anchor: pts[i][3], max: 16 }));
    return;
  }
  const step = 0.6;
  const d = Math.min(h, w / (1 + (n - 1) * step));
  const total = d + (n - 1) * step * d;
  items.forEach((it, i) => {
    const pad = d * 0.2;
    node(ctx, `n${i}`, x + (w - total) / 2 + i * step * d, cy - d / 2, d, d, { geom: 'ellipse', color: pick(ctx, i, share(n, i)), alpha: 0.6, ink: INK, lines: flatLines(it), max: 16, inset: [(i > 0 ? d * 0.22 : 0) + pad * 0.3, 4, (i < n - 1 ? d * 0.22 : 0) + pad * 0.3, 4] });
  });
}

function layoutMatrix(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 6;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const cw = (w - (cols - 1) * g) / cols, ch = (h - (rows - 1) * g) / rows;
  items.forEach((it, i) => { const r = Math.floor(i / cols), c = i % cols; node(ctx, `m${i}`, x + c * (cw + g), y + r * (ch + g), cw, ch, { color: pick(ctx, i, share(n, i)), lines: flatLines(it), max: 22 }); });
}

function layoutPyramid(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, g = 3;
  const pw = Math.min(w, h * 1.7), lh = (h - (n - 1) * g) / n;
  const px = x + (w - pw) / 2;
  items.forEach((it, i) => {
    const wi = (pw * (i + 1)) / n;
    const color = pick(ctx, i, share(n, i));
    const yy = y + i * (lh + g);
    node(ctx, `y${i}`, px + (pw - wi) / 2, yy, wi, lh, i === 0 ? { geom: 'triangle', color, lines: flatLines(it), max: 14, inset: [wi * 0.25, lh * 0.35, wi * 0.25, 0] } : { geom: `trapezoid:${pw / (2 * n)}`, color, lines: flatLines(it), max: 18, inset: [pw / (2 * n), 2, pw / (2 * n), 2] });
  });
}

function layoutTimeline(ctx: Ctx, items: DiagramItem[]): void {
  const { x, y, w, h } = ctx.f;
  const n = items.length, slot = w / n, cy = y + h / 2;
  bar(ctx, 'axis', x, cy, x + w, cy, MUTED, 4);
  const lw = Math.min(slot * 1.8, 230), lh = h / 2 - 34;
  items.forEach((it, i) => {
    const cx = x + (i + 0.5) * slot, up = i % 2 === 0;
    const color = pick(ctx, i, share(n, i));
    const lx = Math.max(x, Math.min(x + w - lw, cx - lw / 2));
    bar(ctx, `l${i}ln`, cx, up ? cy - 22 : cy + 8, cx, up ? cy - 8 : cy + 22, color, 2);
    node(ctx, `l${i}m`, cx - 9, cy - 9, 18, 18, { geom: 'ellipse', color });
    node(ctx, `l${i}`, lx, up ? cy - 22 - lh : cy + 22, lw, lh, { geom: 'rect', color, mode: 'plain', lines: flatLines(it), anchor: up ? 'b' : 't', bold: true, max: 18 });
  });
}

function generate(a: Record<string, unknown>, W: number, H: number, accent: string): Box[] {
  const layout = String(a.layout || 'list-block');
  const info = DIAGRAM_LAYOUTS.find((l) => l.id === layout) ?? DIAGRAM_LAYOUTS[0];
  let items = (Array.isArray(a.items) && a.items.length ? a.items : [{ text: '' }]) as DiagramItem[];
  if (!info.tree && items.length === 1 && (items[0].children?.length ?? 0) > 1) items = items[0].children ?? items;
  const ctx: Ctx = { f: { x: 2, y: 2, w: Math.max(20, W - 4), h: Math.max(20, H - 4) }, style: String(a.style || 'flat'), colors: String(a.colors || 'colorful'), accent, out: [] };
  switch (info.id) {
    case 'list-vertical': layoutVertical(ctx, items); break;
    case 'process-basic': layoutProcess(ctx, items); break;
    case 'process-chevron': layoutChevron(ctx, items); break;
    case 'cycle-basic': layoutCycle(ctx, items); break;
    case 'cycle-radial': layoutRadial(ctx, items); break;
    case 'hier-org': layoutTree(ctx, items, false); break;
    case 'hier-horizontal': layoutTree(ctx, items, true); break;
    case 'rel-venn': layoutVenn(ctx, items); break;
    case 'matrix-basic': layoutMatrix(ctx, items); break;
    case 'pyramid-basic': layoutPyramid(ctx, items); break;
    case 'timeline-basic': layoutTimeline(ctx, items); break;
    default: layoutBlock(ctx, items);
  }
  return ctx.out;
}

function geomPath(b: Box): string {
  if (b.geom.startsWith('line:')) { const [x1, y1, x2, y2] = b.geom.slice(5).split(',').map(Number); return `M${x1},${y1}L${x2},${y2}`; }
  const at = (d: string): string => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, px, py) => `${r2(Number(px) + b.x)},${r2(Number(py) + b.y)}`);
  if (b.geom === 'homePlate') return at(`M0,0L${b.w - b.h * 0.4},0L${b.w},${b.h / 2}L${b.w - b.h * 0.4},${b.h}L0,${b.h}Z`);
  if (b.geom === 'chevron') return at(`M0,0L${b.w - b.h * 0.4},0L${b.w},${b.h / 2}L${b.w - b.h * 0.4},${b.h}L0,${b.h}L${b.h * 0.4},${b.h / 2}Z`);
  if (b.geom.startsWith('trapezoid:')) { const k = Math.min(b.w / 2 - 1, Number(b.geom.slice(10))); return at(`M${k},0L${b.w - k},0L${b.w},${b.h}L0,${b.h}Z`); }
  return at(shapePath(b.geom, b.w, b.h, 0));
}

function fitSize(lines: TLine[], w: number, h: number, max: number): number {
  for (let sz = max; sz > 9; sz -= 1) {
    let tot = 0;
    for (const l of lines) { const s = sz * (l.lvl ? 0.8 : 1); const per = Math.max(1, Math.floor(w / (s * 0.52))); tot += Math.max(1, Math.ceil((l.t.length || 1) / per)) * s * 1.2; }
    if (tot <= h) return sz;
  }
  return 9;
}

export function renderDiagram(svg: SVGSVGElement, text: HTMLElement, a: Record<string, unknown>, accent: string, scale = 1): void {
  const W = Number(a.width) * PX * scale, H = Number(a.height) * PX * scale;
  const boxes = generate(a, W, H, accent);
  svg.setAttribute('viewBox', `0 0 ${r2(W)} ${r2(H)}`);
  svg.setAttribute('width', String(r2(W)));
  svg.setAttribute('height', String(r2(H)));
  svg.innerHTML = boxes.map((b) => {
    const rot = b.rot ? ` transform="rotate(${r2(b.rot)} ${r2(b.x + b.w / 2)} ${r2(b.y + b.h / 2)})"` : '';
    return `<path d="${geomPath(b)}" fill="${b.fill || 'none'}" stroke="${b.stroke || 'none'}" stroke-width="${b.sw}"${b.opacity < 1 ? ` fill-opacity="${b.opacity}"` : ''}${b.shadow ? ' filter="url(#ftds)"' : ''}${rot}/>`;
  }).join('') + (boxes.some((b) => b.shadow) ? '<defs><filter id="ftds" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.25"/></filter></defs>' : '');
  text.innerHTML = boxes.filter((b) => b.lines?.length).map((b) => {
    const [l, t, r, bt] = b.inset;
    const sz = fitSize(b.lines!, Math.max(10, b.w - l - r), Math.max(10, b.h - t - bt), b.max);
    const lines = b.lines!.map((ln) => ln.lvl === 0
      ? `<span class="ft-dg-line" style="font-size:${sz}px;${b.bold ? 'font-weight:700;' : ''}text-align:${b.align === 'l' ? 'left' : 'center'}">${escapeHtml(ln.t)}</span>`
      : `<span class="ft-dg-line ft-dg-sub" style="font-size:${Math.max(9, sz * 0.8)}px;padding-left:${10 + 12 * (ln.lvl - 1)}px">${escapeHtml(ln.t)}</span>`).join('');
    return `<span class="ft-dg-box" style="left:${b.x + l}px;top:${b.y + t}px;width:${Math.max(4, b.w - l - r)}px;height:${Math.max(4, b.h - t - bt)}px;color:${b.ink};justify-content:${b.anchor === 't' ? 'flex-start' : b.anchor === 'b' ? 'flex-end' : 'center'}">${lines}</span>`;
  }).join('');
}

export class DiagramView implements NodeView {
  dom: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly text: HTMLElement;
  private key = '';

  constructor(private node: PMNode, private readonly accent: () => string) {
    this.dom = document.createElement('figure');
    this.dom.className = 'ft-diagram';
    this.dom.setAttribute('contenteditable', 'false');
    this.svg = this.dom.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    this.svg.setAttribute('role', 'img');
    this.text = this.dom.appendChild(document.createElement('div'));
    this.text.className = 'ft-dg-text';
    this.apply();
  }

  private apply(): void {
    const a = this.node.attrs;
    const key = JSON.stringify([a.layout, a.items, a.style, a.colors, a.width, a.height, this.accent()]);
    const align = String(a.align || 'center');
    if (this.dom.dataset.align !== align) this.dom.dataset.align = align;
    const w = `${(Number(a.width) * PX).toFixed(0)}px`, h = `${(Number(a.height) * PX).toFixed(0)}px`;
    if (this.dom.style.width !== w) this.dom.style.width = w;
    if (this.dom.style.height !== h) this.dom.style.height = h;
    const label = `${(DIAGRAM_LAYOUTS.find((l) => l.id === a.layout) ?? DIAGRAM_LAYOUTS[0]).label}: ${itemsToText((a.items ?? []) as DiagramItem[]).replace(/\s*\n\s*/g, ', ')}`;
    if (this.svg.getAttribute('aria-label') !== label) this.svg.setAttribute('aria-label', label);
    if (key === this.key) return;
    this.key = key;
    renderDiagram(this.svg, this.text, a as Record<string, unknown>, this.accent());
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  ignoreMutation(): boolean { return true; }
}

export function selectedDiagram(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.diagram) return { node: sel.node, pos: sel.from };
  return null;
}

export function setDiagram(patch: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const d = selectedDiagram(state);
    if (!d) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(d.pos, undefined, { ...d.node.attrs, ...patch });
      tr.setSelection(NodeSelection.create(tr.doc, d.pos));
      dispatch(tr);
    }
    return true;
  };
}

export function insertDiagram(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.diagram.create(attrs);
    const $from = state.selection.$from;
    const empty = $from.parent.type === schema.nodes.paragraph && !$from.parent.content.size && $from.depth >= 1;
    const tr = state.tr;
    let at: number;
    if (empty) { at = $from.before(); tr.replaceWith(at, $from.after(), [node, schema.nodes.paragraph.create()]); }
    else { at = $from.depth ? $from.after() : state.selection.from; tr.insert(at, [node, schema.nodes.paragraph.create()]); }
    tr.setSelection(NodeSelection.create(tr.doc, at));
    dispatch(tr.scrollIntoView());
    return true;
  };
}
