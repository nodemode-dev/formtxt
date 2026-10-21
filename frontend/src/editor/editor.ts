import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Mark } from 'prosemirror-model';
import { type Command, EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { FtxtDocument, ParaProps, RunProps } from '../engine/model';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setClass, setHidden, setText, setValue } from '../ui/dom';
import { icon } from '../ui/icons';
import { type CaseMode, changeCase, clearFormatting, insertColumnBreak, insertPageBreak, mark, setAlign, setLineSpacing, setLink, setMarkValue, setParaProps, setStyle, shiftIndent, splitWithNextStyle, toggleChecked, toggleCodeBlock, toggleCollapsed, toggleList } from './commands';
import { fromPM, toPM } from './convert';
import { collapsePlugin, findKey, findPlugin, rules, uniqueIds } from './plugins';
import type { DocTab, Section, Style } from '../engine/model';
import { GAP, Paginator, cloneHit, pagesKey, pagesPlugin } from './pages';
import { Ruler } from './ruler';
import { layoutTabs } from './tabs';
import { addRowAfter, goToNextCell, isInTable } from 'prosemirror-tables';
import { tablePlugins } from './table';
import { PictureView, fitSize, insertPicture, naturalSize } from './picture';
import { ChartView } from './chart/chart';
import { MathView, loadMathFonts } from './math';
import { ShapeView, flowTextBoxes, placeConnectors, shapeEditing } from './shape';
import { InkTool } from './ink';
import { DiagramView } from './diagram';
import { MermaidView } from './mermaid';
import { syncVariables, updateFields } from './fields';
import { chipPlugin } from './chips';
import { sectionGeometry, sectionsKey, sectionsPlugin } from './sections';
import { STYLE_SETS, applyStyleSet, setFonts } from './stylesets';
import { api } from '../io/api';
import { toast } from '../ui/toast';

