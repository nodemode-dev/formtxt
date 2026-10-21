import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { NodeView } from 'prosemirror-view';
import { schema } from '../schema';
import { type DrawOpts, drawChart } from './chartdraw';
import { CHART_KINDS, type ChartKind, type ChartResult, type ChartSpec, locale } from './types';

const PX = 96 / 72;
const NS = 'http://www.w3.org/2000/svg';

export const CHART_LABELS: Record<ChartKind, string> = {
  bar: 'Column', hbar: 'Bar', line: 'Line', area: 'Area', donut: 'Doughnut', radial: 'Radial bars', number: 'Big number',
  gauge: 'Gauge', histogram: 'Histogram', dots: 'Dot plot', compare: 'Compare with running total', heatmap: 'Heat map', calendar: 'Calendar heat map',
};
export const CHART_FNS = ['sum', 'average', 'min', 'max', 'count'] as const;
export const SERIES_COLORS = ['orange', 'blue', 'teal', 'amber', 'rose', 'green', 'cyan', 'pink', 'violet', 'gray'] as const;

export interface ChartSeries { name: string; values: Array<number | null>; color?: string }
export interface ChartData { categories: string[]; series: ChartSeries[] }
export interface ChartOptions { labels?: boolean; legend?: boolean; smooth?: boolean; stacked?: boolean; target?: number; fn?: string; window?: number; scale?: '' | 'linear' | 'quantile' }

export const SAMPLE: ChartData = { categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [120, 150, 170, 210] }, { name: 'Costs', values: [90, 100, 118, 132] }] };

export function num(s: string): number | null {
  const t = s.trim().replace(/[\s,$£€¥%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseGrid(text: string): ChartData {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return { categories: [], series: [] };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
  const head = rows[0];
  const numericHead = head.slice(1).length > 0 && head.slice(1).every((c) => num(c) !== null);
  const body = numericHead ? rows : rows.slice(1);
  const width = Math.max(2, ...rows.map((r) => r.length));
  const series: ChartSeries[] = [];
  for (let c = 1; c < width; c++) series.push({ name: numericHead ? `Series ${c}` : head[c] || `Series ${c}`, values: body.map((r) => num(r[c] ?? '')) });
  return { categories: body.map((r) => r[0] ?? ''), series };
}

export function gridText(d: ChartData): string {
  const head = ['Category', ...d.series.map((s) => s.name)].join('\t');
  return [head, ...d.categories.map((c, i) => [c, ...d.series.map((s) => (s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i])))].join('\t'))].join('\n');
}

function aggregate(values: number[], fn: string): number {
  if (!values.length) return 0;
  if (fn === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
  if (fn === 'min') return Math.min(...values);
  if (fn === 'max') return Math.max(...values);
  if (fn === 'count') return values.length;
  return values.reduce((a, b) => a + b, 0);
}

export function toResult(kind: ChartKind, d: ChartData, o: ChartOptions): ChartResult {
  const calendar = kind === 'calendar';
  const seen = new Set<string>();
  const x = d.categories.map((c, i) => {
    let key = calendar ? c.trim() : String(i);
    while (seen.has(key)) key += '+';
    seen.add(key);
    return { key, label: c };
  });
  const series = d.series.map((s, j) => ({ key: `s${j}`, label: s.name, ...(s.color ? { color: s.color } : {}), values: d.categories.map((_, i) => Number(s.values[i] ?? 0) || 0) }));
  const first = (d.series[0]?.values ?? []).filter((v): v is number => typeof v === 'number');
  const res: ChartResult = { kind, x, series, value: aggregate(first, o.fn ?? 'sum'), rows: d.categories.length, epoch: 0 };
  if (kind === 'dots') {
    res.x = d.series.map((s, j) => ({ key: `s${j}`, label: s.name }));
    res.points = d.series.flatMap((s, j) => d.categories.map((c, i) => ({ id: `${j}:${i}`, title: c, group: `s${j}`, value: Number(s.values[i] ?? 0) || 0 })));
  }
  return res;
}

export function drawOpts(width: number, height: number, caption: string): DrawOpts {
  const full = new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 });
  return { width, height, fmt: (n) => full.format(n), axisFmt: (n) => compact.format(n), empty: 'Add data to draw this chart', caption };
}

