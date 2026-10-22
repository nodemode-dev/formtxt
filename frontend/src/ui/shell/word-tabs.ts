import type { GroupDef, Item, MenuItem, ParamItem, Rows, SubMenu, TabDef, Unit } from './types';

const L = (id: string, label?: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, label, ...o });
const T = (id: string, label?: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, label, text: true, ...o });
const I = (id: string, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, ...o });
const C = (id: string, label: string, params: Record<string, unknown>, o: Partial<Item> = {}): Item => ({ k: 'cmd', id, label, params, ...o });
const A = (id: string, ic: string, label: string, o: Partial<Item> = {}): Item => ({ k: 'act', id, icon: ic, label, ...o });
const M = (id: string, ic: string, label: string, items: MenuItem[], o: Partial<Item> = {}): Item => ({ k: 'menu', id, icon: ic, label, items, ...o });
const S = (id: string): Item => ({ k: 'slot', id });
const R = (...rows: Item[][]): Rows => ({ rows });
const G = (id: string, label: string, ...units: Unit[]): GroupDef => ({ id, label, units });
const GL = (id: string, label: string, launcher: string, ...units: Unit[]): GroupDef => ({ id, label, units, launcher });
const P = (cmd: string, label: string, params: Record<string, unknown> = {}): ParamItem => ({ cmd, label, params });
const SM = (label: string, items: MenuItem[]): SubMenu => ({ label, items });
const PO = (pop: string, ic: string, label: string, o: Partial<Item> = {}): Item => ({ k: 'pop', id: pop, icon: ic, label, ...o });
const SP = (cmd: string, pop: string, ic: string, label: string, o: Partial<Item> = {}): Item => ({ k: 'split', id: cmd, pop, icon: ic, label, ...o });
const SEP: Item = { k: 'sep', id: 'sep' };

const SWATCHES: Array<[string, string]> = [
  ['Black', '#000000'], ['Dark Grey', '#4b5563'], ['Grey', '#9ca3af'], ['Red', '#dc2626'], ['Orange', '#f97316'], ['Yellow', '#facc15'],
  ['Green', '#16a34a'], ['Teal', '#0d9488'], ['Blue', '#2563eb'], ['Purple', '#9333ea'], ['Pink', '#db2777'],
];

const colorItems = (cmd: string, key: string, extra: Record<string, unknown> = {}, none?: string): MenuItem[] => {
  const out: MenuItem[] = SWATCHES.map(([n, v]) => P(cmd, n, { [key]: v, ...extra }));
  if (none) out.push('-', P(cmd, none, { [key]: '', ...extra }));
  return out;
};

const SHAPE_KINDS: MenuItem[] = [
  SM('Lines', [P('insert.shape', 'Line', { kind: 'line' })]),
  SM('Basic Shapes', [
    P('insert.shape', 'Rectangle', { kind: 'rect' }), P('insert.shape', 'Rounded Rectangle', { kind: 'roundRect' }), P('insert.shape', 'Oval', { kind: 'ellipse' }),
    P('insert.shape', 'Triangle', { kind: 'triangle' }), P('insert.shape', 'Right Triangle', { kind: 'rightTriangle' }), P('insert.shape', 'Diamond', { kind: 'diamond' }),
    P('insert.shape', 'Pentagon', { kind: 'pentagon' }), P('insert.shape', 'Hexagon', { kind: 'hexagon' }), P('insert.shape', 'Octagon', { kind: 'octagon' }),
    P('insert.shape', 'Plus', { kind: 'plus' }),
  ]),
  SM('Block Arrows', [
    P('insert.shape', 'Right Arrow', { kind: 'arrowRight' }), P('insert.shape', 'Left Arrow', { kind: 'arrowLeft' }), P('insert.shape', 'Up Arrow', { kind: 'arrowUp' }),
    P('insert.shape', 'Down Arrow', { kind: 'arrowDown' }), P('insert.shape', 'Chevron', { kind: 'chevron' }),
  ]),
  SM('Stars and Banners', [P('insert.shape', 'Star', { kind: 'star' }), P('insert.shape', 'Heart', { kind: 'heart' }), P('insert.shape', 'Cloud', { kind: 'cloud' })]),
  SM('Callouts', [P('insert.shape', 'Callout', { kind: 'callout' })]),
  '-',
  P('insert.shape', 'Text Box', { kind: 'textBox' }),
  'insert.shape',
];

const CHANGE_SHAPE: MenuItem[] = [
  P('shape.kind', 'Rectangle', { kind: 'rect' }), P('shape.kind', 'Rounded Rectangle', { kind: 'roundRect' }), P('shape.kind', 'Oval', { kind: 'ellipse' }),
  P('shape.kind', 'Triangle', { kind: 'triangle' }), P('shape.kind', 'Right Triangle', { kind: 'rightTriangle' }), P('shape.kind', 'Diamond', { kind: 'diamond' }),
  P('shape.kind', 'Pentagon', { kind: 'pentagon' }), P('shape.kind', 'Hexagon', { kind: 'hexagon' }), P('shape.kind', 'Octagon', { kind: 'octagon' }),
  P('shape.kind', 'Plus', { kind: 'plus' }), '-',
  P('shape.kind', 'Right Arrow', { kind: 'arrowRight' }), P('shape.kind', 'Left Arrow', { kind: 'arrowLeft' }), P('shape.kind', 'Up Arrow', { kind: 'arrowUp' }),
  P('shape.kind', 'Down Arrow', { kind: 'arrowDown' }), P('shape.kind', 'Chevron', { kind: 'chevron' }), '-',
  P('shape.kind', 'Star', { kind: 'star' }), P('shape.kind', 'Heart', { kind: 'heart' }), P('shape.kind', 'Cloud', { kind: 'cloud' }),
  P('shape.kind', 'Callout', { kind: 'callout' }), P('shape.kind', 'Line', { kind: 'line' }),
];

const DIAGRAM_LAYOUTS: Array<[string, string]> = [
  ['list-block', 'Basic Block List'], ['list-vertical', 'Vertical Bullet List'], ['process-basic', 'Basic Process'], ['process-chevron', 'Chevron Process'],
  ['cycle-basic', 'Basic Cycle'], ['cycle-radial', 'Radial Cycle'], ['hier-org', 'Organization Chart'], ['hier-horizontal', 'Horizontal Hierarchy'],
  ['rel-venn', 'Basic Venn'], ['matrix-basic', 'Basic Matrix'], ['pyramid-basic', 'Basic Pyramid'], ['timeline-basic', 'Basic Timeline'],
];

const SMARTART_MENU: MenuItem[] = [
  SM('List', [P('insert.diagram', 'Basic Block List', { layout: 'list-block' }), P('insert.diagram', 'Vertical Bullet List', { layout: 'list-vertical' })]),
  SM('Process', [P('insert.diagram', 'Basic Process', { layout: 'process-basic' }), P('insert.diagram', 'Chevron Process', { layout: 'process-chevron' }), P('insert.diagram', 'Basic Timeline', { layout: 'timeline-basic' })]),
  SM('Cycle', [P('insert.diagram', 'Basic Cycle', { layout: 'cycle-basic' }), P('insert.diagram', 'Radial Cycle', { layout: 'cycle-radial' })]),
  SM('Hierarchy', [P('insert.diagram', 'Organization Chart', { layout: 'hier-org' }), P('insert.diagram', 'Horizontal Hierarchy', { layout: 'hier-horizontal' })]),
  SM('Relationship', [P('insert.diagram', 'Basic Venn', { layout: 'rel-venn' })]),
  SM('Matrix', [P('insert.diagram', 'Basic Matrix', { layout: 'matrix-basic' })]),
  SM('Pyramid', [P('insert.diagram', 'Basic Pyramid', { layout: 'pyramid-basic' })]),
  '-',
  'insert.diagram',
];

const CHART_KINDS: Array<[string, string]> = [
  ['bar', 'Column'], ['hbar', 'Bar'], ['line', 'Line'], ['area', 'Area'], ['donut', 'Doughnut'], ['radial', 'Radial'], ['number', 'Number'],
  ['gauge', 'Gauge'], ['histogram', 'Histogram'], ['dots', 'Dot Plot'], ['compare', 'Compare'], ['heatmap', 'Heat Map'], ['calendar', 'Calendar'],
];

