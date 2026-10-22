import { setValue } from '../../dom';
import { type Ctl, type MI, Pop, SEP, button, check, ed, run, schedule, track } from './kit';
import { shellCommands } from '../cmd';

const S = (c: Ctl): HTMLElement => track(c).root;

const multiOn = (): boolean => !!ed().root.querySelector('[data-multi="on"]');
const rulerOn = (): boolean => !ed().ruler.root.hidden;
const gridOn = (): boolean => !!ed().root.querySelector('[data-grid="on"]');
const navOn = (): boolean => !!shellCommands.get('view.navigationPane')?.checked?.();

const zoomPop = (): Pop => {
  const pop = new Pop('ft-bzoom');
  pop.root.innerHTML = `<div class="ft-bm-head">Zoom to</div>
<div class="ft-bzoom-list">${[200, 100, 75].map((n) => `<button class="ft-bzoom-r" type="button" data-p="${n}" tabindex="-1"><span class="ft-bzoom-dot"></span>${n}%</button>`).join('')}
<button class="ft-bzoom-r" type="button" data-cmd="view.pageWidth" tabindex="-1"><span class="ft-bzoom-dot"></span>Page width</button>
<button class="ft-bzoom-r" type="button" data-cmd="view.onePageZoom" tabindex="-1"><span class="ft-bzoom-dot"></span>Whole page</button>
<button class="ft-bzoom-r" type="button" data-cmd="view.multiPage" data-pages="2" tabindex="-1"><span class="ft-bzoom-dot"></span>Many pages</button></div>
<label class="ft-bzoom-pct">Percent<input type="text" inputmode="numeric" value="100" aria-label="Zoom percent"><span>%</span></label>
<div class="ft-bzoom-prev"><span class="ft-bzoom-page">AaBbCcDd</span></div>
<div class="ft-bzoom-foot"><button class="ft-btn" type="button" data-act="cancel" tabindex="-1">Cancel</button><button class="ft-btn primary" type="button" data-act="ok" tabindex="-1">OK</button></div>`;
  const input = pop.root.querySelector('input') as HTMLInputElement;
  const page = pop.root.querySelector('.ft-bzoom-page') as HTMLElement;
  const dots = Array.from(pop.root.querySelectorAll<HTMLElement>('.ft-bzoom-r'));
  let pending: { cmd?: string; pages?: string; pct?: number } = {};
  const show = (pct: number): void => { page.style.fontSize = `${Math.max(6, Math.round(pct / 100 * 28))}px`; };
  const mark = (b: HTMLElement | null): void => { for (const d of dots) d.classList.toggle('is-on', d === b); };
  pop.root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('.ft-bzoom-r');
    if (r) {
      mark(r);
      if (r.dataset.p) { pending = { pct: Number(r.dataset.p) }; input.value = r.dataset.p; show(Number(r.dataset.p)); }
      else pending = { cmd: r.dataset.cmd, pages: r.dataset.pages };
      return;
    }
    const a = t.closest<HTMLElement>('[data-act]');
    if (!a) return;
    pop.close();
    if (a.dataset.act !== 'ok') return;
    if (pending.cmd) run(pending.cmd, pending.pages ? { on: true, pages: Number(pending.pages) } : undefined);
    else {
      const n = Math.round(Number(input.value.replace('%', '')));
      if (Number.isFinite(n)) run('view.zoom', { percent: Math.max(10, Math.min(500, n)) });
    }
    schedule();
  });
  input.addEventListener('input', () => { pending = {}; mark(null); const n = Number(input.value); if (Number.isFinite(n) && n > 0) show(n); });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); (pop.root.querySelector('[data-act="ok"]') as HTMLElement).click(); } });
  pop.onOpen = () => {
    const pct = Math.round(ed().zoom * 100);
    pending = {};
    setValue(input, String(pct));
    show(pct);
    mark(dots.find((d) => d.dataset.p === String(pct)) ?? null);
  };
  return pop;
};

const multiMenu = (): MI[] => [
  ...[2, 3, 4, 6].map((n): MI => ({ label: `${n} Pages`, run: () => run('view.multiPage', { pages: n, on: true }) })),
  SEP,
  { label: 'Back to One Page', run: () => run('view.multiPage', { on: false }) },
];

export function viewSlots(): Record<string, () => HTMLElement> {
  return {
    'b.immersive': () => S(button({ label: 'Immersive Reader', icon: 'immersive', large: true, run: () => { run('view.read'); run('speech.panel'); } })),
    'b.vertical': () => S(button({ label: 'Vertical', icon: 'pageVertical', large: true, run: () => run('view.multiPage', { on: false }), checked: () => !multiOn() })),
    'b.sideToSide': () => S(button({ label: 'Side to Side', icon: 'pageSide', large: true, run: () => run('view.multiPage', { on: true, pages: 3 }), checked: () => multiOn() })),
    'b.showRuler': () => S(check({ label: 'Ruler', get: rulerOn, set: (on) => { if (on !== rulerOn()) run('view.ruler'); } })),
    'b.showGrid': () => S(check({ label: 'Gridlines', get: gridOn, set: (on) => { if (on !== gridOn()) run('view.gridlines'); } })),
    'b.showNav': () => S(check({ label: 'Navigation Pane', get: navOn, set: (on) => { if (on !== navOn()) run('view.navigationPane'); } })),
    'b.zoom': () => S(button({ label: 'Zoom', icon: 'zoom', large: true, pop: zoomPop })),
    'b.multi': () => S(button({ label: 'Multiple Pages', icon: 'multiPage', text: true, menu: multiMenu })),
    'b.macros': () => S(button({ label: 'Macros', icon: 'macros', large: true, split: true, cmd: 'collab.macros', menu: [
      { label: 'View Macros...', icon: 'macros', cmd: 'collab.macros' },
      { label: 'Record Macro...', icon: 'recordMacro', cmd: 'collab.macro.record' },
      { label: 'Stop Recording', icon: 'stop', cmd: 'collab.macro.stop' },
    ] })),
  };
}
