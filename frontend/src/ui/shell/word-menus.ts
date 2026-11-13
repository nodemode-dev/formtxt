import type { MenuDef, MenuItem, ParamItem, SubMenu } from './types';

const P = (cmd: string, label: string, params: Record<string, unknown> = {}): ParamItem => ({ cmd, label, params });
const SM = (label: string, items: MenuItem[]): SubMenu => ({ label, items });

const DOWNLOADS: MenuItem[] = [
  P('exchange.download', 'Word Document (.docx)', { format: 'docx' }), P('exchange.download', 'Word Template (.dotx)', { format: 'dotx' }),
  P('exchange.download', 'OpenDocument Text (.odt)', { format: 'odt' }), P('exchange.download', 'Rich Text Format (.rtf)', { format: 'rtf' }),
  P('exchange.download', 'Plain Text (.txt)', { format: 'txt' }), P('exchange.download', 'Web Page (.html)', { format: 'html' }),
  P('exchange.download', 'Markdown (.md)', { format: 'md' }), P('exchange.download', 'EPUB (.epub)', { format: 'epub' }),
];

const SHARE: MenuItem[] = [
  'collab.share',
  P('collab.link.create', 'Copy Link: Anyone Can View', { mode: 'view' }), P('collab.link.create', 'Copy Link: Anyone Can Comment', { mode: 'comment' }), P('collab.link.create', 'Copy Link: Anyone Can Edit', { mode: 'edit' }),
  'collab.emailLink', 'collab.sendCopy', 'collab.emailCollaborators', 'collab.who', '-',
  'collab.publish.open', 'collab.unpublish', P('collab.publish.save', 'Save Page to a Folder', {}), '-',
  P('collab.network', 'Allow Links on My Network', { enabled: true }), P('collab.network', 'Stop Allowing Network Links', { enabled: false }),
];

const UNDERLINES: MenuItem[] = [
  P('format.underlineStyle', 'Single', { style: 'single' }), P('format.underlineStyle', 'Double', { style: 'double' }), P('format.underlineStyle', 'Dotted', { style: 'dotted' }),
  P('format.underlineStyle', 'Dashed', { style: 'dash' }), P('format.underlineStyle', 'Wavy', { style: 'wavy' }), P('format.underlineStyle', 'None', { style: '' }),
];

const CASES: MenuItem[] = ['format.case.sentence', 'format.case.lower', 'format.case.upper', 'format.case.title', 'format.case.toggle'];

const STYLES_APPLY: MenuItem[] = [
  P('paragraph.style', 'Normal', { style: 'Normal' }), P('paragraph.style', 'Title', { style: 'Title' }), P('paragraph.style', 'Subtitle', { style: 'Subtitle' }),
  P('paragraph.style', 'Heading 1', { style: 'Heading1' }), P('paragraph.style', 'Heading 2', { style: 'Heading2' }), P('paragraph.style', 'Heading 3', { style: 'Heading3' }),
  P('paragraph.style', 'Heading 4', { style: 'Heading4' }), P('paragraph.style', 'Quote', { style: 'Quote' }),
  '-', 'format.styles', 'format.clear',
];

const STYLE_SETS: MenuItem[] = [
  P('format.styleSet', 'Standard', { set: 'standard' }), P('format.styleSet', 'Classic Serif', { set: 'classic' }), P('format.styleSet', 'Editorial', { set: 'editorial' }),
  P('format.styleSet', 'Report', { set: 'report' }), P('format.styleSet', 'Academic', { set: 'academic' }), P('format.styleSet', 'Modern', { set: 'modern' }),
  P('format.styleSet', 'Warm', { set: 'warm' }), P('format.styleSet', 'Technical', { set: 'technical' }), P('format.styleSet', 'Elegant', { set: 'elegant' }),
];

const COLUMNS: MenuItem[] = [
  P('layout.columns', 'One', { count: 1 }), P('layout.columns', 'Two', { count: 2 }), P('layout.columns', 'Three', { count: 3 }), P('layout.columns', 'Four', { count: 4 }),
  '-', P('layout.columns', 'More Columns...', {}),
];

const DROP_CAP: MenuItem[] = [
  P('paragraph.dropCap', 'None', { mode: 'none' }), P('paragraph.dropCap', 'Dropped', { mode: 'dropped', lines: 3 }), P('paragraph.dropCap', 'In Margin', { mode: 'margin', lines: 3 }),
  '-', P('paragraph.dropCap', 'Drop Cap Options...', {}),
];

