import type { Style } from '../engine/model';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, setText } from '../ui/dom';
import { setCellAttr } from 'prosemirror-tables';
import { type DocEditor, FONTS } from './editor';
import { selectedPicture, setPicture } from './picture';
import { CHART_FNS, CHART_LABELS, type ChartData, type ChartOptions, SAMPLE, SERIES_COLORS, gridText, insertChart, paint, parseGrid, selectedChart, setChart } from './chart/chart';
import { CHART_KINDS } from './chart/types';
import { SYMBOL_GROUPS } from './symbols';
import { SHAPES, SHAPE_LABELS, WORDART, insertShape, selectedShape, setShape, shapeDefaults, shapePath } from './shape';
import { MATH_SNIPPETS, loadMathFonts, putMath, renderMath, selectedMath } from './math';
import { DIAGRAM_CATEGORIES, DIAGRAM_LAYOUTS, type DiagramItem, insertDiagram, itemsToText, renderDiagram, sampleItems, selectedDiagram, setDiagram, textToItems } from './diagram';
import { api } from '../io/api';
import { toast } from '../ui/toast';
import { distributeColumns, insertTable, setCellShading, setTableAttr, sortTable, tableInfo } from './table';

function num(v: unknown, fallback = ''): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback;
}

function input(type: string, value: string, attrs = ''): HTMLInputElement {
  const n = el<HTMLInputElement>(`<input class="ft-input" type="${type}" ${attrs}>`);
  if (type === 'checkbox') n.checked = value === 'true'; else n.value = value;
  return n;
}

function select(options: Array<[string, string]>, value: string): HTMLSelectElement {
  const s = el<HTMLSelectElement>(`<select class="ft-input">${options.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>`);
  s.value = value;
  return s;
}

function grid(d: Dialog, rows: Array<[string, HTMLElement]>): void {
  const g = el('<div class="ft-form-grid"></div>');
  for (const [label, control] of rows) {
    const l = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    setText(l.querySelector('.ft-field-label'), label);
    l.appendChild(control);
    g.appendChild(l);
  }
  d.body.appendChild(g);
}

export function parseTabs(text: string): Array<{ pos: number; align: string; leader: string }> | null {
  const out = text.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [pos, align = 'left', leader = 'none'] = s.split(/\s+/);
    return { pos: Number(pos), align, leader };
  }).filter((t) => Number.isFinite(t.pos) && t.pos > 0 && ['left', 'center', 'right', 'decimal'].includes(t.align));
  return out.length ? out.sort((a, b) => a.pos - b.pos) : null;
}

