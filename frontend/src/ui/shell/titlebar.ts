import { commands as registry } from '../../engine/registry';
import { el, patchList, setClass, setHidden, setHtml, setText, setTitle } from '../dom';
import { chromeIcon } from '../icons-chrome';
import type { Commands } from './cmd';

export type EditMode = 'editing' | 'suggesting' | 'viewing';

export interface TitleBarIds {
  preferences: string;
  comments: string;
  share: string;
  theme: string;
  setMode: string;
}

export const TITLEBAR_IDS: TitleBarIds = {
  preferences: 'app.preferences',
  comments: 'review.panel',
  share: 'collab.share',
  theme: 'view.toggleTheme',
  setMode: 'review.setMode',
};

export interface TitleBarDeps {
  commands: Commands;
  appName?: string;
  ids?: Partial<TitleBarIds>;
}

const MODES: Array<{ mode: EditMode; label: string; hint: string; icon: string }> = [
  { mode: 'editing', label: 'Editing', hint: 'Edit the document directly', icon: 'modeEdit' },
  { mode: 'suggesting', label: 'Suggesting', hint: 'Edits become tracked suggestions', icon: 'modeSuggest' },
  { mode: 'viewing', label: 'Viewing', hint: 'Read the final document without editing', icon: 'modeView' },
];

interface Hit { id: string; label: string; group: string; keys: string }

export class TitleBar {
  readonly root: HTMLElement;
  readonly menubar: HTMLElement;
  readonly qatHost: HTMLElement;
  private readonly doc: HTMLElement;
  private readonly app: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly pop: HTMLElement;
  private readonly list: HTMLElement;
  private readonly themeBtn: HTMLButtonElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly modePop: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly ids: TitleBarIds;
  private readonly appName: string;
  private windowTitle = '';
  private picked = 0;
  private hits: Hit[] = [];
  private mode: EditMode = 'editing';

