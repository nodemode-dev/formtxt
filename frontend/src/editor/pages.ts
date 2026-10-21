import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Section } from '../engine/model';
import { el, patchList, setHtml, setText } from '../ui/dom';

export const PX = 96 / 72;
export const GAP = 24;

export const pagesKey = new PluginKey<DecorationSet>('pages');

export const pagesPlugin = new Plugin<DecorationSet>({
  key: pagesKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const next = tr.getMeta(pagesKey) as DecorationSet | undefined;
      if (next) return next;
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: { decorations: (state) => pagesKey.getState(state) },
});

export interface HeaderPart { text: string; align: string }
export interface PageInfo { index: number; number: number }

interface Break { pos: number; fill: number; inline: boolean; target?: number; row?: { cols: number; heads: HTMLTableRowElement[] }; cellSplit?: boolean }

const CELL_PAD = 6;

function maskSplitTables(root: HTMLElement, tables: Set<HTMLTableElement>, ratio: number, bodyTop: (p: number) => number, bodyBottom: (p: number) => number): void {
  for (const t of Array.from(root.querySelectorAll<HTMLTableElement>('table.ft-table[data-masked]'))) {
    if (tables.has(t)) continue;
    t.style.removeProperty('mask-image');
    t.style.removeProperty('-webkit-mask-image');
    t.removeAttribute('data-masked');
  }
  const top0 = root.getBoundingClientRect().top;
  for (const t of tables) {
    const r = t.getBoundingClientRect();
    const tTop = (r.top - top0) / ratio, tBottom = (r.bottom - top0) / ratio;
    const stops: string[] = [];
    let p0 = 0;
    while (p0 < 5000 && bodyTop(p0 + 1) <= tTop) p0++;
    for (let p = p0; p < 5000 && bodyBottom(p) < tBottom; p++) {
      const a = Math.max(0, bodyBottom(p) - tTop), b = Math.max(a, bodyTop(p + 1) - tTop);
      stops.push(`#000 ${a.toFixed(1)}px`, `transparent ${a.toFixed(1)}px`, `transparent ${b.toFixed(1)}px`, `#000 ${b.toFixed(1)}px`);
    }
    const css = stops.length ? `linear-gradient(to bottom, #000 0px, ${stops.join(', ')}, #000 100%)` : '';
    if (t.style.getPropertyValue('mask-image') !== css) {
      t.style.setProperty('mask-image', css);
      t.style.setProperty('-webkit-mask-image', css);
    }
    if (!t.hasAttribute('data-masked')) t.setAttribute('data-masked', '');
  }
}

function rowSpacer(fill: number, target: number, cols: number): HTMLElement {
  const tr = document.createElement('tr');
  tr.className = 'ft-pg-spacer ft-pg-row';
  tr.dataset.target = target.toFixed(2);
  tr.setAttribute('contenteditable', 'false');
  tr.style.height = `${fill.toFixed(2)}px`;
  const td = tr.appendChild(document.createElement('td'));
  td.colSpan = cols;
  return tr;
}

function repeatRow(src: HTMLTableRowElement): HTMLElement {
  const tr = src.cloneNode(true) as HTMLTableRowElement;
  tr.className = 'ft-pg-repeat';
  tr.setAttribute('contenteditable', 'false');
  tr.setAttribute('aria-hidden', 'true');
  for (const n of Array.from(tr.querySelectorAll('.column-resize-handle, .ProseMirror-trailingBreak'))) n.remove();
  for (const n of Array.from(tr.querySelectorAll('.selectedCell'))) n.classList.remove('selectedCell');
  return tr;
}

function spacer(fill: number, inline: boolean, target: number): HTMLElement {
  const n = document.createElement(inline ? 'span' : 'div');
  n.dataset.target = target.toFixed(2);
  n.className = 'ft-pg-spacer';
  n.setAttribute('contenteditable', 'false');
  n.style.display = 'block';
  n.style.height = `${fill.toFixed(2)}px`;
  return n;
}

