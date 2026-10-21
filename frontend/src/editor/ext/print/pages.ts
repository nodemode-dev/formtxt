import { DOMSerializer } from 'prosemirror-model';
import type { Section } from '../../../engine/model';
import type { DocEditor } from '../../editor';

export interface SheetPlan {
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
  section: Section;
  sheet: HTMLElement;
}

export interface PrintPlan {
  mode: 'sheets' | 'flow';
  sheets: SheetPlan[];
  first: Section;
  signature: string;
  root: HTMLElement;
}

interface Block { el: HTMLElement; top: number; bottom: number; height: number }

const serial = new WeakMap<object, number>();
let serialNext = 1;

function serialOf(obj: object): number {
  let n = serial.get(obj);
  if (!n) { n = serialNext++; serial.set(obj, n); }
  return n;
}

export function pagesRoot(ed: DocEditor): HTMLElement | null {
  return ed.view?.dom.closest<HTMLElement>('.ft-pages') ?? null;
}

export function planPages(ed: DocEditor): PrintPlan | null {
  const view = ed.view;
  const doc = ed.doc;
  const root = pagesRoot(ed);
  if (!view || !doc || !root) return null;
  ed.paginator.layoutNow();
  const sheetEls = Array.from(root.querySelectorAll<HTMLElement>(':scope > .ft-sheets > .ft-sheet'));
  const flow = root.dataset.mode === 'pageless' || ed.viewMode === 'draft' || !sheetEls.length;
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const sheets: SheetPlan[] = flow ? [] : sheetEls.map((sheet, index) => {
    const section = byId.get(sheet.dataset.section ?? '') ?? ed.paginator.sheetGeo[index]?.sec ?? doc.sections[0];
    return {
      index, sheet, section,
      top: parseFloat(sheet.style.top) || 0, left: parseFloat(sheet.style.left) || 0,
      width: parseFloat(sheet.style.width) || section.page.width * (96 / 72), height: parseFloat(sheet.style.height) || section.page.height * (96 / 72),
    };
  });
  const signature = `${serialOf(view.state.doc)}|${flow ? 'flow' : sheets.map((s) => `${s.top.toFixed(0)}:${s.height.toFixed(0)}:${s.section.id}`).join(',')}|${root.dataset.border ?? ''}|${root.style.getPropertyValue('--page-color')}|${String((doc.settings as unknown as Record<string, unknown>).watermark ?? '')}`;
  return { mode: flow ? 'flow' : 'sheets', sheets, first: doc.sections[0], signature, root };
}

function ratioOf(root: HTMLElement): number {
  const box = root.getBoundingClientRect();
  return box.width && root.offsetWidth ? box.width / root.offsetWidth : 1;
}

function scrub(node: HTMLElement): void {
  node.removeAttribute('contenteditable');
  node.removeAttribute('id');
  node.classList.remove('ProseMirror-focused', 'ProseMirror-selectednode', 'selectedCell');
  for (const n of Array.from(node.querySelectorAll<HTMLElement>('[id], [contenteditable], .ProseMirror-selectednode, .selectedCell, .ProseMirror-separator, .ProseMirror-trailingBreak, .column-resize-handle'))) {
    if (n.matches('.ProseMirror-separator, .ProseMirror-trailingBreak, .column-resize-handle')) { n.remove(); continue; }
    n.removeAttribute('id');
    n.removeAttribute('contenteditable');
    n.classList.remove('ProseMirror-selectednode', 'selectedCell');
  }
}

function shell(root: HTMLElement): HTMLElement {
  const c = root.cloneNode(false) as HTMLElement;
  c.style.transform = '';
  c.style.marginBottom = '';
  c.style.margin = '0';
  c.style.position = 'absolute';
  c.style.left = '0px';
  c.style.top = '0px';
  c.style.height = `${root.offsetHeight}px`;
  c.removeAttribute('id');
  return c;
}

function measure(ed: DocEditor, root: HTMLElement): { chain: HTMLElement[]; blocks: Block[] } | null {
  const view = ed.view;
  if (!view) return null;
  const chain: HTMLElement[] = [];
  for (let n: HTMLElement | null = view.dom; n && n !== root; n = n.parentElement) chain.unshift(n);
  const ratio = ratioOf(root);
  const box = root.getBoundingClientRect();
  const blocks: Block[] = Array.from(view.dom.children).map((c) => {
    const el = c as HTMLElement;
    const r = el.getBoundingClientRect();
    return { el, top: (r.top - box.top) / ratio, bottom: (r.bottom - box.top) / ratio, height: r.height / ratio };
  });
  return { chain, blocks };
}

export interface PageBuilder {
  plan: PrintPlan;
  build(index: number): HTMLElement;
}

