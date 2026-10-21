import { Dialog } from '../../../ui/dialog';
import { el, patchList, setHidden, setText } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { type Source, SOURCE_TYPES, STYLES, authorsText, blankSource, parseAuthors, sortKey } from './cite';
import { FormDialog, type Values } from './forms';
import { newId, saveSources, saveStyle, sourcesOf, styleOf } from './util';

const SHOW: Record<string, string[]> = {
  book: ['place', 'publisher', 'edition', 'year', 'doi', 'url'],
  article: ['container', 'year', 'month', 'volume', 'issue', 'pages', 'doi', 'url'],
  website: ['container', 'year', 'month', 'day', 'accessed', 'url'],
  report: ['place', 'publisher', 'number', 'year', 'month', 'doi', 'url'],
};
const OPTIONAL = ['container', 'publisher', 'place', 'year', 'month', 'day', 'edition', 'volume', 'issue', 'pages', 'number', 'doi', 'url', 'accessed'] as const;
const CONTAINER_LABEL: Record<string, string> = { article: 'Journal', website: 'Website name' };

const sourceLabel = (s: Source): string => `${s.authors[0]?.family || 'No author'}${s.year ? ` (${s.year})` : ''}: ${s.title || 'Untitled'}`;

function paintSource(n: HTMLElement, s: Source, selected: string): void {
  setText(n, sourceLabel(s));
  n.setAttribute('aria-selected', String(s.id === selected));
  n.classList.toggle('is-selected', s.id === selected);
}

export class SourcesDialog {
  private readonly form: FormDialog;
  private readonly list: HTMLElement;
  private selected = '';

  constructor(private readonly ed: DocEditor, private readonly refresh: () => void) {
    this.form = new FormDialog('Sources', [
      { key: 'style', label: 'Citation style', kind: 'select', options: STYLES.map((s) => [s[0], s[1]]) },
      { key: 'type', label: 'Type of source', kind: 'select', options: SOURCE_TYPES.map((t) => [t[0], t[1]]) },
      { key: 'authors', label: 'Authors, one per line as Family, Given (an organisation as one name)', kind: 'textarea' },
      { key: 'title', label: 'Title', kind: 'text' },
      { key: 'container', label: 'Journal', kind: 'text' },
      { key: 'publisher', label: 'Publisher', kind: 'text' },
      { key: 'place', label: 'Place of publication', kind: 'text' },
      { key: 'year', label: 'Year', kind: 'text' },
      { key: 'month', label: 'Month (1 to 12)', kind: 'text' },
      { key: 'day', label: 'Day', kind: 'text' },
      { key: 'edition', label: 'Edition', kind: 'text' },
      { key: 'volume', label: 'Volume', kind: 'text' },
      { key: 'issue', label: 'Issue', kind: 'text' },
      { key: 'pages', label: 'Pages', kind: 'text' },
      { key: 'number', label: 'Report number', kind: 'text' },
      { key: 'doi', label: 'DOI', kind: 'text' },
      { key: 'url', label: 'Web address', kind: 'text' },
      { key: 'accessed', label: 'Accessed on', kind: 'text', placeholder: 'YYYY-MM-DD' },
    ], 'Save source', 640);
    this.form.keepOpen = true;
    this.list = el('<div class="ft-refs-sources" role="listbox" aria-label="Sources in this document"></div>');
    this.form.dialog.body.prepend(this.list);
    this.form.onChange = (k) => {
      if (k === 'type') this.paint();
      if (k === 'style') { saveStyle(ed, String(this.form.inputs.style.value)); this.refresh(); }
    };
    this.form.dialog.button('New source', 'ghost', () => this.pick(''));
    this.form.dialog.button('Delete source', 'ghost', () => {
      if (!this.selected) return;
      saveSources(ed, sourcesOf(ed).filter((s) => s.id !== this.selected));
      this.refresh();
      this.pick('');
    });
  }

  open(): void {
    this.selected = '';
    this.form.open({ style: styleOf(this.ed) }, (v) => this.save(v), 'title');
    this.pick('');
  }