function lineBoxes(p: HTMLElement): Array<{ top: number; bottom: number; left: number }> {
  const range = document.createRange();
  range.selectNodeContents(p);
  const lines: Array<{ top: number; bottom: number; left: number }> = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width === 0 && r.height === 0) continue;
    const last = lines[lines.length - 1];
    if (last && r.top < last.bottom - 2) { last.bottom = Math.max(last.bottom, r.bottom); last.left = Math.min(last.left, r.left); }
    else lines.push({ top: r.top, bottom: r.bottom, left: r.left });
  }
  return lines;
}

function lineStart(view: EditorView, p: HTMLElement, viewportTop: number): number | null {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const topOf = (node: Text, i: number): number => {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getClientRects()[0] ?? range.getBoundingClientRect();
    return r.top;
  };
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.data.length;
    if (!len || topOf(n, len - 1) < viewportTop - 1) continue;
    let lo = 0, hi = len - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (topOf(n, mid) < viewportTop - 1) lo = mid + 1; else hi = mid;
    }
    try { return view.posAtDOM(n, lo); } catch { return null; }
  }
  return null;
}

export function numberFormat(n: number, fmt: string): string {
  if (fmt === 'lowerRoman' || fmt === 'upperRoman') {
    const map: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let out = '';
    let v = n;
    for (const [k, s] of map) while (v >= k) { out += s; v -= k; }
    return fmt === 'upperRoman' ? out.toUpperCase() : out;
  }
  if (fmt === 'lowerLetter' || fmt === 'upperLetter') {
    let out = '';
    let v = n;
    while (v > 0) { v--; out = String.fromCharCode(97 + (v % 26)) + out; v = Math.floor(v / 26); }
    return fmt === 'upperLetter' ? out.toUpperCase() : out;
  }
  return String(n);
}

export class Paginator {
  pages = 1;
  onLayout: (() => void) | null = null;
  sectionsOf: (() => Section[]) | null = null;
  sectionStarts: Array<{ page: number; id: string }> = [];
  beforeMeasure: ((root: HTMLElement, ratio: number) => void) | null = null;
  private frame = 0;
  private readonly sheets: HTMLElement;

  constructor(private readonly view: () => EditorView | null, private readonly container: HTMLElement, private readonly section: () => Section | null, private readonly settings: () => Record<string, unknown>, private readonly zoom: () => number = () => 1) {
    this.sheets = el('<div class="ft-sheets" aria-hidden="true"></div>');
    container.prepend(this.sheets);
  }

  private dirty: Set<HTMLElement> | null = null;
  private heights = new WeakMap<HTMLElement, number>();
  private kidCount = -1;
  skipped = 0;

  schedule(): void {
    this.dirty = null;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
  }

  scheduleEdit(tr: Transaction): void {
    const view = this.view();
    if (!view || tr.doc.childCount !== tr.before.childCount) { this.schedule(); return; }
    const touched = new Set<number>();
    tr.mapping.maps.forEach((map, i) => map.forEach((_os, _oe, ns, ne) => {
      let a = ns, b = ne;
      for (let j = i + 1; j < tr.mapping.maps.length; j++) { a = tr.mapping.maps[j].map(a, -1); b = tr.mapping.maps[j].map(b, 1); }
      tr.doc.forEach((node, pos, index) => { if (pos + node.nodeSize >= a && pos <= b) touched.add(index); });
    }));
    const els: HTMLElement[] = [];
    let ok = touched.size > 0;
    if (ok) {
      let index = 0;
      tr.doc.forEach((_node, pos) => {
        if (touched.has(index)) { const d = view.nodeDOM(pos); if (d instanceof HTMLElement) els.push(d); else ok = false; }
        index++;
      });
    }
    if (!ok || this.dirty === null && this.frame) { this.schedule(); return; }
    if (!this.dirty) this.dirty = new Set();
    for (const e of els) this.dirty.add(e);
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
  }

  private unchanged(root: HTMLElement, ratio: number): boolean {
    const dirty = this.dirty;
    this.dirty = null;
    if (!dirty || !dirty.size || this.kidCount < 0) return false;
    let count = 0;
    for (const k of Array.from(root.children)) if (!(k as HTMLElement).classList.contains('ft-pg-spacer')) count++;
    if (count !== this.kidCount) return false;
    for (const e of dirty) {
      if (!e.isConnected || e.parentElement !== root || e.matches('[data-masked]') || e.querySelector('.ft-pg-spacer, .ft-pg-repeat, [data-masked]')) return false;
      const h = this.heights.get(e);
      if (h === undefined || Math.abs(e.getBoundingClientRect().height / ratio - h) > 0.5) return false;
    }
    return true;
  }

