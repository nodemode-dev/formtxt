import { CHART_LABELS } from '../../../editor/chart/chart';
import { CHART_KINDS } from '../../../editor/chart/types';
import { DIAGRAM_CATEGORIES, DIAGRAM_COLORS, DIAGRAM_LAYOUTS, DIAGRAM_STYLES } from '../../../editor/diagram';
import { type Ctl, type GItem, type Info, type MI, button, galleryButton, galleryInline, inch, pts, run, spinner, track } from './kit';
import { wrapMenu } from './obj-b';

let cCache: Info | null = null;
let dCache: Info | null = null;
const S = (c: Ctl): HTMLElement => {
  const prev = c.patch;
  c.patch = (i) => { cCache = i['chart.info'] ?? cCache; dCache = i['diagram.info'] ?? dCache; prev?.(i); };
  return track(c).root;
};
const NEED = ['chart.info'];
const ch = (i: Info): Info | null => i['chart.info'] ?? null;
const on = (i: Info): boolean => !!ch(i);
const opt = (i: Info, k: string): boolean => !!(ch(i)?.options as Record<string, unknown> | undefined)?.[k];

const CSS_COLOR: Record<string, string> = { orange: '#f97316', blue: '#2563eb', teal: '#0d9488', amber: '#f59e0b', rose: '#f43f5e', green: '#16a34a', cyan: '#06b6d4', pink: '#ec4899', violet: '#8b5cf6', gray: '#6b7280' };

const kindThumb = (k: string): string => {
  const c = '#f97316';
  const d = '#2563eb';
  const body: Record<string, string> = {
    bar: `<rect x="5" y="14" width="5" height="10" fill="${c}"/><rect x="13" y="7" width="5" height="17" fill="${c}"/><rect x="21" y="11" width="5" height="13" fill="${c}"/><rect x="29" y="4" width="5" height="20" fill="${c}"/>`,
    hbar: `<rect x="4" y="4" width="20" height="5" fill="${c}"/><rect x="4" y="11" width="30" height="5" fill="${c}"/><rect x="4" y="18" width="14" height="5" fill="${c}"/>`,
    line: `<path d="M4 20L13 11L22 15L34 4" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M4 22L13 18L22 20L34 12" fill="none" stroke="${d}" stroke-width="2" stroke-linejoin="round"/>`,
    area: `<path d="M4 24V16L13 9L22 14L34 5V24Z" fill="${c}" fill-opacity="0.6" stroke="${c}" stroke-width="1.5"/>`,
    donut: `<circle cx="19" cy="14" r="9" fill="none" stroke="${c}" stroke-width="5" stroke-dasharray="30 57"/><circle cx="19" cy="14" r="9" fill="none" stroke="${d}" stroke-width="5" stroke-dasharray="27 57" stroke-dashoffset="-30"/>`,
    radial: `<path d="M19 24A10 10 0 1 1 29 14" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M19 20A6 6 0 1 1 25 14" fill="none" stroke="${d}" stroke-width="3" stroke-linecap="round"/>`,
    number: `<text x="19" y="21" text-anchor="middle" font-size="16" font-weight="700" fill="${c}" font-family="sans-serif">42</text>`,
    gauge: `<path d="M6 22A13 13 0 0 1 32 22" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="4"/><path d="M6 22A13 13 0 0 1 24 10" fill="none" stroke="${c}" stroke-width="4"/>`,
    histogram: `<rect x="4" y="16" width="5" height="8" fill="${c}"/><rect x="9" y="9" width="5" height="15" fill="${c}"/><rect x="14" y="4" width="5" height="20" fill="${c}"/><rect x="19" y="8" width="5" height="16" fill="${c}"/><rect x="24" y="15" width="5" height="9" fill="${c}"/><rect x="29" y="20" width="5" height="4" fill="${c}"/>`,
    dots: `<circle cx="8" cy="18" r="2.5" fill="${c}"/><circle cx="16" cy="9" r="2.5" fill="${c}"/><circle cx="24" cy="14" r="2.5" fill="${d}"/><circle cx="31" cy="6" r="2.5" fill="${d}"/><circle cx="28" cy="20" r="2.5" fill="${c}"/>`,
    compare: `<rect x="5" y="14" width="5" height="10" fill="${c}"/><rect x="13" y="10" width="5" height="14" fill="${c}"/><rect x="21" y="6" width="5" height="18" fill="${c}"/><path d="M5 20L16 13L28 7L34 4" fill="none" stroke="${d}" stroke-width="2"/>`,
    heatmap: [0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((q) => `<rect x="${5 + q * 8}" y="${4 + r * 7}" width="7" height="6" fill="${c}" fill-opacity="${(0.2 + ((r * 4 + q) % 5) * 0.2).toFixed(2)}"/>`)).join(''),
    calendar: [0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4, 5].map((q) => `<rect x="${4 + q * 5.2}" y="${3 + r * 4.4}" width="4.2" height="3.6" fill="${d}" fill-opacity="${(0.15 + ((r * 7 + q * 3) % 6) * 0.15).toFixed(2)}"/>`)).join(''),
  };
  return `<svg viewBox="0 0 38 28" width="38" height="28" aria-hidden="true">${body[k] ?? ''}</svg>`;
};

