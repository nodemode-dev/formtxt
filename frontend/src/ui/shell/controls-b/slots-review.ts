import { panelOpen } from '../../../editor/ext/ui';
import { allComments } from '../../../editor/ext/review/core';
import { currentMode } from '../../../editor/ext/review/track';
import { LANGUAGES, languageAtSelection } from '../../../editor/ext/proofing/layout';
import { NO_CHECK } from '../../../editor/ext/proofing-spec';
import { schema } from '../../../editor/schema';
import { type Ctl, type MI, SEP, button, call, ed, run, schedule, track } from './kit';

const S = (c: Ctl): HTMLElement => track(c).root;

const MARKUP: Array<[string, string]> = [['simple', 'Simple Markup'], ['all', 'All Markup'], ['none', 'No Markup'], ['original', 'Original']];
const markupNow = (): string => ed().root.dataset.markup ?? 'all';

const commentIdAtCaret = (): string => {
  const v = ed().view;
  if (!v) return '';
  const sel = v.state.selection;
  const marks = sel.$from.marks().concat(sel.$to.marks()).concat(sel.$from.nodeAfter?.marks ?? []);
  for (const m of marks) if (m.type === schema.marks.comment && Array.isArray(m.attrs.ids) && m.attrs.ids.length) return String(m.attrs.ids[0]);
  return '';
};

const deleteComment = (): void => {
  const id = commentIdAtCaret();
  if (id) run('review.deleteComment', { id });
  else run('review.nextComment');
};

const deleteAll = async (): Promise<void> => {
  for (const id of Object.keys(allComments())) await call('review.deleteComment', { id }).catch(() => undefined);
  schedule();
};

const stopTracking = async (): Promise<void> => {
  if (currentMode() === 'suggesting') await call('review.toggleTracking').catch(() => undefined);
};

const acceptMenu = (): MI[] => [
  { label: 'Accept and Move to Next', run: () => { void call('review.acceptChange').then(() => call('review.nextChange')).catch(() => undefined); } },
  { label: 'Accept This Change', cmd: 'review.acceptChange' },
  { label: 'Accept All Changes', cmd: 'review.acceptAll' },
  { label: 'Accept All Changes and Stop Tracking', run: () => { void call('review.acceptAll').then(stopTracking).catch(() => undefined); } },
];

const rejectMenu = (): MI[] => [
  { label: 'Reject and Move to Next', run: () => { void call('review.rejectChange').then(() => call('review.nextChange')).catch(() => undefined); } },
  { label: 'Reject Change', cmd: 'review.rejectChange' },
  { label: 'Reject All Changes', cmd: 'review.rejectAll' },
  { label: 'Reject All Changes and Stop Tracking', run: () => { void call('review.rejectAll').then(stopTracking).catch(() => undefined); } },
];

const translateMenu = (): MI[] => [
  { label: 'Translate Selection...', icon: 'translate', run: () => run('ai.translate', { scope: 'selection' }) },
  { label: 'Translate Document...', icon: 'translate', run: () => run('ai.translate', { scope: 'document' }) },
  SEP,
  { head: 'Quick languages' },
  ...([['Spanish', 'es'], ['French', 'fr'], ['German', 'de'], ['Japanese', 'ja'], ['Chinese (Simplified)', 'zh-CN']] as const).map(([n, c]): MI => ({ label: n, run: () => run('ai.translate', { language: c, scope: 'selection' }) })),
];

const current = (): string => { try { return languageAtSelection(ed()); } catch { return ''; } };

