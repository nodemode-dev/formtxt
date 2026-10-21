import { type MarkSpec, type Node as PMNode, type NodeSpec, Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { locale } from './chart/types';

export const LIST_KINDS = ['bullet', 'number', 'check'] as const;
export type ListKind = (typeof LIST_KINDS)[number] | '';
export const ALIGNS = ['left', 'center', 'right', 'justify'] as const;

type Attrs = Record<string, string>;

export const NUMBER_FORMATS = ['decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'] as const;
export interface ListFmt { format?: string; prefix?: string; suffix?: string; start?: number; bullet?: string }

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

const cssString = (s: string): string => `"${s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export const CHIP_KINDS = ['date', 'person', 'dropdown', 'doc'] as const;
export const DATE_FORMATS = ['short', 'long', 'numeric', 'iso'] as const;
export interface ChipOption { label: string; color: string }
export interface ChipAttrs { kind: string; date: string; format: string; name: string; email: string; options: ChipOption[]; value: string; doc: string; title: string }

export function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatChipDate(iso: string, format: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso || 'Pick a date';
  if (format === 'iso') return iso;
  const o: Intl.DateTimeFormatOptions = format === 'long' ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } : format === 'numeric' ? { year: 'numeric', month: 'numeric', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' };
  try { return new Intl.DateTimeFormat(locale(), o).format(d); } catch { return new Intl.DateTimeFormat('en-US', o).format(d); }
}

function initials(s: string): string {
  const parts = s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function chipLabel(a: Record<string, unknown>): string {
  if (a.kind === 'date') return formatChipDate(String(a.date || ''), String(a.format || 'short'));
  if (a.kind === 'person') return String(a.name || a.email || 'Person');
  if (a.kind === 'dropdown') return String(a.value || 'Choose');
  if (a.kind === 'doc') return String(a.title || 'Document');
  return '';
}

function chipTitle(a: Record<string, unknown>): string {
  if (a.kind === 'person') return [a.name, a.email].filter(Boolean).join(' ') || 'Person';
  if (a.kind === 'date') return String(a.date || '');
  if (a.kind === 'dropdown') return (a.options as ChipOption[]).map((o) => o.label).join(', ');
  return `Open ${String(a.title || 'document')}`;
}

function chipData(a: Record<string, unknown>): Partial<ChipAttrs> {
  if (a.kind === 'date') return { kind: 'date', date: String(a.date), format: String(a.format) };
  if (a.kind === 'person') return { kind: 'person', name: String(a.name), email: String(a.email) };
  if (a.kind === 'dropdown') return { kind: 'dropdown', options: a.options as ChipOption[], value: String(a.value) };
  return { kind: 'doc', doc: String(a.doc), title: String(a.title) };
}

export function cleanChip(v: unknown): Partial<ChipAttrs> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const kind = String(o.kind);
  if (!(CHIP_KINDS as readonly string[]).includes(kind)) return null;
  const s = (k: string, max = 200): string => (typeof o[k] === 'string' ? (o[k] as string).slice(0, max) : '');
  if (kind === 'date') return { kind, date: parseIsoDate(s('date')) ? s('date') : isoDate(new Date()), format: (DATE_FORMATS as readonly string[]).includes(s('format')) ? s('format') : 'short' };
  if (kind === 'person') return { kind, name: s('name'), email: s('email') };
  if (kind === 'dropdown') {
    const options = (Array.isArray(o.options) ? o.options : []).slice(0, 30).map((x) => ({ label: String((x as ChipOption)?.label ?? '').slice(0, 60), color: /^#[0-9a-f]{6}$/i.test(String((x as ChipOption)?.color)) ? String((x as ChipOption).color) : '' })).filter((x) => x.label);
    return { kind, options, value: options.some((x) => x.label === s('value')) ? s('value') : '' };
  }
  return { kind, doc: s('doc', 80), title: s('title') };
}

export function cleanListFmt(v: unknown): ListFmt | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out: ListFmt = {};
  if ((NUMBER_FORMATS as readonly string[]).includes(String(o.format))) out.format = String(o.format);
  if (typeof o.prefix === 'string' && o.prefix) out.prefix = o.prefix.slice(0, 24);
  if (typeof o.suffix === 'string') out.suffix = o.suffix.slice(0, 8);
  if (typeof o.start === 'number' && Number.isFinite(o.start) && o.start >= 0) out.start = Math.min(99999, Math.round(o.start));
  if (typeof o.bullet === 'string' && o.bullet) out.bullet = [...o.bullet][0];
  return Object.keys(out).length ? out : null;
}

function paraAttrs(n: PMNode): Attrs {
  const a = n.attrs;
  const out: Attrs = { 'data-style': String(a.style || 'Normal') };
  if (a.id) out['data-id'] = String(a.id);
  if (a.list) {
    out['data-list'] = String(a.list);
    out['data-level'] = String(a.level);
    if (a.list === 'check') out['data-checked'] = a.checked ? 'true' : 'false';
  }
  const fmt = a.list && a.list !== 'check' ? (a.listFmt as ListFmt | null) : null;
  const vars: string[] = [];
  if (fmt) {
    out['data-list-fmt'] = JSON.stringify(fmt);
    if (a.list === 'number') {
      if (fmt.format) out['data-fmt'] = fmt.format;
      if (fmt.prefix) vars.push(`--ft-num-pre:${cssString(fmt.prefix)}`);
      if (fmt.suffix !== undefined) vars.push(`--ft-num-suf:${cssString(fmt.suffix)}`);
      const chars = (fmt.prefix ?? '').length + (fmt.suffix ?? '.').length + (fmt.format?.endsWith('roman') ? 4 : fmt.format === 'decimal-leading-zero' ? 3 : 2);
      if (chars > 4) vars.push(`--ft-num-w:calc(${chars * 0.6}em + 4px)`);
      if (fmt.start !== undefined) {
        const lv = Number(a.level) || 0;
        vars.push(`counter-reset:l${lv} ${Math.round(fmt.start) - 1}${Array.from({ length: 8 - lv }, (_, i) => ` l${lv + 1 + i}`).join('')}`);
      }
    } else if (fmt.bullet) {
      out['data-bullet'] = 'true';
      vars.push(`--ft-bullet:${cssString(fmt.bullet)}`);
    }
  }
  if (a.collapsed) out['data-collapsed'] = 'true';
  if (a.keepNext) out['data-keep-next'] = 'true';
  if (a.keepLines) out['data-keep-lines'] = 'true';
  if (a.widowControl === false) out['data-widow'] = 'off';
  if (Array.isArray(a.tabs) && a.tabs.length) out['data-tabs'] = JSON.stringify(a.tabs);
  const css: string[] = [];
  if (a.align) css.push(`text-align:${a.align}`);
  if (a.indent) css.push(`margin-left:${(Number(a.indent) * 96) / 72}px`);
  if (a.indentRight) css.push(`margin-right:${(Number(a.indentRight) * 96) / 72}px`);
  if (a.indentFirst) css.push(`text-indent:${(Number(a.indentFirst) * 96) / 72}px`);
  if (a.shading) css.push(`background:${a.shading}`);
  if (a.border) {
    const line = '1px solid #6b6b6b';
    if (a.border === 'box') css.push(`border:${line}`, 'padding:4px 6px');
    else css.push(`border-${a.border}:${line}`, `padding-${a.border}:4px`);
  }
  if (a.spaceBefore !== null) css.push(`margin-top:${(Number(a.spaceBefore) * 96) / 72}px`);
  if (a.spaceAfter !== null) css.push(`margin-bottom:${(Number(a.spaceAfter) * 96) / 72}px`);
  if (a.lineSpacing !== null) css.push(`line-height:${Number(a.lineSpacing) * 1.2}`);
  css.push(...vars);
  if (css.length) out.style = css.join(';');
  return out;
}

let mediaDoc = '';

export function setMediaDocument(id: string): void { mediaDoc = id; }

export function mediaDocument(): string { return mediaDoc; }

export function mediaUrl(name: string, from = ''): string {
  const doc = from || mediaDoc;
  return name && doc ? `/api/documents/${encodeURIComponent(doc)}/media/${encodeURIComponent(name)}` : '';
}

export const TABLE_LOOKS =['grid', 'plain', 'rows', 'banded', 'accent'] as const;

const cellAttr = (name: string, css: string) => ({
  default: '',
  getFromDOM: (dom: HTMLElement) => dom.dataset[name] || '',
  setDOMAttr: (value: unknown, attrs: Record<string, unknown>) => {
    if (!value) return;
    attrs[`data-${name}`] = String(value);
    attrs.style = `${String(attrs.style ?? '')}${css}:${String(value)};`;
  },
});

export const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'] as const;
export interface BorderEdge { style: string; width: number; color: string }
export type CellBorders = Partial<Record<(typeof BORDER_SIDES)[number], BorderEdge>>;

export function borderCss(b: BorderEdge): string {
  if (b.style === 'none') return 'hidden';
  const px = Math.max(b.style === 'double' ? 3 : 1, Math.round(((Number(b.width) || 0.75) * 96) / 72));
  return `${px}px ${b.style} ${b.color || '#000000'}`;
}

const bordersAttr = {
  default: null,
  getFromDOM: (dom: HTMLElement) => { try { return dom.dataset.borders ? JSON.parse(dom.dataset.borders) : null; } catch { return null; } },
  setDOMAttr: (value: unknown, attrs: Record<string, unknown>) => {
    const b = value as CellBorders | null;
    if (!b || !Object.keys(b).length) return;
    attrs['data-borders'] = JSON.stringify(b);
    attrs.style = `${String(attrs.style ?? '')}${BORDER_SIDES.filter((s) => b[s]).map((s) => `border-${s}:${borderCss(b[s]!)};`).join('')}`;
  },
};

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: '(paragraph | code_block | table | chart | diagram)+',
  cellAttributes: { shading: cellAttr('shading', 'background'), valign: cellAttr('valign', 'vertical-align'), borders: bordersAttr },
});

export function tableAttrs(n: PMNode): Record<string, string> {
  const out: Record<string, string> = { class: 'ft-table', 'data-look': String(n.attrs.look || 'grid') };
  if (n.attrs.id) out['data-id'] = String(n.attrs.id);
  if (n.attrs.repeatHeader) out['data-repeat'] = 'true';
  if (n.attrs.align) out['data-align'] = String(n.attrs.align);
  return out;
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: {
      id: { default: null },
      style: { default: 'Normal' },
      align: { default: '' },
      indent: { default: 0 },
      indentRight: { default: 0 },
      indentFirst: { default: 0 },
      keepNext: { default: false },
      keepLines: { default: false },
      widowControl: { default: true },
      border: { default: '' },
      shading: { default: '' },
      tabs: { default: null },
      collapsed: { default: false },
      spaceBefore: { default: null },
      spaceAfter: { default: null },
      lineSpacing: { default: null },
      list: { default: '' },
      level: { default: 0 },
      checked: { default: false },
      listFmt: { default: null },
    },
    parseDOM: [
      { tag: 'p', getAttrs: (dom: HTMLElement) => ({ style: dom.dataset.style || 'Normal', list: dom.dataset.list || '', level: Number(dom.dataset.level || 0), checked: dom.dataset.checked === 'true', align: (ALIGNS as readonly string[]).includes(dom.style.textAlign) ? dom.style.textAlign : '', listFmt: cleanListFmt(dom.dataset.listFmt ? safeJson(dom.dataset.listFmt) : null) }) },
      ...[1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, getAttrs: () => ({ style: `Heading${level}` }) })),
      { tag: 'li', getAttrs: (dom: HTMLElement) => ({ list: dom.parentElement?.nodeName === 'OL' ? 'number' : 'bullet' }) },
    ],
    toDOM: (n) => ['p', paraAttrs(n), 0],
  },
  code_block: {
    content: 'text*',
    group: 'block',
    marks: '',
    code: true,
    defining: true,
    attrs: { id: { default: null } },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: (n) => ['pre', { class: 'ft-code', ...(n.attrs.id ? { 'data-id': String(n.attrs.id) } : {}) }, ['code', 0]],
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
  tab: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: false,
    parseDOM: [{ tag: 'span.ft-tab' }],
    toDOM: () => ['span', { class: 'ft-tab', contenteditable: 'false' }, '\t'],
  },
  image: {
    inline: true,
    group: 'inline',
    atom: true,
    draggable: true,
    selectable: true,
    attrs: {
      media: { default: '' }, alt: { default: '' }, width: { default: 144 }, height: { default: 108 },
      crop: { default: null }, rotate: { default: 0 }, brightness: { default: 100 }, contrast: { default: 100 }, saturation: { default: 100 }, transparency: { default: 0 },
      wrap: { default: 'inline' }, side: { default: 'left' }, x: { default: 0 }, y: { default: 0 }, from: { default: '' },
      border: { default: '' }, borderWidth: { default: 0 }, radius: { default: 0 }, shadow: { default: false }, relative: { default: 'paragraph' },
    },
    parseDOM: [{ tag: 'span.ft-pic', getAttrs: (dom: HTMLElement) => {
      let rest: Record<string, unknown> = {};
      try { rest = JSON.parse(dom.dataset.pic ?? '{}') as Record<string, unknown>; } catch { rest = {}; }
      const src = dom.querySelector('img')?.getAttribute('src') ?? '';
      const from = /\/api\/documents\/([^/]+)\/media\//.exec(src)?.[1] ?? '';
      return { ...rest, media: dom.dataset.media || '', alt: dom.querySelector('img')?.getAttribute('alt') ?? '', width: Number(dom.dataset.w) || 144, height: Number(dom.dataset.h) || 108, wrap: dom.dataset.wrap || 'inline', side: dom.dataset.side || 'left', from: decodeURIComponent(from) };
    } }],
    toDOM: (n) => {
      const { crop, rotate, brightness, contrast, saturation, transparency, x, y, border, borderWidth, radius, shadow, relative } = n.attrs;
      return ['span', { class: 'ft-pic', 'data-media': String(n.attrs.media), 'data-w': String(n.attrs.width), 'data-h': String(n.attrs.height), 'data-wrap': String(n.attrs.wrap), 'data-side': String(n.attrs.side), 'data-pic': JSON.stringify({ crop, rotate, brightness, contrast, saturation, transparency, x, y, border, borderWidth, radius, shadow, relative }) }, ['img', { src: mediaUrl(String(n.attrs.media), String(n.attrs.from || '')), alt: String(n.attrs.alt), width: String(Math.round(Number(n.attrs.width) * 96 / 72)) }]];
    },
  },
  shape: {
    inline: true,
    group: 'inline',
    atom: true,
    draggable: true,
    selectable: true,
    attrs: {
      kind: { default: 'rect' }, width: { default: 96 }, height: { default: 96 }, fill: { default: '#f97316' }, stroke: { default: '' }, strokeWidth: { default: 1 },
      rotate: { default: 0 }, text: { default: '' }, color: { default: '' }, size: { default: 11 }, bold: { default: false }, font: { default: '' },
      align: { default: 'center' }, valign: { default: 'middle' }, wordart: { default: '' }, wrap: { default: 'front' }, side: { default: 'left' }, x: { default: 0 }, y: { default: 0 },
      shadow: { default: false }, gradient: { default: '' }, path: { default: '' }, box: { default: null }, alt: { default: '' }, relative: { default: 'paragraph' },
      arrowStart: { default: false }, arrowEnd: { default: false }, content: { default: null }, id: { default: '' }, from: { default: '' }, to: { default: '' },
    },
    parseDOM: [{ tag: 'span.ft-shape', getAttrs: (dom: HTMLElement) => { try { return JSON.parse(dom.dataset.shape ?? '{}') as Record<string, unknown>; } catch { return {}; } } }],
    toDOM: (n) => ['span', { class: 'ft-shape', 'data-shape': JSON.stringify(n.attrs) }, String(n.attrs.text ?? '')],
  },
  chip: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: { kind: { default: 'date' }, date: { default: '' }, format: { default: 'short' }, name: { default: '' }, email: { default: '' }, options: { default: [] }, value: { default: '' }, doc: { default: '' }, title: { default: '' } },
    parseDOM: [{ tag: 'span.ft-smart-chip', getAttrs: (dom: HTMLElement) => ({ ...(cleanChip(safeJson(dom.dataset.chip || '')) ?? {}) }) }],
    toDOM: (n) => {
      const a = n.attrs;
      const label = chipLabel(a);
      const opt = a.kind === 'dropdown' ? (a.options as ChipOption[]).find((o) => o.label === a.value) : undefined;
      const attrs: Record<string, string> = { class: 'ft-smart-chip', contenteditable: 'false', 'data-kind': String(a.kind), 'data-chip': JSON.stringify(chipData(a)), title: chipTitle(a) };
      if (opt?.color) attrs.style = `--chip-color:${opt.color}`;
      if (a.kind === 'person') return ['span', attrs, ['span', { class: 'ft-chip-avatar', 'aria-hidden': 'true' }, initials(String(a.name || a.email))], ['span', { class: 'ft-chip-text' }, label]];
      return ['span', attrs, ['span', { class: 'ft-chip-text' }, label]];
    },
  },
  field: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: { kind: { default: 'formula' }, code: { default: '' }, format: { default: '' }, result: { default: '' }, error: { default: '' } },
    parseDOM: [{ tag: 'span.ft-field', getAttrs: (dom: HTMLElement) => ({ kind: dom.dataset.kind || 'formula', code: dom.dataset.code || '', format: dom.dataset.format || '', result: dom.textContent || '', error: dom.dataset.error || '' }) }],
    toDOM: (n) => ['span', { class: 'ft-field', contenteditable: 'false', 'data-kind': String(n.attrs.kind), 'data-code': String(n.attrs.code), 'data-format': String(n.attrs.format), ...(n.attrs.error ? { 'data-error': String(n.attrs.error), title: String(n.attrs.error) } : { title: `${String(n.attrs.code)}${n.attrs.format ? ` \\# "${String(n.attrs.format)}"` : ''}` }) }, String(n.attrs.result || (n.attrs.error ? '!Error' : ''))],
  },
  math: {
    inline: true,
    group: 'inline',
    atom: true,
    selectable: true,
    attrs: { latex: { default: '' }, display: { default: false } },
    parseDOM: [{ tag: 'span.ft-math', getAttrs: (dom: HTMLElement) => ({ latex: dom.dataset.latex ?? dom.textContent ?? '', display: dom.dataset.display === 'true' }) }],
    toDOM: (n) => ['span', { class: 'ft-math', 'data-latex': String(n.attrs.latex), 'data-display': String(!!n.attrs.display) }, String(n.attrs.latex)],
  },
  section_break: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { section: { default: null }, start: { default: 'nextPage' } },
    parseDOM: [{ tag: 'hr.ft-section-break', getAttrs: (dom: HTMLElement) => ({ section: dom.dataset.section || null }) }],
    toDOM: (n) => ['hr', { class: 'ft-section-break', contenteditable: 'false', 'data-section': String(n.attrs.section ?? '') }],
  },
  page_break: {
    group: 'block',
    atom: true,
    selectable: true,
    parseDOM: [{ tag: 'hr.ft-page-break' }],
    toDOM: () => ['hr', { class: 'ft-page-break', contenteditable: 'false' }],
  },
  chart: {
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { id: { default: null }, kind: { default: 'bar' }, title: { default: '' }, width: { default: 468 }, height: { default: 252 }, align: { default: 'center' }, options: { default: {} }, data: { default: { categories: [], series: [] } } },
    parseDOM: [{ tag: 'figure.ft-chart', getAttrs: (dom: HTMLElement) => { try { return JSON.parse(dom.dataset.chart ?? '{}') as Record<string, unknown>; } catch { return {}; } } }],
    toDOM: (n) => ['figure', { class: 'ft-chart', 'data-chart': JSON.stringify({ ...n.attrs, id: null }) }],
  },
  diagram: {
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { id: { default: null }, layout: { default: 'list-block' }, items: { default: [] }, style: { default: 'flat' }, colors: { default: 'colorful' }, width: { default: 468 }, height: { default: 216 }, align: { default: 'center' } },
    parseDOM: [{ tag: 'figure.ft-diagram', getAttrs: (dom: HTMLElement) => { try { return JSON.parse(dom.dataset.diagram ?? '{}') as Record<string, unknown>; } catch { return {}; } } }],
    toDOM: (n) => ['figure', { class: 'ft-diagram', 'data-diagram': JSON.stringify({ ...n.attrs, id: null }) }],
  },
  table: {
    ...tables.table,
    attrs: { id: { default: null }, look: { default: 'grid' }, repeatHeader: { default: false }, align: { default: '' } },
    parseDOM: [{ tag: 'table', getAttrs: (dom: HTMLElement) => ({ look: (TABLE_LOOKS as readonly string[]).includes(dom.dataset.look ?? '') ? dom.dataset.look : 'grid', repeatHeader: dom.dataset.repeat === 'true', align: dom.dataset.align || '' }) }],
    toDOM: (n) => ['table', tableAttrs(n), ['tbody', 0]],
  },
  table_row: tables.table_row,
  table_cell: tables.table_cell,
  table_header: tables.table_header,
  text: { group: 'inline' },
};

const simple = (tag: string, cls: string): MarkSpec => ({
  parseDOM: [{ tag: `${tag}.${cls}` }],
  toDOM: () => [tag, { class: cls }, 0],
});

const marks: Record<string, MarkSpec> = {
  link: {
    attrs: { href: {} },
    inclusive: false,
    parseDOM: [{ tag: 'a[href]', getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute('href') }) }],
    toDOM: (m) => ['a', { href: String(m.attrs.href), rel: 'noopener', target: '_blank' }, 0],
  },
  bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: (v: string) => (/^(bold|[6-9]00)$/.test(v) ? null : false) }], toDOM: () => ['strong', 0] },
  italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
  underline: {
    attrs: { style: { default: 'single' } },
    parseDOM: [{ tag: 'u', getAttrs: (dom: HTMLElement) => ({ style: dom.dataset.u || 'single' }) }, { style: 'text-decoration=underline' }],
    toDOM: (m) => (m.attrs.style === 'single' ? ['u', 0] : ['u', { 'data-u': String(m.attrs.style), style: `text-decoration-style:${m.attrs.style === 'dash' ? 'dashed' : m.attrs.style}` }, 0]),
  },
  spacing: {
    attrs: { pt: {} },
    parseDOM: [{ tag: 'span[data-spacing]', getAttrs: (dom: HTMLElement) => ({ pt: Number(dom.dataset.spacing) }) }],
    toDOM: (m) => ['span', { style: `letter-spacing:${(Number(m.attrs.pt) * 96) / 72}px`, 'data-spacing': String(m.attrs.pt) }, 0],
  },
  strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }], toDOM: () => ['s', 0] },
  superscript: { excludes: 'subscript', parseDOM: [{ tag: 'sup' }], toDOM: () => ['sup', 0] },
  subscript: { excludes: 'superscript', parseDOM: [{ tag: 'sub' }], toDOM: () => ['sub', 0] },
  smallCaps: simple('span', 'ft-smallcaps'),
  allCaps: simple('span', 'ft-allcaps'),
  code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  font: {
    attrs: { family: {} },
    parseDOM: [{ style: 'font-family', getAttrs: (v: string) => ({ family: v.split(',')[0].replace(/['"]/g, '').trim() }) }],
    toDOM: (m) => ['span', { style: `font-family:'${String(m.attrs.family)}'`, 'data-font': String(m.attrs.family) }, 0],
  },
  size: {
    attrs: { pt: {} },
    parseDOM: [{ tag: 'span[data-pt]', getAttrs: (dom: HTMLElement) => ({ pt: Number(dom.dataset.pt) }) }],
    toDOM: (m) => ['span', { style: `font-size:${(Number(m.attrs.pt) * 96) / 72}px`, 'data-pt': String(m.attrs.pt) }, 0],
  },
  color: {
    attrs: { value: {} },
    parseDOM: [{ tag: 'span[data-color]', getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.color }) }],
    toDOM: (m) => ['span', { style: `color:${String(m.attrs.value)}`, 'data-color': String(m.attrs.value) }, 0],
  },
  highlight: {
    attrs: { value: { default: '#fde047' } },
    parseDOM: [{ tag: 'mark', getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.color || '#fde047' }) }],
    toDOM: (m) => ['mark', { style: `background:${String(m.attrs.value)}`, 'data-color': String(m.attrs.value) }, 0],
  },
};

export const schema = new Schema({ nodes, marks });
