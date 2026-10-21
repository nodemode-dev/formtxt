import type { DocEditor } from '../../editor';
import { blankPage, currentPage, flowPage, pageBuilder, planPages, type PrintPlan } from './pages';
import { parseRange, sheetOrder, type PrintOptions } from './ranges';
import type { PrintJob } from './run';

export interface JobInfo {
  job: PrintJob;
  pages: number;
  sheets: number;
  total: number;
}

export function defaultOptions(): PrintOptions {
  return { range: 'all', pages: '', copies: 1, collate: true, sides: 'one' };
}

export function selectedPages(ed: DocEditor, plan: PrintPlan, opts: PrintOptions): { pages: number[]; error: string } {
  const total = plan.sheets.length;
  if (opts.range === 'current') return { pages: [currentPage(ed, plan)], error: '' };
  if (opts.range === 'custom') return parseRange(opts.pages, total);
  return { pages: Array.from({ length: total }, (_, i) => i), error: '' };
}

export function buildJob(ed: DocEditor, opts: PrintOptions): JobInfo {
  const plan = planPages(ed);
  if (!plan || !ed.view) throw new Error('Open a document first.');
  const copies = Math.max(1, Math.min(99, Math.floor(opts.copies) || 1));
  if (opts.range === 'selection' || plan.mode === 'flow') {
    if (opts.range === 'selection' && ed.view.state.selection.empty) throw new Error('Select some text first, or choose another range.');
    if (plan.mode === 'flow' && opts.range === 'current') throw new Error('This view has no fixed pages, so only the whole document or a selection can be printed.');
    if (plan.mode === 'flow' && opts.range === 'custom') throw new Error('This view has no fixed pages, so only the whole document or a selection can be printed.');
    const one = flowPage(ed, plan, opts.range === 'selection');
    if (!one) throw new Error('Nothing to print.');
    const pages = Array.from({ length: copies }, (_, i) => (i === 0 ? one : (one.cloneNode(true) as HTMLElement)));
    return { job: { pages, flow: plan.first }, pages: 1, sheets: copies, total: 1 };
  }
  const builder = pageBuilder(ed, plan);
  if (!builder) throw new Error('Nothing to print.');
  const picked = selectedPages(ed, plan, opts);
  if (picked.error) throw new Error(picked.error);
  const order = sheetOrder(picked.pages, { ...opts, copies });
  const built = new Map<number, HTMLElement>();
  const last = plan.sheets[picked.pages[picked.pages.length - 1] ?? 0] ?? null;
  const pages = order.map((index) => {
    if (index === null) return blankPage(last, { w: plan.first.page.width * (96 / 72), h: plan.first.page.height * (96 / 72) });
    let el = built.get(index);
    if (!el) { el = builder.build(index); built.set(index, el); return el; }
    return el.cloneNode(true) as HTMLElement;
  });
  return { job: { pages, flow: null }, pages: picked.pages.length, sheets: order.length, total: plan.sheets.length };
}
