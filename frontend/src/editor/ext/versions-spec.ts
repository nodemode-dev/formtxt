import type { Node as PMNode } from 'prosemirror-model';
import { type AreaSpec, emptySpec } from './types';

export const CONTROL_KINDS = ['text', 'richtext', 'checkbox', 'date', 'dropdown'] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

const controlDom = (n: PMNode): readonly unknown[] => {
  const a = n.attrs;
  const kind = String(a.kind);
  const attrs: Record<string, string> = { class: 'ft-cc', 'data-kind': kind, 'data-title': String(a.title || ''), 'data-tag': String(a.tag || ''), title: String(a.title || '') };
  if (a.empty) attrs['data-empty'] = 'true';
  if (kind === 'checkbox') attrs['data-checked'] = a.checked ? 'true' : 'false';
  if (kind === 'checkbox' || kind === 'date' || kind === 'dropdown') attrs.contenteditable = 'false';
  if (kind === 'checkbox') attrs.role = 'checkbox';
  if (kind === 'checkbox') attrs['aria-checked'] = a.checked ? 'true' : 'false';
  return ['span', attrs, 0];
};

export function defaultPlaceholder(kind: string): string {
  if (kind === 'date') return 'Choose a date';
  if (kind === 'dropdown') return 'Choose an item';
  if (kind === 'richtext') return 'Click to enter formatted text';
  return 'Click to enter text';
}

export const SPEC: AreaSpec = {
  ...emptySpec(),
  nodes: {
    content_control: {
      inline: true,
      group: 'inline',
      content: 'text*',
      isolating: true,
      selectable: true,
      attrs: { kind: { default: 'text' }, title: { default: '' }, tag: { default: '' }, placeholder: { default: '' }, options: { default: [] }, format: { default: '' }, checked: { default: false }, empty: { default: false } },
      parseDOM: [{ tag: 'span.ft-cc', getAttrs: (dom: HTMLElement) => ({ kind: dom.dataset.kind || 'text', title: dom.dataset.title || '', tag: dom.dataset.tag || '', checked: dom.dataset.checked === 'true', empty: dom.dataset.empty === 'true' }) }],
      toDOM: controlDom as never,
    },
    merge_field: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: true,
      attrs: { name: { default: '' } },
      parseDOM: [{ tag: 'span.ft-mf', getAttrs: (dom: HTMLElement) => ({ name: dom.dataset.name || '' }) }],
      toDOM: (n) => ['span', { class: 'ft-mf', contenteditable: 'false', 'data-name': String(n.attrs.name), title: `Merge field ${String(n.attrs.name)}` }, ['span', { class: 'ft-mf-name' }, `«${String(n.attrs.name)}»`]],
    },
    signature_line: {
      group: 'block',
      atom: true,
      selectable: true,
      attrs: { id: { default: '' }, signer: { default: '' }, title: { default: '' }, instructions: { default: '' } },
      parseDOM: [{ tag: 'div.ft-sigline', getAttrs: (dom: HTMLElement) => ({ signer: dom.dataset.signer || '', title: dom.dataset.title || '', instructions: dom.dataset.instructions || '' }) }],
      toDOM: (n) => ['div', { class: 'ft-sigline', contenteditable: 'false', 'data-signer': String(n.attrs.signer), 'data-title': String(n.attrs.title), 'data-instructions': String(n.attrs.instructions) },
        ['div', { class: 'ft-sigline-row' }, ['span', { class: 'ft-sigline-x' }, 'X'], ['span', { class: 'ft-sigline-rule' }]],
        ['div', { class: 'ft-sigline-signer' }, String(n.attrs.signer || 'Signer')],
        ['div', { class: 'ft-sigline-title' }, String(n.attrs.title)],
        ['div', { class: 'ft-sigline-note' }, String(n.attrs.instructions)]],
    },
  },
};
