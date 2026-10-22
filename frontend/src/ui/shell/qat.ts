import { ICONS, icon } from '../icons';
import { PREF_ICONS } from '../icons-prefs';
import { SHELL_ICONS } from '../icons-shell';
import { WORD_ICONS } from '../icons-word';
import { WORDCMD_ICONS } from '../icons-wordcmd';
import { CHROME_ICONS } from '../icons-chrome';
import { HOME_ICONS } from '../icons-home';
import { el, patchList, setClass, setDisabled } from '../dom';
import type { Command, Commands } from './cmd';

export const QAT_KEY = 'formtxt.qat';
export const DEFAULT_QAT = ['edit.undo', 'edit.redo'];
export const COMMON_QAT = ['file.new', 'file.open', 'file.save', 'print.run', 'edit.undo', 'edit.redo', 'review.spelling', 'insert.table'];

export const hasIcon = (name: string): boolean => !!(ICONS[name] ?? SHELL_ICONS[name] ?? WORD_ICONS[name] ?? WORDCMD_ICONS[name] ?? CHROME_ICONS[name] ?? HOME_ICONS[name] ?? PREF_ICONS[name]);

export function iconOf(cmd: Command | undefined, id: string, fallback?: string): string {
  if (fallback && hasIcon(fallback)) return fallback;
  if (cmd?.icon && hasIcon(cmd.icon)) return cmd.icon;
  return 'more';
}

export function plainLabel(commands: Commands, id: string): string {
  const cmd = commands.get(id);
  return cmd ? commands.label(cmd).replace(/\.\.\.$/, '').replace(/…$/, '') : id;
}

export interface TipInfo { title: string; keys: string; desc: string }

export class RichTip {
  private readonly node = el('<div class="ft-rtip" role="tooltip" hidden><div class="ft-rtip-head"><span class="ft-rtip-title"></span><span class="ft-rtip-keys"></span></div><div class="ft-rtip-desc"></div></div>');
  private readonly title: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly desc: HTMLElement;
  private timer = 0;
  private target: HTMLElement | null = null;