const BULLETS: MenuItem[] = ['list.bullet', 'list.number', 'list.check', 'list.multilevel', '-', 'list.format'];

const BREAKS: MenuItem[] = [
  'insert.pageBreak', 'insert.columnBreak', '-',
  P('insert.sectionBreak', 'Section Break (Next Page)', { start: 'nextPage' }), P('insert.sectionBreak', 'Section Break (Continuous)', { start: 'continuous' }),
  P('insert.sectionBreak', 'Section Break (Even Page)', { start: 'evenPage' }), P('insert.sectionBreak', 'Section Break (Odd Page)', { start: 'oddPage' }),
];

const SHAPES: MenuItem[] = [
  P('insert.shape', 'Rectangle', { kind: 'rect' }), P('insert.shape', 'Rounded Rectangle', { kind: 'roundRect' }), P('insert.shape', 'Oval', { kind: 'ellipse' }),
  P('insert.shape', 'Triangle', { kind: 'triangle' }), P('insert.shape', 'Diamond', { kind: 'diamond' }), P('insert.shape', 'Hexagon', { kind: 'hexagon' }),
  P('insert.shape', 'Right Arrow', { kind: 'arrowRight' }), P('insert.shape', 'Star', { kind: 'star' }), P('insert.shape', 'Callout', { kind: 'callout' }),
  P('insert.shape', 'Line', { kind: 'line' }), '-', 'insert.shape',
];

const CHARTS: MenuItem[] = [
  P('insert.chart', 'Column', { kind: 'bar' }), P('insert.chart', 'Bar', { kind: 'hbar' }), P('insert.chart', 'Line', { kind: 'line' }), P('insert.chart', 'Area', { kind: 'area' }),
  P('insert.chart', 'Doughnut', { kind: 'donut' }), P('insert.chart', 'Gauge', { kind: 'gauge' }), P('insert.chart', 'Histogram', { kind: 'histogram' }),
  P('insert.chart', 'Heat Map', { kind: 'heatmap' }), '-', 'insert.chart',
];

const SMARTART: MenuItem[] = [
  P('insert.diagram', 'Basic Block List', { layout: 'list-block' }), P('insert.diagram', 'Basic Process', { layout: 'process-basic' }), P('insert.diagram', 'Basic Cycle', { layout: 'cycle-basic' }),
  P('insert.diagram', 'Organization Chart', { layout: 'hier-org' }), P('insert.diagram', 'Basic Venn', { layout: 'rel-venn' }), P('insert.diagram', 'Basic Pyramid', { layout: 'pyramid-basic' }),
  P('insert.diagram', 'Basic Timeline', { layout: 'timeline-basic' }), '-', 'insert.diagram',
];

const WORDART: MenuItem[] = [
  P('insert.wordArt', 'Fill', { style: 'fill' }), P('insert.wordArt', 'Outline', { style: 'outline' }), P('insert.wordArt', 'Shadow', { style: 'shadow' }),
  P('insert.wordArt', 'Gradient', { style: 'gradient' }), P('insert.wordArt', 'Glow', { style: 'glow' }), P('insert.wordArt', 'Retro', { style: 'retro' }),
];

const CHIPS: MenuItem[] = [
  P('insert.chip', 'Date', { kind: 'date' }), P('insert.chip', 'Person', { kind: 'person' }), P('insert.chip', 'Dropdown', { kind: 'dropdown' }),
  P('insert.chip', 'Document', { kind: 'doc' }), P('insert.chip', 'Placeholder', { kind: 'placeholder' }),
];

const CONTROLS: MenuItem[] = [
  P('control.insert', 'Plain Text', { kind: 'text' }), P('control.insert', 'Rich Text', { kind: 'richtext' }), P('control.insert', 'Check Box', { kind: 'checkbox' }),
  P('control.insert', 'Date Picker', { kind: 'date' }), P('control.insert', 'Drop-Down List', { kind: 'dropdown' }), '-', 'control.dialog',
];