const typeItems = (): GItem[] => CHART_KINDS.map((k): GItem => ({ id: k, name: CHART_LABELS[k] ?? k, thumb: () => kindThumb(k), run: () => run('chart.kind', { kind: k }) }));

const STYLES: Array<[string, string, string[]]> = [
  ['s1', 'Style 1: Orange and blue', ['orange', 'blue', 'teal', 'amber']],
  ['s2', 'Style 2: Cool', ['blue', 'cyan', 'teal', 'violet']],
  ['s3', 'Style 3: Warm', ['orange', 'amber', 'rose', 'pink']],
  ['s4', 'Style 4: Green', ['green', 'teal', 'cyan', 'blue']],
  ['s5', 'Style 5: Violet', ['violet', 'pink', 'rose', 'orange']],
  ['s6', 'Style 6: Monochrome blue', ['blue']],
  ['s7', 'Style 7: Monochrome orange', ['orange']],
  ['s8', 'Style 8: Grayscale', ['gray']],
];

const styleThumb = (cols: string[]): string => {
  const cs = [0, 1, 2, 3].map((i) => CSS_COLOR[cols[i % cols.length]] ?? '#f97316');
  return `<svg viewBox="0 0 54 38" width="54" height="38" aria-hidden="true"><rect x="3" y="3" width="48" height="32" rx="3" fill="#ffffff" stroke="#d1d5db"/>${cs.map((c, i) => `<rect x="${9 + i * 10}" y="${26 - (8 + ((i * 7) % 4) * 4)}" width="7" height="${8 + ((i * 7) % 4) * 4}" fill="${c}"/>`).join('')}</svg>`;
};

const styleItems = (): GItem[] => STYLES.map(([id, name, cols]): GItem => ({ id, name, thumb: () => styleThumb(cols), run: () => run('chart.style', { colors: cols.join(',') }) }));

const activeStyle = (i: Info): string | null => {
  const d = ch(i)?.data as { series?: Array<{ color?: string }> } | undefined;
  const first = d?.series?.map((s) => s.color).filter(Boolean) ?? [];
  if (!first.length) return null;
  return STYLES.find(([, , cols]) => first.every((c, k) => c === cols[k % cols.length]))?.[0] ?? null;
};

const LAYOUTS: Array<[string, string, Record<string, unknown>]> = [
  ['l1', 'Layout 1: Title and legend', { legend: true, labels: false }],
  ['l2', 'Layout 2: Title, legend and data labels', { legend: true, labels: true }],
  ['l3', 'Layout 3: Data labels only', { legend: false, labels: true }],
  ['l4', 'Layout 4: Clean', { legend: false, labels: false }],
  ['l5', 'Layout 5: Smooth lines with legend', { legend: true, smooth: true, labels: false }],
  ['l6', 'Layout 6: Stacked with legend', { legend: true, stacked: true, labels: false }],
];

const layoutThumb = (o: Record<string, unknown>): string => `<svg viewBox="0 0 54 38" width="54" height="38" aria-hidden="true"><rect x="3" y="3" width="48" height="32" rx="3" fill="#ffffff" stroke="#d1d5db"/><path d="M14 8h26" stroke="#6b7280" stroke-width="2"/><rect x="${o.legend ? 8 : 12}" y="14" width="5" height="14" fill="#f97316"/><rect x="${o.legend ? 16 : 20}" y="19" width="5" height="9" fill="#2563eb"/><rect x="${o.legend ? 24 : 28}" y="12" width="5" height="16" fill="#f97316"/>${o.labels ? '<path d="M8 12h4M16 17h4M24 10h4" stroke="#111" stroke-width="1"/>' : ''}${o.legend ? '<rect x="40" y="16" width="5" height="3" fill="#f97316"/><rect x="40" y="22" width="5" height="3" fill="#2563eb"/>' : ''}</svg>`;

