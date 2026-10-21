import type { Mark, NodeSpec } from 'prosemirror-model';
import { type AreaSpec, emptySpec } from './types';

export const LIGATURES = ['', 'none', 'standard', 'contextual', 'discretionary', 'all'] as const;
export const NUMBER_FORMS = ['', 'lining', 'oldstyle'] as const;
export const NUMBER_SPACINGS = ['', 'proportional', 'tabular'] as const;
export const MULTILEVEL = ['legal', 'outline', 'article'] as const;
export const OBJECT_KINDS = ['video', 'audio', 'embed', 'online'] as const;
export const DROP_MODES = ['dropped', 'margin'] as const;

export interface DropCap { mode: string; lines: number; distance: number; font: string }
export interface Features { lig: string; num: string; nsp: string; ss: number }

export const objectHooks = { doc: (): string => '' };

const PX = 96 / 72;
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function cleanDropCap(v: unknown): DropCap | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!(DROP_MODES as readonly string[]).includes(String(o.mode))) return null;
  return { mode: String(o.mode), lines: Math.round(num(o.lines, 1, 10, 3)), distance: Math.round(num(o.distance, 0, 72, 0) * 10) / 10, font: typeof o.font === 'string' ? o.font.replace(/['"\\;{}]/g, '').slice(0, 80) : '' };
}

export function cleanFeatures(v: unknown): Features | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const pick = <T extends readonly string[]>(list: T, x: unknown): string => ((list as readonly string[]).includes(String(x)) ? String(x) : '');
  const f: Features = { lig: pick(LIGATURES, o.lig ?? o.ligatures), num: pick(NUMBER_FORMS, o.num ?? o.numberForm), nsp: pick(NUMBER_SPACINGS, o.nsp ?? o.numberSpacing), ss: Math.round(num(o.ss ?? o.stylisticSet, 0, 20, 0)) };
  return f.lig || f.num || f.nsp || f.ss ? f : null;
}

export function featureCss(f: Features): string {
  const on: string[] = [];
  const set = (tag: string, v: 0 | 1): number => on.push(`"${tag}" ${v}`);
  if (f.lig === 'none') { set('liga', 0); set('clig', 0); set('calt', 0); }
  else if (f.lig === 'standard') { set('liga', 1); set('clig', 0); }
  else if (f.lig === 'contextual') { set('liga', 1); set('clig', 1); set('calt', 1); }
  else if (f.lig === 'discretionary') { set('liga', 1); set('clig', 1); set('dlig', 1); set('hlig', 1); }
  else if (f.lig === 'all') { set('liga', 1); set('clig', 1); set('calt', 1); set('dlig', 1); set('hlig', 1); }
  if (f.num === 'lining') set('lnum', 1);
  if (f.num === 'oldstyle') set('onum', 1);
  if (f.nsp === 'proportional') set('pnum', 1);
  if (f.nsp === 'tabular') set('tnum', 1);
  if (f.ss) on.push(`"ss${String(f.ss).padStart(2, '0')}" 1`);
  return on.join(', ');
}

const featureOf = (m: Mark): Features => cleanFeatures(m.attrs) ?? { lig: '', num: '', nsp: '', ss: 0 };
const readObject = (dom: HTMLElement): Record<string, unknown> => {
  try { return JSON.parse(dom.dataset.object ?? '{}') as Record<string, unknown>; } catch { return {}; }
};

const OBJECT: NodeSpec = {
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,
  selectable: true,
  attrs: {
    kind: { default: 'embed' }, media: { default: '' }, thumb: { default: '' }, poster: { default: '' }, name: { default: '' }, source: { default: '' },
    bytes: { default: 0 }, mime: { default: '' }, width: { default: 320 }, height: { default: 180 }, wrap: { default: 'inline' }, side: { default: 'left' },
    provider: { default: '' }, vid: { default: '' }, hash: { default: '' }, link: { default: '' }, author: { default: '' }, rows: { default: null }, pages: { default: 0 }, from: { default: '' },
  },
  parseDOM: [{ tag: 'span.ft-object', getAttrs: (dom: HTMLElement) => readObject(dom) }],
  toDOM: (n) => ['span', { class: 'ft-object', 'data-kind': String(n.attrs.kind), 'data-object': JSON.stringify({ ...n.attrs, from: n.attrs.from || objectHooks.doc() }) }, String(n.attrs.name || n.attrs.source || 'Object')],
};

export const SPEC: AreaSpec = {
  ...emptySpec(),
  nodes: { object: OBJECT },
  marks: {
    kerning: {
      attrs: { min: { default: 0 } },
      parseDOM: [{ tag: 'span[data-kern]', getAttrs: (dom: HTMLElement) => ({ min: num(dom.dataset.kern, 0, 1638, 0) }) }],
      toDOM: (m) => ['span', { class: 'ft-kern', 'data-kern': String(m.attrs.min), style: 'font-kerning:normal;text-rendering:optimizeLegibility' }, 0],
    },
    scale: {
      attrs: { pct: { default: 100 } },
      parseDOM: [{ tag: 'span[data-scale]', getAttrs: (dom: HTMLElement) => ({ pct: num(dom.dataset.scale, 20, 600, 100) }) }],
      toDOM: (m) => ['span', { class: 'ft-scale', 'data-scale': String(m.attrs.pct), style: `--ft-scale:${Number(m.attrs.pct) / 100}` }, 0],
    },
    position: {
      attrs: { pt: { default: 0 } },
      parseDOM: [{ tag: 'span[data-position]', getAttrs: (dom: HTMLElement) => ({ pt: num(dom.dataset.position, -1584, 1584, 0) }) }],
      toDOM: (m) => ['span', { class: 'ft-pos', 'data-position': String(m.attrs.pt), style: `vertical-align:${(Number(m.attrs.pt) * PX).toFixed(2)}px` }, 0],
    },
    otf: {
      attrs: { lig: { default: '' }, num: { default: '' }, nsp: { default: '' }, ss: { default: 0 } },
      parseDOM: [{ tag: 'span[data-otf]', getAttrs: (dom: HTMLElement) => { try { return cleanFeatures(JSON.parse(dom.dataset.otf ?? '{}')) ?? false; } catch { return false; } } }],
      toDOM: (m) => {
        const f = featureOf(m);
        return ['span', { class: 'ft-otf', 'data-otf': JSON.stringify(f), style: `font-feature-settings:${featureCss(f)}` }, 0];
      },
    },
  },
  paraAttrs: {
    dropCap: {
      default: null,
      dom: (v) => {
        const d = cleanDropCap(v);
        if (!d) return null;
        const style = [`--ft-dc-lines:${d.lines}`, `--ft-dc-gap:${(d.distance * PX).toFixed(2)}px`];
        if (d.font) style.push(`--ft-dc-font:'${d.font}'`);
        return { class: 'ft-dropcap', 'data-dropcap': d.mode, style: style.join(';') };
      },
    },
    multilevel: {
      default: '',
      dom: (v) => ((MULTILEVEL as readonly string[]).includes(String(v)) ? { class: 'ft-multi', 'data-multi': String(v) } : null),
    },
  },
};
