export interface ThemeProfile { label: string; vars: Record<string, string>; light?: boolean }

export const THEMES: Record<string, ThemeProfile> = {
  'studio': { label: 'Studio Dark', vars: { '--bg-primary': '#111111', '--bg-secondary': '#17151b', '--bg-tertiary': '#222127', '--border-color': '#2a2a2a', '--border-light': '#34333a', '--text-primary': '#f7f7f7', '--text-secondary': '#a4a4a4', '--text-muted': '#8a8a8b', '--canvas-bg': '#1c1b1d', '--bg-node': '#191919' } },
  'nodemode-dark': { label: 'NodeMode Dark', vars: { '--bg-primary': '#0a0a0a', '--bg-secondary': '#121218', '--bg-tertiary': '#1a1a24', '--border-color': '#2a2a35', '--border-light': '#3a3a48', '--text-primary': '#e8e8ee', '--text-secondary': '#a8a8b8', '--text-muted': '#7a7a8a', '--canvas-bg': '#0a0a0a' } },
  'light': { label: 'Light', light: true, vars: { '--bg-primary': '#ecebe6', '--bg-secondary': '#f7f6f1', '--bg-tertiary': '#e2e0d8', '--bg-node': '#f4f3ed', '--border-color': '#d1cdc1', '--border-light': '#beb9aa', '--text-primary': '#26241d', '--text-secondary': '#4c4a40', '--text-muted': '#6f6c60', '--canvas-bg': '#e7e5dd' } },
  'github-dark': { label: 'GitHub Dark', vars: { '--bg-primary': '#0d1117', '--bg-secondary': '#161b22', '--bg-tertiary': '#21262d', '--border-color': '#30363d', '--border-light': '#3d444d', '--text-primary': '#e6edf3', '--text-secondary': '#9198a1', '--text-muted': '#7d8590', '--canvas-bg': '#0d1117' } },
  'midnight': { label: 'Midnight Blue', vars: { '--bg-primary': '#0b1020', '--bg-secondary': '#101830', '--bg-tertiary': '#182242', '--border-color': '#25325c', '--border-light': '#324274', '--text-primary': '#e4e9f7', '--text-secondary': '#9fabd0', '--text-muted': '#7886b0', '--canvas-bg': '#0b1020' } },
  'forest': { label: 'Forest', vars: { '--bg-primary': '#0c130e', '--bg-secondary': '#121c15', '--bg-tertiary': '#1a281e', '--border-color': '#2a4030', '--border-light': '#375441', '--text-primary': '#e4efe7', '--text-secondary': '#a4bdac', '--text-muted': '#7f9b89', '--canvas-bg': '#0c130e' } },
  'ember': { label: 'Ember', vars: { '--bg-primary': '#140d0a', '--bg-secondary': '#1d1310', '--bg-tertiary': '#2a1c16', '--border-color': '#452e22', '--border-light': '#5a3d2e', '--text-primary': '#f2e8e2', '--text-secondary': '#c7ab9c', '--text-muted': '#a08777', '--canvas-bg': '#140d0a' } },
  'violet': { label: 'Violet Haze', vars: { '--bg-primary': '#100b1c', '--bg-secondary': '#171129', '--bg-tertiary': '#221a3c', '--border-color': '#382c5e', '--border-light': '#493b78', '--text-primary': '#ece6f9', '--text-secondary': '#b3a6d8', '--text-muted': '#8f82b8', '--canvas-bg': '#100b1c' } },
  'slate': { label: 'Slate', vars: { '--bg-primary': '#101418', '--bg-secondary': '#171d23', '--bg-tertiary': '#212a32', '--border-color': '#32404c', '--border-light': '#415260', '--text-primary': '#e7edf2', '--text-secondary': '#a3b2bf', '--text-muted': '#8191a0', '--canvas-bg': '#101418' } },
  'mono': { label: 'Mono Ink', vars: { '--bg-primary': '#0e0e0e', '--bg-secondary': '#161616', '--bg-tertiary': '#202020', '--border-color': '#333333', '--border-light': '#454545', '--text-primary': '#f0f0f0', '--text-secondary': '#ababab', '--text-muted': '#8a8a8a', '--canvas-bg': '#0e0e0e' } },
  'sand': { label: 'Sand (light)', light: true, vars: { '--bg-primary': '#efe8da', '--bg-secondary': '#f8f3e9', '--bg-tertiary': '#e6dcc8', '--bg-node': '#f5efe2', '--border-color': '#d4c7ab', '--border-light': '#c2b28e', '--text-primary': '#2a2418', '--text-secondary': '#59503c', '--text-muted': '#766b53', '--canvas-bg': '#eae2d1' } },
  'ocean': { label: 'Deep Ocean', vars: { '--bg-primary': '#06131c', '--bg-secondary': '#0a1c29', '--bg-tertiary': '#10293c', '--border-color': '#1d425e', '--border-light': '#285578', '--text-primary': '#e2eef7', '--text-secondary': '#96b6cc', '--text-muted': '#7497ae', '--canvas-bg': '#06131c' } },
  'rose': { label: 'Rose Noir', vars: { '--bg-primary': '#170b10', '--bg-secondary': '#211117', '--bg-tertiary': '#301a22', '--border-color': '#4d2b38', '--border-light': '#653a49', '--text-primary': '#f5e7ec', '--text-secondary': '#cfa5b3', '--text-muted': '#aa8493', '--canvas-bg': '#170b10' } },
  'terminal': { label: 'Terminal Green', vars: { '--bg-primary': '#050d05', '--bg-secondary': '#0a140a', '--bg-tertiary': '#102010', '--border-color': '#1f3d1f', '--border-light': '#2b522b', '--text-primary': '#d8f5d8', '--text-secondary': '#8fce8f', '--text-muted': '#6ca66c', '--canvas-bg': '#050d05' } },
  'contrast': { label: 'High Contrast', vars: { '--bg-primary': '#000000', '--bg-secondary': '#0a0a0a', '--bg-tertiary': '#161616', '--border-color': '#555555', '--border-light': '#777777', '--text-primary': '#ffffff', '--text-secondary': '#d8d8d8', '--text-muted': '#b0b0b0', '--canvas-bg': '#000000' } },
  'nineties': { label: '90s', light: true, vars: { '--bg-primary': '#c0c0c0', '--bg-secondary': '#d4d0c8', '--bg-tertiary': '#b4b0a8', '--bg-node': '#d4d0c8', '--border-color': '#808080', '--border-light': '#ffffff', '--text-primary': '#000000', '--text-secondary': '#202020', '--text-muted': '#484848', '--canvas-bg': '#008080' } },
  'duck': { label: 'Duck', light: true, vars: { '--bg-primary': '#e9e4f7', '--bg-secondary': '#f4f1fc', '--bg-tertiary': '#d9d2ef', '--bg-node': '#f4f1fc', '--border-color': '#c7bde6', '--border-light': '#b3a6dc', '--text-primary': '#2b2540', '--text-secondary': '#4f4770', '--text-muted': '#6b6388', '--canvas-bg': '#e2dcf2' } },
  'pro-dark': { label: 'Pro Dark', vars: { '--bg-primary': '#1f1f1f', '--bg-secondary': '#2b2b2b', '--bg-tertiary': '#363636', '--border-color': '#4a4a4a', '--border-light': '#818181', '--text-primary': '#ececec', '--text-secondary': '#bdbdbd', '--text-muted': '#a0a0a0', '--canvas-bg': '#181818' } },
  'pro-medium-grey': { label: 'Pro Medium Gray', vars: { '--bg-primary': '#3a3a3a', '--bg-secondary': '#454545', '--bg-tertiary': '#505050', '--border-color': '#666666', '--border-light': '#a0a0a0', '--text-primary': '#f4f4f4', '--text-secondary': '#d6d6d6', '--text-muted': '#c3c3c3', '--canvas-bg': '#2e2e2e' } },
  'pro-light-grey': { label: 'Pro Light Gray', light: true, vars: { '--bg-primary': '#b9b9b9', '--bg-secondary': '#c9c9c9', '--bg-tertiary': '#aeaeae', '--border-color': '#8c8c8c', '--border-light': '#5a5a5a', '--text-primary': '#121212', '--text-secondary': '#2a2a2a', '--text-muted': '#414141', '--canvas-bg': '#a4a4a4' } },
  'pro-light': { label: 'Pro Light', light: true, vars: { '--bg-primary': '#e3e3e3', '--bg-secondary': '#f2f2f2', '--bg-tertiary': '#d6d6d6', '--border-color': '#b5b5b5', '--border-light': '#767676', '--text-primary': '#1a1a1a', '--text-secondary': '#383838', '--text-muted': '#545454', '--canvas-bg': '#d0d0d0' } },
  'classic': { label: 'Classic', light: true, vars: { '--bg-primary': '#d1d4d9', '--bg-secondary': '#e1e4e8', '--bg-tertiary': '#c2c6cc', '--border-color': '#9ea4ad', '--border-light': '#666c76', '--text-primary': '#14171c', '--text-secondary': '#2c323a', '--text-muted': '#4a515b', '--canvas-bg': '#c0c4ca' } },
  'solarized-dark': { label: 'Solarized Dark', vars: { '--bg-primary': '#002b36', '--bg-secondary': '#073642', '--bg-tertiary': '#0d4452', '--border-color': '#1b5563', '--border-light': '#768e97', '--text-primary': '#fdf6e3', '--text-secondary': '#bcc6c6', '--text-muted': '#9bb0b3', '--canvas-bg': '#00212b' } },
  'adwaita-light': { label: 'Adwaita Light', light: true, vars: { '--bg-primary': '#ebebeb', '--bg-secondary': '#fafafa', '--bg-tertiary': '#dedde0', '--border-color': '#c0bfbc', '--border-light': '#77767b', '--text-primary': '#241f31', '--text-secondary': '#3d3846', '--text-muted': '#5e5c64', '--canvas-bg': '#f6f5f4' } },
  'adwaita-dark': { label: 'Adwaita Dark', vars: { '--bg-primary': '#242424', '--bg-secondary': '#303030', '--bg-tertiary': '#3a3a3a', '--border-color': '#4a4a4a', '--border-light': '#858585', '--text-primary': '#ffffff', '--text-secondary': '#deddda', '--text-muted': '#b4b3b0', '--canvas-bg': '#1e1e1e' } },
  'breeze-dark': { label: 'Breeze Dark', vars: { '--bg-primary': '#232629', '--bg-secondary': '#31363b', '--bg-tertiary': '#3b4045', '--border-color': '#4d5359', '--border-light': '#828c94', '--text-primary': '#eff0f1', '--text-secondary': '#c5cacd', '--text-muted': '#a4adb3', '--canvas-bg': '#1b1e20' } },
  'soft-light': { label: 'Soft Light', light: true, vars: { '--bg-primary': '#e8ebef', '--bg-secondary': '#f4f6f8', '--bg-tertiary': '#dce0e6', '--border-color': '#c3c9d2', '--border-light': '#777d89', '--text-primary': '#2b323c', '--text-secondary': '#454d59', '--text-muted': '#5b6370', '--canvas-bg': '#dfe3e8' } },
  'soft-dark': { label: 'Soft Dark', vars: { '--bg-primary': '#22262b', '--bg-secondary': '#2b3036', '--bg-tertiary': '#353b43', '--border-color': '#454c56', '--border-light': '#7c8693', '--text-primary': '#e1e6ec', '--text-secondary': '#b9c1cb', '--text-muted': '#9ca6b2', '--canvas-bg': '#1b1e22' } },
};

