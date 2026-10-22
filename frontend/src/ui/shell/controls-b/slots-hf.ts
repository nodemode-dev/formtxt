import { type Ctl, type GItem, type Info, type MI, SEP, button, call, check, ed, galleryButton, run, schedule, spinner, track } from './kit';

const S = (c: Ctl): HTMLElement => track(c).root;
const NEED = ['layout.headerOptions'];
const ho = (i: Info): Info | null => i['layout.headerOptions'] ?? null;

type Align = 'left' | 'center' | 'right';

const pageThumb = (part: 'header' | 'footer', align: Align, label: string): string => {
  const anchor = align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end';
  const y = part === 'header' ? 9 : 45;
  return `<svg viewBox="0 0 50 60" width="50" height="60" aria-hidden="true"><rect x="2.5" y="1.5" width="45" height="57" rx="2" fill="#ffffff" stroke="#9ca3af"/><path d="M8 18h34M8 24h34M8 30h34M8 36h34" stroke="#e5e7eb" stroke-width="1.4"/><text x="${anchor === 'end' ? 42 : anchor === 'middle' ? 25 : 8}" y="${y}" text-anchor="${anchor}" font-size="5.5" font-family="sans-serif" fill="#ea580c" font-weight="700">${label}</text></svg>`;
};

interface Preset { id: string; name: string; text: string; align: Align }

const PRESETS: Preset[] = [
  { id: 'blank', name: 'Blank', text: '', align: 'left' },
  { id: 'left', name: 'Left aligned', text: 'Type text', align: 'left' },
  { id: 'center', name: 'Centered', text: 'Type text', align: 'center' },
  { id: 'right', name: 'Right aligned', text: 'Type text', align: 'right' },
  { id: 'conf', name: 'Confidential', text: 'Confidential', align: 'right' },
  { id: 'draft', name: 'Draft', text: 'Draft', align: 'center' },
  { id: 'pageN', name: 'Page N', text: 'Page {PAGE}', align: 'right' },
  { id: 'pageNM', name: 'Page N of M', text: 'Page {PAGE} of {NUMPAGES}', align: 'center' },
];

const presetItems = (part: 'header' | 'footer'): GItem[] => PRESETS.map((p): GItem => ({
  id: p.id, name: `${p.name}`, thumb: () => pageThumb(part, p.align, p.text ? p.text.replace('{PAGE}', '1').replace('{NUMPAGES}', '3').slice(0, 14) : ''),
  run: () => run('layout.setHeaderFooter', { part, text: p.text, align: p.align }),
}));

const removeMenu = (part: 'header' | 'footer'): MI[] => [
  { label: `Remove ${part === 'header' ? 'Header' : 'Footer'}`, icon: 'deleteRow', run: () => run('layout.setHeaderFooter', { part, text: '', align: 'left' }) },
  { label: `Edit ${part === 'header' ? 'Header' : 'Footer'}`, icon: 'editShape', run: () => run('layout.gotoHeaderFooter', { part }) },
  SEP,
  { label: 'Header and Footer Options...', cmd: 'insert.headerFooter' },
];

const pageNumItems = (): GItem[] => {
  const out: GItem[] = [];
  const add = (group: string, position: 'header' | 'footer', align: Align, name: string, withTotal: boolean): void => {
    out.push({ id: `${position}${align}${withTotal}`, name, group, thumb: () => pageThumb(position, align, withTotal ? '1 of 3' : '1'), run: () => run('insert.pageNumber', { position, align, withTotal }) });
  };
  for (const a of ['left', 'center', 'right'] as const) add('Top of Page', 'header', a, `Plain Number, ${a}`, false);
  for (const a of ['left', 'center', 'right'] as const) add('Bottom of Page', 'footer', a, `Plain Number, ${a}`, false);
  for (const a of ['left', 'center', 'right'] as const) add('Page X of Y', 'footer', a, `Page X of Y, ${a}`, true);
  return out;
};

const docInfoMenu = (): MI[] => {
  const text = (t: string) => (): void => { void call('layout.insertHeaderFooterText', { field: 'text', text: t }).then(schedule).catch(() => undefined); };
  const d = (): { title: string; author: string } => {
    const doc = ed().doc as unknown as { title?: string; meta?: { author?: string } } | undefined;
    return { title: doc?.title ?? '', author: doc?.meta?.author ?? '' };
  };
  return [
    { label: 'Document Title', icon: 'docInfo', run: () => text(d().title || 'Untitled')() },
    { label: 'Author', icon: 'person', run: () => text(d().author || 'Author')() },
    { label: 'Page Number', icon: 'pageNumber', run: () => run('layout.insertHeaderFooterText', { field: 'page' }) },
    { label: 'Number of Pages', icon: 'pageNumber', run: () => run('layout.insertHeaderFooterText', { field: 'pages' }) },
  ];
};

