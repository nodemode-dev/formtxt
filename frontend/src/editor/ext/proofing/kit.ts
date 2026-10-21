import type { Dialog } from '../../../ui/dialog';
import { el, setText } from '../../../ui/dom';

let polite: HTMLElement | null = null;
let assertive: HTMLElement | null = null;
let seq = 0;

function regions(): { polite: HTMLElement; assertive: HTMLElement } {
  if (!polite || !assertive) {
    const wrap = el('<div class="ft-sr-live" data-ft-live></div>');
    polite = el('<div role="status" aria-live="polite" aria-atomic="true"></div>');
    assertive = el('<div role="alert" aria-live="assertive" aria-atomic="true"></div>');
    wrap.append(polite, assertive);
    document.body.appendChild(wrap);
  }
  return { polite, assertive };
}

export function announce(message: string, urgent = false): void {
  const r = regions();
  const target = urgent ? r.assertive : r.polite;
  const stamp = ++seq;
  setText(target, '');
  window.setTimeout(() => { if (stamp === seq) setText(target, message); }, 40);
}

export function lastAnnouncement(): string {
  const r = regions();
  return r.assertive.textContent || r.polite.textContent || '';
}

let ids = 0;

export function labelDialog(d: Dialog, described = false): void {
  const box = d.root.querySelector<HTMLElement>('.ft-dialog');
  const title = d.root.querySelector<HTMLElement>('.ft-dialog-title');
  if (!box || !title) return;
  if (!title.id) title.id = `ft-dlg-title-${++ids}`;
  box.setAttribute('aria-labelledby', title.id);
  if (described) {
    const note = d.body.querySelector<HTMLElement>('[data-describes]');
    if (note) {
      if (!note.id) note.id = `ft-dlg-desc-${++ids}`;
      box.setAttribute('aria-describedby', note.id);
    }
  }
  d.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((n) => !n.hidden && n.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !box.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !box.contains(active))) { e.preventDefault(); first.focus(); }
  });
}

export function check(label: string, checked: boolean, onChange: (on: boolean) => void): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el<HTMLLabelElement>('<label class="ft-pref-check"><input type="checkbox"><span></span></label>');
  const input = row.querySelector('input') as HTMLInputElement;
  setText(row.querySelector('span'), label);
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return { row, input };
}

export function btn(label: string, kind: string, onClick: () => void): HTMLButtonElement {
  const b = el<HTMLButtonElement>(`<button type="button" class="ft-btn${kind ? ` ${kind}` : ''}"></button>`);
  setText(b, label);
  b.addEventListener('click', onClick);
  return b;
}

export const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

export function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ft-editor .ft-scroll');
}

export function reveal(node: Element | null): void {
  const box = scrollContainer();
  if (!node || !box) return;
  const r = node.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.top < b.top + 40 || r.bottom > b.bottom - 40) node.scrollIntoView({ block: 'center', inline: 'nearest' });
}
