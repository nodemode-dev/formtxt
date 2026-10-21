import type { Node as PMNode } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import type { CommandRegistry } from '../../../engine/registry';
import { Dialog } from '../../../ui/dialog';
import { el, setText } from '../../../ui/dom';
import { type DocEditor, FONTS } from '../../editor';
import { schema } from '../../schema';
import { addMenuItems } from '../ui';
import { onDocumentLoaded } from '../plugins';
import { type DropCap, MULTILEVEL, cleanDropCap } from '../objects-spec';
import { grid, input, note, select } from './util';

export function paragraphsIn(state: EditorState): Array<{ node: PMNode; pos: number }> {
  const out: Array<{ node: PMNode; pos: number }> = [];
  state.doc.nodesBetween(state.selection.from, state.selection.to, (n, pos) => {
    if (n.type === schema.nodes.paragraph) { out.push({ node: n, pos }); return false; }
    return true;
  });
  return out;
}

export function setDropCap(value: DropCap | null): Command {
  return (state, dispatch) => {
    const paras = paragraphsIn(state);
    if (!paras.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { node, pos } of paras) tr.setNodeMarkup(pos, undefined, { ...node.attrs, dropCap: value });
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function setMultilevel(scheme: string): Command {
  return (state, dispatch) => {
    const paras = paragraphsIn(state);
    if (!paras.length) return false;
    if (dispatch) {
      const tr = state.tr;
      for (const { node, pos } of paras) {
        const attrs: Record<string, unknown> = { ...node.attrs, multilevel: scheme };
        if (scheme && !node.attrs.list) { attrs.list = 'number'; attrs.level = 0; }
        tr.setNodeMarkup(pos, undefined, attrs);
      }
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

const ROMAN: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number): string => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const alpha = (n: number): string => String.fromCharCode(96 + ((n - 1) % 26) + 1);

export function sampleLabel(scheme: string, counters: number[]): string {
  const level = counters.length - 1;
  const c = counters;
  if (scheme === 'legal') return level === 0 ? `${c[0]}.` : c.join('.');
  if (scheme === 'outline') {
    const forms = [`${roman(c[0] ?? 1)}.`, `${alpha(c[1] ?? 1).toUpperCase()}.`, `${c[2]}.`, `${alpha(c[3] ?? 1)}.`, `(${c[4]})`, `(${alpha(c[5] ?? 1)})`, `(${roman(c[6] ?? 1).toLowerCase()})`];
    return forms[Math.min(level, forms.length - 1)];
  }
  if (scheme === 'article') {
    if (level === 0) return `Article ${roman(c[0])}.`;
    if (level === 1) return `Section ${c[0]}.${String(c[1]).padStart(2, '0')}`;
    return level === 2 ? `(${alpha(c[2])})` : `(${roman(c[3] ?? 1).toLowerCase()})`;
  }
  if (level === 1) return `${alpha(c[1])}.`;
  return level === 2 ? `${roman(c[2]).toLowerCase()}.` : `${c[level]}.`;
}

const SCHEMES: Array<[string, string]> = [['', 'Numbers, letters and roman numerals'], ['legal', 'Legal: 1, 1.1, 1.1.1'], ['outline', 'Outline: I., A., 1., a.'], ['article', 'Article and section']];

function sampleBlock(scheme: string): string {
  const rows: number[][] = [[1], [1, 1], [1, 1, 1], [1, 2], [2], [2, 1]];
  return rows.map((r) => {
    const label = sampleLabel(scheme, r);
    return `<div class="ft-ml-row" style="padding-left:${(r.length - 1) * 16}px"><span class="ft-ml-n">${label}</span><span class="ft-ml-t">List item</span></div>`;
  }).join('');
}

export function headingNumbersOn(ed: DocEditor): boolean {
  return !!(ed.doc?.settings as unknown as { headingNumbers?: boolean } | undefined)?.headingNumbers;
}

export function applyHeadingNumbers(ed: DocEditor): void {
  const dom = ed.view?.dom as HTMLElement | undefined;
  if (!dom) return;
  const on = headingNumbersOn(ed);
  if (on) { if (dom.dataset.headingNum !== 'on') dom.dataset.headingNum = 'on'; } else if (dom.dataset.headingNum) delete dom.dataset.headingNum;
}

export function setHeadingNumbers(ed: DocEditor, on: boolean): boolean {
  ed.updatePage({}, { headingNumbers: on });
  applyHeadingNumbers(ed);
  ed.paginator.layoutNow();
  return on;
}

export function multilevelDialog(ed: DocEditor): void {
  if (!ed.view) throw new Error('Open a document first.');
  const d = new Dialog('Multilevel list', 640);
  const gallery = el('<div class="ft-ml-gallery" role="radiogroup" aria-label="Numbering styles"></div>');
  let chosen = String(paragraphsIn(ed.view.state)[0]?.node.attrs.multilevel ?? '');
  for (const [scheme, label] of SCHEMES) {
    const b = el<HTMLButtonElement>('<button type="button" class="ft-ml-card" role="radio"><span class="ft-ml-title"></span><span class="ft-ml-rows"></span></button>');
    setText(b.querySelector('.ft-ml-title'), label);
    (b.querySelector('.ft-ml-rows') as HTMLElement).innerHTML = sampleBlock(scheme);
    b.dataset.scheme = scheme;
    b.setAttribute('aria-checked', String(scheme === chosen));
    gallery.appendChild(b);
  }
  gallery.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.ft-ml-card');
    if (!b) return;
    chosen = b.dataset.scheme ?? '';
    for (const c of Array.from(gallery.children)) c.setAttribute('aria-checked', String((c as HTMLElement).dataset.scheme === chosen));
  });
  d.body.appendChild(gallery);
  const heads = input('checkbox', String(headingNumbersOn(ed)));
  grid(d, [['Number Heading 1 to 3 as 1, 1.1, 1.1.1', heads]], 1);
  note(d, 'Press Tab inside a numbered item to go one level deeper; Shift+Tab goes back up. The style applies to the selected list items, or turns the selected paragraphs into a numbered list.');
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    if (paragraphsIn(ed.view!.state).length) ed.run(setMultilevel(chosen));
    setHeadingNumbers(ed, heads.checked);
    d.close();
  });
  d.open(gallery.querySelector<HTMLElement>('.ft-ml-card') ?? undefined);
}