const layoutItems = (): GItem[] => LAYOUTS.map(([id, name, o]): GItem => ({ id, name, thumb: () => layoutThumb(o), run: () => run('chart.options', o) }));

const elementMenu = (): MI[] => [
  { label: 'Chart Title', icon: 'chartTitle', cmd: 'chart.title' },
  { label: 'Data Labels', icon: 'dataLabels', sub: [
    { label: 'None', radio: true, run: () => run('chart.options', { labels: false }) },
    { label: 'Show', radio: true, run: () => run('chart.options', { labels: true }) },
  ] },
  { label: 'Legend', icon: 'legend', sub: [
    { label: 'None', radio: true, run: () => run('chart.options', { legend: false }) },
    { label: 'Show', radio: true, run: () => run('chart.options', { legend: true }) },
  ] },
  { label: 'Lines', icon: 'smooth', sub: [
    { label: 'Straight', radio: true, run: () => run('chart.options', { smooth: false }) },
    { label: 'Smooth', radio: true, run: () => run('chart.options', { smooth: true }) },
  ] },
  { label: 'Series', icon: 'stacked', sub: [
    { label: 'Side by Side', radio: true, run: () => run('chart.options', { stacked: false }) },
    { label: 'Stacked', radio: true, run: () => run('chart.options', { stacked: true }) },
  ] },
  { label: 'Summary Number', icon: 'sigma', sub: ['sum', 'average', 'min', 'max', 'count'].map((f): MI => ({ label: f === 'min' ? 'Minimum' : f === 'max' ? 'Maximum' : f[0].toUpperCase() + f.slice(1), radio: true, run: () => run('chart.options', { fn: f }) })) },
];

const exportMenu = (): MI[] => [
  { label: 'Save as PNG', run: () => run('chart.export', { format: 'png' }) },
  { label: 'Save as SVG', run: () => run('chart.export', { format: 'svg' }) },
];

const sizeGet = (axis: 'width' | 'height') => (i: Info): number | null => { const c = ch(i); return c ? inch(Number(c[axis])) : null; };
const sizeSet = (axis: 'width' | 'height') => (v: number): void => run('chart.size', { [axis]: pts(v) });

const DNEED = ['diagram.info'];
const dg = (i: Info): Info | null => i['diagram.info'] ?? null;
const donn = (i: Info): boolean => !!dg(i);

const layoutShape = (id: string): string => {
  const a = '#f97316';
  const b = '#2563eb';
  const shapes: Record<string, string> = {
    'list-block': `<rect x="4" y="4" width="14" height="9" rx="1.5" fill="${a}"/><rect x="20" y="4" width="14" height="9" rx="1.5" fill="${b}"/><rect x="4" y="15" width="14" height="9" rx="1.5" fill="${b}"/><rect x="20" y="15" width="14" height="9" rx="1.5" fill="${a}"/>`,
    'list-vertical': `<rect x="4" y="3" width="30" height="6" rx="1.5" fill="${a}"/><rect x="4" y="11" width="30" height="6" rx="1.5" fill="${b}"/><rect x="4" y="19" width="30" height="6" rx="1.5" fill="${a}"/>`,
    'process-basic': `<rect x="3" y="9" width="9" height="10" rx="1.5" fill="${a}"/><rect x="15" y="9" width="9" height="10" rx="1.5" fill="${b}"/><rect x="27" y="9" width="9" height="10" rx="1.5" fill="${a}"/>`,
    'process-chevron': `<path d="M3 8h8l4 6-4 6H3l4-6z" fill="${a}"/><path d="M14 8h8l4 6-4 6h-8l4-6z" fill="${b}"/><path d="M25 8h8l4 6-4 6h-8l4-6z" fill="${a}"/>`,
    'cycle-basic': `<circle cx="19" cy="6" r="3.5" fill="${a}"/><circle cx="29" cy="19" r="3.5" fill="${b}"/><circle cx="9" cy="19" r="3.5" fill="${a}"/><path d="M19 11l8 6M25 21H13M11 17l6-6" stroke="currentColor" stroke-opacity="0.4" fill="none"/>`,
    'cycle-radial': `<circle cx="19" cy="14" r="4" fill="${a}"/><circle cx="19" cy="4" r="2.5" fill="${b}"/><circle cx="29" cy="20" r="2.5" fill="${b}"/><circle cx="9" cy="20" r="2.5" fill="${b}"/>`,
    'hier-org': `<rect x="14" y="2" width="10" height="6" rx="1" fill="${a}"/><rect x="3" y="18" width="10" height="6" rx="1" fill="${b}"/><rect x="14" y="18" width="10" height="6" rx="1" fill="${b}"/><rect x="25" y="18" width="10" height="6" rx="1" fill="${b}"/><path d="M19 8v4M8 12h22M8 12v6M19 12v6M30 12v6" stroke="currentColor" stroke-opacity="0.5" fill="none"/>`,
    'hier-horizontal': `<rect x="2" y="10" width="9" height="8" rx="1" fill="${a}"/><rect x="18" y="3" width="9" height="6" rx="1" fill="${b}"/><rect x="18" y="19" width="9" height="6" rx="1" fill="${b}"/><path d="M11 14h3M14 6v16M14 6h4M14 22h4" stroke="currentColor" stroke-opacity="0.5" fill="none"/>`,
    'rel-venn': `<circle cx="14" cy="14" r="9" fill="${a}" fill-opacity="0.55"/><circle cx="24" cy="14" r="9" fill="${b}" fill-opacity="0.55"/>`,
    'matrix-basic': `<rect x="9" y="3" width="9" height="10" fill="${a}"/><rect x="20" y="3" width="9" height="10" fill="${b}"/><rect x="9" y="15" width="9" height="10" fill="${b}"/><rect x="20" y="15" width="9" height="10" fill="${a}"/>`,
    'pyramid-basic': `<path d="M19 2L26 11H12z" fill="${a}"/><path d="M11 13h16l4 6H7z" fill="${b}"/><path d="M6 21h26l3 5H3z" fill="${a}"/>`,
    'timeline-basic': `<path d="M3 14h32" stroke="currentColor" stroke-opacity="0.5" stroke-width="2"/><circle cx="8" cy="14" r="3" fill="${a}"/><circle cx="19" cy="14" r="3" fill="${b}"/><circle cx="30" cy="14" r="3" fill="${a}"/>`,
  };
  return `<svg viewBox="0 0 38 28" width="38" height="28" aria-hidden="true">${shapes[id] ?? ''}</svg>`;
};

