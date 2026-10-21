import type { Mark, Node as PMNode } from 'prosemirror-model';
import { type Command, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type MarkView } from 'prosemirror-view';
import type { CommandRegistry } from '../../../engine/registry';
import { Dialog } from '../../../ui/dialog';
import { el } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { addMenuItems } from '../ui';
import { addPlugin } from '../plugins';
import { LIGATURES, NUMBER_FORMS, NUMBER_SPACINGS, type Features, cleanFeatures, featureCss } from '../objects-spec';
import { grid, input, note, select } from './util';

const PX = 96 / 72;

interface Style { basedOn?: string | null; run?: { size?: number } }

function styleSize(styles: Record<string, Style>, id: string): number {
  const seen = new Set<string>();
  let size = 11;
  const chain: Style[] = [];
  let cur: string | null | undefined = id;
  while (cur && styles[cur] && !seen.has(cur)) { seen.add(cur); chain.push(styles[cur]); cur = styles[cur].basedOn; }
  for (const s of chain.reverse()) if (typeof s.run?.size === 'number') size = s.run.size;
  return size;
}

function kerningDecorations(ed: DocEditor, state: EditorState): DecorationSet {
  const kern = schema.marks.kerning;
  const sizeType = schema.marks.size;
  const styles = (ed.doc?.styles ?? {}) as unknown as Record<string, Style>;
  const out: Decoration[] = [];
  let base = 11;
  state.doc.descendants((node, pos) => {
    if (node.type === schema.nodes.paragraph) { base = styleSize(styles, String(node.attrs.style || 'Normal')); return true; }
    if (!node.isText) return true;
    const k = node.marks.find((m) => m.type === kern);
    if (!k || !Number(k.attrs.min)) return false;
    const size = Number(node.marks.find((m) => m.type === sizeType)?.attrs.pt ?? base);
    if (size < Number(k.attrs.min)) out.push(Decoration.inline(pos, pos + node.nodeSize, { style: 'font-kerning:none' }));
    return false;
  });
  return DecorationSet.create(state.doc, out);
}

