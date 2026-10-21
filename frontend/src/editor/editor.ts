import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Mark } from 'prosemirror-model';
import { type Command, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { FtxtDocument, ParaProps, RunProps } from '../engine/model';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setClass, setHidden, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { clearFormatting, insertPageBreak, mark, setAlign, setLineSpacing, setLink, setMarkValue, setStyle, shiftIndent, splitWithNextStyle, toggleChecked, toggleCodeBlock, toggleList } from './commands';
import { fromPM, toPM } from './convert';
import { findKey, findPlugin, rules, uniqueIds } from './plugins';
import { schema } from './schema';

const PX = 96 / 72;
export const FONTS = ['Inter', 'Source Serif 4', 'Libre Baskerville', 'Lora', 'Merriweather', 'Playfair Display', 'IBM Plex Sans', 'IBM Plex Serif', 'Work Sans', 'Space Grotesk'];
const SERIF = new Set(['Source Serif 4', 'Libre Baskerville', 'Lora', 'Merriweather', 'Playfair Display', 'IBM Plex Serif']);
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
const SPACINGS: Array<[string, string]> = [['', 'Style spacing'], ['1', 'Single'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double']];
export const fontStack = (f: string): string => `'${f.replace(/'/g, '')}', ${SERIF.has(f) ? 'Georgia, serif' : "'Inter', system-ui, sans-serif"}`;

export interface EditorHooks {
  changed(doc: FtxtDocument): void;
  status(words: number): void;
}

interface Resolved { run: RunProps & Record<string, unknown>; para: ParaProps }

function resolve(doc: FtxtDocument, sid: string): Resolved {
  const chain = [];
  const seen = new Set<string>();
  let id: string | null = sid;
  while (id && doc.styles[id] && !seen.has(id)) { seen.add(id); chain.push(doc.styles[id]); id = doc.styles[id].basedOn; }
  const run = {} as Resolved['run'];
  const para: ParaProps = {};
  for (const s of chain.reverse()) { Object.assign(run, s.run ?? {}); Object.assign(para, s.para ?? {}); }
  return { run, para };
}

function styleSheet(doc: FtxtDocument): string {
  const rules: string[] = [];
  for (const [sid, s] of Object.entries(doc.styles)) {
    if (s.type !== 'paragraph') continue;
    const { run, para } = resolve(doc, sid);
    const css = [
      `font-family:${fontStack(run.font ?? 'Inter')}`,
      `font-size:${((run.size ?? 11) * PX).toFixed(2)}px`,
      `color:${run.color ?? '#1a1a1a'}`,
      `font-weight:${run.bold ? 700 : 400}`,
      `font-style:${run.italic ? 'italic' : 'normal'}`,
      `text-align:${para.align ?? 'left'}`,
      `line-height:${((para.lineSpacing ?? 1.15) * 1.2).toFixed(3)}`,
      `margin:${((para.spaceBefore ?? 0) * PX).toFixed(1)}px 0 ${((para.spaceAfter ?? 8) * PX).toFixed(1)}px ${((para.indentLeft ?? 0) * PX).toFixed(1)}px`,
    ];
    rules.push(`.ft-pm p[data-style="${sid.replace(/"/g, '')}"]{${css.join(';')}}`);
  }
  return rules.join('\n');
}

function docFonts(doc: FtxtDocument): string[] {
  const out = new Set<string>();
  for (const s of Object.values(doc.styles)) if (s.run?.font) out.add(s.run.font);
  for (const tab of doc.tabs) for (const b of tab.body) for (const r of b.content ?? []) { const f = (r.marks as Record<string, unknown> | undefined)?.font; if (typeof f === 'string') out.add(f); }
  return [...out];
}

async function loadFonts(families: string[], timeout = 1500): Promise<void> {
  if (!document.fonts) return;
  const loads = families.flatMap((f) => [`400 16px "${f}"`, `700 16px "${f}"`].map((spec) => document.fonts.load(spec).catch(() => [])));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeout))]);
}

const TB = (cmd: string, ic: string, label: string, keys = ''): string =>
  `<button type="button" class="ft-tb-btn" data-cmd="${cmd}" title="${escapeHtml(label + (keys ? ` (${keys})` : ''))}" aria-label="${escapeHtml(label)}">${icon(ic, 16)}</button>`;
const SEP = '<span class="ft-tb-sep" aria-hidden="true"></span>';

