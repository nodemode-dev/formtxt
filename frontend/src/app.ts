import { mirrorCatalogue } from './automation/catalogue';
import type { DocSummary, FtxtDocument } from './engine/model';
import { commands } from './engine/registry';
import { api, type TemplateSummary } from './io/api';
import { Dialog } from './ui/dialog';
import { delayedIndicator, el, mountOnce, q, revealApp, setClass, setHidden, setHtml, setText, setTitle } from './ui/dom';
import { Home } from './ui/home';
import { icon } from './ui/icons';
import { DocEditor } from './editor/editor';
import { registerEditorCommands } from './editor/register';
import { connectBridge } from './automation/bridge';
import { CommandPalette } from './ui/palette';
import { Shortcuts } from './ui/shortcuts';
import { toast } from './ui/toast';
import { VERSION } from './version';

type Theme = 'dark' | 'light';

const SHELL = `
<header class="ft-titlebar">
  <span class="ft-brand">${icon('brand', 18)}<span>FormTxt</span></span>
  <span class="ft-docname" data-ref="docname"></span>
  <span class="ft-actions">
    <button type="button" class="ft-btn" data-cmd="home.open">${icon('home', 16)}<span>Home</span></button>
    <button type="button" class="ft-btn square" data-cmd="view.toggleTheme" data-ref="theme" aria-label="Switch theme"></button>
    <button type="button" class="ft-btn primary" data-cmd="file.new">${icon('plus', 16)}<span>New document</span></button>
  </span>
</header>
<main class="ft-main">
  <section class="ft-empty" data-ref="empty">
    ${icon('document', 48)}
    <h1>No document open</h1>
    <p>Open one from Home, start a blank document, or pick a template.</p>
  </section>
</main>
<footer class="ft-status">
  <span class="ft-engine"><i class="ft-dot" data-ref="dot"></i><span data-ref="engine"></span></span>
  <span class="ft-docstatus" data-ref="docstatus"></span>
  <span>FormTxt ${VERSION}</span>
</footer>`;

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function paintThemeButton(button: HTMLElement): void {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  setHtml(button, icon(next === 'light' ? 'sun' : 'moon', 16), next);
  setTitle(button, next === 'light' ? 'Switch to the light theme' : 'Switch to the dark theme');
}

function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ecebe6' : '#111111');
  try { localStorage.setItem('formtxt.theme', theme); } catch { void 0; }
}

async function fontsReady(timeout = 1500): Promise<void> {
  const ready = document.fonts?.ready ?? Promise.resolve();
  await Promise.race([ready, new Promise((r) => setTimeout(r, timeout))]);
}

