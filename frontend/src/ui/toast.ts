import { el, setText } from './dom';

export function dismissToast(node: HTMLElement): void {
  node.remove();
}

export function pushToast(node: HTMLElement, ms = 5000): void {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.appendChild(node);
  window.setTimeout(() => dismissToast(node), ms);
}

export function toast(text: string, kind: 'info' | 'error' = 'info'): void {
  const node = el(`<div class="ft-toast${kind === 'error' ? ' is-error' : ''}" role="status"><span class="ft-toast-text"></span></div>`);
  setText(node.querySelector('.ft-toast-text'), text);
  pushToast(node, kind === 'error' ? 8000 : 5000);
}

export function undoToast(text: string, undo: () => void): void {
  const node = el('<div class="ft-toast" role="status"><span class="ft-toast-text"></span><button class="ft-btn ghost sm" type="button">Undo</button></div>');
  setText(node.querySelector('.ft-toast-text'), text);
  node.querySelector('button')?.addEventListener('click', () => { dismissToast(node); undo(); });
  pushToast(node, 8000);
}
