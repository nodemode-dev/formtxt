const THEME = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
export const THEME_NAMES = ['White', 'Black', 'Tan', 'Dark Blue-Gray', 'Blue', 'Orange', 'Gray', 'Gold', 'Light Blue', 'Green'];
const WHITE_TINTS = ['#F2F2F2', '#D9D9D9', '#BFBFBF', '#A6A6A6', '#808080'];
const BLACK_TINTS = ['#7F7F7F', '#595959', '#404040', '#262626', '#0D0D0D'];
const TINT_NAMES = ['Lighter 80%', 'Lighter 60%', 'Lighter 40%', 'Darker 25%', 'Darker 50%'];

export const STANDARD: Array<[string, string]> = [
  ['Dark Red', '#C00000'], ['Red', '#FF0000'], ['Orange', '#FFC000'], ['Yellow', '#FFFF00'], ['Light Green', '#92D050'],
  ['Green', '#00B050'], ['Light Blue', '#00B0F0'], ['Blue', '#0070C0'], ['Dark Blue', '#002060'], ['Purple', '#7030A0'],
];

export const HIGHLIGHTS: Array<[string, string]> = [
  ['Yellow', '#FFFF00'], ['Bright Green', '#00FF00'], ['Turquoise', '#00FFFF'], ['Pink', '#FF00FF'], ['Blue', '#0000FF'],
  ['Red', '#FF0000'], ['Dark Blue', '#000080'], ['Teal', '#008080'], ['Green', '#008000'], ['Violet', '#800080'],
  ['Dark Red', '#800000'], ['Dark Yellow', '#808000'], ['Gray-50%', '#808080'], ['Gray-25%', '#C0C0C0'], ['Black', '#000000'],
];

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const f = (p: number, q: number, t: number): number => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const c = s === 0 ? [l, l, l] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function tints(hex: string): string[] {
  const [h, s, l] = toHsl(rgb(hex));
  return [l * 0.2 + 0.8, l * 0.4 + 0.6, l * 0.6 + 0.4, l * 0.75, l * 0.5].map((v) => fromHsl(h, s, v));
}

export interface Swatch { hex: string; name: string }

export function themeGrid(): Swatch[][] {
  const rows: Swatch[][] = [THEME.map((hex, i) => ({ hex, name: THEME_NAMES[i] }))];
  for (let r = 0; r < 5; r++) {
    rows.push(THEME.map((hex, i) => ({ hex: i === 0 ? WHITE_TINTS[r] : i === 1 ? BLACK_TINTS[r] : tints(hex)[r], name: `${THEME_NAMES[i]}, ${i === 0 ? `Darker ${[5, 15, 25, 35, 50][r]}%` : i === 1 ? `Lighter ${[50, 35, 25, 15, 5][r]}%` : TINT_NAMES[r]}` })));
  }
  return rows;
}

const RECENT_KEY = 'formtxt.recentColors';

export function recentColors(key: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(`${RECENT_KEY}.${key}`) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 10) : []; } catch { return []; }
}

export function pushRecent(key: string, hex: string): string[] {
  const next = [hex, ...recentColors(key).filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 10);
  try { localStorage.setItem(`${RECENT_KEY}.${key}`, JSON.stringify(next)); } catch { void 0; }
  return next;
}
