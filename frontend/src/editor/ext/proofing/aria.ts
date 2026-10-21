import type { DocEditor } from '../../editor';
import { announce } from './kit';

export interface AuditFinding { problem: string; element: string }

function describeNode(n: Element): string {
  const id = n.id ? `#${n.id}` : '';
  const cls = typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${n.tagName.toLowerCase()}${id}${cls}`;
}

function nameOf(n: Element): string {
  const label = n.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();
  const by = n.getAttribute('aria-labelledby');
  if (by) {
    const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (t) return t;
  }
  if (n instanceof HTMLInputElement && n.type === 'image') return n.alt;
  const text = (n.textContent ?? '').trim();
  if (text) return text;
  const title = n.getAttribute('title');
  if (title && title.trim()) return title.trim();
  return '';
}

function inputNamed(n: HTMLElement): boolean {
  if (nameOf(n) && (n.getAttribute('aria-label') || n.getAttribute('aria-labelledby') || n.getAttribute('title'))) return true;
  if (n.closest('label')) return true;
  const id = n.id;
  if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;
  return false;
}

export function auditInterface(scope: ParentNode = document): AuditFinding[] {
  const out: AuditFinding[] = [];
  const visible = (n: Element): boolean => !n.closest('[hidden]') && !n.closest('[aria-hidden="true"]');
  for (const b of Array.from(scope.querySelectorAll('button, [role="button"], [role="menuitem"]'))) {
    if (!visible(b)) continue;
    if (!nameOf(b)) out.push({ problem: 'Button or menu item has no accessible name', element: describeNode(b) });
  }
  for (const i of Array.from(scope.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea'))) {
    if (!visible(i)) continue;
    if (!inputNamed(i)) out.push({ problem: 'Form control has no label', element: describeNode(i) });
  }
  for (const d of Array.from(scope.querySelectorAll('[role="dialog"]'))) {
    if (!d.closest('[hidden]') && !d.getAttribute('aria-labelledby') && !d.getAttribute('aria-label')) out.push({ problem: 'Dialog has no label', element: describeNode(d) });
  }
  for (const m of Array.from(scope.querySelectorAll('[role="menuitem"]'))) {
    if (!visible(m)) continue;
    if (!m.closest('[role="menu"], [role="menubar"]')) out.push({ problem: 'Menu item is outside a menu or menubar', element: describeNode(m) });
  }
  for (const a of Array.from(scope.querySelectorAll('aside, nav, section[aria-label], [role="region"]'))) {
    if (!visible(a)) continue;
    if ((a.tagName === 'ASIDE' || a.tagName === 'NAV') && !a.getAttribute('aria-label') && !a.getAttribute('aria-labelledby')) out.push({ problem: 'Landmark has no label', element: describeNode(a) });
  }
  for (const img of Array.from(scope.querySelectorAll('img'))) {
    if (!visible(img)) continue;
    if (!img.hasAttribute('alt')) out.push({ problem: 'Image has no alt attribute', element: describeNode(img) });
  }
  for (const t of Array.from(scope.querySelectorAll('[tabindex]'))) {
    if (Number(t.getAttribute('tabindex')) > 0) out.push({ problem: 'Positive tabindex breaks the focus order', element: describeNode(t) });
  }
  return out;
}

export function watchAnnouncements(ed: DocEditor): void {
  let lastPages = 0;
  let timer = 0;
  const status = document.querySelector<HTMLElement>('[data-ref="docstatus"]');
  if (status) {
    new MutationObserver(() => {
      const m = /(\d+) pages?/.exec(status.textContent ?? '');
      if (!m) return;
      const n = Number(m[1]);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (n !== lastPages && lastPages !== 0) announce(`${n} page${n === 1 ? '' : 's'}`);
        lastPages = n;
      }, 1500);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }
  let view = ed.root.dataset.view ?? '';
  new MutationObserver(() => {
    const next = ed.root.dataset.view ?? '';
    if (next && next !== view) announce(`${next.charAt(0).toUpperCase()}${next.slice(1)} view`);
    view = next;
  }).observe(ed.root, { attributes: true, attributeFilter: ['data-view'] });
}
