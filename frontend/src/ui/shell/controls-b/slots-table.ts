import { tableStyleList } from '../../../editor/dialogs';
import type { TableStyleDef } from '../../../editor/table';
import { onCmdStateChange } from '../cmd';
import { type Ctl, type GItem, type MI, SEP, button, check, colorButton, ed, galleryButton, galleryInline, group3x3, inch, mix, pts, run, schedule, spinner, track } from './kit';
import { type TableFlags, paraAlign, tableFlags } from './state-b';

const S = (c: Ctl): HTMLElement => track(c).root;

const pen = { style: 'solid', width: 0.75, color: '#000000' };
let painter = false;
let lastBorder = 'bottom';

let tfAt = 0;
let tfVal: TableFlags | null = null;
const tf = (): TableFlags | null => {
  const now = performance.now();
  if (now - tfAt > 40) { tfVal = tableFlags(); tfAt = now; }
  return tfVal;
};

const thumb = (o: { header?: string; band?: string; line?: string; mode?: 'grid' | 'rows' | 'none'; headLine?: string }): string => {
  const x0 = 5, y0 = 5, cw = 11.5, ch = 8;
  const line = o.line ?? '#9ca3af';
  let g = `<rect x="0.5" y="0.5" width="55" height="41" rx="3" fill="#ffffff" stroke="#d1d5db"/>`;
  for (let r = 0; r < 4; r++) {
    const fill = r === 0 && o.header ? o.header : o.band && r % 2 === 0 ? o.band : '';
    if (fill) g += `<rect x="${x0}" y="${y0 + r * ch}" width="${cw * 4}" height="${ch}" fill="${fill}"/>`;
  }
  if (o.mode === 'grid') {
    for (let r = 0; r <= 4; r++) g += `<path d="M${x0} ${y0 + r * ch}h${cw * 4}" stroke="${line}" stroke-width="0.8"/>`;
    for (let c = 0; c <= 4; c++) g += `<path d="M${x0 + c * cw} ${y0}v${ch * 4}" stroke="${line}" stroke-width="0.8"/>`;
  } else if (o.mode === 'rows') {
    for (let r = 0; r <= 4; r++) g += `<path d="M${x0} ${y0 + r * ch}h${cw * 4}" stroke="${r === 1 && o.headLine ? o.headLine : line}" stroke-width="${r === 1 && o.headLine ? 1.6 : 0.8}"/>`;
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g += `<rect x="${x0 + c * cw + 2.2}" y="${y0 + r * ch + 3}" width="${c === 0 ? 5.5 : 4}" height="1.6" rx="0.8" fill="${r === 0 && o.header ? '#374151' : '#9ca3af'}" opacity="${r === 0 ? 0.9 : 0.55}"/>`;
  return `<svg viewBox="0 0 56 42" width="56" height="42" aria-hidden="true">${g}</svg>`;
};

const ACCENTS: Array<[string, string, string]> = [['blue', 'Blue', '#2563eb'], ['orange', 'Orange', '#f97316'], ['green', 'Green', '#16a34a'], ['purple', 'Purple', '#9333ea'], ['grey', 'Grey', '#6b7280']];

interface Preset { id: string; name: string; def: TableStyleDef | null; look: string; html: string }

const presets = (): Preset[] => {
  const out: Preset[] = [
    { id: 'look:grid', name: 'Full Grid', def: null, look: 'grid', html: thumb({ mode: 'grid' }) },
    { id: 'look:plain', name: 'No Borders', def: null, look: 'plain', html: thumb({ mode: 'none' }) },
    { id: 'look:rows', name: 'Rows Table', def: null, look: 'rows', html: thumb({ mode: 'rows', headLine: '#374151' }) },
    { id: 'look:banded', name: 'Banded Table', def: null, look: 'banded', html: thumb({ mode: 'grid', band: '#eef2f7', line: '#d1d5db' }) },
    { id: 'look:accent', name: 'Accent Header', def: null, look: 'accent', html: thumb({ mode: 'grid', header: '#f97316', line: '#d1d5db' }) },
  ];
  const cell = (shading: string) => ({ shading, valign: '', borders: null });
  for (const [k, n, c] of ACCENTS) {
    const head = mix(c, '#ffffff', 0.72);
    const band = mix(c, '#ffffff', 0.9);
    out.push({
      id: `Table_Header_${k}`, name: `${n} Header`, look: 'grid',
      def: { look: 'grid', align: '', repeatHeader: false, header: cell(head), firstCol: null, body: cell(''), band: null },
      html: thumb({ mode: 'grid', header: head, line: mix(c, '#ffffff', 0.45) }),
    });
    out.push({
      id: `Table_Banded_${k}`, name: `${n} Banded`, look: 'banded',
      def: { look: 'banded', align: '', repeatHeader: false, header: cell(head), firstCol: null, body: cell(''), band: cell(band) },
      html: thumb({ mode: 'grid', header: head, band, line: mix(c, '#ffffff', 0.55) }),
    });
  }
  return out;
};

let presetCache: Preset[] | null = null;
const allPresets = (): Preset[] => (presetCache ??= presets());

const applyPreset = (p: Preset): void => {
  if (!p.def) { run('table.look', { look: p.look }); return; }
  const e = ed();
  if (!e.styles()[p.id]) e.setStyles({ ...e.styles(), [p.id]: { type: 'table', name: p.name, basedOn: null, next: '', table: p.def as unknown as Record<string, unknown> } });
  run('table.applyStyle', { style: p.id });
};

const savedStyles = (): Array<{ id: string; name: string; def: TableStyleDef }> => {
  try { return tableStyleList(ed()).filter((s) => !allPresets().some((p) => p.id === s.id)); } catch { return []; }
};

const styleItems = (): GItem[] => {
  const items: GItem[] = allPresets().map((p) => ({ id: p.id, name: p.name, title: p.name, thumb: () => p.html, run: () => applyPreset(p), group: 'Built-In' }));
  for (const s of savedStyles()) {
    items.push({ id: `saved:${s.id}`, name: s.name, title: s.name, group: 'Custom', thumb: () => thumb({ mode: s.def.look === 'plain' ? 'none' : s.def.look === 'rows' ? 'rows' : 'grid', header: s.def.header?.shading || (s.def.look === 'accent' ? '#f97316' : ''), band: s.def.band?.shading || (s.def.look === 'banded' ? '#eef2f7' : '') }), run: () => run('table.applyStyle', { style: s.id }) });
  }
  return items;
};

const activeStyle = (): string | null => {
  const f = tf();
  if (!f) return null;
  if (f.tstyle) { const p = allPresets().find((x) => x.id === f.tstyle); if (p) return p.id; return `saved:${f.tstyle}`; }
  return `look:${f.look}`;
};

const borderPresets: Array<{ id: string; name: string; style: string; width: number; color: string }> = [
  { id: 'thin', name: 'Thin line', style: 'solid', width: 0.75, color: '#000000' },
  { id: 'medium', name: 'Medium line', style: 'solid', width: 1.5, color: '#000000' },
  { id: 'thick', name: 'Thick line', style: 'solid', width: 3, color: '#000000' },
  { id: 'grey', name: 'Grey line', style: 'solid', width: 0.75, color: '#9ca3af' },
  { id: 'dashed', name: 'Dashed line', style: 'dashed', width: 1, color: '#000000' },
  { id: 'dotted', name: 'Dotted line', style: 'dotted', width: 1.5, color: '#000000' },
  { id: 'double', name: 'Double line', style: 'double', width: 3, color: '#000000' },
  { id: 'orange', name: 'Orange line', style: 'solid', width: 1.5, color: '#f97316' },
  { id: 'blue', name: 'Blue line', style: 'solid', width: 1.5, color: '#2563eb' },
  { id: 'green', name: 'Green line', style: 'solid', width: 2.25, color: '#16a34a' },
  { id: 'red', name: 'Red dashed', style: 'dashed', width: 1.5, color: '#dc2626' },
  { id: 'purple', name: 'Purple double', style: 'double', width: 3, color: '#9333ea' },
];

const borderThumb = (b: { style: string; width: number; color: string }): string => `<svg viewBox="0 0 56 42" width="56" height="42" aria-hidden="true"><rect x="0.5" y="0.5" width="55" height="41" rx="3" fill="#ffffff" stroke="#d1d5db"/><path d="M10 21h36" stroke="${b.color}" stroke-width="${Math.max(1, Math.min(6, b.width * 1.3))}" ${b.style === 'dashed' ? 'stroke-dasharray="6 3"' : b.style === 'dotted' ? 'stroke-dasharray="1.5 3" stroke-linecap="round"' : ''}/>${b.style === 'double' ? `<path d="M10 ${21 + Math.min(4, b.width)}h36" stroke="${b.color}" stroke-width="${Math.max(1, b.width / 2)}"/>` : ''}</svg>`;

const borderItems = (): GItem[] => borderPresets.map((b) => ({
  id: b.id, name: b.name, title: b.name, thumb: () => borderThumb(b),
  run: () => { pen.style = b.style; pen.width = b.width; pen.color = b.color; painter = true; schedule(); },
}));

const applyBorder = (target: string): void => { lastBorder = target; run('table.borders', { target, style: pen.style, width: pen.width, color: pen.color }); };

const bordersMenu = (): MI[] => [
  ...([['Bottom Border', 'bottom'], ['Top Border', 'top'], ['Left Border', 'left'], ['Right Border', 'right']] as const).map(([n, t]): MI => ({ label: n, run: () => applyBorder(t) })),
  SEP,
  { label: 'No Border', run: () => applyBorder('none') },
  { label: 'All Borders', run: () => applyBorder('all') },
  { label: 'Outside Borders', run: () => applyBorder('outside') },
  { label: 'Inside Borders', run: () => applyBorder('inside') },
  SEP,
  { label: 'Inside Horizontal Border', run: () => applyBorder('insideH') },
  { label: 'Inside Vertical Border', run: () => applyBorder('insideV') },
  SEP,
  { label: 'Reset to Table Look', run: () => applyBorder('clear') },
  { label: 'Borders and Shading...', cmd: 'table.borders' },
];

const styleMenu = (): MI[] => (['solid', 'dashed', 'dotted', 'double'] as const).map((s): MI => ({ label: s[0].toUpperCase() + s.slice(1), radio: true, checked: () => pen.style === s, run: () => { pen.style = s; schedule(); } }));
const weightMenu = (): MI[] => [0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w): MI => ({ label: `${w} pt`, radio: true, checked: () => pen.width === w, run: () => { pen.width = w; schedule(); } }));

