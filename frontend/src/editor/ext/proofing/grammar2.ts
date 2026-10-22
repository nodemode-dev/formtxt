import type { Fix, GrammarRules, RawIssue } from './types';
import * as L from './lexicon';

interface Tok { w: string; raw: string; from: number; to: number; s: number }

const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}'’-]*[\p{L}\p{N}])?/gu;
const SPACE = /^[ \t]+$/;

const w2 = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

const BLOCK_PREV = w2("let lets make makes made help helps helped watch watched see saw seen hear heard feel felt have had has did do does done don't doesn't didn't can could will would shall should may might must to not never that than suggest suggests suggested insist insists insisted demand demands demanded recommend recommends recommended request requests requested require requires required propose proposes proposed order orders ordered advise advises advised ask asks asked important essential vital necessary imperative crucial desirable wish wishes wished lest let's how whether");
const IT_PREV = w2('yesterday today tomorrow then now later soon finally suddenly usually often sometimes however therefore meanwhile still also instead perhaps maybe once again');
const SPEECH = w2('said says asked asks replied replies answered added whispered shouted thought thinks explained noted wrote cried continued told exclaimed muttered');
const PREP_STRICT = w2('for with to from at by of on in about between among without against toward towards near upon behind beside around over under through into onto within across inside outside beyond during');
const MEASURE = w2('dollars dollar years year days day hours hour minutes minute seconds second weeks week months month miles mile feet foot inches inch pounds pound percent euros euro cents cent kilometers kilometres meters metres kilograms grams gallons liters litres degrees times');
const COLLECTIVE = w2('group team family staff committee class audience couple majority minority number variety lot rest bulk bunch handful pair series range mixture crowd public police government board council jury panel company band choir faculty army navy generation population fleet herd flock data media few little good great other same own one ones bit deal total host plenty wealth set');
const QUANT_A = w2('lot few number couple bunch handful variety range great good large small total wide whole little bit series host plenty pair deal huge wealth');
const MASS = w2('money water information traffic sugar salt rain noise pollution patience energy stress pressure homework advice furniture luggage equipment software knowledge milk rice flour oil');
const FIL_OK = w2('very really quite rather extremely incredibly');
const REL_BEFORE = w2('that what which who whom whose all with');
const rec = (o: Record<string, string>): Record<string, string> => Object.assign(Object.create(null) as Record<string, string>, o);
const SUBJ_FORM = rec({ me: 'I', him: 'he', her: 'she', them: 'they' });
const OBJ_FORM = rec({ i: 'me', he: 'him', she: 'her', we: 'us', they: 'them' });
const SING_TO_PLURAL = rec({ was: 'were', is: 'are', has: 'have', does: 'do', "doesn't": "don't", "hasn't": "haven't", "isn't": "aren't", "wasn't": "weren't" });
const PLURAL_TO_SING = rec({ were: 'was', are: 'is', have: 'has', do: 'does', "don't": "doesn't", "haven't": "hasn't", "aren't": "isn't", "weren't": "wasn't" });
const BE_VERBS = w2('was were is are');
const INDEF_FIX = rec({ are: 'is', were: 'was', have: 'has', do: 'does', "don't": "doesn't", "haven't": "hasn't", "aren't": "isn't", "weren't": "wasn't" });
const INDEF = w2('everyone everybody someone somebody anyone anybody nobody everything something nothing');
const COMPARATIVE = w2('taller bigger smaller larger faster slower older younger higher lower longer shorter stronger weaker cheaper richer smarter easier harder happier heavier lighter louder quieter closer nearer wider deeper brighter darker newer greater fewer better worse');
const SUPERLATIVE = w2('tallest biggest smallest largest fastest slowest oldest youngest highest lowest longest shortest strongest weakest cheapest richest smartest easiest hardest happiest heaviest loudest quietest widest deepest brightest darkest newest greatest best worst');
const POS_ADJ = w2('tall big small large fast slow old young good bad high low long short strong weak cheap rich smart easy hard happy heavy light loud quiet close wide deep bright dark new great much many often soon');
const NEG_AUX = w2("don't doesn't didn't can't cannot won't isn't aren't wasn't weren't haven't hasn't hadn't wouldn't couldn't shouldn't mustn't");
const NEG_WORD = rec({ no: 'any', nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere', none: 'any', never: 'ever' });
const HARDLY = w2('hardly barely scarcely');
const UNNEG = rec({ "can't": 'can', cannot: 'can', "couldn't": 'could', "won't": 'will', "wouldn't": 'would', "shouldn't": 'should', "isn't": 'is', "aren't": 'are', "wasn't": 'was', "weren't": 'were', "hasn't": 'has', "haven't": 'have', "hadn't": 'had' });
const SUBJUNCTIVE = w2('if wish wished wishes though suppose imagine unless otherwise lest whether');
const EXEMPT_START = w2('happy good merry welcome thanks thank best kind warm congratulations cheers please sincerely regards yours many hello hi dear no yes oh well and but or so because if when while although though since as after before until unless once whether what who how why where which that not now then here there');
const AMBIG_MODAL = w2('will can may might');
const PRESENT_SURE = w2('come become run overcome');
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const ROMAN_PREV = w2('chapter section part figure fig table item step appendix article volume vol phase level type class grade act scene book');
const EACH_OK = w2('group team family staff committee class audience couple majority minority number variety rest bunch pair series range mixture crowd police government board council jury panel company band choir faculty army navy generation population fleet herd flock');
const MODALS = w2("can could will would shall should may might must can't cannot won't couldn't wouldn't shouldn't mustn't");
const ARTICLE_LIKE =w2('a an the my your his her its our their each every no');
const POSS = w2('my your his her our their its');
const NOT_ADJ_HEAD = w2('other same own');
const TIME_ADV = w2('yesterday today tomorrow then now later soon finally suddenly usually often sometimes however therefore meanwhile still also instead perhaps maybe once again');

const cl = (src: string, out: string): string => {
  if (!out || src === 'I') return out;
  if (src.length > 1 && src === src.toUpperCase() && /\p{L}/u.test(src)) return out.toUpperCase();
  return src[0] !== src[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
};

export function grammarExtra(text: string, rules: GrammarRules, sents: Array<{ from: number; to: number }>, push: (issue: RawIssue) => void): void {
  const on = (k: keyof GrammarRules): boolean => rules[k] !== false;
  if (!(on('agreement') || on('pronoun') || on('modal') || on('negation') || on('fewer') || on('comparison') || on('fragment') || on('splice') || on('capital'))) return;

  const toks: Tok[] = [];
  let si = 0;
  for (const m of text.matchAll(WORD)) {
    while (si < sents.length - 1 && m.index >= sents[si].to) si++;
    toks.push({ w: m[0].toLowerCase().replace(/’/g, "'"), raw: m[0], from: m.index, to: m.index + m[0].length, s: si });
  }
  const n = toks.length;
  if (!n) return;

  const gap = (i: number): string => text.slice(toks[i - 1].to, toks[i].from);
  const adj = (i: number): boolean => i > 0 && i < n && toks[i - 1].s === toks[i].s && SPACE.test(gap(i));
  const sentStart = (i: number): boolean => i === 0 || toks[i - 1].s !== toks[i].s;
  const isCap = (t: Tok): boolean => /^\p{Lu}/u.test(t.raw) && !/^\p{Lu}+$/u.test(t.raw);
  const subjectPos = (i: number): boolean => sentStart(i) || !adj(i) || L.INTRO.has(toks[i - 1].w) || TIME_ADV.has(toks[i - 1].w);
  const add = (rule: string, from: number, to: number, message: string, fixes: Fix[]): void => { push({ from, to, cat: 'grammar', rule, message, fixes }); };
  const fx = (label: string, from: number, to: number, repl: string): Fix => ({ label, from, to, text: repl });
  const swap = (t: Tok, repl: string): Fix => fx(`Change to "${repl}"`, t.from, t.to, repl);
  const sentenceHas = (i: number, set: Set<string>): boolean => {
    const s = toks[i].s;
    for (let k = i; k >= 0 && toks[k].s === s; k--) if (set.has(toks[k].w)) return true;
    for (let k = i + 1; k < n && toks[k].s === s; k++) if (set.has(toks[k].w)) return true;
    return false;
  };
  const verbish = (j: number, pron: string): boolean => {
    if (j >= n || !adj(j)) return false;
    const w = toks[j].w;
    if (L.AUX.has(w) || L.MODAL.has(w)) return true;
    if (L.PAST_FORMS.has(w) || L.AMBIG_PAST.has(w)) return true;
    if (L.baseOfRegularPast(w) !== null || L.baseOfS(w) !== null || (w.endsWith('ed') && L.maybeVerbForm(w))) return true;
    if (L.isBaseVerb(w) && (pron === 'i' || pron === 'we' || pron === 'they' || pron === 'you')) return true;
    if (L.PRE_ADV.has(w)) return verbish(j + 1, pron);
    return false;
  };
  const sentenceWords = (s: number): number => {
    let c = 0;
    for (const t of toks) if (t.s === s) c++;
    return c;
  };
  const closedClass = (w: string): boolean => L.PREP.has(w) || L.CONJ.has(w) || L.AUX.has(w) || L.SUBJ.has(w) || L.OBJ.has(w) || L.WH.has(w);

  const nounPhrase = (i: number): { det: number; head: Tok } | null => {
    if (i < 2 || !adj(i)) return null;
    const head = toks[i - 1];
    const eachOk = EACH_OK.has(head.w) && (toks[i - 2].w === 'each' || toks[i - 2].w === 'every');
    if (head.w.includes("'") || (COLLECTIVE.has(head.w) && !eachOk) || closedClass(head.w) || L.DET.has(head.w) || L.ADV.has(head.w) || NOT_ADJ_HEAD.has(head.w)) return null;
    if (isCap(head) && !sentStart(i - 1)) return null;
    let d = -1;
    for (let k = i - 2; k >= 0 && k >= i - 4; k--) {
      if (!adj(k + 1)) break;
      const cw = toks[k].w;
      if (L.DET.has(cw) || L.NUM_WORDS.has(cw)) { d = k; break; }
      if (closedClass(cw) || (L.ADV.has(cw) && !FIL_OK.has(cw))) break;
    }
    if (d < 0) return null;
    while (d > 0 && adj(d) && (L.DET.has(toks[d - 1].w) || L.NUM_WORDS.has(toks[d - 1].w))) d--;
    for (let k = d + 1; k < i - 1; k++) if (closedClass(toks[k].w) || L.DET.has(toks[k].w)) return null;
    if (d > 0 && toks[d - 1].s === toks[d].s) {
      const bw = toks[d - 1].w;
      if (!adj(d) || L.PREP.has(bw) || /^(and|or|nor|both|either|neither|than|as|but)$/.test(bw) || REL_BEFORE.has(bw)) return null;
      if (L.AUX.has(bw) || L.MODAL.has(bw) || (!closedClass(bw) && !L.ADV.has(bw) && L.maybeVerbForm(bw))) return null;
    }
    return { det: d, head };
  };

  const agreement = on('agreement');
  const pronounRule = on('pronoun');
  const modalRule = on('modal');

  for (let i = 0; i < n; i++) {
    const t = toks[i];
    const w = t.w;
    const prev = i > 0 && adj(i) ? toks[i - 1] : null;

    if (agreement && L.SUBJ.has(w) && !(w === 'i' && t.raw !== 'I')) {
      let j = i + 1;
      if (j + 1 < n && adj(j) && L.PRE_ADV.has(toks[j].w) && adj(j + 1)) j++;
      if (j < n && adj(j)) {
        const v = toks[j];
        const vw = v.w;
        if (w === 'he' || w === 'she' || w === 'it') {
          const ok = w === 'it' ? subjectPos(i) : sentStart(i) || !adj(i) || !(BLOCK_PREV.has(prev?.w ?? '') || L.PREP.has(prev?.w ?? '') || L.SUBJ.has(prev?.w ?? '') || L.OBJ.has(prev?.w ?? ''));
          if (ok) {
            let repl = '';
            if (L.isBaseVerb(vw) || PRESENT_SURE.has(vw)) repl = L.sForm(vw);
            else if (vw === "don't") repl = "doesn't";
            else if (vw === "haven't") repl = "hasn't";
            else if (vw === "aren't") repl = "isn't";
            else if (vw === 'are') repl = 'is';
            else if (vw === 'were' && !sentenceHas(i, SUBJUNCTIVE)) repl = 'was';
            else if (vw === "weren't" && !sentenceHas(i, SUBJUNCTIVE)) repl = "wasn't";
            if (repl) add('agreement', v.from, v.to, `Subject-verb agreement: use "${repl}" with "${t.raw}"`, [swap(v, cl(v.raw, repl))]);
          }
        } else {
          let ok = true;
          if (w === 'you') ok = subjectPos(i) || L.PRE_ADV.has(prev?.w ?? '');
          if (w === 'i' && prev && ((isCap(prev) && !sentStart(i - 1)) || ROMAN_PREV.has(prev.w) || prev.w === 'war')) ok = false;
          if (ok) {
            let repl = '';
            const b = L.baseOfS(vw);
            if (b !== null && !L.isNoun(vw) && vw !== 'is') repl = b;
            else if (vw === 'is') repl = w === 'i' ? 'am' : 'are';
            else if (vw === 'was' && w !== 'i') repl = 'were';
            else if (vw === "isn't" && w !== 'i') repl = "aren't";
            else if (vw === "wasn't" && w !== 'i') repl = "weren't";
            else if (vw === "doesn't") repl = "don't";
            else if (vw === "hasn't") repl = "haven't";
            else if (vw === 'are' && w === 'i') repl = 'am';
            if (repl) add('agreement', v.from, v.to, `Subject-verb agreement: use "${repl}" with "${t.raw}"`, [swap(v, cl(v.raw, repl))]);
          }
        }
      }
    }

    if (agreement && INDEF.has(w) && i + 1 < n && adj(i + 1)) {
      const v = toks[i + 1];
      const repl = INDEF_FIX[v.w];
      if (repl) add('agreement', v.from, v.to, `Subject-verb agreement: use "${repl}" with "${t.raw}"`, [swap(v, cl(v.raw, repl))]);
    }

    if (agreement && (SING_TO_PLURAL[w] !== undefined || PLURAL_TO_SING[w] !== undefined)) {
      const np = nounPhrase(i);
      if (np) {
        const det = toks[np.det].w;
        const head = np.head;
        const beVerb = BE_VERBS.has(w);
        const subjSlot = subjectPos(np.det);
        const strongSing = det === 'a' || det === 'an' || det === 'this' || det === 'that' || det === 'each' || det === 'every' || det === 'another' || det === 'one';
        const weak = det === 'the' || POSS.has(det);
        const pluralDet = /^(these|those|both|several|many|few|two|three|four|five|six|seven|eight|nine|ten)$/.test(det);
        if (PLURAL_TO_SING[w] !== undefined) {
          const plainHead = !L.IRREGULAR_PLURAL.has(head.w) && !L.isPluralNoun(head.w) && (!head.w.endsWith('s') || /(ss|us|is)$/.test(head.w)) && !L.NUM_WORDS.has(head.w) && L.baseOfS(head.w) === null && !(L.isAdj(head.w) && !L.isNoun(head.w)) && !head.w.endsWith('ly');
          const known = L.isNoun(head.w) || L.isSingularNoun(head.w);
          const fire = plainHead && ((strongSing && (known || (det !== 'that' && det !== 'one'))) || (weak && known));
          if (fire && (beVerb || subjSlot)) {
            const want = PLURAL_TO_SING[w];
            add('agreement', t.from, t.to, `Subject-verb agreement: use "${want}" with "${head.raw}"`, [swap(t, cl(t.raw, want))]);
          }
        } else if ((pluralDet || weak) && L.isPluralNoun(head.w) && !L.NUM_WORDS.has(head.w)) {
          const measure = MEASURE.has(head.w) && (pluralDet || L.NUM_WORDS.has(det));
          if (!measure && (beVerb || subjSlot)) {
            const want = SING_TO_PLURAL[w];
            add('agreement', t.from, t.to, `Subject-verb agreement: use "${want}" with "${head.raw}"`, [swap(t, cl(t.raw, want))]);
          }
        }
      }
    }

    if (agreement && L.isBaseVerb(w) && !L.AUX.has(w) && i + 1 < n && adj(i + 1) && (ARTICLE_LIKE.has(toks[i + 1].w) || L.OBJ.has(toks[i + 1].w) || toks[i + 1].w === 'to') && !PRESENT_SURE.has(w)) {
      const np = nounPhrase(i);
      if (np && (toks[np.det].w === 'every' || toks[np.det].w === 'each') && subjectPos(np.det) && !L.baseOfS(np.head.w) && !L.PAST_FORMS.has(np.head.w)) {
        const want = L.sForm(w);
        add('agreement', t.from, t.to, `Subject-verb agreement: use "${want}" with "${np.head.raw}"`, [swap(t, cl(t.raw, want))]);
      }
    }

    if (agreement && w === 'there' && i + 2 < n && adj(i + 1)) {
      const v = toks[i + 1];
      const nx = toks[i + 2];
      if ((v.w === 'is' || v.w === 'was') && adj(i + 2)) {
        let flag = L.PLURAL_NUM.has(nx.w);
        if (flag && nx.w === 'many' && i + 3 < n && adj(i + 3) && toks[i + 3].w === 'a') flag = false;
        if (flag && i + 3 < n && adj(i + 3) && MEASURE.has(toks[i + 3].w)) flag = false;
        if (flag && prev && (prev.w === 'is' || prev.w === 'was')) flag = false;
        if (flag) {
          const want = v.w === 'is' ? 'are' : 'were';
          add('agreement', v.from, v.to, `Subject-verb agreement: use "${want}" before the plural "${nx.raw}"`, [swap(v, cl(v.raw, want))]);
        }
      } else if ((v.w === 'are' || v.w === 'were') && adj(i + 2) && (nx.w === 'a' || nx.w === 'an')) {
        const a1 = i + 3 < n && adj(i + 3) ? toks[i + 3] : null;
        const a2 = i + 4 < n && adj(i + 4) ? toks[i + 4] : null;
        let head: Tok | null = null;
        if (a1 && !QUANT_A.has(a1.w) && L.isSingularNoun(a1.w)) head = a1;
        else if (a1 && !QUANT_A.has(a1.w) && L.isAdj(a1.w) && a2 && L.isSingularNoun(a2.w) && !QUANT_A.has(a2.w)) head = a2;
        if (head) {
          const end = sents[Math.min(toks[i].s, sents.length - 1)]?.to ?? text.length;
          if (!/\b(and|or)\b|,/.test(text.slice(head.to, end))) {
            const want = v.w === 'are' ? 'is' : 'was';
            add('agreement', v.from, v.to, `Subject-verb agreement: use "${want}" before "${nx.raw} ${head.raw}"`, [swap(v, cl(v.raw, want))]);
          }
        }
      }
    }

    if (pronounRule) {
      if (PREP_STRICT.has(w) && i + 1 < n && adj(i + 1)) {
        const p = toks[i + 1];
        if (OBJ_FORM[p.w] !== undefined && !(p.w === 'i' && p.raw !== 'I')) {
          const after = i + 2;
          const clauseNext = after < n && adj(after) && (L.AUX.has(toks[after].w) || L.MODAL.has(toks[after].w) || /^(who|that|which|whom)$/.test(toks[after].w) || verbish(after, p.w));
          if (!clauseNext) add('pronoun', p.from, p.to, `Pronoun case: use "${OBJ_FORM[p.w]}" after "${t.raw}"`, [swap(p, cl(p.raw, OBJ_FORM[p.w]))]);
        } else if (i + 3 < n && adj(i + 2) && adj(i + 3) && (toks[i + 2].w === 'and' || toks[i + 2].w === 'or') && OBJ_FORM[toks[i + 3].w] !== undefined) {
          const q = toks[i + 3];
          const xok = L.OBJ.has(p.w) || p.w === 'you' || p.w === 'it' || (isCap(p) && !sentStart(i + 1));
          const after = i + 4;
          const clauseNext = after < n && adj(after) && (L.AUX.has(toks[after].w) || L.MODAL.has(toks[after].w) || verbish(after, q.w));
          if (xok && !clauseNext && !(q.w === 'i' && q.raw !== 'I')) add('pronoun', q.from, q.to, `Pronoun case: use "${OBJ_FORM[q.w]}" after "${t.raw}"`, [swap(q, cl(q.raw, OBJ_FORM[q.w]))]);
        }
      }
      if (w === 'let' && i + 1 < n && adj(i + 1)) {
        const p = toks[i + 1];
        if (OBJ_FORM[p.w] !== undefined && p.w !== 'we' && !(p.w === 'i' && p.raw !== 'I')) add('pronoun', p.from, p.to, `Pronoun case: use "${OBJ_FORM[p.w]}" after "let"`, [swap(p, cl(p.raw, OBJ_FORM[p.w]))]);
        else if (i + 3 < n && adj(i + 2) && toks[i + 2].w === 'and' && adj(i + 3) && OBJ_FORM[toks[i + 3].w] !== undefined && toks[i + 3].w !== 'we' && (L.OBJ.has(p.w) || p.w === 'you' || (isCap(p) && p.w !== 'i'))) {
          const q = toks[i + 3];
          add('pronoun', q.from, q.to, `Pronoun case: use "${OBJ_FORM[q.w]}" after "let"`, [swap(q, cl(q.raw, OBJ_FORM[q.w]))]);
        }
      }
      if (SUBJ_FORM[w] !== undefined && subjectPos(i)) {
        if (i + 2 < n && adj(i + 1) && toks[i + 1].w === 'and' && adj(i + 2)) {
          const x = toks[i + 2];
          let xe = i + 2;
          let xtxt = x.raw;
          let ok = L.OBJ.has(x.w) || L.SUBJ.has(x.w) || (isCap(x) && !L.DET.has(x.w));
          if (!ok && (POSS.has(x.w) || x.w === 'the') && i + 3 < n && adj(i + 3)) { xe = i + 3; xtxt = `${x.raw} ${toks[i + 3].raw}`; ok = true; }
          if (ok && verbish(xe + 1, x.w)) {
            const first = SUBJ_FORM[w];
            let fixText: string;
            if (L.OBJ.has(x.w) || L.SUBJ.has(x.w)) {
              const second = SUBJ_FORM[x.w] ?? (x.w === 'i' ? 'I' : x.w);
              const pair = [first, second].sort((a, b) => (a === 'I' ? 1 : 0) - (b === 'I' ? 1 : 0));
              fixText = `${cl(t.raw, pair[0])} and ${pair[1]}`;
            } else if (first === 'I') fixText = `${cl(t.raw, xtxt)} and I`;
            else fixText = `${cl(t.raw, first)} and ${xtxt}`;
            add('pronoun', t.from, toks[xe].to, `Pronoun case: use the subject form in "${text.slice(t.from, toks[xe].to)}"`, [fx(`Change to "${fixText}"`, t.from, toks[xe].to, fixText)]);
          }
        } else if ((w === 'me' || w === 'him' || w === 'them') && i + 1 < n && adj(i + 1)) {
          const nw = toks[i + 1].w;
          if ((L.AUX.has(nw) && nw !== 'will') || (L.PAST_FORMS.has(nw) && !L.AMBIG_PAST.has(nw) && !L.IDENT.has(nw))) {
            add('pronoun', t.from, t.to, `Pronoun case: use "${SUBJ_FORM[w]}" as the subject`, [swap(t, cl(t.raw, SUBJ_FORM[w]))]);
          }
        }
      }
      if (w === 'and' && i >= 1 && adj(i) && i + 1 < n && adj(i + 1) && SUBJ_FORM[toks[i + 1].w] !== undefined) {
        const q = toks[i + 1];
        let a = i - 1;
        const base = toks[a];
        const named = isCap(base) || L.SUBJ.has(base.w);
        const possNoun = a > 0 && adj(a) && (POSS.has(toks[a - 1].w) || toks[a - 1].w === 'the');
        if (named || possNoun) {
          if (!named && possNoun) a--;
          const strict = i + 2 < n && adj(i + 2) && (L.AUX.has(toks[i + 2].w) || L.MODAL.has(toks[i + 2].w) || (L.PAST_FORMS.has(toks[i + 2].w) && !L.AMBIG_PAST.has(toks[i + 2].w)));
          if (subjectPos(a) && (q.w === 'her' ? strict : verbish(i + 2, q.w)) && !L.OBJ.has(toks[a].w)) {
            add('pronoun', q.from, q.to, `Pronoun case: use "${SUBJ_FORM[q.w]}" as part of the subject`, [swap(q, cl(q.raw, SUBJ_FORM[q.w]))]);
          }
        }
      }
    }

    if (modalRule) {
      if (MODALS.has(w) && !(isCap(t) && AMBIG_MODAL.has(w)) && i + 1 < n && adj(i + 1)) {
        let ok = !(prev && (L.DET.has(prev.w) || prev.w === 'to' || L.PREP.has(prev.w)));
        if (ok && AMBIG_MODAL.has(w)) ok = !sentStart(i) && (!prev || L.SUBJ.has(prev.w) || prev.w === 'who' || (isCap(prev) && !sentStart(i - 1)));
        if (ok) {
          let j = i + 1;
          if ((L.PRE_ADV.has(toks[j].w) || toks[j].w === 'not') && j + 1 < n && adj(j + 1)) j++;
          const v = toks[j];
          const lead = /^(could|would|should|might|must|couldn't|wouldn't|shouldn't|mustn't)$/.test(w);
          const b = L.baseOfS(v.w);
          if (v.w === 'been') {
            const fixTo = lead ? 'have been' : 'be';
            add('modal', v.from, v.to, `After "${t.raw}" use "${fixTo}"`, [swap(v, cl(v.raw, fixTo))]);
          } else if (v.w === 'is' || v.w === 'are' || v.w === 'am' || v.w === 'was' || v.w === 'were') {
            add('modal', v.from, v.to, `After "${t.raw}" use the base form "be"`, [swap(v, cl(v.raw, 'be'))]);
          } else if (b !== null && !L.isNoun(v.w)) {
            add('modal', v.from, v.to, `After "${t.raw}" use the base form "${b}"`, [swap(v, cl(v.raw, b))]);
          } else if (L.PP_ONLY.has(v.w) && lead) {
            add('modal', v.from, v.to, `After "${t.raw}" use "have ${v.raw}"`, [swap(v, `have ${v.raw}`)]);
          } else if ((L.PAST_FORMS.has(v.w) && !L.AMBIG_PAST.has(v.w) && !L.IDENT.has(v.w)) || v.w === 'had' || v.w === 'did') {
            const base = L.BASE_OF_PAST.get(v.w);
            if (base) add('modal', v.from, v.to, `After "${t.raw}" use the base form "${base}"`, [swap(v, cl(v.raw, base))]);
          } else {
            const base = L.baseOfRegularPast(v.w);
            if (base && !/^(used|supposed|based|called|named|limited)$/.test(v.w)) add('modal', v.from, v.to, `After "${t.raw}" use the base form "${base}"`, [swap(v, cl(v.raw, base))]);
          }
        }
      }

      if ((w === 'did' || w === "didn't" || w === 'does' || w === "doesn't" || w === 'do' || w === "don't") && i + 1 < n && adj(i + 1)) {
        const strictAux = w !== 'do' && w !== "don't";
        let j = i + 1;
        let afterPron = false;
        if (L.SUBJ.has(toks[j].w) && j + 1 < n && adj(j + 1)) { j++; afterPron = true; }
        if ((toks[j].w === 'not' || toks[j].w === 'never') && j + 1 < n && adj(j + 1)) j++;
        const v = toks[j];
        let base: string | null = null;
        if (L.PAST_FORMS.has(v.w) && !L.AMBIG_PAST.has(v.w) && !L.IDENT.has(v.w) && v.w !== 'been' && v.w !== 'was' && v.w !== 'were' && v.w !== 'had' && v.w !== 'did') base = L.BASE_OF_PAST.get(v.w) ?? null;
        else if (v.w === 'had' && (afterPron || toks[j - 1].w === 'not')) base = 'have';
        else if (strictAux || afterPron) {
          const b = L.baseOfS(v.w);
          if (b !== null && !L.isNoun(v.w)) base = b;
          else if (strictAux) base = L.baseOfRegularPast(v.w);
        }
        if (base && v.w !== 'does') add('modal', v.from, v.to, `After "${t.raw}" use the base form "${base}"`, [swap(v, cl(v.raw, base))]);
      }
    }
  }

  if (on('negation')) {
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      if (!NEG_AUX.has(t.w) && t.w !== 'never') continue;
      for (let j = i + 1; j < n && j <= i + 4 && adj(j); j++) {
        const x = toks[j];
        if (t.w === 'never' && x.w === 'never') break;
        if (L.CONJ.has(x.w) || L.WH.has(x.w) || (L.SUBJ.has(x.w) && x.w !== 'it') || x.w === 'there' || NEG_AUX.has(x.w)) break;
        if (HARDLY.has(x.w) && UNNEG[t.w] !== undefined && j === i + 1) {
          add('negation', t.from, t.to, `Double negative: "${t.raw} ${x.raw}"`, [fx(`Change to "${UNNEG[t.w]}"`, t.from, t.to, cl(t.raw, UNNEG[t.w]))]);
          break;
        }
        const rep = NEG_WORD[x.w];
        if (rep === undefined) continue;
        if (x.w === 'no') {
          const nx = j + 1 < n && adj(j + 1) ? toks[j + 1] : null;
          const pv = toks[j - 1].w;
          if (!nx || /^(matter|for|longer|more|less|sooner|doubt)$/.test(nx.w) || /^(say|said|says|saying|take|took|taking|answer|mean|means|vote|voted)$/.test(pv)) break;
          if (nx.w === 'one') {
            add('negation', x.from, nx.to, `Double negative: "${t.raw} ... ${x.raw} one"`, [fx('Change to "anyone"', x.from, nx.to, cl(x.raw, 'anyone'))]);
            break;
          }
        }
        add('negation', x.from, x.to, `Double negative: use "${rep}" after "${t.raw}"`, [swap(x, cl(x.raw, rep))]);
        break;
      }
    }
  }

  if (on('fewer')) {
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      const nx = i + 1 < n && adj(i + 1) ? toks[i + 1] : null;
      const pv = i > 0 && adj(i) ? toks[i - 1] : null;
      if (!nx) continue;
      if (t.w === 'less' && L.isPluralNoun(nx.w) && !(pv && (L.NUM_WORDS.has(pv.w) || /^(a|no|one|another|any)$/.test(pv.w) || /^\d/.test(pv.w)))) {
        add('fewer', t.from, t.to, `Use "fewer" with countable nouns such as "${nx.raw}"`, [swap(t, cl(t.raw, 'fewer'))]);
      } else if (t.w === 'fewer' && MASS.has(nx.w)) {
        add('fewer', t.from, t.to, `Use "less" with uncountable nouns such as "${nx.raw}"`, [swap(t, cl(t.raw, 'less'))]);
      } else if (t.w === 'much' && L.isPluralNoun(nx.w) && !(pv && pv.w === 'of')) {
        add('fewer', t.from, t.to, `Use "many" with countable nouns such as "${nx.raw}"`, [swap(t, cl(t.raw, 'many'))]);
      } else if (t.w === 'many' && MASS.has(nx.w) && !(pv && pv.w === 'of')) {
        add('fewer', t.from, t.to, `Use "much" with uncountable nouns such as "${nx.raw}"`, [swap(t, cl(t.raw, 'much'))]);
      } else if (t.w === 'amount' && nx.w === 'of' && i + 2 < n && adj(i + 2)) {
        let k = i + 2;
        if (/^(the|these|those)$/.test(toks[k].w) && k + 1 < n && adj(k + 1)) k++;
        if (L.isPluralNoun(toks[k].w)) add('fewer', t.from, t.to, `Use "number" with countable nouns such as "${toks[k].raw}"`, [swap(t, cl(t.raw, 'number'))]);
      }
    }
  }

  if (on('comparison')) {
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      const nx = i + 1 < n && adj(i + 1) ? toks[i + 1] : null;
      if (!nx) continue;
      if ((t.w === 'more' && COMPARATIVE.has(nx.w) && nx.w !== 'fewer') || (t.w === 'most' && SUPERLATIVE.has(nx.w)) || (t.w === 'less' && COMPARATIVE.has(nx.w) && nx.w !== 'fewer' && nx.w !== 'better' && nx.w !== 'worse')) {
        add('comparison', t.from, nx.to, `Double comparison: "${nx.raw}" already expresses "${t.w}"`, [fx(`Delete "${t.raw}"`, t.from, nx.from, '')]);
      } else if (t.w === 'as' && POS_ADJ.has(nx.w) && i + 2 < n && adj(i + 2) && (toks[i + 2].w === 'than' || toks[i + 2].w === 'then')) {
        const th = toks[i + 2];
        add('comparison', th.from, th.to, `Comparison: use "as ${nx.w} as"`, [swap(th, cl(th.raw, 'as'))]);
      } else if ((COMPARATIVE.has(t.w) || t.w === 'more' || t.w === 'less') && nx.w === 'as' && i + 2 < n && adj(i + 2) && L.OBJ.has(toks[i + 2].w) && toks[i + 2].w !== 'her' && !sentenceHas(i, w2('same equally just'))) {
        add('comparison', nx.from, nx.to, 'Comparison: use "than" after a comparative', [swap(nx, 'than')]);
      } else if (COMPARATIVE.has(t.w) && t.w !== 'better' && t.w !== 'worse' && nx.w === 'that' && i + 2 < n && adj(i + 2) && /^(me|him|them|us|i|he|she|we|they|you|my|your|his|our|their)$/.test(toks[i + 2].w) && !sentenceHas(i, w2('so such too enough much')) && !(i > 0 && toks[i - 1].w === 'the')) {
        add('comparison', nx.from, nx.to, 'Comparison: use "than" after a comparative', [swap(nx, 'than')]);
      } else if (t.w === 'same' && nx.w === 'than' && i > 0 && toks[i - 1].w === 'the') {
        add('comparison', nx.from, nx.to, 'Use "the same as"', [swap(nx, 'as')]);
      } else if (t.w === 'as' && POS_ADJ.has(nx.w) && i > 0 && adj(i) && /^(is|are|was|were|am|be|been)$/.test(toks[i - 1].w)) {
        if (/^[.!]($|\s|["')”])/.test(`${text.slice(nx.to, nx.to + 2)} `) && !sentenceHas(i, w2('just almost nearly not equally exactly twice half quite every')) && sentenceWords(t.s) <= 8) {
          add('comparison', t.from, nx.to, 'Incomplete comparison: finish with "as ..." or drop "as"', [fx('Delete "as"', t.from, nx.from, '')]);
        }
      }
    }
  }

  if (on('capital')) {
    for (let i = 0; i < n; i++) {
      const t = toks[i];
      if (t.raw === 'i') {
        if (sentStart(i)) continue;
        const ch = text[t.to];
        const prev = i > 0 && adj(i) ? toks[i - 1] : null;
        if (prev && (ROMAN_PREV.has(prev.w) || ROMAN.test(prev.w))) continue;
        if (ch !== ' ' && ch !== '\t') continue;
        if (!adj(i + 1) || !/^\p{Ll}/u.test(toks[i + 1].raw) || ROMAN.test(toks[i + 1].w)) continue;
        if (t.from > 0 && (text[t.from - 1] === '(' || text[t.from - 1] === '[')) continue;
        add('capital', t.from, t.to, 'Capitalise the pronoun "I"', [fx('Change to "I"', t.from, t.to, 'I')]);
      } else if (/^i'(m|ll|ve|d)$/.test(t.w) && t.raw[0] === 'i') {
        add('capital', t.from, t.from + 1, 'Capitalise the pronoun "I"', [fx('Change to "I"', t.from, t.from + 1, 'I')]);
      }
    }
  }

  const firstTok: number[] = new Array<number>(sents.length).fill(-1);
  const count: number[] = new Array<number>(sents.length).fill(0);
  for (let i = 0; i < n; i++) {
    const s = toks[i].s;
    if (firstTok[s] < 0) firstTok[s] = i;
    count[s]++;
  }

  if (on('fragment')) {
    for (let s = 0; s < sents.length; s++) {
      const k = firstTok[s];
      if (k < 0 || count[s] < 4 || count[s] > 22) continue;
      const seg = text.slice(sents[s].from, sents[s].to);
      if (!/^\p{Lu}/u.test(seg) || !/[^.]\.$/.test(seg) || /[:;()"“”…/@#\d\n]/.test(seg)) continue;
      if ((seg.match(/,/g) ?? []).length > 1) continue;
      if (EXEMPT_START.has(toks[k].w) || L.NUM_WORDS.has(toks[k].w) || L.isVerb(toks[k].w)) continue;
      let verbless = true;
      let nominalNext = false;
      for (let i = k; i < k + count[s] && verbless; i++) {
        const xw = toks[i].w;
        if (L.AUX.has(xw) || L.MODAL.has(xw) || xw === 'like') { verbless = false; break; }
        if (ARTICLE_LIKE.has(xw) || L.NUM_WORDS.has(xw) || (L.PREP.has(xw) && xw !== 'to')) { nominalNext = true; continue; }
        if (L.DET.has(xw)) { nominalNext = false; continue; }
        if (L.CONJ.has(xw)) { if (xw !== 'and' && xw !== 'or') nominalNext = false; continue; }
        if (L.OBJ.has(xw) || L.SUBJ.has(xw) || L.ADV.has(xw) || xw === 'to') { nominalNext = false; continue; }
        if (i > k && isCap(toks[i])) { nominalNext = false; continue; }
        if (xw.endsWith('ly') && !L.isVerb(xw) && !/^(reply|apply|supply|rely|imply|comply|multiply|ally|fly)$/.test(xw)) continue;
        if (nominalNext) { nominalNext = L.isAdj(xw); continue; }
        if ((L.isNoun(xw) || L.isPluralNoun(xw)) && !L.maybeVerbForm(xw)) continue;
        if (L.isAdj(xw) && !L.isNoun(xw) && !L.maybeVerbForm(xw)) { nominalNext = true; continue; }
        verbless = false;
      }
      if (verbless) add('fragment', sents[s].from, sents[s].to, 'Possible sentence fragment: there is no verb', []);
    }
  }

  const clauseVerb = (i: number, first: boolean): number => {
    const t = toks[i];
    if (L.SUBJ.has(t.w) || INDEF.has(t.w)) return verbish(i + 1, t.w) ? i + 1 : -1;
    if (ARTICLE_LIKE.has(t.w) || t.w === 'this' || t.w === 'that') {
      let j = i + 1;
      while (j < n && adj(j) && L.isAdj(toks[j].w) && !L.isNoun(toks[j].w)) j++;
      if (j < n && adj(j) && (L.isNoun(toks[j].w) || L.isPluralNoun(toks[j].w)) && !closedClass(toks[j].w)) return verbish(j + 1, 'it') ? j + 1 : -1;
      return -1;
    }
    if (isCap(t) && (first ? sentStart(i) : !sentStart(i)) && !closedClass(t.w) && !L.maybeVerbForm(t.w) && !L.isNoun(t.w) && !L.isAdj(t.w) && !/(ing|ly)$/.test(t.w) && !L.DET.has(t.w) && !L.WH.has(t.w) && !L.INTRO.has(t.w) && !TIME_ADV.has(t.w) && !L.ADV.has(t.w)) return verbish(i + 1, 'it') ? i + 1 : -1;
    return -1;
  };

  if (on('splice')) {
    for (let s = 0; s < sents.length; s++) {
      const k = firstTok[s];
      if (k < 0 || k + 1 >= n) continue;
      const seg = text.slice(sents[s].from, sents[s].to);
      if (/["“”?;:()]/.test(seg)) continue;
      const kv = clauseVerb(k, true);
      if (kv < 0 || SPEECH.has(toks[kv].w)) continue;
      const hits: number[] = [];
      for (let i = kv + 1; i < n && toks[i].s === s; i++) {
        if (!/^,[ \t]+$/.test(gap(i)) || clauseVerb(i, false) < 0) continue;
        hits.push(i);
      }
      if (hits.length !== 1) continue;
      const h = hits[0];
      if (SPEECH.has(toks[clauseVerb(h, false)].w) || SPEECH.has(toks[h + 2]?.w ?? '') || L.CONJ.has(toks[h - 1].w)) continue;
      if (h >= 2 && gap(h - 1).includes(',')) continue;
      let series = false;
      for (let q = h + 1; q < n && toks[q].s === s; q++) if (L.SUBJ.has(toks[q].w) && gap(q).includes(',')) series = true;
      if (series) continue;
      if (/,\s+(and|or|but|so|yet|nor)\s/.test(text.slice(toks[h].from, sents[s].to))) continue;
      let sub = false;
      for (let q = k + 1; q < h; q++) if (L.INTRO.has(toks[q].w) || toks[q].w === 'that' || toks[q].w === 'which') sub = true;
      if (sub) continue;
      const comma = toks[h - 1].to;
      const pron = toks[h].raw[0].toUpperCase() + toks[h].raw.slice(1);
      add('splice', comma, toks[h].to, 'Comma splice: two complete sentences joined by a comma', [
        fx('Split into two sentences', comma, toks[h].to, `. ${pron}`),
        fx('Join with a semicolon', comma, toks[h].from, '; '),
      ]);
    }
  }
}
