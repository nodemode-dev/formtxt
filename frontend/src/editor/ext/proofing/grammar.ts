import { type Fix, type GrammarRules, type RawIssue } from './types';
import { OBJECT, sentences } from './text';

export const WORDY: Array<[string, string]> = [
  ['in order to', 'to'],
  ['due to the fact that', 'because'],
  ['owing to the fact that', 'because'],
  ['in spite of the fact that', 'although'],
  ['despite the fact that', 'although'],
  ['at this point in time', 'now'],
  ['at the present time', 'now'],
  ['at this time', 'now'],
  ['in the event that', 'if'],
  ['in the near future', 'soon'],
  ['a large number of', 'many'],
  ['a majority of', 'most'],
  ['the majority of', 'most'],
  ['a number of', 'several'],
  ['has the ability to', 'can'],
  ['have the ability to', 'can'],
  ['is able to', 'can'],
  ['are able to', 'can'],
  ['for the purpose of', 'for'],
  ['with regard to', 'about'],
  ['with regards to', 'about'],
  ['with respect to', 'about'],
  ['in regard to', 'about'],
  ['prior to', 'before'],
  ['subsequent to', 'after'],
  ['in close proximity to', 'near'],
  ['make a decision', 'decide'],
  ['give consideration to', 'consider'],
  ['on a daily basis', 'daily'],
  ['on a regular basis', 'regularly'],
  ['each and every', 'each'],
  ['first and foremost', 'first'],
  ['in the process of', ''],
  ['it is important to note that', ''],
  ['it should be noted that', ''],
  ['needless to say', ''],
  ['for all intents and purposes', 'effectively'],
  ['at the end of the day', 'finally'],
  ['in my opinion', ''],
  ['very unique', 'unique'],
  ['completely finished', 'finished'],
  ['past history', 'history'],
  ['future plans', 'plans'],
  ['end result', 'result'],
  ['basic fundamentals', 'fundamentals'],
  ['whether or not', 'whether'],
  ['until such time as', 'until'],
  ['in the absence of', 'without'],
  ['a total of', ''],
];

const WORDY_RE = new RegExp(`(?<![\\p{L}])(${[...WORDY].sort((a, b) => b[0].length - a[0].length).map(([p]) => p.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}])`, 'giu');

const IRREGULAR = 'known|made|given|taken|seen|done|written|shown|found|held|built|sent|told|kept|set|run|begun|chosen|driven|eaten|fallen|forgotten|gotten|hidden|spoken|stolen|thrown|worn|won|brought|bought|caught|taught|thought|lost|paid|put|read|said|sold|understood|cut|hit|let|shut|born|broken|drawn|grown|ridden|risen|sung|swum|torn|woken';
const EMOTIVE = new Set(['tired', 'excited', 'interested', 'worried', 'surprised', 'pleased', 'bored', 'scared', 'married', 'supposed', 'concerned', 'delighted', 'determined', 'disappointed', 'amazed', 'confused', 'embarrassed', 'exhausted', 'frightened', 'annoyed', 'satisfied', 'thrilled', 'shocked', 'relaxed', 'blessed', 'used', 'excited', 'allowed', 'involved', 'related', 'located', 'finished', 'prepared', 'qualified', 'experienced', 'limited', 'advanced', 'detailed', 'needed', 'aged', 'red', 'hundred', 'indeed', 'need', 'speed', 'bed', 'seed', 'feed', 'weed', 'shed', 'bleed', 'breed', 'proceed', 'succeed', 'exceed']);
const PASSIVE_RE = new RegExp(`(?<![\\p{L}'])(?:is|are|was|were|be|been|being|am)\\s+(?:\\p{L}+ly\\s+)?(\\p{L}+(?:ed)|${IRREGULAR})(?![\\p{L}'-])`, 'giu');

export function passiveMatches(text: string): Array<{ index: number; length: number }> {
  const out: Array<{ index: number; length: number }> = [];
  for (const m of text.matchAll(PASSIVE_RE)) {
    const verb = m[1].toLowerCase();
    if (EMOTIVE.has(verb) || /^\p{L}{0,2}ed$/u.test(verb)) continue;
    out.push({ index: m.index, length: m[0].length });
  }
  return out;
}

