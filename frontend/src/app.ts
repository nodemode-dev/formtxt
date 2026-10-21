import { mirrorCatalogue } from './automation/catalogue';
import type { DocSummary, FtxtDocument } from './engine/model';
import { commands } from './engine/registry';
import { api } from './io/api';
import { delayedIndicator, mountOnce, q, revealApp, setClass, setHtml, setText, setTitle } from './ui/dom';
import { icon } from './ui/icons';
import { VERSION } from './version';

type Theme = 'dark' | 'light';

const SHELL = `
<header class="ft-titlebar">
  <span class="ft-brand">${icon('brand', 18)}<span>FormTxt</span></span>
  <span class="ft-docname" data-ref="docname"></span>
  <span class="ft-actions">
    <button type="button" class="ft-btn square" data-cmd="view.toggleTheme" data-ref="theme" aria-label="Switch theme"></button>
    <button type="button" class="ft-btn primary" data-cmd="file.new">${icon('plus', 16)}<span>New document</span></button>
  </span>
</header>
<main class="ft-main">
  <section class="ft-empty">
    ${icon('document', 48)}
    <h1>No document open</h1>
    <p>FormTxt is in its first build. The home screen with templates and recent documents arrives next; for now a new document is created in your library.</p>
  </section>
</main>
<footer class="ft-status">
  <span class="ft-engine"><i class="ft-dot" data-ref="dot"></i><span data-ref="engine"></span></span>
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
  commands.register({
    id: 'file.new',
    label: 'New document',
    group: 'File',
    description: 'Create a blank document in your library.',
    params: [{ name: 'title', type: 'string', description: 'Title of the new document' }],
    run: async (params) => {
      const doc = await api.post<FtxtDocument>('/documents', { title: String(params.title ?? '') });
      setText(docname, doc.title);
      setText(engine, 'Saved to your library');
      return { id: doc.id, title: doc.title };
    },
  });
  commands.register({
    id: 'file.list',
    label: 'List documents',
    group: 'File',
    description: 'List the documents in your library, newest first.',
    run: async () => (await api.get<{ documents: DocSummary[] }>('/documents')).documents,
  });

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (target?.dataset.cmd) void commands.run(target.dataset.cmd).catch((err: Error) => setText(engine, err.message));
  });

  await fontsReady();
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
