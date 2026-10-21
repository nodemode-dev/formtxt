import type { DocSummary } from '../engine/model';
import { api, type TemplateSummary } from '../io/api';
import { Dialog } from './dialog';
import { el, escapeHtml, patchList, setClass, setHidden, setText } from './dom';
import { icon } from './icons';
import { toast, undoToast } from './toast';

export interface HomeHooks {
  openDocument(id: string): void;
  createDocument(template: string, title?: string): Promise<void>;
  importFiles(files: File[]): Promise<void>;
  preferences(): void;
}

type View = 'start' | 'recent' | 'templates' | 'trash';
const FORMATS = ['MD', 'TXT'];
const ACCEPT = '.md,.markdown,.txt,.docx,.dotx,.docm,.odt,.ott,.rtf,.html,.htm,.xhtml,.doc,.dot';

function ago(seconds: number): string {
  if (!seconds) return '';
  const s = Date.now() / 1000 - seconds;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(seconds * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const SKELETON = `<button class="ft-card is-skeleton" type="button" tabindex="-1" data-key="__skeleton" aria-hidden="true"><span class="ft-card-preview"></span><span class="ft-card-body"><span class="ft-card-name">&nbsp;</span><span class="ft-card-meta">&nbsp;</span></span></button>`;

export class Home {
  readonly root: HTMLElement;
  private view: View = 'start';
  private templates: TemplateSummary[] = [];
  private categories: string[] = ['All'];
  private category = 'All';
  private query = '';
  private docs: DocSummary[] = [];
  private trashed: DocSummary[] = [];
  private pinned: string[] = [];
  private hiddenRecent: string[] = [];
  private readonly selected = new Set<string>();
  private anchor = '';
  private readonly tplGrid: HTMLElement;
  private readonly tplGridFull: HTMLElement;
  private readonly recentGrid: HTMLElement;
  private readonly recentGridFull: HTMLElement;
  private readonly trashList: HTMLElement;
  private readonly confirmBar: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly preview: TemplatePreview;
  private onConfirm: (() => void) | null = null;

  constructor(private readonly hooks: HomeHooks, host: HTMLElement) {
    const nav = (v: View, ic: string, label: string, count = ''): string =>
      `<button class="ft-home-nav-item${v === 'start' ? ' is-active' : ''}" type="button" data-v="${v}">${icon(ic, 16)}<span>${label}</span>${count ? `<span class="ft-badge ${count}">0</span>` : ''}</button>`;
    this.root = el(`<section class="ft-home" aria-label="Home">
<nav class="ft-home-nav">
<div class="ft-home-brand">${icon('brand', 24)}FormTxt <span>by NodeMode</span></div>
${nav('start', 'home', 'Start')}${nav('recent', 'clock', 'Recent documents', 'ft-doc-count')}${nav('templates', 'template', 'Templates', 'ft-tpl-count')}${nav('trash', 'trash', 'Trash', 'ft-trash-count')}
<div class="ft-home-nav-sep"></div>
<div class="ft-home-nav-title">Agents</div>
<button class="ft-home-nav-item" type="button" data-a="agents">${icon('agent', 16)}<span>Claude Code, Codex, Cursor</span></button>
<div class="ft-home-nav-foot">
<button class="ft-home-nav-item" type="button" data-a="local" title="Your documents stay on this computer">${icon('cloudOff', 16)}<span>Local only</span></button>
<button class="ft-home-nav-item" type="button" data-a="prefs">${icon('settings', 16)}<span>Preferences</span></button>
</div></nav>
<div class="ft-home-main">
<div class="ft-home-narrow">${nav('start', 'home', 'Start')}${nav('recent', 'clock', 'Recent')}${nav('templates', 'template', 'Templates')}${nav('trash', 'trash', 'Trash')}</div>
<div class="ft-home-confirm" role="alertdialog" aria-live="assertive" hidden><span class="ft-home-confirm-text"></span><button class="ft-btn sm" type="button" data-a="confirm-no">Cancel</button><button class="ft-btn sm danger" type="button" data-a="confirm-yes"></button></div>
<div data-page="start">
<div class="ft-home-head"><div><h1 class="ft-home-title"></h1><p class="ft-home-sub">Write something new, pick up where you left off, or start from one of 39 templates.</p></div><div class="ft-home-head-actions"><button class="ft-btn" type="button" data-a="open">${icon('folderOpen', 14)}Open file</button><button class="ft-btn" type="button" data-a="blank">${icon('plus', 14)}Blank document</button></div></div>
<div class="ft-home-hero">
<span class="ft-home-hero-icon">${icon('inbox', 26)}</span>
<div class="ft-home-hero-text"><div class="ft-home-hero-title">Start from your material</div>
<div class="ft-home-hero-sub">Drop notes, a draft or an outline here and each file becomes a document in your library. Word, OpenDocument, RTF, HTML, .doc and PDF arrive with the exchange phase.</div>
<div class="ft-home-formats">${FORMATS.map((f) => `<span class="ft-home-format">${f}</span>`).join('')}</div></div>
<div class="ft-home-hero-actions"><button class="ft-btn cta" type="button" data-a="choose">${icon('upload', 14)}Choose files</button><button class="ft-btn" type="button" data-a="paste">${icon('fileText', 14)}Paste text</button><button class="ft-btn ghost" type="button" data-a="agents">${icon('agent', 14)}Use your agent</button></div>
</div>
<section class="ft-home-section"><div class="ft-home-section-head"><h2 class="ft-home-section-title">Recent documents</h2><button class="ft-btn ghost sm" type="button" data-v="recent">See all</button></div><div class="ft-card-grid ft-recent-grid">${SKELETON}</div><div class="ft-card-grid ft-recent-empty" hidden><button class="ft-card is-empty" type="button" tabindex="-1" data-a="blank"><span class="ft-card-preview is-blank">${icon('document', 28)}</span><span class="ft-card-body"><span class="ft-card-name">No documents yet</span><span class="ft-card-meta">Start blank, from a template or from a file</span></span></button></div></section>
<section class="ft-home-section"><div class="ft-home-section-head"><h2 class="ft-home-section-title">Templates</h2><div class="ft-home-filters ft-cats"></div><label class="ft-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="ft-tpl-search"></label></div><div class="ft-card-grid ft-tpl-grid"></div></section>
</div>
<div data-page="recent" hidden><div class="ft-home-head"><div><h1 class="ft-home-title">Recent documents</h1><p class="ft-home-sub">Everything in your library, newest first. Pinned documents stay at the front.</p></div></div><div class="ft-card-grid ft-recent-full"></div></div>
<div data-page="templates" hidden><div class="ft-home-head"><div><h1 class="ft-home-title">Templates</h1><p class="ft-home-sub">39 original templates in 11 categories, plus any document you save as a template.</p></div></div>
<div class="ft-home-section-head"><div class="ft-home-filters ft-cats"></div><label class="ft-search">${icon('search', 14)}<input type="search" placeholder="Search templates" class="ft-tpl-search"></label></div><div class="ft-card-grid ft-tpl-full"></div></div>
<div data-page="trash" hidden><div class="ft-home-head"><div><h1 class="ft-home-title">Trash</h1><p class="ft-home-sub">Deleted documents wait here until you restore them or delete them permanently.</p></div><div class="ft-home-head-actions"><button class="ft-btn ft-empty-trash" type="button" data-a="empty-trash" disabled>${icon('trash', 14)}Empty Trash</button></div></div><div class="ft-trash-list"></div><p class="ft-note ft-trash-none">Trash is empty.</p></div>
</div></section>`);
    setText(this.root.querySelector('[data-page="start"] .ft-home-title'), greeting());
    this.tplGrid = this.root.querySelector('.ft-tpl-grid') as HTMLElement;
    this.tplGridFull = this.root.querySelector('.ft-tpl-full') as HTMLElement;
    this.recentGrid = this.root.querySelector('.ft-recent-grid') as HTMLElement;
    this.recentGridFull = this.root.querySelector('.ft-recent-full') as HTMLElement;
    this.trashList = this.root.querySelector('.ft-trash-list') as HTMLElement;
    this.confirmBar = this.root.querySelector('.ft-home-confirm') as HTMLElement;
    this.menu = el('<div class="ft-menu" role="menu" hidden></div>');
    document.getElementById('overlay-root')?.appendChild(this.menu);
    this.preview = new TemplatePreview(hooks);
    host.appendChild(this.root);
    this.wire();
  }

  private wire(): void {
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      this.closeMenu();
      const v = (t.closest('[data-v]') as HTMLElement | null)?.dataset.v as View | undefined;
      if (v) { this.show(v); return; }
      const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a;
      const row = (t.closest('[data-key]') as HTMLElement | null)?.dataset.key;
      if (a === 'confirm-yes') { const go = this.onConfirm; this.askClose(); go?.(); return; }
      if (a === 'confirm-no') { this.askClose(); return; }
      if (a === 'empty-trash') { this.ask(`Permanently delete ${this.trashed.length} document${this.trashed.length === 1 ? '' : 's'} in the Trash? This cannot be undone.`, 'Empty Trash', () => void this.purge(null)); return; }
      if (a === 'restore' && row) { void this.restore([row]); return; }
      if (a === 'purge' && row) { const x = this.trashed.find((d) => d.id === row); this.ask(`Permanently delete "${x?.title ?? 'this document'}"? This cannot be undone.`, 'Delete permanently', () => void this.purge(row)); return; }
      const more = t.closest('.ft-card-more') as HTMLElement | null;
      if (more) {
        e.stopPropagation();
        const id = (more.closest('.ft-card') as HTMLElement).dataset.doc;
        const r = more.getBoundingClientRect();
        if (id) this.openMenu(id, r.left, r.bottom + 4);
        return;
      }
      const card = t.closest('.ft-card') as HTMLElement | null;
      if (card?.dataset.doc && (e.ctrlKey || e.metaKey || e.shiftKey)) { this.pickCard(card, e.shiftKey); return; }
      if (a === 'blank') void this.hooks.createDocument('');
      else if (a === 'open' || a === 'choose') this.pick();
      else if (a === 'paste') this.pasteText();
      else if (a === 'prefs') this.hooks.preferences();
      else if (a === 'agents') toast('Agent tools for Claude Code, Codex and Cursor arrive with the MCP server in Phase 9 of the plan.');
      else if (a === 'local') toast('Your documents and templates stay in your FormTxt folder on this computer.');
      if (card?.dataset.doc) this.hooks.openDocument(card.dataset.doc);
      if (card?.dataset.template) {
        const tpl = this.templates.find((x) => x.id === card.dataset.template);
        if (tpl) this.preview.show(tpl);
      }
      const chip = t.closest('.ft-chip') as HTMLElement | null;
      if (chip?.dataset.cat) { this.category = chip.dataset.cat; this.renderTemplates(); }
    });
    for (const input of Array.from(this.root.querySelectorAll<HTMLInputElement>('.ft-tpl-search'))) {
      input.addEventListener('input', () => {
        this.query = input.value.trim().toLowerCase();
        for (const other of Array.from(this.root.querySelectorAll<HTMLInputElement>('.ft-tpl-search'))) if (other !== input && other.value !== input.value) other.value = input.value;
        this.renderTemplates();
      });
    }
    this.root.addEventListener('contextmenu', (e) => {
      const card = (e.target as HTMLElement).closest('.ft-card') as HTMLElement | null;
      if (!card?.dataset.doc) return;
      e.preventDefault();
      if (!this.selected.has(card.dataset.doc)) { this.clearSelection(); this.setSelected(card.dataset.doc, true); }
      this.openMenu(card.dataset.doc, e.clientX, e.clientY);
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (!this.menu.hidden) { this.closeMenu(); return; } if (!this.confirmBar.hidden) { this.askClose(); return; } if (this.selected.size) this.clearSelection(); return; }
      if (e.key !== 'Delete') return;
      const id = ((e.target as HTMLElement).closest('.ft-card') as HTMLElement | null)?.dataset.doc;
      if (!id) return;
      e.preventDefault();
      this.requestDelete(this.selected.has(id) ? [...this.selected] : [id]);
    });
    document.addEventListener('pointerdown', (e) => { if (!this.menu.hidden && !this.menu.contains(e.target as Node)) this.closeMenu(); }, true);
    const hero = this.root.querySelector('.ft-home-hero') as HTMLElement;
    hero.addEventListener('dragover', (e) => { e.preventDefault(); setClass(hero, 'is-drag-over', true); });
    hero.addEventListener('dragleave', () => setClass(hero, 'is-drag-over', false));
    hero.addEventListener('drop', (e) => {
      e.preventDefault();
      setClass(hero, 'is-drag-over', false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void this.hooks.importFiles(files).then(() => this.load());
    });
  }

  private pick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.onchange = () => { const files = Array.from(input.files ?? []); if (files.length) void this.hooks.importFiles(files).then(() => this.load()); };
    input.click();
  }

  private pasteText(): void {
    const d = new Dialog('Paste your material', 620);
    const ta = el<HTMLTextAreaElement>('<textarea class="ft-input" rows="14" placeholder="Paste notes, a draft or an outline. Markdown headings, lists and quotes are kept."></textarea>');
    d.body.appendChild(ta);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Create document', 'primary', () => {
      const text = ta.value.trim();
      d.close();
      if (text) void this.hooks.importFiles([new File([text], 'Pasted text.md', { type: 'text/markdown' })]).then(() => this.load());
    });
    d.open(ta);
  }

  async load(): Promise<void> {
    const [t, l, tr, st] = await Promise.all([
      api.get<{ categories: string[]; templates: TemplateSummary[] }>('/templates'),
      api.get<{ documents: DocSummary[] }>('/documents'),
      api.get<{ documents: DocSummary[] }>('/documents/trash').catch(() => ({ documents: [] as DocSummary[] })),
      api.get<Record<string, unknown>>('/settings').catch(() => ({} as Record<string, unknown>)),
    ]);
    this.pinned = Array.isArray(st.pinned) ? st.pinned.filter((x): x is string => typeof x === 'string') : [];
    this.hiddenRecent = Array.isArray(st.recentHidden) ? st.recentHidden.filter((x): x is string => typeof x === 'string') : [];
    this.templates = t.templates;
    this.categories = ['All', ...t.categories];
    this.docs = l.documents;
    this.trashed = tr.documents;
    for (const id of [...this.selected]) if (!this.docs.some((d) => d.id === id)) this.selected.delete(id);
    setText(this.root.querySelector('.ft-tpl-count'), String(this.templates.length));
    this.renderTemplates();
    this.renderDocs();
    this.renderTrash();
  }

  private ask(text: string, action: string, go: () => void): void {
    this.onConfirm = go;
    setText(this.confirmBar.querySelector('.ft-home-confirm-text'), text);
    setText(this.confirmBar.querySelector('[data-a="confirm-yes"]'), action);
    setHidden(this.confirmBar, false);
    (this.confirmBar.querySelector('[data-a="confirm-no"]') as HTMLElement).focus();
  }

  private askClose(): void {
    this.onConfirm = null;
    setHidden(this.confirmBar, true);
  }

  private closeMenu(): void { setHidden(this.menu, true); }

  private openMenu(id: string, x: number, y: number): void {
    const ids = this.selected.has(id) && this.selected.size > 1 ? [...this.selected] : [id];
    const many = ids.length > 1;
    const rows: Array<[string, () => void]> = [];
    if (!many) {
      rows.push(['Open', () => this.hooks.openDocument(id)]);
      rows.push(['Duplicate', () => { void api.post(`/documents/${id}/duplicate`).then(() => this.load()).then(() => toast('Duplicated.')).catch((e: Error) => toast(`Could not duplicate: ${e.message}`, 'error')); }]);
      rows.push(['Save as template', () => this.saveAsTemplate(id)]);
    }
    const allPinned = ids.every((x) => this.pinned.includes(x));
    rows.push([allPinned ? 'Unpin from list' : 'Pin to list', () => this.setPinned(ids, !allPinned)]);
    rows.push(['Remove from list', () => this.setHiddenRecent(ids, true)]);
    rows.push([many ? `Delete ${ids.length} documents` : 'Delete', () => this.requestDelete(ids)]);
    this.menu.textContent = '';
    for (const [label, run] of rows) {
      const b = el<HTMLButtonElement>('<button class="ft-menu-item" role="menuitem" type="button"></button>');
      setText(b, label);
      b.addEventListener('click', () => { this.closeMenu(); run(); });
      this.menu.appendChild(b);
    }
    this.menu.style.visibility = 'hidden';
    setHidden(this.menu, false);
    const w = this.menu.offsetWidth, h = this.menu.offsetHeight;
    this.menu.style.left = `${Math.round(Math.max(4, Math.min(x, window.innerWidth - w - 4)))}px`;
    this.menu.style.top = `${Math.round(Math.max(4, Math.min(y, window.innerHeight - h - 4)))}px`;
    this.menu.style.visibility = '';
    (this.menu.firstElementChild as HTMLElement | null)?.focus();
  }

  private saveAsTemplate(id: string): void {
    const doc = this.docs.find((d) => d.id === id);
    const d = new Dialog('Save as template', 460);
    const name = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false">');
    name.value = doc?.title ?? '';
    d.field('Template name', name);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Save template', 'primary', () => {
      d.close();
      void api.post('/templates', { document: id, name: name.value.trim() }).then(() => this.load()).then(() => toast('Saved to Templates under Yours.')).catch((e: Error) => toast(`Could not save the template: ${e.message}`, 'error'));
    });
    d.open(name);
  }

  private saveRecent(): void {
    this.renderDocs();
    void api.post('/settings', { pinned: this.pinned, recentHidden: this.hiddenRecent }).catch((e: Error) => toast(`Could not save the list: ${e.message}`, 'error'));
  }

  private setPinned(ids: string[], on: boolean): void {
    this.pinned = on ? [...this.pinned.filter((x) => !ids.includes(x)), ...ids] : this.pinned.filter((x) => !ids.includes(x));
    if (on) this.hiddenRecent = this.hiddenRecent.filter((x) => !ids.includes(x));
    this.saveRecent();
  }

  private setHiddenRecent(ids: string[], on: boolean): void {
    this.hiddenRecent = on ? [...this.hiddenRecent.filter((x) => !ids.includes(x)), ...ids] : this.hiddenRecent.filter((x) => !ids.includes(x));
    if (on) this.pinned = this.pinned.filter((x) => !ids.includes(x));
    this.saveRecent();
  }

  private setSelected(id: string, on: boolean): void {
    if (on) this.selected.add(id); else this.selected.delete(id);
    for (const grid of [this.recentGrid, this.recentGridFull]) {
      const n = grid.querySelector<HTMLElement>(`.ft-card[data-doc="${id}"]`);
      if (n) setClass(n, 'is-selected', on);
    }
  }

  private clearSelection(): void {
    for (const id of [...this.selected]) this.setSelected(id, false);
    this.anchor = '';
  }

  private pickCard(card: HTMLElement, range: boolean): void {
    const id = card.dataset.doc as string;
    if (range && this.anchor && this.anchor !== id) {
      const order = Array.from((card.parentElement as HTMLElement).querySelectorAll<HTMLElement>('.ft-card[data-doc]')).map((n) => n.dataset.doc as string);
      const a = order.indexOf(this.anchor), b = order.indexOf(id);
      if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) this.setSelected(order[i], true);
      return;
    }
    this.setSelected(id, !this.selected.has(id));
    this.anchor = id;
  }

  private requestDelete(ids: string[]): void {
    if (!ids.length) return;
    if (ids.length === 1) { void this.trashDocs(ids); return; }
    this.ask(`Move ${ids.length} documents to the Trash?`, `Move ${ids.length} to Trash`, () => void this.trashDocs(ids));
  }

  async trashDocs(ids: string[]): Promise<void> {
    const titles = ids.map((id) => this.docs.find((d) => d.id === id)?.title ?? 'Untitled document');
    for (const id of ids) this.selected.delete(id);
    this.docs = this.docs.filter((d) => !ids.includes(d.id));
    this.renderDocs();
    const done: string[] = [];
    for (const id of ids) {
      try { await api.del(`/documents/${id}`); done.push(id); } catch (e) { toast(`Could not delete a document: ${(e as Error).message}`, 'error'); }
    }
    if (done.length < ids.length) await this.load();
    if (!done.length) return;
    this.trashed = (await api.get<{ documents: DocSummary[] }>('/documents/trash').catch(() => ({ documents: [] as DocSummary[] }))).documents;
    this.renderTrash();
    undoToast(done.length === 1 ? `Moved "${titles[ids.indexOf(done[0])]}" to the Trash.` : `Moved ${done.length} documents to the Trash.`, () => void this.restore(done));
  }

  private async restore(ids: string[]): Promise<void> {
    const back = this.trashed.filter((d) => ids.includes(d.id) && !this.docs.some((x) => x.id === d.id));
    if (back.length) {
      this.docs = [...this.docs, ...back].sort((a, b) => b.modified - a.modified);
      this.trashed = this.trashed.filter((d) => !ids.includes(d.id));
      this.renderDocs();
      this.renderTrash();
    }
    let n = 0;
    for (const id of ids) {
      try { await api.post(`/documents/${id}/restore`); n++; } catch (e) { toast(`Could not restore: ${(e as Error).message}`, 'error'); }
    }
    if (!n) return;
    await this.load();
    toast(n === 1 ? 'Document restored.' : `${n} documents restored.`);
  }

  private async purge(id: string | null): Promise<void> {
    try {
      await api.del(id ? `/documents/trash/${id}` : '/documents/trash');
    } catch (e) { toast(`Could not delete: ${(e as Error).message}`, 'error'); }
    this.trashed = id ? this.trashed.filter((d) => d.id !== id) : [];
    this.renderTrash();
  }

  private renderTrash(): void {
    setText(this.root.querySelector('.ft-trash-count'), String(this.trashed.length));
    const empty = this.root.querySelector<HTMLButtonElement>('.ft-empty-trash');
    if (empty && empty.disabled !== !this.trashed.length) empty.disabled = !this.trashed.length;
    const none = this.root.querySelector<HTMLElement>('.ft-trash-none');
    if (none) setHidden(none, this.trashed.length > 0);
    const update = (n: HTMLElement, d: DocSummary): void => {
      setText(n.querySelector('.ft-card-name'), d.title);
      setText(n.querySelector('.ft-card-meta'), `${d.words} word${d.words === 1 ? '' : 's'} · Deleted ${ago(d.deletedAt ?? 0)}`);
    };
    const create = (d: DocSummary): HTMLElement => {
      const n = el(`<div class="ft-trash-row"><span class="ft-trash-icon">${icon('document', 18)}</span><span class="ft-trash-text"><span class="ft-card-name"></span><span class="ft-card-meta"></span></span><button class="ft-btn sm" type="button" data-a="restore">${icon('undo', 14)}Restore</button><button class="ft-btn sm danger" type="button" data-a="purge">Delete permanently</button></div>`);
      update(n, d);
      return n;
    };
    patchList(this.trashList, this.trashed, { key: (d) => d.id, create, update });
  }

  show(v: View = this.view): void {
    this.view = v;
    for (const page of Array.from(this.root.querySelectorAll<HTMLElement>('[data-page]'))) setHidden(page, page.dataset.page !== v);
    for (const b of Array.from(this.root.querySelectorAll<HTMLElement>('.ft-home-nav-item[data-v]'))) setClass(b, 'is-active', b.dataset.v === v);
  }

  open(): void {
    setHidden(this.root, false);
    document.title = 'FormTxt';
    void this.load().catch((e: Error) => toast(`Could not load your library: ${e.message}`, 'error'));
  }

  close(): void {
    setHidden(this.root, true);
    this.closeMenu();
    this.askClose();
    this.clearSelection();
  }

  get isOpen(): boolean { return !this.root.hidden; }

  upsert(doc: DocSummary): void {
    const rest = this.docs.filter((d) => d.id !== doc.id);
    const old = this.docs.find((d) => d.id === doc.id);
    this.docs = [{ ...old, ...doc }, ...rest].sort((a, b) => b.modified - a.modified);
    this.renderDocs();
  }

  private renderTemplates(): void {
    const q = this.query;
    const list = this.templates.filter((t) => (this.category === 'All' || t.category === this.category) && (!q || `${t.name} ${t.category} ${t.tags.join(' ')} ${t.description}`.toLowerCase().includes(q)));
    for (const host of Array.from(this.root.querySelectorAll<HTMLElement>('.ft-cats'))) {
      const chip = (n: HTMLElement, c: string): void => {
        setClass(n, 'is-active', c === this.category);
        setText(n.querySelector('.ft-chip-count'), c === 'All' ? String(this.templates.length) : String(this.templates.filter((t) => t.category === c).length));
      };
      patchList(host, this.categories, {
        key: (c) => c,
        create: (c) => { const n = el(`<button class="ft-chip" type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}<span class="ft-chip-count"></span></button>`); chip(n, c); return n; },
        update: chip,
      });
    }
    const card = (t: TemplateSummary): HTMLElement => {
      const n = el(`<button class="ft-card" type="button" data-template="${escapeHtml(t.id)}"><span class="ft-card-preview"><img alt="" decoding="async" loading="lazy" draggable="false"></span><span class="ft-card-body"><span class="ft-card-name"></span><span class="ft-card-meta"></span></span></button>`);
      setText(n.querySelector('.ft-card-name'), t.name);
      setText(n.querySelector('.ft-card-meta'), t.category);
      (n.querySelector('img') as HTMLImageElement).src = `/api/templates/${encodeURIComponent(t.id)}/preview.svg`;
      return n;
    };
    patchList(this.tplGrid, list.slice(0, 12), { key: (t) => t.id, create: card, update: () => undefined });
    patchList(this.tplGridFull, list, { key: (t) => t.id, create: card, update: () => undefined });
  }

  private renderDocs(): void {
    const update = (n: HTMLElement, d: DocSummary): void => {
      setText(n.querySelector('.ft-card-name'), d.title);
      setText(n.querySelector('.ft-card-meta'), `${this.pinned.includes(d.id) ? 'Pinned · ' : ''}${d.words} word${d.words === 1 ? '' : 's'} · ${ago(d.modified)}`);
      setClass(n, 'is-pinned', this.pinned.includes(d.id));
      setClass(n, 'is-locked', !!d.locked);
      if (d.locked) setText(n.querySelector('.ft-card-meta'), `Locked with a password · ${ago(d.modified)}`);
      const img = n.querySelector('img') as HTMLImageElement;
      const src = `/api/documents/${d.id}/thumb.svg?v=${encodeURIComponent(String(d.modified))}`;
      if (img.getAttribute('src') !== src) img.src = src;
    };
    const make = (d: DocSummary): HTMLElement => {
      const n = el(`<button class="ft-card" type="button" data-doc="${escapeHtml(d.id)}"><span class="ft-card-preview"><img alt="" decoding="async" draggable="false"></span><span class="ft-card-body"><span class="ft-card-name"></span><span class="ft-card-meta"></span></span><span class="ft-card-more" role="button" tabindex="-1" title="More actions (right-click)" aria-label="More actions">${icon('more', 16)}</span></button>`);
      update(n, d);
      return n;
    };
    const pinnedFirst = (list: DocSummary[]): DocSummary[] => [...list.filter((d) => this.pinned.includes(d.id)), ...list.filter((d) => !this.pinned.includes(d.id))];
    const recent = pinnedFirst(this.docs.filter((d) => !this.hiddenRecent.includes(d.id)));
    patchList(this.recentGrid, recent.slice(0, 5),{ key: (d) => d.id, create: make, update });
    setHidden(this.recentGrid, recent.length === 0);
    setHidden(this.root.querySelector('.ft-recent-empty') as HTMLElement, recent.length > 0);
    patchList(this.recentGridFull, pinnedFirst(this.docs), { key: (d) => d.id, create: make, update });
    setText(this.root.querySelector('.ft-doc-count'), String(this.docs.length));
  }
}

