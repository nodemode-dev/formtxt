import { renderMath } from '../../../editor/math';
import { type Ctl, type GItem, type Info, button, galleryButton, run, track } from './kit';

const S = (c: Ctl): HTMLElement => track(c).root;
const NEED = ['equation.info'];
const eq = (i: Info): Info | null => i['equation.info'] ?? null;

const math = (latex: string): string => `<span class="ft-bmath">${renderMath(latex, false)}</span>`;

const put = (latex: string): (() => void) => () => run('equation.append', { latex });

const tpl = (id: string, name: string, latex: string, group?: string): GItem => ({ id, name, group, thumb: () => math(latex), run: put(latex) });

const EQUATIONS: Array<[string, string, string]> = [
  ['Pythagorean theorem', 'a^{2} + b^{2} = c^{2}', 'Common equations'],
  ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^{2} - 4ac}}{2a}', 'Common equations'],
  ['Area of a circle', 'A = \\pi r^{2}', 'Common equations'],
  ['Binomial theorem', '(x+a)^{n} = \\sum_{k=0}^{n} \\binom{n}{k} x^{k} a^{n-k}', 'Common equations'],
  ['Binomial series', '(1+x)^{n} = 1 + nx + \\frac{n(n-1)}{2!}x^{2} + \\cdots', 'Common equations'],
  ['Euler\'s identity', 'e^{i\\pi} + 1 = 0', 'Common equations'],
  ['Exponential series', 'e^{x} = 1 + x + \\frac{x^{2}}{2!} + \\frac{x^{3}}{3!} + \\cdots', 'Common equations'],
  ['Pythagorean identity', '\\sin^{2}\\theta + \\cos^{2}\\theta = 1', 'Common equations'],
  ['Fourier series', 'f(x) = a_0 + \\sum_{n=1}^{\\infty}\\left(a_n\\cos\\frac{n\\pi x}{L} + b_n\\sin\\frac{n\\pi x}{L}\\right)', 'Common equations'],
  ['Mass-energy equivalence', 'E = mc^{2}', 'Common equations'],
  ['Compound interest', 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}', 'Common equations'],
  ['Normal distribution', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}', 'Common equations'],
];

const equationItems = (): GItem[] => EQUATIONS.map(([n, l, g], k) => ({ ...tpl(`e${k}`, n, l, g), run: () => run('insert.equation', { latex: l, display: true }) }));

const SYMBOLS: Array<[string, string]> = [
  ['\\pm', 'Plus-Minus'], ['\\infty', 'Infinity'], ['=', 'Equals'], ['\\neq', 'Not Equal'], ['\\sim', 'Tilde'], ['\\times', 'Times'], ['\\div', 'Divide'], ['!', 'Factorial'],
  ['\\propto', 'Proportional'], ['<', 'Less'], ['\\ll', 'Much Less'], ['>', 'Greater'], ['\\gg', 'Much Greater'], ['\\leq', 'Less or Equal'], ['\\geq', 'Greater or Equal'], ['\\mp', 'Minus-Plus'],
  ['\\approx', 'Approximately'], ['\\equiv', 'Identical'], ['\\forall', 'For All'], ['\\exists', 'There Exists'], ['\\partial', 'Partial'], ['\\sqrt{}', 'Radical'], ['\\cup', 'Union'], ['\\cap', 'Intersection'],
  ['\\emptyset', 'Empty Set'], ['\\%', 'Percent'], ['\\circ', 'Degree'], ['\\nabla', 'Nabla'], ['\\in', 'Element Of'], ['\\ni', 'Contains'], ['\\leftarrow', 'Left Arrow'], ['\\uparrow', 'Up Arrow'],
  ['\\rightarrow', 'Right Arrow'], ['\\downarrow', 'Down Arrow'], ['\\leftrightarrow', 'Left-Right Arrow'], ['\\therefore', 'Therefore'], ['\\neg', 'Not'],
  ['\\alpha', 'Alpha'], ['\\beta', 'Beta'], ['\\gamma', 'Gamma'], ['\\delta', 'Delta'], ['\\epsilon', 'Epsilon'], ['\\theta', 'Theta'], ['\\lambda', 'Lambda'], ['\\mu', 'Mu'], ['\\pi', 'Pi'], ['\\rho', 'Rho'], ['\\sigma', 'Sigma'], ['\\phi', 'Phi'], ['\\omega', 'Omega'],
  ['\\Delta', 'Capital Delta'], ['\\Sigma', 'Capital Sigma'], ['\\Omega', 'Capital Omega'], ['\\Gamma', 'Capital Gamma'], ['\\Pi', 'Capital Pi'], ['\\Phi', 'Capital Phi'],
];