export function paragraphDialog(ed: DocEditor): void {
  const a = ed.currentPara();
  const d = new Dialog('Paragraph', 560);
  const align = select([['', 'Style default'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']], String(a.align ?? ''));
  const left = input('number', num(a.indent, '0'), 'step="1" min="0"');
  const right = input('number', num(a.indentRight, '0'), 'step="1" min="0"');
  const first = input('number', num(a.indentFirst, '0'), 'step="1"');
  const before = input('number', num(a.spaceBefore), 'step="1" min="0" placeholder="Style"');
  const after = input('number', num(a.spaceAfter), 'step="1" min="0" placeholder="Style"');
  const line = input('number', num(a.lineSpacing), 'step="0.05" min="0.5" placeholder="Style"');
  const keepNext = input('checkbox', String(!!a.keepNext));
  const keepLines = input('checkbox', String(!!a.keepLines));
  const widow = input('checkbox', String(a.widowControl !== false));
  const border = select([['', 'None'], ['box', 'Box'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], String(a.border ?? ''));
  const shading = input('color', String(a.shading || '#ffffff'));
  const noShade = input('checkbox', String(!a.shading));
  const tabs = input('text', Array.isArray(a.tabs) ? (a.tabs as Array<{ pos: number; align: string; leader: string }>).map((t) => `${t.pos} ${t.align}${t.leader !== 'none' ? ` ${t.leader}` : ''}`).join(', ') : '', 'placeholder="72 left, 288 right dot" spellcheck="false"');
  grid(d, [['Alignment', align], ['Left indent (pt)', left], ['Right indent (pt)', right], ['First line (pt, negative hangs)', first],
    ['Space before (pt)', before], ['Space after (pt)', after], ['Line spacing (multiple)', line], ['Border', border],
    ['Shading', shading], ['No shading', noShade], ['Keep with next', keepNext], ['Keep lines together', keepLines], ['Widow and orphan control', widow]]);
  d.field('Tab stops (points, alignment, optional dot, dash or underline leader)', tabs);
  d.body.appendChild(el('<p class="ft-note">Keep with next, keep lines together, widow and orphan control and tab stops take effect on the page and are exported to Word with the exchange phase.</p>'));
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const n = (i: HTMLInputElement): number | null => (i.value.trim() === '' ? null : Number(i.value));
    ed.paraProps({
      align: align.value, indent: n(left) ?? 0, indentRight: n(right) ?? 0, indentFirst: n(first) ?? 0,
      spaceBefore: n(before), spaceAfter: n(after), lineSpacing: n(line),
      keepNext: keepNext.checked, keepLines: keepLines.checked, widowControl: widow.checked,
      border: border.value, shading: noShade.checked ? '' : shading.value, tabs: parseTabs(tabs.value),
    });
    d.close();
  });
  d.open(align);
}

export function stylesDialog(ed: DocEditor): void {
  const styles = ed.styles();
  const sid = ed.currentStyleId();
  const style = styles[sid];
  const d = new Dialog(`Style: ${style?.name ?? sid}`, 600);
  const paraIds = Object.entries(styles).filter(([, s]) => s.type === 'paragraph');
  const opts = paraIds.map(([id, s]) => [id, s.name] as [string, string]);
  const name = input('text', style?.name ?? sid, 'spellcheck="false"');
  const basedOn = select([['', 'None'], ...opts.filter(([id]) => id !== sid)], style?.basedOn ?? '');
  const next = select(opts, style?.next ?? sid);
  const own = { run: style?.run ?? {}, para: style?.para ?? {} } as { run: Record<string, unknown>; para: Record<string, unknown> };
  const eff = ed.resolvedStyle(sid);
  const font = select(FONTS.map((f) => [f, f]), String(own.run.font ?? eff.run.font ?? 'Inter'));
  const size = input('number', num(own.run.size ?? eff.run.size, '11'), 'step="0.5" min="1"');
  const color = input('color', String(own.run.color ?? eff.run.color ?? '#1a1a1a'));
  const bold = input('checkbox', String(!!(own.run.bold ?? eff.run.bold)));
  const italic = input('checkbox', String(!!(own.run.italic ?? eff.run.italic)));
  const align = select([['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']], String(own.para.align ?? eff.para.align ?? 'left'));
  const before = input('number', num(own.para.spaceBefore ?? eff.para.spaceBefore, '0'), 'step="1" min="0"');
  const after = input('number', num(own.para.spaceAfter ?? eff.para.spaceAfter, '8'), 'step="1" min="0"');
  const line = input('number', num(own.para.lineSpacing ?? eff.para.lineSpacing, '1.15'), 'step="0.05" min="0.5"');
  grid(d, [['Name', name], ['Based on', basedOn], ['Next paragraph', next], ['Font', font], ['Size (pt)', size], ['Colour', color],
    ['Bold', bold], ['Italic', italic], ['Alignment', align], ['Space before (pt)', before], ['Space after (pt)', after], ['Line spacing', line]]);
  const read = (): Style => ({
    type: 'paragraph', name: name.value.trim() || sid, basedOn: basedOn.value || null, next: next.value || sid,
    run: { ...own.run, font: font.value, size: Number(size.value) || 11, color: color.value, bold: bold.checked, italic: italic.checked },
    para: { ...own.para, align: align.value as 'left', spaceBefore: Number(before.value) || 0, spaceAfter: Number(after.value) || 0, lineSpacing: Number(line.value) || 1.15 },
  });
  d.button('New style from these', 'ghost', () => {
    const base = read();
    let id = base.name.replace(/[^A-Za-z0-9]/g, '') || 'Custom';
    while (styles[id]) id += '1';
    ed.setStyles({ ...styles, [id]: { ...base, basedOn: sid === id ? null : sid, next: id } });
    ed.style(id);
    d.close();
  });
  d.button('Match selection', 'ghost', () => {
    const p = ed.currentPara();
    const s = read();
    const para = { ...s.para } as Record<string, unknown>;
    for (const k of ['align', 'spaceBefore', 'spaceAfter', 'lineSpacing']) if (p[k] !== null && p[k] !== '' && p[k] !== undefined) para[k] = p[k];
    ed.setStyles({ ...styles, [sid]: { ...s, para } });
    ed.paraProps({ align: '', spaceBefore: null, spaceAfter: null, lineSpacing: null });
    d.close();
  });
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Save style', 'primary', () => { ed.setStyles({ ...styles, [sid]: read() }); d.close(); });
  d.open(name);
}

export const PAGE_SIZES: Record<string, [string, number, number]> = {
  letter: ['US Letter, 8.5 x 11 in', 612, 792], legal: ['US Legal, 8.5 x 14 in', 612, 1008], a4: ['A4, 210 x 297 mm', 595.28, 841.89],
  a5: ['A5, 148 x 210 mm', 419.53, 595.28], executive: ['Executive, 7.25 x 10.5 in', 522, 756], tabloid: ['Tabloid, 11 x 17 in', 792, 1224],
};

export function pageGeometry(size: string, orientation: string): { size: string; width: number; height: number; orientation: 'portrait' | 'landscape' } {
  const [, w, h] = PAGE_SIZES[size] ?? PAGE_SIZES.letter;
  const land = orientation === 'landscape';
  return { size: PAGE_SIZES[size] ? size : 'letter', width: land ? h : w, height: land ? w : h, orientation: land ? 'landscape' : 'portrait' };
}

export function pageSetupDialog(ed: DocEditor): void {
  const s = ed.section();
  if (!s) throw new Error('Open a document first.');
  const settings = (ed.doc?.settings ?? {}) as unknown as Record<string, unknown>;
  const d = new Dialog('Page setup', 600);
  const size = select(Object.entries(PAGE_SIZES).map(([k, v]) => [k, v[0]]), s.page.size);
  const orient = select([['portrait', 'Portrait'], ['landscape', 'Landscape']], s.page.orientation);
  const m = s.margins;
  const inch = (pt: number): string => String(+(pt / 72).toFixed(2));
  const mi = (v: number): HTMLInputElement => input('number', inch(v), 'step="0.05" min="0"');
  const top = mi(m.top), bottom = mi(m.bottom), left = mi(m.left), right = mi(m.right), header = mi(m.header), footer = mi(m.footer);
  const color = input('color', s.pageColor || '#ffffff');
  const border = select([['', 'None'], ['thin', 'Thin line'], ['double', 'Double line'], ['accent', 'Accent colour']], s.pageBorder ?? '');
  const watermark = input('text', String(settings.watermark ?? ''), 'placeholder="For example DRAFT" spellcheck="false"');
  const pageless = input('checkbox', String(!!settings.pageless));
  const lines = select([['', 'None'], ['continuous', 'Continuous'], ['page', 'Restart each page']], String(settings.lineNumbers ?? ''));
  grid(d, [['Paper size', size], ['Orientation', orient], ['Top margin (in)', top], ['Bottom margin (in)', bottom], ['Left margin (in)', left], ['Right margin (in)', right],
    ['Header from edge (in)', header], ['Footer from edge (in)', footer], ['Page colour', color], ['Page border', border], ['Watermark text', watermark], ['Line numbers', lines], ['Pageless', pageless]]);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const pt = (i: HTMLInputElement, fallback: number): number => (i.value.trim() === '' ? fallback : Math.max(0, Number(i.value) * 72));
    ed.updatePage({
      page: pageGeometry(size.value, orient.value),
      margins: { ...m, top: pt(top, m.top), bottom: pt(bottom, m.bottom), left: pt(left, m.left), right: pt(right, m.right), header: pt(header, m.header), footer: pt(footer, m.footer) },
      pageColor: color.value.toLowerCase() === '#ffffff' ? '' : color.value, pageBorder: border.value,
    }, { watermark: watermark.value.trim(), pageless: pageless.checked, lineNumbers: lines.value });
    d.close();
  });
  d.open(size);
}

