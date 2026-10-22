import { commands } from '../../engine/registry';
import { THEMES, applyTheme, isLightTheme, readChoice, setTheme } from '../themes';

export type UiFontSize = 'small' | 'default' | 'large' | 'larger';

export interface Prefs {
  homeAtLaunch: boolean;
  uiFontSize: UiFontSize;
  reduceMotion: boolean;
  themeAuto: boolean;
  themeLight: string;
  themeDark: string;
  gridlines: boolean;
  gridSpacing: number;
  startZoom: number;
}

export const PREFS_KEY = 'formtxt.prefs';
export const RAIL_KEY = 'formtxt.prefsRailCollapsed';
export const SPOT_KEY = 'formtxt.dialogSpots';

export const UI_FONT_SIZES: ReadonlyArray<readonly [UiFontSize, string]> = [['small', 'Small'], ['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']];
export const UI_FONT_SCALE: Record<UiFontSize, number> = { small: 0.9, default: 1, large: 1.15, larger: 1.3 };
export const ZOOM_CHOICES: ReadonlyArray<readonly [string, string]> = [['50', '50%'], ['75', '75%'], ['90', '90%'], ['100', '100%'], ['110', '110%'], ['125', '125%'], ['150', '150%'], ['200', '200%']];
const FONT_BASE = [11, 12, 13, 14, 16, 20];

export const DEFAULT_PREFS: Prefs = {
  homeAtLaunch: true,
  uiFontSize: 'default',
  reduceMotion: false,
  themeAuto: false,
  themeLight: 'light',
  themeDark: 'studio',
  gridlines: false,
  gridSpacing: 18,
  startZoom: 100,
};

const flag = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function loadPrefs(): Prefs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    const r = plain(parsed) ? parsed : {};
    const light = typeof r.themeLight === 'string' && THEMES[r.themeLight] && isLightTheme(r.themeLight) ? r.themeLight : DEFAULT_PREFS.themeLight;
    const dark = typeof r.themeDark === 'string' && THEMES[r.themeDark] && !isLightTheme(r.themeDark) ? r.themeDark : DEFAULT_PREFS.themeDark;
    return {
      homeAtLaunch: flag(r.homeAtLaunch, DEFAULT_PREFS.homeAtLaunch),
      uiFontSize: UI_FONT_SIZES.some(([k]) => k === r.uiFontSize) ? (r.uiFontSize as UiFontSize) : DEFAULT_PREFS.uiFontSize,
      reduceMotion: flag(r.reduceMotion, DEFAULT_PREFS.reduceMotion),
      themeAuto: flag(r.themeAuto, DEFAULT_PREFS.themeAuto),
      themeLight: light,
      themeDark: dark,
      gridlines: flag(r.gridlines, DEFAULT_PREFS.gridlines),
      gridSpacing: num(r.gridSpacing, 4, 144, DEFAULT_PREFS.gridSpacing),
      startZoom: ZOOM_CHOICES.some(([k]) => k === String(r.startZoom)) ? Number(r.startZoom) : DEFAULT_PREFS.startZoom,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { void 0; }
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const p = { ...loadPrefs(), ...patch };
  savePrefs(p);
  return p;
}

function applyFontSize(p: Prefs): void {
  const k = UI_FONT_SCALE[p.uiFontSize];
  const s = document.documentElement.style;
  for (const n of FONT_BASE) {
    const name = `--ft-${n}`;
    if (k === 1) { if (s.getPropertyValue(name)) s.removeProperty(name); continue; }
    const v = `${Math.round(n * k * 10) / 10}px`;
    if (s.getPropertyValue(name) !== v) s.setProperty(name, v);
  }
}

function applyMotion(p: Prefs): void {
  const root = document.documentElement;
  if (p.reduceMotion) { if (root.getAttribute('data-motion') !== 'reduced') root.setAttribute('data-motion', 'reduced'); } else if (root.hasAttribute('data-motion')) root.removeAttribute('data-motion');
}

let scheme: MediaQueryList | null = null;
let schemeListener: (() => void) | null = null;

function followSystemTheme(p: Prefs): void {
  if (typeof matchMedia !== 'function') return;
  scheme ??= matchMedia('(prefers-color-scheme: dark)');
  if (schemeListener) { scheme.removeEventListener('change', schemeListener); schemeListener = null; }
  if (!p.themeAuto) return;
  const pick = (): void => {
    const now = loadPrefs();
    const id = scheme?.matches ? now.themeDark : now.themeLight;
    if (readChoice().theme !== id) setTheme(id);
  };
  schemeListener = pick;
  scheme.addEventListener('change', pick);
  pick();
}

let launched = false;

function hideHome(): void {
  const find = (): HTMLElement | null => document.querySelector<HTMLElement>('.ft-home');
  const found = find();
  if (found) { if (!found.hidden) found.hidden = true; return; }
  const watch = new MutationObserver(() => {
    const home = find();
    if (!home) return;
    watch.disconnect();
    home.hidden = true;
  });
  watch.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => watch.disconnect(), 8000);
}

let appliedGrid = '';

function runCommand(id: string, params: Record<string, unknown>): void {
  if (!commands.has(id)) return;
  void commands.run(id, params).catch(() => undefined);
}

export function applyPrefs(): void {
  const p = loadPrefs();
  applyTheme();
  applyFontSize(p);
  applyMotion(p);
  followSystemTheme(p);
  const grid = p.gridlines ? `on:${p.gridSpacing}` : 'off';
  if (grid !== appliedGrid) {
    const first = appliedGrid === '';
    appliedGrid = grid;
    if (!first || p.gridlines) runCommand('view.gridlines', { on: p.gridlines, spacing: p.gridSpacing });
  }
  if (!launched) {
    launched = true;
    if (!p.homeAtLaunch) hideHome();
    if (p.startZoom !== 100) runCommand('view.zoom', { percent: p.startZoom });
  }
}
