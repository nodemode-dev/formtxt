import { PX } from './pages';

const DEFAULT_STOP = 36;

interface Stop { pos: number; align: string; leader: string }

function stopsOf(p: HTMLElement): Stop[] {
  try {
    const raw = p.dataset.tabs ? (JSON.parse(p.dataset.tabs) as Stop[]) : [];
    return raw.filter((t) => Number.isFinite(t.pos)).sort((a, b) => a.pos - b.pos);
  } catch {
    return [];
  }
}

function segmentWidth(tab: HTMLElement, p: HTMLElement, align: string): number {
  const range = document.createRange();
  range.setStartAfter(tab);
  let end: Node = p;
  let endOffset = p.childNodes.length;
  const next = (() => { let n: Node | null = tab.nextSibling; while (n) { if (n instanceof HTMLElement && n.classList.contains('ft-tab')) return n; n = n.nextSibling; } return null; })();
  if (next) { end = next.parentNode as Node; endOffset = Array.prototype.indexOf.call(end.childNodes, next); }
  range.setEnd(end, endOffset);
  if (align === 'decimal') {
    const text = range.toString();
    const dot = text.search(/[.,]/);
    if (dot >= 0) {
      const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
      let remaining = dot;
      for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
        if (!range.intersectsNode(t)) continue;
        const startAt = t === range.startContainer ? range.startOffset : 0;
        const avail = t.data.length - startAt;
        if (remaining <= avail) { range.setEnd(t, startAt + remaining); break; }
        remaining -= avail;
      }
    }
  }
  const rects = Array.from(range.getClientRects());
  if (!rects.length) return 0;
  const top = rects[0].top;
  return rects.filter((r) => Math.abs(r.top - top) < 2).reduce((w, r) => w + r.width, 0);
}

export function layoutTabs(root: HTMLElement, ratio: number): void {
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('span.ft-tab'));
  for (const tab of tabs) { tab.style.width = '0px'; tab.className = 'ft-tab'; }
  const left = root.getBoundingClientRect().left;
  for (const tab of tabs) {
    const p = tab.closest('p') as HTMLElement | null;
    if (!p) continue;
    const x = (tab.getBoundingClientRect().left - left) / ratio;
    const stops = stopsOf(p);
    let chosen: Stop | null = stops.find((s) => s.pos * PX > x + 1) ?? null;
    let width = 0;
    if (chosen) {
      const target = chosen.pos * PX;
      const seg = chosen.align === 'left' ? 0 : segmentWidth(tab, p, chosen.align) / ratio;
      width = chosen.align === 'right' || chosen.align === 'decimal' ? target - x - seg : chosen.align === 'center' ? target - x - seg / 2 : target - x;
      if (width < 1) chosen = null;
    }
    if (!chosen) {
      const step = DEFAULT_STOP * PX;
      width = (Math.floor(x / step) + 1) * step - x;
      if (width < 2) width += step;
    }
    tab.style.width = `${Math.max(1, width).toFixed(2)}px`;
    if (chosen && chosen.leader && chosen.leader !== 'none') tab.classList.add(`leader-${chosen.leader}`);
  }
}
