import { type AreaSpec, emptySpec } from './types';

export const SPEC: AreaSpec = {
  ...emptySpec(),
  nodes: {
    component: {
      group: 'block',
      content: '(paragraph | code_block | table)+',
      isolating: true,
      defining: true,
      attrs: { cid: { default: '' }, name: { default: '' }, rev: { default: 0 }, src: { default: '' } },
      parseDOM: [{
        tag: 'div.ft-component',
        getAttrs: (d) => {
          const e = d as HTMLElement;
          return { cid: e.dataset.cid ?? '', name: e.dataset.name ?? '', rev: Number(e.dataset.rev) || 0, src: e.dataset.src ?? '' };
        },
      }],
      toDOM: (n) => ['div', { class: 'ft-component', 'data-cid': String(n.attrs.cid), 'data-name': String(n.attrs.name), 'data-rev': String(n.attrs.rev), 'data-src': String(n.attrs.src) }, 0],
    },
  },
};
