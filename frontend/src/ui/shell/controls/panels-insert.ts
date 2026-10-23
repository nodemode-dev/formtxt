import { icon } from '../../icons';
import { renderMath } from '../../../editor/math';
import { SYMBOL_GROUPS } from '../../../editor/symbols';
import { insertSymbol, recentSymbols, removeCover, removeHeaderFooter, removePageNumbers, setHeaderFooter } from './actions';
import { SHAPE_GLYPH, coverGlyph, dropCapGlyph, equationGlyph, headerGlyph, pageNumGlyph, wordArtGlyph } from './glyphs';
import { R, X } from './helpers';
import { registerPanel } from './popover';
import { hasCover } from './state';
import type { PItem } from './types';

const big = (name: string): string => icon(name, 28);

const shape = (kind: string, label: string): PItem => ({ label, glyph: SHAPE_GLYPH[kind], cmd: 'insert.shape', params: { kind } });

const CHARTS: Array<[string, string]> = [
  ['bar', 'Column'], ['hbar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['donut', 'Doughnut'], ['radial', 'Radial'], ['number', 'Number'],
  ['gauge', 'Gauge'], ['histogram', 'Histogram'], ['dots', 'Dot Plot'], ['compare', 'Compare'], ['heatmap', 'Heat Map'], ['calendar', 'Calendar'],
];

const EQUATIONS: Array<[string, string]> = [
  ['Pythagorean theorem', 'a^{2}+b^{2}=c^{2}'],
  ['Quadratic formula', 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'],
  ['Area of a circle', 'A=\\pi r^{2}'],
  ['Binomial theorem', '(x+a)^{n}=\\sum_{k=0}^{n}\\binom{n}{k}x^{k}a^{n-k}'],
  ['Binomial series', '(1+x)^{n}=1+nx+\\frac{n(n-1)}{2!}x^{2}+\\cdots'],
  ['Euler\'s identity', 'e^{i\\pi}+1=0'],
  ['Exponential series', 'e^{x}=1+x+\\frac{x^{2}}{2!}+\\frac{x^{3}}{3!}+\\cdots'],
  ['Pythagorean identity', '\\sin^{2}\\theta+\\cos^{2}\\theta=1'],
  ['Fourier series', 'f(x)=a_{0}+\\sum_{n=1}^{\\infty}\\left(a_{n}\\cos\\frac{n\\pi x}{L}+b_{n}\\sin\\frac{n\\pi x}{L}\\right)'],
  ['Mass-energy equivalence', 'E=mc^{2}'],
  ['Compound interest', 'A=P\\left(1+\\frac{r}{n}\\right)^{nt}'],
  ['Normal distribution', 'f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}}'],
];

const symbols = (): string[] => {
  const common = SYMBOL_GROUPS[0][1].filter((c) => c.trim() && c !== ' ');
  const out: string[] = [];
  for (const c of [...recentSymbols(), ...common]) if (!out.includes(c)) out.push(c);
  return out.slice(0, 20);
};

const symbolGrid = (() => {
  let cells: HTMLButtonElement[] = [];
  return {
    build: (close: () => void): HTMLElement => {
      const box = document.createElement('div');
      box.className = 'ft-pp-tiles ft-pp-symbols';
      box.style.setProperty('--cols', '5');
      box.style.setProperty('--tw', '40px');
      box.style.setProperty('--th', '34px');
      cells = Array.from({ length: 20 }, () => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ft-pp-tile ft-pp-char';
        b.setAttribute('role', 'menuitem');
        box.appendChild(b);
        return b;
      });
      box.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ft-pp-char');
        if (!b?.dataset.ch) return;
        close();
        void insertSymbol(b.dataset.ch);
      });
      return box;
    },
    patch: (): void => {
      const list = symbols();
      cells.forEach((b, i) => {
        const c = list[i] ?? '';
        if (b.dataset.ch !== c) { b.dataset.ch = c; b.textContent = c; b.title = c ? `U+${c.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}` : ''; }
        b.hidden = !c;
      });
    },
  };
})();