const PAGE_NUMBERS: MenuItem[] = [
  P('insert.pageNumber', 'Top, Left', { position: 'header', align: 'left' }), P('insert.pageNumber', 'Top, Centre', { position: 'header', align: 'center' }), P('insert.pageNumber', 'Top, Right', { position: 'header', align: 'right' }),
  P('insert.pageNumber', 'Bottom, Left', { position: 'footer', align: 'left' }), P('insert.pageNumber', 'Bottom, Centre', { position: 'footer', align: 'center' }), P('insert.pageNumber', 'Bottom, Right', { position: 'footer', align: 'right' }),
  '-', 'insert.pageNumbers', P('layout.restartNumbering', 'Restart at 1', { start: 1 }),
];

const INSERT_COMPONENTS: MenuItem[] = ['collab.component.insert', 'collab.component.create', 'collab.component.manage', 'collab.component.unlink'];

const ZOOM_PERCENT: MenuItem[] = [50, 75, 100, 125, 150, 200].map((n) => P('view.zoom', `${n}%`, { percent: n }));

const MULTI: MenuItem[] = [
  P('view.multiPage', '2 Pages', { pages: 2, on: true }), P('view.multiPage', '3 Pages', { pages: 3, on: true }), P('view.multiPage', '4 Pages', { pages: 4, on: true }),
  P('view.multiPage', 'Back to One Page', { on: false }),
];

const PAGE_SETUP: MenuItem[] = [
  'layout.pageSetup',
  SM('Orientation', [P('layout.setPage', 'Portrait', { orientation: 'portrait' }), P('layout.setPage', 'Landscape', { orientation: 'landscape' })]),
  SM('Paper Size', [P('layout.setPage', 'Letter', { size: 'letter' }), P('layout.setPage', 'Legal', { size: 'legal' }), P('layout.setPage', 'A4', { size: 'a4' }), P('layout.setPage', 'A5', { size: 'a5' }), P('layout.setPage', 'Executive', { size: 'executive' }), P('layout.setPage', 'Tabloid', { size: 'tabloid' })]),
  SM('Margins', [
    P('layout.setPage', 'Normal', { top: 1, bottom: 1, left: 1, right: 1 }), P('layout.setPage', 'Narrow', { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }),
    P('layout.setPage', 'Moderate', { top: 1, bottom: 1, left: 0.75, right: 0.75 }), P('layout.setPage', 'Wide', { top: 1, bottom: 1, left: 2, right: 2 }),
  ]),
  SM('Line Numbers', [P('layout.lineNumbers', 'None', { mode: '' }), P('layout.lineNumbers', 'Continuous', { mode: 'continuous' }), P('layout.lineNumbers', 'Restart Each Page', { mode: 'page' })]),
  SM('Hyphenation', [P('proofing.hyphenation', 'Automatic', { on: true }), P('proofing.hyphenation', 'None', { on: false }), 'proofing.noHyphenate', 'proofing.softHyphen']),
];

const LANGUAGE: MenuItem[] = [
  P('proofing.setLanguage', 'English (US)', { code: 'en-US', scope: 'selection' }), P('proofing.setLanguage', 'English (UK)', { code: 'en-GB', scope: 'selection' }),
  P('proofing.setLanguage', 'English (Australia)', { code: 'en-AU', scope: 'selection' }), P('proofing.setLanguage', 'English (Canada)', { code: 'en-CA', scope: 'selection' }),
  '-', 'proofing.doNotCheck', 'proofing.language',
];

const TRACK: MenuItem[] = [
  'review.toggleTracking',
  SM('Mode', [P('review.setMode', 'Editing', { mode: 'editing' }), P('review.setMode', 'Suggesting', { mode: 'suggesting' }), P('review.setMode', 'Viewing', { mode: 'viewing' })]),
  '-', 'review.previousChange', 'review.nextChange', 'review.acceptChange', 'review.rejectChange', 'review.acceptAll', 'review.rejectAll', 'review.showEditors',
];

const COMMENTS: MenuItem[] = ['review.newComment', 'review.deleteComment', 'review.resolveComment', 'review.panel'];

const MERGE_DOCS: MenuItem[] = ['review.compareDocuments', 'review.combineDocuments', 'review.suggestFromDocument'];

const PROTECT: MenuItem[] = ['protect.dialog', 'password.set', 'password.remove', 'approval.dialog'];

const MACROS: MenuItem[] = ['collab.macros', 'collab.macro.record', 'collab.macro.stop', 'collab.macro.run', 'collab.script.run'];