const quickParts = (): MI[] => [
  { label: 'Confidential', run: () => run('layout.insertHeaderFooterText', { field: 'text', text: 'Confidential' }) },
  { label: 'Draft', run: () => run('layout.insertHeaderFooterText', { field: 'text', text: 'Draft' }) },
  { label: 'Page X of Y', run: () => run('layout.insertHeaderFooterText', { field: 'text', text: 'Page {PAGE} of {NUMPAGES}' }) },
  { label: 'All Rights Reserved', run: () => run('layout.insertHeaderFooterText', { field: 'text', text: 'All rights reserved' }) },
];

const dateMenu = (): MI[] => [
  { label: 'Date', icon: 'dateTime', run: () => run('layout.insertHeaderFooterText', { field: 'date' }) },
  { label: 'Time', icon: 'dateTime', run: () => run('layout.insertHeaderFooterText', { field: 'time' }) },
];

export function hfSlots(): Record<string, () => HTMLElement> {
  return {
    'h.header': () => S(galleryButton({ label: 'Header', icon: 'header', large: true, items: () => presetItems('header'), tw: 50, th: 60, popCols: 4, popHead: 'Header', footer: () => removeMenu('header') })),
    'h.footer': () => S(galleryButton({ label: 'Footer', icon: 'footer', large: true, items: () => presetItems('footer'), tw: 50, th: 60, popCols: 4, popHead: 'Footer', footer: () => removeMenu('footer') })),
    'h.pageNumber': () => S(galleryButton({ label: 'Page Number', icon: 'pageNumber', large: true, items: pageNumItems, tw: 50, th: 60, popCols: 3, popHead: 'Page Number', footer: [
      { label: 'Restart at 1', cmd: 'layout.restartNumbering', params: { start: 1 } },
      { label: 'Continue from Previous Section', cmd: 'layout.restartNumbering', params: {} },
      { label: 'Remove Page Numbers', run: () => run('layout.setHeaderFooter', { part: 'footer', text: '', align: 'center' }) },
    ] })),
    'h.dateTime': () => S(button({ label: 'Date & Time', icon: 'dateTime', large: true, menu: dateMenu })),
    'h.docInfo': () => S(button({ label: 'Document Info', icon: 'docInfo', large: true, menu: docInfoMenu })),
    'h.quickParts': () => S(button({ label: 'Quick Parts', icon: 'quickParts', large: true, menu: quickParts })),
    'h.pictures': () => S(button({ label: 'Pictures', icon: 'picture', large: true, cmd: 'insert.picture' })),
    'h.gotoHeader': () => S(button({ label: 'Go to Header', icon: 'gotoHeader', text: true, run: () => run('layout.gotoHeaderFooter', { part: 'header' }) })),
    'h.gotoFooter': () => S(button({ label: 'Go to Footer', icon: 'gotoFooter', text: true, run: () => run('layout.gotoHeaderFooter', { part: 'footer' }) })),
    'h.prev': () => S(button({ label: 'Previous Section', icon: 'prevSection', text: true, run: () => run('layout.gotoHeaderFooter', { direction: 'previous', part: 'header' }) })),
    'h.next': () => S(button({ label: 'Next Section', icon: 'nextSection', text: true, run: () => run('layout.gotoHeaderFooter', { direction: 'next', part: 'header' }) })),
    'h.first': () => S(check({ label: 'Different First Page', needs: NEED, get: (i) => !!ho(i)?.firstPage, enabled: (i) => !!ho(i), set: (v) => run('layout.headerOptions', { firstPage: v }) })),
    'h.evenOdd': () => S(check({ label: 'Different Odd & Even Pages', needs: NEED, get: (i) => !!ho(i)?.evenOdd, enabled: (i) => !!ho(i), set: (v) => run('layout.headerOptions', { evenOdd: v }) })),
    'h.headerTop': () => S(spinner({ label: 'Header from Top:', min: 0, max: 5, step: 0.1, unit: '"', needs: NEED, get: (i) => { const o = ho(i); return o ? Number(o.headerDistance) : null; }, set: (v) => run('layout.headerOptions', { headerDistance: v }) })),
    'h.footerBottom': () => S(spinner({ label: 'Footer from Bottom:', min: 0, max: 5, step: 0.1, unit: '"', needs: NEED, get: (i) => { const o = ho(i); return o ? Number(o.footerDistance) : null; }, set: (v) => run('layout.headerOptions', { footerDistance: v }) })),
    'h.close': () => S(button({ label: 'Close Header and Footer', icon: 'closeHF', large: true, cmd: 'layout.closeHeaderFooter' })),
  };
}
