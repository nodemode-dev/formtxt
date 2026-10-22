import { el, pendingClass, setClass, setHidden, setHtml, setStyleVar, setText, setTitle, type Disposer } from '../dom';
import { chromeIcon } from '../icons-chrome';
import type { Commands } from './cmd';

export type ProofingState = 'clean' | 'issues' | 'checking' | 'off';
export type SaveState = 'saved' | 'saving' | 'unsaved';
export type ViewMode = 'print' | 'read' | 'draft' | 'focus' | 'web';

export interface StatusIds {
  page: string;
  words: string;
  proofing: string;
  language: string;
  accessibility: string;
  tracking: string;
  focus: string;
  read: string;
  print: string;
  web: string;
  zoom: string;
  zoomIn: string;
  zoomOut: string;
}

export const STATUS_IDS: StatusIds = {
  page: 'view.outline',
  words: 'tools.wordCount',
  proofing: 'proofing.editorPanel',
  language: 'proofing.language',
  accessibility: 'access.check',
  tracking: 'review.toggleTracking',
  focus: 'view.focus',
  read: 'view.read',
  print: 'view.print',
  web: 'view.pageless',
  zoom: 'view.zoom',
  zoomIn: 'view.zoomIn',
  zoomOut: 'view.zoomOut',
};

export const SERVICE_NOTE = 'The engine service is not running, so editing works but saving to the library, imports and exports wait for it. Start it with ./formtxt.';

export const ZOOM_MIN = 25;
export const ZOOM_MAX = 300;
export const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300];

export interface StatusDeps {
  commands: Commands;
  ids?: Partial<StatusIds>;
}

const nf = new Intl.NumberFormat('en-US');

const SAVE_TEXT: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving...', unsaved: 'Not saved' };
const SAVE_ICON: Record<SaveState, string> = { saved: 'stSaved', saving: 'stSaving', unsaved: 'stUnsaved' };

export class StatusBar {
  readonly root: HTMLElement;
  private readonly ids: StatusIds;
  private readonly page: HTMLElement;
  private readonly words: HTMLElement;
  private readonly proof: HTMLElement;
  private readonly lang: HTMLElement;
  private readonly access: HTMLElement;
  private readonly track: HTMLElement;
  private readonly saved: HTMLElement;
  private readonly engine: HTMLElement;
  private readonly busy: HTMLElement;
  private readonly views: Record<string, HTMLElement> = {};
  private readonly slider: HTMLInputElement;
  private readonly pct: HTMLButtonElement;
  private readonly zoomPop: HTMLElement;
  private dismiss: Disposer | null = null;
  private pendingZoom = 0;
  private zoomFrame = 0;
  private zoomValue = 100;

