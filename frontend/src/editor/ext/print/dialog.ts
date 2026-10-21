import { Dialog } from '../../../ui/dialog';
import { el, patchList, setChecked, setDisabled, setHidden, setStyleVar, setText } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { defaultOptions, selectedPages } from './job';
import { pageBuilder, planPages, type PageBuilder, type PrintPlan } from './pages';
import { sheetOrder, type PrintOptions } from './ranges';

const HTML = `<div class="ft-pr">
<div class="ft-pr-opts">
<fieldset class="ft-pr-group"><legend>Pages</legend>
<label class="ft-pr-radio"><input type="radio" name="ft-pr-range" value="all"><span data-t="all"></span></label>
<label class="ft-pr-radio"><input type="radio" name="ft-pr-range" value="current"><span data-t="current"></span></label>
<label class="ft-pr-radio"><input type="radio" name="ft-pr-range" value="selection"><span data-t="selection"></span></label>
<label class="ft-pr-radio"><input type="radio" name="ft-pr-range" value="custom"><span>Pages</span><input class="ft-input ft-pr-range" type="text" data-k="pages" placeholder="1-3, 5" spellcheck="false" aria-label="Pages to print"></label>
<p class="ft-pr-error" role="alert" hidden></p>
</fieldset>
<div class="ft-pr-row">
<label class="ft-field"><span class="ft-field-label">Copies</span><input class="ft-input" type="number" min="1" max="99" value="1" data-k="copies"></label>
<label class="ft-pref-check"><input type="checkbox" data-k="collate" checked><span>Collate copies</span></label>
</div>
<label class="ft-field"><span class="ft-field-label">Sides</span><select class="ft-input" data-k="sides"><option value="one">One-sided</option><option value="two">Two-sided</option></select></label>
<p class="ft-note ft-pr-sum" aria-live="polite"></p>
<p class="ft-note">Two-sided adds a blank back page after an odd last page so copies never share a sheet. The browser's print window then chooses the printer and decides whether it prints on both sides, how many copies it makes, and the paper tray.</p>
</div>
<div class="ft-pr-preview" tabindex="0" aria-label="Print preview"><div class="ft-pr-list"></div><p class="ft-note ft-pr-flow" hidden></p></div>
</div>`;

export class PrintDialog {
  private readonly d: Dialog;
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly flowNote: HTMLElement;
  private readonly error: HTMLElement;
  private readonly sum: HTMLElement;
  private readonly pagesInput: HTMLInputElement;
  private readonly copies: HTMLInputElement;
  private readonly collate: HTMLInputElement;
  private readonly sides: HTMLSelectElement;
  private readonly printBtn: HTMLButtonElement;
  private readonly radios: HTMLInputElement[];
  private plan: PrintPlan | null = null;
  private builder: PageBuilder | null = null;
  private sig = '';
  private readonly seen = new Map<number, string>();
  private readonly observer: IntersectionObserver | null;
  private resize: ResizeObserver | null = null;

