import type { Style } from '../engine/model';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, setText } from '../ui/dom';
import { type DocEditor, FONTS } from './editor';

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
  d.field('Tab stops (points, alignment, optional dot or dash leader)', tabs);
  d.body.appendChild(el('<p class="ft-note">Keep with next, keep lines together, widow and orphan control and tab stop positions take effect when pages are laid out (Phase 3); they are saved now and exported to Word later.</p>'));
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
  grid(d, [['Paper size', size], ['Orientation', orient], ['Top margin (in)', top], ['Bottom margin (in)', bottom], ['Left margin (in)', left], ['Right margin (in)', right],
    ['Header from edge (in)', header], ['Footer from edge (in)', footer], ['Page colour', color], ['Page border', border], ['Watermark text', watermark], ['Pageless', pageless]]);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Apply', 'primary', () => {
    const pt = (i: HTMLInputElement, fallback: number): number => (i.value.trim() === '' ? fallback : Math.max(0, Number(i.value) * 72));
    ed.updatePage({
      page: pageGeometry(size.value, orient.value),
      margins: { ...m, top: pt(top, m.top), bottom: pt(bottom, m.bottom), left: pt(left, m.left), right: pt(right, m.right), header: pt(header, m.header), footer: pt(footer, m.footer) },
      pageColor: color.value.toLowerCase() === '#ffffff' ? '' : color.value, pageBorder: border.value,
    }, { watermark: watermark.value.trim(), pageless: pageless.checked });
    d.close();
  });
  d.open(size);
}

export function headerFooterDialog(ed: DocEditor): void {
  const s = ed.section();
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
  const start = input('number', String(s.pageNumberStart ?? 1), 'min="0" step="1"');
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
    ed.updatePage({ headers: collect('headers'), footers: collect('footers'), titlePage: titlePage.checked, pageNumberFormat: fmt.value, pageNumberStart: Math.max(0, Math.round(Number(start.value) || 1)) }, { evenOdd: evenOdd.checked });
    d.close();
  });
  d.open(fields['headers.default'].text);
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
