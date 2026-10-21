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
