import { mirrorCatalogue } from './automation/catalogue';
import { registerDemoCommands } from './demos';
import type { DocSummary, FtxtDocument } from './engine/model';
import { commands } from './engine/registry';
import { api, type TemplateSummary } from './io/api';
import { delayedIndicator, mountOnce, q, revealApp, setHidden } from './ui/dom';
import { Home } from './ui/home';
import { icon } from './ui/icons';
import { mountShell, type Shell } from './shell';
import { applyPrefs, openPreferences, registerPrefsCommands } from './ui/prefs/dialog';
import { isLightTheme, readChoice, setTheme as setThemeId } from './ui/themes';
import { DocEditor } from './editor/editor';
import { registerEditorCommands } from './editor/register';
import { registerExtensions } from './editor/ext/index';
import { registerWordCommands } from './editor/word-commands';
import { unlockDocument } from './editor/ext/versions';
import { connectBridge } from './automation/bridge';
import { noteEdit, takeEditor } from './automation/actor';
import { CommandPalette } from './ui/palette';
import { TerminalDock } from './ui/terminal-dock';
import { cmdStateChanged, setCmdState } from './ui/shell/cmd';
import { Shortcuts } from './ui/shortcuts';
import { toast } from './ui/toast';

type Theme = 'dark' | 'light';

const SHELL = `
<main class="ft-main">
  <section class="ft-empty" data-ref="empty">
    ${icon('document', 48)}
    <h1>No document open</h1>
    <p>Open one from Home, start a blank document, or pick a template.</p>
  </section>
</main>`;

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme: Theme): void {
  const was = readChoice().theme;
  if (theme === 'light') { try { localStorage.setItem('formtxt.lastDarkTheme', was); } catch { void 0; } setThemeId(isLightTheme(was) ? was : 'light'); return; }
  let dark = 'studio';
  try { dark = localStorage.getItem('formtxt.lastDarkTheme') || 'studio'; } catch { void 0; }
  setThemeId(isLightTheme(dark) ? 'studio' : dark);
}

async function fontsReady(timeout = 1500): Promise<void> {
  const ready = document.fonts?.ready ?? Promise.resolve();
  await Promise.race([ready, new Promise((r) => setTimeout(r, timeout))]);
}