  private paint(): void {
    const type = String(this.form.inputs.type.value);
    for (const k of OPTIONAL) this.form.show(k, SHOW[type]?.includes(k) ?? false);
    setText(this.form.rows.container.querySelector('.ft-field-label'), CONTAINER_LABEL[type] ?? 'Container');
  }

  private paintList(): void {
    const all = [...sourcesOf(this.ed)].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    patchList(this.list, all, {
      key: (s) => s.id,
      create: (s) => { const b = el<HTMLButtonElement>('<button type="button" class="ft-btn ghost ft-refs-source" role="option"></button>'); b.addEventListener('click', () => this.pick(s.id)); paintSource(b, s, this.selected); return b; },
      update: (n, s) => paintSource(n, s, this.selected),
    });
    setHidden(this.list, all.length === 0);
  }

  private pick(id: string): void {
    this.selected = id;
    const s = sourcesOf(this.ed).find((x) => x.id === id) ?? blankSource('');
    this.form.set({ type: s.type, authors: authorsText(s.authors), title: s.title, container: s.container, publisher: s.publisher, place: s.place, year: s.year, month: s.month, day: s.day, edition: s.edition, volume: s.volume, issue: s.issue, pages: s.pages, number: s.number, doi: s.doi, url: s.url, accessed: s.accessed });
    this.paint();
    this.paintList();
  }

  private save(v: Values): string | void {
    const made = buildSource(this.ed, v, this.selected);
    if (typeof made === 'string') return made;
    this.selected = made.id;
    this.refresh();
    this.paintList();
  }
}

export function buildSource(ed: DocEditor, v: Values, id: string): Source | string {
  const s = blankSource(id || newId('s_'));
  s.type = String(v.type);
  s.authors = parseAuthors(String(v.authors ?? ''));
  s.title = String(v.title ?? '').trim();
  for (const k of OPTIONAL) s[k] = String(v[k] ?? '').trim();
  if (!s.title) return 'Give the source a title.';
  const all = sourcesOf(ed);
  saveSources(ed, id && all.some((x) => x.id === id) ? all.map((x) => (x.id === id ? s : x)) : [...all, s]);
  return s;
}

export interface BookmarkOps {
  names(): string[];
  add(name: string): string | void;
  go(name: string): void;
  remove(name: string): void;
}

export class BookmarksDialog {
  private readonly dialog = new Dialog('Bookmarks', 460);
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly error: HTMLElement;

  constructor(private readonly ops: BookmarkOps) {
    this.input = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" placeholder="Letters, digits and underscores, starting with a letter">');
    this.dialog.field('Bookmark name', this.input);
    this.error = el('<p class="ft-note ft-refs-error" role="alert" hidden></p>');
    this.list = el('<div class="ft-refs-bookmarks"></div>');
    this.dialog.body.append(this.error, this.list);
    this.dialog.button('Close', 'ghost', () => this.dialog.close());
    this.dialog.button('Add bookmark', 'primary', () => this.add());
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.add(); } });
  }

  private add(): void {
    const msg = this.ops.add(this.input.value.trim());
    setText(this.error, msg ?? '');
    setHidden(this.error, !msg);
    if (!msg) this.input.value = '';
    this.paint();
  }

  private paint(): void {
    patchList(this.list, this.ops.names(), {
      key: (n) => n,
      create: (n) => {
        const row = el(`<div class="ft-refs-bm"><span class="ft-refs-bm-name"></span><button type="button" class="ft-btn ghost" data-act="go">Go to</button><button type="button" class="ft-btn ghost" data-act="del">Delete</button></div>`);
        row.querySelector('[data-act="go"]')?.addEventListener('click', () => { this.dialog.close(); this.ops.go(n); });
        row.querySelector('[data-act="del"]')?.addEventListener('click', () => { this.ops.remove(n); this.paint(); });
        setText(row.querySelector('.ft-refs-bm-name'), n);
        return row;
      },
      update: (node, n) => setText(node.querySelector('.ft-refs-bm-name'), n),
    });
  }

  open(): void {
    setText(this.error, '');
    setHidden(this.error, true);
    this.paint();
    this.dialog.open(this.input);
  }
}
