import { Dialog } from '../../../ui/dialog';
import { el, patchList, setHidden, setText } from '../../../ui/dom';

export interface Field {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'check' | 'number';
  options?: Array<[string, string]>;
  placeholder?: string;
}

export type Values = Record<string, string | boolean>;
type Input = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function setOptions(select: HTMLSelectElement, options: Array<[string, string]>): void {
  patchList(select, options, {
    key: (o) => o[0],
    create: (o) => { const op = el<HTMLOptionElement>('<option></option>'); op.value = o[0]; op.textContent = o[1]; return op; },
    update: (n, o) => { if (n.textContent !== o[1]) n.textContent = o[1]; },
  });
}

export class FormDialog {
  readonly dialog: Dialog;
  readonly inputs: Record<string, Input> = {};
  readonly rows: Record<string, HTMLElement> = {};
  private readonly error: HTMLElement;
  private submit: ((v: Values) => string | void | Promise<string | void>) | null = null;
  onChange: ((key: string) => void) | null = null;
  keepOpen = false;

  constructor(title: string, fields: Field[], okLabel: string, width = 460) {
    this.dialog = new Dialog(title, width);
    for (const f of fields) {
      let input: Input;
      if (f.kind === 'select') { input = el<HTMLSelectElement>('<select class="ft-input"></select>'); setOptions(input as HTMLSelectElement, f.options ?? []); }
      else if (f.kind === 'textarea') input = el<HTMLTextAreaElement>('<textarea class="ft-input" rows="4" spellcheck="false"></textarea>');
      else if (f.kind === 'check') input = el<HTMLInputElement>('<input type="checkbox">');
      else input = el<HTMLInputElement>(`<input class="ft-input" type="${f.kind === 'number' ? 'number' : 'text'}" spellcheck="false">`);
      if (f.placeholder) input.setAttribute('placeholder', f.placeholder);
      input.setAttribute('aria-label', f.label);
      input.addEventListener('input', () => this.onChange?.(f.key));
      input.addEventListener('change', () => this.onChange?.(f.key));
      this.inputs[f.key] = input;
      this.dialog.field(f.label, input);
      this.rows[f.key] = input.parentElement as HTMLElement;
      if (f.kind === 'check') this.rows[f.key].classList.add('ft-check');
    }
    this.error = el('<p class="ft-note ft-refs-error" role="alert" hidden></p>');
    this.dialog.body.appendChild(this.error);
    this.dialog.button('Cancel', 'ghost', () => this.dialog.close());
    this.dialog.button(okLabel, 'primary', () => void this.ok());
    this.dialog.root.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox') { e.preventDefault(); void this.ok(); }
    });
  }

  values(): Values {
    const out: Values = {};
    for (const [k, i] of Object.entries(this.inputs)) out[k] = i instanceof HTMLInputElement && i.type === 'checkbox' ? i.checked : i instanceof HTMLSelectElement && i.multiple ? Array.from(i.selectedOptions, (o) => o.value).join(',') : i.value;
    return out;
  }

  set(values: Values): void {
    for (const [k, v] of Object.entries(values)) {
      const i = this.inputs[k];
      if (!i) continue;
      if (i instanceof HTMLInputElement && i.type === 'checkbox') i.checked = !!v;
      else if (i.value !== String(v)) i.value = String(v);
    }
  }

  show(key: string, on: boolean): void {
    setHidden(this.rows[key], !on);
  }

  open(values: Values, submit: (v: Values) => string | void | Promise<string | void>, focus?: string): void {
    this.submit = submit;
    this.set(values);
    setText(this.error, '');
    setHidden(this.error, true);
    this.dialog.open(focus ? this.inputs[focus] : Object.values(this.inputs)[0]);
  }

  private async ok(): Promise<void> {
    if (!this.submit) return;
    const msg = await this.submit(this.values());
    if (msg) { setText(this.error, msg); setHidden(this.error, false); return; }
    setText(this.error, '');
    setHidden(this.error, true);
    if (!this.keepOpen) this.dialog.close();
  }
}