  constructor() {
    this.title = this.node.querySelector('.ft-rtip-title') as HTMLElement;
    this.keys = this.node.querySelector('.ft-rtip-keys') as HTMLElement;
    this.desc = this.node.querySelector('.ft-rtip-desc') as HTMLElement;
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.node);
    const off = (): void => this.hide();
    window.addEventListener('pointerdown', off, true);
    window.addEventListener('keydown', off, true);
    window.addEventListener('blur', off);
    window.addEventListener('scroll', off, true);
  }

  attach(root: HTMLElement, resolve: (n: HTMLElement) => TipInfo | null): void {
    root.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') return;
      const n = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (!n || n === this.target) return;
      this.hide();
      this.target = n;
      const wait = document.querySelector('.ft-rtip:not([hidden])') ? 0 : 450;
      this.timer = window.setTimeout(() => this.show(n, resolve(n)), wait);
    });
    root.addEventListener('pointerout', (e) => {
      const to = (e as PointerEvent).relatedTarget as Node | null;
      if (this.target && (!to || !this.target.contains(to))) this.hide();
    });
  }

  private show(n: HTMLElement, info: TipInfo | null): void {
    if (!info || !n.isConnected) return;
    if (this.title.textContent !== info.title) this.title.textContent = info.title;
    if (this.keys.textContent !== (info.keys ? `(${info.keys})` : '')) this.keys.textContent = info.keys ? `(${info.keys})` : '';
    if (this.desc.textContent !== info.desc) this.desc.textContent = info.desc;
    this.desc.hidden = !info.desc;
    this.node.style.visibility = 'hidden';
    this.node.hidden = false;
    const r = n.getBoundingClientRect();
    const w = this.node.offsetWidth, h = this.node.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight - 4;
    this.node.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - w - 4)))}px`;
    this.node.style.top = `${Math.round(below ? r.bottom + 6 : Math.max(4, r.top - h - 6))}px`;
    this.node.style.visibility = '';
  }

  hide(): void {
    clearTimeout(this.timer);
    this.target = null;
    if (!this.node.hidden) this.node.hidden = true;
  }
}

let sharedTip: RichTip | null = null;
export const richTip = (): RichTip => (sharedTip ??= new RichTip());

export function tipOf(commands: Commands, n: HTMLElement): TipInfo | null {
  const id = n.dataset.cmd;
  const cmd = id ? commands.get(id) : undefined;
  const title = n.dataset.label ?? (cmd ? plainLabel(commands, cmd.id) : '');
  if (!title) return null;
  return { title, keys: cmd ? commands.keyLabel(cmd) : '', desc: cmd?.description ?? n.dataset.desc ?? '' };
}

interface QatState { items: string[]; v?: number }

export class Qat {
  readonly node: HTMLElement;
  items: string[] = [...DEFAULT_QAT];
  common: string[] = [...COMMON_QAT];
  onChange: (() => void) | null = null;
  onContext: ((id: string | null, x: number, y: number) => void) | null = null;
  onMore: ((anchor: HTMLElement) => void) | null = null;
  onRun: (() => void) | null = null;
  private readonly list: HTMLElement;
  private readonly more: HTMLButtonElement;
  private shown = '';

  constructor(private readonly commands: Commands) {
    this.node = el(`<div class="ft-qat" role="toolbar" aria-label="Quick Access Toolbar"><div class="ft-qat-list"></div><button class="ft-qat-more" type="button" aria-haspopup="menu" aria-label="Customize Quick Access Toolbar" data-tip="1" data-label="Customize Quick Access Toolbar">${icon('chevronDown', 12)}</button></div>`);
    this.list = this.node.querySelector('.ft-qat-list') as HTMLElement;
    this.more = this.node.querySelector('.ft-qat-more') as HTMLButtonElement;
    this.load();
    richTip().attach(this.node, (n) => tipOf(this.commands, n));
    this.node.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    this.node.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      if (b === this.more) { this.onMore?.(b); return; }
      if (b.dataset.cmd) { this.commands.run(b.dataset.cmd); this.sync(); this.onRun?.(); }
    });
    this.node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-cmd]');
      this.onContext?.(b?.dataset.cmd ?? null, e.clientX, e.clientY);
    });
    this.node.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = Array.from(this.node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return;
      e.preventDefault();
      e.stopPropagation();
      all[(at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus();
    });
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(QAT_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<QatState>;
      if (Array.isArray(s.items)) this.items = s.items.filter((x): x is string => typeof x === 'string');
    } catch { return; }
  }

  private save(): void {
    try { localStorage.setItem(QAT_KEY, JSON.stringify({ items: this.items, v: 1 } satisfies QatState)); } catch { return; }
  }

  has(id: string): boolean { return this.items.includes(id); }

  add(id: string): void { if (!this.has(id) && this.commands.get(id)) this.set([...this.items, id]); }

  remove(id: string): void { this.set(this.items.filter((x) => x !== id)); }

  toggle(id: string): void { if (this.has(id)) this.remove(id); else this.add(id); }

  reset(): void { this.set([...DEFAULT_QAT]); }

  set(items: string[]): void {
    this.items = Array.from(new Set(items));
    this.save();
    this.render();
    this.onChange?.();
  }

  render(): void {
    const ids = this.items.filter((id) => !!this.commands.get(id));
    const key = ids.join('|');
    if (key === this.shown) return;
    this.shown = key;
    patchList(this.list, ids, {
      key: (id) => id,
      create: (id) => {
        return el<HTMLButtonElement>(`<button class="ft-qat-btn" type="button" data-cmd="${id}" data-tip="1"></button>`);
      },
      update: () => undefined,
    });
    this.patch();
  }

  private patch(): void {
    for (const b of Array.from(this.list.querySelectorAll<HTMLButtonElement>('button[data-cmd]'))) {
      const cmd = this.commands.get(b.dataset.cmd as string);
      if (!cmd) continue;
      const label = plainLabel(this.commands, cmd.id);
      if (b.dataset.label !== label) { b.dataset.label = label; b.setAttribute('aria-label', label); }
      const ic = iconOf(cmd, cmd.id);
      if (b.dataset.ic !== ic) {
        b.dataset.ic = ic;
        b.innerHTML = icon(ic, 16);
      }
      setDisabled(b, !this.commands.enabled(cmd));
      setClass(b, 'is-on', !!cmd.checked?.());
    }
  }

  sync(): void {
    this.render();
    this.patch();
  }
}
