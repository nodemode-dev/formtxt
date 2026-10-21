import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Section } from '../engine/model';
import { schema } from './schema';

const PX = 96 / 72;

export interface SecGeo { dx: number; shrink: number }
interface State { geo: Record<string, SecGeo>; first: string; decos: DecorationSet }

export const sectionsKey = new PluginKey<State>('sections');

function build(doc: PMNode, geo: Record<string, SecGeo>, first: string): DecorationSet {
  if (!Object.keys(geo).length) return DecorationSet.empty;
  const decos: Decoration[] = [];
  let cur = first;
  doc.forEach((node, pos) => {
    if (node.type === schema.nodes.section_break) { cur = String(node.attrs.section || cur); return; }
    if (node.type === schema.nodes.page_break) return;
    const g = geo[cur];
    if (!g) return;
    const right = (node.type === schema.nodes.paragraph ? Number(node.attrs.indentRight) || 0 : 0) * PX + g.shrink;
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `position:relative;left:${g.dx.toFixed(2)}px;margin-right:${right.toFixed(2)}px`, 'data-sec': cur }));
  });
  return DecorationSet.create(doc, decos);
}

export const sectionsPlugin = new Plugin<State>({
  key: sectionsKey,
  state: {
    init: () => ({ geo: {}, first: '', decos: DecorationSet.empty }),
    apply(tr, v) {
      const meta = tr.getMeta(sectionsKey) as { geo: Record<string, SecGeo>; first: string } | undefined;
      if (meta) return { ...meta, decos: build(tr.doc, meta.geo, meta.first) };
      if (tr.docChanged && Object.keys(v.geo).length) return { ...v, decos: build(tr.doc, v.geo, v.first) };
      return v;
    },
  },
  props: { decorations: (state) => sectionsKey.getState(state)?.decos },
});

export function columnsOf(s: Section): { count: number; gap: number; width: number; stride: number } {
  const count = Math.max(1, Math.min(4, Math.round(Number(s.columns?.count) || 1)));
  const gap = Math.max(0, Number(s.columns?.gap ?? 36)) * PX;
  const body = (s.page.width - s.margins.left - s.margins.right) * PX;
  const width = count > 1 ? Math.max(48, (body - gap * (count - 1)) / count) : body;
  return { count, gap, width, stride: width + gap };
}

export function sectionGeometry(sections: Section[], pageless: boolean): { geo: Record<string, SecGeo>; first: string } {
  const first = sections[0];
  if (!first || pageless || sections.length < 2 && columnsOf(first).count < 2) return { geo: {}, first: first?.id ?? '' };
  const maxW = Math.max(...sections.map((s) => s.page.width * PX));
  const leftOf = (s: Section): number => (maxW - s.page.width * PX) / 2 + s.margins.left * PX;
  const bodyOf = (s: Section): number => (s.page.width - s.margins.left - s.margins.right) * PX;
  const geo: Record<string, SecGeo> = {};
  for (const s of sections) {
    const dx = leftOf(s) - leftOf(first);
    const c = columnsOf(s);
    const shrink = bodyOf(first) - bodyOf(s) + (c.count > 1 ? bodyOf(s) - c.width : 0);
    if (Math.abs(dx) > 0.5 || Math.abs(shrink) > 0.5) geo[s.id] = { dx, shrink };
  }
  return { geo, first: first.id };
}
