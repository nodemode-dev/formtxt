import katex from 'katex';
import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { NodeView } from 'prosemirror-view';
import { schema } from './schema';

export const MATH_FONTS = ['16px KaTeX_Main', 'italic 16px KaTeX_Main', 'bold 16px KaTeX_Main', 'italic 16px KaTeX_Math', '16px KaTeX_AMS', '16px KaTeX_Size1', '16px KaTeX_Size2'];

export function renderMath(latex: string, display: boolean): string {
  return katex.renderToString(latex || '\\square', { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'htmlAndMathml', errorColor: '#c2410c' });
}

export async function loadMathFonts(timeout = 1500): Promise<void> {
  if (!document.fonts) return;
  await Promise.race([Promise.all(MATH_FONTS.map((f) => document.fonts.load(f).catch(() => []))), new Promise((r) => setTimeout(r, timeout))]);
}

export class MathView implements NodeView {
  dom: HTMLElement;
  private key = '';

  constructor(private node: PMNode) {
    this.dom = document.createElement('span');
    this.dom.className = 'ft-math';
    this.dom.setAttribute('contenteditable', 'false');
    this.apply();
  }

  private apply(): void {
    const latex = String(this.node.attrs.latex ?? '');
    const display = !!this.node.attrs.display;
    const key = `${display ? 'd' : 'i'}:${latex}`;
    if (key === this.key) return;
    this.key = key;
    this.dom.dataset.display = String(display);
    this.dom.dataset.latex = latex;
    this.dom.innerHTML = renderMath(latex, display);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  ignoreMutation(): boolean { return true; }
}

export function selectedMath(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.type === schema.nodes.math) return { node: sel.node, pos: sel.from };
  return null;
}

export function putMath(latex: string, display: boolean): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const cur = selectedMath(state);
    const node = schema.nodes.math.create({ latex, display });
    const tr = cur ? state.tr.setNodeMarkup(cur.pos, undefined, { latex, display }) : state.tr.replaceSelectionWith(node);
    const pos = cur ? cur.pos : tr.mapping.map(state.selection.from, -1);
    try { tr.setSelection(NodeSelection.create(tr.doc, pos)); } catch { void 0; }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const MATH_SNIPPETS: Array<[string, string]> = [
  ['Fraction', '\\frac{a}{b}'], ['Square root', '\\sqrt{x}'], ['Power', 'x^{2}'], ['Subscript', 'x_{i}'], ['Sum', '\\sum_{i=1}^{n} x_i'],
  ['Integral', '\\int_{a}^{b} f(x)\\,dx'], ['Limit', '\\lim_{x \\to \\infty}'], ['Matrix', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
  ['Cases', 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}'], ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
  ['Greek', '\\alpha \\beta \\gamma \\delta \\pi \\theta \\lambda \\sigma \\omega'], ['Operators', '\\le \\ge \\ne \\approx \\times \\div \\pm \\infty'],
];
