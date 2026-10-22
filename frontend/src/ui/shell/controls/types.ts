export interface PAct { cmd?: string; params?: Record<string, unknown>; run?: () => unknown }

export interface PItem extends PAct {
  label: string | (() => string);
  sub?: string;
  icon?: string;
  glyph?: string;
  on?: () => boolean;
  off?: () => boolean;
  keys?: string;
  keep?: boolean;
}

export interface PalSec {
  t: 'palette';
  cmd: string;
  key: string;
  extra?: Record<string, unknown>;
  auto?: string;
  autoValue?: string;
  none?: string;
  noneValue?: string;
  theme?: boolean;
  standard?: boolean;
  hl?: boolean;
  more?: string;
  recent?: string;
  swatch?: boolean;
  current?: () => string;
}

export interface GridSec {
  t: 'grid';
  rows: number;
  cols: number;
  idle: string;
  label: (cols: number, rows: number) => string;
  act: (cols: number, rows: number) => PAct;
}

export interface CustomSec { t: 'custom'; build: (close: () => void) => HTMLElement; patch?: () => void }

export type Sec =
  | { t: 'head'; text: string }
  | { t: 'sep' }
  | { t: 'rows'; rows: PItem[] }
  | { t: 'tiles'; cols: number; tw: number; th: number; tiles: PItem[]; names?: boolean }
  | PalSec
  | GridSec
  | CustomSec;

export interface PanelSpec {
  id: string;
  secs: Sec[];
  w?: number;
  cls?: string;
  remember?: boolean;
  enabled?: () => boolean;
}