export async function startApp(): Promise<void> {
  const root = q<HTMLElement>(document, '#app');
  mountOnce(root, SHELL);
  const docname = q<HTMLElement>(root, '[data-ref="docname"]');
  const engine = q<HTMLElement>(root, '[data-ref="engine"]');
  const dot = q<HTMLElement>(root, '[data-ref="dot"]');
  const themeButton = q<HTMLElement>(root, '[data-ref="theme"]');
  paintThemeButton(themeButton);

  commands.register({
    id: 'view.toggleTheme',
    label: 'Switch theme',
    group: 'View',
    description: 'Switch between the dark and light themes.',
    run: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); paintThemeButton(themeButton); return currentTheme(); },
  });
  const main = q<HTMLElement>(root, '.ft-main');
  const empty = q<HTMLElement>(root, '[data-ref="empty"]');
  const docStatus = q<HTMLElement>(root, '[data-ref="docstatus"]');
  let saveTimer = 0;
  let saving: Promise<void> = Promise.resolve();
  let pending: FtxtDocument | null = null;
  const flush = (): Promise<void> => {
    window.clearTimeout(saveTimer);
    const doc = pending;
    pending = null;
    if (!doc) return saving;
    saving = saving.then(() => api.put<DocSummary>(`/documents/${encodeURIComponent(doc.id)}`, doc)).then((s) => {
      doc.meta.modified = s.modified;
      if (!pending) setText(docStatus, `${s.words} word${s.words === 1 ? '' : 's'} · Saved`);
      home.upsert({ id: s.id, title: s.title, modified: s.modified, created: s.created, words: s.words, bytes: s.bytes });
    }).catch((e: Error) => { setText(docStatus, 'Not saved'); toast(`Could not save: ${e.message}`, 'error'); });
    return saving;
  };
  const editor = new DocEditor(main, {
    changed: (doc) => {
      pending = doc;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void flush(), 700);
    },
    status: (words) => {
      const pages = editor.pageCount();
      const paged = !(editor.doc?.settings as unknown as { pageless?: boolean } | undefined)?.pageless;
      setText(docStatus, `${paged ? `${pages} page${pages === 1 ? '' : 's'} · ` : ''}${words} word${words === 1 ? '' : 's'}${pending ? ' · Editing' : ''}`);
    },
  });
  registerEditorCommands(commands, editor);
  const shortcuts = new Shortcuts(commands);
  const palette = new CommandPalette(commands);
  commands.register({ id: 'edit.commandPalette', label: 'Find a command', group: 'Help', description: 'Search every command by name and run it.', keys: ['Ctrl+Shift+P'], run: () => { palette.open(); return true; } });
  commands.register({ id: 'help.shortcuts', label: 'Keyboard shortcuts', group: 'Help', description: 'See and change keyboard shortcuts.', keys: ['Ctrl+/'], run: () => { shortcuts.open(); return true; } });
  shortcuts.bindGlobal('Mod+Shift+P', 'edit.commandPalette');
  shortcuts.bindGlobal('Mod+/', 'help.shortcuts');
  shortcuts.bindGlobal('Mod+Shift+G', 'tools.wordCount');
  shortcuts.bindGlobal('Mod+Shift+C', 'format.painter');
  shortcuts.bindGlobal('Mod+=', 'view.zoomIn');
  shortcuts.bindGlobal('Mod+-', 'view.zoomOut');
  void shortcuts.load();
  connectBridge(commands);
  window.addEventListener('beforeunload', () => { void flush(); });

  const openDocument = async (id: string): Promise<FtxtDocument> => {
    await flush();
    const doc = await api.get<FtxtDocument>(`/documents/${encodeURIComponent(id)}`);
    await editor.load(doc);
    setHidden(empty, true);
    editor.show(true);
    setText(docname, doc.title);
    document.title = `${doc.title} · FormTxt`;
    home.close();
    const words = doc.tabs.flatMap((t) => t.body).flatMap((b) => b.content ?? []).reduce((n, r) => n + r.text.split(/\s+/).filter(Boolean).length, 0);
    home.upsert({ id: doc.id, title: doc.title, modified: doc.meta.modified, created: doc.meta.created, words, bytes: 0 });
    return doc;
  };
  const createDocument = async (template: string, title?: string): Promise<FtxtDocument> => {
    const doc = await api.post<FtxtDocument>('/documents', { title: title ?? '', template });
    return openDocument(doc.id);
  };
  const importFiles = async (files: File[]): Promise<void> => {
    try {
      const out = await api.upload<{ documents: DocSummary[]; errors: string[] }>('/documents/import', files);
      for (const err of out.errors) toast(err, 'error');
      if (out.documents.length === 1) await openDocument(out.documents[0].id);
      else if (out.documents.length > 1) toast(`Added ${out.documents.length} documents to your library.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const preferences = (): void => {
    const d = new Dialog('Preferences', 460);
    const author = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" placeholder="Your name">');
    d.field('Author name for new documents', author);
    void api.get<Record<string, unknown>>('/settings').then((s) => { if (!author.value) author.value = String(s.author ?? ''); });
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Save', 'primary', () => { d.close(); void api.post('/settings', { author: author.value.trim() }).then(() => toast('Preferences saved.')); });
    d.open(author);
  };
  const home = new Home({
    openDocument: (id) => { void openDocument(id).catch((e: Error) => toast(`Could not open the document: ${e.message}`, 'error')); },
    createDocument: async (template, title) => { await createDocument(template, title).catch((e: Error) => toast(`Could not create the document: ${e.message}`, 'error')); },
    importFiles,
    preferences,
  }, root);

  commands.register({
    id: 'home.open',
    label: 'Home',
    group: 'File',
    description: 'Show Home: recent documents, templates and the Trash.',
    run: () => { void flush(); home.open(); return true; },
  });
  commands.register({
    id: 'file.new',
    label: 'New document',
    group: 'File',
    description: 'Create a blank document in your library and open it.',
    params: [{ name: 'title', type: 'string', description: 'Title of the new document' }],
    run: async (params) => {
      const doc = await createDocument('', String(params.title ?? ''));
      return { id: doc.id, title: doc.title };
    },
  });
  commands.register({
    id: 'file.newFromTemplate',
    label: 'New from template',
    group: 'File',
    description: 'Create a document from a template and open it.',
    params: [{ name: 'template', type: 'string', description: 'Template id, from templates.list' }, { name: 'title', type: 'string', description: 'Title of the new document' }],
    run: async (params) => {
      const doc = await createDocument(String(params.template ?? ''), params.title ? String(params.title) : undefined);
      return { id: doc.id, title: doc.title };
    },
  });
  commands.register({
    id: 'file.open',
    label: 'Open document',
    group: 'File',
    description: 'Open a document from your library by id.',
    params: [{ name: 'id', type: 'string', description: 'Document id, from file.list' }],
    run: async (params) => { const doc = await openDocument(String(params.id ?? '')); return { id: doc.id, title: doc.title }; },
  });
  commands.register({
    id: 'file.trash',
    label: 'Move to Trash',
    group: 'File',
    description: 'Move a document to the Trash.',
    params: [{ name: 'id', type: 'string', description: 'Document id' }],
    run: async (params) => { await home.trashDocs([String(params.id ?? '')]); return true; },
  });
  commands.register({
    id: 'templates.list',
    label: 'List templates',
    group: 'File',
    description: 'List the built-in and saved templates.',
    run: async () => (await api.get<{ templates: TemplateSummary[] }>('/templates')).templates.map((t) => ({ id: t.id, name: t.name, category: t.category })),
  });
  commands.register({
    id: 'app.preferences',
    label: 'Preferences',
    group: 'App',
    description: 'Set the author name used for new documents.',
    run: () => { preferences(); return true; },
  });
  commands.register({
    id: 'file.list',
    label: 'List documents',
    group: 'File',
    description: 'List the documents in your library, newest first.',
    run: async () => (await api.get<{ documents: DocSummary[] }>('/documents')).documents,
  });

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button[data-cmd]');
    if (target?.dataset.cmd) void commands.run(target.dataset.cmd).catch((err: Error) => setText(engine, err.message));
  });

  await Promise.all([fontsReady(), Promise.race([home.load().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))])]);
  revealApp();

  const stop = delayedIndicator(() => setText(engine, 'Connecting to the engine'), () => undefined);
  try {
    const h = await api.get<{ version: string }>('/health');
    stop();
    setClass(dot, 'ok', true);
    setText(engine, `Engine ${h.version} ready`);
    await mirrorCatalogue(commands).catch(() => setText(engine, `Engine ${h.version} ready, command catalogue not shared`));
  } catch {
    stop();
    setClass(dot, 'bad', true);
    setText(engine, 'Engine not reachable. Start it with ./formtxt');
  }
}