let painterKey = '';
let painterWired = false;
const wirePainter = (): void => {
  if (painterWired) return;
  painterWired = true;
  onCmdStateChange(() => {
    if (!painter) return;
    const f = tf();
    const v = ed().view;
    if (!f || !v) { painterKey = ''; return; }
    const key = `${v.state.selection.from}-${v.state.selection.to}-${f.row}-${f.col}`;
    if (key === painterKey) return;
    painterKey = key;
    applyBorder('all');
  });
};

const selectMenu = (): MI[] => (['cell', 'column', 'row', 'table'] as const).map((w): MI => ({ label: `Select ${w[0].toUpperCase()}${w.slice(1)}`, run: () => run('table.select', { what: w }) }));

const sortMenu = (): MI[] => {
  const f = tf();
  const n = Math.min(f?.cols ?? 3, 8);
  const out: MI[] = [];
  for (let c = 1; c <= n; c++) out.push({ label: `Column ${c}, A to Z`, run: () => run('table.sort', { column: c, descending: false }) }, { label: `Column ${c}, Z to A`, run: () => run('table.sort', { column: c, descending: true }) });
  out.push(SEP, { label: 'Sort Table...', cmd: 'table.properties' });
  return out;
};

const GRID: Array<{ id: string; name: string; icon: string; v: string; h: string }> = [
  { id: 'tl', name: 'Align Top Left', icon: 'cellTL', v: '', h: 'left' }, { id: 'tc', name: 'Align Top Center', icon: 'cellTC', v: '', h: 'center' }, { id: 'tr', name: 'Align Top Right', icon: 'cellTR', v: '', h: 'right' },
  { id: 'ml', name: 'Align Center Left', icon: 'cellML', v: 'middle', h: 'left' }, { id: 'mc', name: 'Align Center', icon: 'cellMC', v: 'middle', h: 'center' }, { id: 'mr', name: 'Align Center Right', icon: 'cellMR', v: 'middle', h: 'right' },
  { id: 'bl', name: 'Align Bottom Left', icon: 'cellBL', v: 'bottom', h: 'left' }, { id: 'bc', name: 'Align Bottom Center', icon: 'cellBC', v: 'bottom', h: 'center' }, { id: 'br', name: 'Align Bottom Right', icon: 'cellBR', v: 'bottom', h: 'right' },
];

