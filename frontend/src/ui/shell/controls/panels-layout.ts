import { shellCommands } from '../cmd';
import { columnsGlyph, pageMargins, pageOrient, pageSize, wrapGlyph } from './glyphs';
import { R } from './helpers';
import { registerPanel } from './popover';
import { docRoot, objectCmd, objectSelected, pageInfo, sameMargins, selKind } from './state';
import type { PItem } from './types';

const MARGINS: Array<[string, number, number, number, number, string]> = [
  ['Normal', 1, 1, 1, 1, ''],
  ['Narrow', 0.5, 0.5, 0.5, 0.5, ''],
  ['Moderate', 1, 1, 0.75, 0.75, ''],
  ['Wide', 1, 1, 2, 2, ''],
  ['Mirrored', 1, 1, 1.25, 1, 'Inside 1.25", Outside 1"'],
  ['Office 2003 Default', 1, 1, 1.25, 1.25, ''],
];

const fmt = (n: number): string => `${n}"`;

const SIZES: Array<[string, string, number, number, string]> = [
  ['Letter', 'letter', 8.5, 11, '8.5" x 11"'],
  ['Legal', 'legal', 8.5, 14, '8.5" x 14"'],
  ['Executive', 'executive', 7.25, 10.5, '7.25" x 10.5"'],
  ['Tabloid', 'tabloid', 11, 17, '11" x 17"'],
  ['A4', 'a4', 8.27, 11.69, '8.27" x 11.69"'],
  ['A5', 'a5', 5.83, 8.27, '5.83" x 8.27"'],
];

const WRAPS: Array<[string, string, string, string]> = [
  ['In Line with Text', 'inline', 'inline', ''],
  ['Square', 'square', 'square', ''],
  ['Tight', 'tight', 'tight', ''],
  ['Top and Bottom', 'topBottom', 'topBottom', ''],
  ['Behind Text', 'behind', 'behind', ''],
  ['In Front of Text', 'front', 'front', ''],
];

const wrapRun = (wrap: string, side?: string) => (): unknown => shellCommands.call(objectCmd('wrap'), side ? { wrap, side } : { wrap });

const rotateRun = (degrees: number) => (): unknown => shellCommands.call(selKind() === 'picture' ? 'picture.rotate' : 'shape.rotate', { degrees });

const hyph = (): string => docRoot()?.getAttribute('data-hyphenate') ?? 'off';