const CHART_MENU: MenuItem[] = [...CHART_KINDS.map(([k, n]) => P('insert.chart', n, { kind: k })), '-', 'insert.chart'];

const TABLE_MENU: MenuItem[] = [
  P('insert.table', '2 x 2 Table', { rows: 2, cols: 2 }), P('insert.table', '3 x 3 Table', { rows: 3, cols: 3 }), P('insert.table', '4 x 4 Table', { rows: 4, cols: 4 }),
  P('insert.table', '5 x 5 Table', { rows: 5, cols: 5 }), P('insert.table', '3 x 4 Table with Header Row', { rows: 3, cols: 4, header: true }), '-',
  P('insert.table', 'Insert Table...', {}), 'table.fromText', 'insert.formula',
];

const PICTURE_MENU: MenuItem[] = ['insert.picture', 'insert.stockImage', 'insert.icon', '-', 'ai.image', 'ai.imageOptions', 'ai.banner'];

const WORDART_MENU: MenuItem[] = [
  P('insert.wordArt', 'Fill', { style: 'fill' }), P('insert.wordArt', 'Outline', { style: 'outline' }), P('insert.wordArt', 'Shadow', { style: 'shadow' }),
  P('insert.wordArt', 'Gradient', { style: 'gradient' }), P('insert.wordArt', 'Glow', { style: 'glow' }), P('insert.wordArt', 'Retro', { style: 'retro' }),
];

const DROPCAP_MENU: MenuItem[] = [
  P('paragraph.dropCap', 'None', { mode: 'none' }), P('paragraph.dropCap', 'Dropped', { mode: 'dropped', lines: 3 }), P('paragraph.dropCap', 'In Margin', { mode: 'margin', lines: 3 }), '-',
  P('paragraph.dropCap', 'Drop Cap Options...', {}),
];

const QUICK_PARTS: MenuItem[] = [
  P('insert.block', 'Building Blocks', {}), 'blocks.save', '-', P('field.insert', 'Field...', {}), 'insert.variable', 'insert.placeholder', 'fields.update', '-',
  'collab.component.manage', 'collab.component.create', 'collab.component.insert', 'collab.component.unlink',
];

const CHIP_MENU: MenuItem[] = [
  P('insert.chip', 'Date', { kind: 'date' }), P('insert.chip', 'Person', { kind: 'person' }), P('insert.chip', 'Dropdown', { kind: 'dropdown' }),
  P('insert.chip', 'Document', { kind: 'doc' }), P('insert.chip', 'Placeholder', { kind: 'placeholder' }), '-', P('insert.chip', 'More Chips...', {}),
];

const CONTROL_MENU: MenuItem[] = [
  P('control.insert', 'Plain Text', { kind: 'text' }), P('control.insert', 'Rich Text', { kind: 'richtext' }), P('control.insert', 'Check Box', { kind: 'checkbox' }),
  P('control.insert', 'Date Picker', { kind: 'date' }), P('control.insert', 'Drop-Down List', { kind: 'dropdown' }), '-', 'control.dialog',
];

const PAGE_NUMBER_MENU: MenuItem[] = [
  SM('Top of Page', [P('insert.pageNumber', 'Left', { position: 'header', align: 'left' }), P('insert.pageNumber', 'Centre', { position: 'header', align: 'center' }), P('insert.pageNumber', 'Right', { position: 'header', align: 'right' })]),
  SM('Bottom of Page', [P('insert.pageNumber', 'Left', { position: 'footer', align: 'left' }), P('insert.pageNumber', 'Centre', { position: 'footer', align: 'center' }), P('insert.pageNumber', 'Right', { position: 'footer', align: 'right' })]),
  SM('Page Margins', [P('insert.pageNumber', 'Page N of M, Bottom Right', { position: 'footer', align: 'right', withTotal: true }), P('insert.pageNumber', 'Page N Only, Bottom Right', { position: 'footer', align: 'right', withTotal: false })]),
  '-',
  P('layout.restartNumbering', 'Restart at 1', { start: 1 }), P('layout.restartNumbering', 'Continue from Previous Section', {}),
];

const HEADER_MENU: MenuItem[] = [
  P('layout.setHeaderFooter', 'Blank (Left)', { part: 'header', align: 'left' }), P('layout.setHeaderFooter', 'Blank (Centre)', { part: 'header', align: 'center' }), P('layout.setHeaderFooter', 'Blank (Right)', { part: 'header', align: 'right' }),
  '-', 'insert.headerFooter',
];

const FOOTER_MENU: MenuItem[] = [
  P('layout.setHeaderFooter', 'Blank (Left)', { part: 'footer', align: 'left' }), P('layout.setHeaderFooter', 'Blank (Centre)', { part: 'footer', align: 'center' }), P('layout.setHeaderFooter', 'Blank (Right)', { part: 'footer', align: 'right' }),
  '-', 'insert.headerFooter',
];

const PARA_BORDERS_MENU: MenuItem[] = [
  P('paragraph.borders', 'Box Border', { which: 'box' }), P('paragraph.borders', 'Top Border', { which: 'top' }), P('paragraph.borders', 'Bottom Border', { which: 'bottom' }),
  P('paragraph.borders', 'Left Border', { which: 'left' }), P('paragraph.borders', 'Right Border', { which: 'right' }), '-', P('paragraph.borders', 'No Border', { which: 'none' }),
];

const PARA_SHADING_MENU: MenuItem[] = [...colorItems('paragraph.shading', 'color'), '-', P('paragraph.shading', 'Light Grey', {}), P('paragraph.shading', 'No Shading', { color: 'none' })];

const FIND_MENU: MenuItem[] = ['edit.find', 'edit.goTo'];

const WATERMARK_MENU: MenuItem[] = [
  ...['CONFIDENTIAL', 'DRAFT', 'DO NOT COPY', 'SAMPLE', 'ASAP', 'URGENT'].map((n) => P('design.watermark', n, { preset: n })),
  '-', P('design.watermark', 'Custom Watermark...', {}), P('design.watermark', 'Remove Watermark', { preset: 'remove' }),
];

const PAGE_COLOR_MENU: MenuItem[] = [...colorItems('design.pageColor', 'color'), '-', P('design.pageColor', 'No Colour', { color: '' }), P('design.pageColor', 'More Colours...', {})];

const PAGE_BORDERS_MENU: MenuItem[] = [
  P('design.pageBorders', 'Thin', { style: 'thin' }), P('design.pageBorders', 'Double', { style: 'double' }), P('design.pageBorders', 'Accent', { style: 'accent' }),
  '-', P('design.pageBorders', 'None', { style: 'none' }), P('design.pageBorders', 'Page Setup...', {}),
];

const TABLE_SELECT_MENU: MenuItem[] = [
  P('table.select', 'Select Cell', { what: 'cell' }), P('table.select', 'Select Column', { what: 'column' }), P('table.select', 'Select Row', { what: 'row' }), P('table.select', 'Select Table', { what: 'table' }),
];

const AUTOFIT_MENU: MenuItem[] = [
  P('table.autofit', 'AutoFit Contents', { mode: 'contents' }), P('table.autofit', 'AutoFit Window', { mode: 'window' }), P('table.autofit', 'Fixed Column Width', { mode: 'fixed' }),
];

const CELL_DIRECTION_MENU: MenuItem[] = [
  P('table.textDirection', 'Horizontal', { dir: 'horizontal' }), P('table.textDirection', 'Rotate All Text 90', { dir: 'rotate90' }), P('table.textDirection', 'Rotate All Text 270', { dir: 'rotate270' }),
];

const SHOW_MARKUP_MENU: MenuItem[] = [
  P('review.showMarkup', 'All Markup', { mode: 'all' }), P('review.showMarkup', 'Simple Markup', { mode: 'simple' }), P('review.showMarkup', 'No Markup', { mode: 'none' }), P('review.showMarkup', 'Original', { mode: 'original' }),
];

const MEDIA_MENU: MenuItem[] = ['insert.onlineVideo', 'insert.video', 'insert.audio'];

