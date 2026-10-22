import type { Section } from '../../../engine/model';
import type { DocEditor } from '../../editor';
import { composeSheet } from './layout';
import { currentPage, flowPage, pageBuilder, planPages, type PrintPlan } from './pages';
import { PAPERS, parseRange, sheetRun, type PrintOptions, type SheetSlot } from './ranges';
import type { PrintJob } from './run';

export interface JobInfo {
  job: PrintJob;
  second: PrintJob | null;
  pages: number;
  sheets: number;
  total: number;
}

export function defaultOptions(): PrintOptions {
  return { range: 'all', pages: '', copies: 1, collate: true, sides: 'one', perSheet: 1, paper: 'doc', orient: 'doc', margins: 'doc' };
}

export function selectedPages(ed: DocEditor, plan: PrintPlan, opts: PrintOptions): { pages: number[]; error: string } {
  const total = plan.sheets.length;
  const all = Array.from({ length: total }, (_, i) => i);
  if (opts.range === 'current') return { pages: [currentPage(ed, plan)], error: '' };
  if (opts.range === 'custom') return parseRange(opts.pages, total);
  if (opts.range === 'odd') return { pages: all.filter((i) => i % 2 === 0), error: '' };
  if (opts.range === 'even') {
    const pages = all.filter((i) => i % 2 === 1);
    return { pages, error: pages.length ? '' : 'The document has no even pages.' };
  }
  return { pages: all, error: '' };
}

function flowSection(base: Section, opts: PrintOptions): Section {
  const paper = PAPERS.find((p) => p.id === opts.paper);
  let w = paper ? paper.w * 0.75 : base.page.width;
  let h = paper ? paper.h * 0.75 : base.page.height;
  const landscape = opts.orient === 'doc' ? base.page.width > base.page.height : opts.orient === 'landscape';
  if (landscape !== w > h) [w, h] = [h, w];
  const margins = opts.margins === 'normal' ? { ...base.margins, top: 72, right: 72, bottom: 72, left: 72 } : base.margins;
  return { ...base, page: { ...base.page, width: w, height: h }, margins };
}

export function buildJob(ed: DocEditor, opts: PrintOptions): JobInfo {
  const plan = planPages(ed);
  if (!plan || !ed.view) throw new Error('Open a document first.');
  const copies = Math.max(1, Math.min(99, Math.floor(opts.copies) || 1));
  if (opts.range === 'selection' || plan.mode === 'flow') {
    if (opts.range === 'selection' && ed.view.state.selection.empty) throw new Error('Select some text first, or choose another range.');
    if (plan.mode === 'flow' && opts.range !== 'all' && opts.range !== 'selection') throw new Error('This view has no fixed pages, so only the whole document or a selection can be printed.');
    const one = flowPage(ed, plan, opts.range === 'selection');
    if (!one) throw new Error('Nothing to print.');
    const pages = Array.from({ length: copies }, (_, i) => (i === 0 ? one : (one.cloneNode(true) as HTMLElement)));
    return { job: { pages, flow: flowSection(plan.first, opts) }, second: null, pages: 1, sheets: copies, total: 1 };
  }
  const builder = pageBuilder(ed, plan);
  if (!builder) throw new Error('Nothing to print.');
  const picked = selectedPages(ed, plan, opts);
  if (picked.error) throw new Error(picked.error);
  const run = sheetRun(picked.pages, { ...opts, copies });
  const like = picked.pages[picked.pages.length - 1] ?? 0;
  const make = (slots: SheetSlot[]): PrintJob => ({ pages: slots.map((s) => composeSheet(builder, s, opts, like)), flow: null });
  const first = make(run.first);
  const second = run.second ? make(run.second) : null;
  return { job: first, second, pages: picked.pages.length, sheets: run.first.length + (run.second?.length ?? 0), total: plan.sheets.length };
}