  constructor(private readonly ed: DocEditor, private readonly onPrint: (opts: PrintOptions) => Promise<void>) {
    this.d = new Dialog('Print', 980);
    this.root = el(HTML);
    this.d.body.appendChild(this.root);
    this.d.body.classList.add('ft-pr-body');
    this.list = this.root.querySelector('.ft-pr-list') as HTMLElement;
    this.preview = this.root.querySelector('.ft-pr-preview') as HTMLElement;
    this.flowNote = this.root.querySelector('.ft-pr-flow') as HTMLElement;
    this.error = this.root.querySelector('.ft-pr-error') as HTMLElement;
    this.sum = this.root.querySelector('.ft-pr-sum') as HTMLElement;
    this.pagesInput = this.root.querySelector('[data-k="pages"]') as HTMLInputElement;
    this.copies = this.root.querySelector('[data-k="copies"]') as HTMLInputElement;
    this.collate = this.root.querySelector('[data-k="collate"]') as HTMLInputElement;
    this.sides = this.root.querySelector('[data-k="sides"]') as HTMLSelectElement;
    this.radios = Array.from(this.root.querySelectorAll<HTMLInputElement>('input[name="ft-pr-range"]'));
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.printBtn = this.d.button('Print', 'primary', () => { void this.submit(); });
    this.observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.fill(Number((e.target as HTMLElement).dataset.key));
    }, { root: this.preview, rootMargin: '800px 0px' }) : null;
    this.root.addEventListener('input', (e) => {
      if (e.target === this.pagesInput) this.pick('custom');
      this.update();
    });
    this.root.addEventListener('change', () => this.update());
  }

  private pick(value: string): void {
    for (const r of this.radios) setChecked(r, r.value === value);
  }

  options(): PrintOptions {
    const range = (this.radios.find((r) => r.checked)?.value ?? 'all') as PrintOptions['range'];
    return { range, pages: this.pagesInput.value, copies: Math.max(1, Math.min(99, Math.floor(Number(this.copies.value)) || 1)), collate: this.collate.checked, sides: this.sides.value === 'two' ? 'two' : 'one' };
  }

  open(): void {
    const base = defaultOptions();
    this.pick(base.range);
    this.refresh();
    this.d.open(this.printBtn);
    if (!this.resize && typeof ResizeObserver === 'function') {
      this.resize = new ResizeObserver(() => this.scale());
      this.resize.observe(this.preview);
    }
    this.scale();
  }

  private refresh(): void {
    const plan = planPages(this.ed);
    this.plan = plan;
    if (!plan) return;
    const hasSelection = !!this.ed.view && !this.ed.view.state.selection.empty;
    const sel = this.radios.find((r) => r.value === 'selection');
    const cur = this.radios.find((r) => r.value === 'current');
    const cus = this.radios.find((r) => r.value === 'custom');
    if (sel) setDisabled(sel, !hasSelection);
    const flow = plan.mode === 'flow';
    if (cur) setDisabled(cur, flow);
    if (cus) setDisabled(cus, flow);
    setDisabled(this.pagesInput, flow);
    if (flow || (!hasSelection && this.options().range === 'selection')) this.pick('all');
    setHidden(this.flowNote, !flow);
    setText(this.flowNote, 'This document has no fixed pages in the current view (pageless or draft), so the browser decides where pages break when it prints. Switch to Print layout to see exact pages here.');
    setHidden(this.list, flow);
    if (flow) { this.sig = ''; this.builder = null; this.update(); return; }
    if (plan.signature !== this.sig) {
      this.sig = plan.signature;
      this.builder = pageBuilder(this.ed, plan);
      this.seen.clear();
      patchList(this.list, plan.sheets, {
        key: (s) => String(s.index),
        create: () => el('<figure class="ft-pr-sheet"><div class="ft-pr-frame"><div class="ft-pr-scale"></div></div><figcaption class="ft-pr-num"></figcaption></figure>'),
        update: (n) => { n.querySelector('.ft-pr-scale')?.replaceChildren(); },
      });
      Array.from(this.list.children).forEach((n, i) => {
        const node = n as HTMLElement;
        const s = plan.sheets[i];
        setStyleVar(node, '--w', String(Math.round(s.width * 100) / 100));
        setStyleVar(node, '--h', String(Math.round(s.height * 100) / 100));
        setText(node.querySelector('.ft-pr-num'), `Page ${i + 1}`);
        this.observer?.observe(node);
      });
    }
    this.update();
  }

  private fill(index: number): void {
    const node = this.list.children[index] as HTMLElement | undefined;
    if (!node || !this.builder || this.seen.get(index) === this.sig) return;
    this.seen.set(index, this.sig);
    node.querySelector('.ft-pr-scale')?.replaceChildren(this.builder.build(index));
  }

  private scale(): void {
    const plan = this.plan;
    if (!plan || !plan.sheets.length) return;
    const widest = Math.max(...plan.sheets.map((s) => s.width));
    const avail = Math.max(200, this.preview.clientWidth - 40);
    setStyleVar(this.preview, '--pv', String(Math.min(0.8, avail / widest).toFixed(4)));
  }

  private update(): void {
    const plan = this.plan;
    if (!plan) return;
    const opts = this.options();
    const flow = plan.mode === 'flow';
    const total = plan.sheets.length;
    setText(this.root.querySelector('[data-t="all"]'), flow ? 'Whole document' : `All pages (${total})`);
    setText(this.root.querySelector('[data-t="current"]'), flow ? 'Current page' : `Current page (${(this.ed.view ? this.currentIndex(plan) : 0) + 1})`);
    setText(this.root.querySelector('[data-t="selection"]'), 'Selection');
    setDisabled(this.collate, opts.sides === 'two');
    if (opts.sides === 'two') setChecked(this.collate, true);
    let error = '';
    let count = 0;
    if (flow) {
      count = 1;
    } else {
      const picked = opts.range === 'selection' ? { pages: [], error: '' } : selectedPages(this.ed, plan, opts);
      error = opts.range === 'custom' ? picked.error : '';
      count = opts.range === 'selection' ? 1 : picked.pages.length;
      const on = new Set(opts.range === 'selection' ? [] : picked.pages);
      Array.from(this.list.children).forEach((n, i) => (n as HTMLElement).classList.toggle('is-off', !on.has(i)));
      if (!error && opts.range !== 'selection') {
        const order = sheetOrder(picked.pages, opts);
        const sheets = opts.sides === 'two' ? Math.ceil(order.length / 2) : order.length;
        setText(this.sum, `${count} ${count === 1 ? 'page' : 'pages'} of ${total}, ${opts.copies} ${opts.copies === 1 ? 'copy' : 'copies'}: ${order.length} ${order.length === 1 ? 'page' : 'pages'} in all${opts.sides === 'two' ? `, ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} of paper` : ''}.`);
      }
    }
    if (opts.range === 'selection' || flow) setText(this.sum, `${opts.range === 'selection' ? 'The selected text' : 'The whole document'}, ${opts.copies} ${opts.copies === 1 ? 'copy' : 'copies'}. Page breaks are decided by the browser.`);
    setText(this.error, error);
    setHidden(this.error, !error);
    setDisabled(this.printBtn, !!error);
  }

  private currentIndex(plan: PrintPlan): number {
    const picked = selectedPages(this.ed, plan, { ...defaultOptions(), range: 'current' });
    return picked.pages[0] ?? 0;
  }

  private async submit(): Promise<void> {
    const opts = this.options();
    this.d.close();
    await this.onPrint(opts);
  }
}
