import { PAPERS, type PerSheet, type PrintOptions } from './ranges';
import type { PageBuilder, PrintPlan } from './pages';

export interface Box { x: number; y: number; w: number; h: number }

const IN = 96;

export function sheetSize(pageW: number, pageH: number, opts: PrintOptions): { w: number; h: number } {
  const paper = PAPERS.find((p) => p.id === opts.paper);
  let w = paper ? paper.w : pageW;
  let h = paper ? paper.h : pageH;
  const landscape = opts.orient === 'doc' ? pageW > pageH : opts.orient === 'landscape';
  if (landscape !== w > h) [w, h] = [h, w];
  return { w, h };
}

export function cells(w: number, h: number, n: PerSheet): Box[] {
  if (n === 1) return [{ x: 0, y: 0, w, h }];
  if (n === 2) return [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }];
  return [{ x: 0, y: 0, w: w / 2, h: h / 2 }, { x: w / 2, y: 0, w: w / 2, h: h / 2 }, { x: 0, y: h / 2, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }];
}

export function place(page: { w: number; h: number; text: Box }, cell: Box, opts: PrintOptions, n: PerSheet): { s: number; x: number; y: number } {
  if (opts.margins === 'normal') {
    const inset = (n === 1 ? 1 : 0.5) * IN;
    const t: Box = { x: cell.x + inset, y: cell.y + inset, w: Math.max(40, cell.w - inset * 2), h: Math.max(40, cell.h - inset * 2) };
    const s = Math.min(1, t.w / page.text.w, t.h / page.text.h);
    return { s, x: t.x + t.w / 2 - (page.text.x + page.text.w / 2) * s, y: t.y + t.h / 2 - (page.text.y + page.text.h / 2) * s };
  }
  const s = Math.min(1, cell.w / page.w, cell.h / page.h);
  return { s, x: cell.x + (cell.w - page.w * s) / 2, y: cell.y + (cell.h - page.h * s) / 2 };
}

export function textBox(plan: PrintPlan, index: number): { w: number; h: number; text: Box } {
  const sp = plan.sheets[index];
  const m = sp.section.margins;
  const k = IN / 72;
  const l = m.left * k, r = m.right * k, t = m.top * k, b = m.bottom * k;
  return { w: sp.width, h: sp.height, text: { x: l, y: t, w: Math.max(40, sp.width - l - r), h: Math.max(40, sp.height - t - b) } };
}

export function composeSheet(builder: PageBuilder, slot: number[] | null, opts: PrintOptions, like: number): HTMLElement {
  const plan = builder.plan;
  const ref = slot && slot.length ? slot[0] : like;
  const sp = plan.sheets[ref];
  const size = sheetSize(sp.width, sp.height, opts);
  const out = document.createElement('div');
  out.className = 'ft-print-page ft-print-sheetbox';
  out.style.width = `${size.w}px`;
  out.style.height = `${size.h}px`;
  if (!slot) {
    out.classList.add('ft-print-blank');
    return out;
  }
  const n = opts.perSheet;
  const grid = cells(size.w, size.h, n);
  slot.forEach((pi, i) => {
    const t = textBox(plan, pi);
    const at = place(t, grid[i], opts, n);
    const holder = document.createElement('div');
    holder.className = 'ft-print-cell';
    holder.style.width = `${t.w}px`;
    holder.style.height = `${t.h}px`;
    holder.style.transform = `translate(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px) scale(${at.s.toFixed(5)})`;
    holder.appendChild(builder.build(pi));
    out.appendChild(holder);
  });
  return out;
}