const BREAKS_MENU: MenuItem[] = [
  'insert.pageBreak', 'insert.columnBreak', '-',
  P('insert.sectionBreak', 'Next Page Section Break', { start: 'nextPage' }), P('insert.sectionBreak', 'Continuous Section Break', { start: 'continuous' }),
  P('insert.sectionBreak', 'Even Page Section Break', { start: 'evenPage' }), P('insert.sectionBreak', 'Odd Page Section Break', { start: 'oddPage' }),
];

const MARGINS_MENU: MenuItem[] = [
  P('layout.setPage', 'Normal: 1" all round', { top: 1, bottom: 1, left: 1, right: 1 }),
  P('layout.setPage', 'Narrow: 0.5" all round', { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }),
  P('layout.setPage', 'Moderate: 1" top and bottom, 0.75" sides', { top: 1, bottom: 1, left: 0.75, right: 0.75 }),
  P('layout.setPage', 'Wide: 1" top and bottom, 2" sides', { top: 1, bottom: 1, left: 2, right: 2 }),
  '-', P('layout.pageSetup', 'Custom Margins...', {}),
];

const ORIENTATION_MENU: MenuItem[] = [P('layout.setPage', 'Portrait', { orientation: 'portrait' }), P('layout.setPage', 'Landscape', { orientation: 'landscape' })];

const SIZE_MENU: MenuItem[] = [
  P('layout.setPage', 'Letter', { size: 'letter' }), P('layout.setPage', 'Legal', { size: 'legal' }), P('layout.setPage', 'A4', { size: 'a4' }),
  P('layout.setPage', 'A5', { size: 'a5' }), P('layout.setPage', 'Executive', { size: 'executive' }), P('layout.setPage', 'Tabloid', { size: 'tabloid' }),
  '-', P('layout.pageSetup', 'More Paper Sizes...', {}),
];

const COLUMNS_MENU: MenuItem[] = [
  P('layout.columns', 'One', { count: 1 }), P('layout.columns', 'Two', { count: 2 }), P('layout.columns', 'Three', { count: 3 }), P('layout.columns', 'Four', { count: 4 }),
  '-', P('layout.columns', 'More Columns...', {}),
];

const LINE_NUMBERS_MENU: MenuItem[] = [
  P('layout.lineNumbers', 'None', { mode: '' }), P('layout.lineNumbers', 'Continuous', { mode: 'continuous' }), P('layout.lineNumbers', 'Restart Each Page', { mode: 'page' }), '-', 'layout.lineNumbersToggle',
];

const HYPHENATION_MENU: MenuItem[] = [
  P('proofing.hyphenation', 'Automatic', { on: true }), P('proofing.hyphenation', 'None', { on: false }), '-', 'proofing.noHyphenate', 'proofing.softHyphen',
];

const SPACING_BEFORE: MenuItem[] = [0, 6, 12, 18, 24].map((n) => P('paragraph.set', `${n} pt`, { spaceBefore: n }));
const SPACING_AFTER: MenuItem[] = [0, 6, 8, 12, 18, 24].map((n) => P('paragraph.set', `${n} pt`, { spaceAfter: n }));

const STYLE_SET_MENU: MenuItem[] = [
  P('format.styleSet', 'Standard', { set: 'standard' }), P('format.styleSet', 'Classic Serif', { set: 'classic' }), P('format.styleSet', 'Editorial', { set: 'editorial' }),
  P('format.styleSet', 'Report', { set: 'report' }), P('format.styleSet', 'Academic', { set: 'academic' }), P('format.styleSet', 'Modern', { set: 'modern' }),
  P('format.styleSet', 'Warm', { set: 'warm' }), P('format.styleSet', 'Technical', { set: 'technical' }), P('format.styleSet', 'Elegant', { set: 'elegant' }),
  '-', P('format.styleSet', 'More Style Sets...', {}),
];

const PARA_SPACING_MENU: MenuItem[] = [
  P('paragraph.lineSpacing', 'Compact', { value: 1 }), P('paragraph.lineSpacing', 'Default', { value: 1.15 }), P('paragraph.lineSpacing', 'Relaxed', { value: 1.5 }),
  P('paragraph.lineSpacing', 'Double', { value: 2 }), P('paragraph.lineSpacing', 'Match Style', { value: 0 }),
];

const UNDERLINE_MENU: MenuItem[] = [
  P('format.underlineStyle', 'Single', { style: 'single' }), P('format.underlineStyle', 'Double', { style: 'double' }), P('format.underlineStyle', 'Dotted', { style: 'dotted' }),
  P('format.underlineStyle', 'Dashed', { style: 'dash' }), P('format.underlineStyle', 'Wavy', { style: 'wavy' }), '-', P('format.underlineStyle', 'No Underline', { style: '' }),
];

const CASE_MENU: MenuItem[] = ['format.case.sentence', 'format.case.lower', 'format.case.upper', 'format.case.title', 'format.case.toggle'];

const TEXT_EFFECTS_MENU: MenuItem[] = ['format.smallCaps', 'format.allCaps', '-', 'format.characterSpacing', 'font.advanced', 'font.typography'];

const DIRECTION_MENU: MenuItem[] = ['format.directionLtr', 'format.directionRtl'];

const FONT_MANAGE_MENU: MenuItem[] = ['font.add', 'font.manage', 'font.refresh', '-', 'document.embedFonts'];

const SCREENSHOT_MENU: MenuItem[] = [P('insert.screenshot', 'Screen Clipping', { mode: 'clip' }), P('insert.screenshot', 'Full Capture', { mode: 'full' })];

const MULTI_PAGE_MENU: MenuItem[] = [
  P('view.multiPage', '2 Pages', { pages: 2, on: true }), P('view.multiPage', '3 Pages', { pages: 3, on: true }), P('view.multiPage', '4 Pages', { pages: 4, on: true }),
  P('view.multiPage', '6 Pages', { pages: 6, on: true }), '-', P('view.multiPage', 'Back to One Page', { on: false }),
];

const NOTES_MENU: MenuItem[] = ['references.editNote', 'references.convertToEndnotes', 'references.convertToFootnotes'];

const CITATION_STYLE_MENU: MenuItem[] = [
  P('references.setCitationStyle', 'APA', { style: 'apa' }), P('references.setCitationStyle', 'MLA', { style: 'mla' }),
  P('references.setCitationStyle', 'Chicago', { style: 'chicago' }), P('references.setCitationStyle', 'IEEE', { style: 'ieee' }),
];

const PROOFING_OPTIONS_MENU: MenuItem[] = [
  'proofing.options', 'proofing.autocorrectOptions', 'proofing.dictionaryDialog', '-',
  P('proofing.writingStyle', 'Writing Style: Casual', { style: 'casual' }), P('proofing.writingStyle', 'Writing Style: Professional', { style: 'professional' }),
  P('proofing.writingStyle', 'Writing Style: Formal', { style: 'formal' }), '-',
  P('proofing.spelling', 'Check Spelling as You Type', {}), P('proofing.grammar', 'Check Grammar as You Type', {}),
];

const SUGGESTIONS_MENU: MenuItem[] = ['proofing.nextIssue', 'proofing.previousIssue', 'proofing.suggestions', 'proofing.fixAll', '-', 'proofing.dictionary'];

const LANGUAGE_MENU: MenuItem[] = [
  P('proofing.setLanguage', 'English (US)', { code: 'en-US', scope: 'selection' }), P('proofing.setLanguage', 'English (UK)', { code: 'en-GB', scope: 'selection' }),
  P('proofing.setLanguage', 'English (Australia)', { code: 'en-AU', scope: 'selection' }), P('proofing.setLanguage', 'English (Canada)', { code: 'en-CA', scope: 'selection' }),
  '-', P('proofing.setLanguage', 'Set Document Language: English (US)', { code: 'en-US', scope: 'document' }), 'proofing.doNotCheck', 'proofing.language',
];

const SPEECH_MENU: MenuItem[] = ['speech.readAloud', 'speech.panel', 'speech.pause', 'speech.resume', 'speech.stop'];

const TRANSLATE_MENU: MenuItem[] = [
  P('ai.translate', 'Translate Document...', { scope: 'document' }), P('ai.translate', 'Translate Selection...', { scope: 'selection' }),
  '-', P('ai.translate', 'Spanish', { language: 'es', scope: 'selection' }), P('ai.translate', 'French', { language: 'fr', scope: 'selection' }),
  P('ai.translate', 'German', { language: 'de', scope: 'selection' }), P('ai.translate', 'Japanese', { language: 'ja', scope: 'selection' }),
  P('ai.translate', 'Chinese (Simplified)', { language: 'zh-CN', scope: 'selection' }),
];

