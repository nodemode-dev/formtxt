import { type MarkSpec, type Node as PMNode, type NodeSpec, Schema } from 'prosemirror-model';

export const LIST_KINDS = ['bullet', 'number', 'check'] as const;
export type ListKind = (typeof LIST_KINDS)[number] | '';
export const ALIGNS = ['left', 'center', 'right', 'justify'] as const;

type Attrs = Record<string, string>;

function paraAttrs(n: PMNode): Attrs {
  const a = n.attrs;
  const out: Attrs = { 'data-style': String(a.style || 'Normal') };
  if (a.id) out['data-id'] = String(a.id);
  if (a.list) {
    out['data-list'] = String(a.list);
    out['data-level'] = String(a.level);
    if (a.list === 'check') out['data-checked'] = a.checked ? 'true' : 'false';
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
  if (Array.isArray(a.tabs) && a.tabs.length) css.push(`tab-size:${Math.max(8, Math.round((Number((a.tabs[0] as { pos: number }).pos) * 96) / 72))}px`);
  if (a.spaceBefore !== null) css.push(`margin-top:${(Number(a.spaceBefore) * 96) / 72}px`);
  if (a.spaceAfter !== null) css.push(`margin-bottom:${(Number(a.spaceAfter) * 96) / 72}px`);
  if (a.lineSpacing !== null) css.push(`line-height:${Number(a.lineSpacing) * 1.2}`);
  if (css.length) out.style = css.join(';');
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
    },
    parseDOM: [
      { tag: 'p', getAttrs: (dom: HTMLElement) => ({ style: dom.dataset.style || 'Normal', list: dom.dataset.list || '', level: Number(dom.dataset.level || 0), checked: dom.dataset.checked === 'true', align: (ALIGNS as readonly string[]).includes(dom.style.textAlign) ? dom.style.textAlign : '' }) },
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
  page_break: {
    group: 'block',
    atom: true,
    selectable: true,
    parseDOM: [{ tag: 'hr.ft-page-break' }],
    toDOM: () => ['hr', { class: 'ft-page-break', contenteditable: 'false' }],
  },
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