export function registerInsertPanels(): void {
  registerPanel({
    id: 'cover',
    w: 296,
    secs: [
      { t: 'head', text: 'Built-In' },
      {
        t: 'tiles', cols: 3, tw: 78, th: 104,
        tiles: [
          { label: 'Title and Date', glyph: coverGlyph(0), cmd: 'insert.coverPageDefault' },
          { label: 'Title and Subtitle', glyph: coverGlyph(1), cmd: 'insert.coverPage', params: { subtitle: 'Document subtitle' } },
          { label: 'Full Cover', glyph: coverGlyph(2), cmd: 'insert.coverPage', params: { subtitle: 'Document subtitle', byline: 'Author name' } },
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Custom Cover Page...', 'insert.coverPage', {}, { icon: 'coverPage' }), X('Remove Current Cover Page', () => removeCover(), { icon: 'trash', off: () => !hasCover() })] },
    ],
  });

  registerPanel({
    id: 'table',
    w: 264,
    secs: [
      { t: 'grid', rows: 8, cols: 10, idle: 'Insert Table', label: (c, r) => `${c}x${r} Table`, act: (c, r) => ({ cmd: 'insert.table', params: { rows: r, cols: c, header: true } }) },
      { t: 'sep' },
      { t: 'rows', rows: [R('Insert Table...', 'insert.table', {}, { icon: 'table' }), R('Convert Text to Table...', 'table.fromText', undefined, { icon: 'tableProps' }), R('Formula', 'insert.formula', undefined, { icon: 'sigma' })] },
      { t: 'head', text: 'Quick Tables' },
      { t: 'rows', rows: [R('Project Tracker', 'insert.block', { id: 'project-tracker' }, { icon: 'blocks', sub: 'Tasks with owner, status and due date' }), R('Decision Record', 'insert.block', { id: 'decision-record' }, { icon: 'blocks', sub: 'Status, owner, context and options' })] },
    ],
  });

  registerPanel({
    id: 'pictures',
    secs: [{
      t: 'rows',
      rows: [
        R('This Device...', 'insert.picture', undefined, { icon: 'image', sub: 'Pick a picture file' }),
        R('Stock Images...', 'insert.stockImage', undefined, { icon: 'stock', sub: 'Openly licensed photos' }),
        R('Icons...', 'insert.icon', undefined, { icon: 'iconLibrary' }),
        R('Generate Image...', 'ai.image', undefined, { icon: 'aiImage' }),
        R('Image Options...', 'ai.imageOptions', undefined, { icon: 'aiImage' }),
        R('Banner...', 'ai.banner', undefined, { icon: 'banner' }),
      ],
    }],
  });

  registerPanel({
    id: 'shapes',
    w: 292,
    secs: [
      { t: 'head', text: 'Lines' },
      { t: 'tiles', cols: 8, tw: 32, th: 32, names: false, tiles: [shape('line', 'Line')] },
      { t: 'head', text: 'Rectangles' },
      { t: 'tiles', cols: 8, tw: 32, th: 32, names: false, tiles: [shape('rect', 'Rectangle'), shape('roundRect', 'Rounded Rectangle')] },
      { t: 'head', text: 'Basic Shapes' },
      {
        t: 'tiles', cols: 8, tw: 32, th: 32, names: false,
        tiles: [shape('textBox', 'Text Box'), shape('ellipse', 'Oval'), shape('triangle', 'Isosceles Triangle'), shape('rightTriangle', 'Right Triangle'), shape('diamond', 'Diamond'), shape('pentagon', 'Pentagon'), shape('hexagon', 'Hexagon'), shape('octagon', 'Octagon'), shape('plus', 'Cross'), shape('heart', 'Heart'), shape('cloud', 'Cloud')],
      },
      { t: 'head', text: 'Block Arrows' },
      { t: 'tiles', cols: 8, tw: 32, th: 32, names: false, tiles: [shape('arrowRight', 'Right Arrow'), shape('arrowLeft', 'Left Arrow'), shape('arrowUp', 'Up Arrow'), shape('arrowDown', 'Down Arrow'), shape('chevron', 'Chevron')] },
      { t: 'head', text: 'Callouts' },
      { t: 'tiles', cols: 8, tw: 32, th: 32, names: false, tiles: [shape('callout', 'Speech Callout')] },
      { t: 'head', text: 'Stars and Banners' },
      { t: 'tiles', cols: 8, tw: 32, th: 32, names: false, tiles: [shape('star', '5-Point Star')] },
    ],
  });

  registerPanel({
    id: 'smartart',
    w: 232,
    secs: [
      { t: 'head', text: 'List' }, { t: 'rows', rows: [R('Basic Block List', 'insert.diagram', { layout: 'list-block' }, { icon: 'diagram' }), R('Vertical Bullet List', 'insert.diagram', { layout: 'list-vertical' }, { icon: 'diagram' })] },
      { t: 'head', text: 'Process' }, { t: 'rows', rows: [R('Basic Process', 'insert.diagram', { layout: 'process-basic' }, { icon: 'diagram' }), R('Chevron Process', 'insert.diagram', { layout: 'process-chevron' }, { icon: 'diagram' }), R('Basic Timeline', 'insert.diagram', { layout: 'timeline-basic' }, { icon: 'diagram' })] },
      { t: 'head', text: 'Cycle' }, { t: 'rows', rows: [R('Basic Cycle', 'insert.diagram', { layout: 'cycle-basic' }, { icon: 'diagram' }), R('Radial Cycle', 'insert.diagram', { layout: 'cycle-radial' }, { icon: 'diagram' })] },
      { t: 'head', text: 'Hierarchy' }, { t: 'rows', rows: [R('Organization Chart', 'insert.diagram', { layout: 'hier-org' }, { icon: 'diagram' }), R('Horizontal Hierarchy', 'insert.diagram', { layout: 'hier-horizontal' }, { icon: 'diagram' })] },
      { t: 'head', text: 'Relationship, Matrix and Pyramid' }, { t: 'rows', rows: [R('Basic Venn', 'insert.diagram', { layout: 'rel-venn' }, { icon: 'diagram' }), R('Basic Matrix', 'insert.diagram', { layout: 'matrix-basic' }, { icon: 'diagram' }), R('Basic Pyramid', 'insert.diagram', { layout: 'pyramid-basic' }, { icon: 'diagram' })] },
      { t: 'sep' }, { t: 'rows', rows: [R('More IntelligentArt Graphics...', 'insert.diagram', undefined, { icon: 'diagram' })] },
    ],
  });

  registerPanel({
    id: 'chart',
    w: 220,
    secs: [
      { t: 'rows', rows: CHARTS.map(([k, n]) => R(n, 'insert.chart', { kind: k }, { icon: 'chart' })) },
      { t: 'sep' },
      { t: 'rows', rows: [R('Chart Editor...', 'insert.chart', undefined, { icon: 'chartData' })] },
    ],
  });

  registerPanel({
    id: 'screenshot',
    secs: [{ t: 'rows', rows: [R('Screen Clipping', 'insert.screenshot', { mode: 'clip' }, { icon: 'screenshot' }), R('Full Capture', 'insert.screenshot', { mode: 'full' }, { icon: 'screenshot' })] }],
  });

  const hf = (part: 'header' | 'footer'): void => {
    const Part = part === 'header' ? 'Header' : 'Footer';
    registerPanel({
      id: part,
      w: 292,
      secs: [
        { t: 'head', text: 'Built-In' },
        {
          t: 'tiles', cols: 3, tw: 84, th: 100,
          tiles: [
            { label: 'Blank', glyph: headerGlyph(part, 'none'), run: () => setHeaderFooter(part, 'left', ' ') },
            { label: 'Document Title', glyph: headerGlyph(part, 'center'), run: () => setHeaderFooter(part, 'center', '@title') },
            { label: 'Title, Left', glyph: headerGlyph(part, 'left'), run: () => setHeaderFooter(part, 'left', '@title') },
            { label: 'Page Number, Right', glyph: headerGlyph(part, 'right', 'num'), run: () => setHeaderFooter(part, 'right', '{PAGE}') },
            { label: 'Page N of M, Centre', glyph: pageNumGlyph(part, 'center', true), run: () => setHeaderFooter(part, 'center', 'Page {PAGE} of {NUMPAGES}') },
            { label: 'Confidential', glyph: headerGlyph(part, 'right'), run: () => setHeaderFooter(part, 'right', 'Confidential') },
          ],
        },
        { t: 'sep' },
        {
          t: 'rows',
          rows: [
            R(`Edit ${Part}`, 'insert.headerFooter', undefined, { icon: part }),
            X(`Remove ${Part}`, () => removeHeaderFooter(part), { icon: 'trash' }),
          ],
        },
      ],
    });
  };
  hf('header');
  hf('footer');

  const pn = (part: 'header' | 'footer'): PItem[] => [
    { label: 'Plain Number, Left', glyph: pageNumGlyph(part, 'left', false), cmd: 'insert.pageNumber', params: { position: part, align: 'left', withTotal: false } },
    { label: 'Plain Number, Centre', glyph: pageNumGlyph(part, 'center', false), cmd: 'insert.pageNumber', params: { position: part, align: 'center', withTotal: false } },
    { label: 'Plain Number, Right', glyph: pageNumGlyph(part, 'right', false), cmd: 'insert.pageNumber', params: { position: part, align: 'right', withTotal: false } },
    { label: 'Page X of Y, Left', glyph: pageNumGlyph(part, 'left', true), cmd: 'insert.pageNumber', params: { position: part, align: 'left', withTotal: true } },
    { label: 'Page X of Y, Centre', glyph: pageNumGlyph(part, 'center', true), cmd: 'insert.pageNumber', params: { position: part, align: 'center', withTotal: true } },
    { label: 'Page X of Y, Right', glyph: pageNumGlyph(part, 'right', true), cmd: 'insert.pageNumber', params: { position: part, align: 'right', withTotal: true } },
  ];
  registerPanel({
    id: 'pagenumber',
    w: 292,
    secs: [
      { t: 'head', text: 'Top of Page' },
      { t: 'tiles', cols: 3, tw: 84, th: 84, tiles: pn('header') },
      { t: 'head', text: 'Bottom of Page' },
      { t: 'tiles', cols: 3, tw: 84, th: 84, tiles: pn('footer') },
      { t: 'sep' },
      {
        t: 'rows',
        rows: [
          R('Restart at 1', 'layout.restartNumbering', { start: 1 }, { icon: 'pageNumber' }),
          R('Continue from Previous Section', 'layout.restartNumbering', {}, { icon: 'pageNumber' }),
          R('Header and Footer Options...', 'insert.headerFooter', undefined, { icon: 'headerFooter' }),
          X('Remove Page Numbers', () => removePageNumbers(), { icon: 'trash' }),
        ],
      },
    ],
  });

  registerPanel({
    id: 'textbox',
    w: 248,
    secs: [
      { t: 'head', text: 'Built-In' },
      {
        t: 'tiles', cols: 3, tw: 72, th: 60,
        tiles: [
          { label: 'Simple Text Box', glyph: SHAPE_GLYPH.textBox, cmd: 'insert.textBox' },
          { label: 'Pull Quote', glyph: SHAPE_GLYPH.callout, cmd: 'insert.textBox', params: { text: 'Type a quote from the document, or the summary of an interesting point.' } },
          { label: 'Sidebar', glyph: SHAPE_GLYPH.rect, cmd: 'insert.textBox', params: { text: 'Sidebar' } },
        ],
      },
    ],
  });

  registerPanel({
    id: 'quickparts',
    secs: [{
      t: 'rows',
      rows: [
        R('Building Blocks...', 'insert.block', {}, { icon: 'blocks' }),
        R('Save Selection to Gallery...', 'blocks.save', undefined, { icon: 'quickParts' }),
        R('Field...', 'field.insert', {}, { icon: 'fieldInfo' }),
        R('Variable', 'insert.variable', undefined, { icon: 'fieldInfo' }),
        R('Placeholder', 'insert.placeholder', undefined, { icon: 'fieldInfo' }),
        R('Update Fields', 'fields.update', undefined, { icon: 'refresh' }),
        R('Manage Components...', 'collab.component.manage', undefined, { icon: 'blocks' }),
        R('Create Component...', 'collab.component.create', undefined, { icon: 'blocks' }),
        R('Insert Component...', 'collab.component.insert', undefined, { icon: 'blocks' }),
        R('Unlink Component', 'collab.component.unlink', undefined, { icon: 'unlink' }),
      ],
    }],
  });

  registerPanel({
    id: 'wordart',
    w: 252,
    secs: [
      { t: 'head', text: 'Text Art' },
      {
        t: 'tiles', cols: 3, tw: 72, th: 52,
        tiles: [['fill', 'Fill'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['gradient', 'Gradient'], ['glow', 'Glow'], ['retro', 'Retro']].map(([s, n]) => ({ label: n, glyph: wordArtGlyph(s), cmd: 'insert.wordArt', params: { style: s } })),
      },
    ],
  });

  registerPanel({
    id: 'dropcap',
    w: 252,
    secs: [
      {
        t: 'tiles', cols: 3, tw: 72, th: 64,
        tiles: [
          { label: 'None', glyph: dropCapGlyph('none'), cmd: 'paragraph.dropCap', params: { mode: 'none' } },
          { label: 'Dropped', glyph: dropCapGlyph('dropped'), cmd: 'paragraph.dropCap', params: { mode: 'dropped', lines: 3 } },
          { label: 'In Margin', glyph: dropCapGlyph('margin'), cmd: 'paragraph.dropCap', params: { mode: 'margin', lines: 3 } },
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Drop Cap Options...', 'paragraph.dropCap', {}, { icon: 'dropCap' })] },
    ],
  });

  registerPanel({
    id: 'equation',
    w: 332,
    secs: [
      { t: 'head', text: 'Common equations' },
      {
        t: 'tiles', cols: 1, tw: 300, th: 52, names: false,
        tiles: EQUATIONS.map(([n, latex]) => ({ label: n, glyph: equationGlyph(renderMath(latex, false)), cmd: 'insert.equation', params: { latex, display: true } })),
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Insert New Equation', 'insert.equation', undefined, { icon: 'equation', keys: 'Alt+=' })] },
    ],
  });

  registerPanel({
    id: 'symbol',
    w: 224,
    secs: [
      { t: 'head', text: 'Symbols' },
      { t: 'custom', build: symbolGrid.build, patch: symbolGrid.patch },
      { t: 'sep' },
      { t: 'rows', rows: [R('More Symbols...', 'insert.symbol', undefined, { icon: 'omega' })] },
    ],
  });
}
