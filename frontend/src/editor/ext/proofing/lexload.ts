import { api } from '../../../io/api';
import { lexiconLoaded, setExtra } from './lexicon';
import { bump } from './state';

let job: Promise<void> | null = null;
let tries = 0;

export function ensureLexicon(): void {
  if (lexiconLoaded() || job || tries >= 3) return;
  tries++;
  job = api.get<{ available: boolean; verbs: string[]; nouns: string[]; adjs: string[]; attested: string[] }>('/proofing/lexicon')
    .then((r) => {
      if (r.available) { setExtra(r); bump(); }
    })
    .catch(() => { void 0; })
    .finally(() => { job = null; });
}
