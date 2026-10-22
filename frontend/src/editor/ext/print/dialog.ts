import { Dialog } from '../../../ui/dialog';
import { el, setDisabled, setHidden, setStyleVar, setText, setValue } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { printIcon } from './icons';
import { defaultOptions, selectedPages } from './job';
import { composeSheet, sheetSize } from './layout';
import { pageBuilder, planPages, type PageBuilder, type PrintPlan } from './pages';
import { PAPERS, groupSheets, sheetRun, type PrintOptions } from './ranges';

const paperOptions = PAPERS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');

const HTML = `<div class="ft-pr">
<div class="ft-pr-opts">
<div class="ft-pr-row">
<label class="ft-field"><span class="ft-field-label">Copies</span><input class="ft-input" type="number" min="1" max="99" value="1" data-k="copies"></label>
<p class="ft-note ft-pr-printer">The printer is chosen in your system print window, which opens when you press Print.</p>
</div>
<p class="ft-pr-title">Settings</p>
<label class="ft-field"><span class="ft-field-label">Pages</span><select class="ft-input" data-k="range">
<option value="all" data-t="all">Print all pages</option>
<option value="current" data-t="current">Print current page</option>
<option value="custom">Custom range</option>
<option value="odd">Only print odd pages</option>
<option value="even">Only print even pages</option>
<option value="selection">Print selection</option>
</select></label>
<label class="ft-field"><span class="ft-field-label">Pages to print</span><input class="ft-input" type="text" data-k="pages" placeholder="1-3, 5" spellcheck="false" aria-label="Pages to print"></label>
<p class="ft-pr-error" role="alert" hidden></p>
<label class="ft-field"><span class="ft-field-label">Sides</span><select class="ft-input" data-k="sides">
<option value="one">Print one sided</option>
<option value="two">Print on both sides (the printer flips the page)</option>
<option value="manual">Manually print on both sides</option>
</select></label>
<label class="ft-field"><span class="ft-field-label">Collation</span><select class="ft-input" data-k="collate">
<option value="1">Collated (1, 2, 3  1, 2, 3)</option>
<option value="0">Uncollated (1, 1, 1  2, 2, 2)</option>
</select></label>
<label class="ft-field"><span class="ft-field-label">Orientation</span><select class="ft-input" data-k="orient">
<option value="doc">As the document</option>
<option value="portrait">Portrait</option>
<option value="landscape">Landscape</option>
</select></label>
<label class="ft-field"><span class="ft-field-label">Paper size</span><select class="ft-input" data-k="paper"><option value="doc">As the document</option>${paperOptions}</select></label>
<label class="ft-field"><span class="ft-field-label">Margins</span><select class="ft-input" data-k="margins">
<option value="doc">As the document</option>
<option value="normal">Normal (1 in around the text)</option>
</select></label>
<label class="ft-field"><span class="ft-field-label">Pages per sheet</span><select class="ft-input" data-k="perSheet">
<option value="1">1 page per sheet</option>
<option value="2">2 pages per sheet</option>
<option value="4">4 pages per sheet</option>
</select></label>
<p class="ft-note ft-pr-sum" aria-live="polite"></p>
<p class="ft-note ft-pr-hint"></p>
</div>
<div class="ft-pr-side">
<div class="ft-pr-nav" role="toolbar" aria-label="Preview navigation">
<button class="ft-btn square ghost" type="button" data-nav="prev" aria-label="Previous page" title="Previous page">${printIcon('prev')}</button>
<span class="ft-pr-pageof">Page <input class="ft-input ft-pr-cur" type="number" min="1" value="1" aria-label="Preview page number" data-k="cur"> of <span data-t="total">1</span></span>
<button class="ft-btn square ghost" type="button" data-nav="next" aria-label="Next page" title="Next page">${printIcon('next')}</button>
<span class="ft-pr-grow"></span>
<button class="ft-btn square ghost" type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out">${printIcon('minus')}</button>
<span class="ft-pr-pct" data-t="pct">Fit</span>
<button class="ft-btn square ghost" type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in">${printIcon('plus')}</button>
<button class="ft-btn square ghost" type="button" data-zoom="fit" aria-label="Zoom to fit" title="Zoom to fit" aria-pressed="true">${printIcon('fit')}</button>
</div>
<div class="ft-pr-preview" tabindex="0" aria-label="Print preview"><div class="ft-pr-list"></div><p class="ft-note ft-pr-flow" hidden></p></div>
</div>
</div>`;