class TemplatePreview extends Dialog {
  private tpl: TemplateSummary | null = null;
  private readonly img: HTMLImageElement;
  private readonly note: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly title: HTMLInputElement;

  constructor(private readonly hooks: HomeHooks) {
    super('Template', 860);
    const wrap = el(`<div class="ft-tpl-preview"><span class="ft-tpl-preview-page"><img alt="" decoding="async"></span><div class="ft-tpl-preview-side"><p class="ft-note ft-tpl-note"></p><dl class="ft-tpl-facts"></dl></div></div>`);
    this.img = wrap.querySelector('img') as HTMLImageElement;
    this.note = wrap.querySelector('.ft-tpl-note') as HTMLElement;
    this.facts = wrap.querySelector('.ft-tpl-facts') as HTMLElement;
    this.body.appendChild(wrap);
    this.title = el<HTMLInputElement>('<input class="ft-input" type="text" placeholder="Document title" spellcheck="false">');
    (wrap.querySelector('.ft-tpl-preview-side') as HTMLElement).appendChild(el('<label class="ft-field"><span class="ft-field-label">Title</span></label>'));
    (wrap.querySelector('.ft-tpl-preview-side .ft-field') as HTMLElement).appendChild(this.title);
    this.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.use(); });
    this.button('Cancel', 'ghost', () => this.close());
    this.button('Use template', 'primary', () => this.use());
  }

  private use(): void {
    if (!this.tpl) return;
    const t = this.tpl;
    this.close();
    void this.hooks.createDocument(t.id, this.title.value.trim() || undefined);
  }

  show(t: TemplateSummary): void {
    this.tpl = t;
    this.setTitle(`${t.name} · ${t.category}`);
    setText(this.note, t.description);
    this.facts.textContent = '';
    const rows: Array<[string, string]> = [['Page', t.size === 'a4' ? 'A4' : 'US Letter']];
    if (t.fonts.heading) rows.push(['Fonts', t.fonts.heading === t.fonts.body ? t.fonts.heading : `${t.fonts.heading} and ${t.fonts.body}`]);
    if (t.tags.length) rows.push(['Good for', t.tags.join(', ')]);
    for (const [k, v] of rows) {
      const dt = el('<dt></dt>'), dd = el('<dd></dd>');
      setText(dt, k); setText(dd, v);
      this.facts.append(dt, dd);
    }
    this.img.src = `/api/templates/${encodeURIComponent(t.id)}/preview.svg`;
    this.title.value = '';
    this.open(this.title);
  }
}
