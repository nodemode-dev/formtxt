import type { CommandRegistry } from '../engine/registry';
import type { DocEditor } from './editor';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { CellSelection, TableMap, isInTable, selectedRect } from 'prosemirror-tables';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setClass, setHidden, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { toast } from '../ui/toast';
import { cmdStateChanged, setCmdState } from '../ui/shell/cmd';
import { VERSION } from '../version';
import { cleanChip, schema } from './schema';
import { findKey } from './plugins';
import { gotoComment, threads } from './ext/review/comments';

type Param = { name: string; type: 'string' | 'number' | 'boolean'; description: string };
type Run = (p: Record<string, unknown>) => unknown;

const PX = 96 / 72;
const SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const WATERMARKS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'REVIEW', 'DO NOT COPY', 'SAMPLE'];
const HEADING = /^(Title|Heading[1-6])$/;
const MARK_CAP = 30000;

export function stepSize(cur: number, dir: 1 | -1): number {
  if (dir > 0) {
    for (const s of SIZE_STEPS) if (s > cur + 0.01) return s;
    return Math.min(400, (Math.floor(cur / 10) + 1) * 10);
  }
  if (cur <= 8.01) return Math.max(1, Math.ceil(cur - 0.01) - 1);
  if (cur > 72) return Math.max(72, (Math.ceil(cur / 10) - 1) * 10);
  let out = SIZE_STEPS[0];
  for (const s of SIZE_STEPS) if (s < cur - 0.01) out = s;
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;
const two = (n: number): string => String(n).padStart(2, '0');

const DATE_FORMATS: Array<[string, string, (d: Date) => string]> = [
  ['short', 'Short date', (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' })],
  ['medium', 'Medium date', (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })],
  ['long', 'Long date', (d) => d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })],
  ['weekday', 'Date with weekday', (d) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
  ['dayMonth', 'Day and month', (d) => d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })],
  ['monthYear', 'Month and year', (d) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })],
  ['iso', 'Year-month-day', (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`],
  ['time12', 'Time, 12 hour', (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })],
  ['time24', 'Time, 24 hour', (d) => `${two(d.getHours())}:${two(d.getMinutes())}`],
  ['dateTime', 'Date and time', (d) => `${d.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`],
  ['dateTimeIso', 'Year-month-day and time', (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`],
  ['full', 'Weekday, date and time', (d) => `${d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`],
];
const CHIP_FORMAT: Record<string, string> = { short: 'numeric', medium: 'short', long: 'long', weekday: 'long', iso: 'iso' };

const NEWS: Array<[string, string]> = [
  ['References', 'A table of contents, footnotes and endnotes, citations and a bibliography, captions, cross-references, an index and bookmarks.'],
  ['Review', 'Comments with reactions, suggesting mode, accept and reject, compare and combine, and who edited a passage.'],
  ['Versions', 'Named versions and recovery, protection, approvals, fields and content controls, mail merge and autosave to WebDAV.'],
  ['Files', 'Open and save .docx, .dotx, .odt, .rtf, .html and Markdown; export text and EPUB; read Word 97 .doc.'],
  ['Print', 'Preview, ranges and copies, and tagged PDF export.'],
  ['Proofing', 'Spelling, grammar, an Editor panel, AutoCorrect, a thesaurus, right-to-left text and an accessibility checker.'],
  ['Word commands', 'Formatting marks, Navigation pane, Go To, blank page, watermark, page colour and borders, table select and sizing, next and previous comment, display for review, sort, date and time.'],
];

const need = <T,>(v: T | null | undefined, msg = 'Open a document first.'): T => {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
};

function lazy<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

function dialogInput(type: string, value = '', attrs = ''): HTMLInputElement {
  const n = el<HTMLInputElement>(`<input class="ft-input" type="${type}" ${attrs}>`);
  if (type === 'checkbox') n.checked = value === 'true'; else n.value = value;
  return n;
}

function dialogSelect(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = el<HTMLSelectElement>(`<select class="ft-input">${options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>`);
  s.value = value;
  return s;
}

function submitOn(d: Dialog, inputs: HTMLElement[], go: () => void): void {
  for (const i of inputs) i.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { e.preventDefault(); go(); } });
  void d;
}

