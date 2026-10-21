import { NodeSelection, Plugin, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { Dialog } from '../../../ui/dialog';
import { el, escapeHtml, setHidden } from '../../../ui/dom';
import type { DocEditor } from '../../editor';
import { CONTROL_KINDS, type ControlKind, defaultPlaceholder } from '../versions-spec';
import { FORM, type Loose, SYSTEM, area, grid, input, pick, requireView } from './core';
import { formatDate } from './fields';

export const KIND_LABELS: Record<ControlKind, string> = { text: 'Plain text', richtext: 'Rich text', checkbox: 'Check box', date: 'Date picker', dropdown: 'Drop-down list' };
const DATE_PRESETS = ['MMMM d, yyyy', 'M/d/yyyy', 'yyyy-MM-dd', 'dddd, MMMM d, yyyy', 'd MMM yyyy'];

let pop: HTMLElement | null = null;

export interface ControlSite { pos: number; node: PMNode }

export function controlSites(ed: DocEditor): ControlSite[] {
  const out: ControlSite[] = [];
  ed.view?.state.doc.descendants((node, pos) => {
    if (node.type.name === 'content_control') { out.push({ pos, node }); return false; }
    return true;
  });
  return out;
}

export function controlAt(view: EditorView): ControlSite | null {
  const sel = view.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'content_control') return { pos: sel.from, node: sel.node };
  const $f = sel.$from;
  for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === 'content_control') return { pos: $f.before(d), node: $f.node(d) };
  return null;
}

function parseOptions(text: string): string[] {
  return Array.from(new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))).slice(0, 60);
}

export function insertControl(ed: DocEditor, p: Loose): ControlSite {
  requireView(ed);
  const kind = String(p.kind ?? 'text') as ControlKind;
  if (!CONTROL_KINDS.includes(kind)) throw new Error(`kind takes one of ${CONTROL_KINDS.join(', ')}.`);
  const options = kind === 'dropdown' ? (Array.isArray(p.options) ? p.options.map(String) : parseOptions(String(p.options ?? ''))) : [];
  if (kind === 'dropdown' && !options.length) throw new Error('A drop-down list needs at least one item in options.');
  const attrs = { kind, title: String(p.title ?? '').slice(0, 80), tag: String(p.tag ?? '').slice(0, 60), placeholder: String(p.placeholder ?? '').slice(0, 120), options, format: kind === 'date' ? String(p.format ?? DATE_PRESETS[0]) : '', checked: !!p.checked };
  const view = ed.view!;
  const node = buildControl(view, attrs, '');
  const pos = view.state.selection.from;
  const tr = view.state.tr.replaceSelectionWith(node, false);
  const inside = kind === 'text' || kind === 'richtext';
  tr.setSelection(inside ? TextSelection.create(tr.doc, pos + 1) : TextSelection.near(tr.doc.resolve(pos + node.nodeSize), 1));
  view.dispatch(tr.scrollIntoView());
  return { pos, node };
}

export function buildControl(view: EditorView, attrs: Loose, text: string): PMNode {
  const schema = view.state.schema;
  const type = schema.nodes.content_control;
  if (attrs.kind === 'checkbox') return type.create({ ...attrs, empty: false });
  if (text) return type.create({ ...attrs, empty: false }, schema.text(text));
  return type.create({ ...attrs, empty: true }, schema.text(String(attrs.placeholder || defaultPlaceholder(String(attrs.kind)))));
}

export function controlValue(node: PMNode): string | boolean {
  return node.attrs.kind === 'checkbox' ? !!node.attrs.checked : node.attrs.empty ? '' : node.textContent;
}

export function updateControl(ed: DocEditor, pos: number, patch: Loose): void {
  const view = ed.view!;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'content_control') throw new Error('There is no content control there.');
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }));
}

export function fillControl(ed: DocEditor, key: string, value: string | boolean): string {
  requireView(ed);
  const hits = controlSites(ed).filter((s) => s.node.attrs.title === key || s.node.attrs.tag === key);
  if (!hits.length) throw new Error(`No content control has the title or tag ${key}. List them with control.list.`);
  const view = ed.view!;
  for (const h of hits.reverse()) {
    const node = view.state.doc.nodeAt(h.pos)!;
    const a = node.attrs;
    let tr = view.state.tr;
    if (a.kind === 'checkbox') tr = tr.setNodeMarkup(h.pos, undefined, { ...a, checked: typeof value === 'boolean' ? value : /^(true|yes|1|x|checked)$/i.test(String(value)) });
    else {
      const text = String(value);
      if (a.kind === 'dropdown' && text && !(a.options as string[]).includes(text)) throw new Error(`${text} is not one of: ${(a.options as string[]).join(', ')}.`);
      tr = tr.replaceWith(h.pos, h.pos + node.nodeSize, buildControl(view, a, text));
    }
    view.dispatch(tr.setMeta(FORM, true));
  }
  return key;
}