const dlayoutItems = (): GItem[] => DIAGRAM_LAYOUTS.map((l): GItem => ({
  id: l.id, name: l.label, group: DIAGRAM_CATEGORIES.find((c) => c.id === l.category)?.label, thumb: () => layoutShape(l.id), run: () => run('diagram.layout', { layout: l.id }),
}));

const DCOL: Record<string, string[]> = {
  colorful: ['#f97316', '#2563eb', '#16a34a'], accent1: ['#f97316'], accent2: ['#2563eb'], accent3: ['#16a34a'], accent4: ['#9333ea'], accent5: ['#f43f5e'], accent6: ['#0d9488'], dark: ['#374151'],
};

const dcolorItems = (): GItem[] => DIAGRAM_COLORS.map((c): GItem => ({
  id: c, name: c === 'colorful' ? 'Colorful' : c === 'dark' ? 'Dark' : `Accent ${c.slice(6)}`,
  thumb: () => `<svg viewBox="0 0 38 20" width="38" height="20" aria-hidden="true">${[0, 1, 2].map((i) => `<rect x="${3 + i * 11}" y="3" width="9" height="14" rx="1.5" fill="${DCOL[c][i % DCOL[c].length]}"/>`).join('')}</svg>`,
  run: () => run('diagram.style', { colors: c }),
}));

const dstyleItems = (): GItem[] => DIAGRAM_STYLES.map((s): GItem => ({
  id: s, name: s[0].toUpperCase() + s.slice(1),
  thumb: () => `<svg viewBox="0 0 38 26" width="38" height="26" aria-hidden="true"><rect x="6" y="5" width="24" height="14" rx="3" fill="${s === 'outline' ? 'none' : '#f97316'}" stroke="#c2410c" stroke-width="1.6" ${s === 'shadow' ? 'filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.5))"' : ''}/></svg>`,
  run: () => run('diagram.style', { style: s }),
}));

const dsize = (axis: 'width' | 'height') => (i: Info): number | null => { const d = dg(i); return d ? inch(Number(d[axis])) : null; };

