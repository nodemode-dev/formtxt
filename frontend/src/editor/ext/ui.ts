import { commands } from '../../engine/registry';
import { el, escapeHtml, setClass, setHidden, setHtml, setText } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { toast } from '../../ui/toast';

export interface MenuItem {
  cmd: string;
  label: string;
  keys?: string;
  params?: Record<string, unknown>;
}

const ORDER = ['File', 'Insert', 'References', 'Review', 'Tools', 'AI', 'View', 'Share'];
const menus = new Map<string, Array<MenuItem | null>>();
let bar: HTMLElement | null = null;
let pop: HTMLElement | null = null;
let openName = '';
let panel: HTMLElement | null = null;
let panelTitle: HTMLElement | null = null;
let panelBody: HTMLElement | null = null;
const panels = new Map<string, { title: string; body: HTMLElement; onClose?: () => void }>();
let activeId = '';

function menuButton(name: string): HTMLElement | null {
  if (!bar) return null;
  let btn = bar.querySelector<HTMLElement>(`[data-menu="${name}"]`);
  if (btn) return btn;
  btn = el(`<button type="button" class="ft-menubar-btn" role="menuitem" aria-haspopup="true" aria-expanded="false" data-menu="${escapeHtml(name)}">${escapeHtml(name)}</button>`);
  const rank = (n: string): number => { const i = ORDER.indexOf(n); return i < 0 ? ORDER.length : i; };
  const after = Array.from(bar.querySelectorAll<HTMLElement>('[data-menu]')).find((b) => rank(b.dataset.menu ?? '') > rank(name));
  bar.insertBefore(btn, after ?? null);
  return btn;
}

export function addMenuItems(menu: string, items: MenuItem[], separated = true): void {
  const list = menus.get(menu) ?? [];
  if (separated && list.length) list.push(null);
  list.push(...items);
  menus.set(menu, list);
  menuButton(menu);
}

function closeMenu(): void {
  if (!pop || !openName) return;
  setHidden(pop, true);
  const btn = bar?.querySelector<HTMLElement>(`[data-menu="${openName}"]`);
  btn?.setAttribute('aria-expanded', 'false');
  setClass(btn ?? null, 'is-open', false);
  openName = '';
}

function openMenu(name: string): void {
  if (!pop || !bar) return;
  const btn = bar.querySelector<HTMLElement>(`[data-menu="${name}"]`);
  if (!btn) return;
  const items = menus.get(name) ?? [];
  const html = items.map((it, i) => it
    ? `<button type="button" class="ft-menu-item" role="menuitem" data-i="${i}"><span>${escapeHtml(it.label)}</span>${it.keys ? `<kbd>${escapeHtml(it.keys)}</kbd>` : ''}</button>`
    : '<div class="ft-menu-sep" role="separator"></div>').join('');
  setHtml(pop, html, `${name}:${items.length}`);
  pop.dataset.menu = name;
  const r = btn.getBoundingClientRect();
  pop.style.left = `${Math.round(r.left)}px`;
  pop.style.top = `${Math.round(r.bottom + 2)}px`;
  if (openName && openName !== name) closeMenu();
  openName = name;
  btn.setAttribute('aria-expanded', 'true');
  setClass(btn, 'is-open', true);
  setHidden(pop, false);
  pop.querySelector<HTMLElement>('.ft-menu-item')?.focus({ preventScroll: true });
}

export function mountExtensionUI(): void {
  if (bar) return;
  const editor = document.querySelector<HTMLElement>('.ft-editor');
  const toolbar = editor?.querySelector<HTMLElement>('.ft-toolbar');
  const body = editor?.querySelector<HTMLElement>('.ft-editor-body');
  if (!editor || !toolbar || !body) return;
  bar = el('<div class="ft-menubar" role="menubar" aria-label="Menus"></div>');
  toolbar.before(bar);
  pop = el('<div class="ft-menu-pop" role="menu" hidden></div>');
  document.getElementById('overlay-root')?.appendChild(pop);
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-menu]');
    if (!b?.dataset.menu) return;
    if (openName === b.dataset.menu) closeMenu(); else openMenu(b.dataset.menu);
  });
  bar.addEventListener('mouseover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-menu]');
    if (openName && b?.dataset.menu && b.dataset.menu !== openName) openMenu(b.dataset.menu);
  });
  pop.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!b) return;
    const item = menus.get(openName)?.[Number(b.dataset.i)];
    closeMenu();
    if (item) void commands.run(item.cmd, item.params ?? {}).catch((err: Error) => toast(err.message, 'error'));
  });
  pop.addEventListener('keydown', (e) => {
    const items = Array.from(pop?.querySelectorAll<HTMLElement>('.ft-menu-item') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); const name = openName; closeMenu(); bar?.querySelector<HTMLElement>(`[data-menu="${name}"]`)?.focus(); }
  });
  document.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    if (openName && !t.closest('.ft-menu-pop') && !t.closest('.ft-menubar')) closeMenu();
  });
  panel = el(`<aside class="ft-panel" aria-label="Side panel" hidden><div class="ft-panel-head"><h2 class="ft-panel-title"></h2><button type="button" class="ft-tb-btn sm" data-panel-close title="Close panel" aria-label="Close panel">${icon('close', 14)}</button></div><div class="ft-panel-body"></div></aside>`);
  panelTitle = panel.querySelector('.ft-panel-title');
  panelBody = panel.querySelector('.ft-panel-body');
  body.appendChild(panel);
  panel.querySelector('[data-panel-close]')?.addEventListener('click', () => closePanel());
}

export function openPanel(id: string, title: string, content: HTMLElement, onClose?: () => void): HTMLElement {
  if (!panel || !panelBody) return content;
  if (!panels.has(id)) {
    content.dataset.panel = id;
    content.hidden = true;
    panelBody.appendChild(content);
    panels.set(id, { title, body: content, onClose });
  }
  for (const [pid, p] of panels) setHidden(p.body, pid !== id);
  if (activeId && activeId !== id) panels.get(activeId)?.onClose?.();
  activeId = id;
  setText(panelTitle, title);
  setHidden(panel, false);
  return panels.get(id)?.body ?? content;
}

export function closePanel(id?: string): void {
  if (!panel || (id && id !== activeId)) return;
  const p = panels.get(activeId);
  setHidden(panel, true);
  activeId = '';
  p?.onClose?.();
}

export function panelOpen(id: string): boolean {
  return activeId === id && !!panel && !panel.hidden;
}

export function togglePanel(id: string, title: string, content: () => HTMLElement, onClose?: () => void): boolean {
  if (panelOpen(id)) { closePanel(id); return false; }
  openPanel(id, title, panels.get(id)?.body ?? content(), onClose);
  return true;
}
