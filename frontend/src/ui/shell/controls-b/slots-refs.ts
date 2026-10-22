import { STYLES } from '../../../editor/ext/refs/cite';
import { sourcesOf, styleOf } from '../../../editor/ext/refs/util';
import { mergeData } from '../../../editor/ext/versions/merge';
import { type Ctl, type GItem, type Info, type MI, SEP, button, call, composite, ed, field, galleryButton, run, schedule, track } from './kit';
import { mergeInfo, paraStyle } from './state-b';
import { el } from '../../dom';

const S = (c: Ctl): HTMLElement => track(c).root;

const tocPreview = (title: string, manual: boolean): string => {
  const rows: Array<[string, number, number]> = [[manual ? 'Type chapter title (level 1)' : 'Heading 1', 0, 1], [manual ? 'Type chapter title (level 2)' : 'Heading 2', 1, 1], [manual ? 'Type chapter title (level 3)' : 'Heading 3', 2, 2], [manual ? 'Type chapter title (level 1)' : 'Heading 1', 0, 3]];
  return `<span class="ft-bprev"><b class="ft-bprev-h">${title}</b>${rows.map(([t, l, n]) => `<span class="ft-bprev-l" style="padding-left:${l * 10}px"><span>${t}</span><i></i><em>${manual ? '1' : n}</em></span>`).join('')}</span>`;
};

const bibPreview = (title: string): string => `<span class="ft-bprev"><b class="ft-bprev-h">${title}</b><span class="ft-bprev-r">Author, A. (2020). Title of a source. Publisher.</span><span class="ft-bprev-r">Author, B. (2018). Another source title. Journal, 4(2).</span></span>`;

const tocItems = (): GItem[] => [
  { id: 'auto1', name: 'Automatic Table 1', title: 'Automatic Table 1: Contents with page numbers and links', thumb: () => tocPreview('Contents', false), run: () => run('references.insertTocStyle', { variant: 'auto1' }) },
  { id: 'auto2', name: 'Automatic Table 2', title: 'Automatic Table 2: Table of Contents with page numbers and links', thumb: () => tocPreview('Table of Contents', false), run: () => run('references.insertTocStyle', { variant: 'auto2' }) },
  { id: 'manual', name: 'Manual Table', title: 'Manual Table: Table of Contents without links', thumb: () => tocPreview('Table of Contents', true), run: () => run('references.insertTocStyle', { variant: 'manual' }) },
];

const bibItems = (): GItem[] => [
  { id: 'bibliography', name: 'Bibliography', thumb: () => bibPreview('Bibliography'), run: () => run('references.insertBibliographyStyle', { title: 'Bibliography' }) },
  { id: 'references', name: 'References', thumb: () => bibPreview('References'), run: () => run('references.insertBibliographyStyle', { title: 'References' }) },
  { id: 'works', name: 'Works Cited', thumb: () => bibPreview('Works Cited'), run: () => run('references.insertBibliographyStyle', { title: 'Works Cited' }) },
];

const level = (n: number): string => (n === 0 ? 'Normal' : `Heading${n}`);

const addTextMenu = (): MI[] => [
  { label: 'Do Not Show in Table of Contents', radio: true, checked: () => !/^Heading[123]$/.test(paraStyle()), run: () => run('paragraph.style', { style: level(0) }) },
  { label: 'Level 1', radio: true, checked: () => paraStyle() === 'Heading1', run: () => run('paragraph.style', { style: level(1) }) },
  { label: 'Level 2', radio: true, checked: () => paraStyle() === 'Heading2', run: () => run('paragraph.style', { style: level(2) }) },
  { label: 'Level 3', radio: true, checked: () => paraStyle() === 'Heading3', run: () => run('paragraph.style', { style: level(3) }) },
];

const sourceLabel = (s: { authors: Array<{ family: string }>; year: string; title: string }): string => {
  const who = s.authors[0]?.family || s.title || 'Source';
  return s.year ? `${who}${s.authors.length > 1 ? ' et al.' : ''} (${s.year})` : who;
};

const citeMenu = (): MI[] => {
  const list = env_sources();
  const out: MI[] = list.map((s) => ({ label: sourceLabel(s), icon: 'citation', run: () => run('references.insertCitation', { source: s.id }) }));
  if (list.length) out.push(SEP);
  out.push({ label: 'Add New Source...', icon: 'plus', run: () => run('references.manageSources') }, { label: 'Manage Sources...', icon: 'sources', run: () => run('references.manageSources') });
  return out;
};