const AI_TOOLS: MenuItem[] = [
  'ai.togglePanel', 'ai.promptBox', 'ai.createDraft', 'ai.summarize', 'ai.editDocument', 'ai.translate', '-',
  P('ai.rewrite', 'Rewrite Selection...', {}), 'ai.shorter', 'ai.longer', 'ai.moreFormal', 'ai.moreCasual', 'ai.simplify', '-',
  'ai.listen', 'ai.audioOverview', 'ai.image', 'ai.search', '-', 'ai.settings',
];

const TABLE_INSERT: MenuItem[] = [
  P('insert.table', '2 x 2', { rows: 2, cols: 2 }), P('insert.table', '3 x 3', { rows: 3, cols: 3 }), P('insert.table', '4 x 4', { rows: 4, cols: 4 }), P('insert.table', '5 x 5', { rows: 5, cols: 5 }),
  P('insert.table', 'Insert Table...', {}), '-', 'table.rowAbove', 'table.rowBelow', 'table.colLeft', 'table.colRight',
];

const TABLE_BORDERS: MenuItem[] = [
  P('table.borders', 'All Borders', { target: 'all' }), P('table.borders', 'Outside Borders', { target: 'outside' }), P('table.borders', 'Inside Borders', { target: 'inside' }),
  P('table.borders', 'No Border', { target: 'none' }), '-', P('table.borders', 'Borders and Shading...', {}),
];

const TABLE_ALIGN: MenuItem[] = [
  P('table.valign', 'Top', { value: 'top' }), P('table.valign', 'Middle', { value: 'middle' }), P('table.valign', 'Bottom', { value: 'bottom' }),
  '-', P('table.align', 'Table Left', { align: 'left' }), P('table.align', 'Table Centre', { align: 'center' }),
];

const TABLE_LOOK: MenuItem[] = [
  P('table.look', 'Grid', { look: 'grid' }), P('table.look', 'Plain', { look: 'plain' }), P('table.look', 'Rows', { look: 'rows' }), P('table.look', 'Banded', { look: 'banded' }), P('table.look', 'Accent', { look: 'accent' }),
  '-', 'table.applyStyle', 'table.saveStyle', 'table.deleteStyle',
];