export function headerFooterDialog(ed: DocEditor, focus: 'headers' | 'footers' = 'headers', sectionId?: string): void {
  const s = ed.sectionById(sectionId ?? ed.currentSectionId());
  if (!s) throw new Error('Open a document first.');
  const settings = (ed.doc?.settings ?? {}) as unknown as Record<string, unknown>;
  const d = new Dialog('Header and footer', 640);
  const part = (o: Record<string, unknown>, k: string): { text: string; align: string } => (o?.[k] as { text: string; align: string }) ?? { text: '', align: '' };
  const rows: Array<[string, HTMLElement]> = [];
  const fields: Record<string, { text: HTMLInputElement; align: HTMLSelectElement }> = {};
  for (const where of ['headers', 'footers'] as const) {
    for (const which of ['default', 'first', 'even'] as const) {
      const v = part(s[where] as Record<string, unknown>, which);
      const text = input('text', v.text, 'spellcheck="false" placeholder="Text; {PAGE} and {NUMPAGES} insert numbers"');
      const align = select([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], v.align || (where === 'footers' ? 'center' : 'left'));
      fields[`${where}.${which}`] = { text, align };
      const label = `${where === 'headers' ? 'Header' : 'Footer'}${which === 'default' ? '' : which === 'first' ? ', first page' : ', even pages'}`;
      rows.push([label, text], [`${label} alignment`, align]);
    }
  }
  const titlePage = input('checkbox', String(!!s.titlePage));
  const evenOdd = input('checkbox', String(!!settings.evenOdd));
  const fmt = select([['decimal', '1, 2, 3'], ['lowerRoman', 'i, ii, iii'], ['upperRoman', 'I, II, III'], ['lowerLetter', 'a, b, c'], ['upperLetter', 'A, B, C']], s.pageNumberFormat ?? 'decimal');
  const firstSection = ed.doc?.sections[0]?.id === s.id;
  const start = input('number', s.pageNumberStart === undefined ? (firstSection ? '1' : '') : String(s.pageNumberStart), `min="0" step="1"${firstSection ? '' : ' placeholder="Continue from the previous section"'}`);
  grid(d, [...rows, ['Different first page', titlePage], ['Different odd and even pages', evenOdd], ['Page number format', fmt], ['Start numbering at', start]]);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const collect = (where: string): Record<string, { text: string; align: string }> => {
      const out: Record<string, { text: string; align: string }> = {};
      for (const which of ['default', 'first', 'even']) {
        const f = fields[`${where}.${which}`];
        if (f.text.value.trim()) out[which] = { text: f.text.value, align: f.align.value };
      }
      return out;
    };
    ed.updateSectionById(s.id, { headers: collect('headers'), footers: collect('footers'), titlePage: titlePage.checked, pageNumberFormat: fmt.value, pageNumberStart: start.value.trim() === '' ? undefined : Math.max(0, Math.round(Number(start.value) || 1)) }, { evenOdd: evenOdd.checked });
    d.close();
  });
  d.open(fields[`${focus}.default`].text);
}

export function insertTableDialog(ed: DocEditor): void {
  const d = new Dialog('Insert table', 420);
  const rows = input('number', '3', 'min="1" max="200" step="1"');
  const cols = input('number', '3', 'min="1" max="40" step="1"');
  const header = input('checkbox', 'true');
  grid(d, [['Rows', rows], ['Columns', cols], ['Header row', header]]);
  const go = (): void => { ed.run(insertTable(Number(rows.value) || 3, Number(cols.value) || 3, ed.bodyWidth(), header.checked)); d.close(); };
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Insert', 'primary', go);
  d.body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  d.open(rows);
}

