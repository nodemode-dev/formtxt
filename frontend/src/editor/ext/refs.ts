import { keymap } from 'prosemirror-keymap';
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { CommandRegistry } from '../../engine/registry';
import { toast } from '../../ui/toast';
import type { DocEditor } from '../editor';
import { schema } from '../schema';
import { STYLES } from './refs/cite';
import { buildUpdate } from './refs/compute';
import { BookmarksDialog, SourcesDialog } from './refs/dialogs';
import { FormDialog, setOptions } from './refs/forms';
import {
  XREF_WHAT, addBookmark, addSource, bookmarkNames, chipToLink, convertNotes, defaultCaptionLabel, insertBibliography, insertCaption, insertCitation, insertCrossRef,
  insertFiguresTable, insertIndex, insertIndexEntry, insertNote, insertToc, linkToTarget, makeLinkChip, noteAt, quick, refreshAll, removeBookmark, selectedText, setNoteText,
  linkUnderSelection, targetsFor,
} from './refs/ops';
import { headings, jump, saveSources, saveStyle, sourcesOf } from './refs/util';
import { addMenuItems } from './ui';
import { addPlugin, onDocumentLoaded } from './plugins';
import { linkCardPlugin } from './refs/card';
import type { CommandParam } from '../../engine/registry';

const P = (name: string, type: CommandParam['type'], description: string): CommandParam => ({ name, type, description });
const RELEVANT = new Set(['note_ref', 'seq', 'citation', 'xref', 'ref_notes']);

function hasRefs(view: EditorView): boolean {
  let found = false;
  view.state.doc.descendants((n) => { if (RELEVANT.has(n.type.name)) found = true; return !found; });
  return found;
}

const jumpTarget = (kind: string, target: string): string => (kind === 'bookmark' ? `bm:${target}` : kind === 'note' ? `note:${target}` : target);