const unsupported = 'The table model has no total row, last column or banded columns yet.';

export function tableSlots(): Record<string, () => HTMLElement> {
  return {
    'b.t.headerRow': () => S(check({ label: 'Header Row', get: () => !!tf()?.headerRow, set: (on) => { if (on !== !!tf()?.headerRow) run('table.headerRow'); }, enabled: () => !!tf() })),
    'b.t.totalRow': () => S(check({ label: 'Total Row', get: () => false, set: () => undefined, enabled: () => false, desc: unsupported })),
    'b.t.bandRows': () => S(check({ label: 'Banded Rows', get: () => tf()?.look === 'banded', set: (on) => run('table.look', { look: on ? 'banded' : 'grid' }), enabled: () => !!tf() })),
    'b.t.firstCol': () => S(check({ label: 'First Column', get: () => !!tf()?.headerCol, set: (on) => { if (on !== !!tf()?.headerCol) run('table.headerColumn'); }, enabled: () => !!tf() })),
    'b.t.lastCol': () => S(check({ label: 'Last Column', get: () => false, set: () => undefined, enabled: () => false, desc: unsupported })),
    'b.t.bandCols': () => S(check({ label: 'Banded Columns', get: () => false, set: () => undefined, enabled: () => false, desc: unsupported })),
    'b.t.styles': () => S(galleryInline({
      label: 'Table Styles', items: styleItems, tw: 62, th: 50, popCols: 5, popHead: 'Table Styles', active: activeStyle,
      footer: [SEP, { label: 'Modify Table Style...', icon: 'tableStyles', cmd: 'table.saveStyle' }, { label: 'Clear', icon: 'eraser', run: () => run('table.look', { look: 'plain' }) }, { label: 'New Table Style...', icon: 'plus', cmd: 'table.saveStyle' }],
      enabled: () => !!tf(),
    })),
    'b.t.shading': () => S(colorButton({
      label: 'Shading', icon: 'shading', large: true, split: true,
      palette: { onPick: (c) => run('table.shading', { value: c }), none: 'No Color', noneValue: '' },
      apply: (c) => run('table.shading', { value: c }),
      enabled: () => !!tf(),
    })),
    'b.t.borderStyles': () => S(galleryButton({ label: 'Border Styles', icon: 'borderStyle', large: true, items: borderItems, tw: 62, th: 50, popCols: 4, popHead: 'Border Styles', active: () => borderPresets.find((b) => b.style === pen.style && b.width === pen.width && b.color === pen.color)?.id ?? null, enabled: () => !!tf() })),
    'b.t.lineStyle': () => S(button({ label: 'Line Style', icon: 'borderStyle', text: true, menu: styleMenu, dyn: () => ({ label: `Line Style: ${pen.style[0].toUpperCase()}${pen.style.slice(1)}` }) })),
    'b.t.lineWeight': () => S(button({ label: 'Line Weight', icon: 'borderWeight', text: true, menu: weightMenu, dyn: () => ({ label: `Line Weight: ${pen.width} pt` }) })),
    'b.t.penColor': () => S(colorButton({ label: 'Pen Color', icon: 'penColor', text: true, palette: { onPick: (c) => { if (c) { pen.color = c; schedule(); } }, current: () => pen.color }, swatch: () => pen.color })),
    'b.t.borders': () => S((() => { wirePainter(); return button({ label: 'Borders', icon: 'borders', large: true, split: true, run: () => applyBorder(lastBorder), menu: bordersMenu, enabled: () => !!tf() }); })()),
    'b.t.painter': () => S(button({ label: 'Border Painter', icon: 'borderPainter', large: true, run: () => { painter = !painter; painterKey = ''; schedule(); }, checked: () => painter, enabled: () => !!tf() })),
    'b.t.select': () => S(button({ label: 'Select', icon: 'tableSelect', large: true, menu: selectMenu, enabled: () => !!tf() })),
    'b.t.delete': () => S(button({ label: 'Delete', icon: 'deleteTable', large: true, menu: [
      { label: 'Delete Columns', icon: 'deleteColumn', cmd: 'table.deleteColumn' },
      { label: 'Delete Rows', icon: 'deleteRow', cmd: 'table.deleteRow' },
      { label: 'Delete Table', icon: 'deleteTable', cmd: 'table.delete' },
    ], enabled: () => !!tf() })),
    'b.t.autofit': () => S(button({ label: 'AutoFit', icon: 'autofit', large: true, menu: [
      { label: 'AutoFit Contents', cmd: 'table.autofit', params: { mode: 'contents' } },
      { label: 'AutoFit Window', cmd: 'table.autofit', params: { mode: 'window' } },
      { label: 'Fixed Column Width', cmd: 'table.autofit', params: { mode: 'fixed' } },
    ], enabled: () => !!tf() })),
    'b.t.height': () => S(spinner({ label: 'Height:', min: 0, max: 22, step: 0.05, unit: '"', get: () => { const f = tf(); return f ? inch(f.rowHeight) : null; }, set: (v) => run('table.rowHeight', { pt: pts(v) }) })),
    'b.t.width': () => S(spinner({ label: 'Width:', min: 0.1, max: 22, step: 0.05, unit: '"', get: () => { const f = tf(); return f ? inch(f.colWidth) : null; }, set: (v) => run('table.colWidth', { pt: pts(v) }) })),
    'b.t.align': () => S(group3x3({
      label: 'Alignment', cells: GRID.map((g) => ({ id: g.id, name: g.name, icon: g.icon })),
      run: (id) => { const g = GRID.find((x) => x.id === id); if (!g) return; run('table.valign', { value: g.v || 'top' }); run(`paragraph.align.${g.h}`); },
      active: () => { const f = tf(); if (!f) return null; const v = f.valign === 'middle' ? 'middle' : f.valign === 'bottom' ? 'bottom' : ''; const h = paraAlign(); return GRID.find((g) => g.v === v && g.h === (h === 'justify' ? 'left' : h))?.id ?? null; },
      enabled: () => !!tf(),
    })),
    'b.t.sort': () => S(button({ label: 'Sort', icon: 'sort', large: true, menu: sortMenu, enabled: () => !!tf() })),
    'b.t.repeat': () => S(button({ label: 'Repeat Header Rows', icon: 'repeatHeader', text: true, run: () => run('table.repeatHeader', { on: !tf()?.repeat }), checked: () => !!tf()?.repeat, enabled: () => !!tf() })),
  };
}