export function tablePropertiesDialog(ed: DocEditor): void {
  const info = ed.view ? tableInfo(ed.view.state) : null;
  if (!info) throw new Error('Put the cursor in a table first.');
  const d = new Dialog('Table properties', 520);
  const look = select([['grid', 'Grid'], ['plain', 'Plain'], ['rows', 'Rows only'], ['banded', 'Banded rows'], ['accent', 'Accent header']], info.look);
  const align = select([['', 'Left'], ['center', 'Centre']], info.align);
  const repeat = input('checkbox', String(info.repeatHeader));
  const width = input('number', String(Math.round(ed.bodyWidth())), 'min="36" step="1"');
  const shade = input('color', info.shading || '#f3f4f6');
  const noShade = input('checkbox', String(!info.shading));
  const valign = select([['', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], info.valign);
  const sortCol = input('number', String(info.col + 1), `min="1" max="${info.cols}" step="1"`);
  const sortDir = select([['asc', 'A to Z, smallest first'], ['desc', 'Z to A, largest first']], 'asc');
  grid(d, [['Look', look], ['Alignment on the page', align], ['Repeat header rows on each page', repeat], ['Table width when distributing (pt)', width],
    ['Cell shading', shade], ['Clear cell shading', noShade], ['Cell vertical alignment', valign], ['Sort by column', sortCol], ['Sort order', sortDir]]);
  d.body.appendChild(el(`<p class="ft-note">${info.rows} rows, ${info.cols} columns. Shading and vertical alignment apply to the selected cells.</p>`));
  d.button('Distribute columns', '', () => { ed.run(distributeColumns(Number(width.value) || ed.bodyWidth())); });
  d.button('Sort', '', () => { ed.run(sortTable(Number(sortCol.value) - 1, sortDir.value === 'desc')); });
  d.button('Cancel', 'ghost', () => d.close());
  shade.addEventListener('input', () => { noShade.checked = false; });
  d.button('Apply', 'primary', () => {
    if (look.value !== info.look) ed.run(setTableAttr('look', look.value));
    if (repeat.checked !== info.repeatHeader) ed.run(setTableAttr('repeatHeader', repeat.checked));
    if (align.value !== info.align) ed.run(setTableAttr('align', align.value));
    const shading = noShade.checked ? '' : shade.value;
    if (shading !== info.shading) ed.run(setCellShading(shading));
    if (valign.value !== info.valign) ed.run(setCellAttr('valign', valign.value));
    d.close();
  });
  d.open(look);
}

export function picturePropertiesDialog(ed: DocEditor): void {
  const pic = ed.view ? selectedPicture(ed.view.state) : null;
  if (!pic) throw new Error('Click a picture first.');
  const a = pic.node.attrs;
  const crop = (a.crop ?? {}) as Partial<Record<'t' | 'r' | 'b' | 'l', number>>;
  const pct = (v: unknown): string => String(Math.round((Number(v) || 0) * 1000) / 10);
  const d = new Dialog('Picture', 600);
  const alt = input('text', String(a.alt ?? ''), 'spellcheck="true" placeholder="Describe the picture for people using screen readers"');
  const wrap = select([['inline', 'In line with text'], ['square', 'Square'], ['tight', 'Tight'], ['topBottom', 'Top and bottom'], ['behind', 'Behind text'], ['front', 'In front of text']], String(a.wrap));
  const side = select([['left', 'Left'], ['center', 'Centre (top and bottom only)'], ['right', 'Right']], String(a.side));
  const width = input('number', String(a.width), 'min="9" step="1"');
  const height = input('number', String(a.height), 'min="9" step="1"');
  const lock = input('checkbox', 'true');
  const rotate = input('number', String(a.rotate), 'min="-360" max="360" step="1"');
  const ct = input('number', pct(crop.t), 'min="0" max="90" step="1"'), cr = input('number', pct(crop.r), 'min="0" max="90" step="1"');
  const cb = input('number', pct(crop.b), 'min="0" max="90" step="1"'), cl = input('number', pct(crop.l), 'min="0" max="90" step="1"');
  const bright = input('range', String(a.brightness), 'min="0" max="200" step="1"');
  const contrast = input('range', String(a.contrast), 'min="0" max="200" step="1"');
  const sat = input('range', String(a.saturation), 'min="0" max="200" step="1"');
  const transp = input('range', String(a.transparency), 'min="0" max="100" step="1"');
  const x = input('number', String(a.x), 'step="1"'), y = input('number', String(a.y), 'step="1"');
  const border = input('color', a.border ? String(a.border) : '#1a1a1a');
  const borderWidth = input('number', String(a.borderWidth ?? 0), 'min="0" max="24" step="0.25"');
  const radius = input('number', String(a.radius ?? 0), 'min="0" max="200" step="1"');
  const shadow = input('checkbox', String(!!a.shadow));
  const ratio = Number(a.height) / Math.max(1, Number(a.width));
  width.addEventListener('input', () => { if (lock.checked) height.value = String(Math.round(Number(width.value) * ratio * 100) / 100); });
  height.addEventListener('input', () => { if (lock.checked) width.value = String(Math.round((Number(height.value) / ratio) * 100) / 100); });
  d.field('Alt text', alt);
  grid(d, [['Wrapping', wrap], ['Side', side], ['Width (pt)', width], ['Height (pt)', height], ['Keep proportions', lock], ['Rotation (degrees)', rotate],
    ['Crop top (%)', ct], ['Crop bottom (%)', cb], ['Crop left (%)', cl], ['Crop right (%)', cr],
    ['Brightness', bright], ['Contrast', contrast], ['Saturation (0 is greyscale)', sat], ['Transparency', transp],
    ['Border colour', border], ['Border width (pt, 0 for none)', borderWidth], ['Rounded corners (pt)', radius], ['Shadow', shadow],
    ['Offset from paragraph, left (pt, behind or in front)', x], ['Offset from paragraph, top (pt)', y]]);
  d.button('Reset picture', '', () => { ed.run(setPicture({ crop: null, rotate: 0, brightness: 100, contrast: 100, saturation: 100, transparency: 0 })); d.close(); });
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const f = (i: HTMLInputElement): number => Math.max(0, Math.min(90, Number(i.value) || 0)) / 100;
    const c = { t: f(ct), r: f(cr), b: f(cb), l: f(cl) };
    if (c.t + c.b > 0.9 || c.l + c.r > 0.9) { toast('Crop can remove at most 90 percent of the width or height.', 'error'); return; }
    ed.run(setPicture({
      alt: alt.value.trim(), wrap: wrap.value, side: side.value,
      width: Math.max(9, Number(width.value) || Number(a.width)), height: Math.max(9, Number(height.value) || Number(a.height)),
      rotate: Number(rotate.value) || 0, crop: c.t || c.r || c.b || c.l ? c : null,
      brightness: Number(bright.value), contrast: Number(contrast.value), saturation: Number(sat.value), transparency: Number(transp.value),
      x: Number(x.value) || 0, y: Number(y.value) || 0,
      border: Number(borderWidth.value) > 0 ? border.value : '', borderWidth: Math.max(0, Number(borderWidth.value) || 0), radius: Math.max(0, Number(radius.value) || 0), shadow: shadow.checked,
    }));
    d.close();
  });
  d.open(alt);
}