  constructor(host: HTMLElement, private readonly d: StatusDeps) {
    this.ids = { ...STATUS_IDS, ...d.ids };
    const seg = (cls: string, inner = ''): string => `<button class="ft-st-seg ${cls}" type="button">${inner}</button>`;
    this.root = el<HTMLElement>(
      '<footer class="ft-status">' +
      '<div class="ft-st-left">' +
      seg('ft-st-page', '<span class="ft-st-text"></span>') +
      seg('ft-st-words', '<span class="ft-st-text"></span>') +
      seg('ft-st-proof', '<span class="ft-st-ico"></span><span class="ft-st-text"></span>') +
      seg('ft-st-lang', `<span class="ft-st-ico">${chromeIcon('stLanguage', 14)}</span><span class="ft-st-text"></span>`) +
      seg('ft-st-access', '<span class="ft-st-ico"></span><span class="ft-st-text"></span>') +
      seg('ft-st-track', `<span class="ft-st-ico">${chromeIcon('stTrack', 14)}</span><span class="ft-st-text">Tracking on</span>`) +
      '<span class="ft-st-seg ft-st-saved"><span class="ft-st-ico"></span><span class="ft-st-text"></span></span>' +
      '<span class="ft-st-seg ft-st-engine"><i class="ft-dot"></i><span class="ft-st-text"></span></span>' +
      '</div>' +
      `<div class="ft-st-fill"><span class="ft-st-busy" role="status"><span class="ft-st-spin">${chromeIcon('stBusy', 12)}</span><span class="ft-st-busy-text">Working</span><span class="ft-st-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></span></span></div>` +
      '<div class="ft-st-right">' +
      `<button class="ft-st-view ft-st-focus" type="button" data-view="focus" title="Focus">${chromeIcon('stFocus', 14)}<span class="ft-st-vlabel">Focus</span></button>` +
      '<span class="ft-st-views" role="group" aria-label="View">' +
      `<button class="ft-st-view" type="button" data-view="read" title="Read mode" aria-label="Read mode">${chromeIcon('stRead', 14)}</button>` +
      `<button class="ft-st-view" type="button" data-view="print" title="Print layout" aria-label="Print layout">${chromeIcon('stPrint', 14)}</button>` +
      `<button class="ft-st-view" type="button" data-view="web" title="Web layout" aria-label="Web layout">${chromeIcon('stWeb', 14)}</button>` +
      '</span>' +
      '<span class="ft-st-zoom">' +
      `<button class="ft-st-zbtn" type="button" data-z="out" title="Zoom out" aria-label="Zoom out">${chromeIcon('stMinus', 14)}</button>` +
      `<input class="ft-st-slider" type="range" min="${ZOOM_MIN}" max="${ZOOM_MAX}" step="5" value="100" aria-label="Zoom">` +
      `<button class="ft-st-zbtn" type="button" data-z="in" title="Zoom in" aria-label="Zoom in">${chromeIcon('stPlus', 14)}</button>` +
      '<button class="ft-st-pct" type="button" title="Zoom" aria-haspopup="menu">100%</button>' +
      '<div class="ft-st-zpop" role="menu" hidden></div>' +
      '</span>' +
      '</div>' +
      '</footer>');
    const r = this.root;
    const f = <T extends HTMLElement>(s: string): T => r.querySelector(s) as T;
    this.page = f('.ft-st-page');
    this.words = f('.ft-st-words');
    this.proof = f('.ft-st-proof');
    this.lang = f('.ft-st-lang');
    this.access = f('.ft-st-access');
    this.track = f('.ft-st-track');
    this.saved = f('.ft-st-saved');
    this.engine = f('.ft-st-engine');
    this.busy = f('.ft-st-busy');
    this.slider = f('.ft-st-slider');
    this.pct = f('.ft-st-pct');
    this.zoomPop = f('.ft-st-zpop');
    for (const b of Array.from(r.querySelectorAll<HTMLElement>('.ft-st-view'))) this.views[b.dataset.view ?? ''] = b;
    for (const p of ZOOM_PRESETS) this.zoomPop.append(el(`<button class="ft-st-zopt" type="button" role="menuitem" data-pct="${p}">${p}%</button>`));

    const go = (id: string, params?: Record<string, unknown>): void => { d.commands.run(id, params); };
    this.page.addEventListener('click', () => go(this.ids.page));
    this.words.addEventListener('click', () => go(this.ids.words));
    this.proof.addEventListener('click', () => go(this.ids.proofing));
    this.lang.addEventListener('click', () => go(this.ids.language));
    this.access.addEventListener('click', () => go(this.ids.accessibility));
    this.track.addEventListener('click', () => go(this.ids.tracking));
    this.views.focus.addEventListener('click', () => go(this.ids.focus));
    this.views.read.addEventListener('click', () => go(this.ids.read));
    this.views.print.addEventListener('click', () => go(this.ids.print));
    this.views.web.addEventListener('click', () => go(this.ids.web));
    (f('[data-z="out"]')).addEventListener('click', () => go(this.ids.zoomOut));
    (f('[data-z="in"]')).addEventListener('click', () => go(this.ids.zoomIn));
    this.slider.addEventListener('input', () => {
      this.pendingZoom = Number(this.slider.value);
      setText(this.pct, `${this.pendingZoom}%`);
      if (this.zoomFrame) return;
      this.zoomFrame = requestAnimationFrame(() => {
        this.zoomFrame = 0;
        go(this.ids.zoom, { percent: this.pendingZoom });
      });
    });
    this.pct.addEventListener('click', () => this.toggleZoomPop());
    this.zoomPop.addEventListener('click', (e) => {
      const o = (e.target as Element).closest<HTMLElement>('[data-pct]');
      if (!o) return;
      this.closeZoomPop();
      go(this.ids.zoom, { percent: Number(o.dataset.pct) });
    });
    document.addEventListener('pointerdown', (e) => { if (!this.zoomPop.hidden && !(e.target as Element).closest('.ft-st-zoom')) this.closeZoomPop(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.zoomPop.hidden) this.closeZoomPop(); });

    this.setPage(1, 1);
    this.setWords(0, 0);
    this.setProofing('off', 0);
    this.setLanguage('English');
    this.setAccessibility(true, 0);
    this.setTracking(false);
    this.setSaved('saved');
    this.setEngine('Engine', false);
    this.setView('print');
    this.setZoom(100);
    host.append(this.root);
  }

  setPage(cur: number, total: number): void {
    setText(this.page.querySelector('.ft-st-text'), `Page ${nf.format(cur)} of ${nf.format(total)}`);
    setTitle(this.page, 'Navigation: show the document outline');
  }

