import { shellCommands } from '../cmd';
import { type Ctl, type GItem, GREYS, HUES, Pop, button, galleryInline, run, schedule, track } from './kit';

const S = (c: Ctl): HTMLElement => track(c).root;

interface Pen { id: string; name: string; tool: 'pen' | 'highlighter'; kind: 'pen' | 'pencil' | 'highlighter'; color: string; width: number }

const BASE: Pen[] = [
  { id: 'pen-black', name: 'Black pen', tool: 'pen', kind: 'pen', color: '#111111', width: 1 },
  { id: 'pen-red', name: 'Red pen', tool: 'pen', kind: 'pen', color: '#dc2626', width: 2 },
  { id: 'pen-blue', name: 'Blue pen', tool: 'pen', kind: 'pen', color: '#2563eb', width: 2 },
  { id: 'pen-green', name: 'Green pen', tool: 'pen', kind: 'pen', color: '#16a34a', width: 2 },
  { id: 'pencil-grey', name: 'Pencil', tool: 'pen', kind: 'pencil', color: '#6b7280', width: 1 },
  { id: 'hl-yellow', name: 'Yellow highlighter', tool: 'highlighter', kind: 'highlighter', color: '#facc15', width: 14 },
  { id: 'hl-green', name: 'Green highlighter', tool: 'highlighter', kind: 'highlighter', color: '#4ade80', width: 14 },
  { id: 'hl-pink', name: 'Pink highlighter', tool: 'highlighter', kind: 'highlighter', color: '#f472b6', width: 14 },
];

const KEY = 'formtxt.pens';
const readCustom = (): Pen[] => {
  try { const raw = localStorage.getItem(KEY); const v = raw ? (JSON.parse(raw) as Pen[]) : []; return Array.isArray(v) ? v.filter((p) => p && typeof p.id === 'string' && typeof p.color === 'string') : []; } catch { return []; }
};
let custom: Pen[] = readCustom();
const saveCustom = (): void => { try { localStorage.setItem(KEY, JSON.stringify(custom)); } catch { void 0; } };

let activePen = '';
let activeTool: 'pen' | 'eraser' | '' = '';

const drawOn = (): boolean => !!shellCommands.get('view.draw')?.checked?.();

const penSvg = (p: Pen): string => {
  const w = p.kind === 'highlighter' ? 8 : Math.max(1.5, Math.min(5, p.width * 1.2 + 1));
  const sample = p.kind === 'highlighter'
    ? `<path d="M3 55h30" stroke="${p.color}" stroke-width="7" stroke-linecap="butt" opacity="0.55"/>`
    : `<path d="M3 56q5-6 9 0t9 0t9 0" fill="none" stroke="${p.color}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
  const body = p.kind === 'pencil'
    ? `<path d="M13 3h10v28l-5 9-5-9z" fill="#fbbf24" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 31l5 9 5-9z" fill="#f3d9b1" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M16.2 36.4l1.8 3.6 1.8-3.6z" fill="${p.color}"/><rect x="13" y="3" width="10" height="5" fill="#f87171" stroke="currentColor" stroke-width="1.2"/>`
    : p.kind === 'highlighter'
      ? `<path d="M11 4h14v22H11z" fill="${p.color}" fill-opacity="0.35" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 26h14l-3 10h-8z" fill="${p.color}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`
      : `<path d="M13 3h10v26l-5 11-5-11z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M14.4 31.5L18 40l3.6-8.5z" fill="${p.color}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><rect x="13" y="3" width="10" height="6" fill="${p.color}" stroke="currentColor" stroke-width="1.2"/>`;
  return `<svg class="ft-bpen" viewBox="0 0 36 62" width="36" height="62" aria-hidden="true">${body}${sample}</svg>`;
};

const penItems = (): GItem[] => [...BASE, ...custom].map((p) => ({
  id: p.id,
  name: p.name,
  title: `${p.name}${p.kind === 'highlighter' ? '' : `, ${p.width} pt`}`,
  thumb: () => penSvg(p),
  run: () => { activePen = p.id; activeTool = 'pen'; run('view.draw', { on: true, tool: p.tool, color: p.color, width: p.width }); schedule(); },
}));

