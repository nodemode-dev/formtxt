import { NodeSelection, Plugin } from 'prosemirror-state';
import { Dialog } from '../../../ui/dialog';
import { el, setText } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { type Loose, SYSTEM, grid, pick, requireView } from './core';

type Kind = 'date' | 'time' | 'datetime' | 'text' | 'number';

export interface InfoField { code: string; label: string; kind: Kind }

export const INFO_FIELDS: InfoField[] = [
  { code: 'DATE', label: 'Date', kind: 'date' },
  { code: 'TIME', label: 'Time', kind: 'time' },
  { code: 'CREATEDATE', label: 'Date created', kind: 'date' },
  { code: 'SAVEDATE', label: 'Date saved', kind: 'datetime' },
  { code: 'AUTHOR', label: 'Author', kind: 'text' },
  { code: 'FILENAME', label: 'File name', kind: 'text' },
  { code: 'TITLE', label: 'Title', kind: 'text' },
  { code: 'SUBJECT', label: 'Subject', kind: 'text' },
  { code: 'NUMWORDS', label: 'Number of words', kind: 'number' },
  { code: 'NUMPAGES', label: 'Number of pages', kind: 'number' },
];

const DATE_FORMATS = ['M/d/yyyy', 'MMMM d, yyyy', 'dddd, MMMM d, yyyy', 'yyyy-MM-dd', 'd MMM yyyy', 'MMMM yyyy'];
const TIME_FORMATS = ['h:mm AM/PM', 'HH:mm', 'h:mm:ss AM/PM', 'HH:mm:ss'];
const TEXT_FORMATS: Array<[string, string]> = [['', 'As written'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case']];
const NUMBER_FORMATS: Array<[string, string]> = [['0', '1234'], ['#,##0', '1,234']];

export function formatChoices(kind: Kind): Array<[string, string]> {
  if (kind === 'date') return DATE_FORMATS.map((f) => [f, formatDate(new Date(2026, 2, 5, 14, 7, 9), f)]);
  if (kind === 'time') return TIME_FORMATS.map((f) => [f, formatDate(new Date(2026, 2, 5, 14, 7, 9), f)]);
  if (kind === 'datetime') return [...DATE_FORMATS, ...TIME_FORMATS, 'M/d/yyyy h:mm AM/PM'].map((f) => [f, formatDate(new Date(2026, 2, 5, 14, 7, 9), f)]);
  if (kind === 'text') return TEXT_FORMATS;
  return NUMBER_FORMATS;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDate(d: Date, fmt: string): string {
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const h12 = d.getHours() % 12 || 12;
  return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|ss|AM\/PM|am\/pm/g, (t) => {
    switch (t) {
      case 'yyyy': return String(d.getFullYear());
      case 'yy': return p2(d.getFullYear() % 100);
      case 'MMMM': return MONTHS[d.getMonth()];
      case 'MMM': return MONTHS[d.getMonth()].slice(0, 3);
      case 'MM': return p2(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'dddd': return DAYS[d.getDay()];
      case 'ddd': return DAYS[d.getDay()].slice(0, 3);
      case 'dd': return p2(d.getDate());
      case 'd': return String(d.getDate());
      case 'HH': return p2(d.getHours());
      case 'H': return String(d.getHours());
      case 'hh': return p2(h12);
      case 'h': return String(h12);
      case 'mm': return p2(d.getMinutes());
      case 'ss': return p2(d.getSeconds());
      case 'AM/PM': return d.getHours() < 12 ? 'AM' : 'PM';
      default: return d.getHours() < 12 ? 'am' : 'pm';
    }
  });
}

function kindOf(code: string): Kind {
  return INFO_FIELDS.find((f) => f.code === code)?.kind ?? 'text';
}

export function defaultFormat(code: string): string {
  const k = kindOf(code);
  return k === 'date' ? 'MMMM d, yyyy' : k === 'time' ? 'h:mm AM/PM' : k === 'datetime' ? 'M/d/yyyy h:mm AM/PM' : k === 'number' ? '0' : '';
}

function casing(text: string, format: string): string {
  if (format === 'upper') return text.toUpperCase();
  if (format === 'lower') return text.toLowerCase();
  if (format === 'title') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return text;
}

export function infoValue(ed: DocEditor, code: string, format: string): string {
  const meta = (ed.doc?.meta ?? {}) as unknown as Loose;
  const kind = kindOf(code);
  const stamp = (secs: unknown): Date => (Number(secs) ? new Date(Number(secs) * 1000) : new Date());
  switch (code) {
    case 'DATE': case 'TIME': return formatDate(new Date(), format || defaultFormat(code));
    case 'CREATEDATE': return formatDate(stamp(meta.created), format || defaultFormat(code));
    case 'SAVEDATE': return formatDate(stamp(meta.modified), format || defaultFormat(code));
    case 'AUTHOR': return casing(String(meta.author ?? ''), format);
    case 'FILENAME': return casing(`${ed.doc?.title ?? ''}.ftxt`, format);
    case 'TITLE': return casing(String(ed.doc?.title ?? ''), format);
    case 'SUBJECT': return casing(String(meta.subject ?? ''), format);
    case 'NUMWORDS': case 'NUMPAGES': {
      const n = code === 'NUMWORDS' ? ed.words() : Math.max(1, ed.pageCount());
      return format === '#,##0' ? n.toLocaleString('en-US') : String(n);
    }
    default: return kind === 'text' ? '' : '';
  }
}

export function updateInfoFields(ed: DocEditor): number {
  if (!ed.view || !ed.doc) return 0;
  const tr = ed.view.state.tr;
  let n = 0;
  ed.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'field') return true;
    if (node.attrs.kind !== 'info') return false;
    const result = infoValue(ed, String(node.attrs.code), String(node.attrs.format ?? ''));
    if (node.attrs.result !== result) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, result, error: '' }); n++; }
    return false;
  });
  if (n) ed.view.dispatch(tr.setMeta('addToHistory', false).setMeta('fields', true).setMeta(SYSTEM, true));
  return n;
}

