import { el, q, setChecked, setText, setValue } from '../dom';

export interface Row<T> { el: HTMLElement; set(v: T): void; setEnabled(on: boolean): void }

export const fmt = (v: number): string => String(Number(v.toFixed(3)));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function enabler(root: HTMLElement, controls: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>): (on: boolean) => void {
  return (on) => {
    for (const c of controls) if (c.disabled === on) c.disabled = !on;
    root.classList.toggle('is-off', !on);
  };
}

export function sliderRow(label: string, min: number, max: number, step: number, onInput: (v: number) => void, limits: { min?: number; max?: number; def?: number } = {}): Row<number> {
  const lo = limits.min ?? min;
  const hi = limits.max ?? max;
  const root = el(`<div class="ft-prefs-field ft-prefs-slider"><span></span><div class="ft-prefs-slider-ctl"><input type="range" min="${min}" max="${max}" step="${step}"><input class="ft-prefs-num" type="number" min="${lo}" max="${hi}" step="${step}"></div></div>`);
  setText(q(root, 'span'), label);
  const range = q<HTMLInputElement>(root, 'input[type="range"]');
  const box = q<HTMLInputElement>(root, 'input.ft-prefs-num');
  range.setAttribute('aria-label', label);
  box.setAttribute('aria-label', `${label} value`);
  const fill = (): void => {
    const base = Number(range.min);
    const span = Number(range.max) - base;
    range.style.setProperty('--pct', `${span > 0 ? clamp(((range.valueAsNumber - base) / span) * 100, 0, 100) : 0}%`);
  };
  range.addEventListener('input', () => {
    fill();
    box.value = fmt(range.valueAsNumber);
    onInput(range.valueAsNumber);
  });
  box.addEventListener('change', () => {
    const raw = box.valueAsNumber;
    if (!Number.isFinite(raw)) return;
    const v = clamp(raw, lo, hi);
    box.value = fmt(v);
    range.value = String(v);
    fill();
    onInput(v);
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.blur(); } });
  const lab = q(root, 'span');
  if (limits.def !== undefined) {
    const def = limits.def;
    const reset = (): void => { range.value = String(def); fill(); box.value = fmt(def); onInput(def); };
    lab.addEventListener('dblclick', reset);
    range.addEventListener('dblclick', reset);
    lab.title = 'Double-click to reset';
  }
  let scrub: { x: number; v: number; id: number; on: boolean } | null = null;
  lab.classList.add('ft-prefs-scrub');
  lab.addEventListener('pointerdown', (e) => { if (e.button === 0) { scrub = { x: e.clientX, v: range.valueAsNumber, id: e.pointerId, on: false }; lab.setPointerCapture(e.pointerId); } });
  lab.addEventListener('pointermove', (e) => {
    if (!scrub || e.pointerId !== scrub.id) return;
    const dx = e.clientX - scrub.x;
    if (!scrub.on) { if (Math.abs(dx) < 3) return; scrub.on = true; }
    const per = ((max - min) / 250) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
    range.value = String(clamp(Number((Math.round((scrub.v + dx * per) / step) * step).toFixed(6)), min, max));
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const endScrub = (e: PointerEvent): void => { if (lab.hasPointerCapture(e.pointerId)) lab.releasePointerCapture(e.pointerId); scrub = null; };
  lab.addEventListener('pointerup', endScrub);
  lab.addEventListener('pointercancel', endScrub);
  fill();
  return {
    el: root,
    set(v) { if (range.value !== String(v)) range.value = String(v); fill(); setValue(box, fmt(v)); },
    setEnabled: enabler(root, [range, box]),
  };
}

export function selectRow(label: string, options: ReadonlyArray<readonly [string, string]>, onChange: (v: string) => void): Row<string> & { select: HTMLSelectElement } {
  const root = el('<label class="ft-prefs-field"><span></span><select class="ft-prefs-input"></select></label>');
  setText(q(root, 'span'), label);
  const sel = q<HTMLSelectElement>(root, 'select');
  for (const [v, t] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return { el: root, select: sel, set(v) { if (sel.value !== v) sel.value = v; }, setEnabled: enabler(root, [sel]) };
}

export function checkRow(label: string, onChange: (v: boolean) => void): Row<boolean> {
  const root = el('<label class="ft-prefs-field ft-prefs-check"><span></span><input type="checkbox"></label>');
  setText(q(root, 'span'), label);
  const box = q<HTMLInputElement>(root, 'input');
  box.addEventListener('change', () => onChange(box.checked));
  return { el: root, set(v) { setChecked(box, v); }, setEnabled: enabler(root, [box]) };
}

const TRACK = '<span class="ft-prefs-toggle-track"><span class="ft-prefs-toggle-knob"></span></span>';

export function toggleRow(label: string, onChange: (v: boolean) => void): Row<boolean> {
  const root = el(`<label class="ft-prefs-field ft-prefs-toggle-row"><span></span><span class="ft-prefs-toggle"><input type="checkbox">${TRACK}</span></label>`);
  setText(q(root, 'span'), label);
  const box = q<HTMLInputElement>(root, 'input');
  box.addEventListener('change', () => onChange(box.checked));
  return { el: root, set(v) { setChecked(box, v); }, setEnabled: enabler(root, [box]) };
}

export function colorRow(label: string, onChange: (hex: string) => void): Row<string> & { input: HTMLInputElement } {
  const root = el('<label class="ft-prefs-field"><span></span><input class="ft-prefs-input ft-prefs-color" type="color"></label>');
  setText(q(root, 'span'), label);
  const inp = q<HTMLInputElement>(root, 'input');
  inp.addEventListener('input', () => onChange(inp.value));
  return { el: root, input: inp, set(v) { setValue(inp, v); }, setEnabled: enabler(root, [inp]) };
}

export function numberRow(label: string, min: number, max: number, step: number, onChange: (v: number) => void): Row<number> & { input: HTMLInputElement } {
  const root = el(`<label class="ft-prefs-field"><span></span><input class="ft-prefs-input" type="number" min="${min}" max="${max}" step="${step}"></label>`);
  setText(q(root, 'span'), label);
  const input = q<HTMLInputElement>(root, 'input');
  input.addEventListener('change', () => {
    const v = input.valueAsNumber;
    if (!Number.isFinite(v)) return;
    const c = clamp(v, min, max);
    input.value = fmt(c);
    onChange(c);
  });
  return { el: root, input, set(v) { setValue(input, fmt(v)); }, setEnabled: enabler(root, [input]) };
}

export function textRow(label: string, opts: { type?: 'text' | 'password' | 'url'; placeholder?: string; onCommit: (v: string) => void }): Row<string> & { input: HTMLInputElement } {
  const root = el(`<label class="ft-prefs-field"><span></span><input class="ft-prefs-input" type="${opts.type ?? 'text'}" spellcheck="false" autocomplete="${opts.type === 'password' ? 'new-password' : 'off'}"></label>`);
  setText(q(root, 'span'), label);
  const input = q<HTMLInputElement>(root, 'input');
  input.setAttribute('aria-label', label);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.addEventListener('change', () => opts.onCommit(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  return { el: root, input, set(v) { setValue(input, v); }, setEnabled: enabler(root, [input]) };
}

export function buttonRow(label: string, buttonLabel: string, onClick: () => void, kind: '' | 'danger' | 'primary' = ''): Row<boolean> & { button: HTMLButtonElement } {
  const root = el(`<div class="ft-prefs-field ft-prefs-action"><span></span><button type="button" class="ft-btn${kind ? ` ${kind}` : ''}"></button></div>`);
  setText(q(root, 'span'), label);
  const button = q<HTMLButtonElement>(root, 'button');
  setText(button, buttonLabel);
  button.addEventListener('click', onClick);
  return { el: root, button, set(v) { if (button.disabled === v) button.disabled = !v; }, setEnabled: enabler(root, [button]) };
}