export function wordMenus(recent: () => Array<{ id: string; title: string }>): MenuDef[] {
  return [
    { label: 'File', items: () => {
      const rec = recent();
      const recentItems: MenuItem[] = rec.length ? rec.map((r) => P('file.open', r.title || 'Untitled', { id: r.id })) : ['home.open'];
      return [
        'file.new', 'file.newFromTemplate', '-',
        'exchange.open', 'print.openPdf', SM('Open Recent', recentItems), 'cloud.open', 'file.recover', '-',
        'home.open', '-',
        SM('Download As', DOWNLOADS), 'print.exportPdf', 'exchange.convertCompat', '-',
        SM('Share', SHARE), '-',
        'print.open', 'print.run', '-',
        'versions.panel', P('versions.name', 'Name This Version...', {}), 'activity.show', '-',
        'file.properties', 'password.set', 'password.remove', 'signature.request', '-',
        'cloud.set', 'file.trash', '-', 'file.close',
      ];
    } },
    { label: 'Edit', items: [
      'edit.undo', 'edit.redo', '-',
      'edit.find', P('edit.find', 'Replace...', {}), '-',
      'proofing.checkDocument', '-',
      'app.preferences',
    ] },
    { label: 'View', items: [
      'view.print', 'view.pageless', 'view.outline', 'view.draft', 'view.read', 'view.focus', 'view.split', '-',
      'view.ruler', 'view.gridlines', 'view.collapseHeading', '-',
      'view.zoomIn', 'view.zoomOut', SM('Zoom', ZOOM_PERCENT), 'view.onePage', SM('Multiple Pages', MULTI), '-',
      'view.draw', 'view.toggleTheme', 'view.darkPage', '-',
      'review.panel', 'versions.panel', 'access.panel', 'speech.panel', 'ai.togglePanel', '-',
      'view.terminal', 'view.newTerminal', 'agent.claudeCode', 'agent.chat',
    ] },
    { label: 'Insert', items: [
      SM('Break', BREAKS), SM('Page Number', PAGE_NUMBERS), 'insert.headerFooter', 'insert.coverPage', '-',
      'insert.picture', 'insert.stockImage', 'insert.icon', 'insert.screenshot', SM('Shape', SHAPES), SM('IntelligentArt', SMARTART), SM('Chart', CHARTS), 'insert.mermaid', '-',
      'insert.textBox', SM('Text Art', WORDART), 'insert.codeBlock', 'signature.dialog', 'insert.embeddedFile', 'insert.video', 'insert.audio', 'insert.onlineVideo', '-',
      'insert.symbol', 'insert.emoji', 'insert.equation', 'insert.tab', '-',
      'insert.link', 'references.manageBookmarks', 'references.insertCrossReference', 'references.linkToHeading', 'review.newComment', '-',
      SM('Smart Chips', CHIPS), SM('Content Controls', CONTROLS), P('field.insert', 'Field...', {}), 'insert.variable', 'insert.placeholder', P('insert.block', 'Building Block...', {}), 'blocks.save', SM('Components', INSERT_COMPONENTS), '-',
      'tabs.add', 'tabs.rename', 'tabs.delete',
    ] },
    { label: 'Format', items: [
      'font.advanced', 'format.paragraph', '-',
      SM('Styles', STYLES_APPLY), SM('Style Set', STYLE_SETS), '-',
      SM('Bullets and Numbering', BULLETS), 'paragraph.set', P('table.borders', 'Borders and Shading...', {}), '-',
      SM('Underline Style', UNDERLINES), SM('Change Case', CASES), 'format.smallCaps', 'format.allCaps', 'format.characterSpacing', 'format.painter', '-',
      SM('Columns', COLUMNS), SM('Drop Cap', DROP_CAP), '-',
      SM('Text Direction', ['format.directionLtr', 'format.directionRtl']), 'document.headingNumbers', '-',
      SM('Fonts', ['font.add', 'font.manage', 'font.refresh', 'document.embedFonts']), SM('Page Setup', PAGE_SETUP),
    ] },
    { label: 'Tools', items: [
      'proofing.checkDocument', 'proofing.editorPanel', 'tools.thesaurus', 'tools.wordCount', 'tools.stats', 'tools.pageCount', 'proofing.readability', '-',
      'proofing.options', 'proofing.autocorrectOptions', 'proofing.dictionaryDialog', SM('Language', LANGUAGE), '-',
      SM('Track Changes', TRACK), SM('Comments', COMMENTS), SM('Merge Documents', MERGE_DOCS), SM('Protect Document', PROTECT), '-',
      'speech.readAloud', 'dictation.toggle', 'transcribe.panel', 'access.check', '-',
      'references.insertToc', 'references.insertFootnote', 'references.insertEndnote', 'references.insertCitation', 'references.manageSources', 'references.insertBibliography', 'references.insertCaption', 'references.markIndexEntry', 'references.insertIndex', 'references.updateAll', '-',
      'merge.panel', 'envelope.dialog', 'labels.dialog', '-',
      SM('Macros', MACROS), 'collab.addins', 'collab.voice.toggle', '-',
      SM('AI', AI_TOOLS), '-',
      'edit.commandPalette', 'help.shortcuts',
    ] },
    { label: 'Table', items: [
      SM('Insert', TABLE_INSERT),
      SM('Delete', ['table.deleteRow', 'table.deleteColumn', 'table.delete']), '-',
      'table.merge', 'table.split', 'table.distribute', '-',
      'table.fromText', 'table.toText', P('table.sort', 'Sort by Column 1', { column: 1, descending: false }), 'insert.formula', '-',
      'table.headerRow', 'table.headerColumn', 'table.repeatHeader', 'table.rowSplit', '-',
      SM('Borders', TABLE_BORDERS), SM('Alignment', TABLE_ALIGN), SM('Table Look', TABLE_LOOK), 'table.shading', '-',
      'table.properties',
    ] },
    { label: 'Window', items: [
      'view.split', SM('Zoom', ZOOM_PERCENT), 'view.onePage', SM('Multiple Pages', MULTI), '-',
      'tabs.add', '-', 'home.open',
    ] },
    { label: 'Help', items: ['edit.commandPalette', 'help.shortcuts', '-', 'help.whatsNew', 'help.feedback', 'help.about', '-', 'app.preferences'] },
  ];
}
