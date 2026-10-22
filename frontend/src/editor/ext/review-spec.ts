import type { MarkSpec } from 'prosemirror-model';
import { type AreaSpec, emptySpec } from './types';

const PALETTE = ['#2563eb', '#dc2626', '#059669', '#9333ea', '#d97706', '#0891b2', '#db2777', '#4d7c0f'];

export function authorColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const change = (tag: 'ins' | 'del'): MarkSpec => ({
  attrs: { id: { default: '' }, author: { default: '' }, time: { default: 0 } },
  inclusive: false,
  parseDOM: [{
    tag: `${tag}.ft-${tag}`,
    getAttrs: (d) => {
      const n = d as HTMLElement;
      return { id: n.dataset.id ?? '', author: n.dataset.author ?? '', time: Number(n.dataset.time ?? 0) || 0 };
    },
  }],
  toDOM: (m) => [tag, {
    class: `ft-${tag}`,
    'data-id': String(m.attrs.id),
    'data-author': String(m.attrs.author),
    'data-time': String(m.attrs.time),
    style: `--rv:${authorColor(String(m.attrs.author))}`,
  }, 0],
});

const paraChange = (kind: 'split' | 'join' | 'fmt') => ({
  default: null,
  dom: (v: unknown): Record<string, string> | null => {
    const a = v as { id?: string; author?: string } | null;
    if (!a?.id) return null;
    return { [`data-rv-${kind}`]: String(a.author ?? ''), style: `--rv:${authorColor(String(a.author ?? ''))}` };
  },
});

export const SPEC: AreaSpec = {
  ...emptySpec(),
  paraAttrs: { rvSplit: paraChange('split'), rvJoin: paraChange('join'), rvFmt: paraChange('fmt') },
  marks: {
    fmt: {
      attrs: { id: { default: '' }, author: { default: '' }, time: { default: 0 }, ops: { default: [] } },
      inclusive: false,
      excludes: '',
      parseDOM: [{ tag: 'span.ft-fmt', getAttrs: (d) => { const n = d as HTMLElement; try { return { id: n.dataset.id ?? '', author: n.dataset.author ?? '', time: Number(n.dataset.time ?? 0) || 0, ops: JSON.parse(n.dataset.ops ?? '[]') as unknown }; } catch { return false; } } }],
      toDOM: (m) => ['span', { class: 'ft-fmt', 'data-id': String(m.attrs.id), 'data-author': String(m.attrs.author), 'data-time': String(m.attrs.time), 'data-ops': JSON.stringify(m.attrs.ops), style: `--rv:${authorColor(String(m.attrs.author))}` }, 0],
    },
    comment: {
      attrs: { ids: { default: [] } },
      inclusive: false,
      parseDOM: [{ tag: 'span.ft-cm', getAttrs: (d) => ({ ids: String((d as HTMLElement).dataset.cm ?? '').split(' ').filter(Boolean) }) }],
      toDOM: (m) => ['span', { class: 'ft-cm', 'data-cm': (m.attrs.ids as string[]).join(' ') }, 0],
    },
    ins: change('ins'),
    del: change('del'),
  },
};