  setWords(total: number, selected = 0): void {
    const one = (n: number): string => `${nf.format(n)} ${n === 1 ? 'word' : 'words'}`;
    setText(this.words.querySelector('.ft-st-text'), selected > 0 ? `${nf.format(selected)} of ${one(total)}` : one(total));
    setTitle(this.words, 'Word count');
  }

  setProofing(state: ProofingState, count = 0): void {
    const icon = state === 'issues' ? 'stProofIssue' : state === 'off' ? 'stProofOff' : 'stProofOk';
    setHtml(this.proof.querySelector('.ft-st-ico') as HTMLElement, chromeIcon(icon, 14), icon);
    setText(this.proof.querySelector('.ft-st-text'), state === 'issues' ? String(count) : '');
    setClass(this.proof, 'is-warn', state === 'issues');
    setTitle(this.proof, state === 'issues' ? `Proofing: ${count} ${count === 1 ? 'issue' : 'issues'}. Open the Editor` : state === 'clean' ? 'Proofing: no issues found' : state === 'checking' ? 'Proofing: checking' : 'Proofing is off');
  }

  setLanguage(name: string): void {
    setText(this.lang.querySelector('.ft-st-text'), name);
    setTitle(this.lang, `Language: ${name}`);
  }

  setAccessibility(ok: boolean, count = 0): void {
    const icon = ok ? 'stAccess' : 'stAccessWarn';
    setHtml(this.access.querySelector('.ft-st-ico') as HTMLElement, chromeIcon(icon, 14), icon);
    setText(this.access.querySelector('.ft-st-text'), ok ? 'Accessibility: Good to go' : 'Accessibility: Investigate');
    setClass(this.access, 'is-warn', !ok);
    setTitle(this.access, ok ? 'Accessibility checker: good to go' : `Accessibility checker: ${count} ${count === 1 ? 'item' : 'items'} to investigate`);
  }

  setTracking(on: boolean): void {
    setClass(this.track, 'is-off', !on);
    setClass(this.track, 'is-on', on);
    this.track.tabIndex = on ? 0 : -1;
    setTitle(this.track, on ? 'Tracking is on. Click to stop' : '');
  }

  setSaved(state: SaveState): void {
    setHtml(this.saved.querySelector('.ft-st-ico') as HTMLElement, chromeIcon(SAVE_ICON[state], 14), state);
    setText(this.saved.querySelector('.ft-st-text'), SAVE_TEXT[state]);
    setClass(this.saved, 'is-saving', state === 'saving');
    setClass(this.saved, 'is-warn', state === 'unsaved');
  }

  setEngine(text: string, ok: boolean, note?: string): void {
    setText(this.engine.querySelector('.ft-st-text'), text);
    setClass(this.engine.querySelector('.ft-dot'), 'ok', ok);
    setClass(this.engine.querySelector('.ft-dot'), 'bad', !ok);
    setTitle(this.engine, note ?? (ok ? '' : SERVICE_NOTE));
  }

  setView(mode: ViewMode | string, pageless = false): void {
    const web = mode === 'web' || pageless;
    const current = web ? 'web' : mode;
    for (const [k, b] of Object.entries(this.views)) {
      const on = k === current;
      setClass(b, 'is-on', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    }
  }

  setZoom(pct: number): void {
    const v = Math.round(pct);
    this.zoomValue = v;
    if (document.activeElement !== this.slider) {
      const s = String(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v)));
      if (this.slider.value !== s) this.slider.value = s;
    }
    setText(this.pct, `${v}%`);
    this.slider.setAttribute('aria-valuetext', `${v} percent`);
    for (const o of Array.from(this.zoomPop.children) as HTMLElement[]) setClass(o, 'is-on', Number(o.dataset.pct) === v);
  }

  setBusy(on: boolean, label = 'Working', done = 0, total = 0): void {
    setText(this.busy.querySelector('.ft-st-busy-text'), label);
    const bar = this.busy.querySelector('.ft-st-bar') as HTMLElement;
    const known = total > 0;
    const p = known ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    setClass(bar, 'is-indeterminate', !known);
    setStyleVar(bar, '--p', `${p}%`);
    if (known && bar.getAttribute('aria-valuenow') !== String(p)) bar.setAttribute('aria-valuenow', String(p));
    if (on && !this.dismiss) this.dismiss = pendingClass(this.busy);
    else if (!on && this.dismiss) { this.dismiss(); this.dismiss = null; }
  }

  get zoom(): number { return this.zoomValue; }

  private toggleZoomPop(): void {
    setHidden(this.zoomPop, !this.zoomPop.hidden);
  }

  private closeZoomPop(): void {
    setHidden(this.zoomPop, true);
  }
}