export function registerLayoutPanels(): void {
  registerPanel({
    id: 'margins',
    w: 268,
    secs: [
      {
        t: 'rows',
        rows: MARGINS.map(([n, t, b, l, r, note]): PItem => ({
          label: n,
          glyph: pageMargins(t, b, l, r),
          sub: `Top: ${fmt(t)}   Bottom: ${fmt(b)}\nLeft: ${fmt(l)}   Right: ${fmt(r)}${note ? `\n${note}` : ''}`,
          cmd: 'layout.setPage',
          params: { top: t, bottom: b, left: l, right: r },
          on: () => sameMargins(pageInfo(), t, b, l, r),
        })),
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Custom Margins...', 'layout.pageSetup', undefined, { icon: 'margins' })] },
    ],
  });

  registerPanel({
    id: 'orientation',
    secs: [{
      t: 'rows',
      rows: [
        R('Portrait', 'layout.setPage', { orientation: 'portrait' }, { glyph: pageOrient(false), on: () => pageInfo()?.orientation === 'portrait' }),
        R('Landscape', 'layout.setPage', { orientation: 'landscape' }, { glyph: pageOrient(true), on: () => pageInfo()?.orientation === 'landscape' }),
      ],
    }],
  });

  registerPanel({
    id: 'size',
    w: 232,
    secs: [
      { t: 'rows', rows: SIZES.map(([n, id, w, h, sub]): PItem => ({ label: n, sub, glyph: pageSize(w, h), cmd: 'layout.setPage', params: { size: id }, on: () => pageInfo()?.size === id })) },
      { t: 'sep' },
      { t: 'rows', rows: [R('More Paper Sizes...', 'layout.pageSetup', undefined, { icon: 'pageSize' })] },
    ],
  });

  registerPanel({
    id: 'columns',
    w: 220,
    secs: [
      {
        t: 'rows',
        rows: [
          R('One', 'layout.columns', { count: 1 }, { glyph: columnsGlyph(1), on: () => pageInfo()?.columns === 1 }),
          R('Two', 'layout.columns', { count: 2 }, { glyph: columnsGlyph(2), on: () => pageInfo()?.columns === 2 }),
          R('Three', 'layout.columns', { count: 3 }, { glyph: columnsGlyph(3), on: () => pageInfo()?.columns === 3 }),
          R('Four', 'layout.columns', { count: 4 }, { glyph: columnsGlyph(4), on: () => pageInfo()?.columns === 4 }),
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('More Columns...', 'layout.pageSetup', undefined, { icon: 'columns' })] },
    ],
  });

  registerPanel({
    id: 'breaks',
    w: 340,
    secs: [
      { t: 'head', text: 'Page Breaks' },
      {
        t: 'rows',
        rows: [
          R('Page', 'insert.pageBreak', undefined, { icon: 'pageBreak', sub: 'Mark the point at which one page ends and the next page begins.' }),
          R('Column', 'insert.columnBreak', undefined, { icon: 'columns', sub: 'Indicate that the text following the column break will begin in the next column.' }),
        ],
      },
      { t: 'head', text: 'Section Breaks' },
      {
        t: 'rows',
        rows: [
          R('Next Page', 'insert.sectionBreak', { start: 'nextPage' }, { icon: 'sectionBreak', sub: 'Insert a section break and start the new section on the next page.' }),
          R('Continuous', 'insert.sectionBreak', { start: 'continuous' }, { icon: 'sectionBreak', sub: 'Insert a section break and start the new section on the same page.' }),
          R('Even Page', 'insert.sectionBreak', { start: 'evenPage' }, { icon: 'sectionBreak', sub: 'Insert a section break and start the new section on the next even-numbered page.' }),
          R('Odd Page', 'insert.sectionBreak', { start: 'oddPage' }, { icon: 'sectionBreak', sub: 'Insert a section break and start the new section on the next odd-numbered page.' }),
        ],
      },
    ],
  });

  registerPanel({
    id: 'linenumbers',
    secs: [{
      t: 'rows',
      rows: [
        R('None', 'layout.lineNumbers', { mode: '' }, { icon: 'lineNumbers' }),
        R('Continuous', 'layout.lineNumbers', { mode: 'continuous' }, { icon: 'lineNumbers' }),
        R('Restart Each Page', 'layout.lineNumbers', { mode: 'page' }, { icon: 'lineNumbers' }),
        R('Toggle Line Numbers', 'layout.lineNumbersToggle', undefined, { icon: 'lineNumbers' }),
      ],
    }],
  });

  registerPanel({
    id: 'hyphenation',
    w: 232,
    secs: [{
      t: 'rows',
      rows: [
        R('None', 'proofing.hyphenation', { on: false }, { icon: 'hyphenation', on: () => hyph() === 'off' }),
        R('Automatic', 'proofing.hyphenation', { on: true }, { icon: 'hyphenation', on: () => hyph() !== 'off' }),
        R('Do Not Hyphenate This Paragraph', 'proofing.noHyphenate', undefined, { icon: 'hyphenation' }),
        R('Insert Soft Hyphen', 'proofing.softHyphen', undefined, { icon: 'hyphenation' }),
      ],
    }],
  });

  const needs = { off: (): boolean => !objectSelected() };

  registerPanel({
    id: 'position',
    w: 264,
    enabled: objectSelected,
    secs: [
      { t: 'head', text: 'In Line with Text' },
      { t: 'tiles', cols: 3, tw: 76, th: 56, tiles: [{ label: 'In Line with Text', glyph: wrapGlyph('inline'), run: wrapRun('inline') }] },
      { t: 'head', text: 'With Text Wrapping' },
      {
        t: 'tiles', cols: 3, tw: 76, th: 56,
        tiles: [
          { label: 'Square, Left', glyph: wrapGlyph('square'), run: wrapRun('square', 'left') },
          { label: 'Square, Centre', glyph: wrapGlyph('square'), run: wrapRun('square', 'center') },
          { label: 'Square, Right', glyph: wrapGlyph('square'), run: wrapRun('square', 'right') },
        ],
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('More Layout Options...', 'picture.properties', undefined, { icon: 'position' })] },
    ],
  });

  registerPanel({
    id: 'wrap',
    w: 240,
    enabled: objectSelected,
    secs: [{ t: 'rows', rows: WRAPS.map(([n, id, g]): PItem => ({ label: n, glyph: wrapGlyph(g), run: wrapRun(id), ...needs })) }],
  });

  registerPanel({
    id: 'forward',
    w: 232,
    enabled: objectSelected,
    secs: [{ t: 'rows', rows: [{ label: 'Bring in Front of Text', icon: 'bringForward', run: wrapRun('front') }] }],
  });

  registerPanel({
    id: 'backward',
    w: 232,
    enabled: objectSelected,
    secs: [{ t: 'rows', rows: [{ label: 'Send Behind Text', icon: 'sendBackward', run: wrapRun('behind') }] }],
  });

  registerPanel({
    id: 'rotate',
    w: 232,
    enabled: () => ['picture', 'shape'].includes(selKind()),
    secs: [{
      t: 'rows',
      rows: [
        { label: 'Rotate Right 90', icon: 'rotate', run: rotateRun(90) },
        { label: 'Rotate Left 90', icon: 'rotate', run: rotateRun(270) },
        { label: 'Rotate 180', icon: 'rotate', run: rotateRun(180) },
        { label: 'Reset Rotation', icon: 'rotate', run: rotateRun(0) },
      ],
    }],
  });
}