const EDIT_MODE_MENU: MenuItem[] = [
  P('review.setMode', 'Editing', { mode: 'editing' }), P('review.setMode', 'Suggesting', { mode: 'suggesting' }), P('review.setMode', 'Viewing', { mode: 'viewing' }),
];

const ACCEPT_MENU: MenuItem[] = ['review.acceptChange', 'review.acceptAll'];
const REJECT_MENU: MenuItem[] = ['review.rejectChange', 'review.rejectAll'];
const COMPARE_MENU: MenuItem[] = ['review.compareDocuments', 'review.combineDocuments', 'review.suggestFromDocument'];
const PASSWORD_MENU: MenuItem[] = ['password.set', 'password.remove', 'password.status'];

const SHARE_LINK_MENU: MenuItem[] = [
  P('collab.link.create', 'Link: Anyone can view', { mode: 'view' }), P('collab.link.create', 'Link: Anyone can comment', { mode: 'comment' }),
  P('collab.link.create', 'Link: Anyone can edit', { mode: 'edit' }), '-', 'collab.emailLink', 'collab.sendCopy', 'collab.emailCollaborators',
];

const PUBLISH_MENU: MenuItem[] = [
  'collab.publish.open', 'collab.unpublish', P('collab.publish.save', 'Save Page to a Folder', {}), P('collab.publish.save', 'Download Page', { download: true }), '-',
  P('collab.network', 'Allow Links on My Network', { enabled: true }), P('collab.network', 'Stop Allowing Network Links', { enabled: false }),
];

const MACROS_MENU: MenuItem[] = ['collab.macros', '-', 'collab.macro.record', 'collab.macro.stop', 'collab.macro.run', '-', 'collab.script.run'];

const RECOLOR_STYLE_MENU: MenuItem[] = [
  P('diagram.style', 'Flat', { style: 'flat' }), P('diagram.style', 'Outline', { style: 'outline' }), P('diagram.style', 'Shadow', { style: 'shadow' }),
];

const DIAGRAM_COLOR_MENU: MenuItem[] = [
  P('diagram.style', 'Colourful', { colors: 'colorful' }), P('diagram.style', 'Accent 1', { colors: 'accent1' }), P('diagram.style', 'Accent 2', { colors: 'accent2' }),
  P('diagram.style', 'Accent 3', { colors: 'accent3' }), P('diagram.style', 'Accent 4', { colors: 'accent4' }), P('diagram.style', 'Accent 5', { colors: 'accent5' }),
  P('diagram.style', 'Accent 6', { colors: 'accent6' }), P('diagram.style', 'Dark', { colors: 'dark' }),
];

const DIAGRAM_LAYOUT_MENU: MenuItem[] = DIAGRAM_LAYOUTS.map(([k, n]) => P('diagram.layout', n, { layout: k }));

const CHART_TYPE_MENU: MenuItem[] = CHART_KINDS.map(([k, n]) => P('chart.kind', n, { kind: k }));

const CHART_ELEMENT_MENU: MenuItem[] = [
  P('chart.options', 'Show Data Labels', { labels: true }), P('chart.options', 'Hide Data Labels', { labels: false }), '-',
  P('chart.options', 'Show Legend', { legend: true }), P('chart.options', 'Hide Legend', { legend: false }), '-',
  P('chart.options', 'Smooth Lines', { smooth: true }), P('chart.options', 'Straight Lines', { smooth: false }), '-',
  P('chart.options', 'Stacked', { stacked: true }), P('chart.options', 'Not Stacked', { stacked: false }), '-',
  P('chart.options', 'Show Sum', { fn: 'sum' }), P('chart.options', 'Show Average', { fn: 'average' }), P('chart.options', 'Show Minimum', { fn: 'min' }),
  P('chart.options', 'Show Maximum', { fn: 'max' }), P('chart.options', 'Show Count', { fn: 'count' }), '-', 'chart.title',
];

const CHART_EXPORT_MENU: MenuItem[] = [P('chart.export', 'Save as PNG', { format: 'png' }), P('chart.export', 'Save as SVG', { format: 'svg' })];

const PICTURE_POSITION_MENU: MenuItem[] = [
  P('picture.wrap', 'In Line with Text', { wrap: 'inline' }),
  P('picture.wrap', 'Square, Left', { wrap: 'square', side: 'left' }), P('picture.wrap', 'Square, Centre', { wrap: 'square', side: 'center' }), P('picture.wrap', 'Square, Right', { wrap: 'square', side: 'right' }),
  '-', 'picture.position',
];

const PICTURE_WRAP_MENU: MenuItem[] = [
  P('picture.wrap', 'In Line with Text', { wrap: 'inline' }), P('picture.wrap', 'Square', { wrap: 'square' }), P('picture.wrap', 'Tight', { wrap: 'tight' }),
  P('picture.wrap', 'Top and Bottom', { wrap: 'topBottom' }), P('picture.wrap', 'Behind Text', { wrap: 'behind' }), P('picture.wrap', 'In Front of Text', { wrap: 'front' }),
];

const SHAPE_POSITION_MENU: MenuItem[] = [
  P('shape.wrap', 'In Line with Text', { wrap: 'inline' }),
  P('shape.wrap', 'Square, Left', { wrap: 'square', side: 'left' }), P('shape.wrap', 'Square, Centre', { wrap: 'square', side: 'center' }), P('shape.wrap', 'Square, Right', { wrap: 'square', side: 'right' }),
  '-', 'shape.position',
];

const SHAPE_WRAP_MENU: MenuItem[] = [
  P('shape.wrap', 'In Line with Text', { wrap: 'inline' }), P('shape.wrap', 'Square', { wrap: 'square' }), P('shape.wrap', 'Top and Bottom', { wrap: 'topBottom' }),
  P('shape.wrap', 'Behind Text', { wrap: 'behind' }), P('shape.wrap', 'In Front of Text', { wrap: 'front' }),
];

const OBJECT_WRAP_MENU: MenuItem[] = [
  P('object.wrap', 'In Line with Text', { wrap: 'inline' }), P('object.wrap', 'Square, Left', { wrap: 'square', side: 'left' }), P('object.wrap', 'Square, Right', { wrap: 'square', side: 'right' }),
];

const ROTATE_PICTURE: MenuItem[] = [
  P('picture.rotate', 'Rotate Right 90', { degrees: 90 }), P('picture.rotate', 'Rotate 180', { degrees: 180 }), P('picture.rotate', 'Rotate Left 90', { degrees: 270 }),
  P('picture.rotate', 'Reset Rotation', { degrees: 0 }), '-', 'picture.rotate',
];

const ROTATE_SHAPE: MenuItem[] = [
  P('shape.rotate', 'Rotate Right 90', { degrees: 90 }), P('shape.rotate', 'Rotate 180', { degrees: 180 }), P('shape.rotate', 'Rotate Left 90', { degrees: 270 }),
  P('shape.rotate', 'Reset Rotation', { degrees: 0 }), '-', 'shape.rotate',
];

const BRIGHTNESS_MENU: MenuItem[] = [60, 80, 100, 120, 140].map((n) => P('picture.adjust', `Brightness ${n - 100 >= 0 ? '+' : ''}${n - 100}%`, { brightness: n }));
const CONTRAST_MENU: MenuItem[] = [60, 80, 100, 120, 140].map((n) => P('picture.adjust', `Contrast ${n - 100 >= 0 ? '+' : ''}${n - 100}%`, { contrast: n }));
const SATURATION_MENU: MenuItem[] = [
  P('picture.adjust', 'Greyscale', { saturation: 0 }), P('picture.adjust', 'Muted', { saturation: 50 }), P('picture.adjust', 'Normal', { saturation: 100 }),
  P('picture.adjust', 'Vivid', { saturation: 150 }), P('picture.adjust', 'Very Vivid', { saturation: 200 }),
];
const TRANSPARENCY_MENU: MenuItem[] = [0, 25, 50, 75].map((n) => P('picture.adjust', `Transparency ${n}%`, { transparency: n }));