const symbolItems = (): GItem[] => SYMBOLS.map(([l, n], k) => ({ ...tpl(`y${k}`, n, l, k < 37 ? 'Basic Math' : 'Greek Letters'), run: put(l === '\\sqrt{}' ? '\\sqrt{x}' : l) }));

interface Struct { id: string; label: string; icon: string; items: Array<[string, string]> }

const STRUCTS: Struct[] = [
  { id: 'fraction', label: 'Fraction', icon: 'eqFraction', items: [['Stacked Fraction', '\\frac{x}{y}'], ['Skewed Fraction', '{}^{x}\\!/{}_{y}'], ['Small Fraction', '\\tfrac{x}{y}'], ['Differential dy over dx', '\\frac{dy}{dx}'], ['Partial Derivative', '\\frac{\\partial y}{\\partial x}'], ['Delta Ratio', '\\frac{\\Delta y}{\\Delta x}'], ['Pi over 2', '\\frac{\\pi}{2}']] },
  { id: 'script', label: 'Script', icon: 'eqScript', items: [['Superscript', 'x^{n}'], ['Subscript', 'x_{n}'], ['Sub-Superscript', 'x_{i}^{n}'], ['Left Sub-Superscript', '{}_{i}^{n}x'], ['Exponential', 'e^{-x^{2}}'], ['Subscript Index', 'y_{1}'], ['Power of Two', 'x^{2}']] },
  { id: 'radical', label: 'Radical', icon: 'eqRadical', items: [['Square Root', '\\sqrt{x}'], ['Degree Root', '\\sqrt[n]{x}'], ['Cube Root', '\\sqrt[3]{x}'], ['Square Root of a Fraction', '\\sqrt{\\frac{x}{y}}'], ['Quadratic Root', '\\sqrt{b^{2}-4ac}'], ['Pythagorean', '\\sqrt{a^{2}+b^{2}}']] },
  { id: 'integral', label: 'Integral', icon: 'eqIntegral', items: [['Integral', '\\int x\\,dx'], ['Definite Integral', '\\int_{a}^{b} f(x)\\,dx'], ['Double Integral', '\\iint f(x,y)\\,dA'], ['Triple Integral', '\\iiint f\\,dV'], ['Contour Integral', '\\oint f\\,dz'], ['Integral over Reals', '\\int_{-\\infty}^{\\infty} e^{-x^{2}}\\,dx']] },
  { id: 'large', label: 'Large Operator', icon: 'eqSum', items: [['Summation', '\\sum_{i=1}^{n} x_i'], ['Product', '\\prod_{i=1}^{n} x_i'], ['Coproduct', '\\coprod_{i} x_i'], ['Union', '\\bigcup_{i=1}^{n} A_i'], ['Intersection', '\\bigcap_{i=1}^{n} A_i'], ['Infinite Sum', '\\sum_{k=0}^{\\infty} \\frac{x^k}{k!}'], ['Big Wedge', '\\bigwedge_{i} p_i']] },
  { id: 'bracket', label: 'Bracket', icon: 'eqBracket', items: [['Parentheses', '\\left( x \\right)'], ['Square Brackets', '\\left[ x \\right]'], ['Braces', '\\left\\{ x \\right\\}'], ['Angle Brackets', '\\left\\langle x \\right\\rangle'], ['Absolute Value', '\\left| x \\right|'], ['Norm', '\\left\\| x \\right\\|'], ['Floor', '\\left\\lfloor x \\right\\rfloor'], ['Ceiling', '\\left\\lceil x \\right\\rceil'], ['Cases', 'f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}'], ['Binomial', '\\binom{n}{k}']] },
  { id: 'function', label: 'Function', icon: 'eqFunction', items: [['Sine', '\\sin x'], ['Cosine', '\\cos x'], ['Tangent', '\\tan x'], ['Cotangent', '\\cot x'], ['Secant', '\\sec x'], ['Arcsine', '\\arcsin x'], ['Hyperbolic Sine', '\\sinh x'], ['Sine Squared', '\\sin^{2}\\theta'], ['Determinant', '\\det A']] },
  { id: 'accent', label: 'Accent', icon: 'eqAccent', items: [['Hat', '\\hat{x}'], ['Wide Hat', '\\widehat{xy}'], ['Bar', '\\bar{x}'], ['Overline', '\\overline{xy}'], ['Tilde', '\\tilde{x}'], ['Vector', '\\vec{v}'], ['Dot', '\\dot{x}'], ['Double Dot', '\\ddot{x}'], ['Underline', '\\underline{xy}'], ['Overbrace', '\\overbrace{a+b}^{n}'], ['Underbrace', '\\underbrace{a+b}_{n}']] },
  { id: 'limit', label: 'Limit and Log', icon: 'eqLimit', items: [['Limit', '\\lim_{x \\to \\infty} f(x)'], ['Limit to Zero', '\\lim_{x \\to 0} \\frac{\\sin x}{x}'], ['Maximum', '\\max_{x} f(x)'], ['Minimum', '\\min_{x} f(x)'], ['Natural Log', '\\ln x'], ['Log Base', '\\log_{b} x'], ['Common Log', '\\log x'], ['Supremum', '\\sup_{x} f(x)'], ['Infimum', '\\inf_{x} f(x)']] },
  { id: 'operator', label: 'Operator', icon: 'eqOperator', items: [['Colon Equal', ':='], ['Yields', '\\xrightarrow{\\text{yields}}'], ['Delta Yields', '\\xrightarrow{\\Delta}'], ['Equal by Definition', '\\overset{\\text{def}}{=}'], ['Maps To', '\\mapsto'], ['Implies', '\\Rightarrow'], ['If and Only If', '\\Leftrightarrow'], ['Not Equal', '\\neq'], ['Congruent', '\\cong']] },
  { id: 'matrix', label: 'Matrix', icon: 'eqMatrix', items: [['Matrix 2x2', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'], ['Matrix 3x3', '\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}'], ['Square Bracket Matrix', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'], ['Determinant Matrix', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'], ['Identity Matrix', '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}'], ['Column Vector', '\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}'], ['Row Vector', '\\begin{pmatrix} x & y & z \\end{pmatrix}'], ['Sparse Matrix', '\\begin{pmatrix} 1 & & 0 \\\\ & \\ddots & \\\\ 0 & & 1 \\end{pmatrix}']] },
];