export async function startApp(): Promise<void> {
  const root = q<HTMLElement>(document, '#app');
  mountOnce(root, SHELL);

  commands.register({
    id: 'view.toggleTheme',
    label: 'Switch theme',
    group: 'View',
    description: 'Switch between the dark and light themes.',
    run: () => { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); return currentTheme(); },
  });
  const main = q<HTMLElement>(root, '.ft-main');
  const empty = q<HTMLElement>(root, '[data-ref="empty"]');
  let shell: Shell | null = null;
  let openId = '';
  let homeRef: Home | null = null;
  let saveTimer = 0;
  let saving: Promise<void> = Promise.resolve();
  let pending: FtxtDocument | null = null;
  let inFlight = 0;
  const flush = (keep = false): Promise<void> => {
    window.clearTimeout(saveTimer);
    const doc = pending;
    pending = null;
    if (!doc) return saving;
    const by = takeEditor();
    const path = `/documents/${encodeURIComponent(doc.id)}${by ? `?by=${by}` : ''}`;
    const body = keep ? JSON.stringify(doc) : '';
    const put = (): Promise<DocSummary> => (body && new Blob([body]).size < 60000
      ? fetch(`/api${path}`, { method: 'PUT', keepalive: true, headers: { 'content-type': 'application/json' }, body }).then(async (r) => { if (!r.ok) throw new Error(r.statusText); return (await r.json()) as DocSummary; })
      : api.put<DocSummary>(path, doc));
    inFlight++;
    saving = saving.then(put).then((s) => {
      doc.meta.modified = s.modified;
      if (!pending) { shell?.status.setSaved('saved'); shell?.titlebar.setDocument(s.title, false); }
      home.upsert({ id: s.id, title: s.title, modified: s.modified, created: s.created, words: s.words, bytes: s.bytes });
    }).catch((e: Error) => { shell?.status.setSaved('unsaved'); toast(`Could not save: ${e.message}`, 'error'); }).finally(() => { inFlight--; });
    return saving;
  };
  const editor = new DocEditor(main, {
    changed: (doc) => {
      noteEdit();
      pending = doc;
      shell?.status.setSaved('saving');
      shell?.titlebar.setDocument(doc.title, true);
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void flush(), 700);
    },
    status: () => { shell?.syncDocument(); },
  });
  registerEditorCommands(commands, editor);
  registerExtensions(commands, editor);
  registerWordCommands(commands, editor);
  const shortcuts = new Shortcuts(commands);
  const palette = new CommandPalette(commands);
  commands.register({ id: 'edit.commandPalette', label: 'Find a command', group: 'Help', description: 'Search every command by name and run it.', keys: ['Ctrl+Shift+P'], run: () => { palette.open(); return true; } });
  commands.register({ id: 'help.shortcuts', label: 'Keyboard shortcuts', group: 'Help', description: 'See and change keyboard shortcuts.', keys: ['Ctrl+/'], run: () => { shortcuts.open(); return true; } });
  shortcuts.bindGlobal('Mod+Shift+P', 'edit.commandPalette');
  shortcuts.bindGlobal('Mod+/', 'help.shortcuts');
  shortcuts.bindGlobal('Mod+,', 'app.preferences');
  shortcuts.bindGlobal('Mod+Shift+G', 'tools.wordCount');
  shortcuts.bindGlobal('Mod+Shift+C', 'format.painter');
  shortcuts.bindGlobal('Alt+Mod+=', 'view.zoomIn');
  shortcuts.bindGlobal('Alt+Mod+-', 'view.zoomOut');
  void shortcuts.load();
  connectBridge(commands);
  window.addEventListener('beforeunload', (e) => {
    if (!pending && !inFlight) return;
    void flush(true);
    if ('__TAURI_INTERNALS__' in window) return;
    e.preventDefault();
    e.returnValue = '';
  });

  const openDocument = async (id: string): Promise<FtxtDocument> => {
    await flush();
    const fetchDoc = (): Promise<FtxtDocument> => api.get<FtxtDocument>(`/documents/${encodeURIComponent(id)}`);
    const doc = await fetchDoc().catch(async (e: Error & { status?: number }) => {
      if (e.status !== 423) throw e;
      await unlockDocument(id);
      return fetchDoc();
    });
    await editor.load(doc);
    setHidden(empty, true);
    editor.show(true);
    openId = doc.id;
    shell?.titlebar.setDocument(doc.title, false);
    shell?.status.setSaved('saved');
    shell?.syncDocument();
    home.close();
    const words = doc.tabs.flatMap((t) => t.body).flatMap((b) => b.content ?? []).reduce((n, r) => n + (typeof r.text === 'string' ? r.text.split(/\s+/).filter(Boolean).length : 0), 0);
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
  const preferences = (): void => openPreferences();
  const home = new Home({
    openDocument: (id) => { void openDocument(id).catch((e: Error) => toast(`Could not open the document: ${e.message}`, 'error')); },
    createDocument: async (template, title) => { await createDocument(template, title).catch((e: Error) => toast(`Could not create the document: ${e.message}`, 'error')); },
    importFiles,
    preferences,
    hasDocument: () => !!openId,
    currentDocument: () => (openId && editor.doc ? { id: editor.doc.id, title: editor.doc.title } : null),
    flush,
    closeDocument: async () => { await commands.run('file.close'); },
  }, root);
  homeRef = home;
  registerDemoCommands(commands, openDocument);
  registerPrefsCommands();
  applyPrefs();

  commands.register({
    id: 'file.close',
    label: 'Close',
    group: 'File',
    description: 'Close the open document (it is already saved) and return to Home.',
    keys: ['Ctrl+W'],
    run: async () => {
      await flush();
      openId = '';
      editor.show(false);
      setHidden(empty, false);
      shell?.titlebar.setDocument(null, false);
      home.documentClosed();
      if (!home.isOpen) home.open('start');
      return true;
    },
  });
  commands.register({
    id: 'file.backstage',
    label: 'File',
    group: 'File',
    description: 'Open the File tab (View Stager): info, new, open, save a copy, print, share, export, account and options.',
    params: [{ name: 'page', type: 'string', description: 'info, new, open, save, print, share, export or account' }],
    run: (p) => { void flush(); home.backstage(String(p.page ?? 'info') as never); return true; },
  });

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
    description: 'Open Preferences: startup, theme, display, proofing, saving, language, accessibility, ribbon, keyboard, add-ins, sharing, AI and privacy.',
    keys: ['Ctrl+,'],
    run: () => { preferences(); return true; },
  });
  commands.register({
    id: 'file.list',
    label: 'List documents',
    group: 'File',
    description: 'List the documents in your library, newest first.',
    run: async () => (await api.get<{ documents: DocSummary[] }>('/documents')).documents,
  });
  const dock = new TerminalDock();
  commands.register({ id: 'view.terminal', label: 'Terminal', group: 'View', description: 'Show or hide the terminal dock at the bottom of the window. Shells and Claude Code keep running while it is hidden.', keys: ['Ctrl+J'], run: () => { dock.toggle(); return dock.isOpen(); } });
  commands.register({ id: 'view.newTerminal', label: 'New Terminal', group: 'View', description: 'Open a new shell tab in the terminal dock.', run: async () => { await dock.newTerminal(); return true; } });
  commands.register({ id: 'agent.claudeCode', label: 'Claude Code', group: 'Agent', description: 'Open Claude Code in a tab of the terminal dock, with FormTxt\'s commands attached, or hide the dock while it shows Claude Code.', run: async () => { await dock.toggleKind('claude'); return dock.isShowing('claude'); } });
  commands.register({ id: 'agent.chat', label: 'Chat with Claude', group: 'Agent', description: 'Open the Chat tab of the terminal dock and talk with Claude about your document, or hide the dock while it shows the chat.', run: async () => { await dock.toggleKind('chat'); return dock.isShowing('chat'); } });
  setCmdState('view.terminal', { icon: 'terminal', checked: () => dock.isOpen() });
  setCmdState('view.newTerminal', { icon: 'plus' });
  setCmdState('agent.claudeCode', { icon: 'agent', checked: () => dock.isShowing('claude') });
  setCmdState('agent.chat', { icon: 'agentChat', checked: () => dock.isShowing('chat') });

  shell = mountShell({
    root,
    editor,
    recent: () => (homeRef?.recentDocs() ?? []).slice(0, 9).map((dsum) => ({ id: dsum.id, title: dsum.title })),
    onFile: () => { void flush(); homeRef?.backstage('info'); },
  });
  root.prepend(shell.titlebar.root);
  shell.titlebar.root.after(shell.ribbonHost);
  root.insertBefore(dock.root, shell.status.root);
  shell.titlebar.dock = (kind) => { void dock.toggleKind(kind); };
  dock.onTab = () => { shell?.titlebar.syncDock(dock.isOpen(), dock.activeKind()); cmdStateChanged(); };
  dock.onTab();

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button[data-cmd]');
    if (!target || target.closest('.ft-rb, .ft-titlebar, .ft-status, .ft-qat')) return;
    if (target.dataset.cmd) void commands.run(target.dataset.cmd).catch((err: Error) => toast(err.message, 'error'));
  });

  await Promise.all([fontsReady(), Promise.race([home.load().catch(() => undefined), new Promise((r) => setTimeout(r, 1500))])]);
  revealApp();

  const st = shell.status;
  const stop = delayedIndicator(() => st.setEngine('Connecting to the engine', false), () => undefined);
  try {
    const h = await api.get<{ version: string }>('/health');
    stop();
    st.setEngine(`Engine ${h.version} ready`, true);
    await mirrorCatalogue(commands).catch(() => st.setEngine(`Engine ${h.version} ready`, true, 'The command catalogue was not shared with the engine.'));
  } catch {
    stop();
    st.setEngine('Engine offline', false, 'Engine not reachable. Start it with ./formtxt');
  }
}
