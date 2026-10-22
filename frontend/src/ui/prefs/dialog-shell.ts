import { el, q, setText } from '../dom';
import { icon } from '../icons';
import { SPOT_KEY } from './store';

type Spot = { x: number; y: number };

const spots: Record<string, Spot> = (() => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SPOT_KEY) ?? '{}');
    const out: Record<string, Spot> = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, { x?: unknown; y?: unknown }>)) if (typeof v?.x === 'number' && typeof v.y === 'number') out[k] = { x: v.x, y: v.y };
    return out;
  } catch { return {}; }
})();

export class PrefsShell {
  readonly scrim: HTMLElement;
  readonly frame: HTMLElement;
  readonly head: HTMLElement;
  readonly body: HTMLElement;
  readonly foot: HTMLElement;
  onClose: (() => void) | null = null;
  private lastFocus: HTMLElement | null = null;
  private offset: Spot = { x: 0, y: 0 };

  constructor(private readonly name: string, title: string) {
    this.scrim = el(`<div class="ft-prefs-scrim" hidden><div class="ft-prefs-dlg" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1">
<div class="ft-prefs-head"><span class="ft-prefs-headicon">${icon('settings', 16)}</span><span class="ft-prefs-title"></span><button class="ft-prefs-close" type="button" data-close title="Close" aria-label="Close">${icon('close', 16)}</button></div>
<div class="ft-prefs-body"></div><div class="ft-prefs-foot"></div></div></div>`);
    this.frame = q(this.scrim, '.ft-prefs-dlg');
    this.head = q(this.scrim, '.ft-prefs-head');
    this.body = q(this.scrim, '.ft-prefs-body');
    this.foot = q(this.scrim, '.ft-prefs-foot');
    setText(q(this.scrim, '.ft-prefs-title'), title);
    q(this.scrim, '[data-close]').addEventListener('click', () => this.close());
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });
    this.scrim.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.bindMove();
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.scrim);
  }

  get isOpen(): boolean { return !this.scrim.hidden; }

  private moveTo(x: number, y: number): void {
    const r = this.frame.getBoundingClientRect();
    if (!r.width) return;
    const left = r.left - this.offset.x;
    const top = r.top - this.offset.y;
    const nx = Math.min(Math.max(x, 48 - r.width - left), window.innerWidth - 48 - left);
    const ny = Math.min(Math.max(y, -top), window.innerHeight - 44 - top);
    this.offset = { x: nx, y: ny };
    spots[this.name] = { x: nx, y: ny };
    const t = nx || ny ? `${nx}px ${ny}px` : '';
    if (this.frame.style.translate !== t) this.frame.style.translate = t;
  }

  private bindMove(): void {
    this.head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const at = { ...(spots[this.name] ?? { x: 0, y: 0 }) };
      const sx = e.clientX;
      const sy = e.clientY;
      this.head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent): void => this.moveTo(at.x + ev.clientX - sx, at.y + ev.clientY - sy);
      const up = (): void => {
        this.head.removeEventListener('pointermove', move);
        this.head.removeEventListener('pointerup', up);
        this.head.removeEventListener('pointercancel', up);
        try { localStorage.setItem(SPOT_KEY, JSON.stringify(spots)); } catch { void 0; }
      };
      this.head.addEventListener('pointermove', move);
      this.head.addEventListener('pointerup', up);
      this.head.addEventListener('pointercancel', up);
    });
  }

  button(label: string, kind: '' | 'primary' | 'ghost' | 'danger', run: () => void): HTMLButtonElement {
    const b = el<HTMLButtonElement>(`<button class="ft-btn${kind ? ` ${kind}` : ''}" type="button"></button>`);
    setText(b, label);
    b.addEventListener('click', run);
    this.foot.appendChild(b);
    return b;
  }

  open(focus?: HTMLElement | null): void {
    if (this.isOpen) return;
    this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.scrim.hidden = false;
    const spot = spots[this.name];
    if (spot) this.moveTo(spot.x, spot.y);
    const target = focus ?? this.frame.querySelector<HTMLElement>('.ft-btn.primary');
    target?.focus();
    if (!this.scrim.contains(document.activeElement)) this.frame.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.scrim.hidden = true;
    this.onClose?.();
    if (this.scrim.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (this.lastFocus && typeof this.lastFocus.focus === 'function' && document.contains(this.lastFocus)) this.lastFocus.focus();
  }
}