export class DocEditor {
  readonly root: HTMLElement;
  view: EditorView | null = null;
  doc: FtxtDocument | null = null;
  private readonly page: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly sheet: HTMLStyleElement;
  private readonly outline: HTMLElement;
  private readonly outlinePane: HTMLElement;
  private readonly findBox: HTMLElement;
  private readonly styleSelect: HTMLSelectElement;
  private readonly fontSelect: HTMLSelectElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly spacingSelect: HTMLSelectElement;
  private outlineFrame = 0;

  constructor(host: HTMLElement, private readonly hooks: EditorHooks) {
    this.root = el(`<div class="ft-editor" hidden>
<div class="ft-toolbar" role="toolbar" aria-label="Formatting">
${TB('edit.undo', 'undo', 'Undo', 'Ctrl+Z')}${TB('edit.redo', 'redo', 'Redo', 'Ctrl+Y')}${SEP}
<select class="ft-tb-select ft-tb-style" data-cmd="paragraph.style" aria-label="Paragraph style"></select>
<select class="ft-tb-select ft-tb-font" data-cmd="format.font" aria-label="Font">${FONTS.map((f) => `<option value="${f}">${f}</option>`).join('')}<option value="" disabled hidden>Mixed</option></select>
<select class="ft-tb-select ft-tb-size" data-cmd="format.size" aria-label="Font size">${SIZES.map((s) => `<option value="${s}">${s}</option>`).join('')}<option value="" disabled hidden></option></select>${SEP}
${TB('format.bold', 'bold', 'Bold', 'Ctrl+B')}${TB('format.italic', 'italic', 'Italic', 'Ctrl+I')}${TB('format.underline', 'underline', 'Underline', 'Ctrl+U')}${TB('format.strike', 'strike', 'Strikethrough', 'Ctrl+Shift+X')}${TB('format.superscript', 'superscript', 'Superscript', 'Ctrl+.')}${TB('format.subscript', 'subscript', 'Subscript', 'Ctrl+,')}
<label class="ft-tb-color" title="Text colour">${icon('textColor', 16)}<input type="color" data-cmd="format.color" value="#1a1a1a" aria-label="Text colour"></label>
<label class="ft-tb-color" title="Highlight">${icon('highlighter', 16)}<input type="color" data-cmd="format.highlight" value="#fde047" aria-label="Highlight colour"></label>${SEP}
${TB('paragraph.align.left', 'alignLeft', 'Align left', 'Ctrl+Shift+L')}${TB('paragraph.align.center', 'alignCenter', 'Center', 'Ctrl+Shift+E')}${TB('paragraph.align.right', 'alignRight', 'Align right', 'Ctrl+Shift+R')}${TB('paragraph.align.justify', 'alignJustify', 'Justify', 'Ctrl+Shift+J')}${SEP}
${TB('list.bullet', 'listBullet', 'Bulleted list', 'Ctrl+Shift+8')}${TB('list.number', 'listNumber', 'Numbered list', 'Ctrl+Shift+7')}${TB('list.check', 'listCheck', 'Checklist', 'Ctrl+Shift+9')}${TB('paragraph.outdent', 'outdent', 'Decrease indent', 'Shift+Tab')}${TB('paragraph.indent', 'indent', 'Increase indent', 'Tab')}
<select class="ft-tb-select ft-tb-spacing" data-cmd="paragraph.lineSpacing" aria-label="Line spacing">${SPACINGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>${SEP}
${TB('insert.link', 'link', 'Link', 'Ctrl+K')}${TB('insert.codeBlock', 'code', 'Code block')}${TB('insert.pageBreak', 'pageBreak', 'Page break', 'Ctrl+Enter')}${TB('format.clear', 'clearFormat', 'Clear formatting', 'Ctrl+\\')}${SEP}
${TB('edit.find', 'search', 'Find and replace', 'Ctrl+F')}${TB('view.outline', 'outline', 'Outline')}
</div>
<div class="ft-editor-body">
<nav class="ft-outline" aria-label="Outline"><div class="ft-outline-title">Outline</div><div class="ft-outline-list"></div><p class="ft-outline-none">Headings you add appear here.</p></nav>
<div class="ft-scroll"><article class="ft-page"><div class="ft-pm"></div></article></div>
<div class="ft-find" role="search" hidden>
<div class="ft-find-row"><input class="ft-input ft-find-q" type="search" placeholder="Find" spellcheck="false" aria-label="Find"><span class="ft-find-count"></span>
<button type="button" class="ft-tb-btn" data-find="prev" title="Previous (Shift+Enter)">${icon('chevronUp', 16)}</button><button type="button" class="ft-tb-btn" data-find="next" title="Next (Enter)">${icon('chevronDown', 16)}</button><button type="button" class="ft-tb-btn" data-find="close" title="Close (Esc)">${icon('close', 16)}</button></div>
<div class="ft-find-row"><input class="ft-input ft-find-r" type="text" placeholder="Replace with" spellcheck="false" aria-label="Replace with"><button type="button" class="ft-btn sm" data-find="one">Replace</button><button type="button" class="ft-btn sm" data-find="all">All</button></div>
<div class="ft-find-row ft-find-opts"><label><input type="checkbox" class="ft-find-case"> Match case</label><label><input type="checkbox" class="ft-find-re"> Regular expression</label></div>
</div>
</div></div>`);
    this.page = this.root.querySelector('.ft-page') as HTMLElement;
    this.mount = this.root.querySelector('.ft-pm') as HTMLElement;
    this.outline = this.root.querySelector('.ft-outline-list') as HTMLElement;
    this.outlinePane = this.root.querySelector('.ft-outline') as HTMLElement;
    this.findBox = this.root.querySelector('.ft-find') as HTMLElement;
    this.styleSelect = this.root.querySelector('.ft-tb-style') as HTMLSelectElement;
    this.fontSelect = this.root.querySelector('.ft-tb-font') as HTMLSelectElement;
    this.sizeSelect = this.root.querySelector('.ft-tb-size') as HTMLSelectElement;
    this.spacingSelect = this.root.querySelector('.ft-tb-spacing') as HTMLSelectElement;
    this.sheet = document.createElement('style');
    this.sheet.id = 'ft-doc-styles';
    document.head.appendChild(this.sheet);
    host.appendChild(this.root);
    this.wireFind();
    this.outline.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-pos]');
      if (row && this.view) this.goTo(Number(row.dataset.pos));
    });
    this.mount.addEventListener('mousedown', (e) => {
      const p = (e.target as HTMLElement).closest<HTMLElement>('p[data-list="check"]');
      if (!p || !this.view || e.offsetX > 22 + Number(p.dataset.level || 0) * 24) return;
      const pos = this.view.posAtDOM(p, 0);
      e.preventDefault();
      this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, pos)));
      this.run(toggleChecked);
    });
  }

  private keys(): ReturnType<typeof keymap>[] {
    const nextOf = (s: string): string => this.doc?.styles[s]?.next ?? 'Normal';
    return [
      keymap({
        'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo,
        'Mod-b': mark('bold'), 'Mod-i': mark('italic'), 'Mod-u': mark('underline'), 'Shift-Mod-x': mark('strike'),
        'Mod-.': mark('superscript'), 'Mod-,': mark('subscript'),
        'Mod-Alt-0': setStyle('Normal'), 'Mod-Alt-1': setStyle('Heading1'), 'Mod-Alt-2': setStyle('Heading2'), 'Mod-Alt-3': setStyle('Heading3'),
        'Mod-Alt-4': setStyle('Heading4'), 'Mod-Alt-5': setStyle('Heading5'), 'Mod-Alt-6': setStyle('Heading6'),
        'Shift-Mod-7': toggleList('number'), 'Shift-Mod-8': toggleList('bullet'), 'Shift-Mod-9': toggleList('check'),
        'Shift-Mod-l': setAlign('left'), 'Shift-Mod-e': setAlign('center'), 'Shift-Mod-r': setAlign('right'), 'Shift-Mod-j': setAlign('justify'),
        'Mod-\\': clearFormatting, 'Mod-Enter': insertPageBreak,
        Tab: shiftIndent(1), 'Shift-Tab': shiftIndent(-1),
        Enter: splitWithNextStyle(nextOf), 'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
        'Mod-f': () => { this.openFind(); return true; }, 'Mod-h': () => { this.openFind(true); return true; },
        'Mod-k': () => { this.promptLink(); return true; },
      }),
      keymap(baseKeymap),
    ];
  }

  async load(doc: FtxtDocument): Promise<void> {
    await loadFonts(docFonts(doc));
    this.doc = doc;
    this.sheet.textContent = styleSheet(doc);
    const s = doc.sections[0];
    const m = s.margins;
    this.page.style.width = `${(s.page.width * PX).toFixed(0)}px`;
    this.page.style.minHeight = `${(s.page.height * PX).toFixed(0)}px`;
    this.page.style.padding = `${(m.top * PX).toFixed(0)}px ${(m.right * PX).toFixed(0)}px ${(m.bottom * PX).toFixed(0)}px ${(m.left * PX).toFixed(0)}px`;
    const tpl = (doc.settings as unknown as { template?: { layout?: string; accent?: string } }).template;
    this.page.dataset.layout = tpl?.layout ?? 'classic';
    this.page.style.setProperty('--doc-accent', tpl?.accent ?? '#f97316');
    this.syncStyleOptions();
    const state = EditorState.create({ doc: toPM(doc), plugins: [rules, ...this.keys(), history(), dropCursor(), gapCursor(), uniqueIds, findPlugin] });
    if (!this.view) {
      this.view = new EditorView(this.mount, {
        state,
        attributes: { class: 'ft-pm-root', spellcheck: 'true', 'aria-label': 'Document' },
        dispatchTransaction: (tr) => {
          if (!this.view) return;
          const next = this.view.state.apply(tr);
          this.view.updateState(next);
          this.syncToolbar();
          if (tr.docChanged) { this.emitChange(); this.scheduleOutline(); }
          if (tr.getMeta(findKey) || tr.docChanged) this.syncFind();
        },
      });
    } else {
      this.view.updateState(state);
    }
    this.syncToolbar();
    this.renderOutline();
    this.hooks.status(this.words());
    (this.root.querySelector('.ft-scroll') as HTMLElement).scrollTop = 0;
  }

  show(on: boolean): void { setHidden(this.root, !on); if (on) this.view?.focus(); }

  words(): number {
    return this.view ? this.view.state.doc.textBetween(0, this.view.state.doc.content.size, ' ', ' ').split(/\s+/).filter(Boolean).length : 0;
  }

  current(): FtxtDocument | null {
    if (!this.doc || !this.view) return null;
    const tabs = this.doc.tabs.map((t, i) => (i === 0 ? { ...t, body: fromPM(this.view!.state.doc, this.doc!.sections[0].id) } : t));
    return { ...this.doc, tabs };
  }

  private emitChange(): void {
    const doc = this.current();
    if (doc) { this.doc = doc; this.hooks.changed(doc); this.hooks.status(this.words()); }
  }

  run(cmd: Command): boolean {
    if (!this.view) throw new Error('Open a document first.');
    const ok = cmd(this.view.state, this.view.dispatch, this.view);
    this.view.focus();
    return ok;
  }

  undo(): boolean { return this.run(undo); }
  redo(): boolean { return this.run(redo); }
  setMark(name: string, attrs: Record<string, unknown> | null): boolean { return this.run(setMarkValue(schema.marks[name], attrs)); }
  toggle(name: string): boolean { return this.run(mark(name)); }
  style(id: string): boolean {
    if (!this.doc?.styles[id]) throw new Error(`No paragraph style has the id ${id}.`);
    return this.run(setStyle(id));
  }
  align(a: string): boolean { return this.run(setAlign(a)); }
  list(kind: string): boolean { return this.run(toggleList(kind)); }
  indent(d: 1 | -1): boolean { return this.run(shiftIndent(d)); }
  spacing(v: number | null): boolean { return this.run(setLineSpacing(v)); }
  clear(): boolean { return this.run(clearFormatting); }
  pageBreak(): boolean { return this.run(insertPageBreak); }
  codeBlock(): boolean { return this.run(toggleCodeBlock); }
  link(href: string | null): boolean { return this.run(setLink(href)); }

  promptLink(): void {
    if (!this.view || this.view.state.selection.empty) return;
    const existing = this.view.state.doc.rangeHasMark(this.view.state.selection.from, this.view.state.selection.to, schema.marks.link);
    const d = new Dialog(existing ? 'Edit link' : 'Insert link', 460);
    const input = el<HTMLInputElement>('<input class="ft-input" type="url" spellcheck="false" placeholder="https://">');
    d.field('Address', input);
    if (existing) d.button('Remove link', 'ghost', () => { d.close(); this.link(null); });
    d.button('Cancel', 'ghost', () => d.close());
    const apply = (): void => { const v = input.value.trim(); d.close(); if (v) this.link(v); };
    d.button('Apply', 'primary', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    d.open(input);
  }

  private activeMarks(): readonly Mark[] {
    if (!this.view) return [];
    const { state } = this.view;
    const { $from, empty } = state.selection;
    return empty ? (state.storedMarks ?? $from.marks()) : $from.marks();
  }

  private syncStyleOptions(): void {
    if (!this.doc) return;
    const styles = Object.entries(this.doc.styles).filter(([, s]) => s.type === 'paragraph').map(([id, s]) => ({ id, name: s.name }));
    patchList(this.styleSelect, styles, {
      key: (s) => s.id,
      create: (s) => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; return o; },
      update: (n, s) => setText(n, s.name),
    });
  }

  private syncToolbar(): void {
    if (!this.view || !this.doc) return;
    const { state } = this.view;
    const marks = this.activeMarks();
    const has = (n: string): boolean => {
      const t = schema.marks[n];
      return state.selection.empty ? marks.some((m) => m.type === t) : state.doc.rangeHasMark(state.selection.from, state.selection.to, t) && marks.some((m) => m.type === t);
    };
    for (const n of ['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript']) setClass(this.root.querySelector(`[data-cmd="format.${n}"]`), 'is-on', has(n));
    const para = state.selection.$from.parent;
    const sid = para.type === schema.nodes.paragraph ? String(para.attrs.style) : 'Normal';
    const resolved = resolve(this.doc, sid);
    setValue(this.styleSelect, sid);
    const font = marks.find((m) => m.type === schema.marks.font)?.attrs.family ?? resolved.run.font ?? 'Inter';
    const size = marks.find((m) => m.type === schema.marks.size)?.attrs.pt ?? resolved.run.size ?? 11;
    setValue(this.fontSelect, FONTS.includes(String(font)) ? String(font) : '');
    setValue(this.sizeSelect, SIZES.includes(Number(size)) ? String(size) : '');
    const align = String(para.attrs.align || resolved.para.align || 'left');
    for (const a of ['left', 'center', 'right', 'justify']) setClass(this.root.querySelector(`[data-cmd="paragraph.align.${a}"]`), 'is-on', align === a);
    for (const k of ['bullet', 'number', 'check']) setClass(this.root.querySelector(`[data-cmd="list.${k}"]`), 'is-on', para.attrs.list === k);
    setValue(this.spacingSelect, para.attrs.lineSpacing === null || para.attrs.lineSpacing === undefined ? '' : String(para.attrs.lineSpacing));
    setClass(this.root.querySelector('[data-cmd="insert.codeBlock"]'), 'is-on', para.type === schema.nodes.code_block);
  }

  private scheduleOutline(): void {
    if (this.outlineFrame) return;
    this.outlineFrame = requestAnimationFrame(() => { this.outlineFrame = 0; this.renderOutline(); });
  }

  private renderOutline(): void {
    if (!this.view) return;
    const rows: Array<{ id: string; text: string; level: number; pos: number }> = [];
    this.view.state.doc.forEach((node, pos) => {
      const s = String(node.attrs.style ?? '');
      const level = s === 'Title' ? 0 : /^Heading[1-3]$/.test(s) ? Number(s.slice(7)) : -1;
      if (level >= 0 && node.textContent.trim()) rows.push({ id: String(node.attrs.id), text: node.textContent.trim(), level, pos });
    });
    const update = (n: HTMLElement, r: (typeof rows)[number]): void => { setText(n, r.text); n.dataset.pos = String(r.pos); n.dataset.level = String(r.level); };
    patchList(this.outline, rows, { key: (r) => r.id, create: (r) => { const n = el('<button type="button" class="ft-outline-item"></button>'); update(n, r); return n; }, update });
    setHidden(this.root.querySelector('.ft-outline-none') as HTMLElement, rows.length > 0);
  }

  toggleOutline(): boolean {
    const hide = !this.outlinePane.hidden;
    setHidden(this.outlinePane, hide);
    setClass(this.root.querySelector('[data-cmd="view.outline"]'), 'is-on', !hide);
    return !hide;
  }

  private goTo(pos: number): void {
    if (!this.view) return;
    const tr = this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(Math.min(pos + 1, this.view.state.doc.content.size))));
    this.view.dispatch(tr);
    const dom = this.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView({ block: 'start' });
    this.view.focus();
  }

  private findInputs(): { q: HTMLInputElement; r: HTMLInputElement; cs: HTMLInputElement; re: HTMLInputElement } {
    return {
      q: this.findBox.querySelector('.ft-find-q') as HTMLInputElement,
      r: this.findBox.querySelector('.ft-find-r') as HTMLInputElement,
      cs: this.findBox.querySelector('.ft-find-case') as HTMLInputElement,
      re: this.findBox.querySelector('.ft-find-re') as HTMLInputElement,
    };
  }

  private wireFind(): void {
    const f = this.findInputs();
    const push = (): void => { if (this.view) this.view.dispatch(this.view.state.tr.setMeta(findKey, { query: f.q.value, regex: f.re.checked, caseSensitive: f.cs.checked, current: 0 })); };
    f.q.addEventListener('input', push);
    f.cs.addEventListener('change', push);
    f.re.addEventListener('change', push);
    f.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.findStep(e.shiftKey ? -1 : 1); } });
    this.findBox.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.closeFind(); } });
    this.findBox.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-find]')?.dataset.find;
      if (a === 'next') this.findStep(1);
      else if (a === 'prev') this.findStep(-1);
      else if (a === 'close') this.closeFind();
      else if (a === 'one') this.replace(false);
      else if (a === 'all') this.replace(true);
    });
  }

  openFind(replace = false): void {
    setHidden(this.findBox, false);
    const f = this.findInputs();
    if (this.view && !this.view.state.selection.empty) {
      const { from, to } = this.view.state.selection;
      const text = this.view.state.doc.textBetween(from, to, ' ');
      if (text.length < 200 && !text.includes('\n')) { f.q.value = text; this.view.dispatch(this.view.state.tr.setMeta(findKey, { query: text, current: 0 })); }
    }
    (replace ? f.r : f.q).focus();
    (replace ? f.r : f.q).select();
    setClass(this.root.querySelector('[data-cmd="edit.find"]'), 'is-on', true);
  }

  closeFind(): void {
    setHidden(this.findBox, true);
    setClass(this.root.querySelector('[data-cmd="edit.find"]'), 'is-on', false);
    if (this.view) { this.view.dispatch(this.view.state.tr.setMeta(findKey, { query: '' })); this.view.focus(); }
  }

  findStep(d: 1 | -1): void {
    if (!this.view) return;
    const s = findKey.getState(this.view.state);
    if (!s || !s.matches.length) return;
    const current = (s.current + d + s.matches.length) % s.matches.length;
    const m = s.matches[current];
    this.view.dispatch(this.view.state.tr.setMeta(findKey, { current }).setSelection(TextSelection.create(this.view.state.doc, m.from, m.to)).scrollIntoView());
  }

  replace(all: boolean, query?: string, replacement?: string, opts?: { regex?: boolean; caseSensitive?: boolean }): number {
    if (!this.view) throw new Error('Open a document first.');
    if (query !== undefined) this.view.dispatch(this.view.state.tr.setMeta(findKey, { query, regex: !!opts?.regex, caseSensitive: !!opts?.caseSensitive, current: 0 }));
    const s = findKey.getState(this.view.state);
    if (!s || !s.matches.length) return 0;
    const f = this.findInputs();
    const withText = replacement ?? f.r.value;
    const list = all ? s.matches : [s.matches[Math.max(0, s.current)]];
    const re = s.regex ? new RegExp(s.query, s.caseSensitive ? '' : 'i') : null;
    const tr = this.view.state.tr;
    for (const m of [...list].reverse()) {
      const found = this.view.state.doc.textBetween(m.from, m.to);
      const text = re ? found.replace(re, withText) : withText;
      const marks = this.view.state.doc.resolve(m.from).marksAcross(this.view.state.doc.resolve(m.to)) ?? [];
      if (text) tr.replaceWith(m.from, m.to, schema.text(text, marks)); else tr.delete(m.from, m.to);
    }
    this.view.dispatch(tr.scrollIntoView());
    return list.length;
  }

  private syncFind(): void {
    if (!this.view) return;
    const s = findKey.getState(this.view.state);
    const count = this.findBox.querySelector('.ft-find-count') as HTMLElement;
    if (!s || !s.query) { setText(count, ''); return; }
    setText(count, s.error ? 'Invalid pattern' : s.matches.length ? `${s.current + 1} of ${s.matches.length}` : 'No results');
  }
}