export function paint(svg: SVGSVGElement, a: Record<string, unknown>): void {
  const kind = ((CHART_KINDS as readonly string[]).includes(String(a.kind)) ? a.kind : 'bar') as ChartKind;
  const o = (a.options ?? {}) as ChartOptions;
  const d = (a.data ?? { categories: [], series: [] }) as ChartData;
  const spec: ChartSpec = { kind, labels: !!o.labels, legend: o.legend !== false, smooth: !!o.smooth, stacked: !!o.stacked, target: Number(o.target) || undefined, window: Number(o.window) || undefined, scale: o.scale ?? '', fn: o.fn };
  const caption = o.fn && o.fn !== 'sum' ? `${o.fn[0].toUpperCase()}${o.fn.slice(1)} of ${d.series[0]?.name ?? 'values'}` : `Total ${d.series[0]?.name ?? ''}`.trim();
  drawChart(svg, toResult(kind, d, o), spec, drawOpts(Number(a.width) * PX, Number(a.height) * PX, caption));
}

export class ChartView implements NodeView {
  dom: HTMLElement;
  private readonly title: HTMLElement;
  private readonly svg: SVGSVGElement;
  private node: PMNode;

  constructor(node: PMNode) {
    this.node = node;
    this.dom = document.createElement('figure');
    this.dom.className = 'ft-chart';
    this.dom.setAttribute('contenteditable', 'false');
    this.title = this.dom.appendChild(document.createElement('figcaption'));
    this.svg = this.dom.appendChild(document.createElementNS(NS, 'svg'));
    this.svg.setAttribute('class', 'chart');
    this.svg.setAttribute('role', 'img');
    this.apply();
  }

  private apply(): void {
    const a = this.node.attrs;
    const title = String(a.title || '');
    if (this.title.textContent !== title) this.title.textContent = title;
    if (this.title.hidden !== !title) this.title.hidden = !title;
    const align = String(a.align || 'center');
    if (this.dom.dataset.align !== align) this.dom.dataset.align = align;
    const w = `${(Number(a.width) * PX).toFixed(0)}px`;
    if (this.dom.style.width !== w) this.dom.style.width = w;
    if (this.svg.getAttribute('aria-label') !== (title || `${CHART_LABELS[a.kind as ChartKind] ?? 'Chart'} chart`)) this.svg.setAttribute('aria-label', title || `${CHART_LABELS[a.kind as ChartKind] ?? 'Chart'} chart`);
    paint(this.svg, a);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const same = node.attrs === this.node.attrs || JSON.stringify(node.attrs) === JSON.stringify(this.node.attrs);
    this.node = node;
    if (!same) this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  stopEvent(): boolean { return false; }
  ignoreMutation(): boolean { return true; }
}

export function selectedChart(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.chart) return { node: sel.node, pos: sel.from };
  return null;
}

export function setChart(patch: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const c = selectedChart(state);
    if (!c) return false;
    if (dispatch) {
      const attrs = { ...c.node.attrs, ...patch };
      if (patch.options) attrs.options = { ...(c.node.attrs.options as object), ...(patch.options as object) };
      const tr = state.tr.setNodeMarkup(c.pos, undefined, attrs);
      tr.setSelection(NodeSelection.create(tr.doc, c.pos));
      dispatch(tr);
    }
    return true;
  };
}

export function insertChart(attrs: Record<string, unknown>): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.chart.create(attrs);
    const $from = state.selection.$from;
    const empty = $from.parent.type === schema.nodes.paragraph && !$from.parent.content.size && $from.depth >= 1;
    const tr = state.tr;
    let at: number;
    if (empty) { at = $from.before(); tr.replaceWith(at, $from.after(), [node, schema.nodes.paragraph.create()]); }
    else { at = $from.depth ? $from.after() : state.selection.from; tr.insert(at, [node, schema.nodes.paragraph.create()]); }
    tr.setSelection(NodeSelection.create(tr.doc, at));
    dispatch(tr.scrollIntoView());
    return true;
  };
}
