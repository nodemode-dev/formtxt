import { el, q, setClass, setDisabled, setText } from '../dom';
import { icon } from '../icons';
import type { Commands } from './cmd';
import type { MenuDef, MenuItem, ParamItem, SubMenu } from './types';

export type { MenuDef, MenuItem, ParamItem, SubMenu };

const isSub = (i: MenuItem): i is SubMenu => typeof i === 'object' && 'items' in i;
const isParam = (i: MenuItem): i is ParamItem => typeof i === 'object' && 'cmd' in i;
const MIN_DROP = 160;

interface Row { item: string | ParamItem; id: string; node: HTMLButtonElement }

export class PopupMenu {
  readonly panel: HTMLElement;
  private rows: Row[] = [];
  private subs: Array<{ sub: SubMenu; node: HTMLButtonElement; menu: PopupMenu }> = [];
  private key = '';
  private openSub: PopupMenu | null = null;
  private subTop = 0;
  onClose: (() => void) | null = null;

  constructor(private readonly commands: Commands, private readonly parent: PopupMenu | null = null, standalone = false) {
    this.panel = el('<div class="ft-popm" role="menu" hidden></div>');
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    this.panel.addEventListener('scroll', () => { if (this.panel.scrollTop !== this.subTop) this.closeSub(); }, { passive: true });
    this.panel.addEventListener('keydown', (e) => this.onKey(e));
    if (standalone) document.addEventListener('pointerdown', (e) => { if (this.isOpen && !this.contains(e.target as Node)) this.close(); }, true);
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  contains(t: Node): boolean { return this.panel.contains(t) || !!this.openSub?.contains(t); }

  private onKey(e: KeyboardEvent): void {
    const items = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('.ft-pm-item:not(:disabled)'));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!items.length) return;
      items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1) + (at < 0 ? 1 : 0)) % items.length].focus();
    } else if (e.key === 'ArrowRight' && document.activeElement?.classList.contains('ft-pm-sub')) {
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement as HTMLElement).click();
      this.openSub?.focusFirst();
    } else if (e.key === 'ArrowLeft' && this.parent) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      this.parent.panel.querySelector<HTMLElement>('.ft-pm-sub.is-open, .ft-pm-sub')?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.root().close();
    }
  }

  focusFirst(): void { this.panel.querySelector<HTMLButtonElement>('.ft-pm-item:not(:disabled)')?.focus(); }

  setItems(items: MenuItem[]): void {
    const key = JSON.stringify(items);
    if (key === this.key) return;
    this.key = key;
    this.closeSub();
    for (const s of this.subs) s.menu.panel.remove();
    this.panel.textContent = '';
    this.rows = [];
    this.subs = [];
    this.panel.classList.toggle('has-checks', items.some((i) => typeof i === 'string' && i !== '-' && !!this.commands.get(i)?.checked));
    for (const item of items) {
      if (item === '-') { this.panel.appendChild(el('<div class="ft-pm-sep" role="separator"></div>')); continue; }
      if (isSub(item)) {
        const node = el<HTMLButtonElement>(`<button class="ft-pm-item ft-pm-sub" role="menuitem" aria-haspopup="menu" type="button"><span class="ft-pm-check"></span><span class="ft-pm-label"></span><span class="ft-pm-keys">${icon('chevronRight', 12)}</span></button>`);
        setText(q(node, '.ft-pm-label'), item.label);
        const menu = new PopupMenu(this.commands, this);
        menu.setItems(item.items);
        node.addEventListener('pointerenter', () => this.showSub(menu, node));
        node.addEventListener('click', () => this.showSub(menu, node));
        this.subs.push({ sub: item, node, menu });
        this.panel.appendChild(node);
        continue;
      }
      const id = isParam(item) ? item.cmd : item;
      const cmd = this.commands.get(id);
      if (!cmd) continue;
      const node = el<HTMLButtonElement>(`<button class="ft-pm-item" role="menuitem" type="button" data-cmd="${id}"><span class="ft-pm-check">${icon('check', 14)}</span><span class="ft-pm-label"></span><span class="ft-pm-keys"></span></button>`);
      if (isParam(item)) setText(q(node, '.ft-pm-label'), item.label);
      else setText(q(node, '.ft-pm-keys'), this.commands.keyLabel(cmd));
      node.addEventListener('pointerenter', () => this.closeSub());
      node.addEventListener('click', () => { this.root().close(); this.commands.run(id, isParam(item) ? item.params : undefined); });
      this.rows.push({ item, id, node });
      this.panel.appendChild(node);
    }
  }

  private root(): PopupMenu { let m: PopupMenu = this; while (m.parent) m = m.parent; return m; }

  private showSub(menu: PopupMenu, row: HTMLElement): void {
    if (this.openSub === menu && menu.isOpen) return;
    this.closeSub();
    this.openSub = menu;
    this.subTop = this.panel.scrollTop;
    setClass(row, 'is-open', true);
    menu.onClose = () => setClass(row, 'is-open', false);
    menu.openBeside(row.getBoundingClientRect());
  }

  private closeSub(): void {
    const s = this.openSub;
    this.openSub = null;
    s?.close();
  }

  openAt(x: number, y: number, below = false): void {
    this.refresh();
    this.panel.style.visibility = 'hidden';
    this.panel.style.maxHeight = below ? `${Math.max(MIN_DROP, window.innerHeight - y - 8)}px` : '';
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
    const fitsRight = x + w <= window.innerWidth - 4, fitsBelow = y + h <= window.innerHeight - 4;
    const left = Math.max(4, Math.min(fitsRight ? x : x - w, window.innerWidth - w - 4));
    const top = below ? y : Math.max(4, Math.min(fitsBelow ? y : y - h, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
  }

  private openBeside(row: DOMRect): void {
    this.refresh();
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    this.panel.scrollTop = 0;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight, pad = 4;
    const right = row.right - 2, left = row.left - w + 2;
    const x = right + w <= window.innerWidth - pad ? right : Math.max(pad, left);
    const y = Math.max(pad, Math.min(row.top - pad, window.innerHeight - h - pad));
    this.panel.style.left = `${Math.round(x)}px`;
    this.panel.style.top = `${Math.round(y)}px`;
    this.panel.style.visibility = '';
  }

  private refresh(): void {
    for (const r of this.rows) {
      const cmd = this.commands.get(r.id);
      if (!cmd) continue;
      if (typeof r.item === 'string') setText(q(r.node, '.ft-pm-label'), this.commands.label(cmd));
      setDisabled(r.node, !this.commands.enabled(cmd));
      setClass(r.node, 'is-checked', typeof r.item === 'string' && !!cmd.checked?.());
    }
    for (const s of this.subs) s.menu.refresh();
  }

  close(): void {
    this.closeSub();
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    this.onClose?.();
  }
}

const itemsOf = (def: MenuDef): MenuItem[] => (typeof def.items === 'function' ? def.items() : def.items);

export class MenuBar {
  private readonly menus: Array<{ btn: HTMLButtonElement; menu: PopupMenu; def: MenuDef }> = [];
  private openIndex = -1;

  constructor(host: HTMLElement, commands: Commands, defs: MenuDef[]) {
    defs.forEach((def, i) => {
      const btn = el<HTMLButtonElement>('<button class="ft-mb-btn" type="button" aria-haspopup="menu"></button>');
      btn.textContent = def.label;
      host.appendChild(btn);
      const menu = new PopupMenu(commands);
      menu.setItems(itemsOf(def));
      menu.onClose = () => { if (this.openIndex === i) { this.openIndex = -1; setClass(btn, 'is-open', false); } };
      btn.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); if (this.openIndex === i) this.close(); else this.open(i); });
      btn.addEventListener('pointerenter', () => { if (this.openIndex >= 0 && this.openIndex !== i) this.open(i); });
      this.menus.push({ btn, menu, def });
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.openIndex < 0) return;
      const m = this.menus[this.openIndex];
      const t = e.target as Node;
      if (!m.menu.contains(t) && !m.btn.contains(t)) this.close();
    }, true);
    window.addEventListener('blur', () => this.close());
    window.addEventListener('resize', () => this.close());
  }

  get isOpen(): boolean { return this.openIndex >= 0; }

  open(i: number): void {
    this.close();
    const m = this.menus[i];
    m.menu.setItems(itemsOf(m.def));
    const b = m.btn.getBoundingClientRect();
    this.openIndex = i;
    setClass(m.btn, 'is-open', true);
    m.menu.openAt(b.left, b.bottom + 4, true);
  }

  close(): void {
    if (this.openIndex < 0) return;
    const m = this.menus[this.openIndex];
    this.openIndex = -1;
    setClass(m.btn, 'is-open', false);
    m.menu.close();
  }
}