const env_sources = (): ReturnType<typeof sourcesOf> => {
  try { return sourcesOf(ed()); } catch { return []; }
};

const styleName = (): string => {
  try { const k = styleOf(ed()); return (STYLES.find((s) => s[0] === k)?.[1] ?? k).replace(/ author-date$/, ''); } catch { return 'APA 7'; }
};

const styleMenu = (): MI[] => [
  { head: 'Citation style' },
  ...STYLES.map(([k, n]): MI => ({ label: n, radio: true, checked: () => { try { return styleOf(ed()) === k; } catch { return false; } }, run: () => run('references.setCitationStyle', { style: k }) })),
];

const showNotes = async (): Promise<void> => {
  try { await call('references.nextNote', { kind: 'any', direction: 'next' }); } catch { return; }
  run('references.editNote');
};

const kindsOf = [
  ['letters', 'Letters'],
  ['email', 'E-mail Messages'],
  ['envelopes', 'Envelopes'],
  ['labels', 'Labels'],
  ['directory', 'Directory'],
  ['normal', 'Normal Word Document'],
] as const;
let mergeKind = 'letters';

const startMenu = (): MI[] => kindsOf.map(([k, n]): MI => ({
  label: n,
  radio: true,
  checked: () => mergeKind === k,
  run: () => {
    mergeKind = k;
    if (k === 'envelopes') run('envelope.dialog');
    else if (k === 'labels') run('labels.dialog');
    else if (k === 'normal') run('merge.preview', { record: 0 });
    else run('merge.panel');
    schedule();
  },
}));

const hasData = (): boolean => { try { return !!mergeData(ed()); } catch { return false; } };

const columnsMenu = (): MI[] => {
  let cols: string[] = [];
  try { cols = mergeData(ed())?.columns ?? []; } catch { cols = []; }
  if (!cols.length) return [{ label: 'Choose recipients first', disabled: () => true }];
  return cols.map((c): MI => ({ label: c, icon: 'insertField', run: () => run('merge.insertField', { name: c }) }));
};

const navBtn = (label: string, icon: string, go: (info: Info) => number): Ctl => button({
  label, icon,
  needs: ['merge.info'],
  enabled: (info) => !!mergeInfo(info) && (mergeInfo(info)?.records ?? 0) > 0,
  run: () => { void call('merge.info').then((m) => { const mi = m as { preview: number; records: number } | null; if (!mi) return; void call('merge.preview', { record: go({ 'merge.info': mi }) }).then(schedule); }); },
});

const navigator = (): Ctl => {
  const root = el('<span class="ft-brow ft-bnav"></span>');
  const first = navBtn('First Record', 'firstRecord', () => 1);
  const prev = navBtn('Previous Record', 'prevRecord', (i) => Math.max(1, (mergeInfo(i)?.preview || 1) - 1));
  const rec = field({
    label: 'Go to Record', width: 44, numeric: true, needs: ['merge.info'],
    value: () => '',
    get: (i) => String(mergeInfo(i)?.preview || ''),
    enabled: (i) => !!mergeInfo(i),
    set: (v) => { const n = Math.max(1, Math.round(Number(v) || 1)); void call('merge.preview', { record: n }).then(schedule); },
  });
  const next = navBtn('Next Record', 'nextRecord', (i) => Math.min(mergeInfo(i)?.records ?? 1, (mergeInfo(i)?.preview || 0) + 1));
  const last = navBtn('Last Record', 'lastRecord', (i) => mergeInfo(i)?.records ?? 1);
  return composite(root, [first, prev, rec, next, last]);
};