export function chartSlots(): Record<string, () => HTMLElement> {
  return {
    'c.elements': () => S(button({ label: 'Add Chart Element', icon: 'chartElements', large: true, menu: elementMenu, needs: NEED, enabled: on })),
    'c.layout': () => S(galleryButton({ label: 'Quick Layout', icon: 'quickLayout', large: true, items: layoutItems, tw: 54, th: 38, popCols: 3, popHead: 'Quick Layout', needs: NEED, enabled: on })),
    'c.styles': () => S(galleryInline({ label: 'Chart Styles', items: styleItems, tw: 58, th: 42, popCols: 4, popHead: 'Chart Styles', needs: NEED, enabled: on, active: activeStyle })),
    'c.switch': () => S(button({ label: 'Switch Row/Column', icon: 'switchRowCol', large: true, cmd: 'chart.switchRowColumn', needs: NEED, enabled: on })),
    'c.editData': () => S(button({ label: 'Edit Data', icon: 'chartData', large: true, cmd: 'chart.properties', needs: NEED, enabled: on })),
    'c.refresh': () => S(button({ label: 'Refresh Data', icon: 'refresh', text: true, cmd: 'chart.refreshData', needs: NEED, enabled: on })),
    'c.link': () => S(button({ label: 'Link to Spreadsheet', icon: 'link', text: true, cmd: 'chart.linkSource', needs: NEED, enabled: on })),
    'c.unlink': () => S(button({ label: 'Unlink Data', icon: 'unlink', text: true, cmd: 'chart.unlinkSource', needs: NEED, enabled: on })),
    'c.type': () => S(galleryButton({ label: 'Change Chart Type', icon: 'chart', large: true, items: typeItems, tw: 44, th: 34, popCols: 5, popHead: 'Change Chart Type', needs: NEED, enabled: on, active: (i) => String(ch(i)?.kind ?? '') || null })),
    'c.wrap': () => S(button({ label: 'Wrap Text', icon: 'wrapText', large: true, menu: () => wrapMenu('object', () => String(cCache?.wrap ?? 'inline')), needs: NEED, enabled: on, dyn: (i) => { cCache = ch(i); return null; } })),
    'c.height': () => S(spinner({ label: 'Height:', min: 1, max: 22, step: 0.1, unit: '"', needs: NEED, get: sizeGet('height'), set: sizeSet('height') })),
    'c.width': () => S(spinner({ label: 'Width:', min: 1.7, max: 8.5, step: 0.1, unit: '"', needs: NEED, get: sizeGet('width'), set: sizeSet('width') })),
    'c.export': () => S(button({ label: 'Save as Image', icon: 'download', large: true, menu: exportMenu, needs: NEED, enabled: on })),
    'c.title': () => S(button({ label: 'Chart Title', icon: 'chartTitle', text: true, cmd: 'chart.title', needs: NEED, enabled: on })),
    'c.labels': () => S(button({ label: 'Data Labels', icon: 'dataLabels', text: true, run: () => run('chart.options', { labels: !opt(cCache ?? {}, 'labels') }), checked: (i) => opt(i, 'labels'), needs: NEED, enabled: on })),
    'd.layout': () => S(galleryInline({ label: 'Layouts', items: dlayoutItems, tw: 48, th: 38, popCols: 4, popHead: 'Layouts', needs: DNEED, enabled: donn, active: (i) => String(dg(i)?.layout ?? '') || null })),
    'd.colors': () => S(galleryButton({ label: 'Change Colors', icon: 'palette', large: true, items: dcolorItems, tw: 48, th: 28, popCols: 4, popHead: 'Colors', needs: DNEED, enabled: donn, active: (i) => String(dg(i)?.colors ?? '') || null })),
    'd.styles': () => S(galleryInline({ label: 'IntelligentArt Styles', items: dstyleItems, tw: 48, th: 34, popCols: 3, popHead: 'IntelligentArt Styles', needs: DNEED, enabled: donn, active: (i) => String(dg(i)?.style ?? '') || null })),
    'd.text': () => S(button({ label: 'Text Pane', icon: 'textPane', large: true, cmd: 'diagram.properties', needs: DNEED, enabled: donn })),
    'd.wrap': () => S(button({ label: 'Wrap Text', icon: 'wrapText', large: true, menu: () => wrapMenu('object', () => String(dCache?.wrap ?? 'inline')), needs: DNEED, enabled: donn, dyn: (i) => { dCache = dg(i); return null; } })),
    'd.height': () => S(spinner({ label: 'Height:', min: 1, max: 22, step: 0.1, unit: '"', needs: DNEED, get: dsize('height'), set: (v) => run('diagram.size', { height: pts(v) }) })),
    'd.width': () => S(spinner({ label: 'Width:', min: 1.7, max: 8.5, step: 0.1, unit: '"', needs: DNEED, get: dsize('width'), set: (v) => run('diagram.size', { width: pts(v) }) })),
    'd.reset': () => S(button({ label: 'Reset Graphic', icon: 'refresh', text: true, run: () => { run('diagram.layout', { layout: 'list-block' }); run('diagram.style', { style: 'flat', colors: 'colorful' }); }, needs: DNEED, enabled: donn })),
  };
}