export const DEFAULT_THEME = 'studio';
export const DEFAULT_ACCENT = '#f97316';
export const DEFAULT_INTENSITY = 1;
export const STORAGE_KEY = 'nodemode_ui_settings';
export const LEGACY_KEY = 'formtxt.theme';
export const APPEARANCE = 3;

export interface ThemeChoice { theme: string; accentColor: string; intensity?: number }

const NAMES = ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--border-color', '--border-light', '--text-primary', '--text-secondary', '--text-muted', '--canvas-bg'];

const clampIntensity = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : DEFAULT_INTENSITY);
const hexOk = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function readChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ThemeChoice> & { appearance?: number };
      if (saved.appearance === APPEARANCE || saved.appearance === 2) {
        return { theme: saved.theme && THEMES[saved.theme] ? saved.theme : DEFAULT_THEME, accentColor: hexOk(saved.accentColor) ? saved.accentColor : DEFAULT_ACCENT, intensity: saved.appearance === APPEARANCE ? clampIntensity(saved.intensity) : DEFAULT_INTENSITY };
      }
    }
    if (localStorage.getItem(LEGACY_KEY) === 'light') return { theme: 'light', accentColor: DEFAULT_ACCENT, intensity: DEFAULT_INTENSITY };
  } catch { void 0; }
  return { theme: DEFAULT_THEME, accentColor: DEFAULT_ACCENT, intensity: DEFAULT_INTENSITY };
}