const structItems = (s: Struct): GItem[] => s.items.map(([n, l], k) => tpl(`${s.id}${k}`, n, l));

const isMath = (i: Info): boolean => !!eq(i);
const hasDisplay = (i: Info): boolean => !!eq(i)?.display;

export function eqSlots(): Record<string, () => HTMLElement> {
  const out: Record<string, () => HTMLElement> = {
    'q.equation': () => S(galleryButton({ label: 'Equation', icon: 'equation', large: true, items: equationItems, tw: 150, th: 36, popCols: 2, popHead: 'Common equations', footer: [{ label: 'Insert New Equation', icon: 'equation', cmd: 'insert.equation' }] })),
    'q.edit': () => S(button({ label: 'Edit Equation', icon: 'editEquation', large: true, cmd: 'equation.edit', needs: NEED, enabled: isMath })),
    'q.professional': () => S(button({ label: 'Professional', icon: 'eqProfessional', text: true, run: () => run('equation.display', { display: true }), checked: hasDisplay, needs: NEED, enabled: isMath })),
    'q.linear': () => S(button({ label: 'Linear', icon: 'eqLinear', text: true, run: () => run('equation.display', { display: false }), checked: (i) => isMath(i) && !hasDisplay(i), needs: NEED, enabled: isMath })),
    'q.symbols': () => S(galleryButton({ label: 'Symbols', icon: 'eqSymbols', large: true, items: symbolItems, tw: 30, th: 30, popCols: 12, popHead: 'Symbols' })),
  };
  for (const s of STRUCTS) {
    out[`q.${s.id}`] = () => S(galleryButton({ label: s.label, icon: s.icon, large: true, items: () => structItems(s), tw: s.id === 'matrix' || s.id === 'integral' ? 82 : 70, th: 42, popCols: 3, popHead: s.label }));
  }
  return out;
}

export const EQ_STRUCTS = STRUCTS.map((s) => s.id);