function withColors(data: ChartData, list: string): ChartData {
  const names = list.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { ...data, series: data.series.map((s, i) => {
    const c = names[i];
    const out: ChartData['series'][number] = { name: s.name, values: s.values };
    if (c && (SERIES_COLORS as readonly string[]).includes(c)) out.color = c;
    return out;
  }) };
}

export function chartDialog(ed: DocEditor, insert: boolean): void {
  const cur = insert ? null : ed.view ? selectedChart(ed.view.state) : null;
  if (!insert && !cur) throw new Error('Click a chart first.');
  const a = (cur?.node.attrs ?? { kind: 'bar', title: '', width: Math.min(468, ed.bodyWidth()), height: 252, align: 'center', options: {}, data: SAMPLE }) as Record<string, unknown>;
  const o = (a.options ?? {}) as ChartOptions;
  const d = new Dialog(insert ? 'Insert chart' : 'Chart', 760);
  const kind = select(CHART_KINDS.map((k) => [k, CHART_LABELS[k]] as [string, string]), String(a.kind));
  const title = input('text', String(a.title ?? ''), 'spellcheck="true" placeholder="Shown above the chart"');
  const width = input('number', String(a.width), 'min="120" step="1"');
  const height = input('number', String(a.height), 'min="90" step="1"');
  const align = select([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], String(a.align ?? 'center'));
  const labels = input('checkbox', String(!!o.labels));
  const legend = input('checkbox', String(o.legend !== false));
  const smooth = input('checkbox', String(!!o.smooth));
  const stacked = input('checkbox', String(!!o.stacked));
  const fn = select(CHART_FNS.map((f) => [f, f[0].toUpperCase() + f.slice(1)] as [string, string]), String(o.fn ?? 'sum'));
  const target = input('number', o.target ? String(o.target) : '', 'step="any" placeholder="None"');
  const colors = input('text', (((a.data ?? SAMPLE) as ChartData).series ?? []).map((s) => s.color ?? '').join(', ').replace(/^(, )+$/, ''), `spellcheck="false" placeholder="Automatic; or ${SERIES_COLORS.slice(0, 3).join(', ')}"`);
  const grid = el<HTMLTextAreaElement>('<textarea class="ft-input ft-chart-data" rows="9" spellcheck="false" aria-label="Chart data"></textarea>');
  grid.value = gridText((a.data ?? SAMPLE) as ChartData);
  const preview = el('<div class="ft-chart-preview"><figure class="ft-chart"><svg class="chart" role="img" aria-label="Preview"></svg></figure></div>');
  const svg = preview.querySelector('svg') as SVGSVGElement;
  const file = el<HTMLInputElement>('<input type="file" accept=".csv,.tsv,.txt,.xlsx" hidden>');
  const note = el('<p class="ft-note"></p>');
  setText(note, 'First row: a label column, then one column per series. Paste straight from a spreadsheet, or import a .csv or .xlsx file.');
  const attrs = (): Record<string, unknown> => ({
    kind: kind.value, title: title.value.trim(), width: Math.max(120, Number(width.value) || 468), height: Math.max(90, Number(height.value) || 252), align: align.value,
    options: { labels: labels.checked, legend: legend.checked, smooth: smooth.checked, stacked: stacked.checked, fn: fn.value, ...(Number(target.value) ? { target: Number(target.value) } : {}) },
    data: withColors(parseGrid(grid.value), colors.value),
  });
  let frame = 0;
  const refresh = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const at = attrs();
      const scale = Math.min(1, 440 / (Number(at.width) * 96 / 72));
      paint(svg, { ...at, width: Number(at.width) * scale, height: Number(at.height) * scale });
    });
  };
  for (const n of [kind, title, width, height, labels, legend, smooth, stacked, fn, target, grid, colors]) n.addEventListener('input', refresh);
  for (const n of [kind, labels, legend, smooth, stacked, fn]) n.addEventListener('change', refresh);
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    void api.upload<{ rows: string[][] }>('/data/parse', [f]).then((r) => { grid.value = r.rows.map((row) => row.join('\t')).join('\n'); refresh(); toast(`Read ${Math.max(0, r.rows.length - 1)} rows from ${f.name}.`); }).catch((e: Error) => toast(`Could not read ${f.name}: ${e.message}`, 'error'));
  });
  const cols = el('<div class="ft-chart-dialog"></div>');
  const left = el('<div></div>');
  const right = el('<div></div>');
  cols.append(left, right);
  d.body.appendChild(cols);
  const g = el('<div class="ft-form-grid"></div>');
  for (const [label, control] of [['Type', kind], ['Title', title], ['Width (pt)', width], ['Height (pt)', height], ['Alignment', align], ['Number shows', fn], ['Target (gauge, radial)', target], ['Data labels', labels], ['Legend', legend], ['Smooth lines', smooth], ['Stacked', stacked], ['Series colours', colors]] as Array<[string, HTMLElement]>) {
    const l = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    setText(l.querySelector('.ft-field-label'), label);
    l.appendChild(control);
    g.appendChild(l);
  }
  left.appendChild(g);
  right.append(preview, grid, note, file);
  d.button('Import data file', '', () => file.click());
  d.button('Cancel', 'ghost', () => d.close());
  d.button(insert ? 'Insert' : 'Apply', 'primary', () => {
    const at = attrs();
    if (!(at.data as ChartData).categories.length) { toast('Add at least one row of data.', 'error'); return; }
    ed.run(insert ? insertChart(at) : setChart(at));
    d.close();
  });
  d.open(kind);
  refresh();
}