const languageMenu = (): MI[] => [
  { label: 'Set Proofing Language...', icon: 'language', cmd: 'proofing.language' },
  { label: 'Do Not Check Spelling or Grammar', checked: () => current() === NO_CHECK, run: () => run('proofing.doNotCheck', { on: current() !== NO_CHECK }) },
  SEP,
  { head: 'Proofing language' },
  ...LANGUAGES.slice(0, 12).map((l): MI => ({ label: l.label, radio: true, checked: () => current().toLowerCase() === l.code.toLowerCase(), run: () => run('proofing.setLanguage', { code: l.code, scope: 'selection' }) })),
  { label: 'More Languages', sub: LANGUAGES.slice(12).map((l): MI => ({ label: l.label, radio: true, checked: () => current().toLowerCase() === l.code.toLowerCase(), run: () => run('proofing.setLanguage', { code: l.code, scope: 'selection' }) })) },
];

interface MarkupState { insertions: boolean; formatting: boolean; comments: boolean; hidden: string[]; authors: string[] }
let markupInfo: MarkupState = { insertions: true, formatting: true, comments: true, hidden: [], authors: [] };

const refreshMarkup = (): void => { void call('review.markupFilter').then((r) => { markupInfo = r as MarkupState; }).catch(() => undefined); };

const showMarkupMenu = (): MI[] => {
  refreshMarkup();
  const people: MI[] = markupInfo.authors.length
    ? markupInfo.authors.map((a): MI => ({ label: a || 'Unknown', checked: () => !markupInfo.hidden.includes(a), run: () => { void call('review.markupFilter', { author: a }).then((r) => { markupInfo = r as MarkupState; }); } }))
    : [{ label: 'No reviewers yet', disabled: () => true }];
  return [
    { head: 'Show Markup' },
    { label: 'Comments', checked: () => markupInfo.comments, run: () => { void call('review.markupFilter', { kind: 'comments' }).then((r) => { markupInfo = r as MarkupState; }); } },
    { label: 'Insertions and Deletions', checked: () => markupInfo.insertions, run: () => { void call('review.markupFilter', { kind: 'insertions' }).then((r) => { markupInfo = r as MarkupState; }); } },
    { label: 'Formatting', checked: () => markupInfo.formatting, run: () => { void call('review.markupFilter', { kind: 'formatting' }).then((r) => { markupInfo = r as MarkupState; }); } },
    SEP,
    { label: 'Specific People', sub: people },
  ];
};

const modeName = (m: string): string => (m === 'suggesting' ? 'Suggesting' : m === 'viewing' ? 'Viewing' : 'Editing');