function closePop(): void {
  if (pop) { pop.remove(); pop = null; }
}

function openPop(anchor: HTMLElement, body: HTMLElement): void {
  closePop();
  pop = el('<div class="ft-vx-pop" role="dialog"></div>');
  pop.appendChild(body);
  document.getElementById('overlay-root')?.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 260))}px`;
  pop.style.top = `${Math.round(r.bottom + 4)}px`;
}

function setText(view: EditorView, site: ControlSite, text: string): void {
  const node = view.state.doc.nodeAt(site.pos)!;
  view.dispatch(view.state.tr.replaceWith(site.pos, site.pos + node.nodeSize, buildControl(view, node.attrs, text)).setMeta(FORM, true));
}

function siteOf(view: EditorView, span: HTMLElement): ControlSite | null {
  let pos: number;
  try { pos = view.posAtDOM(span, 0); } catch { return null; }
  for (const p of [pos - 1, pos]) {
    const n = view.state.doc.nodeAt(p);
    if (n?.type.name === 'content_control') return { pos: p, node: n };
  }
  return null;
}

function clicked(view: EditorView, e: MouseEvent): boolean {
  const span = (e.target as HTMLElement).closest<HTMLElement>('.ft-cc');
  if (!span || !view.editable) return false;
  const kind = span.dataset.kind;
  if (kind !== 'checkbox' && kind !== 'date' && kind !== 'dropdown') return false;
  const site = siteOf(view, span);
  if (!site) return false;
  e.preventDefault();
  if (kind === 'checkbox') {
    view.dispatch(view.state.tr.setNodeMarkup(site.pos, undefined, { ...site.node.attrs, checked: !site.node.attrs.checked }).setMeta(FORM, true));
    return true;
  }
  const body = el('<div class="ft-vx-pop-body"></div>');
  if (kind === 'dropdown') {
    const opts = (site.node.attrs.options as string[]) ?? [];
    body.innerHTML = opts.map((o, i) => `<button type="button" class="ft-vx-pop-item" data-i="${i}">${escapeHtml(o)}</button>`).join('') + '<button type="button" class="ft-vx-pop-item is-clear" data-i="-1">Clear</button>';
    body.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!b) return;
      const i = Number(b.dataset.i);
      closePop();
      const fresh = siteOf(view, span) ?? site;
      setText(view, fresh, i >= 0 ? opts[i] : '');
    });
  } else {
    const box = input('date', '', 'aria-label="Date"');
    const clear = el('<button type="button" class="ft-vx-pop-item is-clear">Clear</button>');
    body.append(box, clear);
    box.addEventListener('change', () => {
      const [y, m, d] = box.value.split('-').map(Number);
      closePop();
      if (!y) return;
      setText(view, siteOf(view, span) ?? site, formatDate(new Date(y, m - 1, d), String(site.node.attrs.format || DATE_PRESETS[0])));
    });
    clear.addEventListener('click', () => { closePop(); setText(view, siteOf(view, span) ?? site, ''); });
    window.setTimeout(() => { try { box.showPicker?.(); } catch { box.focus(); } }, 0);
  }
  openPop(span, body);
  (body.querySelector('button, input') as HTMLElement | null)?.focus();
  return true;
}

function placeholderOf(a: Loose): string {
  return String(a.placeholder || defaultPlaceholder(String(a.kind)));
}

export const controlPlugin = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some((t) => t.docChanged)) return null;
    const tr = state.tr;
    let changed = false;
    const schema = state.schema;
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'content_control') return true;
      if (node.attrs.kind === 'checkbox') return false;
      const ph = placeholderOf(node.attrs);
      const at = tr.mapping.map(pos);
      if (node.attrs.empty && node.textContent !== ph) {
        const rest = node.textContent.includes(ph) ? node.textContent.replace(ph, '') : node.textContent;
        tr.replaceWith(at, at + node.nodeSize, schema.nodes.content_control.create({ ...node.attrs, empty: rest === '' }, rest ? schema.text(rest) : schema.text(ph)));
        changed = true;
      } else if (!node.attrs.empty && node.content.size === 0) {
        tr.replaceWith(at, at + node.nodeSize, schema.nodes.content_control.create({ ...node.attrs, empty: true }, schema.text(ph)));
        changed = true;
      }
      return false;
    });
    return changed ? tr.setMeta('addToHistory', false).setMeta(SYSTEM, true) : null;
  },
  props: {
    handleTextInput: (view, from, to, text) => {
      const $f = view.state.doc.resolve(from);
      for (let d = $f.depth; d > 0; d--) {
        const n = $f.node(d);
        if (n.type.name === 'content_control' && n.attrs.empty) {
          const pos = $f.before(d);
          const tr = view.state.tr.replaceWith(pos, pos + n.nodeSize, view.state.schema.nodes.content_control.create({ ...n.attrs, empty: false }, view.state.schema.text(text)));
          tr.setSelection(TextSelection.create(tr.doc, pos + 1 + text.length));
          view.dispatch(tr.setMeta(FORM, true));
          return true;
        }
      }
      void to;
      return false;
    },
    handleDOMEvents: { mousedown: (view, e) => { const t = (e.target as HTMLElement).closest?.('.ft-cc'); const k = (t as HTMLElement | null)?.dataset.kind; if (k === 'checkbox' || k === 'date' || k === 'dropdown') { e.preventDefault(); return clicked(view, e); } return false; } },
    handleKeyDown: (view, e) => {
      if (e.key === 'Escape') closePop();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const c = controlAt(view);
        if (c && c.node.attrs.empty && !(view.state.selection instanceof NodeSelection)) return true;
      }
      if ((e.key === ' ' || e.key === 'Enter') && view.state.selection instanceof NodeSelection && view.state.selection.node.type.name === 'content_control') {
        const n = view.state.selection.node;
        if (n.attrs.kind === 'checkbox') { view.dispatch(view.state.tr.setNodeMarkup(view.state.selection.from, undefined, { ...n.attrs, checked: !n.attrs.checked }).setMeta(FORM, true)); return true; }
      }
      return false;
    },
  },
});

export function bindPopClose(): void {
  document.addEventListener('mousedown', (e) => { if (pop && !(e.target as HTMLElement).closest('.ft-vx-pop') && !(e.target as HTMLElement).closest('.ft-cc')) closePop(); });
}

export function controlDialog(ed: DocEditor): void {
  requireView(ed);
  const cur = controlAt(ed.view!);
  const a = cur?.node.attrs ?? { kind: 'text', title: '', tag: '', placeholder: '', options: [], format: DATE_PRESETS[0] };
  const d = new Dialog(cur ? 'Content control properties' : 'Insert content control', 480);
  const kind = pick(CONTROL_KINDS.map((k): [string, string] => [k, KIND_LABELS[k]]), String(a.kind));
  const title = input('text', String(a.title), 'maxlength="80" placeholder="Shown as the control name"');
  const tag = input('text', String(a.tag), 'maxlength="60" spellcheck="false" placeholder="Optional name for automation"');
  const ph = input('text', String(a.placeholder), 'maxlength="120"');
  ph.placeholder = defaultPlaceholder(String(a.kind));
  const options = area((a.options as string[]).join('\n'), 4, 'placeholder="One item per line"');
  const format = pick(DATE_PRESETS.map((f): [string, string] => [f, formatDate(new Date(2026, 2, 5), f)]), String(a.format || DATE_PRESETS[0]));
  const g = grid(d, [['Type', kind], ['Title', title], ['Tag', tag], ['Placeholder text', ph], ['Items', options], ['Date format', format]]);
  const rows = Array.from(g.children) as HTMLElement[];
  const sync = (): void => {
    const k = kind.value;
    setHidden(rows[3], k === 'checkbox');
    setHidden(rows[4], k !== 'dropdown');
    setHidden(rows[5], k !== 'date');
    ph.placeholder = defaultPlaceholder(k);
    kind.disabled = !!cur;
  };
  kind.addEventListener('change', sync);
  sync();
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  d.button('Cancel', 'ghost', () => d.close());
  if (cur) d.button('Remove control', '', () => {
    const v = ed.view!;
    const text = cur.node.attrs.empty ? '' : cur.node.textContent;
    const tr = v.state.tr;
    if (text) tr.replaceWith(cur.pos, cur.pos + cur.node.nodeSize, v.state.schema.text(text)); else tr.delete(cur.pos, cur.pos + cur.node.nodeSize);
    v.dispatch(tr);
    d.close();
  });
  d.button(cur ? 'Save' : 'Insert', 'primary', () => {
    try {
      const patch = { title: title.value, tag: tag.value, placeholder: ph.value, options: parseOptions(options.value), format: format.value };
      if (cur) {
        if (cur.node.attrs.kind === 'dropdown' && !patch.options.length) throw new Error('A drop-down list needs at least one item.');
        updateControl(ed, cur.pos, { ...patch, format: cur.node.attrs.kind === 'date' ? patch.format : '', options: cur.node.attrs.kind === 'dropdown' ? patch.options : [] });
      } else insertControl(ed, { kind: kind.value, ...patch });
      d.close();
    } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
  });
  d.open(title);
}

export function bindControlDblClick(ed: DocEditor): void {
  ed.root.addEventListener('dblclick', (e) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-cc');
    if (!span || !ed.view?.editable) return;
    const site = siteOf(ed.view, span);
    if (!site) return;
    e.preventDefault();
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, site.pos)));
    controlDialog(ed);
  });
}

export function focusControl(ed: DocEditor, pos: number): void {
  if (!ed.view) return;
  ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.near(ed.view.state.doc.resolve(pos + 1))).scrollIntoView());
}