export type ViewMode = 'print' | 'draft' | 'read' | 'focus';
import { mediaUrl, schema, setMediaDocument } from './schema';

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
  private readonly pagesEl: HTMLElement;
  readonly paginator: Paginator;
  readonly ruler: Ruler;
  zoom = 1;
  viewMode: ViewMode = 'print';
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
  private readonly states = new Map<string, EditorState>();
  activeTab = '';
  private readonly tabsList: HTMLElement;
  private painter: { marks: readonly Mark[]; para: Record<string, unknown> | null } | null = null;

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
${TB('list.bullet', 'listBullet', 'Bulleted list', 'Ctrl+Shift+8')}${TB('list.number', 'listNumber', 'Numbered list', 'Ctrl+Shift+7')}${TB('list.check', 'listCheck', 'Checklist', 'Ctrl+Shift+9')}${TB('list.format', 'listFormat', 'List format: number style, restart, bullet')}${TB('paragraph.outdent', 'outdent', 'Decrease indent', 'Shift+Tab')}${TB('paragraph.indent', 'indent', 'Increase indent', 'Tab')}
<select class="ft-tb-select ft-tb-spacing" data-cmd="paragraph.lineSpacing" aria-label="Line spacing">${SPACINGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>${SEP}
${TB('format.painter', 'painter', 'Format Painter', 'Ctrl+Shift+C')}${TB('format.paragraph', 'paragraph', 'Paragraph settings')}${TB('format.styles', 'styles', 'Styles')}${TB('format.styleSet', 'styleSet', 'Style sets')}${SEP}
${TB('insert.link', 'link', 'Link', 'Ctrl+K')}${TB('insert.codeBlock', 'code', 'Code block')}${TB('insert.pageBreak', 'pageBreak', 'Page break', 'Ctrl+Enter')}${TB('insert.sectionBreak', 'sectionBreak', 'Section break (next page)')}${TB('format.clear', 'clearFormat', 'Clear formatting', 'Ctrl+\\')}${SEP}
${TB('insert.picture', 'image', 'Insert picture (or paste or drop one)')}${TB('insert.stockImage', 'stock', 'Stock images (Openverse, Pexels)')}${TB('insert.table', 'table', 'Insert table')}${TB('insert.chart', 'chart', 'Insert chart')}${TB('insert.diagram', 'diagram', 'Diagram (SmartArt)')}${TB('insert.mermaid', 'mermaid', 'Mermaid diagram from text')}${TB('insert.shape', 'shapes', 'Shapes, text box and WordArt')}${TB('insert.icon', 'iconLibrary', 'Icons')}${TB('view.draw', 'pen', 'Draw with ink (Esc stops)')}${TB('insert.equation', 'equation', 'Equation', 'Alt+=')}${TB('insert.symbol', 'omega', 'Symbol')}${TB('insert.emoji', 'smile', 'Emoji')}${TB('insert.chip', 'chip', 'Smart chip: date, person, dropdown or document (or type @)')}${TB('insert.block', 'blocks', 'Building blocks: meeting notes, email draft and your own')}<span class="ft-tb-group" data-group="table">${TB('table.properties', 'tableProps', 'Table properties (right-click a cell for rows, columns and merging)')}${TB('insert.formula', 'sigma', 'Formula (F9 updates)')}</span><span class="ft-tb-group" data-group="shape">${TB('shape.connect', 'connector', 'Connect to another shape')}${TB('shape.link', 'linkBoxes', 'Link text boxes: text continues in the next box')}${TB('shape.unlink', 'unlinkBoxes', 'Break the link to the next text box')}</span>${SEP}
${TB('edit.find', 'search', 'Find and replace', 'Ctrl+F')}${TB('view.outline', 'outline', 'Outline')}${TB('view.split', 'split', 'Split window', 'Ctrl+Alt+S')}${SEP}
${TB('view.focus', 'focus', 'Focus mode (Esc leaves)')}${TB('layout.pageSetup', 'pageSetup', 'Page setup')}${TB('insert.headerFooter', 'headerFooter', 'Header and footer')}${TB('view.pageless', 'pageless', 'Pageless')}
<select class="ft-tb-select ft-tb-zoom" data-cmd="view.zoom" aria-label="Zoom">${[50, 75, 90, 100, 110, 125, 150, 200].map((z) => `<option value="${z}"${z === 100 ? ' selected' : ''}>${z}%</option>`).join('')}<option value="" disabled hidden></option></select>
</div>
<div class="ft-editor-body">
<nav class="ft-outline" aria-label="Outline"><div class="ft-outline-title ft-tabs-head">Tabs<button type="button" class="ft-tb-btn sm" data-cmd="tabs.add" title="Add tab" aria-label="Add tab">${icon('plus', 14)}</button></div><div class="ft-tabs-list"></div><div class="ft-outline-title">Outline</div><div class="ft-outline-list"></div><p class="ft-outline-none">Headings you add appear here.</p></nav>
<div class="ft-scroll"><div class="ft-pages"><article class="ft-page"><div class="ft-pm"></div></article></div></div>
<div class="ft-split" hidden><div class="ft-split-bar"><span>Split window: the same text in draft view</span><button type="button" class="ft-tb-btn sm" data-cmd="view.split" title="Close the split (Ctrl+Alt+S)" aria-label="Close the split">${icon('close', 14)}</button></div><div class="ft-split-scroll"><article class="ft-page ft-split-page"><div class="ft-pm ft-split-pm"></div></article></div></div>
<div class="ft-find" role="search" hidden>
<div class="ft-find-row"><input class="ft-input ft-find-q" type="search" placeholder="Find" spellcheck="false" aria-label="Find"><span class="ft-find-count"></span>
<button type="button" class="ft-tb-btn" data-find="prev" title="Previous (Shift+Enter)">${icon('chevronUp', 16)}</button><button type="button" class="ft-tb-btn" data-find="next" title="Next (Enter)">${icon('chevronDown', 16)}</button><button type="button" class="ft-tb-btn" data-find="close" title="Close (Esc)">${icon('close', 16)}</button></div>
<div class="ft-find-row"><input class="ft-input ft-find-r" type="text" placeholder="Replace with" spellcheck="false" aria-label="Replace with"><button type="button" class="ft-btn sm" data-find="one">Replace</button><button type="button" class="ft-btn sm" data-find="all">All</button></div>
<div class="ft-find-row ft-find-opts"><label><input type="checkbox" class="ft-find-case"> Match case</label><label><input type="checkbox" class="ft-find-re"> Regular expression</label></div>
</div>
</div></div>`);
    this.page = this.root.querySelector('.ft-page') as HTMLElement;
    this.pagesEl = this.root.querySelector('.ft-pages') as HTMLElement;
    this.paginator = new Paginator(() => this.view, this.pagesEl, () => this.doc?.sections[0] ?? null, () => { const st = (this.doc?.settings ?? {}) as unknown as Record<string, unknown>; return this.viewMode === 'draft' ? { ...st, pageless: true } : st; }, () => this.zoom);
    this.paginator.onLayout = () => { this.placePageAnchored(); if (this.view) { flowTextBoxes(this.view.dom as HTMLElement); placeConnectors(this.view.dom as HTMLElement); } this.hooks.status(this.words()); };
    this.paginator.beforeMeasure = layoutTabs;
    this.paginator.sectionsOf = () => this.doc?.sections ?? [];
    this.ink = new InkTool(this, () => this.pagesEl, (on) => setClass(this.root.querySelector('[data-cmd="view.draw"]'), 'is-on', on));
    this.ruler = new Ruler(this.root.querySelector('.ft-scroll') as HTMLElement, (props) => this.paraProps(props));
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
    this.tabsList = this.root.querySelector('.ft-tabs-list') as HTMLElement;
    this.tabsList.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (row?.dataset.tab) this.selectTab(row.dataset.tab);
    });
    this.tabsList.addEventListener('dblclick', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (row?.dataset.tab) this.promptRenameTab(row.dataset.tab);
    });
    this.mount.addEventListener('mousedown', (e) => {
      const h = (e.target as HTMLElement).closest<HTMLElement>('p[data-style^="Heading"]');
      if (!h || !this.view || e.clientX >= h.getBoundingClientRect().left) return;
      e.preventDefault();
      const pos = this.view.posAtDOM(h, 0);
      this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, pos)));
      this.run(toggleCollapsed);
    });
    this.mount.addEventListener('mouseup', () => {
      if (!this.painter) return;
      window.setTimeout(() => this.applyPainter(), 0);
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
        'Mod-Alt-s': () => { this.toggleSplit(); return true; },
        'Mod-Alt-4': setStyle('Heading4'), 'Mod-Alt-5': setStyle('Heading5'), 'Mod-Alt-6': setStyle('Heading6'),
        'Shift-Mod-7': toggleList('number'), 'Shift-Mod-8': toggleList('bullet'), 'Shift-Mod-9': toggleList('check'),
        'Shift-Mod-l': setAlign('left'), 'Shift-Mod-e': setAlign('center'), 'Shift-Mod-r': setAlign('right'), 'Shift-Mod-j': setAlign('justify'),
        'Mod-\\': clearFormatting, 'Mod-Enter': insertPageBreak, 'Shift-Mod-Enter': insertColumnBreak,
        Tab: (state, dispatch, view) => {
          if (isInTable(state)) {
            if (goToNextCell(1)(state, dispatch, view)) return true;
            if (!dispatch || !view) return true;
            addRowAfter(state, view.dispatch);
            return goToNextCell(1)(view.state, view.dispatch, view);
          }
          const p = state.selection.$from.parent;
          if (p.type === schema.nodes.paragraph && p.attrs.list) return shiftIndent(1)(state, dispatch, view);
          if (p.type !== schema.nodes.paragraph) return false;
          dispatch?.(state.tr.replaceSelectionWith(schema.nodes.tab.create()).scrollIntoView());
          return true;
        },
        'Shift-Tab': chainCommands((state, dispatch, view) => isInTable(state) && (goToNextCell(-1)(state, dispatch, view) || true), shiftIndent(-1)),
        Enter: splitWithNextStyle(nextOf), 'Shift-Enter': chainCommands(exitCode, (state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true; }),
        'Mod-f': () => { this.openFind(); return true; }, 'Mod-h': () => { this.openFind(true); return true; },
        'Mod-k': () => { this.promptLink(); return true; },
        'Alt-=': () => { this.onEquationKey?.(); return true; },
        F9: () => { if (this.view) void updateFields(this.view); return true; },
      }),
      keymap(baseKeymap),
    ];
  }

  async load(doc: FtxtDocument): Promise<void> {
    await Promise.all([loadFonts(docFonts(doc)), JSON.stringify(doc.tabs).includes('"type":"math"') ? loadMathFonts() : Promise.resolve()]);
    this.doc = doc;
    setMediaDocument(doc.id);
    this.sheet.textContent = styleSheet(doc);
    this.applyGeometry();
    const tpl = (doc.settings as unknown as { template?: { layout?: string; accent?: string } }).template;
    this.page.dataset.layout = tpl?.layout ?? 'classic';
    this.page.style.setProperty('--doc-accent', tpl?.accent ?? '#f97316');
    this.syncStyleOptions();
    this.states.clear();
    this.activeTab = doc.tabs[0].id;
    const state = this.makeState(0);
    this.states.set(this.activeTab, state);
    this.renderTabs();
    if (!this.view) {
      this.view = new EditorView(this.mount, {
        state,
        attributes: { class: 'ft-pm-root', spellcheck: 'true', 'aria-label': 'Document' },
        nodeViews: this.nodeViews(),
        handleDOMEvents: {
          mousedown: (view, e) => {
            const pos = cloneHit(view, e);
            if (pos === null) return false;
            e.preventDefault();
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
            view.focus();
            return true;
          },
        },
        handlePaste: (_view, e) => {
          const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          void this.insertPictures(files);
          return true;
        },
        handleDrop: (view, e) => {
          const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return false;
          e.preventDefault();
          const at = view.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY })?.pos;
          void this.insertPictures(files, at);
          return true;
        },
        dispatchTransaction: (tr) => {
          if (!this.view) return;
          const { state: next, transactions } = this.view.state.applyTransaction(tr);
          this.view.updateState(next);
          if (this.split) this.forwardToSplit(transactions, tr);
          this.states.set(this.activeTab, next);
          this.syncToolbar();
          if (tr.docChanged) { this.emitChange(); this.scheduleOutline(); if (!tr.getMeta(pagesKey)) { if (next.doc === tr.doc) this.paginator.scheduleEdit(tr); else this.paginator.schedule(); } if (tr.getMeta('paste') || tr.getMeta('uiEvent') === 'drop') this.adoptForeignMedia(); if (!tr.getMeta('fields') && !tr.getMeta(pagesKey)) this.scheduleFields(); }
          if (tr.getMeta(findKey) || tr.docChanged) this.syncFind();
          if (tr.selectionSet && !tr.docChanged) this.paginator.selectionMoved(next.selection.head);
        },
      });
    } else {
      this.view.updateState(state);
    }
    this.reseedSplit();
    this.sectionKey = '';
    this.applyGeometry();
    this.syncToolbar();
    this.renderOutline();
    this.hooks.status(this.words());
    this.scheduleFields(0);
    (this.root.querySelector('.ft-scroll') as HTMLElement).scrollTop = 0;
  }

  show(on: boolean): void {
    setHidden(this.root, !on);
    if (on) { this.paginator.layoutNow(); this.hooks.status(this.words()); this.view?.focus(); }
  }

  applyGeometry(): void {
    if (!this.doc) return;
    const s = this.doc.sections[0];
    const m = s.margins;
    const ext = s as unknown as { pageColor?: string; pageBorder?: string };
    const pageless = !!(this.doc.settings as unknown as { pageless?: boolean }).pageless || this.viewMode === 'draft';
    const W = s.page.width * PX;
    const maxW = Math.max(W, ...this.doc.sections.map((x) => x.page.width * PX));
    const side = (maxW - W) / 2;
    const css = pageless
      ? `width:${Math.max(W, 816).toFixed(0)}px;padding:48px 64px 96px;min-height:${(s.page.height * PX).toFixed(0)}px`
      : `width:${maxW.toFixed(0)}px;padding:${(m.top * PX).toFixed(0)}px ${(side + m.right * PX).toFixed(0)}px 0 ${(side + m.left * PX).toFixed(0)}px`;
    if (this.page.getAttribute('style')?.split(';--doc-accent')[0] !== css) {
      const accent = this.page.style.getPropertyValue('--doc-accent');
      this.page.setAttribute('style', css);
      if (accent) this.page.style.setProperty('--doc-accent', accent);
    }
    this.pagesEl.style.width = pageless ? '' : `${maxW.toFixed(0)}px`;
    this.setSectionGeometry(pageless);
    this.pagesEl.style.setProperty('--page-color', ext.pageColor || '#ffffff');
    this.pagesEl.style.setProperty('--page-pad-top', `${(m.header * PX).toFixed(0)}px`);
    this.pagesEl.style.setProperty('--page-pad-bottom', `${(m.footer * PX).toFixed(0)}px`);
    this.pagesEl.style.setProperty('--page-pad-x', `${(m.left * PX).toFixed(0)}px`);
    this.pagesEl.style.setProperty('--page-pad-xr', `${(m.right * PX).toFixed(0)}px`);
    this.pagesEl.dataset.border = ext.pageBorder || '';
    const scale = this.zoom === 1 ? '' : `scale(${this.zoom})`;
    if (this.pagesEl.style.transform !== scale) { this.pagesEl.style.transform = scale; this.pagesEl.style.transformOrigin = 'top center'; }
  }

  private sectionKey = '';

  private setSectionGeometry(pageless: boolean): void {
    if (!this.doc || !this.view) return;
    const g = sectionGeometry(this.doc.sections, pageless);
    const key = JSON.stringify(g);
    if (key === this.sectionKey) return;
    this.sectionKey = key;
    this.view.dispatch(this.view.state.tr.setMeta(sectionsKey, g).setMeta('addToHistory', false));
  }

  section(): Section | null { return this.doc?.sections[0] ?? null; }

  bodyWidth(): number {
    const s = this.doc?.sections[0];
    return s ? s.page.width - s.margins.left - s.margins.right : 468;
  }

  onEquationKey: (() => void) | null = null;
  private fieldTimer = 0;

  scheduleFields(delay = 400): void {
    window.clearTimeout(this.fieldTimer);
    this.fieldTimer = window.setTimeout(() => {
      if (!this.view) return;
      let formulas = false, vars = false;
      this.view.state.doc.descendants((n) => { if (n.type === schema.nodes.field) { if (n.attrs.kind === 'variable') vars = true; else formulas = true; } return !(formulas && vars); });
      if (vars) syncVariables(this.view, this.variables());
      if (formulas) void updateFields(this.view).catch(() => undefined);
    }, delay);
  }

  placePageAnchored(): void {
    if (!this.view) return;
    const items = Array.from((this.view.dom as HTMLElement).querySelectorAll<HTMLElement>('.ft-pic[data-rel="page"], .ft-shape[data-rel="page"]'));
    if (!items.length) return;
    const s = this.doc?.sections[0];
    if (!s) return;
    const pageless = !!(this.doc?.settings as unknown as { pageless?: boolean }).pageless || this.viewMode === 'draft';
    const stride = s.page.height * PX + GAP;
    const box = this.pagesEl.getBoundingClientRect();
    const ratio = box.width && this.pagesEl.offsetWidth ? box.width / this.pagesEl.offsetWidth : 1;
    const geo = this.paginator.sheetGeo;
    const maxW = Math.max(...this.doc!.sections.map((x) => x.page.width * PX));
    for (const n of items) {
      const p = n.offsetParent as HTMLElement | null;
      if (!p) continue;
      const r = p.getBoundingClientRect();
      const left = (r.left - box.left) / ratio, top = (r.top - box.top) / ratio;
      let page = 0;
      if (!pageless) { if (geo.length) { while (page + 1 < geo.length && geo[page + 1].top <= top) page++; } else page = Math.max(0, Math.floor(top / stride)); }
      const g = geo[page];
      const pageTop = pageless ? 0 : g ? g.top : page * stride;
      const pageLeft = !pageless && g ? (maxW - g.sec.page.width * PX) / 2 : 0;
      const ox = (pageLeft - left).toFixed(2), oy = (pageTop - top).toFixed(2);
      if (n.dataset.ox === ox && n.dataset.oy === oy) continue;
      const x = parseFloat(n.style.left) - (Number(n.dataset.ox) || 0), y = parseFloat(n.style.top) - (Number(n.dataset.oy) || 0);
      n.dataset.ox = ox;
      n.dataset.oy = oy;
      n.style.left = `${(x + Number(ox)).toFixed(2)}px`;
      n.style.top = `${(y + Number(oy)).toFixed(2)}px`;
    }
  }

  accent(): string {
    const a = (this.doc?.settings as unknown as { template?: { accent?: string } } | undefined)?.template?.accent;
    return a && /^#[0-9a-f]{6}$/i.test(a) ? a : '#f97316';
  }
  readonly ink: InkTool;

  bodyHeight(): number {
    const s = this.doc?.sections[0];
    return s ? s.page.height - s.margins.top - s.margins.bottom : 648;
  }

  async insertPictures(files: File[], at?: number): Promise<string[]> {
    if (!this.doc || !this.view) throw new Error('Open a document first.');
    const id = this.doc.id;
    const out = await api.upload<{ media: Array<{ name: string; type: string; bytes: number; source: string }>; errors: string[] }>(`/documents/${encodeURIComponent(id)}/media`, files);
    for (const e of out.errors) toast(e, 'error');
    if (!this.doc || this.doc.id !== id || !this.view) return [];
    const names: string[] = [];
    let pos = at;
    for (const m of out.media) {
      const { w, h } = await naturalSize(mediaUrl(m.name));
      this.doc = { ...this.doc, media: { ...(this.doc.media ?? {}), [m.name]: { type: m.type, bytes: m.bytes, source: m.source, width: w, height: h } } };
      const size = fitSize(w, h, this.bodyWidth(), this.bodyHeight() - 24);
      this.run(insertPicture({ media: m.name, alt: m.source.replace(/\.[a-z0-9]+$/i, ''), ...size }, pos));
      if (pos !== undefined) pos += 1;
      names.push(m.name);
    }
    return names;
  }

  async insertStockPicture(source: string, itemId: string, withCredit = true): Promise<{ media: string; credit: string }> {
    if (!this.doc || !this.view) throw new Error('Open a document first.');
    const id = this.doc.id;
    const out = await api.post<{ media: { name: string; type: string; bytes: number; source: string }; credit: Record<string, string> & { text: string } }>(`/documents/${encodeURIComponent(id)}/media/stock`, { source, id: itemId });
    if (!this.doc || this.doc.id !== id || !this.view) throw new Error('The document closed before the picture arrived.');
    const m = out.media;
    const { w, h } = await naturalSize(mediaUrl(m.name));
    const { text, ...credit } = out.credit;
    this.doc = { ...this.doc, media: { ...(this.doc.media ?? {}), [m.name]: { type: m.type, bytes: m.bytes, source: m.source, width: w, height: h, credit: { ...credit, text } } } };
    const size = fitSize(w, h, this.bodyWidth(), this.bodyHeight() - 24);
    const sel = this.view.state.selection;
    if (sel instanceof NodeSelection) this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(sel.to))));
    this.run(insertPicture({ media: m.name, alt: credit.title || text, ...size }));
    if (withCredit) {
      this.run((state, dispatch) => {
        if (!dispatch) return true;
        const $p = state.selection.$from;
        let depth = $p.depth;
        while (depth > 0 && $p.node(depth).type !== schema.nodes.paragraph) depth--;
        const at = depth > 0 ? $p.after(depth) : state.selection.to;
        const marks = [schema.marks.italic.create(), schema.marks.size.create({ pt: 9 }), schema.marks.color.create({ value: '#6b6b6b' })];
        dispatch(state.tr.insert(at, schema.nodes.paragraph.create({ style: 'Normal' }, schema.text(text, marks))).scrollIntoView());
        return true;
      });
    }
    return { media: m.name, credit: text };
  }

  sectionById(id: string): Section {
    const s = this.doc?.sections.find((x) => x.id === id) ?? this.doc?.sections[0];
    if (!s) throw new Error('Open a document first.');
    return s;
  }

  currentSectionId(): string {
    if (!this.doc || !this.view) throw new Error('Open a document first.');
    let id = this.doc.sections[0].id;
    const at = this.view.state.selection.from;
    this.view.state.doc.forEach((node, pos) => { if (pos < at && node.type === schema.nodes.section_break && node.attrs.section) id = String(node.attrs.section); });
    return id;
  }

  updateSectionById(id: string, patch: Partial<Section> & Record<string, unknown>, settings: Record<string, unknown> = {}): boolean {
    if (!this.doc) throw new Error('Open a document first.');
    if (this.doc.sections[0].id === id) return this.updatePage(patch, settings);
    this.doc = { ...this.doc, sections: this.doc.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as Section) : s)), settings: { ...this.doc.settings, ...settings } };
    this.applyGeometry();
    this.paginator.layoutNow();
    this.emitChange();
    return true;
  }

  insertSectionBreak(): string {
    if (!this.view || !this.doc) throw new Error('Open a document first.');
    const from = this.sectionById(this.currentSectionId());
    const id = `sec_${Math.random().toString(36).slice(2, 12)}`;
    const copy = JSON.parse(JSON.stringify(from)) as Section;
    delete copy.pageNumberStart;
    this.doc = { ...this.doc, sections: [...this.doc.sections, { ...copy, id, titlePage: false }] };
    const { state } = this.view;
    const after = state.selection.$from.depth ? state.selection.$from.after(1) : state.selection.from;
    const tr = state.tr.insert(after, [schema.nodes.section_break.create({ section: id }), schema.nodes.paragraph.create()]);
    tr.setSelection(TextSelection.near(tr.doc.resolve(after + 2)));
    this.view.dispatch(tr.scrollIntoView());
    return id;
  }

  updatePage(section: Partial<Section> & Record<string, unknown>, settings: Record<string, unknown> = {}): boolean {
    if (!this.doc) throw new Error('Open a document first.');
    const s = { ...this.doc.sections[0], ...section } as Section;
    this.doc = { ...this.doc, sections: [s, ...this.doc.sections.slice(1)], settings: { ...this.doc.settings, ...settings } };
    this.applyGeometry();
    this.paginator.layoutNow();
    this.emitChange();
    return true;
  }

  setZoom(z: number): number {
    this.zoom = Math.max(0.25, Math.min(3, z));
    this.applyGeometry();
    this.paginator.layoutNow();
    setValue(this.root.querySelector('.ft-tb-zoom') as HTMLSelectElement, String(Math.round(this.zoom * 100)));
    return Math.round(this.zoom * 100);
  }

  pageCount(): number { return this.paginator.pages; }

  setView(mode: ViewMode): ViewMode {
    if (!this.view) throw new Error('Open a document first.');
    this.viewMode = mode;
    this.root.dataset.view = mode;
    document.body.classList.toggle('ft-focus', mode === 'focus');
    this.view.setProps({ editable: () => mode !== 'read' });
    this.ruler.show(mode === 'print' || mode === 'focus');
    this.applyGeometry();
    this.paginator.layoutNow();
    this.view.focus();
    return mode;
  }

  insertCover(title: string, subtitle: string, byline: string): boolean {
    if (!this.view || !this.doc) throw new Error('Open a document first.');
    const p = (style: string, text: string, extra: Record<string, unknown> = {}) => schema.nodes.paragraph.create({ style, align: 'center', ...extra }, text ? schema.text(text) : null);
    const nodes = [p('Title', title || this.doc.title, { spaceBefore: 220 }), p('Subtitle', subtitle), p('Normal', byline), schema.nodes.page_break.create()];
    this.view.dispatch(this.view.state.tr.insert(0, nodes).scrollIntoView());
    this.updatePage({ titlePage: true });
    return true;
  }

  words(): number {
    return this.view ? this.view.state.doc.textBetween(0, this.view.state.doc.content.size, ' ', ' ').split(/\s+/).filter(Boolean).length : 0;
  }

  current(): FtxtDocument | null {
    if (!this.doc || !this.view) return null;
    const section = this.doc.sections[0].id;
    const tabs = this.doc.tabs.map((t) => { const s = this.states.get(t.id); return s ? { ...t, body: fromPM(s.doc, section) } : t; });
    return { ...this.doc, tabs };
  }

  private makeState(index: number): EditorState {
    return EditorState.create({ doc: toPM(this.doc!, index), plugins: [chipPlugin, rules, ...this.keys(), history(), dropCursor(), gapCursor(), uniqueIds, findPlugin, collapsePlugin, pagesPlugin, sectionsPlugin, ...tablePlugins()] });
  }

  tabs(): DocTab[] { return this.doc?.tabs ?? []; }

  selectTab(id: string): boolean {
    if (!this.doc || !this.view) throw new Error('Open a document first.');
    const index = this.doc.tabs.findIndex((t) => t.id === id);
    if (index < 0) throw new Error(`No tab has the id ${id}.`);
    if (id === this.activeTab) return true;
    this.states.set(this.activeTab, this.view.state);
    this.activeTab = id;
    let state = this.states.get(id);
    if (!state) { state = this.makeState(index); this.states.set(id, state); }
    this.view.updateState(state);
    this.reseedSplit();
    this.sectionKey = '';
    this.applyGeometry();
    this.paginator.layoutNow();
    this.renderTabs();
    this.renderOutline();
    this.syncToolbar();
    this.hooks.status(this.words());
    (this.root.querySelector('.ft-scroll') as HTMLElement).scrollTop = 0;
    this.view.focus();
    return true;
  }

  addTab(title = ''): string {
    if (!this.doc) throw new Error('Open a document first.');
    const id = `tab_${Math.random().toString(36).slice(2, 12)}`;
    const name = title.trim() || `Tab ${this.doc.tabs.length + 1}`;
    this.doc = { ...this.doc, tabs: [...this.doc.tabs, { id, title: name, parent: null, body: [] }] };
    this.selectTab(id);
    this.emitChange();
    return id;
  }

  renameTab(id: string, title: string): boolean {
    if (!this.doc) throw new Error('Open a document first.');
    if (!title.trim()) throw new Error('A tab needs a name.');
    this.doc = { ...this.doc, tabs: this.doc.tabs.map((t) => (t.id === id ? { ...t, title: title.trim().slice(0, 120) } : t)) };
    this.renderTabs();
    this.emitChange();
    return true;
  }

  deleteTab(id: string): boolean {
    if (!this.doc) throw new Error('Open a document first.');
    if (this.doc.tabs.length < 2) throw new Error('A document keeps at least one tab.');
    const rest = this.doc.tabs.filter((t) => t.id !== id);
    if (id === this.activeTab) this.selectTab(rest[0].id);
    this.doc = { ...this.doc, tabs: rest };
    this.states.delete(id);
    this.renderTabs();
    this.emitChange();
    return true;
  }

  private promptRenameTab(id: string): void {
    const tab = this.doc?.tabs.find((t) => t.id === id);
    if (!tab) return;
    const d = new Dialog('Rename tab', 420);
    const input = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false">');
    input.value = tab.title;
    d.field('Name', input);
    if ((this.doc?.tabs.length ?? 0) > 1) d.button('Delete tab', 'ghost', () => { d.close(); this.deleteTab(id); });
    d.button('Cancel', 'ghost', () => d.close());
    const ok = (): void => { d.close(); if (input.value.trim()) this.renameTab(id, input.value); };
    d.button('Rename', 'primary', ok);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    d.open(input);
  }

  private renderTabs(): void {
    const tabs = this.doc?.tabs ?? [];
    const update = (n: HTMLElement, t: DocTab): void => { setText(n, t.title); setClass(n, 'is-active', t.id === this.activeTab); };
    patchList(this.tabsList, tabs, { key: (t) => t.id, create: (t) => { const n = el(`<button type="button" class="ft-outline-item ft-tab" data-tab="${escapeHtml(t.id)}" title="Double-click to rename"></button>`); update(n, t); return n; }, update });
  }

  styles(): Record<string, Style> { return this.doc?.styles ?? {}; }

  currentStyleId(): string {
    const p = this.view?.state.selection.$from.parent;
    return p && p.type === schema.nodes.paragraph ? String(p.attrs.style) : 'Normal';
  }

  currentPara(): Record<string, unknown> {
    const p = this.view?.state.selection.$from.parent;
    return p ? { ...p.attrs } : {};
  }

  resolvedStyle(id: string): { run: Record<string, unknown>; para: Record<string, unknown> } {
    if (!this.doc) return { run: {}, para: {} };
    const r = resolve(this.doc, id);
    return { run: r.run, para: r.para as Record<string, unknown> };
  }

  setStyles(styles: Record<string, Style>): void {
    if (!this.doc) throw new Error('Open a document first.');
    this.doc = { ...this.doc, styles };
    this.sheet.textContent = styleSheet(this.doc);
    this.syncStyleOptions();
    this.syncToolbar();
    this.paginator.schedule();
    this.emitChange();
  }

  async applyStyleSet(id: string): Promise<string> {
    if (!this.doc) throw new Error('Open a document first.');
    const set = STYLE_SETS.find((s) => s.id === id);
    if (!set) throw new Error(`No style set is named ${id}. Sets: ${STYLE_SETS.map((s) => s.id).join(', ')}.`);
    await loadFonts(setFonts(set));
    this.setStyles(applyStyleSet(this.doc.styles, set));
    return set.name;
  }

  async preloadFonts(families: string[]): Promise<void> { await loadFonts(families); }

  docId(): string { return this.doc?.id ?? ''; }

  variables(): Record<string, string> {
    const v = this.doc?.variables;
    return v && typeof v === 'object' ? { ...v } : {};
  }

  setVariables(vars: Record<string, string>): void {
    if (!this.doc) throw new Error('Open a document first.');
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars).slice(0, 500)) if (k.trim()) clean[k.trim().slice(0, 40)] = String(v ?? '').slice(0, 500);
    this.doc = { ...this.doc, variables: clean };
    if (this.view) syncVariables(this.view, clean);
    this.emitChange();
  }

  paraProps(props: Record<string, unknown>): boolean { return this.run(setParaProps(props)); }
  recase(mode: CaseMode): boolean { return this.run(changeCase(mode)); }
  collapse(): boolean { return this.run(toggleCollapsed); }

  stats(): { words: number; characters: number; charactersNoSpaces: number; paragraphs: number } {
    const doc = this.view?.state.doc;
    if (!doc) return { words: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0 };
    const text = doc.textBetween(0, doc.content.size, '\n', ' ');
    let paragraphs = 0;
    doc.forEach((n) => { if (n.textContent.trim()) paragraphs++; });
    return { words: this.words(), characters: text.replace(/\n/g, '').length, charactersNoSpaces: text.replace(/\s/g, '').length, paragraphs };
  }

  togglePainter(): boolean {
    if (!this.view) throw new Error('Open a document first.');
    if (this.painter) { this.painter = null; }
    else {
      const p = this.view.state.selection.$from.parent;
      const para = p.type === schema.nodes.paragraph ? { style: p.attrs.style, align: p.attrs.align, indent: p.attrs.indent, indentRight: p.attrs.indentRight, indentFirst: p.attrs.indentFirst, spaceBefore: p.attrs.spaceBefore, spaceAfter: p.attrs.spaceAfter, lineSpacing: p.attrs.lineSpacing, border: p.attrs.border, shading: p.attrs.shading } : null;
      this.painter = { marks: this.activeMarks(), para };
    }
    setClass(this.root.querySelector('[data-cmd="format.painter"]'), 'is-on', !!this.painter);
    setClass(this.mount, 'is-painting', !!this.painter);
    return !!this.painter;
  }

  private applyPainter(): void {
    if (!this.view || !this.painter) return;
    const { from, to, empty } = this.view.state.selection;
    const paint = this.painter;
    this.painter = null;
    setClass(this.root.querySelector('[data-cmd="format.painter"]'), 'is-on', false);
    setClass(this.mount, 'is-painting', false);
    const tr = this.view.state.tr;
    if (!empty) {
      for (const t of Object.values(schema.marks)) if (t.name !== 'link') tr.removeMark(from, to, t);
      for (const m of paint.marks) if (m.type.name !== 'link') tr.addMark(from, to, m);
    }
    if (paint.para) {
      this.view.state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === schema.nodes.paragraph) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...paint.para });
        return node.type !== schema.nodes.paragraph;
      });
    }
    if (tr.docChanged) this.view.dispatch(tr);
  }

  private emitChange(): void {
    const doc = this.current();
    if (doc) { this.doc = doc; this.hooks.changed(doc); this.hooks.status(this.words()); }
  }

  run(cmd: Command): boolean {
    if (!this.view) throw new Error('Open a document first.');
    const inner = shapeEditing.view;
    if (inner && !inner.isDestroyed) {
      const done = cmd(inner.state, inner.dispatch, inner);
      if (done) { inner.focus(); return done; }
    }
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
  columnBreak(): boolean { return this.run(insertColumnBreak); }
  insertText(text: string): boolean {
    return this.run((state, dispatch) => {
      if (!text) return false;
      dispatch?.(state.tr.insertText(text).scrollIntoView());
      return true;
    });
  }

  private adopting = new Set<string>();

  private adoptForeignMedia(): void {
    if (!this.view || !this.doc) return;
    const own = this.doc.id;
    const wanted = new Map<string, { from: string; name: string }>();
    this.view.state.doc.descendants((n) => {
      if (n.type === schema.nodes.image && n.attrs.from) {
        const from = String(n.attrs.from), name = String(n.attrs.media);
        if (from !== own || !(name in (this.doc?.media ?? {}))) wanted.set(`${from}/${name}`, { from, name });
      }
      return true;
    });
    for (const [key, { from, name }] of wanted) {
      if (this.adopting.has(key)) continue;
      this.adopting.add(key);
      const clear = (): void => {
        this.adopting.delete(key);
        if (!this.view || !this.doc || this.doc.id !== own) return;
        const tr = this.view.state.tr;
        this.view.state.doc.descendants((n, pos) => { if (n.type === schema.nodes.image && n.attrs.from === from && n.attrs.media === name) tr.setNodeMarkup(pos, undefined, { ...n.attrs, from: '' }); return true; });
        if (tr.docChanged) this.view.dispatch(tr.setMeta('addToHistory', false));
      };
      if (from === own) { clear(); continue; }
      void fetch(mediaUrl(name, from)).then(async (res) => {
        if (!res.ok) throw new Error(`the source picture is no longer available (${res.status})`);
        const blob = await res.blob();
        const out = await api.upload<{ media: Array<{ name: string; type: string; bytes: number; source: string }>; errors: string[] }>(`/documents/${encodeURIComponent(own)}/media`, [new File([blob], name, { type: blob.type })]);
        if (out.errors.length || !this.doc || this.doc.id !== own) throw new Error(out.errors[0] ?? 'the document changed');
        const m = out.media[0];
        const meta = ((await this.otherMedia(from))[name] ?? {}) as Record<string, unknown>;
        this.doc = { ...this.doc, media: { ...(this.doc.media ?? {}), [m.name]: { ...meta, type: m.type, bytes: m.bytes } } };
        clear();
      }).catch((e: Error) => { this.adopting.delete(key); toast(`Could not copy a pasted picture: ${e.message}`, 'error'); });
    }
  }

  private async otherMedia(id: string): Promise<Record<string, unknown>> {
    try { return ((await api.get<FtxtDocument>(`/documents/${encodeURIComponent(id)}`)).media ?? {}) as Record<string, unknown>; } catch { return {}; }
  }
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
    const inTable = isInTable(state);
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-group="table"] button'))) if (b.disabled === inTable) b.disabled = !inTable;
    const shape = state.selection instanceof NodeSelection && state.selection.node.type === schema.nodes.shape ? state.selection.node : null;
    const box = shape?.attrs.kind === 'textBox';
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-group="shape"] button'))) {
      const on = b.dataset.cmd === 'shape.connect' ? !!shape && shape.attrs.kind !== 'connector' : b.dataset.cmd === 'shape.unlink' ? box && !!shape?.attrs.next : box;
      if (b.disabled === on) b.disabled = !on;
    }
    const sec = this.doc.sections[0];
    const a = para.attrs;
    this.ruler.update({
      pageWidth: sec.page.width, marginLeft: sec.margins.left, marginRight: sec.margins.right, zoom: this.zoom,
      indent: Number(a.indent || resolved.para.indentLeft || 0), indentFirst: Number(a.indentFirst || 0), indentRight: Number(a.indentRight || resolved.para.indentRight || 0),
      tabs: Array.isArray(a.tabs) ? (a.tabs as Array<{ pos: number; align: string }>) : [],
    });
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

  private split: EditorView | null = null;

  private nodeViews(): NonNullable<ConstructorParameters<typeof EditorView>[1]>['nodeViews'] {
    return { image: (node, view, getPos) => new PictureView(node, view, getPos), chart: (node) => new ChartView(node), shape: (node, view, getPos) => new ShapeView(node, view, getPos), math: (node) => new MathView(node), mermaid: (node, view, getPos) => new MermaidView(node, view, getPos, () => this.bodyWidth()), diagram: (node) => new DiagramView(node, () => this.accent()) };
  }

  private splitState(): EditorState {
    const mv = this.view!;
    const viaMain = (cmd: Command): Command => () => cmd(mv.state, mv.dispatch);
    return EditorState.create({ doc: mv.state.doc, plugins: [keymap({ 'Mod-z': viaMain(undo), 'Mod-y': viaMain(redo), 'Shift-Mod-z': viaMain(redo), 'Mod-b': mark('bold'), 'Mod-i': mark('italic'), 'Mod-u': mark('underline'), 'Mod-Alt-s': () => { this.toggleSplit(); return true; } }), keymap(baseKeymap), dropCursor(), gapCursor(), ...tablePlugins()] });
  }

  private reseedSplit(): void {
    if (this.split && this.view) this.split.updateState(this.splitState());
  }

  private splitDispatch(tr: Transaction): void {
    const sv = this.split, mv = this.view;
    if (!sv || !mv) return;
    const { state, transactions } = sv.state.applyTransaction(tr);
    sv.updateState(state);
    const mtr = mv.state.tr;
    for (const t of transactions) for (const s of t.steps) if (mtr.maybeStep(s).failed) { this.reseedSplit(); return; }
    if (mtr.docChanged) mv.dispatch(mtr.setMeta('fromSplit', true));
  }

  private forwardToSplit(trs: readonly Transaction[], origin: Transaction): void {
    const sv = this.split;
    if (!sv) return;
    const str = sv.state.tr;
    for (const t of trs) {
      if (t === origin && t.getMeta('fromSplit')) continue;
      for (const s of t.steps) if (str.maybeStep(s).failed) { this.reseedSplit(); return; }
    }
    if (str.docChanged) sv.updateState(sv.state.apply(str.setMeta('addToHistory', false)));
  }

  splitOpen(): boolean { return !!this.split; }

  toggleSplit(): boolean {
    if (!this.view) throw new Error('Open a document first.');
    const pane = this.root.querySelector('.ft-split') as HTMLElement;
    const on = !this.split;
    if (on) {
      pane.style.setProperty('--split-w', `${Math.round(this.bodyWidth())}px`);
      this.split = new EditorView(pane.querySelector('.ft-split-pm') as HTMLElement, { state: this.splitState(), attributes: { class: 'ft-pm-root ft-split-root', spellcheck: 'true', 'aria-label': 'Document, split window' }, nodeViews: this.nodeViews(), dispatchTransaction: (tr) => this.splitDispatch(tr) });
    } else {
      this.split?.destroy();
      this.split = null;
    }
    setHidden(pane, !on);
    setClass(this.root.querySelector('.ft-toolbar [data-cmd="view.split"]'), 'is-on', on);
    (on ? this.split! : this.view).focus();
    return on;
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
