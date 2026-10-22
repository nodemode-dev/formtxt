import { el, escapeHtml, setValue } from '../../dom';
import { icon } from '../../icons';

export interface SpinOpts {
  label: string;
  glyph: string;
  unit: 'in' | 'pt';
  step: number;
  min: number;
  max: number;
  read: () => number;
  apply: (value: number) => void;
}

const show = (v: number, unit: 'in' | 'pt'): string => (unit === 'in' ? `${Math.round(v * 100) / 100}"` : `${Math.round(v * 10) / 10} pt`);

export function spin(o: SpinOpts): { root: HTMLElement; patch: () => void } {
  const root = el(`<div class="ft-spin" role="group" aria-label="${escapeHtml(o.label)}"><span class="ft-spin-lb">${icon(o.glyph, 16)}<span>${escapeHtml(o.label)}</span></span><span class="ft-spin-box"><input class="ft-spin-in" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="${escapeHtml(o.label)}"><span class="ft-spin-btns"><button class="ft-spin-b" type="button" tabindex="-1" data-d="1" aria-label="Increase ${escapeHtml(o.label)}">${icon('chevronUp', 10)}</button><button class="ft-spin-b" type="button" tabindex="-1" data-d="-1" aria-label="Decrease ${escapeHtml(o.label)}">${icon('chevronDown', 10)}</button></span></span></div>`);
  const input = root.querySelector('input') as HTMLInputElement;
  const clamp = (v: number): number => Math.min(o.max, Math.max(o.min, Math.round(v * 100) / 100));
  let shown = '';

  const write = (v: number): void => {
    const t = show(v, o.unit);
    shown = t;
    input.value = t;
  };

  const commit = (v: number): void => {
    const next = clamp(v);
    write(next);
    o.apply(next);
  };

  const parse = (): number | null => {
    const n = parseFloat(input.value.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };

  const bump = (d: number): void => {
    const base = parse() ?? o.read();
    const snapped = Math.round(base / o.step) * o.step;
    commit((Math.abs(snapped - base) > 1e-6 && Math.sign(snapped - base) === Math.sign(d) ? snapped : base + d * o.step));
  };

  root.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
  root.querySelector('.ft-spin-btns')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (b) bump(Number(b.dataset.d));
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const v = parse(); if (v !== null) commit(v); input.blur(); }
    else if (e.key === 'Escape') { input.value = shown; input.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); input.select(); }
    e.stopPropagation();
  });
  input.addEventListener('blur', () => {
    const v = parse();
    if (input.value !== shown && v !== null) commit(v); else input.value = shown;
  });
  const patch = (): void => {
    if (document.activeElement === input) return;
    const t = show(o.read(), o.unit);
    if (t !== shown) { shown = t; setValue(input, t); }
  };
  write(o.read());
  return { root, patch };
}
