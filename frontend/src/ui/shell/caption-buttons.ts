import { q, setClass, setHidden, setTitle } from '../dom';
import { chromeIcon } from '../icons-chrome';

export const CUSTOM_TITLEBAR_KEY = 'formtxt.customTitleBar';

export const wantsCustomTitleBar = (): boolean => '__TAURI_INTERNALS__' in window && !/Mac/.test(navigator.platform);

export const wantsOverlayTitleBar = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform);

export function customTitleBarWanted(): boolean {
  try { return localStorage.getItem(CUSTOM_TITLEBAR_KEY) === '1'; } catch { return false; }
}

export function setCustomTitleBarWanted(on: boolean): void {
  try { localStorage.setItem(CUSTOM_TITLEBAR_KEY, on ? '1' : '0'); } catch { void 0; }
}

type Win = ReturnType<typeof import('@tauri-apps/api/window').getCurrentWindow>;

export class CaptionButtons {
  private readonly box = document.createElement('div');
  private win: Promise<Win> | null = null;
  private on = false;
  private maximized = false;

  constructor(private readonly header: HTMLElement, private readonly wanted: () => boolean = customTitleBarWanted) {
    this.box.className = 'ft-caption';
    this.box.hidden = true;
    this.box.innerHTML =
      `<button class="ft-caption-btn" type="button" data-cap="min" title="Minimize" aria-label="Minimize">${chromeIcon('capMin', 16)}</button>` +
      `<button class="ft-caption-btn" type="button" data-cap="max" title="Maximize" aria-label="Maximize">${chromeIcon('capMax', 16)}</button>` +
      `<button class="ft-caption-btn is-close" type="button" data-cap="close" title="Close" aria-label="Close">${chromeIcon('capClose', 16)}</button>`;
    header.append(this.box);
    if (wantsOverlayTitleBar()) {
      document.documentElement.classList.add('has-overlay-titlebar');
      for (const n of [header, ...header.querySelectorAll('.ft-tb-title, .ft-tb-doc, .ft-tb-app, .ft-tb-tools')]) n.setAttribute('data-tauri-drag-region', '');
    }
    this.box.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-cap]') : null;
      if (b) void this.act(b.dataset.cap ?? '');
    });
    header.addEventListener('pointerdown', (e) => { if (this.on && e.button === 0 && this.empty(e) && e.detail === 1) void this.use((w) => w.startDragging()); });
    header.addEventListener('dblclick', (e) => { if (this.on && this.empty(e)) void this.act('max'); });
    window.addEventListener('resize', () => { if (this.on) void this.look(); });
    this.sync();
  }

  get active(): boolean { return this.on; }

  sync(): void {
    const want = wantsCustomTitleBar() && this.wanted();
    if (want === this.on) return;
    this.on = want;
    setHidden(this.box, !want);
    setClass(document.documentElement, 'has-caption-buttons', want);
    void this.use((w) => w.setDecorations(!want)).then(() => this.look());
  }

  private empty(e: Event): boolean {
    const t = e.target;
    return t === this.header || (t instanceof HTMLElement && (t.classList.contains('ft-menubar') || t.classList.contains('ft-tb-title') || t.classList.contains('ft-tb-tools') || t.classList.contains('ft-qat-host')));
  }

  private async use<T>(run: (w: Win) => Promise<T>): Promise<T | undefined> {
    try {
      this.win ??= import('@tauri-apps/api/window').then((m) => m.getCurrentWindow());
      return await run(await this.win);
    } catch { return undefined; }
  }

  private async act(what: string): Promise<void> {
    if (what === 'min') await this.use((w) => w.minimize());
    else if (what === 'max') { await this.use((w) => w.toggleMaximize()); await this.look(); }
    else if (what === 'close') await this.use((w) => w.close());
  }

  private async look(): Promise<void> {
    const now = !!(await this.use((w) => w.isMaximized()));
    if (now === this.maximized && this.box.dataset.shown) return;
    this.maximized = now;
    this.box.dataset.shown = '1';
    const b = q<HTMLElement>(this.box, '[data-cap="max"]');
    b.innerHTML = chromeIcon(now ? 'capRestore' : 'capMax', 16);
    setTitle(b, now ? 'Restore' : 'Maximize');
    b.setAttribute('aria-label', now ? 'Restore' : 'Maximize');
  }
}