export interface MenuRow { label: string; run?: () => void; checked?: boolean; disabled?: boolean; sep?: boolean }

export class ActionMenu {
  private readonly panel = el('<div class="ft-popm" role="menu" hidden></div>');
  private opener: HTMLElement | null = null;

  constructor() {
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.panel);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerdown', (e) => { if (!this.panel.hidden && !this.panel.contains(e.target as Node) && !this.opener?.contains(e.target as Node)) this.close(false); }, true);
    window.addEventListener('blur', () => this.close(false));
    this.panel.addEventListener('keydown', (e) => {
      const rows = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1) + (at < 0 ? 1 : 0)) % rows.length]?.focus(); }
    });
  }

  get isOpen(): boolean { return !this.panel.hidden; }

  contains(t: Node): boolean { return this.panel.contains(t); }

  open(rows: MenuRow[], x: number, y: number, opener: HTMLElement | null = null): void {
    this.opener = opener;
    this.panel.textContent = '';
    this.panel.classList.toggle('has-checks', rows.some((r) => r.checked !== undefined));
    for (const r of rows) {
      if (r.sep) { this.panel.appendChild(el('<div class="ft-pm-sep" role="separator"></div>')); continue; }
      const b = el<HTMLButtonElement>(`<button class="ft-pm-item${r.checked ? ' is-checked' : ''}" role="menuitem" type="button"><span class="ft-pm-check">${icon('check', 14)}</span><span class="ft-pm-label"></span><span class="ft-pm-keys"></span></button>`);
      setText(q(b, '.ft-pm-label'), r.label);
      b.disabled = !!r.disabled;
      b.addEventListener('click', () => { this.close(false); r.run?.(); });
      this.panel.appendChild(b);
    }
    this.panel.style.visibility = 'hidden';
    this.panel.hidden = false;
    const w = this.panel.offsetWidth, h = this.panel.offsetHeight;
    const left = Math.max(4, Math.min(x, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(y + h <= window.innerHeight - 4 ? y : y - h, window.innerHeight - h - 4));
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.visibility = '';
    this.panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  close(restore: boolean): void {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    if (restore) this.opener?.focus();
  }
}