function scaleView(mark: Mark): MarkView {
  const dom = document.createElement('span');
  dom.className = 'ft-scale';
  dom.dataset.scale = String(mark.attrs.pct);
  const k = Number(mark.attrs.pct) / 100;
  dom.style.setProperty('--ft-scale', String(k));
  let last = 0;
  const fit = (): void => {
    const gap = Math.round(dom.offsetWidth * (k - 1) * 100) / 100;
    if (Math.abs(gap - last) < 0.5) return;
    last = gap;
    dom.style.marginRight = `${gap}px`;
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(dom);
  return {
    dom,
    contentDOM: dom,
    ignoreMutation: (m) => m.type === 'attributes' && m.target === dom,
    destroy: () => ro?.disconnect(),
  };
}

export function installTypographyPlugins(ed: DocEditor): void {
  const cache = new WeakMap<PMNode, DecorationSet>();
  addPlugin(new Plugin({
    key: new PluginKey('ftTypography'),
    props: {
      decorations: (state) => {
        let set = cache.get(state.doc);
        if (!set) { set = kerningDecorations(ed, state); cache.set(state.doc, set); }
        return set;
      },
      markViews: { scale: (mark) => scaleView(mark) },
    },
  }));
}

export interface TypeState {
  spacing: number;
  scale: number;
  position: number;
  kerning: boolean;
  kerningMin: number;
  features: Features;
  family: string;
}

function marksAt(state: EditorState): readonly Mark[] {
  const { empty, $from, from, to } = state.selection;
  if (empty) return state.storedMarks ?? $from.marks();
  let found: readonly Mark[] = [];
  let done = false;
  state.doc.nodesBetween(from, to, (n) => { if (!done && n.isText) { found = n.marks; done = true; } return !done; });
  return found;
}

export function readTypography(state: EditorState): TypeState {
  const marks = marksAt(state);
  const get = (name: string): Mark | undefined => marks.find((m) => m.type.name === name);
  const kern = get('kerning');
  return {
    spacing: Number(get('spacing')?.attrs.pt ?? 0),
    scale: Number(get('scale')?.attrs.pct ?? 100),
    position: Number(get('position')?.attrs.pt ?? 0),
    kerning: !!kern,
    kerningMin: Number(kern?.attrs.min ?? 0),
    features: cleanFeatures(get('otf')?.attrs) ?? { lig: '', num: '', nsp: '', ss: 0 },
    family: String(get('font')?.attrs.family ?? ''),
  };
}

export type TypePatch = Partial<{ spacing: number | null; scale: number | null; position: number | null; kerning: number | null; features: Partial<Features> | null }>;

export function applyTypography(patch: TypePatch): Command {
  return (state, dispatch) => {
    const wanted: Array<[string, Record<string, unknown> | null]> = [];
    const cur = readTypography(state);
    if (patch.spacing !== undefined) wanted.push(['spacing', patch.spacing ? { pt: patch.spacing } : null]);
    if (patch.scale !== undefined) wanted.push(['scale', patch.scale && patch.scale !== 100 ? { pct: Math.max(20, Math.min(600, patch.scale)) } : null]);
    if (patch.position !== undefined) wanted.push(['position', patch.position ? { pt: Math.max(-1584, Math.min(1584, patch.position)) } : null]);
    if (patch.kerning !== undefined) wanted.push(['kerning', patch.kerning === null ? null : { min: Math.max(0, patch.kerning) }]);
    if (patch.features !== undefined) {
      const f = patch.features === null ? null : cleanFeatures({ ...cur.features, ...patch.features });
      wanted.push(['otf', f ? { ...f } : null]);
    }
    if (!wanted.length) return false;
    if (!dispatch) return true;
    const { from, to, empty } = state.selection;
    let tr = state.tr;
    if (empty) {
      let stored = (state.storedMarks ?? state.selection.$from.marks()).slice();
      for (const [name, attrs] of wanted) {
        stored = stored.filter((m) => m.type.name !== name);
        if (attrs) stored.push(schema.marks[name].create(attrs));
      }
      tr = tr.setStoredMarks(stored);
    } else {
      for (const [name, attrs] of wanted) {
        tr = tr.removeMark(from, to, schema.marks[name]);
        if (attrs) tr = tr.addMark(from, to, schema.marks[name].create(attrs));
      }
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

const LIG_LABELS: Record<string, string> = { '': 'Font default', none: 'None', standard: 'Standard only', contextual: 'Standard and contextual', discretionary: 'Historical and discretionary', all: 'All' };
const NUM_LABELS: Record<string, string> = { '': 'Font default', lining: 'Lining', oldstyle: 'Old-style' };
const NSP_LABELS: Record<string, string> = { '': 'Font default', proportional: 'Proportional', tabular: 'Tabular' };

function opts(list: readonly string[], labels: Record<string, string>): Array<[string, string]> {
  return list.map((v) => [v, labels[v]]);
}

export function typographyDialog(ed: DocEditor): void {
  if (!ed.view) throw new Error('Open a document first.');
  const cur = readTypography(ed.view.state);
  const d = new Dialog('Font: advanced', 560);
  const spaceKind = select([['0', 'Normal'], ['1', 'Expanded'], ['-1', 'Condensed']], String(Math.sign(cur.spacing)));
  const spaceBy = input('number', String(Math.abs(cur.spacing) || 1), 'min="0" max="1584" step="0.1"');
  const scale = input('number', String(cur.scale), 'min="20" max="600" step="1" list="ft-objects-scales"');
  const posKind = select([['0', 'Normal'], ['1', 'Raised'], ['-1', 'Lowered']], String(Math.sign(cur.position)));
  const posBy = input('number', String(Math.abs(cur.position) || 3), 'min="0" max="1584" step="0.5"');
  const kern = input('checkbox', String(cur.kerning));
  const kernMin = input('number', String(cur.kerningMin || 12), 'min="0" max="1638" step="0.5"');
  const lig = select(opts(LIGATURES, LIG_LABELS), cur.features.lig);
  const nsp = select(opts(NUMBER_SPACINGS, NSP_LABELS), cur.features.nsp);
  const nf = select(opts(NUMBER_FORMS, NUM_LABELS), cur.features.num);
  const ss = select([['0', 'Default'], ...Array.from({ length: 20 }, (_, i): [string, string] => [String(i + 1), `Set ${i + 1}`])], String(cur.features.ss));
  const sizes = el('<datalist id="ft-objects-scales"><option value="50"><option value="66"><option value="80"><option value="100"><option value="150"><option value="200"></datalist>');
  grid(d, [['Character spacing', spaceKind], ['By (pt)', spaceBy], ['Scale (%)', scale], ['Position', posKind], ['By (pt)', posBy], ['Kerning for fonts', kern], ['Points and above', kernMin]]);
  grid(d, [['Ligatures', lig], ['Number spacing', nsp], ['Number form', nf], ['Stylistic set', ss]]);
  const preview = el('<div class="ft-typo-preview" aria-live="polite"><span class="ft-typo-sample">Office fiction 0123456789 ffi fl Wave</span></div>');
  const sample = preview.querySelector('.ft-typo-sample') as HTMLElement;
  d.body.append(sizes, preview);
  note(d, 'Ligatures, number forms and stylistic sets work only when the font has them. Scale stretches the letters sideways; a scaled run stays on one line.');
  const values = (): { spacing: number; scale: number; position: number; kerning: number | null; features: Partial<Features> } => ({
    spacing: Number(spaceKind.value) * (Number(spaceBy.value) || 0),
    scale: Math.max(20, Math.min(600, Number(scale.value) || 100)),
    position: Number(posKind.value) * (Number(posBy.value) || 0),
    kerning: kern.checked ? Math.max(0, Number(kernMin.value) || 0) : null,
    features: { lig: lig.value, nsp: nsp.value, num: nf.value, ss: Number(ss.value) },
  });
  const paint = (): void => {
    const v = values();
    const f = cleanFeatures(v.features);
    sample.style.cssText = `${cur.family ? `font-family:'${cur.family.replace(/'/g, '')}';` : ''}letter-spacing:${(v.spacing * PX).toFixed(2)}px;${f ? `font-feature-settings:${featureCss(f)};` : ''}${v.kerning !== null ? 'font-kerning:normal;' : ''}display:inline-block;transform:scaleX(${v.scale / 100});transform-origin:left center;position:relative;top:${(-v.position * PX).toFixed(2)}px`;
  };
  for (const n of [spaceKind, spaceBy, scale, posKind, posBy, kern, kernMin, lig, nsp, nf, ss]) { n.addEventListener('input', paint); n.addEventListener('change', paint); }
  paint();
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const v = values();
    ed.run(applyTypography({ spacing: v.spacing, scale: v.scale, position: v.position, kerning: v.kerning, features: cleanFeatures(v.features) ? v.features : null }));
    d.close();
  });
  d.open(scale);
}

