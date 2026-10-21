import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Section } from '../engine/model';
import { el, patchList, setText } from '../ui/dom';

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

interface Break { pos: number; fill: number; inline: boolean; target?: number }

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
  private frame = 0;
  private readonly sheets: HTMLElement;

  constructor(private readonly view: () => EditorView | null, private readonly container: HTMLElement, private readonly section: () => Section | null, private readonly settings: () => Record<string, unknown>, private readonly zoom: () => number = () => 1) {
    this.sheets = el('<div class="ft-sheets" aria-hidden="true"></div>');
    container.prepend(this.sheets);
  }

  schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
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
    const empty = pagesKey.getState(view.state);
    if (empty && empty !== DecorationSet.empty) view.dispatch(view.state.tr.setMeta(pagesKey, DecorationSet.empty).setMeta('addToHistory', false));
    if (pageless) { this.pages = 1; this.paint(g, true); this.onLayout?.(); return; }
    const root = view.dom as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const ratio = this.zoom();
    const stride = g.H + GAP;
    const kids = Array.from(root.children) as HTMLElement[];
    const tops = kids.map((k) => (k.getBoundingClientRect().top - rootRect.top) / ratio);
    const breaks: Break[] = [];
    let off = 0;
    let page = 0;
    let force = false;
    const bottomOf = (p: number): number => p * stride + g.bodyH;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const rect = k.getBoundingClientRect();
      const top = tops[i] + off;
      const height = rect.height / ratio;
      if (k.classList.contains('ft-page-break')) { force = true; continue; }
      const posOf = (n: HTMLElement): number => { try { return view.posAtDOM(n, 0) - 1; } catch { return -1; } };
      if (force) {
        force = false;
        const fill = (page + 1) * stride - top;
        const pos = posOf(k);
        if (pos >= 0 && fill > 0) { breaks.push({ pos, fill, inline: false, target: (page + 1) * stride }); off += fill; page++; }
        i--;
        continue;
      }
      if (top + height <= bottomOf(page) + 0.5) continue;
      const atTop = top <= page * stride + 1;
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
          const blockTop = lines[idx].top + cur <= page * stride + 1;
          let s = fit;
          if (widow && lines.length - s < min && s - min >= idx + (blockTop ? 1 : min)) s = lines.length - min;
          if (s - idx < (first && !blockTop ? min : 1)) {
            if (first && !atTop) break;
            s = Math.max(idx + 1, s);
          }
          if (s >= lines.length || s <= idx && !(first && atTop)) break;
          const at = view.posAtCoords({ left: lines[s].left + 1, top: lines[s].vtop + 1 });
          if (!at || at.pos <= posOf(k) + 1) break;
          const fill = (page + 1) * stride - (lines[s].top + cur);
          if (fill <= 0) break;
          breaks.push({ pos: at.pos, fill, inline: true, target: (page + 1) * stride });
          cur += fill;
          page++;
          idx = s;
          first = false;
          split = true;
        }
        if (split) { off = cur; continue; }
      }
      if (atTop) { page += Math.max(0, Math.floor((top + height - page * stride) / stride)); continue; }
      let j = i;
      while (j > 0 && (kids[j - 1].dataset.keepNext === 'true') && i - j < 5 && tops[j - 1] + off > page * stride + 1) j--;
      let fill = (page + 1) * stride - (tops[j] + off);
      const prev = j > 0 ? kids[j - 1] : null;
      if (prev && !prev.classList.contains('ft-page-break')) {
        const prevBottom = (prev.getBoundingClientRect().bottom - rootRect.top) / ratio + off;
        fill = (page + 1) * stride - prevBottom - (parseFloat(getComputedStyle(prev).marginBottom) || 0);
      }
      const pos = posOf(kids[j]);
      if (pos < 0 || fill <= 0) continue;
      breaks.push({ pos, fill, inline: false, target: (page + 1) * stride });
      off += fill;
      page++;
      i--;
    }
    const contentBottom = rootRect.height / ratio + off;
    this.pages = Math.max(page + 1, Math.ceil((contentBottom + 1) / stride));
    if (breaks.length) {
      const decos = breaks.map((b, n) => Decoration.widget(b.pos, () => spacer(b.fill, b.inline, b.target ?? 0), { side: -1, key: `pg${n}-${b.fill.toFixed(1)}-${b.inline ? 'i' : 'b'}`, ignoreSelection: true }));
      view.dispatch(view.state.tr.setMeta(pagesKey, DecorationSet.create(view.state.doc, decos)).setMeta('addToHistory', false));
      const spacers = Array.from(root.querySelectorAll<HTMLElement>('.ft-pg-spacer'));
      const top0 = root.getBoundingClientRect().top;
      for (const sp of spacers) {
        const target = Number(sp.dataset.target);
        if (!target) continue;
        const bottom = (sp.getBoundingClientRect().bottom - top0) / ratio;
        const delta = target - bottom;
        if (Math.abs(delta) > 0.5) sp.style.height = `${Math.max(0, parseFloat(sp.style.height) + delta).toFixed(2)}px`;
      }
    }
    this.paint(g, false);
    this.onLayout?.();
  }

  private paint(g: { H: number; W: number; bodyH: number }, pageless: boolean): void {
    const s = this.section()!;
    const settings = this.settings();
    const count = pageless ? 0 : this.pages;
    const height = pageless ? '' : `${count * (g.H + GAP) - GAP}px`;
    if (this.container.style.height !== height) this.container.style.height = height;
    const z = this.zoom();
    const extra = z === 1 ? '' : `${((this.container.offsetHeight || 0) * (z - 1)).toFixed(0)}px`;
    if (this.container.style.marginBottom !== extra) this.container.style.marginBottom = extra;
    const start = Number((s as unknown as { pageNumberStart?: number }).pageNumberStart ?? 1) || 1;
    const fmt = String((s as unknown as { pageNumberFormat?: string }).pageNumberFormat ?? 'decimal');
    const evenOdd = !!settings.evenOdd;
    const pick = (parts: Record<string, unknown>, i: number): HeaderPart | null => {
      const key = i === 0 && s.titlePage ? 'first' : evenOdd && (i + start) % 2 === 0 ? 'even' : 'default';
      const v = parts?.[key] as HeaderPart | undefined;
      return v && v.text ? v : null;
    };
    const fill = (text: string, i: number): string => text.replace(/\{PAGE\}/g, numberFormat(i + start, fmt)).replace(/\{NUMPAGES\}/g, numberFormat(count, fmt === 'decimal' ? 'decimal' : 'decimal'));
    const items = Array.from({ length: count }, (_, i) => i);
    const watermark = String(settings.watermark ?? '');
    patchList(this.sheets, items, {
      key: (i) => String(i),
      create: () => el('<div class="ft-sheet"><div class="ft-sheet-header"></div><div class="ft-sheet-watermark"></div><div class="ft-sheet-footer"></div></div>'),
      update: () => undefined,
    });
    Array.from(this.sheets.children).forEach((n, i) => {
      const sheet = n as HTMLElement;
      const css = `top:${i * (g.H + GAP)}px;height:${g.H}px`;
      if (sheet.getAttribute('style') !== css) sheet.setAttribute('style', css);
      const h = pick(s.headers, i), f = pick(s.footers, i);
      const hd = sheet.querySelector('.ft-sheet-header') as HTMLElement;
      const fd = sheet.querySelector('.ft-sheet-footer') as HTMLElement;
      setText(hd, h ? fill(h.text, i) : '');
      setText(fd, f ? fill(f.text, i) : '');
      hd.style.textAlign = h?.align ?? 'left';
      fd.style.textAlign = f?.align ?? 'center';
      setText(sheet.querySelector('.ft-sheet-watermark'), watermark);
    });
  }
}
