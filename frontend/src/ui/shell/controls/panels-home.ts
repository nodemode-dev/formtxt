import { bulletStyle, mergePaste, numberStyle, toggleSpace } from './actions';
import { borderGlyph, bulletGlyph, multiGlyph, numberGlyph } from './glyphs';
import { R, X } from './helpers';
import { registerPanel } from './popover';
import { paraInfo } from './state';
import type { PItem } from './types';
import { icon } from '../../icons';

const inline = (name: string): string => icon(name, 28);

const BULLETS = ['', '•', '○', '▪', '➤', '✓', '–', '◆'];
const bulletTile = (ch: string): PItem => ({
  label: ch ? `Bullet ${ch}` : 'None',
  glyph: bulletGlyph(ch),
  run: () => bulletStyle(ch),
  on: () => { const p = paraInfo(); return ch ? p.list === 'bullet' && (p.bullet === ch || (!p.bullet && ch === '•')) : p.list !== 'bullet'; },
});

const NUMBERS: Array<[string, string, string, string[]]> = [
  ['None', '', '', []],
  ['1. 2. 3.', 'decimal', '.', ['1.', '2.', '3.']],
  ['1) 2) 3)', 'decimal', ')', ['1)', '2)', '3)']],
  ['I. II. III.', 'upper-roman', '.', ['I.', 'II.', 'III.']],
  ['A. B. C.', 'upper-alpha', '.', ['A.', 'B.', 'C.']],
  ['a) b) c)', 'lower-alpha', ')', ['a)', 'b)', 'c)']],
  ['i. ii. iii.', 'lower-roman', '.', ['i.', 'ii.', 'iii.']],
];
const numberTile = ([label, fmt, suf, shown]: [string, string, string, string[]]): PItem => ({
  label,
  glyph: numberGlyph(shown),
  run: () => numberStyle(fmt, suf),
  on: () => { const p = paraInfo(); return fmt ? p.list === 'number' && p.fmt === fmt && (p.suffix || '.') === suf : p.list !== 'number'; },
});

const SPACINGS: Array<[string, number]> = [['1.0', 1], ['1.15', 1.15], ['1.5', 1.5], ['2.0', 2], ['2.5', 2.5], ['3.0', 3]];

const underline = (label: string, style: string): PItem => R(label, 'format.underlineStyle', { style });