const PICTURE_STYLE_MENU: MenuItem[] = [
  P('picture.style', 'Rounded Corners', { radius: 12 }), P('picture.style', 'Square Corners', { radius: 0 }), P('picture.style', 'Soft Shadow', { shadow: true }), P('picture.style', 'No Shadow', { shadow: false }),
  '-', P('picture.style', 'Thin Border', { borderWidth: 1 }), P('picture.style', 'Medium Border', { borderWidth: 3 }), P('picture.style', 'No Border', { borderWidth: 0 }),
];

const PICTURE_BORDER_MENU: MenuItem[] = [...colorItems('picture.style', 'border', { borderWidth: 2 }), '-', P('picture.style', 'No Border', { borderWidth: 0 })];

const CROP_MENU: MenuItem[] = [P('picture.cropTool', 'Crop on the Picture', { on: true }), P('picture.cropTool', 'Apply Crop', { on: true, apply: true }), P('picture.cropTool', 'Stop Cropping', { on: false }), '-', 'picture.crop'];

const SHAPE_OUTLINE_MENU: MenuItem[] = [
  ...colorItems('shape.outline', 'color', {}), '-',
  P('shape.outline', 'Weight: 0.5 pt', { width: 0.5 }), P('shape.outline', 'Weight: 1 pt', { width: 1 }), P('shape.outline', 'Weight: 2 pt', { width: 2 }), P('shape.outline', 'Weight: 4 pt', { width: 4 }), '-',
  P('shape.outline', 'No Outline', { color: '' }),
];

const SHAPE_FILL_MENU: MenuItem[] = [...colorItems('shape.fill', 'color'), '-', P('shape.fill', 'No Fill', { color: '' })];

const SHAPE_EFFECTS_MENU: MenuItem[] = [
  P('shape.effects', 'Soft Shadow', { shadow: true }), P('shape.effects', 'No Shadow', { shadow: false }), '-',
  P('shape.effects', 'Gradient: Blue', { gradient: '#2563eb' }), P('shape.effects', 'Gradient: Orange', { gradient: '#f97316' }),
  P('shape.effects', 'Gradient: Green', { gradient: '#16a34a' }), P('shape.effects', 'Gradient: Purple', { gradient: '#9333ea' }), P('shape.effects', 'No Gradient', { gradient: '' }),
];

const SHAPE_ARROWS_MENU: MenuItem[] = [
  P('shape.arrows', 'Arrow at End', { start: false, end: true }), P('shape.arrows', 'Arrow at Start', { start: true, end: false }),
  P('shape.arrows', 'Arrows at Both Ends', { start: true, end: true }), P('shape.arrows', 'No Arrows', { start: false, end: false }),
];

const SHAPE_WORDART_MENU: MenuItem[] = [
  P('shape.wordArt', 'Fill', { style: 'fill' }), P('shape.wordArt', 'Outline', { style: 'outline' }), P('shape.wordArt', 'Shadow', { style: 'shadow' }),
  P('shape.wordArt', 'Gradient', { style: 'gradient' }), P('shape.wordArt', 'Glow', { style: 'glow' }), P('shape.wordArt', 'Retro', { style: 'retro' }),
];

const SHAPE_TEXT_MENU: MenuItem[] = [
  ...colorItems('shape.textFormat', 'color'), '-',
  P('shape.textFormat', 'Bold', { bold: true }), P('shape.textFormat', 'Not Bold', { bold: false }), '-',
  P('shape.textFormat', 'Align Left', { align: 'left' }), P('shape.textFormat', 'Align Centre', { align: 'center' }), P('shape.textFormat', 'Align Right', { align: 'right' }), '-',
  P('shape.textFormat', 'Align Top', { valign: 'top' }), P('shape.textFormat', 'Align Middle', { valign: 'middle' }), P('shape.textFormat', 'Align Bottom', { valign: 'bottom' }),
];

const TABLE_BORDERS_MENU: MenuItem[] = [
  P('table.borders', 'All Borders', { target: 'all' }), P('table.borders', 'Outside Borders', { target: 'outside' }), P('table.borders', 'Inside Borders', { target: 'inside' }), '-',
  P('table.borders', 'Top Border', { target: 'top' }), P('table.borders', 'Bottom Border', { target: 'bottom' }), P('table.borders', 'Left Border', { target: 'left' }), P('table.borders', 'Right Border', { target: 'right' }), '-',
  P('table.borders', 'Inside Horizontal Border', { target: 'insideH' }), P('table.borders', 'Inside Vertical Border', { target: 'insideV' }), '-',
  P('table.borders', 'No Border', { target: 'none' }), P('table.borders', 'Reset to Table Look', { target: 'clear' }), '-',
  P('table.borders', 'Borders and Shading...', {}),
];

const BORDER_STYLE_MENU: MenuItem[] = [
  P('table.borders', 'Solid', { style: 'solid', target: 'all' }), P('table.borders', 'Dashed', { style: 'dashed', target: 'all' }),
  P('table.borders', 'Dotted', { style: 'dotted', target: 'all' }), P('table.borders', 'Double', { style: 'double', target: 'all' }),
];

const BORDER_WEIGHT_MENU: MenuItem[] = [0.5, 1, 1.5, 2.25, 3, 4.5, 6].map((n) => P('table.borders', `${n} pt`, { width: n, target: 'all' }));

const BORDER_COLOR_MENU: MenuItem[] = colorItems('table.borders', 'color', { target: 'all' });

const TABLE_SHADING_MENU: MenuItem[] = [...colorItems('table.shading', 'value'), '-', P('table.shading', 'No Shading', { value: '' })];

const TABLE_LOOK_MENU: MenuItem[] = [
  P('table.look', 'Grid', { look: 'grid' }), P('table.look', 'Plain', { look: 'plain' }), P('table.look', 'Rows', { look: 'rows' }), P('table.look', 'Banded', { look: 'banded' }), P('table.look', 'Accent', { look: 'accent' }),
  '-', 'table.applyStyle', 'table.saveStyle', 'table.deleteStyle',
];

const TABLE_ALIGN_MENU: MenuItem[] = [P('table.align', 'Align Table Left', { align: 'left' }), P('table.align', 'Centre Table', { align: 'center' })];

const CELL_VALIGN: Item[] = [
  C('table.valign', 'Align Top', { value: 'top' }, { icon: 'cellAlignTop' }),
  C('table.valign', 'Align Middle', { value: 'middle' }, { icon: 'cellAlignMiddle' }),
  C('table.valign', 'Align Bottom', { value: 'bottom' }, { icon: 'cellAlignBottom' }),
];

const TABLE_DELETE_MENU: MenuItem[] = ['table.deleteRow', 'table.deleteColumn', 'table.delete'];

const TABLE_SORT_MENU: MenuItem[] = [
  P('table.sort', 'Sort by Column 1, A to Z', { column: 1, descending: false }), P('table.sort', 'Sort by Column 1, Z to A', { column: 1, descending: true }),
  P('table.sort', 'Sort by Column 2, A to Z', { column: 2, descending: false }), P('table.sort', 'Sort by Column 2, Z to A', { column: 2, descending: true }),
  P('table.sort', 'Sort by Column 3, A to Z', { column: 3, descending: false }), P('table.sort', 'Sort by Column 3, Z to A', { column: 3, descending: true }),
];

const DRAW_COLORS: MenuItem[] = SWATCHES.map(([n, v]) => P('view.draw', n, { on: true, tool: 'pen', color: v }));
const HILITE_COLORS: MenuItem[] = [['Yellow', '#facc15'], ['Green', '#4ade80'], ['Cyan', '#22d3ee'], ['Pink', '#f472b6'], ['Orange', '#fb923c']].map(([n, v]) => P('view.draw', n, { on: true, tool: 'highlighter', color: v }));
const DRAW_WIDTHS: MenuItem[] = [1, 2, 4, 8, 14].map((n) => P('view.draw', `${n} pt`, { on: true, width: n }));

