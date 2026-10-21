import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { setStyleVar } from '../../ui/dom';
import { toast } from '../../ui/toast';
import { addMenuItems } from './ui';
import { onDocumentLoaded } from './plugins';

const PX = 96 / 72;
const GAP = 24;

interface Sheet { top: number; height: number; width: number }

function sheetsOf(pages: HTMLElement): Sheet[] {
  return Array.from(pages.querySelectorAll<HTMLElement>(':scope > .ft-sheets > .ft-sheet')).map((s) => ({ top: parseFloat(s.style.top) || 0, height: parseFloat(s.style.height) || 0, width: parseFloat(s.style.width) || s.offsetWidth }));
}

export function register(reg: CommandRegistry, ed: DocEditor): void {
  const pages = document.querySelector<HTMLElement>('.ft-editor .ft-pages');
  if (!pages) return;
  const rules = document.createElement('style');
  rules.id = 'ft-multi-page';
  document.head.appendChild(rules);
  let multi = false;
  let fit = 0;
  let before = 1;
  let ruleKey = '';
  let geo = { w: 0, pitch: 0, n: 0 };

  const uniform = (s: Sheet[]): boolean => s.every((x) => Math.abs(x.height - s[0].height) < 0.5 && Math.abs(x.width - s[0].width) < 0.5);

  const measure = (): boolean => {
    const s = sheetsOf(pages);
    if (!s.length || !uniform(s)) return false;
    geo = { w: s[0].width, pitch: s[0].height + GAP, n: s.length };
    return true;
  };

  const paint = (): void => {
    if (!multi) return;
    if (!measure()) { stop(); toast('Multiple pages needs every page to be the same size; it was turned off.', 'info'); return; }
    const key = `${geo.w}|${geo.pitch}|${geo.n}`;
    if (key !== ruleKey) {
      ruleKey = key;
      const out: string[] = [];
      for (let k = 1; k < geo.n; k++) out.push(`.ft-pages[data-multi="on"] > .ft-sheets > .ft-sheet:nth-child(${k + 1}){translate:${(k * (geo.w + GAP)).toFixed(2)}px ${(-k * geo.pitch).toFixed(2)}px}`);
      rules.textContent = out.join('\n');
    }
    setStyleVar(pages, '--mp-w', `${geo.w.toFixed(2)}px`);
    setStyleVar(pages, '--mp-h', `${geo.pitch.toFixed(2)}px`);
    setStyleVar(pages, '--mp-total', `${(geo.n * geo.w + (geo.n - 1) * GAP).toFixed(2)}px`);
    if (pages.dataset.multi !== 'on') pages.dataset.multi = 'on';
  };

  const pag = ed.paginator;
  const beforeMeasure = pag.beforeMeasure;
  pag.beforeMeasure = (root, ratio) => {
    if (pages.dataset.multi === 'on') delete pages.dataset.multi;
    beforeMeasure?.(root, ratio);
  };
  const onLayout = pag.onLayout;
  pag.onLayout = () => {
    if (pages.dataset.multi === 'on') delete pages.dataset.multi;
    onLayout?.();
    paint();
  };

  const fitZoom = (count: number): number => {
    const scroll = pages.closest<HTMLElement>('.ft-scroll');
    const avail = (scroll?.clientWidth ?? window.innerWidth) - 48;
    return Math.max(0.25, Math.min(1, avail / (count * geo.w + (count - 1) * GAP)));
  };

  const start = (count: number): boolean => {
    if (pages.dataset.mode === 'pageless') { toast('Multiple pages works in print layout.', 'info'); return false; }
    if (!measure()) { toast('Multiple pages needs every page to be the same size.', 'info'); return false; }
    if (!multi) before = Number(ed.zoom) || 1;
    multi = true;
    fit = Math.max(1, Math.min(8, Math.round(count) || 2));
    ed.setZoom(fitZoom(Math.min(fit, geo.n)));
    paint();
    return true;
  };

  const stop = (): void => {
    if (!multi) return;
    multi = false;
    delete pages.dataset.multi;
    ed.setZoom(before);
  };

  onDocumentLoaded(() => { if (multi) { multi = false; delete pages.dataset.multi; } });

  reg.register({
    id: 'view.multiPage', label: 'Multiple pages', group: 'View',
    description: 'Show pages side by side, scaled to fit the window, and keep editing; run again to go back to one page.',
    params: [{ name: 'pages', type: 'number', description: 'How many pages to fit across the window (1 to 8, default 2)' }, { name: 'on', type: 'boolean', description: 'Turn on or off instead of toggling' }],
    run: (p) => {
      const want = p.on === undefined ? !multi : !!p.on;
      if (!want) { stop(); return { on: false }; }
      return { on: start(Number(p.pages) || fit || 2), pages: geo.n, zoom: Math.round(ed.zoom * 100) };
    },
  });
  reg.register({
    id: 'view.onePage', label: 'One page', group: 'View', description: 'Leave the multiple-page view and fit one page across the window.',
    run: () => { stop(); return true; },
  });

  let grid = false;
  const applyGrid = (spacing: number): void => {
    const s = ed.section();
    const m = s?.margins;
    setStyleVar(pages, '--grid-step', `${(spacing * PX).toFixed(2)}px`);
    setStyleVar(pages, '--grid-top', `${((m?.top ?? 72) * PX).toFixed(1)}px`);
    setStyleVar(pages, '--grid-bottom', `${((m?.bottom ?? 72) * PX).toFixed(1)}px`);
    setStyleVar(pages, '--grid-left', `${((m?.left ?? 72) * PX).toFixed(1)}px`);
    setStyleVar(pages, '--grid-right', `${((m?.right ?? 72) * PX).toFixed(1)}px`);
  };
  let step = 18;
  reg.register({
    id: 'view.gridlines', label: 'Gridlines', group: 'View',
    description: 'Show or hide gridlines over the page body to line up text, pictures and shapes. Gridlines are not printed.',
    params: [{ name: 'on', type: 'boolean', description: 'Show or hide instead of toggling' }, { name: 'spacing', type: 'number', description: 'Grid spacing in points (default 18)' }],
    run: (p) => {
      if (typeof p.spacing === 'number' && p.spacing >= 4 && p.spacing <= 144) step = p.spacing;
      grid = p.on === undefined ? !grid : !!p.on;
      applyGrid(step);
      if (grid) pages.dataset.grid = 'on'; else delete pages.dataset.grid;
      return { on: grid, spacing: step };
    },
  });
  onDocumentLoaded(() => { if (grid) applyGrid(step); });

  addMenuItems('View', [
    { cmd: 'view.multiPage', label: 'Multiple pages', params: { on: true, pages: 2 } },
    { cmd: 'view.multiPage', label: 'Multiple pages, three across', params: { on: true, pages: 3 } },
    { cmd: 'view.onePage', label: 'One page' },
    { cmd: 'view.gridlines', label: 'Gridlines' },
  ]);
}
