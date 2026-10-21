import type { AreaSpec } from './types';

export const NO_CHECK = 'zxx';
export const DIRECTIONS = ['ltr', 'rtl'] as const;

function engineLanguage(code: string): boolean {
  return /^en(-|$)/i.test(code);
}

export const SPEC: AreaSpec = {
  nodes: {},
  marks: {
    lang: {
      attrs: { code: { default: 'en-US' } },
      parseDOM: [{ tag: 'span[data-lang]', getAttrs: (dom: HTMLElement) => ({ code: dom.getAttribute('data-lang') || 'en-US' }) }],
      toDOM: (m) => {
        const code = String(m.attrs.code);
        return ['span', { lang: code === NO_CHECK ? 'zxx' : code, 'data-lang': code, spellcheck: code === NO_CHECK || engineLanguage(code) ? 'false' : 'true' }, 0];
      },
    },
  },
  paraAttrs: {
    dir: {
      default: '',
      dom: (v) => (v === 'rtl' || v === 'ltr' ? { dir: String(v) } : null),
    },
    noHyphen: {
      default: false,
      dom: (v) => (v ? { class: 'ft-nohyph' } : null),
    },
  },
};