  constructor(host: HTMLElement, private readonly d: TitleBarDeps) {
    this.ids = { ...TITLEBAR_IDS, ...d.ids };
    this.appName = d.appName ?? 'FormTxt';
    this.root = el<HTMLElement>(
      '<header class="ft-titlebar">' +
      '<nav class="ft-menubar" aria-label="Main menu"></nav>' +
      '<div class="ft-qat-host"></div>' +
      `<div class="ft-tb-title"><img class="ft-logo ft-tb-logo" src="/formtxt-logo.png" width="16" height="16" alt="" draggable="false"><span class="ft-tb-doc"></span><span class="ft-tb-app">${this.appName}</span></div>` +
      '<div class="ft-tb-tools">' +
      `<div class="ft-search"><span class="ft-search-icon">${chromeIcon('tbSearch', 14)}</span><input class="ft-search-input" type="text" placeholder="Search" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="false" aria-label="Search commands" title="Search commands (Alt+Q)"><div class="ft-search-pop" role="listbox" hidden></div></div>` +
      '<button class="ft-tt-btn" type="button" data-tt="theme"></button>' +
      `<button class="ft-tt-btn" type="button" data-tt="prefs" title="Preferences" aria-label="Preferences">${chromeIcon('tbGear', 16)}</button>` +
      `<button class="ft-tt-btn" type="button" data-tt="comments" title="Comments and changes" aria-label="Comments and changes">${chromeIcon('tbComment', 16)}<span class="ft-tt-badge" hidden></span></button>` +
      '<div class="ft-mode"><button class="ft-mode-btn" type="button" aria-haspopup="menu" aria-expanded="false" title="Editing mode"><span class="ft-mode-icon"></span><span class="ft-mode-label"></span>' + chromeIcon('tbChevron', 12) + '</button><div class="ft-mode-pop" role="menu" hidden></div></div>' +
      `<button class="ft-share-btn" type="button" data-tt="share" title="Share">${chromeIcon('tbShare', 14)}<span class="ft-share-text">Share</span></button>` +
      '</div>' +
      '</header>');
    this.menubar = this.root.querySelector('.ft-menubar') as HTMLElement;
    this.qatHost = this.root.querySelector('.ft-qat-host') as HTMLElement;
    this.doc = this.root.querySelector('.ft-tb-doc') as HTMLElement;
    this.app = this.root.querySelector('.ft-tb-app') as HTMLElement;
    this.input = this.root.querySelector('.ft-search-input') as HTMLInputElement;
    this.pop = this.root.querySelector('.ft-search-pop') as HTMLElement;
    this.list = this.pop;
    this.themeBtn = this.root.querySelector('[data-tt="theme"]') as HTMLButtonElement;
    this.modeBtn = this.root.querySelector('.ft-mode-btn') as HTMLButtonElement;
    this.modePop = this.root.querySelector('.ft-mode-pop') as HTMLElement;
    this.badge = this.root.querySelector('.ft-tt-badge') as HTMLElement;

    for (const m of MODES) {
      this.modePop.append(el(`<button class="ft-mode-opt" type="button" role="menuitemradio" data-mode="${m.mode}">${chromeIcon(m.icon, 16)}<span class="ft-mode-text"><span class="ft-mode-name">${m.label}</span><span class="ft-mode-hint">${m.hint}</span></span><span class="ft-mode-tick">${chromeIcon('tbCheck', 14)}</span></button>`));
    }
    this.paintMode();
    this.paintTheme();

    this.root.querySelector('.ft-tb-tools')?.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-tt]');
      if (!b) return;
      const which = b.dataset.tt;
      if (which === 'theme') this.run(this.ids.theme);
      else if (which === 'prefs') this.run(this.ids.preferences);
      else if (which === 'comments') this.run(this.ids.comments);
      else if (which === 'share') this.run(this.ids.share);
    });

    this.modeBtn.addEventListener('click', () => this.toggleModePop());
    this.modePop.addEventListener('click', (e) => {
      const o = (e.target as Element).closest<HTMLElement>('[data-mode]');
      if (!o) return;
      this.closeModePop();
      this.run(this.ids.setMode, { mode: o.dataset.mode });
    });

    this.input.addEventListener('input', () => { this.picked = 0; this.fill(this.input.value); });
    this.input.addEventListener('focus', () => this.fill(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      const n = this.hits.length;
      if (e.key === 'Escape') { this.closeSearch(); this.input.blur(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (n) { this.picked = (this.picked + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; this.mark(); }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); this.choose(this.picked); }
    });
    this.pop.addEventListener('pointerdown', (e) => e.preventDefault());
    this.pop.addEventListener('click', (e) => {
      const r = (e.target as Element).closest<HTMLElement>('[data-i]');
      if (r) this.choose(Number(r.dataset.i));
    });
    this.input.addEventListener('blur', () => this.closeSearch());

    document.addEventListener('pointerdown', (e) => {
      if (!this.modePop.hidden && !(e.target as Element).closest('.ft-mode')) this.closeModePop();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modePop.hidden) this.closeModePop();
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyQ') { e.preventDefault(); this.focusSearch(); }
    });
    new MutationObserver(() => this.paintTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('nm:ui-settings-changed', () => this.paintTheme());

    host.append(this.root);
  }

  setDocument(title: string | null, modified: boolean): void {
    const name = title ?? '';
    const shown = name ? `${modified ? '• ' : ''}${name}` : '';
    setText(this.doc, shown);
    setTitle(this.doc, name);
    const next = name ? `${shown} - ${this.appName}` : this.appName;
    if (this.windowTitle === next) return;
    this.windowTitle = next;
    document.title = next;
    const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } }).__TAURI_INTERNALS__;
    if (internals?.invoke) void Promise.resolve(internals.invoke('set_window_title', { title: next })).catch(() => undefined);
  }

  setMode(mode: EditMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.paintMode();
  }

  setCommentCount(n: number): void {
    setText(this.badge, n > 99 ? '99+' : String(n));
    setHidden(this.badge, n <= 0);
  }

  focusSearch(): void {
    this.input.focus();
    this.input.select();
  }

  private run(id: string, params?: Record<string, unknown>): void {
    this.d.commands.run(id, params);
  }

  private paintTheme(): void {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    setHtml(this.themeBtn, chromeIcon(light ? 'tbMoon' : 'tbSun', 16), light ? 'moon' : 'sun');
    const title = light ? 'Switch to the dark theme' : 'Switch to the light theme';
    setTitle(this.themeBtn, title);
    if (this.themeBtn.getAttribute('aria-label') !== title) this.themeBtn.setAttribute('aria-label', title);
  }

  private paintMode(): void {
    const m = MODES.find((x) => x.mode === this.mode) ?? MODES[0];
    setHtml(this.modeBtn.querySelector('.ft-mode-icon') as HTMLElement, chromeIcon(m.icon, 16), m.icon);
    setText(this.modeBtn.querySelector('.ft-mode-label'), m.label);
    this.modeBtn.dataset.mode = m.mode;
    setTitle(this.modeBtn, `${m.label}: ${m.hint}`);
    for (const o of Array.from(this.modePop.children) as HTMLElement[]) {
      const on = o.dataset.mode === this.mode;
      setClass(o, 'is-on', on);
      if (o.getAttribute('aria-checked') !== String(on)) o.setAttribute('aria-checked', String(on));
    }
  }

  private toggleModePop(): void {
    const open = this.modePop.hidden;
    setHidden(this.modePop, !open);
    this.modeBtn.setAttribute('aria-expanded', String(open));
  }

  private closeModePop(): void {
    setHidden(this.modePop, true);
    this.modeBtn.setAttribute('aria-expanded', 'false');
  }

  private closeSearch(): void {
    setHidden(this.pop, true);
    if (this.input.getAttribute('aria-expanded') !== 'false') this.input.setAttribute('aria-expanded', 'false');
  }

  private fill(query: string): void {
    const c = this.d.commands;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { this.hits = []; this.closeSearch(); return; }
    const out: Hit[] = [];
    for (const cmd of c.all()) {
      if ((registry.get(cmd.id)?.params ?? []).length) continue;
      const label = c.label(cmd);
      if (!label || !c.enabled(cmd)) continue;
      const hay = `${label} ${cmd.group} ${cmd.id}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      out.push({ id: cmd.id, label: label.replace(/\.\.\.$/, '…'), group: cmd.group, keys: c.keyLabel(cmd) });
    }
    const first = words[0];
    out.sort((a, b) => Number(b.label.toLowerCase().startsWith(first)) - Number(a.label.toLowerCase().startsWith(first)) || a.label.localeCompare(b.label));
    this.hits = out.slice(0, 8);
    const paint = (n: HTMLElement, x: { h: Hit; i: number }): void => {
      n.dataset.i = String(x.i);
      setText(n.querySelector('.ft-search-label'), x.h.label);
      setText(n.querySelector('.ft-search-group'), x.h.group);
      setText(n.querySelector('.ft-search-keys'), x.h.keys);
    };
    patchList(this.list, this.hits.map((h, i) => ({ h, i })), {
      key: (x) => x.h.id,
      create: (x) => {
        const n = el('<button class="ft-search-item" type="button" role="option"><span class="ft-search-label"></span><span class="ft-search-group"></span><span class="ft-search-keys"></span></button>');
        paint(n, x);
        return n;
      },
      update: paint,
    });
    if (!this.hits.length) {
      if (!this.list.querySelector('.ft-search-none')) this.list.append(el('<div class="ft-search-none">No matching commands</div>'));
    } else this.list.querySelector('.ft-search-none')?.remove();
    setHidden(this.pop, false);
    if (this.input.getAttribute('aria-expanded') !== 'true') this.input.setAttribute('aria-expanded', 'true');
    this.mark();
  }

  private mark(): void {
    Array.from(this.list.querySelectorAll<HTMLElement>('.ft-search-item')).forEach((b) => {
      const on = Number(b.dataset.i) === this.picked;
      setClass(b, 'is-picked', on);
      if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
    });
  }

  private choose(i: number): void {
    const h = this.hits[i];
    if (!h) return;
    this.input.value = '';
    this.hits = [];
    this.closeSearch();
    this.input.blur();
    this.run(h.id);
  }
}