export function shapeGalleryDialog(ed: DocEditor): void {
  const d = new Dialog('Shapes', 560);
  const gridEl = el('<div class="ft-shape-gallery" role="grid" aria-label="Shapes"></div>');
  for (const kind of SHAPES) {
    const b = el<HTMLButtonElement>(`<button type="button" class="ft-shape-pick" data-kind="${kind}"></button>`);
    const def = shapeDefaults(kind);
    if (kind === 'wordArt') b.innerHTML = '<span class="ft-shape-pick-wa">Aa</span>';
    else if (kind === 'textBox') b.innerHTML = `<svg viewBox="0 0 40 28" aria-hidden="true"><path d="${shapePath('rect', 40, 28, 1.5)}" fill="#ffffff" stroke="#57534e" stroke-width="1.5"/><path d="M8 10h20M8 16h14" stroke="#57534e" stroke-width="1.5"/></svg>`;
    else b.innerHTML = `<svg viewBox="0 0 40 ${kind === 'line' ? 12 : kind.startsWith('arrow') && (kind === 'arrowRight' || kind === 'arrowLeft') ? 22 : 32}" aria-hidden="true"><path d="${shapePath(kind, 40, kind === 'line' ? 12 : kind.startsWith('arrow') && (kind === 'arrowRight' || kind === 'arrowLeft') ? 22 : 32, 1.5)}" fill="${kind === 'line' ? 'none' : String(def.fill)}" stroke="${String(def.stroke)}" stroke-width="1.5"/></svg>`;
    b.title = SHAPE_LABELS[kind] ?? kind;
    b.setAttribute('aria-label', b.title);
    gridEl.appendChild(b);
  }
  gridEl.addEventListener('click', (e) => {
    const kind = (e.target as HTMLElement).closest<HTMLElement>('[data-kind]')?.dataset.kind;
    if (!kind) return;
    ed.run(insertShape(shapeDefaults(kind)));
    d.close();
  });
  d.body.appendChild(gridEl);
  d.body.appendChild(el('<p class="ft-note">Double-click a shape to type in it. Drag its handles to resize (Shift keeps proportions) and drag a selected shape to move it. Shape properties sets the fill, outline, text, WordArt style and wrapping.</p>'));
  d.button('Close', 'ghost', () => d.close());
  d.open();
}