export function registerWordCommands(reg: CommandRegistry, ed: DocEditor): void {
  const add = (id: string, label: string, group: string, description: string, run: Run, params: Param[] = [], keys: string[] = []): void => {
    if (reg.has(id)) return;
    reg.register({ id, label, group, description, run, params, keys });
  };
  const view = (): EditorView => need(ed.view);
  const fail = (m: string): never => { throw new Error(m); };
  const scroller = (): HTMLElement => ed.root.querySelector('.ft-scroll') as HTMLElement;
  const run = (id: string, p: Record<string, unknown> = {}): unknown => reg.run(id, p);
  const runClose = (d: Dialog, id: string, p: Record<string, unknown>): void => { void Promise.resolve().then(() => run(id, p)).then(() => d.close()).catch((e: Error) => toast(e.message, 'error')); };

  const baseSize = (styleId: string): number => Number(ed.resolvedStyle(styleId).run.size) || 11;
  const stepFont = (dir: 1 | -1): { size: number } => {
    const v = view();
    const { state } = v;
    const sizeType = schema.marks.size;
    const tr = state.tr;
    let last = 0;
    if (state.selection.empty) {
      const $f = state.selection.$from;
      const marks = state.storedMarks ?? $f.marks();
      const cur = Number(marks.find((m) => m.type === sizeType)?.attrs.pt) || baseSize(String($f.parent.attrs.style ?? 'Normal'));
      last = stepSize(cur, dir);
      tr.setStoredMarks(sizeType.create({ pt: last }).addToSet(marks.filter((m) => m.type !== sizeType)));
    } else {
      for (const r of state.selection.ranges) {
        state.doc.nodesBetween(r.$from.pos, r.$to.pos, (node, pos) => {
          if (!node.isText) return true;
          const a = Math.max(r.$from.pos, pos);
          const b = Math.min(r.$to.pos, pos + node.nodeSize);
          if (a >= b) return false;
          const cur = Number(node.marks.find((m) => m.type === sizeType)?.attrs.pt) || baseSize(String(state.doc.resolve(pos).parent.attrs.style ?? 'Normal'));
          last = stepSize(cur, dir);
          tr.addMark(a, b, sizeType.create({ pt: last }));
          return false;
        });
      }
    }
    v.dispatch(tr);
    v.focus();
    return { size: last };
  };
  add('format.growFont', 'Grow font', 'Format', 'Step the font size of the selection up to the next size in the list (8 9 10 11 12 14 16 18 20 22 24 26 28 36 48 72, then by 10).', () => stepFont(1), [], ['Ctrl+Shift+>']);
  add('format.shrinkFont', 'Shrink font', 'Format', 'Step the font size of the selection down to the previous size in the list.', () => stepFont(-1), [], ['Ctrl+Shift+<']);

  let marksOn = false;
  let marksCache: { doc: PMNode; set: DecorationSet } | null = null;
  let marksView: EditorView | null = null;
  const buildMarks = (doc: PMNode): DecorationSet => {
    if (marksCache?.doc === doc) return marksCache.set;
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      if (decos.length >= MARK_CAP) return false;
      if (node.type === schema.nodes.hard_break) {
        decos.push(Decoration.widget(pos, () => { const s = document.createElement('span'); s.className = 'ft-mark-br'; s.textContent = '↵'; return s; }, { side: -1, key: 'br' }));
        return false;
      }
      if (!node.isText) return true;
      const t = node.text ?? '';
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        if (c === 32 || c === 160) decos.push(Decoration.inline(pos + i, pos + i + 1, { class: c === 32 ? 'ft-mark-space' : 'ft-mark-nbsp' }));
      }
      return false;
    });
    marksCache = { doc, set: DecorationSet.create(doc, decos) };
    return marksCache.set;
  };
  const applyMarks = (on: boolean): void => {
    marksOn = on;
    setClass(ed.root, 'ft-marks', on);
    const v = ed.view;
    if (marksView && marksView !== v) marksView.setProps({ decorations: undefined });
    if (v) { v.setProps({ decorations: on ? (s) => buildMarks(s.doc) : undefined }); marksView = v; }
    if (!on) marksCache = null;
    cmdStateChanged();
  };
  setCmdState('view.formattingMarks', { checked: () => marksOn });
  add('view.formattingMarks', 'Show formatting marks', 'View', 'Show or hide paragraph marks, spaces as dots, tabs as arrows, line breaks and page, section and column break markers; the marks are not part of the document and do not print.', (p) => {
    applyMarks(p.on === undefined ? !marksOn : !!p.on);
    return { on: marksOn };
  }, [{ name: 'on', type: 'boolean', description: 'Show or hide instead of toggling' }], ['Ctrl+*']);

  const DARK_PAGE_KEY = 'formtxt.darkPage';
  let darkPage = false;
  try { darkPage = localStorage.getItem(DARK_PAGE_KEY) === '1'; } catch { darkPage = false; }
  const applyDarkPage = (on: boolean): void => {
    darkPage = on;
    const root = document.documentElement;
    if (on) { if (!root.hasAttribute('data-page-dark')) root.setAttribute('data-page-dark', ''); } else if (root.hasAttribute('data-page-dark')) root.removeAttribute('data-page-dark');
    try { localStorage.setItem(DARK_PAGE_KEY, on ? '1' : '0'); } catch { void 0; }
    cmdStateChanged();
  };
  if (darkPage) applyDarkPage(true);
  setCmdState('view.darkPage', { checked: () => darkPage });
  add('view.darkPage', 'Dark page', 'View', 'Show the page dark with light text, inverting black and white and keeping colours and pictures recognisable. It only changes how the page looks on screen, separate from the app theme; the document, printing and exports keep their real colours.', (p) => {
    applyDarkPage(p.on === undefined ? !darkPage : !!p.on);
    return { on: darkPage };
  }, [{ name: 'on', type: 'boolean', description: 'Turn on or off instead of toggling' }]);

  const allSections = (patch: Record<string, unknown>): void => {
    const doc = need(ed.doc);
    for (const s of [...doc.sections].reverse()) ed.updateSectionById(s.id, patch);
  };
  const watermarkDialog = lazy(() => {
    const d = new Dialog('Watermark', 440);
    const sw = el('<div class="ft-wc-swatches"></div>');
    const text = dialogInput('text', '', 'placeholder="Watermark text" spellcheck="false" maxlength="40"');
    for (const w of WATERMARKS) {
      const b = el<HTMLButtonElement>('<button class="ft-btn" type="button"></button>');
      setText(b, w);
      b.addEventListener('click', () => { text.value = w; });
      sw.appendChild(b);
    }
    d.body.appendChild(sw);
    d.field('Text', text);
    const apply = (): void => runClose(d, 'design.watermark', { text: text.value });
    d.button('Remove watermark', 'ghost', () => runClose(d, 'design.watermark', { preset: 'remove' }));
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Apply', 'primary', apply);
    submitOn(d, [text], apply);
    return { d, text };
  });
  add('design.watermark', 'Watermark', 'Layout', `Put a text watermark on every page, or remove it; presets: ${WATERMARKS.join(', ')}. With no parameters, opens a dialog.`, (p) => {
    if (p.text === undefined && p.preset === undefined) {
      const w = watermarkDialog();
      w.text.value = String((ed.doc?.settings as unknown as Record<string, unknown> | undefined)?.watermark ?? '');
      w.d.open(w.text);
      return true;
    }
    const preset = String(p.preset ?? '').trim();
    let text = p.text === undefined ? preset : String(p.text).trim();
    if (/^(remove|none|off)$/i.test(preset) && p.text === undefined) text = '';
    if (p.text === undefined && preset && !/^(remove|none|off)$/i.test(preset)) {
      const hit = WATERMARKS.find((w) => w.toLowerCase() === preset.toLowerCase());
      if (!hit) fail(`preset must be one of ${WATERMARKS.join(', ')} or remove.`);
      text = hit as string;
    }
    ed.updatePage({}, { watermark: text.slice(0, 40) });
    return { watermark: text.slice(0, 40) };
  }, [{ name: 'text', type: 'string', description: 'Watermark text; empty removes it' }, { name: 'preset', type: 'string', description: `${WATERMARKS.join(', ')} or remove` }]);

  const colorDialog = lazy(() => {
    const d = new Dialog('Page colour', 360);
    const color = dialogInput('color', '#ffffff');
    d.field('Colour', color);
    d.button('No colour', 'ghost', () => runClose(d, 'design.pageColor', { color: '' }));
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Apply', 'primary', () => runClose(d, 'design.pageColor', { color: color.value }));
    return { d, color };
  });
  add('design.pageColor', 'Page colour', 'Layout', 'Set the background colour of every page; empty or white removes it. With no colour, opens a picker.', (p) => {
    if (p.color === undefined) {
      const c = colorDialog();
      c.color.value = need(ed.doc).sections[0].pageColor || '#ffffff';
      c.d.open(c.color);
      return true;
    }
    const raw = String(p.color).trim().toLowerCase();
    const value = !raw || raw === 'none' || raw === '#ffffff' ? '' : raw;
    if (value && !HEX.test(value)) fail('color must be #rrggbb or empty.');
    allSections({ pageColor: value });
    return { color: value };
  }, [{ name: 'color', type: 'string', description: '#rrggbb; empty removes it' }]);

  add('design.pageBorders', 'Page borders', 'Layout', 'Put a border around every page (thin, double or accent), or remove it; with no style, opens Page setup.', (p) => {
    if (p.style === undefined) return run('layout.pageSetup');
    const style = String(p.style).trim().toLowerCase();
    const value = style === 'none' || style === '' ? '' : style;
    if (!['', 'thin', 'double', 'accent'].includes(value)) fail('style must be none, thin, double or accent.');
    allSections({ pageBorder: value });
    return { style: value || 'none' };
  }, [{ name: 'style', type: 'string', description: 'none, thin, double or accent' }]);

  add('insert.blankPage', 'Blank page', 'Insert', 'Insert an empty page at the cursor: a page break, an empty paragraph and a second page break.', () => {
    const v = view();
    const { state } = v;
    const $f = state.selection.$from;
    const tr = state.tr;
    let at: number;
    if ($f.depth < 1 || $f.parent.type !== schema.nodes.paragraph || $f.depth > 1) at = $f.depth >= 1 ? $f.after(1) : state.selection.from;
    else if ($f.parent.content.size === 0 || $f.parentOffset === $f.parent.content.size) at = $f.after(1);
    else if ($f.parentOffset === 0) at = $f.before(1);
    else { tr.split($f.pos); at = tr.mapping.map($f.pos, -1) + 1; }
    const nodes = [schema.nodes.page_break.create(), schema.nodes.paragraph.create(), schema.nodes.page_break.create()];
    if (at >= tr.doc.content.size) nodes.push(schema.nodes.paragraph.create());
    tr.insert(at, nodes);
    const end = at + nodes.reduce((n, x) => n + x.nodeSize, 0);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), 1));
    v.dispatch(tr.scrollIntoView());
    v.focus();
    return true;
  });

  const headingsOf = (doc: PMNode): Array<{ pos: number; level: number; text: string }> => {
    const out: Array<{ pos: number; level: number; text: string }> = [];
    doc.forEach((node, pos) => {
      const s = String(node.attrs.style ?? '');
      if (node.type === schema.nodes.paragraph && HEADING.test(s) && node.textContent.trim()) out.push({ pos, level: s === 'Title' ? 0 : Number(s.slice(7)), text: node.textContent.trim() });
    });
    return out;
  };
  const bookmarksOf = (doc: PMNode): Array<{ pos: number; name: string }> => {
    const out: Array<{ pos: number; name: string }> = [];
    doc.descendants((node, pos) => { if (node.type.name === 'bookmark') out.push({ pos, name: String(node.attrs.name) }); return true; });
    return out;
  };
  const sheets = (): HTMLElement[] => Array.from(ed.root.querySelectorAll<HTMLElement>('.ft-sheets > .ft-sheet'));
  const revealPos = (pos: number): void => {
    const v = view();
    const sel = TextSelection.near(v.state.doc.resolve(Math.max(0, Math.min(pos, v.state.doc.content.size))), 1);
    v.dispatch(v.state.tr.setSelection(sel));
    const at = v.domAtPos(sel.head).node;
    (at.nodeType === 1 ? (at as HTMLElement) : at.parentElement)?.scrollIntoView({ block: 'center' });
    v.focus();
  };
  const gotoPage = (n: number): number => {
    const list = sheets();
    if (!list.length) fail('Pages are not shown in this view.');
    if (!Number.isInteger(n) || n < 1 || n > list.length) fail(`The document has ${list.length} page${list.length === 1 ? '' : 's'}.`);
    const sheet = list[n - 1];
    sheet.scrollIntoView({ block: 'start' });
    const v = view();
    const r = sheet.getBoundingClientRect();
    const m = need(ed.doc).sections[0].margins;
    const hit = v.posAtCoords({ left: r.left + (m.left * PX + 8) * ed.zoom, top: r.top + (m.top * PX + 6) * ed.zoom });
    if (hit) v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(hit.pos), 1)));
    v.focus();
    return n;
  };

  const goDialog = lazy(() => {
    const d = new Dialog('Go to', 420);
    const what = dialogSelect([['page', 'Page'], ['heading', 'Heading'], ['bookmark', 'Bookmark'], ['comment', 'Comment']], 'page');
    const value = dialogInput('text', '', 'list="ft-goto-list" spellcheck="false" autocomplete="off"');
    const list = el<HTMLDataListElement>('<datalist id="ft-goto-list"></datalist>');
    const hint = el('<p class="ft-wc-text"></p>');
    d.field('Go to what', what);
    d.field('Enter value', value);
    d.body.appendChild(list);
    d.body.appendChild(hint);
    const sync = (): void => {
      const doc = ed.view?.state.doc;
      const w = what.value;
      let opts: string[] = [];
      let msg = '';
      if (w === 'page') msg = `Page number, 1 to ${ed.paginator.pages}.`;
      else if (w === 'heading' && doc) { opts = headingsOf(doc).map((h) => h.text); msg = 'A heading number or part of its text; empty goes to the next heading.'; }
      else if (w === 'bookmark' && doc) { opts = bookmarksOf(doc).map((b) => b.name); msg = 'A bookmark name.'; }
      else if (w === 'comment') { try { opts = threads().map((t) => t.comment.id); } catch { opts = []; } msg = 'A comment number or id; empty goes to the next comment.'; }
      patchList(list, opts.slice(0, 200), { key: (o) => o, create: (o) => { const n = el('<option></option>'); n.setAttribute('value', o); return n; }, update: () => undefined });
      setText(hint, msg);
    };
    what.addEventListener('change', sync);
    const go = (): void => {
      try { void Promise.resolve(run('edit.goTo', { what: what.value, value: value.value })).then(() => d.close()).catch((e: Error) => toast(e.message, 'error')); } catch (e) { toast((e as Error).message, 'error'); }
    };
    d.button('Close', 'ghost', () => d.close());
    d.button('Go to', 'primary', go);
    submitOn(d, [value, what], go);
    return { d, what, value, sync };
  });
  add('edit.goTo', 'Go to', 'Edit', 'Jump to a page number, a heading (number or text), a bookmark or a comment; with no parameters, opens the Go To dialog.', (p) => {
    if (p.what === undefined) {
      const g = goDialog();
      g.sync();
      g.d.open(g.value);
      return true;
    }
    const v = view();
    const what = String(p.what).toLowerCase();
    const value = String(p.value ?? '').trim();
    if (what === 'page') return { what, page: gotoPage(Number(value)) };
    const at = v.state.selection.head;
    if (what === 'heading') {
      const hs = headingsOf(v.state.doc);
      if (!hs.length) fail('The document has no headings.');
      let h = hs[0];
      if (!value) h = hs.find((x) => x.pos > at) ?? hs[0];
      else if (/^\d+$/.test(value)) h = hs[Number(value) - 1] ?? fail(`The document has ${hs.length} headings.`);
      else {
        const low = value.toLowerCase();
        h = hs.find((x) => x.text.toLowerCase().startsWith(low)) ?? hs.find((x) => x.text.toLowerCase().includes(low)) ?? fail('No heading matches that text.');
      }
      revealPos(h.pos + 1);
      return { what, heading: h.text };
    }
    if (what === 'bookmark') {
      const b = bookmarksOf(v.state.doc).find((x) => x.name.toLowerCase() === value.toLowerCase()) ?? fail('No bookmark has that name.');
      revealPos(b.pos);
      return { what, bookmark: b.name };
    }
    if (what === 'comment') {
      const list = threads();
      if (!list.length) fail('This document has no comments.');
      let t = list[0];
      if (!value) t = list.find((x) => x.from > at) ?? list[0];
      else if (/^\d+$/.test(value) && !list.some((x) => x.comment.id === value)) t = list[Number(value) - 1] ?? fail(`The document has ${list.length} comments.`);
      else t = list.find((x) => x.comment.id === value) ?? fail('No comment has that number or id.');
      gotoComment(t.comment.id);
      return { what, comment: t.comment.id };
    }
    return fail('what must be page, heading, bookmark or comment.');
  }, [{ name: 'what', type: 'string', description: 'page, heading, bookmark or comment' }, { name: 'value', type: 'number', description: 'Page number, heading number or text, bookmark name, comment number or id' }]);

  let navOn = false;
  type NavTab = 'headings' | 'pages' | 'results';
  let navTab: NavTab = 'headings';
  const nav = lazy(() => {
    const body = ed.root.querySelector('.ft-editor-body') as HTMLElement;
    const pane = el(`<aside class="ft-navpane" aria-label="Navigation">
<div class="ft-navpane-head"><span>Navigation</span><button type="button" class="ft-tb-btn sm" data-nav-close aria-label="Close navigation" title="Close">${icon('close', 14)}</button></div>
<div class="ft-navpane-search"><input class="ft-input" type="search" placeholder="Search document" spellcheck="false" aria-label="Search document"></div>
<div class="ft-navpane-tabs" role="tablist"><button type="button" class="ft-navpane-tab" role="tab" data-tab="headings">Headings</button><button type="button" class="ft-navpane-tab" role="tab" data-tab="pages">Pages</button><button type="button" class="ft-navpane-tab" role="tab" data-tab="results">Results</button></div>
<div class="ft-navpane-views">
<div class="ft-navpane-view" data-view="headings"><div class="ft-navpane-list" data-list="headings"></div><div class="ft-navpane-empty" data-empty="headings">No headings yet. Style a paragraph as a heading to see it here.</div></div>
<div class="ft-navpane-view" data-view="pages" hidden><div class="ft-nav-pages" data-list="pages"></div><div class="ft-navpane-empty" data-empty="pages">Pages are shown in print layout.</div></div>
<div class="ft-navpane-view" data-view="results" hidden><div class="ft-nav-count" data-count></div><div class="ft-navpane-list" data-list="results"></div><div class="ft-navpane-empty" data-empty="results">Type in the search box to find text in the document.</div></div>
</div></aside>`);
    body.insertBefore(pane, body.firstChild);
    const q = pane.querySelector('input') as HTMLInputElement;
    const lists = { headings: pane.querySelector('[data-list="headings"]') as HTMLElement, pages: pane.querySelector('[data-list="pages"]') as HTMLElement, results: pane.querySelector('[data-list="results"]') as HTMLElement };
    const empties = { headings: pane.querySelector('[data-empty="headings"]') as HTMLElement, pages: pane.querySelector('[data-empty="pages"]') as HTMLElement, results: pane.querySelector('[data-empty="results"]') as HTMLElement };
    const count = pane.querySelector('[data-count]') as HTMLElement;
    let frame = 0;
    const refresh = (): void => {
      frame = 0;
      const v = ed.view;
      if (!navOn || !v) return;
      if (navTab === 'headings') {
        const hs = headingsOf(v.state.doc);
        const head = v.state.selection.head;
        let cur = -1;
        hs.forEach((h, i) => { if (h.pos < head) cur = i; });
        patchList(lists.headings, hs.map((h, i) => ({ ...h, i, cur: i === cur })), {
          key: (h) => `h${h.i}`,
          create: (h) => { const n = el('<button type="button" class="ft-nav-item"></button>'); setText(n, h.text); n.dataset.pos = String(h.pos); n.dataset.level = String(h.level); setClass(n, 'is-current', h.cur); return n; },
          update: (n, h) => { setText(n, h.text); n.dataset.pos = String(h.pos); n.dataset.level = String(h.level); setClass(n, 'is-current', h.cur); },
        });
        setHidden(empties.headings, hs.length > 0);
      } else if (navTab === 'pages') {
        const list = sheets();
        const sec = need(ed.doc).sections[0];
        const rects = list.map((s) => s.getBoundingClientRect());
        const firstHead: string[] = list.map(() => '');
        const hs = headingsOf(v.state.doc);
        for (const h of hs) {
          const dom = v.nodeDOM(h.pos) as HTMLElement | null;
          if (!dom || !dom.getBoundingClientRect) continue;
          const y = dom.getBoundingClientRect().top;
          const i = rects.findIndex((r) => y >= r.top - 1 && y < r.bottom);
          if (i >= 0 && !firstHead[i]) firstHead[i] = h.text;
        }
        const at = v.coordsAtPos(v.state.selection.head).top;
        const curPage = rects.findIndex((r) => at >= r.top - 1 && at < r.bottom);
        const aspect = `${sec.page.width} / ${sec.page.height}`;
        patchList(lists.pages, list.map((_, i) => ({ i, title: firstHead[i], cur: i === curPage })), {
          key: (x) => `p${x.i}`,
          create: (x) => {
            const n = el('<button type="button" class="ft-nav-page"><span class="ft-nav-thumb"><span></span></span><span class="ft-nav-label"></span></button>');
            n.dataset.page = String(x.i + 1);
            (n.querySelector('.ft-nav-thumb') as HTMLElement).style.aspectRatio = aspect;
            setText(n.querySelector('.ft-nav-thumb span'), x.title);
            setText(n.querySelector('.ft-nav-label'), `Page ${x.i + 1}`);
            setClass(n, 'is-current', x.cur);
            return n;
          },
          update: (n, x) => {
            (n.querySelector('.ft-nav-thumb') as HTMLElement).style.aspectRatio = aspect;
            setText(n.querySelector('.ft-nav-thumb span'), x.title);
            setClass(n, 'is-current', x.cur);
          },
        });
        setHidden(empties.pages, list.length > 0);
      } else {
        const f = findKey.getState(v.state);
        const matches = f?.matches ?? [];
        const rows = matches.slice(0, 200).map((m, i) => ({ i, m }));
        patchList(lists.results, rows, {
          key: (r) => `r${r.i}`,
          create: (r) => { const n = el('<button type="button" class="ft-nav-item ft-nav-result"></button>'); fill(n, r.i, r.m); return n; },
          update: (n, r) => fill(n, r.i, r.m),
        });
        setHidden(empties.results, !!f?.query && matches.length > 0);
        setText(empties.results, f?.error ? 'That is not a valid pattern.' : f?.query ? 'No results.' : 'Type in the search box to find text in the document.');
        setText(count, f?.query && matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'}${matches.length > 200 ? ', showing the first 200' : ''}` : '');
      }
    };
    const fill = (n: HTMLElement, i: number, m: { from: number; to: number }): void => {
      const v = need(ed.view);
      const doc = v.state.doc;
      const a = Math.max(0, m.from - 32);
      const b = Math.min(doc.content.size, m.to + 32);
      const key = `${a}|${m.from}|${m.to}|${b}|${doc.textBetween(a, b, ' ', ' ')}`;
      if (n.dataset.sig === key) { n.dataset.idx = String(i); return; }
      n.dataset.sig = key;
      n.dataset.idx = String(i);
      const pre = doc.textBetween(a, m.from, ' ', ' ');
      const hit = doc.textBetween(m.from, m.to, ' ', ' ');
      const post = doc.textBetween(m.to, b, ' ', ' ');
      const mark = document.createElement('mark');
      mark.textContent = hit;
      n.replaceChildren(document.createTextNode(`${a > 0 ? '…' : ''}${pre}`), mark, document.createTextNode(`${post}${b < doc.content.size ? '…' : ''}`));
    };
    const schedule = (): void => { if (!frame && navOn) frame = requestAnimationFrame(refresh); };
    const setTab = (t: NavTab): void => {
      navTab = t;
      for (const b of Array.from(pane.querySelectorAll<HTMLElement>('.ft-navpane-tab'))) { setClass(b, 'is-on', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); }
      for (const w of Array.from(pane.querySelectorAll<HTMLElement>('.ft-navpane-view'))) setHidden(w, w.dataset.view !== t);
      schedule();
    };
    const observer = new MutationObserver(schedule);
    let observed: Node | null = null;
    const observe = (): void => {
      const pm = ed.view?.dom ?? null;
      if (observed === pm) return;
      observer.disconnect();
      observed = pm;
      if (pm) observer.observe(pm, { childList: true, subtree: true, characterData: true });
      const pages = ed.root.querySelector('.ft-pages');
      if (pages) observer.observe(pages, { childList: true });
    };
    document.addEventListener('selectionchange', schedule);
    let timer = 0;
    q.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const v = ed.view;
        if (!v) return;
        v.dispatch(v.state.tr.setMeta(findKey, { query: q.value, current: 0 }));
        if (q.value) setTab('results');
        schedule();
      }, 150);
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); ed.findStep(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { q.value = ''; q.dispatchEvent(new Event('input')); }
    });
    pane.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-nav-close]')) { void run('view.navigationPane', { on: false }); return; }
      const tab = t.closest<HTMLElement>('.ft-navpane-tab');
      if (tab) { setTab(tab.dataset.tab as NavTab); return; }
      const v = ed.view;
      if (!v) return;
      const item = t.closest<HTMLElement>('.ft-nav-item');
      if (item?.dataset.pos) { revealPos(Number(item.dataset.pos) + 1); schedule(); return; }
      if (item?.dataset.idx !== undefined) {
        const f = findKey.getState(v.state);
        const m = f?.matches[Number(item.dataset.idx)];
        if (m) {
          v.dispatch(v.state.tr.setMeta(findKey, { current: Number(item.dataset.idx) }).setSelection(TextSelection.create(v.state.doc, m.from, m.to)).scrollIntoView());
          v.focus();
        }
        return;
      }
      const page = t.closest<HTMLElement>('.ft-nav-page');
      if (page?.dataset.page) { try { gotoPage(Number(page.dataset.page)); } catch (err) { toast((err as Error).message, 'error'); } schedule(); }
    });
    return { body, pane, q, setTab, schedule, observe, observer };
  });
  const setNav = (on: boolean, tab?: NavTab): void => {
    const n = nav();
    navOn = on;
    setClass(n.body, 'ft-navpane-on', on);
    n.body.dataset.navpane = on ? 'open' : '';
    if (!on) { delete n.body.dataset.navpane; n.observer.disconnect(); }
    else {
      n.observe();
      const f = ed.view ? findKey.getState(ed.view.state) : undefined;
      if (f?.query && !n.q.value) n.q.value = f.query;
      n.setTab(tab ?? navTab);
      n.schedule();
    }
    cmdStateChanged();
  };
  setCmdState('view.navigationPane', { checked: () => navOn });
  add('view.navigationPane', 'Navigation pane', 'View', 'Show or hide the Navigation pane: Headings to jump through the outline, Pages to jump to a page, and Results for the matches of a search.', (p) => {
    const tab = ['headings', 'pages', 'results'].includes(String(p.tab)) ? (String(p.tab) as NavTab) : undefined;
    setNav(p.on === undefined ? !navOn : !!p.on, tab);
    return { on: navOn, tab: navTab };
  }, [{ name: 'on', type: 'boolean', description: 'Show or hide instead of toggling' }, { name: 'tab', type: 'string', description: 'headings, pages or results' }]);

  const fitBox = (): { w: number; h: number; pageW: number; pageH: number } => {
    const sc = scroller();
    const cs = getComputedStyle(sc);
    const doc = need(ed.doc);
    return {
      w: sc.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      h: sc.clientHeight - 2 * parseFloat(cs.paddingTop),
      pageW: Math.max(...doc.sections.map((s) => s.page.width * PX)),
      pageH: Math.max(...doc.sections.map((s) => s.page.height * PX)),
    };
  };
  const leaveMulti = (): void => { if (reg.has('view.onePage')) void run('view.onePage'); };
  add('view.pageWidth', 'Page width', 'View', 'Zoom so the width of the page fills the window.', () => {
    leaveMulti();
    const b = fitBox();
    return ed.setZoom(b.w / b.pageW);
  });
  add('view.onePageZoom', 'One page', 'View', 'Zoom so a whole page fits in the window.', () => {
    leaveMulti();
    const b = fitBox();
    const z = ed.setZoom(Math.min(b.w / b.pageW, b.h / b.pageH));
    if (ed.view) ed.view.dispatch(ed.view.state.tr.scrollIntoView());
    return z;
  });
  add('view.zoom100', '100%', 'View', 'Set the zoom to 100 percent.', () => { leaveMulti(); return ed.setZoom(1); });

  const tctx = (): { v: EditorView; r: ReturnType<typeof selectedRect>; tablePos: number } => {
    const v = view();
    if (!isInTable(v.state)) fail('Put the cursor in a table first.');
    const r = selectedRect(v.state);
    return { v, r, tablePos: r.tableStart - 1 };
  };
  const cellAt = (r: ReturnType<typeof selectedRect>, row: number, col: number): number => r.tableStart + r.map.map[row * r.map.width + col];
  add('table.select', 'Select table part', 'Table', 'Select the current cell, row, column or the whole table.', (p) => {
    const { v, r } = tctx();
    const what = String(p.what ?? 'cell').toLowerCase();
    const w = r.map.width, h = r.map.height;
    const box: Record<string, [number, number, number, number]> = { cell: [r.top, r.left, r.bottom - 1, r.right - 1], row: [r.top, 0, r.bottom - 1, w - 1], column: [0, r.left, h - 1, r.right - 1], table: [0, 0, h - 1, w - 1] };
    const b = box[what] ?? fail('what must be cell, row, column or table.');
    const sel = new CellSelection(v.state.doc.resolve(cellAt(r, b[0], b[1])), v.state.doc.resolve(cellAt(r, b[2], b[3])));
    v.dispatch(v.state.tr.setSelection(sel));
    v.focus();
    return { what, cells: (b[2] - b[0] + 1) * (b[3] - b[1] + 1) };
  }, [{ name: 'what', type: 'string', description: 'cell, row, column or table' }]);

  const rowWidths = (t: HTMLElement, cols: number): number[] | null => {
    const row = t.querySelector('tr:not(.ft-pg-row):not(.ft-pg-repeat)');
    if (!row) return null;
    const out: number[] = [];
    for (const c of Array.from(row.children) as HTMLTableCellElement[]) {
      const span = Math.max(1, c.colSpan || 1);
      const w = c.offsetWidth;
      for (let i = 0; i < span; i++) out.push(w / span);
    }
    return out.length === cols && out.every((x) => x > 0) ? out : null;
  };
  const tableDom = (v: EditorView, pos: number): HTMLElement | null => {
    const d = v.nodeDOM(pos) as HTMLElement | null;
    return d ? (d.matches('table') ? d : d.querySelector('table')) : null;
  };
  const currentWidths = (v: EditorView, pos: number, table: PMNode): number[] => {
    const map = TableMap.get(table);
    const t = tableDom(v, pos);
    const m = t ? rowWidths(t, map.width) : null;
    if (m) return m;
    const out: number[] = [];
    for (let c = 0; c < map.width; c++) {
      const off = map.map[c];
      const cell = table.nodeAt(off);
      out.push((cell?.attrs.colwidth as number[] | null)?.[c - map.colCount(off)] ?? 96);
    }
    return out;
  };
  const contentWidths = (v: EditorView, pos: number, table: PMNode): number[] => {
    const map = TableMap.get(table);
    const t = tableDom(v, pos);
    if (!t) return currentWidths(v, pos, table);
    const saved = t.style.cssText;
    const cg = t.querySelector('colgroup') as HTMLElement | null;
    const cgd = cg?.style.display ?? '';
    const cells = Array.from(t.querySelectorAll<HTMLElement>('td, th'));
    try {
      t.style.tableLayout = 'auto';
      t.style.width = 'auto';
      t.style.minWidth = '0';
      if (cg) cg.style.display = 'none';
      for (const c of cells) c.style.whiteSpace = 'nowrap';
      const m = rowWidths(t, map.width);
      if (m) return m.map((x) => Math.ceil(x));
    } finally {
      t.style.cssText = saved;
      if (cg) cg.style.display = cgd;
      for (const c of cells) c.style.whiteSpace = '';
    }
    return currentWidths(v, pos, table);
  };
  const applyWidths = (tr: Transaction, tablePos: number, table: PMNode, widths: Array<number | null>): void => {
    const map = TableMap.get(table);
    const seen = new Set<number>();
    for (const off of map.map) {
      if (seen.has(off)) continue;
      seen.add(off);
      const cell = table.nodeAt(off)!;
      const rc = map.findCell(off);
      const ws = widths.slice(rc.left, rc.right);
      const cw = ws.length === cell.attrs.colspan && ws.every((w) => w !== null && w > 0) ? ws.map((w) => Math.max(24, Math.round(w as number))) : null;
      tr.setNodeMarkup(tablePos + 1 + off, undefined, { ...cell.attrs, colwidth: cw });
    }
  };
  add('table.autofit', 'AutoFit', 'Table', 'Resize the columns of the table at the cursor: contents (as wide as the text), window (scaled to the page width) or fixed (freeze the widths, or give every column pt points).', (p) => {
    const { v, r, tablePos } = tctx();
    const mode = String(p.mode ?? 'contents').toLowerCase();
    const cur = currentWidths(v, tablePos, r.table);
    const maxTotal = ed.bodyWidth() * PX - 1;
    let widths: number[];
    if (mode === 'contents') {
      widths = contentWidths(v, tablePos, r.table);
      const total = widths.reduce((a, b) => a + b, 0);
      if (total > maxTotal) widths = widths.map((w) => w * (maxTotal / total));
    } else if (mode === 'window') {
      const total = cur.reduce((a, b) => a + b, 0);
      widths = cur.map((w) => w * (maxTotal / total));
    } else if (mode === 'fixed') widths = Number(p.pt) > 0 ? cur.map(() => Number(p.pt) * PX) : cur;
    else return fail('mode must be contents, window or fixed.');
    const tr = v.state.tr;
    applyWidths(tr, tablePos, r.table, widths);
    v.dispatch(tr);
    return { mode, widths: widths.map((w) => Math.round(w / PX * 10) / 10) };
  }, [{ name: 'mode', type: 'string', description: 'contents, window or fixed' }, { name: 'pt', type: 'number', description: 'fixed only: width of every column in points' }]);

  add('table.colWidth', 'Column width', 'Table', 'Set the width in points of the selected columns (or column, 1 based).', (p) => {
    const { v, r, tablePos } = tctx();
    const pt = Number(p.pt);
    if (!(pt > 0)) fail('pt must be a width in points.');
    const widths = currentWidths(v, tablePos, r.table);
    const cols = p.column === undefined ? Array.from({ length: r.right - r.left }, (_, i) => r.left + i) : [Math.round(Number(p.column)) - 1];
    for (const c of cols) { if (c < 0 || c >= widths.length) fail(`The table has ${widths.length} columns.`); widths[c] = pt * PX; }
    const tr = v.state.tr;
    applyWidths(tr, tablePos, r.table, widths);
    v.dispatch(tr);
    return { columns: cols.map((c) => c + 1), pt };
  }, [{ name: 'pt', type: 'number', description: 'Width in points' }, { name: 'column', type: 'number', description: 'Column number (default: the selected columns)' }]);

  const rowSpec = (): boolean => !!schema.nodes.table_row.spec.attrs && 'height' in schema.nodes.table_row.spec.attrs;
  add('table.rowHeight', 'Row height', 'Table', 'Set the minimum height in points of the selected rows (or row, 1 based); 0 returns to automatic.', (p) => {
    if (!rowSpec()) fail('This build has no row height attribute yet; apply the table layout schema change first.');
    const { v, r, tablePos } = tctx();
    const pt = Number(p.pt);
    if (!(pt >= 0)) fail('pt must be a height in points, or 0 for automatic.');
    const rows = p.row === undefined ? Array.from({ length: r.bottom - r.top }, (_, i) => r.top + i) : [Math.round(Number(p.row)) - 1];
    const tr = v.state.tr;
    let off = 0;
    const offsets: number[] = [];
    r.table.forEach((row) => { offsets.push(tablePos + 1 + off); off += row.nodeSize; });
    for (const i of rows) {
      if (i < 0 || i >= offsets.length) fail(`The table has ${offsets.length} rows.`);
      tr.setNodeMarkup(offsets[i], undefined, { ...r.table.child(i).attrs, height: pt });
    }
    v.dispatch(tr);
    return { rows: rows.map((i) => i + 1), pt };
  }, [{ name: 'pt', type: 'number', description: 'Height in points; 0 for automatic' }, { name: 'row', type: 'number', description: 'Row number (default: the selected rows)' }]);

  const marginsDialog = lazy(() => {
    const d = new Dialog('Cell margins', 380);
    const f = { top: dialogInput('number', '', 'min="0" step="0.5"'), bottom: dialogInput('number', '', 'min="0" step="0.5"'), left: dialogInput('number', '', 'min="0" step="0.5"'), right: dialogInput('number', '', 'min="0" step="0.5"') };
    const g = el('<div class="ft-form-grid"></div>');
    for (const [k, label] of [['top', 'Top (pt)'], ['bottom', 'Bottom (pt)'], ['left', 'Left (pt)'], ['right', 'Right (pt)']] as const) {
      const l = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
      setText(l.querySelector('.ft-field-label'), label);
      l.appendChild(f[k]);
      g.appendChild(l);
    }
    d.body.appendChild(g);
    const go = (): void => {
      runClose(d, 'table.cellMargins', { top: Number(f.top.value), bottom: Number(f.bottom.value), left: Number(f.left.value), right: Number(f.right.value) });
    };
    d.button('Default', 'ghost', () => runClose(d, 'table.cellMargins', { reset: true }));
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Apply', 'primary', go);
    submitOn(d, Object.values(f), go);
    return { d, f };
  });
  add('table.cellMargins', 'Cell margins', 'Table', 'Set the space inside every cell of the table at the cursor, in points (top, bottom, left, right); with no parameters, opens a dialog; reset returns to the default.', (p) => {
    if (!(schema.nodes.table.spec.attrs && 'cellMargins' in schema.nodes.table.spec.attrs)) fail('This build has no cell margins attribute yet; apply the table layout schema change first.');
    const { v, r, tablePos } = tctx();
    const keys = ['top', 'bottom', 'left', 'right'];
    if (p.reset === undefined && keys.every((k) => p[k] === undefined)) {
      const m = marginsDialog();
      const cur = (r.table.attrs.cellMargins as Record<string, number> | null) ?? { top: 3, bottom: 3, left: 5, right: 5 };
      for (const k of keys) (m.f as Record<string, HTMLInputElement>)[k].value = String(cur[k] ?? '');
      m.d.open(m.f.top);
      return true;
    }
    let next: Record<string, number> | null = null;
    if (!p.reset) {
      const prev = (r.table.attrs.cellMargins as Record<string, number> | null) ?? { top: 3, bottom: 3, left: 5, right: 5 };
      next = {};
      for (const k of keys) { const n = p[k] === undefined ? prev[k] : Number(p[k]); if (!(n >= 0 && n <= 72)) fail(`${k} must be 0 to 72 points.`); next[k] = n; }
    }
    v.dispatch(v.state.tr.setNodeMarkup(tablePos, undefined, { ...r.table.attrs, cellMargins: next }));
    return { cellMargins: next };
  }, [{ name: 'top', type: 'number', description: 'Points' }, { name: 'bottom', type: 'number', description: 'Points' }, { name: 'left', type: 'number', description: 'Points' }, { name: 'right', type: 'number', description: 'Points' }, { name: 'reset', type: 'boolean', description: 'Back to the default margins' }]);

  add('table.textDirection', 'Text direction in cells', 'Table', 'Turn the text of the selected cells: horizontal, rotate90 (top to bottom) or rotate270 (bottom to top).', (p) => {
    const cellAttrs = schema.nodes.table_cell.spec.attrs;
    if (!(cellAttrs && 'textDirection' in cellAttrs)) fail('This build has no cell text direction attribute yet; apply the table layout schema change first.');
    const { v, r } = tctx();
    const dir = String(p.dir ?? 'rotate90');
    if (!['horizontal', 'rotate90', 'rotate270'].includes(dir)) fail('dir must be horizontal, rotate90 or rotate270.');
    const tr = v.state.tr;
    const seen = new Set<number>();
    for (let row = r.top; row < r.bottom; row++) {
      for (let col = r.left; col < r.right; col++) {
        const off = r.map.map[row * r.map.width + col];
        if (seen.has(off)) continue;
        seen.add(off);
        const cell = r.table.nodeAt(off)!;
        tr.setNodeMarkup(r.tableStart + off, undefined, { ...cell.attrs, textDirection: dir === 'horizontal' ? '' : dir });
      }
    }
    v.dispatch(tr);
    return { dir, cells: seen.size };
  }, [{ name: 'dir', type: 'string', description: 'horizontal, rotate90 or rotate270' }]);

  let gridOn = false;
  setCmdState('table.viewGridlines', { checked: () => gridOn });
  add('table.viewGridlines', 'View gridlines', 'Table', 'Show or hide dashed gridlines on tables without borders; they are not saved and do not print.', (p) => {
    gridOn = p.on === undefined ? !gridOn : !!p.on;
    setClass(ed.root, 'ft-tbl-gridlines', gridOn);
    cmdStateChanged();
    return { on: gridOn };
  }, [{ name: 'on', type: 'boolean', description: 'Show or hide instead of toggling' }]);

  const stepComment = (dir: 1 | -1): { id: string } => {
    const list = threads();
    if (!list.length) fail('This document has no comments.');
    const at = view().state.selection.from;
    const pick = dir > 0 ? list.find((t) => t.from > at) ?? list[0] : [...list].reverse().find((t) => t.from < at) ?? list[list.length - 1];
    gotoComment(pick.comment.id);
    return { id: pick.comment.id };
  };
  add('review.nextComment', 'Next comment', 'Review', 'Select the next comment in the document, wrapping to the first.', () => stepComment(1));
  add('review.prevComment', 'Previous comment', 'Review', 'Select the previous comment in the document, wrapping to the last.', () => stepComment(-1));

  const MARKUP = ['all', 'simple', 'none', 'original'];
  add('review.showMarkup', 'Display for review', 'Review', 'Choose how tracked changes are shown: all (colored), simple (final text, deletions hidden), none (final text, no comment shading) or original (insertions hidden); the document is not changed.', (p) => {
    const mode = String(p.mode ?? 'all').toLowerCase();
    if (!MARKUP.includes(mode)) fail('mode must be all, simple, none or original.');
    if (mode === 'all') delete ed.root.dataset.markup; else ed.root.dataset.markup = mode;
    ed.paginator.layoutNow();
    return { mode };
  }, [{ name: 'mode', type: 'string', description: 'all, simple, none or original' }]);

  add('paragraph.shading', 'Paragraph shading', 'Paragraph', 'Shade the selected paragraphs with a colour (light grey by default); none removes it.', (p) => {
    const raw = p.color === undefined ? '#d9d9d9' : String(p.color).trim().toLowerCase();
    const value = raw === '' || raw === 'none' ? '' : raw;
    if (value && !HEX.test(value)) fail('color must be #rrggbb or none.');
    ed.paraProps({ shading: value });
    return { shading: value };
  }, [{ name: 'color', type: 'string', description: '#rrggbb, or none to remove (default #d9d9d9)' }]);
  add('paragraph.borders', 'Paragraph borders', 'Paragraph', 'Put a border around the selected paragraphs: box, top, bottom, left or right (one edge at a time), or none.', (p) => {
    const raw = String(p.which ?? 'box').toLowerCase();
    const which = raw === 'all' ? 'box' : raw === 'none' ? '' : raw;
    if (!['', 'box', 'top', 'bottom', 'left', 'right'].includes(which)) fail('which must be box, top, bottom, left, right or none.');
    ed.paraProps({ border: which });
    return { border: which || 'none' };
  }, [{ name: 'which', type: 'string', description: 'box, top, bottom, left, right or none' }]);

  const sortDialog = lazy(() => {
    const d = new Dialog('Sort text', 380);
    const type = dialogSelect([['text', 'Text'], ['number', 'Number'], ['date', 'Date']], 'text');
    const order = dialogSelect([['asc', 'Ascending (A to Z)'], ['desc', 'Descending (Z to A)']], 'asc');
    d.field('Type', type);
    d.field('Order', order);
    const go = (): void => runClose(d, 'edit.sortParagraphs', { order: order.value, type: type.value });
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Sort', 'primary', go);
    submitOn(d, [type, order], go);
    return { d, order };
  });
  add('edit.sortParagraphs', 'Sort', 'Edit', 'Sort the selected paragraphs ascending (A to Z) or descending (Z to A) as text, numbers or dates; with no order, opens a dialog.', (p) => {
    const v = view();
    if (p.order === undefined) {
      if (isInTable(v.state)) fail('Use Sort table inside a table.');
      const s = sortDialog();
      s.d.open(s.order);
      return true;
    }
    const { state } = v;
    const { $from, $to } = state.selection;
    const whole = $from.depth < 1 && $to.depth < 1 && $from.pos === 0 && $to.pos === state.doc.content.size;
    if (!whole && (isInTable(state) || $from.depth < 1 || $to.depth < 1)) fail('Select two or more paragraphs outside a table.');
    let start = whole ? 0 : $from.before(1), end = whole ? state.doc.content.size : $to.after(1);
    if (whole) { while (end > start && state.doc.resolve(end).nodeBefore?.type === schema.nodes.paragraph && state.doc.resolve(end).nodeBefore?.content.size === 0) end -= state.doc.resolve(end).nodeBefore!.nodeSize; }
    const nodes: PMNode[] = [];
    state.doc.nodesBetween(start, end, (n, pos) => { if (pos >= start && pos < end && state.doc.resolve(pos).depth === 0) nodes.push(n); return false; });
    if (nodes.length < 2) fail('Select two or more paragraphs to sort.');
    if (nodes.some((n) => n.type !== schema.nodes.paragraph)) fail('Only paragraphs can be sorted; the selection holds other blocks.');
    const desc = /^(desc|descending|za|z-a)$/i.test(String(p.order));
    const type = String(p.type ?? 'text').toLowerCase();
    const num = (s: string): number => { const m = /-?\d[\d,]*\.?\d*/.exec(s); return m ? parseFloat(m[0].replace(/,/g, '')) : NaN; };
    const key = (n: PMNode): string | number => (type === 'number' ? num(n.textContent) : type === 'date' ? Date.parse(n.textContent.trim()) : n.textContent.trim());
    const items = nodes.map((n, i) => ({ n, i, k: key(n) }));
    items.sort((a, b) => {
      const an = typeof a.k === 'number', bn = typeof b.k === 'number';
      let c: number;
      if (an && bn) { const x = a.k as number, y = b.k as number; c = Number.isNaN(x) && Number.isNaN(y) ? 0 : Number.isNaN(x) ? 1 : Number.isNaN(y) ? -1 : x - y; if (desc && c !== 0 && !Number.isNaN(x) && !Number.isNaN(y)) c = -c; }
      else { c = String(a.k).localeCompare(String(b.k), undefined, { numeric: true, sensitivity: 'base' }); if (desc) c = -c; }
      return c || a.i - b.i;
    });
    const tr = state.tr.replaceWith(start, end, Fragment.fromArray(items.map((x) => x.n)));
    tr.setSelection(TextSelection.create(tr.doc, start + 1, start + (end - start) - 1));
    v.dispatch(tr);
    v.focus();
    return { sorted: nodes.length, order: desc ? 'desc' : 'asc' };
  }, [{ name: 'order', type: 'string', description: 'asc or desc' }, { name: 'type', type: 'string', description: 'text, number or date (default text)' }]);

  const dateDialog = lazy(() => {
    const d = new Dialog('Date and time', 460);
    const list = el('<div class="ft-wc-list" role="listbox"></div>');
    let chosen = 'long';
    const rows = DATE_FORMATS.map(([id, label]) => {
      const b = el<HTMLButtonElement>('<button type="button" class="ft-wc-opt" role="option"><span></span><span></span></button>');
      setText(b.children[0], label);
      b.addEventListener('click', () => { chosen = id; paint(); });
      list.appendChild(b);
      return { id, b };
    });
    const radio = el('<div class="ft-wc-radio"><label><input type="radio" name="ft-dt-as" value="text" checked> Plain text</label><label><input type="radio" name="ft-dt-as" value="chip"> Date chip (dates only)</label></div>');
    const asOf = (): string => (radio.querySelector('input:checked') as HTMLInputElement).value;
    function paint(): void {
      const now = new Date();
      for (const r of rows) {
        const f = DATE_FORMATS.find((x) => x[0] === r.id)!;
        setText(r.b.children[1], f[2](now));
        setClass(r.b, 'is-on', r.id === chosen);
      }
    }
    d.body.appendChild(list);
    d.body.appendChild(radio);
    const go = (): void => { void Promise.resolve(run('insert.dateTime', { format: chosen, as: asOf() })).then(() => d.close()).catch((e: Error) => toast(e.message, 'error')); };
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Insert', 'primary', go);
    return { d, paint };
  });
  add('insert.dateTime', 'Date and time', 'Insert', `Insert the current date and time as text or as a date chip; formats: ${DATE_FORMATS.map((f) => f[0]).join(', ')}. With no parameters, opens a dialog. The inserted value does not update itself.`, (p) => {
    if (p.format === undefined) {
      const g = dateDialog();
      g.paint();
      g.d.open();
      return true;
    }
    const f = DATE_FORMATS.find((x) => x[0] === String(p.format)) ?? fail(`format must be one of ${DATE_FORMATS.map((x) => x[0]).join(', ')}.`);
    let when = new Date();
    if (p.date !== undefined) {
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(p.date));
      if (!m) fail('date must be yyyy-mm-dd, optionally with hh:mm.');
      when = new Date(Number(m![1]), Number(m![2]) - 1, Number(m![3]), Number(m![4] ?? 0), Number(m![5] ?? 0));
    }
    const v = view();
    if (String(p.as ?? 'text') === 'chip') {
      if (!CHIP_FORMAT[f[0]]) fail('A date chip needs a date-only format: short, medium, long, weekday or iso.');
      const iso = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
      const attrs = cleanChip({ kind: 'date', date: iso, format: CHIP_FORMAT[f[0]] });
      if (!attrs) return fail('Could not make the date chip.');
      v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.chip.create(attrs), false).scrollIntoView());
      return { format: f[0], as: 'chip', date: iso };
    }
    const text = f[2](when);
    ed.insertText(text);
    return { format: f[0], as: 'text', text };
  }, [{ name: 'format', type: 'string', description: DATE_FORMATS.map((x) => x[0]).join(', ') }, { name: 'as', type: 'string', description: 'text (default) or chip' }, { name: 'date', type: 'string', description: 'yyyy-mm-dd or yyyy-mm-dd hh:mm instead of now' }]);

  const aboutDialog = lazy(() => {
    const d = new Dialog('About FormTxt', 440);
    const text = el('<div></div>');
    d.body.append(el('<img class="ft-logo ft-wc-about-logo" src="/formtxt-logo.png" width="64" height="64" alt="FormTxt" draggable="false">'), text);
    d.button('Close', 'primary', () => d.close());
    return { d, text };
  });
  add('help.about', 'About FormTxt', 'Help', 'Show the FormTxt version, licence and what it is.', () => {
    const a = aboutDialog();
    a.text.replaceChildren();
    const lines: Array<[string, string]> = [['FormTxt', `Version ${VERSION}`], ['', 'An open, local-first alternative to Microsoft Word and Google Docs. Your documents stay on this computer in the .ftxt format.'], ['Licence', 'Apache-2.0. Copyright 2026 nodemode-ai.'], ['Commands', `${reg.list().length} commands, each available from the ribbon, the command palette and the command line.`]];
    for (const [head, body] of lines) {
      const p = el('<p class="ft-wc-text"></p>');
      if (head) { const s = document.createElement('strong'); s.textContent = head; p.append(s, ` ${body}`); } else p.textContent = body;
      a.text.appendChild(p);
    }
    a.d.open();
    return { version: VERSION };
  });

  const newsDialog = lazy(() => {
    const d = new Dialog("What's new", 520);
    const head = el('<p class="ft-wc-text"></p>');
    const ul = el('<ul class="ft-wc-news"></ul>');
    for (const [t, body] of NEWS) {
      const li = document.createElement('li');
      const s = document.createElement('strong');
      s.textContent = t;
      li.append(s, ` ${body}`);
      ul.appendChild(li);
    }
    d.body.append(head, ul);
    d.button('Close', 'primary', () => d.close());
    return { d, head };
  });
  add('help.whatsNew', "What's new", 'Help', 'Show what changed in this version of FormTxt.', () => {
    const n = newsDialog();
    setText(n.head, `FormTxt ${VERSION}`);
    n.d.open();
    return { version: VERSION, items: NEWS.length };
  });

  const feedbackDialog = lazy(() => {
    const d = new Dialog('Send feedback', 480);
    d.body.appendChild(el('<p class="ft-wc-text">FormTxt is local-first and sends nothing anywhere, so there is no feedback form to submit. To report a problem or suggest a change, write to the nodemode-ai maintainers by the channel you received FormTxt from, and include the details below.</p>'));
    const box = el<HTMLTextAreaElement>('<textarea class="ft-input" rows="6" readonly spellcheck="false" aria-label="Details to include"></textarea>');
    d.body.appendChild(box);
    d.button('Copy details', 'ghost', () => {
      box.select();
      void navigator.clipboard?.writeText(box.value).then(() => toast('Details copied.', 'info'), () => toast('Select the text and copy it.', 'error'));
    });
    d.button('Close', 'primary', () => d.close());
    return { d, box };
  });
  add('help.feedback', 'Send feedback', 'Help', 'Explain where to report a problem or idea and offer the details to include; nothing is sent over the network.', () => {
    const f = feedbackDialog();
    f.box.value = [`FormTxt ${VERSION}`, `Browser: ${navigator.userAgent}`, `Document: ${ed.doc?.title ?? '(none open)'}`, `Pages: ${ed.paginator.pages}`, 'What happened:', 'What you expected:'].join('\n');
    f.d.open();
    return true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || !(e.ctrlKey || e.metaKey) || e.altKey || ed.root.hidden) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    if (document.querySelector('.ft-scrim:not([hidden])')) return;
    let id = '';
    if (e.shiftKey && (e.key === '>' || e.code === 'Period')) id = 'format.growFont';
    else if (e.shiftKey && (e.key === '<' || e.code === 'Comma')) id = 'format.shrinkFont';
    else if (!e.shiftKey && e.key.toLowerCase() === 'g') id = 'edit.goTo';
    else if (e.code === 'NumpadMultiply' || (e.key === '*' && !e.shiftKey)) id = 'view.formattingMarks';
    if (!id) return;
    e.preventDefault();
    void Promise.resolve(run(id)).catch((err: Error) => toast(err.message, 'error'));
  });
}
