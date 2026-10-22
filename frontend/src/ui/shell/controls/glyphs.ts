const S = (w: number, h: number, body: string, cls = 'ft-th'): string => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${body}</svg>`;
const bar = (x: number, y: number, w: number, h = 1.8): string => `<rect class="th-bar" x="${x}" y="${y}" width="${w}" height="${h}" rx=".6"/>`;
const bars = (x: number, y: number, w: number, n: number, gap = 3.4, last = 1): string => Array.from({ length: n }, (_, i) => bar(x, y + i * gap, i === n - 1 ? w * last : w)).join('');
const PAGE = (w: number, h: number): string => `<rect class="th-page" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="1.5"/>`;

export function pageMargins(t: number, b: number, l: number, r: number): string {
  const k = 3.4;
  return S(30, 38, `${PAGE(30, 38)}<rect class="th-live" x="${(l * k + 0.5).toFixed(1)}" y="${(t * k + 0.5).toFixed(1)}" width="${(29 - (l + r) * k).toFixed(1)}" height="${(37 - (t + b) * k).toFixed(1)}"/>${bars(l * k + 2, t * k + 3, 29 - (l + r) * k - 3, 4)}`);
}

export function pageOrient(land: boolean): string {
  return land ? S(38, 30, `${PAGE(38, 30)}${bars(6, 7, 26, 4)}`) : S(30, 38, `${PAGE(30, 38)}${bars(6, 8, 18, 5)}`);
}

export function pageSize(w: number, h: number): string {
  const k = 38 / Math.max(w, h);
  const pw = Math.max(14, Math.round(w * k)), ph = Math.max(14, Math.round(h * k));
  return S(pw, ph, `${PAGE(pw, ph)}${bars(4, 5, pw - 8, 3, 3.2)}`);
}

export function columnsGlyph(n: number, kind: 'eq' | 'left' | 'right' = 'eq'): string {
  const widths = kind === 'left' ? [10, 20] : kind === 'right' ? [20, 10] : Array.from({ length: n }, () => (26 - (n - 1) * 3) / n);
  let x = 3;
  const cols = widths.map((w) => { const out = bars(x, 6, w - 1, 7, 3.6, 0.7); x += w + 3; return out; }).join('');
  return S(30, 38, `${PAGE(30, 38)}${cols}`);
}

const OUT = (d: string): string => S(24, 24, `<path class="th-ink" d="${d}"/>`, 'ft-th ft-th-shape');
const STAR = '12,2.5 14.9,9 22,9.6 16.6,14.3 18.3,21.3 12,17.6 5.7,21.3 7.4,14.3 2,9.6 9.1,9';

export const SHAPE_GLYPH: Record<string, string> = {
  line: S(24, 24, '<path class="th-ink" d="M4 20L20 4"/>', 'ft-th ft-th-shape'),
  rect: S(24, 24, '<rect class="th-ink" x="3.5" y="6" width="17" height="12"/>', 'ft-th ft-th-shape'),
  roundRect: S(24, 24, '<rect class="th-ink" x="3.5" y="6" width="17" height="12" rx="4"/>', 'ft-th ft-th-shape'),
  ellipse: S(24, 24, '<ellipse class="th-ink" cx="12" cy="12" rx="9" ry="7"/>', 'ft-th ft-th-shape'),
  triangle: OUT('M12 4L20.5 19H3.5z'),
  rightTriangle: OUT('M5 4V19H20z'),
  diamond: OUT('M12 3L21 12L12 21L3 12z'),
  pentagon: OUT('M12 3L21 10L17.5 20.5H6.5L3 10z'),
  hexagon: OUT('M7 4H17L22 12L17 20H7L2 12z'),
  octagon: OUT('M8 3H16L21 8V16L16 21H8L3 16V8z'),
  plus: OUT('M9 3H15V9H21V15H15V21H9V15H3V9H9z'),
  arrowRight: OUT('M3 9H14V4L21 12L14 20V15H3z'),
  arrowLeft: OUT('M21 9H10V4L3 12L10 20V15H21z'),
  arrowUp: OUT('M9 21V10H4L12 3L20 10H15V21z'),
  arrowDown: OUT('M9 3V14H4L12 21L20 14H15V3z'),
  chevron: OUT('M4 5H15L21 12L15 19H4L10 12z'),
  star: S(24, 24, `<polygon class="th-ink" points="${STAR}"/>`, 'ft-th ft-th-shape'),
  heart: OUT('M12 20C4 14 3 9 6 6.5C8.5 4.5 11 6 12 8C13 6 15.5 4.5 18 6.5C21 9 20 14 12 20z'),
  cloud: OUT('M7 18.5A4 4 0 0 1 6.6 10.6A5.5 5.5 0 0 1 17 9.6A4.5 4.5 0 0 1 17 18.5z'),
  callout: OUT('M4 4H20V15H12L7 20V15H4z'),
  textBox: S(24, 24, '<rect class="th-ink" x="3.5" y="4.5" width="17" height="15"/><path class="th-ink" d="M8 9h8M12 9v7"/>', 'ft-th ft-th-shape'),
};

export function wrapGlyph(kind: string): string {
  const text = (ys: number[], x0 = 3, x1 = 21): string => ys.map((y) => bar(x0, y, x1 - x0, 1.6)).join('');
  const box = (x: number, y: number, w: number, h: number, cls = 'th-obj'): string => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
  const body: Record<string, string> = {
    inline: `${text([5, 9])}${bar(3, 13, 6)}${box(10, 11.5, 5, 5)}${bar(16, 13, 5)}${text([18, 21.5])}`,
    square: `${text([4, 8, 12, 16, 20], 3, 21)}${box(9, 7, 7, 9)}`,
    tight: `${text([4, 8, 12, 16, 20], 3, 21)}<ellipse class="th-obj" cx="12.5" cy="11.5" rx="4.5" ry="5"/>`,
    topBottom: `${text([3.5, 7])}${box(8, 10.5, 8, 5)}${text([18, 21.5])}`,
    behind: `${box(7, 6, 10, 12, 'th-obj th-dim')}${text([4, 8, 12, 16, 20])}`,
    front: `${text([4, 8, 12, 16, 20])}${box(7, 6, 10, 12)}`,
  };
  return S(24, 24, body[kind] ?? body.inline, 'ft-th ft-th-wrap');
}

export function coverGlyph(kind: number): string {
  const t = `<rect class="th-title" x="8" y="14" width="24" height="4" rx="1"/>`;
  const parts = [
    `${t}${bar(14, 40, 12, 1.6)}`,
    `${t}${bar(11, 22, 18, 2)}`,
    `${t}${bar(11, 22, 18, 2)}${bar(14, 40, 12, 1.6)}`,
  ];
  return S(40, 52, `${PAGE(40, 52)}${parts[kind] ?? parts[0]}`, 'ft-th ft-th-cover');
}

export function headerGlyph(part: 'header' | 'footer', align: 'left' | 'center' | 'right' | 'none', text = ''): string {
  const w = 14;
  const x = align === 'left' ? 4 : align === 'right' ? 36 - 4 - w : (36 - w) / 2;
  const y = part === 'header' ? 4 : 40;
  const mark = align === 'none' ? '' : text === 'num' ? `<text class="th-num" x="${align === 'left' ? 4 : align === 'right' ? 32 : 18}" y="${y + 3.6}" text-anchor="${align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'}">1</text>` : bar(x, y, w, 2.4).replace('th-bar', 'th-bar th-hot');
  return S(36, 48, `${PAGE(36, 48)}${mark}${bars(5, 12, 26, 7, 3.6, 0.6)}`, 'ft-th ft-th-hf');
}

export function pageNumGlyph(part: 'header' | 'footer', align: 'left' | 'center' | 'right', total: boolean): string {
  const y = part === 'header' ? 5 : 41;
  const x = align === 'left' ? 4 : align === 'right' ? 32 : 18;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  return S(36, 48, `${PAGE(36, 48)}<text class="th-num" x="${x}" y="${y + 2}" text-anchor="${anchor}">${total ? 'Page 1 of 3' : '1'}</text>${bars(5, 12, 26, 7, 3.6, 0.6)}`, 'ft-th ft-th-hf');
}

export function watermarkGlyph(text: string): string {
  return S(36, 48, `${PAGE(36, 48)}${bars(5, 8, 26, 9, 3.6, 0.6)}<text class="th-wm" transform="rotate(-38 18 26)" x="18" y="29" text-anchor="middle">${text}</text>`, 'ft-th ft-th-wm');
}

export function dropCapGlyph(kind: 'none' | 'dropped' | 'margin'): string {
  const rest = (x: number): string => bars(x, 9, 20, 4, 3.4);
  if (kind === 'none') return S(36, 40, `${PAGE(36, 40)}${rest(8)}${bars(8, 22, 20, 4, 3.4)}<path class="th-ink" d="M10 30l16 0" opacity="0"/>`, 'ft-th');
  if (kind === 'dropped') return S(36, 40, `${PAGE(36, 40)}<text class="th-cap" x="6" y="21">A</text>${bars(17, 8, 14, 3, 3.4)}${bars(6, 24, 25, 3, 3.4)}`, 'ft-th');
  return S(36, 40, `${PAGE(36, 40)}<text class="th-cap" x="3" y="21">A</text>${bars(16, 8, 15, 4, 3.4)}${bars(16, 22, 15, 3, 3.4)}`, 'ft-th');
}

export function wordArtGlyph(style: string): string {
  const id = `ft-wa-${style}`;
  const t = (extra: string, cls = ''): string => `<text class="th-wa ${cls}" x="20" y="26" text-anchor="middle" ${extra}>A</text>`;
  const body: Record<string, string> = {
    fill: t('fill="#ED7D31"'),
    outline: t('fill="none" stroke="currentColor" stroke-width="1.1"'),
    shadow: `${t('fill="#000" opacity=".35" transform="translate(1.6 1.6)"')}${t('fill="#44546A"')}`,
    gradient: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4472C4"/><stop offset="1" stop-color="#ED7D31"/></linearGradient></defs>${t(`fill="url(#${id})"`)}`,
    glow: `<defs><filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>${t('fill="#FFC000" filter="url(#' + id + ')"')}${t('fill="#fff" stroke="#ED7D31" stroke-width=".8"')}`,
    retro: `${t('fill="#5B9BD5" transform="translate(2 2)"')}${t('fill="#fff" stroke="#44546A" stroke-width="1"')}`,
  };
  return S(40, 34, body[style] ?? body.fill, 'ft-th ft-th-wa');
}