export function shapePropertiesDialog(ed: DocEditor): void {
  const cur = ed.view ? selectedShape(ed.view.state) : null;
  if (!cur) throw new Error('Click a shape first.');
  const a = cur.node.attrs;
  const d = new Dialog('Shape', 600);
  const fixed = !(SHAPES as readonly string[]).includes(String(a.kind));
  const kind = select(fixed ? [[String(a.kind), String(a.kind) === 'icon' ? 'Icon' : 'Ink drawing']] : SHAPES.map((k) => [k, SHAPE_LABELS[k] ?? k] as [string, string]), String(a.kind));
  kind.disabled = fixed;
  const shadow = input('checkbox', String(!!a.shadow));
  const gradient = input('color', a.gradient ? String(a.gradient) : '#7c3aed');
  const useGradient = input('checkbox', String(!!a.gradient));
  gradient.addEventListener('input', () => { useGradient.checked = true; });
  const fill = input('color', a.fill && a.fill !== 'none' ? String(a.fill) : '#ffffff');
  const noFill = input('checkbox', String(!a.fill || a.fill === 'none'));
  const stroke = input('color', a.stroke ? String(a.stroke) : '#1a1a1a');
  const noStroke = input('checkbox', String(!a.stroke));
  const strokeWidth = input('number', String(a.strokeWidth ?? 1), 'min="0" max="24" step="0.25"');
  const text = el<HTMLTextAreaElement>('<textarea class="ft-input" rows="3" spellcheck="true"></textarea>');
  text.value = String(a.text ?? '');
  const color = input('color', a.color ? String(a.color) : '#1a1a1a');
  const size = input('number', String(a.size ?? 11), 'min="4" max="400" step="1"');
  const bold = input('checkbox', String(!!a.bold));
  const font = select([['', 'Document font'], ...FONTS.map((f) => [f, f] as [string, string])], String(a.font ?? ''));
  const align = select([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], String(a.align ?? 'center'));
  const valign = select([['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], String(a.valign ?? 'middle'));
  const wordart = select(WORDART.map((w) => [w, w[0].toUpperCase() + w.slice(1)] as [string, string]), String(a.wordart || 'fill'));
  const wrap = select([['inline', 'In line with text'], ['square', 'Square'], ['topBottom', 'Top and bottom'], ['behind', 'Behind text'], ['front', 'In front of text']], String(a.wrap ?? 'front'));
  const side = select([['left', 'Left'], ['center', 'Centre (top and bottom only)'], ['right', 'Right']], String(a.side ?? 'left'));
  const width = input('number', String(a.width), 'min="6" step="1"');
  const height = input('number', String(a.height), 'min="3" step="1"');
  const rotate = input('number', String(a.rotate ?? 0), 'min="-360" max="360" step="1"');
  const x = input('number', String(a.x ?? 0), 'step="1"'), y = input('number', String(a.y ?? 0), 'step="1"');
  fill.addEventListener('input', () => { noFill.checked = false; });
  stroke.addEventListener('input', () => { noStroke.checked = false; });
  d.field('Text', text);
  grid(d, [['Shape', kind], ['Fill', fill], ['No fill', noFill], ['Gradient to', gradient], ['Gradient fill', useGradient], ['Shadow', shadow], ['Outline', stroke], ['No outline', noStroke], ['Outline width (pt)', strokeWidth],
    ['Text colour', color], ['Text size (pt)', size], ['Bold', bold], ['Font', font], ['Text alignment', align], ['Vertical alignment', valign], ['WordArt style', wordart],
    ['Wrapping', wrap], ['Side', side], ['Width (pt)', width], ['Height (pt)', height], ['Rotation (degrees)', rotate], ['Offset left (pt, behind or in front)', x], ['Offset top (pt)', y]]);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    ed.run(setShape({
      kind: kind.value, fill: noFill.checked ? '' : fill.value, stroke: noStroke.checked ? '' : stroke.value, shadow: shadow.checked, gradient: useGradient.checked && !noFill.checked ? gradient.value : '', strokeWidth: Math.max(0, Number(strokeWidth.value) || 0),
      text: text.value, color: color.value, size: Math.max(4, Number(size.value) || 11), bold: bold.checked, font: font.value, align: align.value, valign: valign.value,
      wordart: kind.value === 'wordArt' ? wordart.value : String(a.wordart ?? ''), wrap: wrap.value, side: side.value,
      width: Math.max(6, Number(width.value) || Number(a.width)), height: Math.max(3, Number(height.value) || Number(a.height)), rotate: Number(rotate.value) || 0, x: Number(x.value) || 0, y: Number(y.value) || 0,
    }));
    d.close();
  });
  d.open(text);
}

export function equationDialog(ed: DocEditor): void {
  const cur = ed.view ? selectedMath(ed.view.state) : null;
  const d = new Dialog(cur ? 'Edit equation' : 'Insert equation', 640);
  const src = el<HTMLTextAreaElement>('<textarea class="ft-input ft-eq-src" rows="4" spellcheck="false" aria-label="Equation in LaTeX" placeholder="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"></textarea>');
  src.value = String(cur?.node.attrs.latex ?? '');
  const display = input('checkbox', String(!!cur?.node.attrs.display));
  const preview = el('<div class="ft-eq-preview" aria-live="polite"></div>');
  const snippets = el('<div class="ft-eq-snippets"></div>');
  for (const [label, tex] of MATH_SNIPPETS) {
    const b = el<HTMLButtonElement>('<button type="button" class="ft-btn sm"></button>');
    setText(b, label);
    b.addEventListener('click', () => {
      const at = src.selectionStart ?? src.value.length;
      src.setRangeText(tex, at, src.selectionEnd ?? at, 'end');
      src.focus();
      refresh();
    });
    snippets.appendChild(b);
  }
  let frame = 0;
  const refresh = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; preview.innerHTML = renderMath(src.value, display.checked); });
  };
  src.addEventListener('input', refresh);
  display.addEventListener('change', refresh);
  d.body.append(snippets);
  d.field('LaTeX', src);
  const l = el('<label class="ft-check"></label>');
  l.append(display, document.createTextNode(' Display on its own line'));
  d.body.append(l, preview);
  void loadMathFonts().then(refresh);
  d.button('Cancel', 'ghost', () => d.close());
  d.button(cur ? 'Apply' : 'Insert', 'primary', () => {
    if (!src.value.trim()) { toast('Type an equation first.', 'error'); return; }
    ed.run(putMath(src.value.trim(), display.checked));
    d.close();
  });
  d.open(src);
  refresh();
}