export function pageBuilder(ed: DocEditor, plan: PrintPlan): PageBuilder | null {
  if (plan.mode !== 'sheets') return null;
  const m = measure(ed, plan.root);
  if (!m) return null;
  const { chain, blocks } = m;
  const root = plan.root;
  const maxW = root.offsetWidth;
  const build = (index: number): HTMLElement => {
    const sp = plan.sheets[index];
    const page = document.createElement('div');
    page.className = 'ft-print-page';
    page.dataset.index = String(index);
    page.style.width = `${sp.width}px`;
    page.style.height = `${sp.height}px`;
    const sheetLayer = document.createElement('div');
    sheetLayer.className = 'ft-print-layer ft-print-sheet';
    sheetLayer.style.left = `${-sp.left}px`;
    sheetLayer.style.top = `${-sp.top}px`;
    sheetLayer.style.width = `${maxW}px`;
    const sheetShell = shell(root);
    const sheetsBox = document.createElement('div');
    sheetsBox.className = 'ft-sheets';
    const sheetClone = sp.sheet.cloneNode(true) as HTMLElement;
    scrub(sheetClone);
    sheetsBox.appendChild(sheetClone);
    sheetShell.appendChild(sheetsBox);
    sheetLayer.appendChild(sheetShell);
    const bodyLayer = document.createElement('div');
    bodyLayer.className = 'ft-print-layer ft-print-body';
    bodyLayer.style.left = `${-sp.left}px`;
    bodyLayer.style.top = `${-sp.top}px`;
    bodyLayer.style.width = `${maxW}px`;
    const bodyShell = shell(root);
    let parent: HTMLElement = bodyShell;
    for (const link of chain) {
      const c = link.cloneNode(false) as HTMLElement;
      c.removeAttribute('contenteditable');
      c.removeAttribute('id');
      c.classList.remove('ProseMirror-focused');
      parent.appendChild(c);
      parent = c;
    }
    const lo = sp.top - 2, hi = sp.top + sp.height + 2;
    for (const b of blocks) {
      if (b.bottom >= lo && b.top <= hi) {
        const c = b.el.cloneNode(true) as HTMLElement;
        scrub(c);
        parent.appendChild(c);
      } else {
        const c = b.el.cloneNode(false) as HTMLElement;
        c.removeAttribute('contenteditable');
        c.removeAttribute('id');
        c.style.height = `${b.height.toFixed(2)}px`;
        c.style.minHeight = '0';
        parent.appendChild(c);
      }
    }
    bodyLayer.appendChild(bodyShell);
    page.append(sheetLayer, bodyLayer);
    return page;
  };
  return { plan, build };
}

export function flowPage(ed: DocEditor, plan: PrintPlan, selectionOnly: boolean): HTMLElement | null {
  const view = ed.view;
  if (!view) return null;
  const m = measure(ed, plan.root);
  if (!m) return null;
  const outer = document.createElement('div');
  outer.className = 'ft-print-flow';
  const top = shell(plan.root);
  top.style.position = 'static';
  top.style.height = '';
  top.style.width = '';
  let parent: HTMLElement = top;
  for (const link of m.chain) {
    const c = link.cloneNode(false) as HTMLElement;
    c.removeAttribute('contenteditable');
    c.removeAttribute('id');
    c.classList.remove('ProseMirror-focused');
    c.style.height = '';
    parent.appendChild(c);
    parent = c;
  }
  if (selectionOnly) {
    const slice = view.state.selection.content();
    parent.appendChild(DOMSerializer.fromSchema(view.state.schema).serializeFragment(slice.content));
  } else {
    for (const b of m.blocks) {
      if (b.el.classList.contains('ft-pg-spacer')) continue;
      const c = b.el.cloneNode(true) as HTMLElement;
      scrub(c);
      parent.appendChild(c);
    }
  }
  outer.appendChild(top);
  return outer;
}

export function blankPage(like: SheetPlan | null, size: { w: number; h: number }): HTMLElement {
  const page = document.createElement('div');
  page.className = 'ft-print-page ft-print-blank';
  page.style.width = `${like ? like.width : size.w}px`;
  page.style.height = `${like ? like.height : size.h}px`;
  return page;
}

export function currentPage(ed: DocEditor, plan: PrintPlan): number {
  const view = ed.view;
  if (!view || plan.mode !== 'sheets' || !plan.sheets.length) return 0;
  try {
    const r = view.coordsAtPos(view.state.selection.head);
    const box = plan.root.getBoundingClientRect();
    const y = (r.top - box.top) / ratioOf(plan.root);
    let at = 0;
    for (const s of plan.sheets) if (s.top <= y + 1) at = s.index;
    return at;
  } catch {
    return 0;
  }
}