export function bulletGlyph(ch: string): string {
  const pg = PAGE(44, 34);
  if (!ch) return S(44, 34, `${pg}<text class="th-num" x="22" y="20" text-anchor="middle">None</text>`, 'ft-th ft-th-list');
  return S(44, 34, `${pg}${[0, 1, 2].map((i) => `<text class="th-bul" x="9" y="${11 + i * 9.5}" text-anchor="middle">${ch}</text>${bar(15, 9.4 + i * 9.5, 24, 1.8)}`).join('')}`, 'ft-th ft-th-list');
}

export function numberGlyph(labels: string[]): string {
  if (!labels.length) return bulletGlyph('');
  return S(44, 34, `${PAGE(44, 34)}${labels.map((l, i) => `<text class="th-num" x="14" y="${11 + i * 9.5}" text-anchor="end">${l}</text>${bar(17, 9.4 + i * 9.5, 22, 1.8)}`).join('')}`, 'ft-th ft-th-list');
}

export function multiGlyph(rows: Array<[number, string]>): string {
  return S(44, 40, `${PAGE(44, 40)}${rows.map(([lv, l], i) => `<text class="th-num" x="${4 + lv * 5}" y="${9 + i * 7.4}">${l}</text>${bar(15 + lv * 5, 7.4 + i * 7.4, 26 - lv * 5, 1.6)}`).join('')}`, 'ft-th ft-th-list');
}

export function borderGlyph(which: string): string {
  const d = '<rect class="th-ink th-dim" x="3.5" y="3.5" width="13" height="13" stroke-dasharray="1.6 1.6"/>';
  const line: Record<string, string> = { bottom: 'M3.5 16.5H16.5', top: 'M3.5 3.5H16.5', left: 'M3.5 3.5V16.5', right: 'M16.5 3.5V16.5' };
  const solid = which === 'box' ? '<rect class="th-ink" x="3.5" y="3.5" width="13" height="13" stroke-width="2"/>' : line[which] ? `<path class="th-ink" d="${line[which]}" stroke-width="2.2"/>` : '';
  return S(20, 20, `${d}${solid}`, 'ft-th ft-th-b');
}

export function equationGlyph(html: string): string { return `<span class="ft-th-math">${html}</span>`; }