export function refsSlots(): Record<string, () => HTMLElement> {
  return {
    'b.toc': () => S(galleryButton({ label: 'Table of Contents', icon: 'toc', large: true, items: tocItems, tw: 196, th: 112, popCols: 1, popHead: 'Built-In', footer: [SEP, { label: 'Custom Table of Contents...', icon: 'toc', cmd: 'references.insertToc' }, { label: 'Remove Table of Contents', icon: 'trash', cmd: 'references.removeToc' }] })),
    'b.addText': () => S(button({ label: 'Add Text', icon: 'addText', text: true, menu: addTextMenu })),
    'b.nextNote': () => S(button({ label: 'Next Footnote', icon: 'nextNote', text: true, split: true, run: () => run('references.nextNote', { kind: 'footnote', direction: 'next' }), menu: [
      { label: 'Next Footnote', run: () => run('references.nextNote', { kind: 'footnote', direction: 'next' }) },
      { label: 'Previous Footnote', run: () => run('references.nextNote', { kind: 'footnote', direction: 'previous' }) },
      { label: 'Next Endnote', run: () => run('references.nextNote', { kind: 'endnote', direction: 'next' }) },
      { label: 'Previous Endnote', run: () => run('references.nextNote', { kind: 'endnote', direction: 'previous' }) },
    ] })),
    'b.showNotes': () => S(button({ label: 'Show Notes', icon: 'showNotes', text: true, run: () => { void showNotes(); } })),
    'b.cite': () => S(button({ label: 'Insert Citation', icon: 'citation', large: true, menu: citeMenu })),
    'b.citeStyle': () => S(button({ label: 'Style', icon: 'styleSet', text: true, menu: styleMenu, dyn: () => ({ label: `Style: ${styleName()}` }), needs: [] })),
    'b.bib': () => S(galleryButton({ label: 'Bibliography', icon: 'bibliography', large: true, items: bibItems, tw: 190, th: 92, popCols: 1, popHead: 'Built-In', footer: [SEP, { label: 'Insert Bibliography', icon: 'bibliography', cmd: 'references.insertBibliography' }] })),
    'b.startMerge': () => S(button({ label: 'Start Mail Merge', icon: 'mailMerge', large: true, menu: startMenu })),
    'b.recipients': () => S(button({ label: 'Select Recipients', icon: 'recipients', large: true, menu: [
      { label: 'Type a New List...', icon: 'table', cmd: 'merge.newList' },
      { label: 'Use an Existing List...', icon: 'folderOpen', cmd: 'merge.loadFile' },
    ] })),
    'b.editRecipients': () => S(button({ label: 'Edit Recipient List', icon: 'editRecipients', text: true, cmd: 'merge.panel', needs: ['merge.info'], enabled: (i) => !!mergeInfo(i) })),
    'b.highlight': () => S(button({ label: 'Highlight Merge Fields', icon: 'highlighter', large: true, run: () => run('merge.highlightFields'), checked: () => ed().root.dataset.mfHighlight === 'on' })),
    'b.addressBlock': () => S(button({ label: 'Address Block', icon: 'addressBlock', text: true, cmd: 'merge.addressBlock', needs: ['merge.info'], enabled: (i) => !!mergeInfo(i) })),
    'b.greeting': () => S(button({ label: 'Greeting Line', icon: 'greetingLine', text: true, cmd: 'merge.greetingLine', needs: ['merge.info'], enabled: (i) => !!mergeInfo(i) })),
    'b.insertField': () => S(button({ label: 'Insert Merge Field', icon: 'insertField', large: true, menu: columnsMenu, needs: ['merge.info'], enabled: (i) => !!mergeInfo(i) })),
    'b.preview': () => S(button({ label: 'Preview Results', icon: 'previewResults', large: true, needs: ['merge.info'], checked: (i) => (mergeInfo(i)?.preview ?? 0) > 0, enabled: (i) => !!mergeInfo(i), run: () => { void call('merge.info').then((m) => { const mi = m as { preview: number } | null; if (mi) void call('merge.preview', { record: mi.preview ? 0 : 1 }).then(schedule); }); } })),
    'b.navigator': () => S(navigator()),
    'b.finish': () => S(button({ label: 'Finish & Merge', icon: 'finishMerge', large: true, needs: ['merge.info'], enabled: (i) => !!mergeInfo(i), menu: () => [
      { label: 'Edit Individual Documents...', icon: 'document', disabled: () => !hasData(), run: () => run('merge.finish') },
      { label: 'Print Documents...', icon: 'print', disabled: () => !hasData(), run: () => { void call('merge.finish').then(() => run('print.open')); } },
      { label: 'Send E-mail Messages...', icon: 'mail', disabled: () => true },
    ] })),
  };
}
