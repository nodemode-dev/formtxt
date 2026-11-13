import { commands as registry } from '../../../engine/registry';

export interface ParaInfo { list: string; fmt: string; suffix: string; bullet: string; level: number; left: number; right: number; first: number; before: number; after: number; spacing: number; align: string }
export interface PageInfo { id: string; size: string; orientation: string; width: number; height: number; top: number; bottom: number; left: number; right: number; columns: number; gap: number }

const PT = 0.75;
let lastBlock: HTMLElement | null = null;
let sections: PageInfo[] = [];
let pageBusy = false;
const listeners = new Set<() => void>();

export const docRoot = (): HTMLElement | null => document.querySelector<HTMLElement>('.ft-pm-root');

export function caretBlock(): HTMLElement | null {
  const root = docRoot();
  if (!root) return null;
  const sel = window.getSelection();
  let n: Node | null = sel?.anchorNode ?? null;
  if (n && n.nodeType === 3) n = n.parentNode;
  let b = n instanceof HTMLElement && root.contains(n) ? n.closest<HTMLElement>('[data-style]') : null;
  if (!b) {
    const sn = root.querySelector<HTMLElement>('.is-selected');
    b = sn ? sn.closest<HTMLElement>('[data-style]') : null;
  }
  if (b && root.contains(b)) lastBlock = b;
  return lastBlock && lastBlock.isConnected ? lastBlock : null;
}

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

export function paraInfo(): ParaInfo {
  const b = caretBlock();
  const out: ParaInfo = { list: '', fmt: '', suffix: '', bullet: '', level: 0, left: 0, right: 0, first: 0, before: 0, after: 0, spacing: 0, align: 'left' };
  if (!b) return out;
  const cs = getComputedStyle(b);
  out.list = b.dataset.list ?? '';
  out.level = Number(b.dataset.level ?? 0) || 0;
  out.fmt = b.dataset.fmt ?? '';
  try {
    const f = JSON.parse(b.dataset.listFmt ?? '{}') as { format?: string; suffix?: string; bullet?: string };
    out.fmt = f.format ?? out.fmt;
    out.suffix = f.suffix ?? '';
    out.bullet = f.bullet ?? '';
  } catch { void 0; }
  out.left = round(num(cs.marginLeft) * PT, 1);
  out.right = round(num(cs.marginRight) * PT, 1);
  out.first = round(num(cs.textIndent) * PT, 1);
  out.before = round(num(cs.marginTop) * PT, 1);
  out.after = round(num(cs.marginBottom) * PT, 1);
  const lh = num(cs.lineHeight);
  const fs = num(cs.fontSize) || 16;
  out.spacing = lh > 0 ? round(lh / fs / 1.2, 2) : 0;
  out.align = cs.textAlign;
  return out;
}

export type SelKind = '' | 'picture' | 'shape' | 'chart' | 'diagram' | 'mermaid' | 'equation' | 'object';

export function selKind(): SelKind {
  const root = docRoot();
  const n = root?.querySelector<HTMLElement>('.is-selected');
  if (!n) return '';
  const c = n.className;
  if (/ft-pic\b/.test(c)) return 'picture';
  if (/ft-shape/.test(c)) return 'shape';
  if (/ft-chart/.test(c)) return 'chart';
  if (/ft-diagram/.test(c)) return 'diagram';
  if (/ft-mermaid/.test(c)) return 'mermaid';
  if (/ft-math/.test(c)) return 'equation';
  return 'object';
}

export function objectCmd(prefix: string): string {
  const k = selKind();
  const base = k === 'picture' ? 'picture' : k === 'shape' ? 'shape' : 'object';
  return `${base}.${prefix}`;
}

export const objectSelected = (): boolean => ['picture', 'shape', 'chart', 'diagram', 'mermaid'].includes(selKind());

export function pageInfo(): PageInfo | null {
  if (sections.length <= 1) return sections[0] ?? null;
  const b = caretBlock();
  const sheet = b ? Array.from(document.querySelectorAll<HTMLElement>('.ft-sheet')).find((s) => { const r = s.getBoundingClientRect(); const y = b.getBoundingClientRect().top; return y >= r.top && y <= r.bottom; }) : null;
  return sections.find((s) => s.id === sheet?.dataset.section) ?? sections[0];
}

export function refreshPage(): void {
  if (pageBusy || !registry.has('layout.sections')) return;
  pageBusy = true;
  void Promise.resolve(registry.get('layout.sections')?.run({})).then((r) => {
    const list = (r as Array<Record<string, unknown>>) ?? [];
    sections = list.map((s) => {
      const m = s.margins as Record<string, number>;
      const c = (s.columns as { count: number; gap: number }) ?? { count: 1, gap: 36 };
      return { id: String(s.id), size: String(s.size), orientation: String(s.orientation), width: Number(s.width), height: Number(s.height), top: round(m.top / 72), bottom: round(m.bottom / 72), left: round(m.left / 72), right: round(m.right / 72), columns: c.count, gap: c.gap };
    });
    for (const fn of listeners) fn();
  }).catch(() => undefined).finally(() => { pageBusy = false; });
}

export function onPage(fn: () => void): void { listeners.add(fn); }

export function sameMargins(p: PageInfo | null, t: number, b: number, l: number, r: number): boolean {
  return !!p && Math.abs(p.top - t) < 0.01 && Math.abs(p.bottom - b) < 0.01 && Math.abs(p.left - l) < 0.01 && Math.abs(p.right - r) < 0.01;
}

export function hasCover(): boolean {
  const root = docRoot();
  const first = root?.firstElementChild as HTMLElement | null;
  const pb = root?.querySelector(':scope > hr.ft-page-break');
  return !!first && first.dataset.style === 'Title' && !!pb && root?.children[3] === pb;
}
