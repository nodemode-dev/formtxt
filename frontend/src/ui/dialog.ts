import { el, setHidden, setText } from './dom';
import { icon } from './icons';

export class Dialog {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly heading: HTMLElement;
  private returnFocus: HTMLElement | null = null;

  constructor(title: string, width = 560) {
    this.root = el(`<div class="ft-scrim" hidden><div class="ft-dialog" role="dialog" aria-modal="true" style="width:min(${width}px, calc(100vw - 32px))">
<div class="ft-dialog-head"><h2 class="ft-dialog-title"></h2><button class="ft-btn square ghost" type="button" data-close aria-label="Close">${icon('close', 16)}</button></div>
<div class="ft-dialog-body"></div><div class="ft-dialog-foot"></div></div></div>`);
    this.body = this.root.querySelector('.ft-dialog-body') as HTMLElement;
    this.foot = this.root.querySelector('.ft-dialog-foot') as HTMLElement;
    this.heading = this.root.querySelector('.ft-dialog-title') as HTMLElement;
    this.setTitle(title);
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.root || t.closest('[data-close]')) this.close();
    });
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.close(); } });
    document.getElementById('overlay-root')?.appendChild(this.root);
  }

  setTitle(title: string): void {
    setText(this.heading, title);
  }

  button(label: string, kind: 'primary' | 'ghost' | '' , run: () => void): HTMLButtonElement {
    const b = el<HTMLButtonElement>(`<button class="ft-btn${kind ? ` ${kind}` : ''}" type="button"></button>`);
    setText(b, label);
    b.addEventListener('click', run);
    this.foot.appendChild(b);
    return b;
  }

  field(label: string, input: HTMLElement): void {
    const row = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    setText(row.querySelector('.ft-field-label'), label);
    row.appendChild(input);
    this.body.appendChild(row);
  }

  open(focus?: HTMLElement): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    setHidden(this.root, false);
    (focus ?? (this.foot.lastElementChild as HTMLElement | null))?.focus();
  }

  close(): void {
    setHidden(this.root, true);
    this.returnFocus?.focus?.();
  }
}