const N = (v: unknown): number | undefined => (v === undefined || v === '' || v === null ? undefined : Number(v));

export function registerTypography(reg: CommandRegistry, ed: DocEditor): void {
  installTypographyPlugins(ed);
  reg.register({
    id: 'font.advanced', label: 'Font: advanced', group: 'Format',
    description: 'Character spacing, horizontal scale, raised or lowered position, kerning, ligatures, number forms and stylistic sets for the selection. With no parameters, opens the Advanced font dialog.',
    params: [
      { name: 'spacing', type: 'number', description: 'Character spacing in points; negative condenses, 0 resets' },
      { name: 'scale', type: 'number', description: 'Horizontal scale in percent, 20 to 600; 100 resets' },
      { name: 'position', type: 'number', description: 'Points raised (positive) or lowered (negative); 0 resets' },
      { name: 'kerning', type: 'number', description: 'Kern text at this size in points and above; 0 kerns every size; -1 turns kerning off' },
      { name: 'ligatures', type: 'string', description: 'none, standard, contextual, discretionary or all; empty is the font default' },
      { name: 'numberForm', type: 'string', description: 'lining or oldstyle; empty is the font default' },
      { name: 'numberSpacing', type: 'string', description: 'proportional or tabular; empty is the font default' },
      { name: 'stylisticSet', type: 'number', description: '1 to 20, or 0 for none' },
    ],
    run: (p) => {
      const keys = ['spacing', 'scale', 'position', 'kerning', 'ligatures', 'numberForm', 'numberSpacing', 'stylisticSet'];
      if (!keys.some((k) => p[k] !== undefined)) { typographyDialog(ed); return true; }
      const patch: TypePatch = {};
      if (N(p.spacing) !== undefined) patch.spacing = N(p.spacing)!;
      if (N(p.scale) !== undefined) patch.scale = N(p.scale)!;
      if (N(p.position) !== undefined) patch.position = N(p.position)!;
      if (N(p.kerning) !== undefined) patch.kerning = N(p.kerning)! < 0 ? null : N(p.kerning)!;
      const f: Partial<Features> = {};
      if (p.ligatures !== undefined) f.lig = String(p.ligatures);
      if (p.numberForm !== undefined) f.num = String(p.numberForm);
      if (p.numberSpacing !== undefined) f.nsp = String(p.numberSpacing);
      if (N(p.stylisticSet) !== undefined) f.ss = N(p.stylisticSet)!;
      if (Object.keys(f).length) patch.features = f;
      return ed.run(applyTypography(patch));
    },
  });
  reg.register({
    id: 'font.typography', label: 'Typography at cursor', group: 'Format',
    description: 'Report the character spacing, scale, position, kerning and OpenType settings of the selection.',
    run: () => { if (!ed.view) throw new Error('Open a document first.'); return readTypography(ed.view.state); },
  });
  addMenuItems('Format', [{ cmd: 'font.advanced', label: 'Font: advanced...' }]);
}
