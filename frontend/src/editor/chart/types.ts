export const CHART_KINDS = ['bar', 'hbar', 'line', 'area', 'donut', 'radial', 'number', 'gauge', 'histogram', 'dots', 'compare', 'heatmap', 'calendar'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export interface ChartSpec {
  kind: ChartKind;
  fn?: string;
  title?: string;
  labels?: boolean;
  legend?: boolean;
  smooth?: boolean;
  stacked?: boolean;
  target?: number;
  window?: number;
  scale?: '' | 'linear' | 'quantile';
}

export interface ChartDot {
  id: string;
  title: string;
  group: string;
  value: number;
}

export interface ChartResult {
  kind: ChartKind;
  x: { key: string; label: string; color?: string }[];
  series: { key: string; label: string; color?: string; values: number[] }[];
  value: number;
  rows: number;
  truncated?: boolean;
  epoch: number;
  points?: ChartDot[];
  picked?: string[];
}

let cached = '';

export function locale(): string {
  if (cached) return cached;
  const want = typeof navigator !== 'undefined' && navigator.language ? navigator.language.split('@')[0].replace(/_/g, '-') : '';
  try { cached = Intl.getCanonicalLocales(want || 'en-US')[0] ?? 'en-US'; new Intl.NumberFormat(cached); } catch { cached = 'en-US'; }
  return cached;
}