export function register(reg: CommandRegistry, ed: DocEditor): void {
  const add = (id: string, label: string, description: string, run: (p: Record<string, unknown>) => unknown, params: CommandParam[] = [], keys: string[] = []): void =>
    reg.register({ id, label, group: 'References', description, params, keys, run });
  const fail = (msg: string): never => { throw new Error(msg); };
  const has = (p: Record<string, unknown>, ...names: string[]): boolean => names.some((n) => p[n] !== undefined);

  let timer = 0;
  const schedule = (view: EditorView): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!view.dom.isConnected || !hasRefs(view)) return;
      const u = buildUpdate(ed, view, { blocks: false, pages: false });
      if (u) view.dispatch(u.tr.setMeta('addToHistory', false).setMeta('refs', true));
    }, 400);
  };

  const go = (view: EditorView, raw: string): void => {
    if (!jump(view, raw)) toast('That target is no longer in this document.', 'error');
  };

  const noteDialog = new FormDialog('Note text', [{ key: 'text', label: 'Text', kind: 'textarea' }], 'Save note', 480);
  const editNote = (id: string, text: string): void => {
    noteDialog.open({ text }, (v) => { setNoteText(ed, id, String(v.text)); }, 'text');
  };

  addPlugin(new Plugin({
    view: () => ({ update: (v, prev) => { if (v.state.doc !== prev.doc) schedule(v); } }),
    props: {
      handleDOMEvents: {
        keydown: (view, e) => {
          if (e.key === 'F9') { refreshAll(ed); void view; }
          return false;
        },
        click: (view, e) => {
          const t = e.target as HTMLElement | null;
          if (!t) return false;
          const mod = e.ctrlKey || e.metaKey || !view.editable;
          if (t.closest('.ft-refblock-update')) { e.preventDefault(); refreshAll(ed); return true; }
          const entry = t.closest<HTMLElement>('.ft-ref-entry[data-target]');
          if (entry?.dataset.target) { e.preventDefault(); go(view, entry.dataset.target); return true; }
          const x = t.closest<HTMLElement>('.ft-xref');
          if (x && mod) { e.preventDefault(); go(view, jumpTarget(x.dataset.kind ?? '', x.dataset.target ?? '')); return true; }
          const chip = t.closest<HTMLAnchorElement>('a.ft-linkchip');
          if (chip) { e.preventDefault(); if (mod) window.open(chip.href, '_blank', 'noopener'); return !!mod; }
          const a = t.closest<HTMLAnchorElement>('a[href^="#"]');
          if (a) { e.preventDefault(); if (mod) go(view, (a.getAttribute('href') ?? '').slice(1)); return !!mod; }
          return false;
        },
        dblclick: (view, e) => {
          const n = (e.target as HTMLElement | null)?.closest<HTMLElement>('.ft-noteref');
          if (!n?.dataset.id || !view.editable) return false;
          editNote(n.dataset.id, n.dataset.text ?? '');
          return true;
        },
      },
    },
  }));
  addPlugin(linkCardPlugin());
  addPlugin(keymap({
    'Mod-Alt-f': () => { void reg.run('references.insertFootnote').catch((e: Error) => toast(e.message, 'error')); return true; },
    'Mod-Alt-d': () => { void reg.run('references.insertEndnote').catch((e: Error) => toast(e.message, 'error')); return true; },
  }));
  onDocumentLoaded(() => { window.setTimeout(() => { if (ed.view && hasRefs(ed.view)) quick(ed); }, 500); });

  const tocForm = new FormDialog('Table of contents', [
    { key: 'from', label: 'Show levels from', kind: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [String(n), `Heading ${n}`]) },
    { key: 'to', label: 'Show levels to', kind: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [String(n), `Heading ${n}`]) },
    { key: 'pages', label: 'Show page numbers', kind: 'check' },
    { key: 'links', label: 'Entries jump to the heading', kind: 'check' },
  ], 'Insert');
  add('references.insertToc', 'Table of contents', 'Insert a table of contents built from the headings, with page numbers and links that jump to each heading. With no parameters, asks which levels to show.', (p) => {
    const run = (from: number, to: number, pages: boolean, links: boolean): boolean => { insertToc(ed, from, to, pages, links); return true; };
    if (has(p, 'from', 'to')) return run(Number(p.from) || 1, Number(p.to) || 3, p.pages !== false, p.links !== false);
    tocForm.open({ from: '1', to: '3', pages: true, links: true }, (v) => { run(Number(v.from), Number(v.to), !!v.pages, !!v.links); });
    return true;
  }, [P('from', 'number', 'First heading level, 1 to 9'), P('to', 'number', 'Last heading level, 1 to 9 (default 3)'), P('pages', 'boolean', 'Show page numbers (default true)'), P('links', 'boolean', 'Entries jump to the heading (default true)')]);
  add('references.updateAll', 'Update references', 'Recompute note numbers, caption numbers, citations, cross-references, the table of contents, tables of figures, the index and the bibliography (also F9). Returns how many things changed.', () => refreshAll(ed));
  add('references.updateToc', 'Update table', 'Rebuild the table of contents, tables of figures, index and bibliography from the document as it is now.', () => refreshAll(ed));

  add('references.insertFootnote', 'Insert footnote', 'Insert an automatically numbered footnote mark at the caret. Without text, asks for the note text.', (p) => {
    const id = insertNote(ed, 'footnote', String(p.text ?? ''));
    if (p.text === undefined) editNote(id, '');
    return id;
  }, [P('text', 'string', 'The note text')], ['Ctrl+Alt+F']);
  add('references.insertEndnote', 'Insert endnote', 'Insert an endnote mark (numbered i, ii, iii) at the caret; endnotes are listed at the end of the document.', (p) => {
    const id = insertNote(ed, 'endnote', String(p.text ?? ''));
    if (p.text === undefined) editNote(id, '');
    return id;
  }, [P('text', 'string', 'The note text')], ['Ctrl+Alt+D']);
  add('references.editNote', 'Edit note', 'Edit the text of the selected note mark (or the note with the given id).', (p) => {
    const sel = noteAt(ed);
    const id = String(p.id ?? sel?.id ?? '');
    if (!id) fail('Select a footnote or endnote mark first.');
    if (p.text !== undefined) return setNoteText(ed, id, String(p.text));
    editNote(id, sel?.text ?? '');
    return true;
  }, [P('id', 'string', 'Note id (default: the selected mark)'), P('text', 'string', 'New note text')]);
  add('references.convertToEndnotes', 'Convert footnotes to endnotes', 'Turn every footnote (or only the selected one) into an endnote.', () => convertNotes(ed, 'endnote'));
  add('references.convertToFootnotes', 'Convert endnotes to footnotes', 'Turn every endnote (or only the selected one) into a footnote.', () => convertNotes(ed, 'footnote'));
  add('references.listNotes', 'List notes', 'Every footnote and endnote with its number and text.', () => {
    const out: Array<Record<string, unknown>> = [];
    ed.view?.state.doc.descendants((n) => { if (n.type === schema.nodes.note_ref) out.push({ id: n.attrs.id, kind: n.attrs.kind, n: n.attrs.n, text: n.attrs.text }); return true; });
    return out;
  });

  const sources = new SourcesDialog(ed, () => refreshAll(ed));
  add('references.manageSources', 'Manage sources', 'Open the source manager: add books, articles, websites and reports, and choose the citation style.', () => { sources.open(); return true; });
  add('references.addSource', 'Add source', 'Add a source to the document. Returns its id.', (p) => addSource(ed, p), [
    P('type', 'string', 'book, article, website or report'), P('title', 'string', 'Title'), P('authors', 'string', 'One author per line as Family, Given'), P('year', 'string', 'Year'),
    P('container', 'string', 'Journal or website name'), P('publisher', 'string', 'Publisher'), P('place', 'string', 'Place of publication'), P('volume', 'string', 'Volume'), P('issue', 'string', 'Issue'),
    P('pages', 'string', 'Pages'), P('url', 'string', 'Web address'), P('doi', 'string', 'DOI'),
  ]);
  add('references.removeSource', 'Remove source', 'Remove a source by id.', (p) => { saveSources(ed, sourcesOf(ed).filter((s) => s.id !== String(p.id))); refreshAll(ed); return true; }, [P('id', 'string', 'Source id')]);
  add('references.listSources', 'List sources', 'Every source stored in the document.', () => sourcesOf(ed));
  add('references.setCitationStyle', 'Citation style', 'Switch the citation style (apa, mla, chicago or ieee); every citation and the bibliography are rewritten.', (p) => {
    const s = String(p.style ?? '');
    if (!STYLES.some((x) => x[0] === s)) fail('The style must be apa, mla, chicago or ieee.');
    saveStyle(ed, s);
    return refreshAll(ed);
  }, [P('style', 'string', 'apa, mla, chicago or ieee')]);
  const citeForm = new FormDialog('Insert citation', [
    { key: 'source', label: 'Source', kind: 'select' },
    { key: 'locator', label: 'Page or locator (optional)', kind: 'text', placeholder: '45' },
  ], 'Insert');
  add('references.insertCitation', 'Insert citation', 'Insert a citation to a source at the caret, formatted in the document citation style.', (p) => {
    if (has(p, 'source')) { const m = insertCitation(ed, String(p.source), String(p.locator ?? '')); if (m) fail(m); return true; }
    const list = sourcesOf(ed);
    if (!list.length) { toast('Add a source first.'); sources.open(); return false; }
    setOptions(citeForm.inputs.source as HTMLSelectElement, list.map((s) => [s.id, `${s.authors[0]?.family || 'No author'} ${s.year}: ${s.title}`]));
    citeForm.open({ source: list[0].id, locator: '' }, (v) => insertCitation(ed, String(v.source), String(v.locator)), 'source');
    return true;
  }, [P('source', 'string', 'Source id'), P('locator', 'string', 'Page or locator')]);
  add('references.insertBibliography', 'Insert bibliography', 'Insert a bibliography block listing the cited sources (or all sources) in the citation style; it updates with Update references.', (p) => { insertBibliography(ed, p.scope === 'all'); return true; }, [P('scope', 'string', 'cited (default) or all')]);

  const capForm = new FormDialog('Insert caption', [
    { key: 'label', label: 'Label', kind: 'select', options: ['Figure', 'Table', 'Equation', 'Chart', 'Diagram'].map((l) => [l, l]) },
    { key: 'text', label: 'Caption text', kind: 'text', placeholder: 'What the figure shows' },
    { key: 'position', label: 'Position', kind: 'select', options: [['below', 'Below the selected item'], ['above', 'Above the selected item']] },
  ], 'Insert');
  add('references.insertCaption', 'Insert caption', 'Add a numbered caption (Figure 1, Table 1) below the selected picture, table, chart or equation, or at the caret.', (p) => {
    if (has(p, 'label', 'text', 'position')) { insertCaption(ed, String(p.label ?? ''), String(p.text ?? ''), p.position === 'above'); return true; }
    capForm.open({ label: defaultCaptionLabel(ed), text: '', position: 'below' }, (v) => { insertCaption(ed, String(v.label), String(v.text), v.position === 'above'); });
    return true;
  }, [P('label', 'string', 'Figure, Table, Equation or your own label'), P('text', 'string', 'Caption text'), P('position', 'string', 'below (default) or above')]);
  const tofForm = new FormDialog('Table of figures', [{ key: 'label', label: 'Caption label', kind: 'select', options: ['Figure', 'Table', 'Equation', 'Chart', 'Diagram'].map((l) => [l, l]) }], 'Insert');
  add('references.insertTableOfFigures', 'Table of figures', 'Insert a list of the captions of one label with their page numbers.', (p) => {
    if (has(p, 'label')) { insertFiguresTable(ed, String(p.label)); return true; }
    tofForm.open({ label: 'Figure' }, (v) => { insertFiguresTable(ed, String(v.label)); });
    return true;
  }, [P('label', 'string', 'Caption label, such as Figure or Table')]);

  const xrefForm = new FormDialog('Cross-reference', [
    { key: 'kind', label: 'Refer to', kind: 'select', options: [['heading', 'Heading'], ['bookmark', 'Bookmark'], ['caption', 'Caption'], ['note', 'Footnote or endnote']] },
    { key: 'target', label: 'Which one', kind: 'select' },
    { key: 'what', label: 'Insert', kind: 'select' },
  ], 'Insert', 520);
  const paintXref = (): void => {
    const kind = String(xrefForm.inputs.kind.value);
    setOptions(xrefForm.inputs.target as HTMLSelectElement, targetsFor(ed, kind).map((t) => [t.value, t.label]));
    setOptions(xrefForm.inputs.what as HTMLSelectElement, XREF_WHAT[kind] ?? []);
  };
  xrefForm.onChange = (k) => { if (k === 'kind') paintXref(); };
  add('references.insertCrossReference', 'Cross-reference', 'Insert a reference to a heading, bookmark, caption number or note number that updates with Update references.', (p) => {
    if (has(p, 'target')) { const m = insertCrossRef(ed, String(p.kind ?? 'heading'), String(p.target), String(p.what ?? '')); if (m) fail(m); return true; }
    xrefForm.open({ kind: 'heading' }, (v) => insertCrossRef(ed, String(v.kind), String(v.target), String(v.what)));
    paintXref();
    return true;
  }, [P('kind', 'string', 'heading, bookmark, caption or note'), P('target', 'string', 'Heading or caption paragraph id, bookmark name or note id'), P('what', 'string', 'text, page, label, number')]);

  const indexForm = new FormDialog('Mark index entry', [
    { key: 'main', label: 'Main entry', kind: 'text' },
    { key: 'sub', label: 'Subentry (optional)', kind: 'text' },
  ], 'Mark');
  add('references.markIndexEntry', 'Mark index entry', 'Mark the selected text (or the caret) as an index entry with an optional subentry.', (p) => {
    if (has(p, 'main')) { const m = insertIndexEntry(ed, String(p.main), String(p.sub ?? '')); if (m) fail(m); return true; }
    indexForm.open({ main: selectedText(ed), sub: '' }, (v) => insertIndexEntry(ed, String(v.main), String(v.sub)), 'main');
    return true;
  }, [P('main', 'string', 'Main entry'), P('sub', 'string', 'Subentry')]);
  add('references.insertIndex', 'Insert index', 'Insert an alphabetical index of the marked entries with page numbers.', () => { insertIndex(ed); return true; });

  const bookmarks = new BookmarksDialog({
    names: () => bookmarkNames(ed),
    add: (n) => addBookmark(ed, n),
    go: (n) => go(ed.view!, `bm:${n}`),
    remove: (n) => { removeBookmark(ed, n); },
  });
  add('references.manageBookmarks', 'Bookmarks', 'Open the bookmark list: add, go to or delete bookmarks.', () => { bookmarks.open(); return true; });
  add('references.addBookmark', 'Add bookmark', 'Add (or move) a named bookmark at the selection.', (p) => { const m = addBookmark(ed, String(p.name ?? '')); if (m) fail(m); return true; }, [P('name', 'string', 'Letters, digits and underscores, starting with a letter')]);
  add('references.goToBookmark', 'Go to bookmark', 'Scroll to a bookmark.', (p) => { if (!ed.view || !jump(ed.view, `bm:${String(p.name)}`)) fail('No bookmark has that name.'); return true; }, [P('name', 'string', 'Bookmark name')]);
  add('references.deleteBookmark', 'Delete bookmark', 'Remove a bookmark.', (p) => removeBookmark(ed, String(p.name)), [P('name', 'string', 'Bookmark name')]);
  add('references.listBookmarks', 'List bookmarks', 'Every bookmark name.', () => bookmarkNames(ed));

  const linkForm = new FormDialog('Link to heading or bookmark', [
    { key: 'target', label: 'Link to', kind: 'select' },
    { key: 'text', label: 'Link text when nothing is selected', kind: 'text' },
  ], 'Insert link', 520);
  add('references.linkToHeading', 'Link to heading', 'Link the selection to a heading or bookmark in this document; Ctrl+click follows it.', (p) => {
    if (has(p, 'target')) { const m = linkToTarget(ed, String(p.target), String(p.text ?? '')); if (m) fail(m); return true; }
    const doc = ed.view?.state.doc;
    if (!doc) fail('Open a document first.');
    const opts: Array<[string, string]> = [
      ...headings(doc!).filter((h) => h.id).map((h): [string, string] => [h.id, `${'  '.repeat(h.level - 1)}${h.text}`]),
      ...bookmarkNames(ed).map((n): [string, string] => [`bm:${n}`, `Bookmark: ${n}`]),
    ];
    if (!opts.length) { toast('Add a heading or a bookmark first.'); return false; }
    setOptions(linkForm.inputs.target as HTMLSelectElement, opts);
    linkForm.open({ target: opts[0][0], text: selectedText(ed) ? '' : headings(doc!).find((h) => h.id === opts[0][0])?.text ?? '' }, (v) => linkToTarget(ed, String(v.target), String(v.text)), 'target');
    return true;
  }, [P('target', 'string', 'Heading paragraph id, or bm: plus a bookmark name'), P('text', 'string', 'Link text when nothing is selected')]);

  const chipForm = new FormDialog('Link preview chip', [
    { key: 'url', label: 'Web address', kind: 'text', placeholder: 'https://' },
    { key: 'fetch', label: 'Look up the page title now (contacts that site once)', kind: 'check' },
  ], 'Make chip');
  add('references.linkChip', 'Link preview chip', 'Turn a link into a chip that shows the page title and site. The page title is fetched only when you run this, by the engine, from public web addresses; offline it shows the site name.', async (p) => {
    const under = linkUnderSelection(ed);
    const url = String(p.url ?? under?.href ?? '');
    if (has(p, 'url') || (under && !under.href.startsWith('#'))) {
      const info = await makeLinkChip(ed, url, p.fetch !== false);
      return { title: info.title, site: info.site, fetched: info.fetched };
    }
    chipForm.open({ url: selectedText(ed).startsWith('http') ? selectedText(ed) : '', fetch: true }, async (v) => {
      try { await makeLinkChip(ed, String(v.url), !!v.fetch); } catch (e) { return (e as Error).message; }
    }, 'url');
    return true;
  }, [P('url', 'string', 'Web address (default: the selected link)'), P('fetch', 'boolean', 'Look up the page title (default true)')]);
  add('references.chipToLink', 'Chip to plain link', 'Turn the selected link chip back into a plain link.', () => chipToLink(ed));

  addMenuItems('Insert', [
    { cmd: 'references.manageBookmarks', label: 'Bookmark...' },
    { cmd: 'references.linkToHeading', label: 'Link to heading...' },
    { cmd: 'references.insertCrossReference', label: 'Cross-reference...' },
    { cmd: 'references.linkChip', label: 'Link preview chip...' },
  ]);
  addMenuItems('References', [
    { cmd: 'references.insertToc', label: 'Table of contents...' },
    { cmd: 'references.updateToc', label: 'Update table' },
  ]);
  addMenuItems('References', [
    { cmd: 'references.insertFootnote', label: 'Insert footnote', keys: 'Ctrl+Alt+F' },
    { cmd: 'references.insertEndnote', label: 'Insert endnote', keys: 'Ctrl+Alt+D' },
    { cmd: 'references.editNote', label: 'Edit note...' },
    { cmd: 'references.convertToEndnotes', label: 'Convert footnotes to endnotes' },
    { cmd: 'references.convertToFootnotes', label: 'Convert endnotes to footnotes' },
  ]);
  addMenuItems('References', [
    { cmd: 'references.manageSources', label: 'Manage sources...' },
    { cmd: 'references.insertCitation', label: 'Insert citation...' },
    ...STYLES.map((s) => ({ cmd: 'references.setCitationStyle', label: `Citation style: ${s[1]}`, params: { style: s[0] } })),
    { cmd: 'references.insertBibliography', label: 'Insert bibliography' },
  ]);
  addMenuItems('References', [
    { cmd: 'references.insertCaption', label: 'Insert caption...' },
    { cmd: 'references.insertTableOfFigures', label: 'Insert table of figures...' },
  ]);
  addMenuItems('References', [
    { cmd: 'references.markIndexEntry', label: 'Mark index entry...' },
    { cmd: 'references.insertIndex', label: 'Insert index' },
  ]);
  addMenuItems('References', [{ cmd: 'references.updateAll', label: 'Update all references', keys: 'F9' }]);
}