export function dropCapDialog(ed: DocEditor): void {
  if (!ed.view) throw new Error('Open a document first.');
  const cur = cleanDropCap(paragraphsIn(ed.view.state)[0]?.node.attrs.dropCap);
  const d = new Dialog('Drop cap', 420);
  const mode = select([['none', 'None'], ['dropped', 'Dropped'], ['margin', 'In margin']], cur?.mode ?? 'dropped');
  const lines = input('number', String(cur?.lines ?? 3), 'min="1" max="10" step="1"');
  const dist = input('number', String(cur?.distance ?? 0), 'min="0" max="72" step="0.5"');
  const font = select([['', 'Same as paragraph'], ...FONTS.map((f): [string, string] => [f, f])], cur?.font ?? '');
  grid(d, [['Position', mode], ['Lines to drop', lines], ['Distance from text (pt)', dist], ['Font', font]]);
  note(d, 'The first letter of each selected paragraph is enlarged. It needs a paragraph that starts with text.');
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    ed.run(setDropCap(mode.value === 'none' ? null : cleanDropCap({ mode: mode.value, lines: Number(lines.value), distance: Number(dist.value), font: font.value })));
    d.close();
  });
  d.open(mode);
}

export function registerParagraph(reg: CommandRegistry, ed: DocEditor): void {
  reg.register({
    id: 'paragraph.dropCap', label: 'Drop cap', group: 'Paragraph',
    description: 'Enlarge the first letter of the selected paragraphs, dropped into the text or hanging in the margin. With no parameters, opens the Drop cap dialog.',
    params: [
      { name: 'mode', type: 'string', description: 'dropped, margin or none' },
      { name: 'lines', type: 'number', description: 'Lines to drop, 1 to 10' },
      { name: 'distance', type: 'number', description: 'Distance from the text in points' },
      { name: 'font', type: 'string', description: 'Font family; empty keeps the paragraph font' },
    ],
    run: (p) => {
      if (p.mode === undefined) { dropCapDialog(ed); return true; }
      if (String(p.mode) === 'none') return ed.run(setDropCap(null));
      const v = cleanDropCap(p);
      if (!v) throw new Error('mode must be dropped, margin or none.');
      return ed.run(setDropCap(v));
    },
  });
  reg.register({
    id: 'list.multilevel', label: 'Multilevel list', group: 'Paragraph',
    description: `Number the selected paragraphs with a multilevel scheme (${MULTILEVEL.join(', ')}), or none to return to the default numbers. With no parameters, opens the numbering gallery.`,
    params: [{ name: 'scheme', type: 'string', description: `${MULTILEVEL.join(', ')} or none` }],
    run: (p) => {
      if (p.scheme === undefined) { multilevelDialog(ed); return true; }
      const scheme = String(p.scheme) === 'none' ? '' : String(p.scheme);
      if (scheme && !(MULTILEVEL as readonly string[]).includes(scheme)) throw new Error(`scheme must be ${MULTILEVEL.join(', ')} or none.`);
      return ed.run(setMultilevel(scheme));
    },
  });
  reg.register({
    id: 'document.headingNumbers', label: 'Number headings', group: 'Format',
    description: 'Number Heading 1 to 3 as 1, 1.1 and 1.1.1 throughout the document. With no parameter, toggles.',
    params: [{ name: 'on', type: 'boolean', description: 'true to number, false to stop' }],
    run: (p) => setHeadingNumbers(ed, p.on === undefined ? !headingNumbersOn(ed) : p.on === true || p.on === 'true'),
  });
  onDocumentLoaded(() => applyHeadingNumbers(ed));
  addMenuItems('Format', [
    { cmd: 'paragraph.dropCap', label: 'Drop cap...' },
    { cmd: 'list.multilevel', label: 'Multilevel list...' },
    { cmd: 'document.headingNumbers', label: 'Number headings (1, 1.1, 1.1.1)' },
  ], false);
}
