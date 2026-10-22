import { SHAPES, SHAPE_LABELS, WORDART, shapePath } from '../../../editor/shape';
import { type Ctl, type GItem, type Info, type MI, SEP, button, colorButton, galleryButton, galleryInline, inch, pts, run, spinner, track } from './kit';
import { positionItems, rotateMenu, wrapMenu } from './obj-b';

const S = (c: Ctl): HTMLElement => {
  const prev = c.patch;
  c.patch = (i) => { shCache = i['shape.info'] ?? shCache; prev?.(i); };
  return track(c).root;
};
const NEED = ['shape.info'];
const sh = (i: Info): Info | null => i['shape.info'] ?? null;
const on = (i: Info): boolean => !!sh(i);

const svgShape = (kind: string, fill: string, stroke: string, w = 30, h = 22, sw = 1.4, extra = ''): string => {
  if (kind === 'line') return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="M3 ${h - 3}L${w - 3} 3" stroke="${stroke}" stroke-width="${sw + 0.6}" fill="none" stroke-linecap="round"/></svg>`;
  if (kind === 'textBox') return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="2 2"/><path d="M7 8h16M7 13h11" stroke="${stroke}" stroke-width="1.2"/></svg>`;
  if (kind === 'wordArt') return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><text x="${w / 2}" y="${h - 4}" text-anchor="middle" font-size="${h - 3}" font-weight="700" font-family="Georgia,serif" fill="${stroke}">A</text></svg>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${shapePath(kind, w, h, sw)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" ${extra}/></svg>`;
};

const BLUE = '#2563eb';
let shCache: Info | null = null;

const kindItems = (cmd: 'insert.shape' | 'shape.kind'): GItem[] => SHAPES.map((k): GItem => ({
  id: k, name: SHAPE_LABELS[k] ?? k, group: k === 'line' || k === 'textBox' || k === 'wordArt' ? 'Lines and Text' : 'Basic Shapes',
  thumb: () => svgShape(k, 'rgba(37,99,235,0.18)', BLUE, 34, 26),
  run: () => run(cmd, { kind: k }),
}));

interface SStyle { id: string; name: string; fill: string; stroke: string; width: number; shadow?: boolean; gradient?: string; text?: string }
const SSTYLES: SStyle[] = [
  { id: 'colorless', name: 'Colorless Outline', fill: '', stroke: '#434343', width: 1.5 },
  { id: 'blue-line', name: 'Blue Outline', fill: '', stroke: '#2563eb', width: 1.5 },
  { id: 'orange-line', name: 'Orange Outline', fill: '', stroke: '#f97316', width: 1.5 },
  { id: 'green-line', name: 'Green Outline', fill: '', stroke: '#16a34a', width: 1.5 },
  { id: 'blue', name: 'Blue Fill', fill: '#2563eb', stroke: '#1d4ed8', width: 1, text: '#ffffff' },
  { id: 'orange', name: 'Orange Fill', fill: '#f97316', stroke: '#c2410c', width: 1, text: '#ffffff' },
  { id: 'green', name: 'Green Fill', fill: '#16a34a', stroke: '#166534', width: 1, text: '#ffffff' },
  { id: 'purple', name: 'Purple Fill', fill: '#9333ea', stroke: '#6b21a8', width: 1, text: '#ffffff' },
  { id: 'dark', name: 'Dark Fill', fill: '#1f2937', stroke: '#111827', width: 1, text: '#ffffff' },
  { id: 'light', name: 'Light Fill', fill: '#e5e7eb', stroke: '#9ca3af', width: 1, text: '#111111' },
  { id: 'shadow-blue', name: 'Blue with Shadow', fill: '#60a5fa', stroke: '#2563eb', width: 1, shadow: true, text: '#111111' },
  { id: 'grad-orange', name: 'Orange Gradient', fill: '#fdba74', stroke: '#f97316', width: 1, gradient: '#f97316', text: '#111111' },
  { id: 'grad-blue', name: 'Blue Gradient', fill: '#93c5fd', stroke: '#2563eb', width: 1, gradient: '#2563eb', text: '#111111' },
  { id: 'thick', name: 'Thick Outline', fill: '#ffffff', stroke: '#111111', width: 3, text: '#111111' },
  { id: 'green-shadow', name: 'Green with Shadow', fill: '#86efac', stroke: '#16a34a', width: 2, shadow: true, text: '#111111' },
  { id: 'rose', name: 'Rose Fill', fill: '#f43f5e', stroke: '#be123c', width: 1, text: '#ffffff' },
];

const applyStyle = (s: SStyle): void => {
  run('shape.fill', { color: s.fill });
  run('shape.outline', { color: s.stroke, width: s.width });
  run('shape.effects', { shadow: !!s.shadow, gradient: s.gradient ?? '' });
  if (s.text) run('shape.textFormat', { color: s.text });
};

const styleItems = (): GItem[] => SSTYLES.map((s): GItem => ({
  id: s.id, name: s.name,
  thumb: () => `<svg viewBox="0 0 54 34" width="54" height="34" aria-hidden="true">${s.gradient ? `<defs><linearGradient id="g${s.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.fill}"/><stop offset="1" stop-color="${s.gradient}"/></linearGradient></defs>` : ''}<rect x="4" y="4" width="46" height="26" rx="4" fill="${s.gradient ? `url(#g${s.id})` : s.fill || 'none'}" stroke="${s.stroke}" stroke-width="${Math.min(3, s.width)}" ${s.shadow ? 'filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.45))"' : ''}/></svg>`,
  run: () => applyStyle(s),
}));

const activeStyle = (i: Info): string | null => {
  const s = sh(i);
  if (!s) return null;
  return SSTYLES.find((x) => x.fill.toLowerCase() === String(s.fill || '').toLowerCase() && x.stroke.toLowerCase() === String(s.stroke || '').toLowerCase() && !!x.shadow === !!s.shadow && (x.gradient ?? '') === String(s.gradient || ''))?.id ?? null;
};

const WA_THUMB: Record<string, string> = {
  fill: 'color:#f97316', outline: 'color:transparent;-webkit-text-stroke:1.2px #f97316', shadow: 'color:#f97316;text-shadow:2px 2px 2px rgba(0,0,0,0.4)',
  gradient: 'background:linear-gradient(90deg,#f97316,#9333ea);-webkit-background-clip:text;background-clip:text;color:transparent', glow: 'color:#f97316;text-shadow:0 0 6px #fdba74', retro: 'color:#facc15;text-shadow:2px 2px 0 #b91c1c',
};

const wordArtItems = (): GItem[] => WORDART.map((w): GItem => ({
  id: w, name: `WordArt: ${w}`, thumb: () => `<span class="ft-bwa" style="${WA_THUMB[w] ?? ''}">Abc</span>`, run: () => run('shape.wordArt', { style: w }),
}));

const effectsMenu = (): MI[] => [
  { label: 'Shadow', sub: [{ label: 'No Shadow', run: () => run('shape.effects', { shadow: false }) }, { label: 'Soft Shadow', run: () => run('shape.effects', { shadow: true }) }] },
  { label: 'Gradient', sub: [
    { label: 'No Gradient', run: () => run('shape.effects', { gradient: '' }) },
    ...[['Blue', '#2563eb'], ['Orange', '#f97316'], ['Green', '#16a34a'], ['Purple', '#9333ea'], ['Dark', '#111827']].map(([n, c]): MI => ({ label: n, run: () => run('shape.effects', { gradient: c }) })),
  ] },
];

const arrowsMenu = (): MI[] => [
  { label: 'No Arrows', run: () => run('shape.arrows', { start: false, end: false }) },
  { label: 'Arrow at End', run: () => run('shape.arrows', { start: false, end: true }) },
  { label: 'Arrow at Start', run: () => run('shape.arrows', { start: true, end: false }) },
  { label: 'Arrows at Both Ends', run: () => run('shape.arrows', { start: true, end: true }) },
];

const weightMenu = (cmd: string): MI[] => [0.5, 1, 1.5, 2.25, 3, 4.5, 6].map((w): MI => ({ label: `${w} pt`, run: () => run(cmd, { width: w }) }));

const alignMenu = (): MI[] => [
  { head: 'Horizontal' },
  { label: 'Left', run: () => run('shape.textFormat', { align: 'left' }) },
  { label: 'Center', run: () => run('shape.textFormat', { align: 'center' }) },
  { label: 'Right', run: () => run('shape.textFormat', { align: 'right' }) },
  SEP,
  { head: 'Vertical' },
  { label: 'Top', run: () => run('shape.textFormat', { valign: 'top' }) },
  { label: 'Middle', run: () => run('shape.textFormat', { valign: 'middle' }) },
  { label: 'Bottom', run: () => run('shape.textFormat', { valign: 'bottom' }) },
];

const textEffectsMenu = (): MI[] => [
  { label: 'Bold', run: () => run('shape.textFormat', { bold: true }) },
  { label: 'Not Bold', run: () => run('shape.textFormat', { bold: false }) },
  SEP,
  { label: 'Size', sub: [10, 12, 14, 18, 24, 32, 48].map((n): MI => ({ label: `${n} pt`, run: () => run('shape.textFormat', { size: n }) })) },
  { label: 'Font', sub: ['Calibri', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana'].map((n): MI => ({ label: n, run: () => run('shape.textFormat', { font: n }) })) },
];

const dim = (axis: 'width' | 'height') => (i: Info): number | null => { const s = sh(i); return s ? inch(Number(s[axis])) : null; };
const setDim = (axis: 'width' | 'height') => (v: number): void => run('shape.size', { [axis]: pts(v) });

export function shapeSlots(): Record<string, () => HTMLElement> {
  return {
    's.shapes': () => S(galleryInline({ label: 'Insert Shapes', items: () => kindItems('insert.shape'), tw: 36, th: 30, popCols: 8, popHead: 'Insert Shapes' })),
    's.edit': () => S(galleryButton({ label: 'Edit Shape', icon: 'editShape', large: true, items: () => kindItems('shape.kind'), tw: 36, th: 30, popCols: 6, popHead: 'Change Shape', needs: NEED, enabled: on, active: (i) => String(sh(i)?.kind ?? '') || null })),
    's.textbox': () => S(button({ label: 'Text Box', icon: 'textBox', large: true, cmd: 'insert.textBox' })),
    's.styles': () => S(galleryInline({ label: 'Shape Styles', items: styleItems, tw: 58, th: 38, popCols: 4, popHead: 'Shape Styles', needs: NEED, enabled: on, active: activeStyle })),
    's.fill': () => S(colorButton({ label: 'Shape Fill', icon: 'fill', text: true, needs: NEED, enabled: on, swatch: () => '#f97316', palette: { onPick: (c) => run('shape.fill', { color: c }), none: 'No Fill', noneValue: '', current: () => '' } })),
    's.outline': () => S(colorButton({ label: 'Shape Outline', icon: 'shapeOutline', text: true, needs: NEED, enabled: on, swatch: () => '#2563eb', palette: {
      onPick: (c) => run('shape.outline', { color: c }), none: 'No Outline', noneValue: '',
      extras: [{ label: 'Weight', icon: 'borderWeight', menu: () => weightMenu('shape.outline') }, { label: 'Arrows', icon: 'arrows', menu: arrowsMenu }],
    } })),
    's.effects': () => S(button({ label: 'Shape Effects', icon: 'effects', text: true, menu: effectsMenu, needs: NEED, enabled: on })),
    's.arrows': () => S(button({ label: 'Arrows', icon: 'arrows', text: true, menu: arrowsMenu, needs: NEED, enabled: (i) => sh(i)?.kind === 'line' || sh(i)?.kind === 'connector' })),
    's.wordart': () => S(galleryInline({ label: 'WordArt Styles', items: wordArtItems, tw: 46, th: 34, popCols: 6, popHead: 'WordArt Styles', needs: NEED, enabled: on, active: (i) => (sh(i)?.kind === 'wordArt' ? String(sh(i)?.wordart ?? '') || null : null) })),
    's.textFill': () => S(colorButton({ label: 'Text Fill', icon: 'textFill', text: true, needs: NEED, enabled: on, swatch: () => '#111111', palette: { onPick: (c) => run('shape.textFormat', { color: c || '#111111' }) } })),
    's.textEffects': () => S(button({ label: 'Text Effects', icon: 'textEffects', text: true, menu: textEffectsMenu, needs: NEED, enabled: on })),
    's.alignText': () => S(button({ label: 'Align Text', icon: 'alignText', text: true, menu: alignMenu, needs: NEED, enabled: on })),
    's.link': () => S(button({ label: 'Create Link', icon: 'linkBoxes', text: true, cmd: 'shape.link', needs: NEED, enabled: on })),
    's.unlink': () => S(button({ label: 'Break Link', icon: 'unlinkBoxes', text: true, cmd: 'shape.unlink', needs: NEED, enabled: on })),
    's.connect': () => S(button({ label: 'Connect Shapes', icon: 'connector', text: true, cmd: 'shape.connect', needs: NEED, enabled: on })),
    's.position': () => S(galleryButton({ label: 'Position', icon: 'position', large: true, items: () => positionItems('shape', () => shCache), tw: 46, th: 42, popCols: 3, needs: NEED, enabled: on })),
    's.wrap': () => S(button({ label: 'Wrap Text', icon: 'wrapText', large: true, menu: () => wrapMenu('shape', () => String(shCache?.wrap ?? 'front')), needs: NEED, enabled: on, dyn: (i) => { shCache = sh(i); return null; } })),
    's.rotate': () => S(button({ label: 'Rotate', icon: 'rotate', large: true, menu: () => rotateMenu('shape'), needs: NEED, enabled: on })),
    's.height': () => S(spinner({ label: 'Height:', min: 0.05, max: 22, step: 0.1, unit: '"', needs: NEED, get: dim('height'), set: setDim('height') })),
    's.width': () => S(spinner({ label: 'Width:', min: 0.1, max: 8.5, step: 0.1, unit: '"', needs: NEED, get: dim('width'), set: setDim('width') })),
  };
}