export function reviewSlots(): Record<string, () => HTMLElement> {
  return {
    'b.spelling': () => S(button({ label: 'Spelling & Grammar', icon: 'spelling', large: true, split: true, cmd: 'proofing.checkDocument', menu: [
      { label: 'Open Editor Panel', cmd: 'proofing.editorPanel' },
      { label: 'Next Issue', cmd: 'proofing.nextIssue' },
      { label: 'Previous Issue', cmd: 'proofing.previousIssue' },
      { label: 'Apply All Automatic Fixes', cmd: 'proofing.fixAll' },
      SEP,
      { label: 'Spelling and Grammar Options...', cmd: 'proofing.options' },
      { label: 'Custom Dictionary...', cmd: 'proofing.dictionaryDialog' },
    ] })),
    'b.readAloud': () => S(button({ label: 'Read Aloud', icon: 'readAloud', large: true, split: true, cmd: 'speech.readAloud', menu: [
      { label: 'Read Aloud', cmd: 'speech.readAloud' },
      { label: 'Pause', cmd: 'speech.pause' },
      { label: 'Resume', cmd: 'speech.resume' },
      { label: 'Stop', cmd: 'speech.stop' },
      SEP,
      { label: 'Reading Options...', cmd: 'speech.panel' },
    ] })),
    'b.access': () => S(button({ label: 'Check Accessibility', icon: 'accessibility', large: true, split: true, cmd: 'access.check', menu: [
      { label: 'Check Accessibility', cmd: 'access.check' },
      { label: 'Accessibility Panel', cmd: 'access.panel' },
    ] })),
    'b.translate': () => S(button({ label: 'Translate', icon: 'translate', large: true, menu: translateMenu })),
    'b.language': () => S(button({ label: 'Language', icon: 'language', large: true, menu: languageMenu })),
    'b.newComment': () => S(button({ label: 'New Comment', icon: 'newComment', large: true, cmd: 'review.newComment' })),
    'b.deleteComment': () => S(button({ label: 'Delete', icon: 'deleteComment', large: true, split: true, run: deleteComment, menu: [
      { label: 'Delete', icon: 'trash', run: deleteComment },
      { label: 'Delete All Comments in Document', icon: 'trash', run: () => { void deleteAll(); } },
    ] })),
    'b.showComments': () => S(button({ label: 'Show Comments', icon: 'comment', text: true, menu: [
      { label: 'Contextual', radio: true, checked: () => !panelOpen('review'), run: () => { if (panelOpen('review')) run('review.panel'); } },
      { label: 'List', radio: true, checked: () => panelOpen('review'), run: () => { if (!panelOpen('review')) run('review.panel'); } },
    ] })),
    'b.track': () => S(button({ label: 'Track Changes', icon: 'trackChanges', large: true, split: true, run: () => run('review.toggleTracking'), checked: () => currentMode() === 'suggesting', menu: [
      { label: 'Track Changes', checked: () => currentMode() === 'suggesting', run: () => run('review.toggleTracking') },
      SEP,
      { label: 'Editing', radio: true, checked: () => currentMode() === 'editing', run: () => run('review.setMode', { mode: 'editing' }) },
      { label: 'Suggesting', radio: true, checked: () => currentMode() === 'suggesting', run: () => run('review.setMode', { mode: 'suggesting' }) },
      { label: 'Viewing', radio: true, checked: () => currentMode() === 'viewing', run: () => run('review.setMode', { mode: 'viewing' }) },
    ] })),
    'b.display': () => S(button({ label: 'Display for Review', icon: 'showMarkup', text: true, menu: MARKUP.map(([k, n]): MI => ({ label: n, radio: true, checked: () => markupNow() === k, run: () => run('review.showMarkup', { mode: k }) })), dyn: () => ({ label: MARKUP.find(([k]) => k === markupNow())?.[1] ?? 'All Markup' }) })),
    'b.showMarkup': () => S(button({ label: 'Show Markup', icon: 'showMarkupMenu', text: true, menu: showMarkupMenu })),
    'b.editMode': () => S(button({ label: 'Editing Mode', icon: 'editMode', text: true, menu: [
      { label: 'Editing', radio: true, checked: () => currentMode() === 'editing', run: () => run('review.setMode', { mode: 'editing' }) },
      { label: 'Suggesting', radio: true, checked: () => currentMode() === 'suggesting', run: () => run('review.setMode', { mode: 'suggesting' }) },
      { label: 'Viewing', radio: true, checked: () => currentMode() === 'viewing', run: () => run('review.setMode', { mode: 'viewing' }) },
    ], dyn: () => ({ label: modeName(currentMode()) }) })),
    'b.reviewPane': () => S(button({ label: 'Reviewing Pane', icon: 'reviewPane', text: true, run: () => run('review.panel'), checked: () => panelOpen('review') })),
    'b.accept': () => S(button({ label: 'Accept', icon: 'accept', large: true, split: true, run: () => { void call('review.acceptChange').then(() => call('review.nextChange')).catch(() => undefined); }, menu: acceptMenu })),
    'b.reject': () => S(button({ label: 'Reject', icon: 'reject', large: true, split: true, run: () => { void call('review.rejectChange').then(() => call('review.nextChange')).catch(() => undefined); }, menu: rejectMenu })),
    'b.compare': () => S(button({ label: 'Compare', icon: 'compare', large: true, menu: [
      { label: 'Compare...', cmd: 'review.compareDocuments' },
      { label: 'Combine...', cmd: 'review.combineDocuments' },
      { label: 'Suggest Edits from Document...', cmd: 'review.suggestFromDocument' },
    ] })),
  };
}