  private remember(root: HTMLElement, ratio: number): void {
    let count = 0;
    for (const k of Array.from(root.children) as HTMLElement[]) {
      if (k.classList.contains('ft-pg-spacer')) continue;
      count++;
      this.heights.set(k, k.getBoundingClientRect().height / ratio);
    }
    this.kidCount = count;
  }

  layoutNow(): void {
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.layout();
  }

  private geometry(): { H: number; bodyH: number; W: number } | null {
    const s = this.section();
    if (!s) return null;
    const H = s.page.height * PX;
    return { H, W: s.page.width * PX, bodyH: H - (s.margins.top + s.margins.bottom) * PX };
  }

  private layout(): void {
    const view = this.view();
    const g = this.geometry();
    if (!view || !g) return;
    const pageless = !!this.settings().pageless;
    const mode = pageless ? 'pageless' : 'paged';
    if (this.container.dataset.mode !== mode) this.container.dataset.mode = mode;
    const fast = this.unchanged(view.dom as HTMLElement, this.zoom());
    if (fast && !pageless) { this.skipped++; this.onLayout?.(); return; }
    const empty = pagesKey.getState(view.state);
    if (empty && empty !== DecorationSet.empty) view.dispatch(view.state.tr.setMeta(pagesKey, DecorationSet.empty).setMeta('addToHistory', false));
    this.sectionStarts = [{ page: 0, id: this.section()!.id }];
    this.beforeMeasure?.(view.dom as HTMLElement, this.zoom());
    if (pageless) { maskSplitTables(view.dom as HTMLElement, new Set(), 1, () => 0, () => 0); this.pages = 1; this.paint(g, true); this.onLayout?.(); return; }
    const root = view.dom as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const ratio = this.zoom();
    const kids = Array.from(root.children) as HTMLElement[];
    const tops = kids.map((k) => (k.getBoundingClientRect().top - rootRect.top) / ratio);
    const breaks: Break[] = [];
    const splitTables = new Set<HTMLTableElement>();
    let off = 0;
    let page = 0;
    let force = false;
    let parity: '' | 'odd' | 'even' = '';
    const all = this.sectionsOf?.() ?? [this.section()!];
    const byId = new Map(all.map((s) => [s.id, s]));
    const first = this.section()!;
    const geoOf = (s: Section): { H: number; top: number; bottom: number } => ({ H: s.page.height * PX, top: s.margins.top * PX, bottom: s.margins.bottom * PX });
    const secAt = (p: number): Section => { let id = first.id; for (const st of this.sectionStarts) if (st.page <= p) id = st.id; return byId.get(id) ?? first; };
    const tops0: number[] = [];
    const pageTop = (p: number): number => {
      if (p <= 0) return -geoOf(first).top;
      if (tops0[p] !== undefined) return tops0[p];
      const v = pageTop(p - 1) + geoOf(secAt(p - 1)).H + GAP;
      tops0[p] = v;
      return v;
    };
    const bodyTop = (p: number): number => pageTop(p) + geoOf(secAt(p)).top;
    const bottomOf = (p: number): number => pageTop(p) + geoOf(secAt(p)).H - geoOf(secAt(p)).bottom;
    const startAt = (p: number, id: string): void => { this.sectionStarts.push({ page: p, id }); tops0.length = Math.min(tops0.length, p + 1); };
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const rect = k.getBoundingClientRect();
      const top = tops[i] + off;
      const height = rect.height / ratio;
      if (k.classList.contains('ft-page-break')) { force = true; continue; }
      if (k.classList.contains('ft-section-break')) {
        const id = k.dataset.section ?? '';
        const start = String(byId.get(id)?.start ?? 'nextPage');
        if (id) startAt(page + 1, id);
        if (start !== 'continuous') { force = true; parity = start === 'oddPage' ? 'odd' : start === 'evenPage' ? 'even' : ''; }
        continue;
      }
      const posOf = (n: HTMLElement): number => {
        try {
          const p = view.posAtDOM(n, 0);
          if (view.nodeDOM(p) === n) return p;
          return p - 1;
        } catch { return -1; }
      };
      if (force) {
        force = false;
        let to = page + 1;
        if (parity && ((to + 1) % 2 === 1 ? 'odd' : 'even') !== parity) {
          const last = this.sectionStarts[this.sectionStarts.length - 1];
          if (last && last.page === to) { this.sectionStarts.pop(); startAt(to + 1, last.id); }
          to++;
        }
        parity = '';
        const next = bodyTop(to);
        const fill = next - top;
        const pos = posOf(k);
        if (pos >= 0 && fill > 0) {
          breaks.push({ pos, fill, inline: false, target: next });
          off = next + (parseFloat(getComputedStyle(k).marginTop) || 0) - tops[i];
          page = to;
        }
        i--;
        continue;
      }
      if (top + height <= bottomOf(page) + 0.5) continue;
      const atTop = top - (parseFloat(getComputedStyle(k).marginTop) || 0) <= bodyTop(page) + 1;
      const isPara = k.nodeName === 'P';
      const keepLines = k.dataset.keepLines === 'true';
      const widow = k.dataset.widow !== 'off';
      let split = false;
      if (isPara && (!keepLines || atTop)) {
        const lines = lineBoxes(k).map((l) => ({ top: (l.top - rootRect.top) / ratio, bottom: (l.bottom - rootRect.top) / ratio, left: l.left, vtop: l.top }));
        const min = widow ? 2 : 1;
        let idx = 0;
        let cur = off;
        let first = true;
        while (idx < lines.length) {
          let fit = idx;
          while (fit < lines.length && lines[fit].bottom + cur <= bottomOf(page) + 0.5) fit++;
          if (fit >= lines.length) break;
          const blockTop = lines[idx].top + cur <= bodyTop(page) + 1;
          let s = fit;
          if (widow && lines.length - s < min && s - min >= idx + (blockTop ? 1 : min)) s = lines.length - min;
          if (s - idx < (first && !blockTop ? min : 1)) {
            if (first && !atTop) break;
            s = Math.max(idx + 1, s);
          }
          if (s >= lines.length || s <= idx && !(first && atTop)) break;
          const pos = lineStart(view, k, lines[s].vtop);
          if (pos === null || pos <= posOf(k) + 1) break;
          const at = { pos };
          const fill = bodyTop(page + 1) - (lines[s].top + cur);
          if (fill <= 0) break;
          breaks.push({ pos: at.pos, fill, inline: true, target: bodyTop(page + 1) });
          cur += fill;
          page++;
          idx = s;
          first = false;
          split = true;
        }
        if (split) { off = cur; continue; }
      }
      const table = k.querySelector<HTMLTableElement>(':scope > table.ft-table');
      if (table) {
        const rows = Array.from(table.rows);
        let heads = 0;
        if (table.dataset.repeat === 'true') while (heads < rows.length - 1 && rows[heads].cells.length && Array.from(rows[heads].cells).every((c) => c.nodeName === 'TH')) heads++;
        const headH = heads ? (rows[heads - 1].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top) / ratio : 0;
        const cols = Math.max(1, ...rows.map((r) => Array.from(r.cells).reduce((n, c) => n + c.colSpan, 0)));
        let cur = off;
        let firstOnPage = 0;
        let split = false;
        let moveWhole = false;
        const splitRow = (row: HTMLTableRowElement, at: number, pg0: number): { breaks: Break[]; cur: number; page: number } | null => {
          const rowBox = row.getBoundingClientRect();
          const rowBottom = (rowBox.bottom - rootRect.top) / ratio + at;
          const found: Break[] = [];
          let lastPage = pg0;
          let grow = 0;
          let fitsHere = false;
          for (const cell of Array.from(row.cells)) {
            const units: Array<{ top: number; bottom: number; pos: number; inline: boolean }> = [];
            for (const child of Array.from(cell.children) as HTMLElement[]) {
              if (child.classList.contains('column-resize-handle') || child.classList.contains('ft-pg-spacer')) continue;
              const cpos = posOf(child);
              const b = child.getBoundingClientRect();
              const ls = child.nodeName === 'P' ? lineBoxes(child) : [];
              if (!ls.length) { units.push({ top: (b.top - rootRect.top) / ratio + at, bottom: (b.bottom - rootRect.top) / ratio + at, pos: cpos, inline: false }); continue; }
              ls.forEach((l, li) => {
                const top = (l.top - rootRect.top) / ratio + at, bottom = (l.bottom - rootRect.top) / ratio + at;
                const p = li === 0 ? cpos : lineStart(view, child, l.top);
                if (p === null || (li > 0 && p <= cpos + 1)) { if (units.length) units[units.length - 1].bottom = bottom; return; }
                units.push({ top, bottom, pos: p, inline: li > 0 });
              });
            }
            if (units.length && units[0].bottom <= bottomOf(pg0) + 0.5) fitsHere = true;
            let shift = 0, p = pg0;
            for (let u = 0; u < units.length; u++) {
              const un = units[u];
              if (un.bottom + shift <= bottomOf(p) + 0.5) continue;
              if (un.bottom - un.top > bottomOf(p + 1) - bodyTop(p + 1) - CELL_PAD || un.pos < 0) continue;
              const target = bodyTop(p + 1) + CELL_PAD;
              const fill = target - (un.top + shift);
              if (fill <= 0) continue;
              found.push({ pos: un.pos, fill, inline: un.inline, target, cellSplit: true });
              shift += fill;
              p++;
            }
            const last = units[units.length - 1];
            if (last) grow = Math.max(grow, last.bottom + shift - rowBottom + CELL_PAD);
            lastPage = Math.max(lastPage, p);
          }
          if (!found.length || !fitsHere) return null;
          splitTables.add(table);
          return { breaks: found, cur: at + Math.max(0, grow), page: lastPage };
        };
        for (let r = 0; r < rows.length; r++) {
          const box = rows[r].getBoundingClientRect();
          const rb = (box.bottom - rootRect.top) / ratio + cur;
          if (rb <= bottomOf(page) + 0.5) continue;
          if (r >= heads && table.dataset.rowSplit !== 'off') {
            const res = splitRow(rows[r], cur, page);
            if (res) { breaks.push(...res.breaks); cur = res.cur; page = res.page; firstOnPage = r; split = true; continue; }
          }
          if (r <= Math.max(firstOnPage, heads) && !split) { if (!atTop) moveWhole = true; break; }
          if (r === firstOnPage) continue;
          let pos = -1;
          try { pos = view.posAtDOM(rows[r], 0) - 1; } catch { pos = -1; }
          const rt = (box.top - rootRect.top) / ratio + cur;
          const fill = bodyTop(page + 1) - rt;
          if (pos < 0 || fill <= 0) break;
          breaks.push({ pos, fill, inline: false, target: bodyTop(page + 1), row: { cols, heads: rows.slice(0, heads) } });
          cur += fill + headH;
          page++;
          firstOnPage = r;
          split = true;
          r--;
        }
        if (split) { off = cur; continue; }
        if (!moveWhole && atTop) { while (bodyTop(page + 1) <= top + height) page++; continue; }
      }
      if (atTop) { while (bodyTop(page + 1) <= top + height) page++; continue; }
      let j = i;
      while (j > 0 && (kids[j - 1].dataset.keepNext === 'true') && i - j < 5 && tops[j - 1] + off > bodyTop(page) + 1) j--;
      let fill = bodyTop(page + 1) - (tops[j] + off);
      const prev = j > 0 ? kids[j - 1] : null;
      if (prev && !prev.classList.contains('ft-page-break')) {
        const prevBottom = (prev.getBoundingClientRect().bottom - rootRect.top) / ratio + off;
        fill = bodyTop(page + 1) - prevBottom - (parseFloat(getComputedStyle(prev).marginBottom) || 0);
      }
      const pos = posOf(kids[j]);
      if (pos < 0 || fill <= 0) continue;
      breaks.push({ pos, fill, inline: false, target: bodyTop(page + 1) });
      off = bodyTop(page + 1) + (parseFloat(getComputedStyle(kids[j]).marginTop) || 0) - tops[j];
      page++;
      i = j - 1;
    }
    const contentBottom = rootRect.height / ratio + off;
    let count = page + 1;
    while (count < 5000 && bodyTop(count) < contentBottom + 1) count++;
    this.pages = count;
    if (breaks.length) {
      const decos: Decoration[] = [];
      breaks.forEach((b, n) => {
        if (!b.row) { decos.push(Decoration.widget(b.pos, () => spacer(b.fill, b.inline, b.target ?? 0), { side: -1, key: `pg${n}-${b.fill.toFixed(1)}-${b.inline ? 'i' : 'b'}`, ignoreSelection: true })); return; }
        const { cols, heads } = b.row;
        decos.push(Decoration.widget(b.pos, () => rowSpacer(b.fill, b.target ?? 0, cols), { side: -2, key: `pg${n}-${b.fill.toFixed(1)}-r${cols}`, ignoreSelection: true }));
        heads.forEach((h, j) => {
          let hash = 0;
          for (const ch of h.innerHTML) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
          decos.push(Decoration.widget(b.pos, () => repeatRow(h), { side: -1, key: `pg${n}-h${j}-${hash}`, ignoreSelection: true }));
        });
      });
      view.dispatch(view.state.tr.setMeta(pagesKey, DecorationSet.create(view.state.doc, decos)).setMeta('addToHistory', false));
      const spacers = Array.from(root.querySelectorAll<HTMLElement>('.ft-pg-spacer'));
      for (const sp of spacers) {
        const target = Number(sp.dataset.target);
        if (!target) continue;
        const top0 = root.getBoundingClientRect().top;
        const bottom = (sp.getBoundingClientRect().bottom - top0) / ratio;
        const delta = target - bottom;
        if (Math.abs(delta) > 0.5) sp.style.height = `${Math.max(0, parseFloat(sp.style.height) + delta).toFixed(2)}px`;
      }
    }
    maskSplitTables(root, splitTables, ratio, bodyTop, bottomOf);
    this.lineMarks = [];
    const numbering = String(this.settings().lineNumbers ?? '');
    if (numbering) {
      const top0 = root.getBoundingClientRect().top;
      let n = 0;
      let lastPage = -1;
      for (const k of Array.from(root.children) as HTMLElement[]) {
        if (k.nodeName !== 'P' || !k.textContent) continue;
        for (const l of lineBoxes(k)) {
          const y = (l.top - top0) / ratio;
          let pg = 0;
          while (pg < 5000 && bodyTop(pg + 1) <= y) pg++;
          if (numbering === 'page' && pg !== lastPage) n = 0;
          lastPage = pg;
          n++;
          this.lineMarks.push({ page: pg, y: y - bodyTop(pg), n, h: (l.bottom - l.top) / ratio });
        }
      }
    }
    this.sheetGeo = Array.from({ length: this.pages }, (_, i) => ({ top: pageTop(i) - pageTop(0), sec: secAt(i) }));
    this.remember(root, ratio);
    this.paint(g, false);
    this.onLayout?.();
  }

  sheetGeo: Array<{ top: number; sec: Section }> = [];

  private lineMarks: Array<{ page: number; y: number; n: number; h: number }> = [];

  private paint(g: { H: number; W: number; bodyH: number }, pageless: boolean): void {
    const s = this.section()!;
    const settings = this.settings();
    const count = pageless ? 0 : this.pages;
    const geoAt = (i: number): { top: number; sec: Section } => this.sheetGeo[i] ?? { top: i * (g.H + GAP), sec: s };
    const maxW = Math.max(...(this.sectionsOf?.() ?? [s]).map((x) => x.page.width * PX));
    const lastGeo = count ? geoAt(count - 1) : null;
    const height = pageless || !lastGeo ? '' : `${(lastGeo.top + lastGeo.sec.page.height * PX).toFixed(2)}px`;
    if (this.container.style.height !== height) this.container.style.height = height;
    const z = this.zoom();
    const extra = z === 1 ? '' : `${((this.container.offsetHeight || 0) * (z - 1)).toFixed(0)}px`;
    if (this.container.style.marginBottom !== extra) this.container.style.marginBottom = extra;
    const evenOdd = !!settings.evenOdd;
    const all = this.sectionsOf?.() ?? [s];
    const byId = new Map(all.map((x) => [x.id, x]));
    const starts = this.sectionStarts.length ? this.sectionStarts : [{ page: 0, id: s.id }];
    const plan: Array<{ sec: Section; first: boolean; num: number }> = [];
    for (let i = 0; i < count; i++) {
      let st = starts[0];
      for (const x of starts) if (x.page <= i) st = x;
      const sec = byId.get(st.id) ?? s;
      const first = st.page === i;
      const restart = sec.pageNumberStart;
      const num = i === 0 ? Number(restart ?? 1) || 1 : first && typeof restart === 'number' && st.page > 0 ? restart : plan[i - 1].num + 1;
      plan.push({ sec, first, num });
    }
    const which = (i: number): string => (plan[i].first && plan[i].sec.titlePage ? 'first' : evenOdd && plan[i].num % 2 === 0 ? 'even' : 'default');
    const pick = (where: 'headers' | 'footers', i: number): HeaderPart | null => {
      const v = (plan[i].sec[where] as Record<string, unknown>)?.[which(i)] as HeaderPart | undefined;
      return v && v.text ? v : null;
    };
    const fill = (text: string, i: number): string => text.replace(/\{PAGE\}/g, numberFormat(plan[i].num, String(plan[i].sec.pageNumberFormat ?? 'decimal'))).replace(/\{NUMPAGES\}/g, String(count));
    const items = Array.from({ length: count }, (_, i) => i);
    const watermark = String(settings.watermark ?? '');
    patchList(this.sheets, items, {
      key: (i) => String(i),
      create: () => el('<div class="ft-sheet"><div class="ft-sheet-header" data-part="headers"></div><div class="ft-sheet-watermark"></div><div class="ft-sheet-lines"></div><div class="ft-sheet-footer" data-part="footers"></div></div>'),
      update: () => undefined,
    });
    Array.from(this.sheets.children).forEach((n, i) => {
      const sheet = n as HTMLElement;
      const ge = geoAt(i);
      const sp = ge.sec.page, sm = ge.sec.margins;
      const w = sp.width * PX;
      const css = `top:${ge.top.toFixed(2)}px;height:${(sp.height * PX).toFixed(2)}px;left:${((maxW - w) / 2).toFixed(2)}px;right:auto;width:${w.toFixed(2)}px;--page-pad-top:${(sm.header * PX).toFixed(0)}px;--page-pad-bottom:${(sm.footer * PX).toFixed(0)}px;--page-pad-x:${(sm.left * PX).toFixed(0)}px;--page-pad-xr:${(sm.right * PX).toFixed(0)}px`;
      if (sheet.getAttribute('style') !== css) sheet.setAttribute('style', css);
      const h = pick('headers', i), f = pick('footers', i);
      const hd = sheet.querySelector('.ft-sheet-header') as HTMLElement;
      const fd = sheet.querySelector('.ft-sheet-footer') as HTMLElement;
      sheet.dataset.section = plan[i].sec.id;
      hd.dataset.which = which(i);
      fd.dataset.which = which(i);
      if (!hd.isContentEditable) setText(hd, h ? fill(h.text, i) : '');
      if (!fd.isContentEditable) setText(fd, f ? fill(f.text, i) : '');
      hd.style.textAlign = h?.align ?? 'left';
      fd.style.textAlign = f?.align ?? 'center';
      setText(sheet.querySelector('.ft-sheet-watermark'), watermark);
      const marks = this.lineMarks.filter((m) => m.page === i);
      const top = sm.top * PX;
      setHtml(sheet.querySelector('.ft-sheet-lines') as HTMLElement, marks.map((m) => `<span style="top:${(top + m.y).toFixed(1)}px;height:${m.h.toFixed(1)}px">${m.n}</span>`).join(''), marks.map((m) => `${m.n}@${m.y.toFixed(0)}`).join(','));
    });
  }
}