export class PrintDialog {
  private readonly d: Dialog;
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly flowNote: HTMLElement;
  private readonly error: HTMLElement;
  private readonly sum: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly cur: HTMLInputElement;
  private readonly pct: HTMLElement;
  private readonly total: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly fitBtn: HTMLButtonElement;
  private readonly printBtn: HTMLButtonElement;
  private readonly k = new Map<string, HTMLInputElement | HTMLSelectElement>();
  private plan: PrintPlan | null = null;
  private builder: PageBuilder | null = null;
  private sig = '';
  private entries: number[][] = [];
  private readonly seen = new Map<number, string>();
  private readonly observer: IntersectionObserver | null;
  private resize: ResizeObserver | null = null;
  private fit = true;
  private zoom = 0.6;
  private scale1 = 0.5;
  private index = 0;
  private raf = 0;

  constructor(private readonly ed: DocEditor, private readonly onPrint: (opts: PrintOptions) => Promise<void>) {
    this.d = new Dialog('Print', 1020);
    this.root = el(HTML);
    this.d.body.appendChild(this.root);
    this.d.body.classList.add('ft-pr-body');
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T;
    this.list = q('.ft-pr-list');
    this.preview = q('.ft-pr-preview');
    this.flowNote = q('.ft-pr-flow');
    this.error = q('.ft-pr-error');
    this.sum = q('.ft-pr-sum');
    this.hint = q('.ft-pr-hint');
    this.cur = q('[data-k="cur"]');
    this.pct = q('[data-t="pct"]');
    this.total = q('[data-t="total"]');
    this.prev = q('[data-nav="prev"]');
    this.next = q('[data-nav="next"]');
    this.fitBtn = q('[data-zoom="fit"]');
    for (const n of Array.from(this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]'))) this.k.set(n.dataset.k as string, n);
    this.d.button('Cancel', 'ghost', () => this.d.close());
    this.printBtn = this.d.button('Print', 'primary', () => { void this.submit(); });
    this.observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.fill(Number((e.target as HTMLElement).dataset.key));
    }, { root: this.preview, rootMargin: '800px 0px' }) : null;
    this.root.addEventListener('input', (e) => {
      if (e.target === this.k.get('pages')) this.set('range', 'custom');
      if (e.target === this.cur) return;
      this.update();
    });
    this.root.addEventListener('change', (e) => {
      if (e.target === this.cur) { this.go(Number(this.cur.value) - 1); return; }
      this.update();
    });
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const nav = t.closest<HTMLElement>('[data-nav]')?.dataset.nav;
      if (nav) this.go(this.index + (nav === 'next' ? 1 : -1));
      const z = t.closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
      if (z) this.zoomTo(z);
    });
    this.preview.addEventListener('scroll', () => {
      window.cancelAnimationFrame(this.raf);
      this.raf = window.requestAnimationFrame(() => this.track());
    }, { passive: true });
    this.preview.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown') { e.preventDefault(); this.go(this.index + 1); }
      else if (e.key === 'PageUp') { e.preventDefault(); this.go(this.index - 1); }
    });
  }

  private get(key: string): string {
    return this.k.get(key)?.value ?? '';
  }

  private set(key: string, value: string): void {
    const n = this.k.get(key);
    if (n && n.value !== value) n.value = value;
  }

  options(): PrintOptions {
    const sides = this.get('sides');
    const perSheet = Number(this.get('perSheet'));
    return {
      range: this.get('range') as PrintOptions['range'],
      pages: this.get('pages'),
      copies: Math.max(1, Math.min(99, Math.floor(Number(this.get('copies'))) || 1)),
      collate: this.get('collate') !== '0',
      sides: sides === 'two' || sides === 'manual' ? sides : 'one',
      perSheet: perSheet === 2 || perSheet === 4 ? perSheet : 1,
      paper: this.get('paper'),
      orient: this.get('orient') as PrintOptions['orient'],
      margins: this.get('margins') as PrintOptions['margins'],
    };
  }

  open(): void {
    const base = defaultOptions();
    this.set('range', base.range);
    this.index = 0;
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
    const flow = plan.mode === 'flow';
    const optionOf = (v: string): HTMLOptionElement | undefined => Array.from((this.k.get('range') as HTMLSelectElement).options).find((o) => o.value === v);
    const off = (v: string, on: boolean): void => { const o = optionOf(v); if (o && o.disabled !== on) o.disabled = on; };
    off('selection', !hasSelection);
    for (const v of ['current', 'custom', 'odd', 'even']) off(v, flow);
    const manual = Array.from((this.k.get('sides') as HTMLSelectElement).options).find((o) => o.value === 'manual');
    if (manual && manual.disabled !== flow) manual.disabled = flow;
    const r = this.get('range');
    if ((flow && r !== 'all' && r !== 'selection') || (!hasSelection && r === 'selection')) this.set('range', 'all');
    if (flow) { this.set('perSheet', '1'); if (this.get('sides') === 'manual') this.set('sides', 'one'); }
    setDisabled(this.k.get('perSheet') as HTMLSelectElement, flow);
    setHidden(this.flowNote, !flow);
    setText(this.flowNote, 'This document has no fixed pages in the current view (pageless or draft), so the browser decides where pages break when it prints. Switch to Print layout to see exact pages here.');
    setHidden(this.list, flow);
    this.sig = '';
    this.builder = flow ? null : pageBuilder(this.ed, plan);
    this.update();
  }

  private fill(index: number): void {
    const node = this.list.children[index] as HTMLElement | undefined;
    const plan = this.plan;
    if (!node || !this.builder || !plan || this.seen.get(index) === this.sig) return;
    const slot = this.entries[index];
    if (!slot) return;
    this.seen.set(index, this.sig);
    const like = slot[0] ?? 0;
    node.querySelector('.ft-pr-scale')?.replaceChildren(composeSheet(this.builder, slot, this.options(), like));
  }

  private fillVisible(): void {
    const box = this.preview.getBoundingClientRect();
    Array.from(this.list.children).forEach((n, i) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      if (r.bottom >= box.top - 800 && r.top <= box.bottom + 800) this.fill(i);
    });
  }

  private scale(): void {
    const plan = this.plan;
    if (!plan || plan.mode === 'flow' || !this.entries.length) return;
    const opts = this.options();
    let mw = 1, mh = 1;
    for (const s of plan.sheets) { const z = sheetSize(s.width, s.height, opts); mw = Math.max(mw, z.w); mh = Math.max(mh, z.h); }
    const availW = Math.max(160, this.preview.clientWidth - 40);
    const availH = Math.max(160, this.preview.clientHeight - 40);
    this.scale1 = Math.min(availW / mw, availH / mh, 1.5);
    const pv = this.fit ? this.scale1 : this.zoom;
    setStyleVar(this.preview, '--pv', pv.toFixed(4));
    setText(this.pct, this.fit ? 'Fit' : `${Math.round(pv * 100)}%`);
    this.fitBtn.setAttribute('aria-pressed', this.fit ? 'true' : 'false');
    if (this.fit) this.go(this.index, false);
  }

  private zoomTo(how: string): void {
    if (how === 'fit') { this.fit = true; this.scale(); return; }
    const base = this.fit ? this.scale1 : this.zoom;
    this.fit = false;
    this.zoom = Math.max(0.1, Math.min(3, base * (how === 'in' ? 1.25 : 0.8)));
    this.scale();
    this.go(this.index, false);
  }

  private go(i: number, smooth = true): void {
    const n = this.list.children.length;
    if (!n) return;
    this.index = Math.max(0, Math.min(n - 1, Number.isFinite(i) ? i : 0));
    const node = this.list.children[this.index] as HTMLElement;
    const box = this.preview.getBoundingClientRect();
    const top = node.getBoundingClientRect().top - box.top + this.preview.scrollTop - 20;
    this.preview.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    this.showIndex();
    this.fill(this.index);
  }

  private showIndex(): void {
    const n = this.list.children.length;
    setValue(this.cur, String(this.index + 1));
    if (this.cur.value !== String(this.index + 1) && document.activeElement !== this.cur) this.cur.value = String(this.index + 1);
    this.cur.max = String(Math.max(1, n));
    setText(this.total, String(Math.max(1, n)));
    setDisabled(this.prev, this.index <= 0);
    setDisabled(this.next, this.index >= n - 1);
  }

  private track(): void {
    const box = this.preview.getBoundingClientRect();
    const mid = box.top + Math.min(box.height * 0.4, 220);
    let best = 0;
    Array.from(this.list.children).forEach((n, i) => { if ((n as HTMLElement).getBoundingClientRect().top <= mid) best = i; });
    if (best !== this.index) { this.index = best; this.showIndex(); }
    this.fillVisible();
  }

  private update(): void {
    const plan = this.plan;
    if (!plan) return;
    const opts = this.options();
    const flow = plan.mode === 'flow';
    const total = plan.sheets.length;
    const t = (v: string): HTMLOptionElement | null => this.root.querySelector(`option[data-t="${v}"]`);
    setText(t('all'), flow ? 'Print the whole document' : `Print all pages (${total})`);
    setText(t('current'), flow ? 'Print current page' : `Print current page (${(this.ed.view ? this.currentIndex(plan) : 0) + 1})`);
    const sidesSel = opts.sides !== 'one';
    setDisabled(this.k.get('collate') as HTMLSelectElement, sidesSel);
    if (sidesSel) this.set('collate', '1');
    setDisabled(this.k.get('pages') as HTMLInputElement, opts.range !== 'custom');
    let error = '';
    let hint = '';
    if (flow) {
      this.entries = [];
      setText(this.sum, `${opts.range === 'selection' ? 'The selected text' : 'The whole document'}, ${opts.copies} ${opts.copies === 1 ? 'copy' : 'copies'}. Page breaks are decided by the browser.`);
    } else {
      const picked = opts.range === 'selection' ? { pages: Array.from({ length: total }, (_, i) => i), error: '' } : selectedPages(this.ed, plan, opts);
      error = opts.range === 'custom' || opts.range === 'even' ? picked.error : '';
      if (!error) {
        const entries = groupSheets(picked.pages, opts.perSheet);
        const run = sheetRun(opts.range === 'selection' ? [] : picked.pages, opts);
        const sheets = run.first.length + (run.second?.length ?? 0);
        if (opts.range === 'selection') setText(this.sum, `The selected text prints as flowing text, ${opts.copies} ${opts.copies === 1 ? 'copy' : 'copies'}.`);
        else {
          const n = picked.pages.length;
          let s = `${n} ${n === 1 ? 'page' : 'pages'} of ${total} on ${entries.length} ${entries.length === 1 ? 'sheet side' : 'sheet sides'}, ${opts.copies} ${opts.copies === 1 ? 'copy' : 'copies'}: ${sheets} printed ${sheets === 1 ? 'side' : 'sides'} in all.`;
          if (run.second) s += ` First the ${run.first.length} front ${run.first.length === 1 ? 'side' : 'sides'}, then you turn the stack over and the ${run.second.length} back ${run.second.length === 1 ? 'side' : 'sides'} print in reverse order.`;
          setText(this.sum, s);
        }
        this.entries = entries;
        this.index = Math.min(this.index, Math.max(0, entries.length - 1));
      }
    }
    if (opts.sides === 'two') hint = 'Print on both sides adds a blank back page after an odd last page. Whether the printer really prints on both sides is set in the system print window.';
    else if (opts.sides === 'manual') hint = 'After the front sides print, a prompt asks you to put the printed pages back in the tray. Then the back sides print.';
    else if (opts.margins === 'normal') hint = 'Normal margins place the text of each page inside 1 in margins by scaling the page down when needed. The document itself is not changed.';
    setText(this.hint, hint);
    setText(this.error, error);
    setHidden(this.error, !error);
    setDisabled(this.printBtn, !!error);
    if (!flow && !error) this.patchPreview(plan, opts);
    this.scale();
    this.showIndex();
  }

  private patchPreview(plan: PrintPlan, opts: PrintOptions): void {
    const sig = `${plan.signature}|${opts.paper}|${opts.orient}|${opts.margins}|${opts.perSheet}|${this.entries.map((e) => e.join('.')).join(',')}`;
    const changed = sig !== this.sig;
    this.sig = sig;
    const want = this.entries.length;
    while (this.list.children.length < want) {
      const n = el('<figure class="ft-pr-sheet"><div class="ft-pr-frame"><div class="ft-pr-scale"></div></div><figcaption class="ft-pr-num"></figcaption></figure>');
      n.dataset.key = String(this.list.children.length);
      this.list.appendChild(n);
    }
    while (this.list.children.length > want) this.list.lastElementChild?.remove();
    Array.from(this.list.children).forEach((n, i) => {
      const node = n as HTMLElement;
      node.dataset.key = String(i);
      const slot = this.entries[i];
      const s = plan.sheets[slot[0]];
      const z = sheetSize(s.width, s.height, opts);
      setStyleVar(node, '--w', String(Math.round(z.w * 100) / 100));
      setStyleVar(node, '--h', String(Math.round(z.h * 100) / 100));
      setText(node.querySelector('.ft-pr-num'), opts.perSheet === 1 ? `Page ${slot[0] + 1}` : `Pages ${slot.map((x) => x + 1).join(', ')}`);
      if (changed) { node.querySelector('.ft-pr-scale')?.replaceChildren(); this.seen.delete(i); }
      this.observer?.observe(node);
    });
    if (changed) {
      this.seen.clear();
      window.requestAnimationFrame(() => this.fillVisible());
    }
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

export class FlipPrompt {
  private readonly d: Dialog;
  private done: ((ok: boolean) => void) | null = null;
  private readonly msg: HTMLElement;

  constructor() {
    this.d = new Dialog('Print the other sides', 460);
    this.msg = el('<p class="ft-note"></p>');
    this.d.body.appendChild(this.msg);
    this.d.button('Cancel', 'ghost', () => this.finish(false));
    this.d.button('Print the other sides', 'primary', () => this.finish(true));
    this.d.root.addEventListener('click', (e) => { const t = e.target as HTMLElement; if (t === this.d.root || t.closest('[data-close]')) this.finish(false); });
  }

  private finish(ok: boolean): void {
    this.d.close();
    const f = this.done;
    this.done = null;
    f?.(ok);
  }

  ask(sheets: number): Promise<boolean> {
    setText(this.msg, `The front sides are printed. Take the ${sheets} ${sheets === 1 ? 'sheet' : 'sheets'} from the output tray and put them back in the paper tray, printed side facing the way your printer needs for the second side (most printers: printed side down, top edge as before). When they are in, press Print the other sides. The back sides print in reverse order so the pages end up in order.`);
    this.d.open();
    return new Promise((resolve) => { this.done = resolve; });
  }
}