export function listInfoFields(ed: DocEditor): Array<{ pos: number; code: string; format: string; result: string }> {
  const out: Array<{ pos: number; code: string; format: string; result: string }> = [];
  ed.view?.state.doc.descendants((node, pos) => {
    if (node.type.name === 'field' && node.attrs.kind === 'info') out.push({ pos, code: String(node.attrs.code), format: String(node.attrs.format ?? ''), result: String(node.attrs.result) });
    return node.type.name !== 'field';
  });
  return out;
}

export function insertInfoField(ed: DocEditor, code: string, format: string): boolean {
  requireView(ed);
  const c = code.toUpperCase();
  if (!INFO_FIELDS.some((f) => f.code === c)) throw new Error(`Unknown field ${code}. Use one of ${INFO_FIELDS.map((f) => f.code).join(', ')}.`);
  const f = format || defaultFormat(c);
  const node = ed.view!.state.schema.nodes.field.create({ kind: 'info', code: c, format: f, result: infoValue(ed, c, f), error: '' });
  ed.view!.dispatch(ed.view!.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  return true;
}

function selectedInfo(ed: DocEditor): { pos: number; code: string; format: string } | null {
  const sel = ed.view?.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'field' && sel.node.attrs.kind === 'info') return { pos: sel.from, code: String(sel.node.attrs.code), format: String(sel.node.attrs.format ?? '') };
  return null;
}

export function fieldDialog(ed: DocEditor): void {
  requireView(ed);
  const cur = selectedInfo(ed);
  const d = new Dialog(cur ? 'Field options' : 'Insert field', 440);
  const which = pick(INFO_FIELDS.map((f): [string, string] => [f.code, f.label]), cur?.code ?? 'DATE');
  const fmt = pick(formatChoices(kindOf(which.value)), cur?.format || defaultFormat(which.value));
  const preview = el('<p class="ft-note ft-vx-preview"></p>');
  const sync = (keep: boolean): void => {
    const k = kindOf(which.value);
    if (!keep) {
      fmt.replaceChildren(...formatChoices(k).map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; }));
      fmt.value = defaultFormat(which.value);
    }
    setText(preview, `Shows: ${infoValue(ed, which.value, fmt.value) || '(empty until the document has this information)'}`);
  };
  which.addEventListener('change', () => sync(false));
  fmt.addEventListener('change', () => sync(true));
  grid(d, [['Field', which], ['Format', fmt]]);
  d.body.appendChild(preview);
  sync(true);
  d.button('Cancel', 'ghost', () => d.close());
  d.button(cur ? 'Update' : 'Insert', 'primary', () => {
    if (cur && ed.view) {
      const node = ed.view.state.doc.nodeAt(cur.pos);
      if (node) ed.view.dispatch(ed.view.state.tr.setNodeMarkup(cur.pos, undefined, { ...node.attrs, code: which.value, format: fmt.value, result: infoValue(ed, which.value, fmt.value) }));
    } else insertInfoField(ed, which.value, fmt.value);
    d.close();
  });
  d.open(which);
}

let timer = 0;

export function infoPlugin(ed: DocEditor): Plugin {
  return new Plugin({
    view: () => ({
      update: (view, prev) => {
        if (view.state.doc === prev.doc) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { if (ed.view === view) updateInfoFields(ed); }, 1200);
      },
    }),
  });
}

export function bindFieldClicks(ed: DocEditor): void {
  ed.root.addEventListener('dblclick', (e) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-docfield');
    if (!span || span.dataset.kind !== 'info' || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const pos = ed.view.posAtDOM(span, 0);
    const at = ed.view.state.doc.resolve(pos).nodeAfter?.type.name === 'field' ? pos : pos - 1;
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, at)));
    fieldDialog(ed);
  }, true);
}