export function registerHomePanels(): void {
  registerPanel({
    id: 'paste',
    w: 232,
    secs: [
      { t: 'head', text: 'Paste Options' },
      {
        t: 'tiles', cols: 3, tw: 64, th: 44,
        tiles: [
          { label: 'Keep Source Formatting', glyph: inline('paste'), cmd: 'edit.paste' },
          { label: 'Merge Formatting', glyph: inline('paragraph'), run: () => mergePaste() },
          { label: 'Keep Text Only', glyph: inline('fileText'), cmd: 'edit.pastePlain' },
        ],
      },
    ],
  });

  registerPanel({
    id: 'case',
    secs: [{
      t: 'rows',
      rows: [
        R('Sentence case.', 'format.case.sentence', undefined, { icon: 'changeCase' }),
        R('lowercase', 'format.case.lower', undefined, { icon: 'changeCase' }),
        R('UPPERCASE', 'format.case.upper', undefined, { icon: 'changeCase' }),
        R('Capitalize Each Word', 'format.case.title', undefined, { icon: 'changeCase' }),
        R('tOGGLE cASE', 'format.case.toggle', undefined, { icon: 'changeCase' }),
      ],
    }],
  });

  registerPanel({
    id: 'texteffects',
    secs: [{
      t: 'rows',
      rows: [
        R('Small Caps', 'format.smallCaps', undefined, { icon: 'textEffects' }),
        R('All Caps', 'format.allCaps', undefined, { icon: 'textEffects' }),
        R('Character Spacing: Expanded 1 pt', 'format.characterSpacing', { pt: 1 }),
        R('Character Spacing: Condensed 1 pt', 'format.characterSpacing', { pt: -1 }),
        R('Character Spacing: Normal', 'format.characterSpacing', { pt: 0 }),
        R('Typography...', 'font.typography', undefined, { icon: 'fonts' }),
        R('Font Advanced Options...', 'font.advanced', undefined, { icon: 'fonts' }),
      ],
    }],
  });

  registerPanel({
    id: 'underline',
    secs: [{
      t: 'rows',
      rows: [
        underline('Single', 'single'),
        underline('Double', 'double'),
        underline('Dotted', 'dotted'),
        underline('Dashed', 'dash'),
        underline('Wavy', 'wavy'),
        R('No Underline', 'format.underlineStyle', { style: '' }),
      ],
    }],
  });

  registerPanel({
    id: 'fontColor',
    cls: 'ft-pp-colors',
    secs: [{ t: 'palette', cmd: 'format.color', key: 'value', auto: 'Automatic', theme: true, standard: true, recent: 'font', more: 'More Colors...', swatch: true }],
  });

  registerPanel({
    id: 'highlight',
    cls: 'ft-pp-colors',
    secs: [{ t: 'palette', cmd: 'format.highlight', key: 'value', none: 'No Color', noneValue: '', hl: true, swatch: true }],
  });

  registerPanel({
    id: 'bullets',
    w: 268,
    secs: [
      { t: 'head', text: 'Bullet Library' },
      { t: 'tiles', cols: 4, tw: 60, th: 44, tiles: BULLETS.map(bulletTile), names: false },
      { t: 'sep' },
      { t: 'rows', rows: [R('Define New Bullet...', 'list.format', undefined, { icon: 'listFormat' })] },
    ],
  });

  registerPanel({
    id: 'numbering',
    w: 268,
    secs: [
      { t: 'head', text: 'Numbering Library' },
      { t: 'tiles', cols: 4, tw: 60, th: 44, tiles: NUMBERS.map(numberTile), names: false },
      { t: 'sep' },
      { t: 'rows', rows: [R('Set Numbering Value...', 'list.format', undefined, { icon: 'listFormat' })] },
    ],
  });

  registerPanel({
    id: 'multilevel',
    w: 252,
    secs: [
      { t: 'head', text: 'List Library' },
      {
        t: 'tiles', cols: 3, tw: 72, th: 56,
        tiles: [
          { label: 'None', glyph: numberGlyph([]), cmd: 'list.multilevel', params: { scheme: 'none' } },
          { label: 'Legal', glyph: multiGlyph([[0, '1'], [1, '1.1'], [2, '1.1.1'], [1, '1.2'], [0, '2']]), cmd: 'list.multilevel', params: { scheme: 'legal' } },
          { label: 'Outline', glyph: multiGlyph([[0, '1.'], [1, 'a.'], [2, 'i.'], [1, 'b.'], [0, '2.']]), cmd: 'list.multilevel', params: { scheme: 'outline' } },
          { label: 'Article', glyph: multiGlyph([[0, 'I.'], [1, 'A.'], [2, '1.'], [1, 'B.'], [0, 'II.']]), cmd: 'list.multilevel', params: { scheme: 'article' } },
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Define New Multilevel List...', 'list.multilevel', undefined, { icon: 'outline' })] },
    ],
  });

  registerPanel({
    id: 'linespacing',
    w: 290,
    secs: [
      {
        t: 'rows',
        rows: SPACINGS.map(([n, v]) => R(n, 'paragraph.lineSpacing', { value: v }, { on: () => Math.abs(paraInfo().spacing - v) < 0.02 })),
      },
      { t: 'sep' },
      {
        t: 'rows',
        rows: [
          R('Line Spacing Options...', 'format.paragraph', undefined, { icon: 'paraSpacing' }),
          X(() => (paraInfo().before > 0 ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph'), () => toggleSpace('spaceBefore'), { icon: 'spaceBefore' }),
          X(() => (paraInfo().after > 0 ? 'Remove Space After Paragraph' : 'Add Space After Paragraph'), () => toggleSpace('spaceAfter'), { icon: 'spaceAfter' }),
        ],
      },
    ],
  });

  registerPanel({
    id: 'shading',
    cls: 'ft-pp-colors',
    secs: [{ t: 'palette', cmd: 'paragraph.shading', key: 'color', none: 'No Color', noneValue: 'none', theme: true, standard: true, recent: 'shade', more: 'More Colors...', swatch: true }],
  });

  registerPanel({
    id: 'borders',
    remember: true,
    secs: [
      {
        t: 'rows',
        rows: [
          R('Bottom Border', 'paragraph.borders', { which: 'bottom' }, { glyph: borderGlyph('bottom') }),
          R('Top Border', 'paragraph.borders', { which: 'top' }, { glyph: borderGlyph('top') }),
          R('Left Border', 'paragraph.borders', { which: 'left' }, { glyph: borderGlyph('left') }),
          R('Right Border', 'paragraph.borders', { which: 'right' }, { glyph: borderGlyph('right') }),
          R('No Border', 'paragraph.borders', { which: 'none' }, { glyph: borderGlyph('none') }),
          R('All Borders', 'paragraph.borders', { which: 'box' }, { glyph: borderGlyph('box') }),
          R('Outside Borders', 'paragraph.borders', { which: 'box' }, { glyph: borderGlyph('box') }),
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Borders and Shading...', 'format.paragraph', undefined, { icon: 'paraBorders', keep: false })] },
    ],
  });

  registerPanel({
    id: 'find',
    secs: [{
      t: 'rows',
      rows: [
        R('Find', 'edit.find', undefined, { icon: 'find', keys: 'Ctrl+F' }),
        R('Advanced Find...', 'edit.find', undefined, { icon: 'find' }),
        R('Go To...', 'edit.goTo', undefined, { icon: 'goTo', keys: 'Ctrl+G' }),
      ],
    }],
  });

  registerPanel({
    id: 'select',
    secs: [{
      t: 'rows',
      rows: [
        R('Select All', 'edit.selectAll', undefined, { icon: 'selectAll', keys: 'Ctrl+A' }),
        R('Select Next Picture', 'picture.select', undefined, { icon: 'image' }),
        R('Select Next Shape', 'shape.select', undefined, { icon: 'shapes' }),
        R('Select Next Chart', 'chart.select', undefined, { icon: 'chart' }),
        R('Select Next Diagram', 'diagram.select', undefined, { icon: 'diagram' }),
      ],
    }],
  });
}
