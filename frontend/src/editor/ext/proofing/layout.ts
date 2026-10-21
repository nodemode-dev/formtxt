import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { NO_CHECK } from '../proofing-spec';
import { announce } from './kit';
import { documentLanguage, setDocumentLanguage } from './state';

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'fr-CA', label: 'French (Canada)' },
  { code: 'de-DE', label: 'German (Germany)' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'nl-NL', label: 'Dutch' },
  { code: 'sv-SE', label: 'Swedish' },
  { code: 'da-DK', label: 'Danish' },
  { code: 'nb-NO', label: 'Norwegian Bokmal' },
  { code: 'fi-FI', label: 'Finnish' },
  { code: 'pl-PL', label: 'Polish' },
  { code: 'cs-CZ', label: 'Czech' },
  { code: 'ru-RU', label: 'Russian' },
  { code: 'uk-UA', label: 'Ukrainian' },
  { code: 'tr-TR', label: 'Turkish' },
  { code: 'el-GR', label: 'Greek' },
  { code: 'he-IL', label: 'Hebrew' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'fa-IR', label: 'Persian' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'th-TH', label: 'Thai' },
  { code: 'vi-VN', label: 'Vietnamese' },
  { code: 'id-ID', label: 'Indonesian' },
];

export const RTL_LANGS = /^(he|ar|fa|ur|yi|ps|sd|ug)(-|$)/i;

export function languageLabel(code: string): string {
  if (code === NO_CHECK) return 'Do not check spelling or grammar';
  return LANGUAGES.find((l) => l.code.toLowerCase() === code.toLowerCase())?.label ?? code;
}

export function docLanguage(ed: DocEditor): string {
  return ed.doc?.meta.language || 'en-US';
}

export function languageAtSelection(ed: DocEditor): string {
  const view = ed.view;
  if (!view) return docLanguage(ed);
  const { from, to, empty, $from } = view.state.selection;
  const found = new Set<string>();
  const type = schema.marks.lang;
  if (empty) {
    const m = (view.state.storedMarks ?? $from.marks()).find((x) => x.type === type);
    return m ? String(m.attrs.code) : docLanguage(ed);
  }
  view.state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) found.add(node.marks.find((m) => m.type === type)?.attrs.code ?? docLanguage(ed));
    return true;
  });
  if (found.size === 0) return docLanguage(ed);
  return found.size === 1 ? Array.from(found)[0] : 'mixed';
}

export function applyDocumentSettings(ed: DocEditor): void {
  const view = ed.view;
  if (!view || !ed.doc) return;
  const lang = docLanguage(ed);
  setDocumentLanguage(lang);
  if (view.dom.getAttribute('lang') !== lang) view.dom.setAttribute('lang', lang);
  const hyphen = !!(ed.doc.settings as unknown as { hyphenate?: boolean }).hyphenate;
  const want = hyphen ? 'on' : 'off';
  if (view.dom.getAttribute('data-hyphenate') !== want) view.dom.setAttribute('data-hyphenate', want);
  const rtl = RTL_LANGS.test(lang);
  if (rtl && !view.dom.hasAttribute('data-lang-rtl')) view.dom.setAttribute('data-lang-rtl', '');
  if (!rtl && view.dom.hasAttribute('data-lang-rtl')) view.dom.removeAttribute('data-lang-rtl');
}

export function setLanguage(ed: DocEditor, code: string, scope: 'selection' | 'document'): string {
  const view = ed.view;
  if (!view || !ed.doc) throw new Error('Open a document first.');
  if (scope === 'document') {
    if (!code || code === NO_CHECK) throw new Error('Choose a language for the document.');
    ed.doc = { ...ed.doc, meta: { ...ed.doc.meta, language: code } };
    ed.updatePage({});
    applyDocumentSettings(ed);
    announce(`Document language set to ${languageLabel(code)}`);
    return code;
  }
  const type = schema.marks.lang;
  const { from, to, empty } = view.state.selection;
  const tr = view.state.tr;
  const mark = code && code !== docLanguage(ed) ? type.create({ code }) : null;
  if (empty) {
    const base = (view.state.storedMarks ?? view.state.selection.$from.marks()).filter((m) => m.type !== type);
    tr.setStoredMarks(mark ? mark.addToSet(base) : base);
  } else {
    tr.removeMark(from, to, type);
    if (mark) tr.addMark(from, to, mark);
  }
  view.dispatch(tr);
  announce(code === NO_CHECK ? 'Spelling and grammar checks skip this text' : `Language set to ${languageLabel(code || docLanguage(ed))}`);
  return code || docLanguage(ed);
}

export function setHyphenation(ed: DocEditor, on: boolean): boolean {
  if (!ed.doc) throw new Error('Open a document first.');
  ed.updatePage({}, { hyphenate: on });
  applyDocumentSettings(ed);
  announce(`Automatic hyphenation ${on ? 'on' : 'off'}`);
  return on;
}

export function hyphenation(ed: DocEditor): boolean {
  return !!(ed.doc?.settings as unknown as { hyphenate?: boolean } | undefined)?.hyphenate;
}

function paragraphsInSelection(ed: DocEditor): Array<{ pos: number; node: import('prosemirror-model').Node }> {
  const view = ed.view;
  const out: Array<{ pos: number; node: import('prosemirror-model').Node }> = [];
  if (!view) return out;
  const { from, to } = view.state.selection;
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') { out.push({ pos, node }); return false; }
    return true;
  });
  return out;
}

export function toggleNoHyphen(ed: DocEditor, on?: boolean): boolean {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const paras = paragraphsInSelection(ed);
  if (!paras.length) return false;
  const want = on ?? !paras[0].node.attrs.noHyphen;
  const tr = view.state.tr;
  for (const p of paras) tr.setNodeMarkup(p.pos, undefined, { ...p.node.attrs, noHyphen: want });
  view.dispatch(tr);
  announce(want ? 'This paragraph will not be hyphenated' : 'This paragraph can be hyphenated');
  return want;
}

export function insertSoftHyphen(ed: DocEditor): boolean {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  view.dispatch(view.state.tr.insertText('\u00ad').scrollIntoView());
  return true;
}

const MIRROR: Record<string, string> = { left: 'right', right: 'left' };

export function setDirection(ed: DocEditor, dir: 'ltr' | 'rtl'): number {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  const paras = paragraphsInSelection(ed);
  const tr = view.state.tr;
  let n = 0;
  for (const p of paras) {
    const was = p.node.attrs.dir === 'rtl' ? 'rtl' : 'ltr';
    if (was === dir) continue;
    const align = String(p.node.attrs.align || '');
    tr.setNodeMarkup(p.pos, undefined, { ...p.node.attrs, dir: dir === 'rtl' ? 'rtl' : '', align: MIRROR[align] ?? align });
    n++;
  }
  if (n) {
    view.dispatch(tr);
    announce(dir === 'rtl' ? 'Right-to-left text' : 'Left-to-right text');
  }
  return n;
}

export function directionAtSelection(ed: DocEditor): 'ltr' | 'rtl' {
  const p = paragraphsInSelection(ed)[0];
  return p?.node.attrs.dir === 'rtl' ? 'rtl' : 'ltr';
}

export { documentLanguage };