const equationTab = (): TabDef => ({ id: 'equation', label: 'Equation', ctx: 'equation', groups: [
  G('eq-tools', 'Tools', S('b.q.equation'), S('b.q.edit'), R([S('b.q.professional')], [S('b.q.linear')])),
  G('eq-symbols', 'Symbols', S('b.q.symbols')),
  G('eq-structures', 'Structures', S('b.q.fraction'), S('b.q.script'), S('b.q.radical'), S('b.q.integral'), S('b.q.large'), S('b.q.bracket'), S('b.q.function'), S('b.q.accent'), S('b.q.limit'), S('b.q.operator'), S('b.q.matrix')),
  G('eq-caption', 'Caption', L('references.insertCaption', 'Insert Caption', { icon: 'caption' }), L('references.insertCrossReference', 'Cross-reference')),
] });

export function wordTabs(): TabDef[] {
  return [
    { id: 'home', label: 'Home', groups: [
      { ...G('clipboard', 'Clipboard', SP('edit.paste', 'paste', 'paste', 'Paste'), R([T('edit.cut', 'Cut', { icon: 'cut' })], [T('edit.copy', 'Copy', { icon: 'copy' })], [T('format.painter', 'Format Painter')])), rank: -2 },
      { ...GL('font', 'Font', 'font.advanced',
        R([S('font'), S('size'), I('format.growFont'), I('format.shrinkFont'), PO('case', 'changeCase', 'Change Case'), I('format.clear', { label: 'Clear All Formatting' })],
          [I('format.bold'), I('format.italic'), SP('format.underline', 'underline', 'underline', 'Underline'), I('format.strike'), I('format.subscript'), I('format.superscript'), PO('texteffects', 'textEffects', 'Text Effects and Typography'),
            SP('format.highlight', 'highlight', 'highlighter', 'Text Highlight Color', { swatch: true, swatchValue: '#FFFF00', params: { value: '#FFFF00' } }),
            SP('format.color', 'fontColor', 'textColor', 'Font Color', { swatch: true, swatchValue: '#FF0000', params: { value: '#FF0000' } })])), rank: -1, icon: 'fonts' },
      GL('paragraph', 'Paragraph', 'format.paragraph',
        R([SP('list.bullet', 'bullets', 'listBullet', 'Bullets'), SP('list.number', 'numbering', 'listNumber', 'Numbering'), PO('multilevel', 'outline', 'Multilevel List'), I('list.check'), SEP, I('paragraph.outdent'), I('paragraph.indent'), SEP, M('text-direction', 'textDirection', 'Text Direction', DIRECTION_MENU), I('edit.sortParagraphs'), I('view.formattingMarks')],
          [I('paragraph.align.left'), I('paragraph.align.center'), I('paragraph.align.right'), I('paragraph.align.justify'), SEP, PO('linespacing', 'paraSpacing', 'Line and Paragraph Spacing'),
            SP('paragraph.shading', 'shading', 'paraShading', 'Shading', { swatch: true, swatchValue: '#D9D9D9' }), SP('paragraph.borders', 'borders', 'paraBorders', 'Borders', { params: { which: 'bottom' } })])),
      { ...GL('styles', 'Styles', 'format.styles', S('style-gallery')), icon: 'styles' },
      G('editing', 'Editing', R([SP('edit.find', 'find', 'find', 'Find', { text: true })], [T('edit.find', 'Replace', { icon: 'replace' })], [PO('select', 'selectAll', 'Select', { text: true })])),
      G('voice', 'Voice', L('dictation.toggle', 'Dictate'), L('transcribe.panel', 'Transcribe')),
      G('editor', 'Editor', L('proofing.editorPanel', 'Editor')),
      G('addins', 'Add-ins', L('collab.addins', 'Add-ins')),
      G('copilot', 'AI', L('ai.togglePanel', 'AI')),
    ] },
    { id: 'insert', label: 'Insert', groups: [
      G('pages', 'Pages', PO('cover', 'coverPage', 'Cover Page'), L('insert.blankPage', 'Blank Page'), L('insert.pageBreak', 'Page Break')),
      G('tables', 'Tables', PO('table', 'table', 'Table')),
      G('illustrations', 'Illustrations',
        PO('pictures', 'image', 'Pictures'),
        PO('shapes', 'shapes', 'Shapes'),
        R([T('insert.icon', 'Icons', { icon: 'iconLibrary' })], [T('insert.mermaid', 'Mermaid', { icon: 'mermaid' })]),
        R([PO('smartart', 'diagram', 'SmartArt', { text: true })], [PO('chart', 'chart', 'Chart', { text: true })], [PO('screenshot', 'screenshot', 'Screenshot', { text: true })])),
      G('links', 'Links', L('insert.link', 'Link'), R([T('references.manageBookmarks', 'Bookmark')], [T('references.insertCrossReference', 'Cross-reference')])),
      G('comments', 'Comments', L('review.newComment', 'Comment')),
      G('headerfooter', 'Header & Footer',
        PO('header', 'header', 'Header'),
        PO('footer', 'footer', 'Footer'),
        PO('pagenumber', 'pageNumber', 'Page Number')),
      G('text', 'Text',
        PO('textbox', 'textBox', 'Text Box'),
        R([PO('quickparts', 'quickParts', 'Quick Parts', { text: true })], [PO('wordart', 'wordArt', 'WordArt', { text: true })], [PO('dropcap', 'dropCap', 'Drop Cap', { text: true })]),
        R([T('signature.dialog', 'Signature Line')], [T('insert.dateTime', 'Date & Time')], [T('insert.embeddedFile', 'Object')])),
      G('symbols', 'Symbols', SP('insert.equation', 'equation', 'equation', 'Equation'), PO('symbol', 'omega', 'Symbol')),
      { ...G('chips', 'Chips & Tabs', M('chips', 'chip', 'Smart Chips', CHIP_MENU), M('controls', 'contentControl', 'Content Controls', CONTROL_MENU), M('media', 'media', 'Media', MEDIA_MENU), R([T('insert.codeBlock', 'Code Block')], [T('insert.emoji', 'Emoji')], [T('insert.tab', 'Tab')]), L('tabs.add', 'Add Tab'), R([T('tabs.rename', 'Rename Tab')], [T('tabs.delete', 'Delete Tab')])), rank: 6 },
    ] },
    { id: 'draw', label: 'Draw', groups: [
      G('tools', 'Tools', S('b.select'), S('b.eraser')),
      G('pens', 'Pens', S('b.pens'), S('b.addPen')),
    ] },
    { id: 'design', label: 'Design', groups: [
      G('docformat', 'Document Formatting',
        PO('styleset', 'styleSet', 'Style Sets'),
        PO('parspacing', 'paraSpacing', 'Paragraph Spacing'),
        PO('docfonts', 'fonts', 'Fonts'),
        R([T('format.styles', 'Modify Style', { icon: 'styles' })], [T('document.headingNumbers', 'Number Headings', { icon: 'headingNumbers' })])),
      G('pagebg', 'Page Background', PO('watermark', 'watermark', 'Watermark'), PO('pagecolor', 'pageColor', 'Page Color'), PO('pageborders', 'pageBorders', 'Page Borders')),
    ] },
    { id: 'layout', label: 'Layout', groups: [
      GL('pagesetup', 'Page Setup', 'layout.pageSetup',
        PO('margins', 'margins', 'Margins'),
        PO('orientation', 'orientation', 'Orientation'),
        PO('size', 'pageSize', 'Size'),
        PO('columns', 'columns', 'Columns'),
        R([PO('breaks', 'breaks', 'Breaks', { text: true })], [PO('linenumbers', 'lineNumbers', 'Line Numbers', { text: true })], [PO('hyphenation', 'hyphenation', 'Hyphenation', { text: true })])),
      GL('layout-paragraph', 'Paragraph', 'format.paragraph',
        R([S('sp-left')], [S('sp-right')]),
        R([S('sp-before')], [S('sp-after')])),
      G('arrange', 'Arrange',
        PO('position', 'position', 'Position'),
        PO('wrap', 'wrapText', 'Wrap Text'),
        R([PO('forward', 'bringForward', 'Bring Forward', { text: true })], [PO('backward', 'sendBackward', 'Send Backward', { text: true })], [PO('rotate', 'rotate', 'Rotate', { text: true })]),
        R([T('object.size', 'Size', { icon: 'objectSize' })], [T('object.download', 'Save Object', { icon: 'download' })])),
    ] },
    { id: 'references', label: 'References', groups: [
      G('toc', 'Table of Contents', S('b.toc'), R([S('b.addText')], [T('references.updateToc', 'Update Table')], [T('references.updateAll', 'Update All')])),
      GL('footnotes', 'Footnotes', 'references.noteDialog', L('references.insertFootnote', 'Insert Footnote'), R([T('references.insertEndnote', 'Insert Endnote')], [S('b.nextNote')], [S('b.showNotes')])),
      G('research', 'Research', L('ai.search', 'Search'), R([T('ai.ask', 'Ask About Results', { icon: 'ask' })])),
      G('citations', 'Citations & Bibliography',
        S('b.cite'),
        R([T('references.manageSources', 'Manage Sources')], [S('b.citeStyle')], [T('references.addSource', 'Add Source', { icon: 'plus' })]),
        S('b.bib')),
      G('captions', 'Captions', L('references.insertCaption', 'Insert Caption'), R([T('references.insertTableOfFigures', 'Insert Table of Figures')], [T('references.updateAll', 'Update Table', { icon: 'refresh' })], [T('references.insertCrossReference', 'Cross-reference')])),
      G('index', 'Index', L('references.markIndexEntry', 'Mark Entry'), R([T('references.insertIndex', 'Insert Index')], [T('references.updateAll', 'Update Index', { icon: 'refresh' })])),
    ] },
    { id: 'mailings', label: 'Mailings', groups: [
      G('create', 'Create', L('envelope.dialog', 'Envelopes'), L('labels.dialog', 'Labels')),
      G('startmerge', 'Start Mail Merge', S('b.startMerge'), S('b.recipients'), R([S('b.editRecipients')])),
      G('fields', 'Write & Insert Fields', S('b.highlight'), R([S('b.addressBlock')], [S('b.greeting')]), S('b.insertField'), R([T('insert.placeholder', 'Placeholder')], [T('placeholders.fill', 'Fill In Placeholders')], [T('insert.variable', 'Variable')])),
      G('preview', 'Preview Results', S('b.preview'), R([S('b.navigator')])),
      G('finish', 'Finish', S('b.finish')),
    ] },
    { id: 'review', label: 'Review', groups: [
      G('proofing', 'Proofing',
        S('b.spelling'),
        R([T('tools.thesaurus', 'Thesaurus')], [T('tools.wordCount', 'Word Count')], [T('proofing.readability', 'Readability')]),
        R([T('tools.stats', 'Statistics')], [M('proofing-options', 'proofingOptions', 'Options', PROOFING_OPTIONS_MENU, { text: true })], [M('suggestions', 'suggestions', 'Suggestions', SUGGESTIONS_MENU, { text: true })])),
      G('speech', 'Speech', S('b.readAloud')),
      G('accessibility', 'Accessibility', S('b.access')),
      G('language', 'Language', S('b.translate'), S('b.language')),
      G('comments', 'Comments', S('b.newComment'), S('b.deleteComment'), R([T('review.prevComment', 'Previous')], [T('review.nextComment', 'Next')], [S('b.showComments')]), R([T('review.resolveComment', 'Resolve', { icon: 'resolve' })], [T('review.reactToSelection', 'React', { icon: 'react' })])),
      G('tracking', 'Tracking', S('b.track'), R([S('b.display')], [S('b.showMarkup')], [S('b.reviewPane')]), R([S('b.editMode')])),
      G('changes', 'Changes',
        S('b.accept'), S('b.reject'),
        R([T('review.previousChange', 'Previous', { icon: 'prevChange' })], [T('review.nextChange', 'Next', { icon: 'nextChange' })])),
      G('compare', 'Compare', S('b.compare')),
      G('protect', 'Protect', L('protect.dialog', 'Restrict Editing', { icon: 'restrict' }), R([M('password', 'password', 'Password', PASSWORD_MENU, { text: true })], [T('approval.dialog', 'Approvals', { icon: 'resolve' })])),
      G('history', 'History', L('versions.panel', 'Version History'), L('activity.show', 'Activity', { icon: 'clock' })),
      G('share', 'Share', L('collab.share', 'Share'), R([M('share-link', 'shareLink', 'Links and Email', SHARE_LINK_MENU, { text: true })], [M('publish', 'publish', 'Publish', PUBLISH_MENU, { text: true })], [T('collab.who', 'Who Is Here', { icon: 'people' })])),
    ] },
    { id: 'view', label: 'View', groups: [
      G('views', 'Views',
        L('view.read', 'Read Mode'), L('view.print', 'Print Layout'), L('view.pageless', 'Web Layout'),
        R([T('view.outline', 'Outline')], [T('view.draft', 'Draft')], [T('view.focus', 'Focus')])),
      G('immersive', 'Immersive', S('b.immersive')),
      G('pagemove', 'Page Movement', S('b.vertical'), S('b.sideToSide')),
      G('show', 'Show', R([S('b.showRuler')], [S('b.showGrid')], [S('b.showNav')]), R([T('view.formattingMarks', 'Formatting Marks')], [T('view.toggleTheme', 'Switch Theme', { icon: 'theme' })])),
      G('zoom', 'Zoom', S('b.zoom'), R([T('view.zoom100', '100%')], [T('view.onePageZoom', 'One Page')], [S('b.multi')]), R([T('view.pageWidth', 'Page Width')], [T('view.zoomIn', 'Zoom In')], [T('view.zoomOut', 'Zoom Out')])),
      G('window', 'Window', R([T('view.split', 'Split')], [T('view.collapseHeading', 'Collapse Heading', { icon: 'collapseHeading' })], [T('edit.commandPalette', 'Find a Command', { icon: 'search' })])),
      G('macros', 'Macros', S('b.macros')),
      G('properties', 'Properties', L('file.properties', 'Properties', { icon: 'properties' })),
    ] },
    { id: 'ai', label: 'AI', groups: [
      G('assistant', 'Assistant', L('ai.togglePanel', 'AI Panel'), R([T('ai.promptBox', 'Help Me Write', { icon: 'ai' })], [T('ai.chat', 'Chat About Document', { icon: 'chatDoc' })], [T('ai.draft', 'Draft at Caret', { icon: 'draftText' })]), L('ai.createDraft', 'First Draft')),
      G('rewrite', 'Rewrite', R([T('ai.shorter', 'Shorter', { icon: 'shorter' })], [T('ai.longer', 'Longer', { icon: 'longer' })], [T('ai.simplify', 'Simplify', { icon: 'simplify' })]), R([T('ai.moreFormal', 'More Formal', { icon: 'formal' })], [T('ai.moreCasual', 'More Casual', { icon: 'casual' })], [T('ai.matchStyle', 'Match Style', { icon: 'matchStyle' })])),
      G('docai', 'Document', L('ai.summarize', 'Summarize'), R([T('ai.summaryBlock', 'Summary Block', { icon: 'summaryBlock' })], [T('ai.summaryAuto', 'Keep Updated', { icon: 'summaryAuto' })], [T('ai.editDocument', 'Edit Across', { icon: 'editDoc' })]), L('ai.matchFormat', 'Match Format', { icon: 'painter' }), L('ai.translate', 'Translate')),
      G('aichanges', 'AI Changes', R([T('ai.acceptChanges', 'Accept', { icon: 'accept' })], [T('ai.rejectChanges', 'Reject', { icon: 'reject' })], [T('ai.suggestChanges', 'As Suggestions', { icon: 'suggestChanges' })])),
      G('aimedia', 'Create', L('ai.image', 'Generate Image', { icon: 'aiImage' }), R([T('ai.imageOptions', 'Image Options', { icon: 'aiImage' })], [T('ai.banner', 'Banner', { icon: 'banner' })])),
      G('listen', 'Listen', L('ai.listen', 'Listen', { icon: 'listen' }), R([T('ai.listenPause', 'Pause', { icon: 'pause' })], [T('ai.listenStop', 'Stop', { icon: 'stop' })], [T('ai.audioOverview', 'Audio Overview', { icon: 'audioOverview' })])),
      G('aisearch', 'Library', L('ai.search', 'Search Library'), L('ai.thesaurus', 'Thesaurus')),
      G('aisettings', 'Settings', L('ai.settings', 'AI Settings', { icon: 'settings' }), R([T('ai.setModel', 'Model and Effort', { icon: 'model' })], [T('ai.sources', 'Sources', { icon: 'sources' })])),
    ] },
    { id: 'help', label: 'Help', groups: [
      { ...G('help', 'Help', L('edit.commandPalette', 'Find a Command', { icon: 'search' }), L('help.shortcuts', 'Keyboard Shortcuts', { icon: 'keyboard' })), icon: 'info' },
      { ...G('support', 'Support', L('help.feedback', 'Feedback', { icon: 'comment' }), L('help.about', 'About')), icon: 'info' },
      { ...G('news', 'What\'s New', L('help.whatsNew', 'What\'s New'), L('app.preferences', 'Preferences', { icon: 'settings' })), icon: 'info' },
    ] },
    { id: 'table-design', label: 'Table Design', ctx: 'table', groups: [
      G('tbl-options', 'Table Style Options', R([S('b.t.headerRow')], [S('b.t.totalRow')], [S('b.t.bandRows')]), R([S('b.t.firstCol')], [S('b.t.lastCol')], [S('b.t.bandCols')])),
      G('tbl-styles', 'Table Styles', S('b.t.styles'), S('b.t.shading')),
      G('tbl-borders', 'Borders', S('b.t.borderStyles'), R([S('b.t.lineStyle')], [S('b.t.lineWeight')], [S('b.t.penColor')]), S('b.t.borders'), S('b.t.painter')),
    ] },
    { id: 'table-layout', label: 'Table Layout', ctx: 'table', groups: [
      G('tbl-table', 'Table', S('b.t.select'), R([T('table.viewGridlines', 'View Gridlines')], [T('table.properties', 'Properties')], [M('table-align', 'tableAlign', 'Alignment', TABLE_ALIGN_MENU, { text: true })])),
      G('tbl-rowscols', 'Rows & Columns', S('b.t.delete'),
        R([T('table.rowAbove', 'Insert Above')], [T('table.rowBelow', 'Insert Below')]), R([T('table.colLeft', 'Insert Left')], [T('table.colRight', 'Insert Right')])),
      G('tbl-merge', 'Merge', R([T('table.merge', 'Merge Cells')], [T('table.split', 'Split Cells')], [T('table.splitTable', 'Split Table', { icon: 'split' })])),
      G('tbl-size', 'Cell Size', S('b.t.autofit'), R([S('b.t.height')], [S('b.t.width')], [T('table.rowSplit', 'Rows Break Across Pages')]), R([T('table.distributeRows', 'Distribute Rows', { icon: 'distributeRows' })], [T('table.distribute', 'Distribute Columns')])),
      G('tbl-align', 'Alignment', S('b.t.align'), R([M('table-direction', 'textDirection', 'Text Direction', CELL_DIRECTION_MENU, { text: true })], [T('table.cellMargins', 'Cell Margins')])),
      G('tbl-data', 'Data', S('b.t.sort'), R([S('b.t.repeat')], [T('table.toText', 'Convert to Text')], [T('insert.formula', 'Formula', { icon: 'sigma' })])),
    ] },
    { id: 'picture-format', label: 'Picture Format', ctx: 'picture', groups: [
      GL('pic-adjust', 'Adjust', 'picture.properties',
        S('b.p.corrections'), S('b.p.color'), S('b.p.artistic'), S('b.p.transparency'),
        R([S('b.p.change')], [T('picture.reset', 'Reset Picture', { icon: 'refresh' })])),
      G('pic-styles', 'Picture Styles', S('b.p.styles'), R([S('b.p.border')], [S('b.p.effects')])),
      G('pic-access', 'Accessibility', L('picture.alt', 'Alt Text')),
      G('pic-arrange', 'Arrange', S('b.p.position'), S('b.p.wrap'), R([S('b.p.forward')], [S('b.p.backward')], [S('b.p.rotate')]), R([T('object.download', 'Save as Picture', { icon: 'download' })])),
      G('pic-size', 'Size', S('b.p.crop'), R([S('b.p.height')], [S('b.p.width')])),
    ] },
    { id: 'shape-format', label: 'Shape Format', ctx: 'shape', groups: [
      GL('shp-insert', 'Insert Shapes', 'shape.properties', S('b.s.shapes'), S('b.s.edit'), S('b.s.textbox')),
      G('shp-styles', 'Shape Styles', S('b.s.styles'), R([S('b.s.fill')], [S('b.s.outline')], [S('b.s.effects')])),
      G('shp-wordart', 'WordArt Styles', S('b.s.wordart'), R([S('b.s.textFill')], [S('b.s.textEffects')], [S('b.s.alignText')])),
      G('shp-links', 'Text', R([S('b.s.link')], [S('b.s.unlink')], [S('b.s.connect')]), R([S('b.s.arrows')], [T('shape.text', 'Edit Text', { icon: 'textBox' })])),
      G('shp-arrange', 'Arrange', S('b.s.position'), S('b.s.wrap'), S('b.s.rotate')),
      G('shp-size', 'Size', R([S('b.s.height')], [S('b.s.width')])),
    ] },
    { id: 'chart-design', label: 'Chart Design', ctx: 'chart', groups: [
      G('cht-layout', 'Chart Layouts', S('b.c.elements'), S('b.c.layout')),
      G('cht-styles', 'Chart Styles', S('b.c.styles')),
      G('cht-data', 'Data', S('b.c.switch'), S('b.c.editData'),
        R([S('b.c.link')], [S('b.c.refresh')], [S('b.c.unlink')])),
      G('cht-type', 'Type', S('b.c.type'), R([S('b.c.title')], [S('b.c.labels')])),
    ] },
    { id: 'chart-format', label: 'Chart Format', ctx: 'chart', groups: [
      G('cht-size', 'Size', R([S('b.c.height')], [S('b.c.width')])),
      G('cht-arrange', 'Arrange', S('b.c.wrap')),
      G('cht-export', 'Export', S('b.c.export')),
    ] },
    { id: 'smartart-design', label: 'SmartArt Design', ctx: 'diagram', groups: [
      G('dgm-create', 'Create Graphic', S('b.d.text'), S('b.d.reset')),
      G('dgm-layouts', 'Layouts', S('b.d.layout')),
      G('dgm-styles', 'SmartArt Styles', S('b.d.colors'), S('b.d.styles')),
      G('dgm-arrange', 'Arrange', S('b.d.wrap'), R([S('b.d.height')], [S('b.d.width')])),
    ] },
    { id: 'header-footer', label: 'Header & Footer', ctx: 'headerFooter', groups: [
      G('hf-hf', 'Header & Footer', S('b.h.header'), S('b.h.footer'), S('b.h.pageNumber')),
      G('hf-insert', 'Insert', S('b.h.dateTime'), S('b.h.docInfo'), S('b.h.quickParts'), S('b.h.pictures')),
      G('hf-nav', 'Navigation', R([S('b.h.gotoHeader')], [S('b.h.gotoFooter')]), R([S('b.h.prev')], [S('b.h.next')])),
      G('hf-options', 'Options', R([S('b.h.first')], [S('b.h.evenOdd')])),
      G('hf-position', 'Position', R([S('b.h.headerTop')], [S('b.h.footerBottom')])),
      G('hf-close', 'Close', S('b.h.close')),
    ] },
    equationTab(),
    { id: 'mermaid', label: 'Mermaid', ctx: 'mermaid', groups: [
      G('mmd-edit', 'Edit', L('mermaid.edit', 'Edit Diagram', { icon: 'mermaid' }), L('mermaid.code', 'Set Code', { icon: 'code' })),
      G('mmd-arrange', 'Arrange', M('mmd-wrap', 'wrapText', 'Wrap Text', OBJECT_WRAP_MENU), L('object.size', 'Size', { icon: 'objectSize' }), L('object.download', 'Save Object', { icon: 'download' })),
    ] },
    { id: 'chip', label: 'Smart Chip', ctx: 'chip', groups: [
      G('chip-edit', 'Edit', L('chip.edit', 'Edit Chip', { icon: 'chip' }), L('chip.set', 'Set Value', { icon: 'chipValue' }), L('references.chipToLink', 'Chip to Link', { icon: 'link' })),
    ] },
  ];
}

function P2(id: string, label: string): Item {
  return { k: 'cmd', id, label, params: {}, icon: 'fieldInfo' };
}