const VOWEL_AN =/^(hour|honest|honou?r|heir|herb)/i;
const CONS_A = /^(uni[cflqostv]|use|usu|uti|ubiq|euro|eulog|euph|one(?![a-z])|once|ewe|utensil|ukulele|uranium|urin)/i;

function caseLike(src: string, out: string): string {
  if (!out) return out;
  if (src.length > 1 && src === src.toUpperCase() && /\p{L}/u.test(src)) return out.toUpperCase();
  return src[0] !== src[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
}

function vowelSound(word: string): boolean | null {
  const w = word.replace(/^['\u2019-]+/, '');
  if (w.length < 2) return null;
  if (w === w.toUpperCase() && /\p{L}/u.test(w)) return null;
  if (VOWEL_AN.test(w)) return true;
  if (CONS_A.test(w)) return false;
  return /^[aeiou]/i.test(w);
}

export function grammarIssues(text: string, rules: GrammarRules, skip: (i: number) => boolean): RawIssue[] {
  const out: RawIssue[] = [];
  const push = (issue: RawIssue): void => { if (!skip(issue.from)) out.push(issue); };
  const fix = (label: string, from: number, to: number, repl: string): Fix => ({ label, from, to, text: repl });

  if (rules.repeated) {
    const re = /(?<![\p{L}\p{N}])(\p{L}[\p{L}'\u2019]*)([ \t]+)\1(?![\p{L}\p{N}'\u2019])/giu;
    for (const m of text.matchAll(re)) {
      if (/^(had|that)$/i.test(m[1])) continue;
      push({ from: m.index, to: m.index + m[0].length, cat: 'grammar', rule: 'repeated', message: `Repeated word: ${m[1]}`, fixes: [fix(`Delete the second "${m[1]}"`, m.index, m.index + m[0].length, m[1])] });
    }
  }

  if (rules.article) {
    const re = /(?<![\p{L}\p{N}'\u2019])(an?)([ \t]+)(\p{L}[\p{L}'\u2019-]*)/giu;
    for (const m of text.matchAll(re)) {
      const vowel = vowelSound(m[3]);
      if (vowel === null) continue;
      const art = m[1];
      const lower = art.toLowerCase();
      if (vowel && lower === 'a') push({ from: m.index, to: m.index + art.length, cat: 'grammar', rule: 'article', message: `Use "an" before "${m[3]}"`, fixes: [fix('Change to "an"', m.index, m.index + art.length, caseLike(art, 'an'))] });
      else if (!vowel && lower === 'an') push({ from: m.index, to: m.index + art.length, cat: 'grammar', rule: 'article', message: `Use "a" before "${m[3]}"`, fixes: [fix('Change to "a"', m.index, m.index + art.length, caseLike(art, 'a'))] });
    }
  }

  const sents = sentences(text);

  if (rules.capital) {
    for (const s of sents) {
      const first = text[s.from];
      if (!first || first !== first.toLowerCase() || first === first.toUpperCase()) continue;
      const token = /^\S+/.exec(text.slice(s.from))?.[0] ?? '';
      if (!/^\p{Ll}[\p{Ll}'\u2019]*[,.;:!?)"'\u201d]*$/u.test(token)) continue;
      push({ from: s.from, to: s.from + 1, cat: 'grammar', rule: 'capital', message: 'Start the sentence with a capital letter', fixes: [fix('Capitalise', s.from, s.from + 1, first.toUpperCase())] });
    }
  }

  if (rules.spaces) {
    for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
      push({ from: m.index, to: m.index + m[0].length, cat: 'grammar', rule: 'spaces', message: 'Extra spaces', fixes: [fix('Use one space', m.index, m.index + m[0].length, ' ')] });
    }
  }

  if (rules.punctuation) {
    for (const m of text.matchAll(/(?<=\p{L}{2})([,;:!?])(?=\p{L})/gu)) {
      const at = m.index;
      push({ from: at, to: at + 2, cat: 'grammar', rule: 'punctuation', message: 'Add a space after the punctuation mark', fixes: [fix('Add a space', at + 1, at + 1, ' ')] });
    }
    for (const m of text.matchAll(/(?<=\p{Ll}{2})\.(?=\p{Lu}\p{Ll})/gu)) {
      const at = m.index;
      let a = at;
      let b = at;
      while (a > 0 && !/\s/.test(text[a - 1])) a--;
      while (b < text.length && !/\s/.test(text[b])) b++;
      const token = text.slice(a, b);
      if ((token.match(/\./g) ?? []).length > 1 || /[/@\\]/.test(token)) continue;
      push({ from: at, to: at + 2, cat: 'grammar', rule: 'punctuation', message: 'Add a space after the period', fixes: [fix('Add a space', at + 1, at + 1, ' ')] });
    }
    for (const m of text.matchAll(/(?<=\p{L}) +([,.;:!?])(?![,.;:!?])(?=\s|$)/gu)) {
      push({ from: m.index, to: m.index + m[0].length, cat: 'grammar', rule: 'punctuation', message: 'Remove the space before the punctuation mark', fixes: [fix('Remove the space', m.index, m.index + m[0].length - 1, '')] });
    }
  }

  if (rules.long) {
    for (const s of sents) {
      const words = (text.slice(s.from, s.to).match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) ?? []).length;
      if (words > 40) push({ from: s.from, to: s.to, cat: 'clarity', rule: 'long', message: `Long sentence (${words} words). Consider splitting it.`, fixes: [] });
    }
  }

  if (rules.passive) {
    for (const m of passiveMatches(text)) {
      push({ from: m.index, to: m.index + m.length, cat: 'clarity', rule: 'passive', message: 'Passive voice. Consider rewriting with the doer as the subject.', fixes: [] });
    }
  }

  if (rules.wordy) {
    for (const m of text.matchAll(WORDY_RE)) {
      const key = m[1].toLowerCase().replace(/\s+/g, ' ');
      const entry = WORDY.find(([p]) => p === key);
      if (!entry) continue;
      const repl = entry[1];
      if (repl) {
        push({ from: m.index, to: m.index + m[0].length, cat: 'conciseness', rule: 'wordy', message: `Wordy: use "${repl}"`, fixes: [fix(`Replace with "${repl}"`, m.index, m.index + m[0].length, caseLike(m[0], repl))] });
      } else {
        const after = /^([ \t]+)(\p{L})/u.exec(text.slice(m.index + m[0].length));
        const upper = m[0][0] !== m[0][0].toLowerCase();
        const f = after
          ? fix('Delete the phrase', m.index, m.index + m[0].length + after[0].length, upper ? after[2].toUpperCase() : after[2])
          : fix('Delete the phrase', m.index, m.index + m[0].length, '');
        push({ from: m.index, to: m.index + m[0].length, cat: 'conciseness', rule: 'wordy', message: 'Wordy: this phrase can usually be deleted', fixes: [f] });
      }
    }
  }

  if (rules.confusion) {
    for (const c of CONFUSIONS) {
      for (const m of text.matchAll(c.re)) {
        const wrong = (c.part === 'first' ? /^\S+/ : /\S+$/).exec(m[0])?.[0] ?? '';
        const at = m.index + (c.part === 'first' ? 0 : m[0].length - wrong.length);
        const right = caseLike(wrong, c.to);
        push({ from: at, to: at + wrong.length, cat: 'grammar', rule: 'confusion', message: c.message(right), fixes: [fix(`Change to "${right}"`, at, at + wrong.length, right)] });
      }
    }
  }

  const swap = (rule: string, cat: RawIssue['cat'], list: Array<[string, string]>, message: (w: string, r: string) => string): void => {
    for (const [wrong, right] of list) {
      for (const m of text.matchAll(re(wrong))) {
        const r = caseLike(m[0], right);
        push({ from: m.index, to: m.index + m[0].length, cat, rule, message: message(m[0], r), fixes: r ? [fix(`Change to "${r}"`, m.index, m.index + m[0].length, r)] : [] });
      }
    }
  };
  if (rules.formal) {
    swap('formal', 'formality', CONTRACTIONS, (w, r) => `In formal writing, spell out "${w}" as "${r}"`);
    swap('formal', 'formality', CASUAL, (w, r) => `"${w}" is casual; consider "${r}"`);
  }
  if (rules.inclusive !== false) swap('inclusive', 'inclusiveness', INCLUSIVE, (w, r) => `Consider the inclusive "${r}" instead of "${w}"`);
  if (rules.vocabulary !== false) {
    for (const m of text.matchAll(re('(very|really|extremely|basically|literally|totally)'))) {
      const after = /^([ \t]+)/.exec(text.slice(m.index + m[0].length));
      const end = m.index + m[0].length + (after ? after[0].length : 0);
      push({ from: m.index, to: m.index + m[0].length, cat: 'clarity', rule: 'vocabulary', message: `"${m[0]}" adds little; use a more precise word or delete it`, fixes: [fix('Delete it', m.index, end, '')] });
    }
    for (const c of CLICHES) for (const m of text.matchAll(re(c))) push({ from: m.index, to: m.index + m[0].length, cat: 'clarity', rule: 'vocabulary', message: 'Cliche: say what you mean directly', fixes: [] });
  }

  return out.filter((i) => !text.slice(i.from, i.to).includes(OBJECT) || i.rule === 'long');
}

const APOS = "['’]";
const CONTRACTIONS: Array<[string, string]> = [
  [`can${APOS}t`, 'cannot'], [`won${APOS}t`, 'will not'], [`don${APOS}t`, 'do not'], [`doesn${APOS}t`, 'does not'], [`didn${APOS}t`, 'did not'],
  [`isn${APOS}t`, 'is not'], [`aren${APOS}t`, 'are not'], [`wasn${APOS}t`, 'was not'], [`weren${APOS}t`, 'were not'], [`haven${APOS}t`, 'have not'],
  [`hasn${APOS}t`, 'has not'], [`hadn${APOS}t`, 'had not'], [`wouldn${APOS}t`, 'would not'], [`couldn${APOS}t`, 'could not'], [`shouldn${APOS}t`, 'should not'],
  [`it${APOS}s`, 'it is'], [`I${APOS}m`, 'I am'], [`you${APOS}re`, 'you are'], [`we${APOS}re`, 'we are'], [`they${APOS}re`, 'they are'],
  [`I${APOS}ve`, 'I have'], [`we${APOS}ve`, 'we have'], [`you${APOS}ve`, 'you have'], [`I${APOS}ll`, 'I will'], [`we${APOS}ll`, 'we will'],
  [`they${APOS}ll`, 'they will'], [`let${APOS}s`, 'let us'], [`that${APOS}s`, 'that is'], [`there${APOS}s`, 'there is'], [`what${APOS}s`, 'what is'],
];
const CASUAL: Array<[string, string]> = [
  ['gonna', 'going to'], ['wanna', 'want to'], ['gotta', 'have to'], ['kinda', 'somewhat'], ['sorta', 'somewhat'], ['a lot of', 'many'], ['lots of', 'many'],
  ['stuff', 'material'], ['things like that', 'similar items'], ['kids', 'children'], ['guys', 'everyone'], ['okay', 'acceptable'], ['awesome', 'excellent'],
  ['huge', 'substantial'], ['get rid of', 'remove'], ['figure out', 'determine'], ['find out', 'discover'], ['check out', 'examine'], ['come up with', 'devise'],
];
const INCLUSIVE: Array<[string, string]> = [
  ['chairman', 'chair'], ['chairwoman', 'chair'], ['mankind', 'humankind'], ['manpower', 'workforce'], ['man-made', 'artificial'], ['manmade', 'artificial'],
  ['policeman', 'police officer'], ['policemen', 'police officers'], ['fireman', 'firefighter'], ['firemen', 'firefighters'], ['businessman', 'businessperson'],
  ['businessmen', 'businesspeople'], ['salesman', 'salesperson'], ['salesmen', 'salespeople'], ['spokesman', 'spokesperson'], ['mailman', 'mail carrier'],
  ['stewardess', 'flight attendant'], ['cameraman', 'camera operator'], ['workmen', 'workers'], ['foreman', 'supervisor'], ['blacklist', 'blocklist'],
  ['whitelist', 'allowlist'], ['manhole', 'maintenance hole'], ['housewife', 'homemaker'],
];
const CLICHES = ['think outside the box', 'low-hanging fruit', 'touch base', 'circle back', 'move the needle', 'game changer', 'paradigm shift', 'in this day and age', 'last but not least'].filter((c) => !WORDY.some(([w]) => w === c));

interface Confusion {
  re: RegExp;
  part: 'first' | 'last';
  to: string;
  message: (right: string) => string;
}

const L = '(?<![\\p{L}\\p{N}\'\u2019])';
const R = '(?![\\p{L}\\p{N}\'\u2019])';
const re = (body: string): RegExp => new RegExp(`${L}${body}${R}`, 'giu');
const did = (right: string, why: string): string => `Did you mean "${right}" (${why})?`;

const CONFUSIONS: Confusion[] = [
  { re: re('its([ \\t]+)(a|an|the|been|going|not|just|very|so|also|now|only|really|easy|hard|possible|important|clear|true|getting|being|too)'), part: 'first', to: "it's", message: (r) => did(r, 'it is or it has') },
  { re: re('it[\'\u2019]s([ \\t]+)(own|name|shape|size|colou?r|purpose|features?|owner|users?)'), part: 'first', to: 'its', message: (r) => did(r, 'belonging to it') },
  { re: re('their([ \\t]+)(is|are|was|were|isn[\'\u2019]t|aren[\'\u2019]t|wasn[\'\u2019]t|weren[\'\u2019]t|has been|have been)'), part: 'first', to: 'there', message: (r) => did(r, 'in that place or existing') },
  { re: re('their([ \\t]+)(going|coming|doing|not|always|never|all)'), part: 'first', to: "they're", message: (r) => did(r, 'they are') },
  { re: re('there([ \\t]+)(own|house|car|cars|home|friends?|family|children|parents|team|names?|jobs?|books?|money|dog|cat|kids?)'), part: 'first', to: 'their', message: (r) => did(r, 'belonging to them') },
  { re: re('there([ \\t]+)(going|coming|doing)'), part: 'first', to: "they're", message: (r) => did(r, 'they are') },
  { re: re('they[\'\u2019]re([ \\t]+)(own|house|car|cars|home|friends?|family|children|parents|team|names?|jobs?|books?|money|dog|cat|kids?)'), part: 'first', to: 'their', message: (r) => did(r, 'belonging to them') },
  { re: re('(more|less|better|worse|bigger|smaller|larger|greater|rather|fewer|higher|lower|faster|slower|older|younger|taller|longer|shorter|easier|harder|stronger|weaker|cheaper|different|other)([ \\t]+)then'), part: 'last', to: 'than', message: (r) => did(r, 'used in comparisons') },
  { re: re('(if|and|until|from|since|so|first)([ \\t]+)than'), part: 'last', to: 'then', message: (r) => did(r, 'at that time or next') },
  { re: re('your([ \\t]+)(a|an|the|going|welcome|not|being|doing|right|wrong|so|very|too|always|never)'), part: 'first', to: "you're", message: (r) => did(r, 'you are') },
  { re: re('you[\'\u2019]re([ \\t]+)(own|name|house|car|friends?|mom|dad|family|book|email|account|order|files?|documents?|team)'), part: 'first', to: 'your', message: (r) => did(r, 'belonging to you') },
  { re: re('(could|would|should|must|might)([ \\t]+)of'), part: 'last', to: 'have', message: (r) => `Use "${r}", not "of"` },
];