export function saveChoice(choice: ThemeChoice): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const merged = { ...(raw ? JSON.parse(raw) : {}), ...choice, appearance: APPEARANCE };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    localStorage.setItem(LEGACY_KEY, THEMES[choice.theme]?.light ? 'light' : 'dark');
  } catch { void 0; }
}

function put(name: string, value: string): void {
  const s = document.documentElement.style;
  if (s.getPropertyValue(name) !== value) s.setProperty(name, value);
}

export function applyTheme(choice: ThemeChoice = readChoice()): void {
  const root = document.documentElement;
  const theme = THEMES[choice.theme] ?? THEMES[DEFAULT_THEME];
  const mode = theme.light ? 'light' : 'dark';
  if (root.getAttribute('data-theme') !== mode) root.setAttribute('data-theme', mode);
  for (const n of NAMES) put(n, theme.vars[n]);
  put('--bg-node', theme.vars['--bg-node'] || theme.vars['--bg-secondary']);
  put('--accent-color', choice.accentColor);
  put('--accent-color-dim', `${choice.accentColor}33`);
  put('--accent-color-hover', `color-mix(in srgb, ${choice.accentColor} 82%, #ffffff)`);
  put('--accent-intensity', String(clampIntensity(choice.intensity)));
  root.style.background = theme.vars['--bg-primary'];
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars['--bg-primary']);
}

const announce = (key: string): void => { document.dispatchEvent(new CustomEvent('nm:ui-settings-changed', { detail: { key } })); };

export function setTheme(theme: string): void {
  const choice = { ...readChoice(), theme: THEMES[theme] ? theme : DEFAULT_THEME };
  saveChoice(choice);
  applyTheme(choice);
  announce('theme');
}

export function setIntensity(intensity: number): void {
  const choice = { ...readChoice(), intensity: clampIntensity(intensity) };
  saveChoice(choice);
  applyTheme(choice);
  announce('intensity');
}

export function setAccent(accentColor: string): void {
  if (!hexOk(accentColor)) return;
  const choice = { ...readChoice(), accentColor };
  saveChoice(choice);
  applyTheme(choice);
  announce('accentColor');
}

export function isLightTheme(id: string): boolean { return !!THEMES[id]?.light; }
