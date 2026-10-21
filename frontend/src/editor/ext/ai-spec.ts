import { type AreaSpec, emptySpec } from './types';

export const SPEC: AreaSpec = {
  ...emptySpec(),
  paraAttrs: {
    aiBlock: { default: '', dom: (v) => (v ? { class: 'ft-ai-block', 'data-ai-block': String(v) } : null) },
  },
};