const addPenPop = (): Pop => {
  const pop = new Pop('ft-baddpen');
  let kind: Pen['kind'] = 'pen';
  let color = '#2563eb';
  let width = 2;
  const swatches = [...GREYS.slice(0, 2), ...HUES.slice(0, 8)];
  pop.root.innerHTML = `<div class="ft-bm-head">Add Pen</div>
<div class="ft-baddpen-row" data-k="kind">${(['pen', 'pencil', 'highlighter'] as const).map((k) => `<button type="button" class="ft-baddpen-chip" data-v="${k}" tabindex="-1">${k === 'pen' ? 'Pen' : k === 'pencil' ? 'Pencil' : 'Highlighter'}</button>`).join('')}</div>
<div class="ft-bm-head">Color</div>
<div class="ft-baddpen-row" data-k="color">${swatches.map((c) => `<button type="button" class="ft-bsw" data-v="${c}" style="--sw:${c}" title="${c}" aria-label="${c}" tabindex="-1"></button>`).join('')}</div>
<div class="ft-bm-head">Thickness</div>
<div class="ft-baddpen-row" data-k="width">${[0.5, 1, 2, 4, 8, 14].map((w) => `<button type="button" class="ft-baddpen-w" data-v="${w}" tabindex="-1"><i style="height:${Math.max(1, Math.min(10, w))}px"></i><span>${w}</span></button>`).join('')}</div>
<div class="ft-bzoom-foot"><button class="ft-btn" type="button" data-act="cancel" tabindex="-1">Cancel</button><button class="ft-btn primary" type="button" data-act="add" tabindex="-1">Add</button></div>`;
  const mark = (): void => {
    for (const b of Array.from(pop.root.querySelectorAll<HTMLElement>('[data-v]'))) {
      const k = b.parentElement?.dataset.k;
      const cur = k === 'kind' ? kind : k === 'color' ? color : String(width);
      b.classList.toggle('is-on', b.dataset.v === cur);
    }
  };
  pop.root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLElement>('[data-v]');
    if (v) {
      const k = v.parentElement?.dataset.k;
      if (k === 'kind') { kind = v.dataset.v as Pen['kind']; if (kind === 'highlighter') { width = 14; if (color === '#111111') color = '#facc15'; } else if (width === 14) width = 2; if (kind === 'pencil') color = '#6b7280'; }
      else if (k === 'color') color = v.dataset.v as string;
      else width = Number(v.dataset.v);
      mark();
      return;
    }
    const a = t.closest<HTMLElement>('[data-act]');
    if (!a) return;
    pop.close();
    if (a.dataset.act !== 'add') return;
    const id = `custom-${Date.now().toString(36)}`;
    const name = `${kind === 'pen' ? 'Pen' : kind === 'pencil' ? 'Pencil' : 'Highlighter'} ${custom.length + 1}`;
    const pen: Pen = { id, name, tool: kind === 'highlighter' ? 'highlighter' : 'pen', kind, color, width };
    custom = [...custom, pen];
    saveCustom();
    activePen = id;
    activeTool = 'pen';
    run('view.draw', { on: true, tool: pen.tool, color, width });
    schedule();
  });
  pop.onOpen = mark;
  return pop;
};

export function drawSlots(): Record<string, () => HTMLElement> {
  return {
    'b.pens': () => S(galleryInline({ label: 'Pens', items: penItems, tw: 44, th: 66, popCols: 6, active: () => (drawOn() && activeTool === 'pen' ? activePen : null) })),
    'b.addPen': () => S(button({ label: 'Add Pen', icon: 'addPen', large: true, pop: addPenPop })),
    'b.eraser': () => S(button({ label: 'Eraser', icon: 'eraser', large: true, run: () => { activeTool = 'eraser'; run('view.draw', { on: true, tool: 'eraser' }); schedule(); }, checked: () => drawOn() && activeTool === 'eraser' })),
    'b.select': () => S(button({ label: 'Select', icon: 'selectObjects', large: true, run: () => { activeTool = ''; activePen = ''; run('view.draw', { on: false }); schedule(); }, checked: () => !drawOn() })),
  };
}