export function diagramDialog(ed: DocEditor, insert: boolean): void {
  const cur = insert ? null : ed.view ? selectedDiagram(ed.view.state) : null;
  if (!insert && !cur) throw new Error('Click a diagram first.');
  const a = (cur?.node.attrs ?? { layout: 'process-basic', items: sampleItems('process-basic'), style: 'flat', colors: 'colorful', width: Math.min(468, ed.bodyWidth()), height: 216, align: 'center' }) as Record<string, unknown>;
  const d = new Dialog(insert ? 'Insert diagram' : 'Diagram', 780);
  const layout = el<HTMLSelectElement>('<select class="ft-input" aria-label="Layout"></select>');
  for (const c of DIAGRAM_CATEGORIES) {
    const g = document.createElement('optgroup');
    g.label = c.label;
    for (const l of DIAGRAM_LAYOUTS.filter((x) => x.category === c.id)) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.label; g.appendChild(o); }
    layout.appendChild(g);
  }
  layout.value = String(a.layout);
  const style = select([['flat', 'Flat'], ['outline', 'Outline'], ['shadow', 'Soft shadow']], String(a.style ?? 'flat'));
  const colors = select([['colorful', 'Colourful'], ['accent1', 'Accent shades'], ['accent2', 'Blue shades'], ['accent3', 'Teal shades'], ['accent4', 'Amber shades'], ['accent5', 'Violet shades'], ['accent6', 'Rose shades'], ['dark', 'Dark shades']], String(a.colors ?? 'colorful'));
  const width = input('number', String(a.width), 'min="120" step="1"');
  const height = input('number', String(a.height), 'min="72" step="1"');
  const align = select([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], String(a.align ?? 'center'));
  const items = el<HTMLTextAreaElement>('<textarea class="ft-input ft-dg-src" rows="10" spellcheck="true" aria-label="Diagram text"></textarea>');
  items.value = itemsToText((a.items ?? []) as DiagramItem[]);
  let edited = false;
  items.addEventListener('input', () => { edited = true; });
  items.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const s = items.selectionStart, start = items.value.lastIndexOf('\n', s - 1) + 1;
    if (e.shiftKey) { if (items.value.startsWith('  ', start)) { items.setRangeText('', start, start + 2, 'preserve'); items.selectionStart = items.selectionEnd = Math.max(start, s - 2); } }
    else { items.setRangeText('  ', start, start, 'preserve'); items.selectionStart = items.selectionEnd = s + 2; }
    edited = true;
    refresh();
  });
  layout.addEventListener('change', () => { if (!edited && insert) items.value = itemsToText(sampleItems(layout.value)); refresh(); });
  const preview = el('<div class="ft-dg-preview"><figure class="ft-diagram"><svg role="img" aria-label="Preview"></svg><div class="ft-dg-text"></div></figure></div>');
  const fig = preview.querySelector('figure') as HTMLElement;
  const attrs = (): Record<string, unknown> => ({ layout: layout.value, items: textToItems(items.value), style: style.value, colors: colors.value, width: Math.max(120, Number(width.value) || 468), height: Math.max(72, Number(height.value) || 216), align: align.value });
  let frame = 0;
  const refresh = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const at = attrs();
      const scale = Math.min(1, 460 / (Number(at.width) * 96 / 72), 300 / (Number(at.height) * 96 / 72));
      fig.style.width = `${(Number(at.width) * 96 / 72 * scale).toFixed(0)}px`;
      fig.style.height = `${(Number(at.height) * 96 / 72 * scale).toFixed(0)}px`;
      renderDiagram(fig.querySelector('svg') as SVGSVGElement, fig.querySelector('.ft-dg-text') as HTMLElement, at, ed.accent(), scale);
    });
  };
  for (const n of [style, colors, width, height, items]) n.addEventListener('input', refresh);
  const cols = el('<div class="ft-chart-dialog"></div>');
  const left = el('<div></div>');
  const right = el('<div></div>');
  cols.append(left, right);
  const g = el('<div class="ft-form-grid"></div>');
  for (const [label, control] of [['Layout', layout], ['Style', style], ['Colours', colors], ['Width (pt)', width], ['Height (pt)', height], ['Alignment', align]] as Array<[string, HTMLElement]>) {
    const l = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
    setText(l.querySelector('.ft-field-label'), label);
    l.appendChild(control);
    g.appendChild(l);
  }
  left.appendChild(g);
  const note = el('<p class="ft-note"></p>');
  setText(note, 'One item per line. Tab or two spaces indent a line under the one above (sub-points, or the next level of an organization chart).');
  right.append(preview, items, note);
  d.body.appendChild(cols);
  d.button('Cancel', 'ghost', () => d.close());
  d.button(insert ? 'Insert' : 'Apply', 'primary', () => {
    const at = attrs();
    if (!(at.items as DiagramItem[]).length) { toast('Type at least one item.', 'error'); return; }
    ed.run(insert ? insertDiagram(at) : setDiagram(at));
    d.close();
  });
  d.open(items);
  refresh();
}

export function symbolDialog(ed: DocEditor): void {
  const d = new Dialog('Symbol', 560);
  const gridEl = el('<div class="ft-symbols" role="grid" aria-label="Symbols"></div>');
  for (const [group, chars] of SYMBOL_GROUPS) {
    const head = el('<div class="ft-symbols-head"></div>');
    setText(head, group);
    gridEl.appendChild(head);
    for (const ch of chars) {
      const b = el<HTMLButtonElement>('<button type="button" class="ft-symbol"></button>');
      setText(b, ch);
      b.title = `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
      b.dataset.ch = ch;
      gridEl.appendChild(b);
    }
  }
  const code = input('text', '', 'spellcheck="false" placeholder="Unicode code, such as 2122 or U+00A7"');
  gridEl.addEventListener('click', (e) => {
    const ch = (e.target as HTMLElement).closest<HTMLElement>('[data-ch]')?.dataset.ch;
    if (ch) { ed.insertText(ch); d.close(); }
  });
  d.body.appendChild(gridEl);
  d.field('Character code', code);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Insert code', 'primary', () => {
    const hex = code.value.trim().replace(/^(u\+|0x)/i, '');
    const n = parseInt(hex, 16);
    if (!/^[0-9a-f]{1,6}$/i.test(hex) || !(n > 31 && n <= 0x10ffff)) { toast('Enter a hexadecimal Unicode code such as 00A9.', 'error'); return; }
    ed.insertText(String.fromCodePoint(n));
    d.close();
  });
  d.open(code);
}

export function wordCountDialog(ed: DocEditor): void {
  const s = ed.stats();
  const d = new Dialog('Word count', 380);
  const dl = el('<dl class="ft-tpl-facts"></dl>');
  for (const [k, v] of [['Words', s.words], ['Characters', s.characters], ['Characters without spaces', s.charactersNoSpaces], ['Paragraphs', s.paragraphs]] as const) {
    const dt = el('<dt></dt>'), dd = el('<dd></dd>');
    setText(dt, k); setText(dd, v.toLocaleString());
    dl.append(dt, dd);
  }
  d.body.appendChild(dl);
  d.button('Close', 'primary', () => d.close());
  d.open();
}
