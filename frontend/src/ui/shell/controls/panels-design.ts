import { STYLE_SETS } from '../../../editor/stylesets';
import { documentSpacing } from './actions';
import { watermarkGlyph } from './glyphs';
import { R, X } from './helpers';
import { registerPanel } from './popover';
import type { PItem } from './types';

const setGlyph = (s: (typeof STYLE_SETS)[number]): string => {
  const h = s.heading;
  const align = s.titleAlign === 'center' ? 'center' : 'left';
  return `<span class="ft-th-set" style="--sf:'${s.body.font}';--hf:'${h.font}';--hc:${h.color};--bc:${s.body.color};text-align:${align}"><span class="ft-th-set-t" style="${h.italic ? 'font-style:italic' : ''}">Title</span><span class="ft-th-set-h">Heading</span><span class="ft-th-set-b">Body text sample</span></span>`;
};

const SPACING: Array<[string, number, number, number]> = [
  ['No Paragraph Space', 1, 0, 0],
  ['Compact', 1, 0, 4],
  ['Tight', 1.15, 0, 6],
  ['Open', 1.15, 0, 10],
  ['Relaxed', 1.5, 0, 6],
  ['Double', 2, 0, 8],
];

const WATERMARKS = ['DRAFT', 'CONFIDENTIAL', 'INTERNAL', 'REVIEW', 'DO NOT COPY', 'SAMPLE'];

export function registerDesignPanels(): void {
  registerPanel({
    id: 'styleset',
    w: 336,
    secs: [
      { t: 'head', text: 'Built-In' },
      {
        t: 'tiles', cols: 3, tw: 96, th: 70,
        tiles: STYLE_SETS.map((s): PItem => ({ label: s.name, glyph: setGlyph(s), cmd: 'format.styleSet', params: { set: s.id } })),
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Browse Style Sets...', 'format.styleSet', undefined, { icon: 'styleSet' })] },
    ],
  });

  registerPanel({
    id: 'docfonts',
    secs: [{
      t: 'rows',
      rows: [
        R('Add Font...', 'font.add', undefined, { icon: 'fonts' }),
        R('Manage Fonts...', 'font.manage', undefined, { icon: 'fonts' }),
        R('Refresh Font List', 'font.refresh', undefined, { icon: 'refresh' }),
        R('Embed Fonts in Document', 'document.embedFonts', { on: true }, { icon: 'fonts' }),
        R('Stop Embedding Fonts', 'document.embedFonts', { on: false }, { icon: 'fonts' }),
      ],
    }],
  });

  registerPanel({
    id: 'parspacing',
    w: 252,
    secs: [
      { t: 'head', text: 'Paragraph Spacing' },
      {
        t: 'rows',
        rows: SPACING.map(([n, line, before, after]) => X(n, () => documentSpacing(line, before, after), { icon: 'paraSpacing', sub: `${line.toFixed(2).replace(/0$/, '')} line, ${after} pt after` })),
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Custom Paragraph Spacing...', 'format.paragraph', undefined, { icon: 'paragraph' })] },
    ],
  });

  registerPanel({
    id: 'watermark',
    w: 292,
    secs: [
      { t: 'head', text: 'Built-In' },
      {
        t: 'tiles', cols: 3, tw: 84, th: 84,
        tiles: WATERMARKS.map((w): PItem => ({ label: w[0] + w.slice(1).toLowerCase(), glyph: watermarkGlyph(w.length > 8 ? w.split(' ')[0] : w), cmd: 'design.watermark', params: { preset: w } })),
      },
      { t: 'sep' },
      { t: 'rows', rows: [R('Custom Watermark...', 'design.watermark', undefined, { icon: 'watermark' }), R('Remove Watermark', 'design.watermark', { preset: 'remove' }, { icon: 'trash' })] },
    ],
  });

  registerPanel({
    id: 'pagecolor',
    cls: 'ft-pp-colors',
    secs: [{ t: 'palette', cmd: 'design.pageColor', key: 'color', none: 'No Color', noneValue: '', theme: true, standard: true, recent: 'page', more: 'More Colors...' }],
  });

  registerPanel({
    id: 'pageborders',
    secs: [{
      t: 'rows',
      rows: [
        R('Thin', 'design.pageBorders', { style: 'thin' }, { icon: 'pageBorders' }),
        R('Double', 'design.pageBorders', { style: 'double' }, { icon: 'pageBorders' }),
        R('Accent', 'design.pageBorders', { style: 'accent' }, { icon: 'pageBorders' }),
        R('None', 'design.pageBorders', { style: 'none' }, { icon: 'pageBorders' }),
        R('Borders and Shading...', 'design.pageBorders', undefined, { icon: 'pageSetup' }),
      ],
    }],
  });
}
