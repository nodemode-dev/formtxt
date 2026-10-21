import type { CommandRegistry } from '../engine/registry';
import type { Section } from '../engine/model';
import { type Command, NodeSelection, TextSelection } from 'prosemirror-state';
import { WRAPS, insertPicture, pictureViews, selectedPicture, setPicture } from './picture';
import { CHART_FNS, SAMPLE, insertChart, parseGrid, selectedChart, setChart } from './chart/chart';
import { exportChart } from './chart/chartdraw';
import { CHART_KINDS } from './chart/types';
import { CellSelection, addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, mergeCells, setCellAttr, splitCell, toggleHeaderColumn, toggleHeaderRow } from 'prosemirror-tables';
import { el, setHidden, setText } from '../ui/dom';
import { toast } from '../ui/toast';
import { buildingBlocksDialog, placeholderFillDialog, saveBlockDialog, variablesDialog } from './dialogs';
import { allBlocks, deleteBlock, insertBlock, saveBlock } from './blocks';
import { cellBordersDialog, chipDialog, listFormatDialog, styleSetDialog, chartDialog, diagramDialog, equationDialog, formulaDialog, shapeGalleryDialog, shapePropertiesDialog, symbolDialog } from './dialogs';
import { formulaSites, insertVariable, selectedField, updateFields } from './fields';
import { SHAPES, SHAPE_WRAPS, WORDART, insertShape, newShapeId, selectedShape, setShape, shapeDefaults } from './shape';
import { putMath, selectedMath } from './math';
import { findIcon, iconAttrs, iconsDialog } from './icons-dialog';
import { DIAGRAM_COLORS, DIAGRAM_LAYOUTS, DIAGRAM_STYLES, type DiagramItem, insertDiagram, itemsToText, sampleItems, selectedDiagram, setDiagram, textToItems } from './diagram';
import { headerFooterDialog, insertTableDialog, pageGeometry, pageSetupDialog, paragraphDialog, parseTabs, picturePropertiesDialog, stylesDialog, tablePropertiesDialog, wordCountDialog } from './dialogs';
import { type DocEditor, FONTS } from './editor';
import { CHIP_KINDS, type ChipAttrs, type ChipOption, DATE_FORMATS, NUMBER_FORMATS, TABLE_LOOKS, chipLabel, cleanChip, isoDate, parseIsoDate, schema } from './schema';
import { CHIP_COLORS, DROPDOWN_PRESETS, chipKey, chipNode, fillPlaceholders, knownDocs, loadAuthor, loadDocs, placeholderNames, selectedChip, setChipHost } from './chips';
import type { Node as PMNode } from 'prosemirror-model';
import { setListFormat } from './commands';
import { STYLE_SETS } from './stylesets';
import { BORDER_TARGETS, distributeColumns, insertTable, setCellBorders, setCellShading, setTableAttr, sortTable, tableInfo, tableToText, textToTable } from './table';

const schemaTab = () => schema.nodes.tab.create();

export function registerEditorCommands(reg: CommandRegistry, ed: DocEditor): void {
  const add = (id: string, label: string, group: string, description: string, run: (p: Record<string, unknown>) => unknown, params: Array<{ name: string; type: 'string' | 'number' | 'boolean'; description: string }> = [], keys: string[] = []): void =>
    reg.register({ id, label, group, description, run, params, keys });

  add('edit.undo', 'Undo', 'Edit', 'Undo the last change.', () => ed.undo(), [], ['Ctrl+Z']);
  add('edit.redo', 'Redo', 'Edit', 'Redo the last undone change.', () => ed.redo(), [], ['Ctrl+Y', 'Ctrl+Shift+Z']);
  add('edit.find', 'Find and replace', 'Edit', 'Open the find and replace panel.', () => { ed.openFind(); return true; }, [], ['Ctrl+F', 'Ctrl+H']);
  add('edit.replaceAll', 'Replace all', 'Edit', 'Replace every match of a text or regular expression and return how many were replaced.', (p) =>
    ed.replace(true, String(p.find ?? ''), String(p.replace ?? ''), { regex: !!p.regex, caseSensitive: !!p.caseSensitive }), [
    { name: 'find', type: 'string', description: 'Text or pattern to find' },
    { name: 'replace', type: 'string', description: 'Replacement; $1 and friends work with regex' },
    { name: 'regex', type: 'boolean', description: 'Treat find as a regular expression' },
    { name: 'caseSensitive', type: 'boolean', description: 'Match case' },
  ]);

  for (const [n, label, keys] of [['bold', 'Bold', 'Ctrl+B'], ['italic', 'Italic', 'Ctrl+I'], ['underline', 'Underline', 'Ctrl+U'], ['strike', 'Strikethrough', 'Ctrl+Shift+X'], ['superscript', 'Superscript', 'Ctrl+.'], ['subscript', 'Subscript', 'Ctrl+,'], ['smallCaps', 'Small caps', ''], ['allCaps', 'All caps', '']] as const) {
    add(`format.${n}`, label, 'Format', `Toggle ${label.toLowerCase()} on the selection.`, () => ed.toggle(n), [], keys ? [keys] : []);
  }
  add('format.font', 'Font', 'Format', `Set the font of the selection. Bundled: ${FONTS.join(', ')}.`, (p) => ed.setMark('font', p.family ? { family: String(p.family) } : null), [{ name: 'family', type: 'string', description: 'Font family name; empty removes the override' }]);
  add('format.size', 'Font size', 'Format', 'Set the font size of the selection in points.', (p) => ed.setMark('size', Number(p.pt) > 0 ? { pt: Number(p.pt) } : null), [{ name: 'pt', type: 'number', description: 'Size in points' }]);
  add('format.color', 'Text colour', 'Format', 'Set the text colour of the selection.', (p) => ed.setMark('color', p.value ? { value: String(p.value) } : null), [{ name: 'value', type: 'string', description: '#rrggbb; empty removes it' }]);
  add('format.highlight', 'Highlight', 'Format', 'Highlight the selection.', (p) => ed.setMark('highlight', p.value ? { value: String(p.value) } : null), [{ name: 'value', type: 'string', description: '#rrggbb; empty removes it' }]);
  add('format.clear', 'Clear formatting', 'Format', 'Remove character formatting and reset paragraphs to Normal.', () => ed.clear(), [], ['Ctrl+\\']);

  add('paragraph.style', 'Paragraph style', 'Paragraph', 'Apply a paragraph style such as Normal, Title or Heading1.', (p) => ed.style(String(p.style ?? 'Normal')), [{ name: 'style', type: 'string', description: 'Style id' }], ['Ctrl+Alt+0..6']);
  for (const a of ['left', 'center', 'right', 'justify']) add(`paragraph.align.${a}`, `Align ${a}`, 'Paragraph', `Align the selected paragraphs ${a}.`, () => ed.align(a));
  add('paragraph.indent', 'Increase indent', 'Paragraph', 'Indent the paragraph, or move a list item one level deeper.', () => ed.indent(1), [], ['Tab in a list']);
  add('paragraph.outdent', 'Decrease indent', 'Paragraph', 'Outdent the paragraph, or move a list item one level up.', () => ed.indent(-1), [], ['Shift+Tab']);
  add('paragraph.lineSpacing', 'Line spacing', 'Paragraph', 'Set line spacing as a multiple; 0 returns to the style.', (p) => ed.spacing(Number(p.value) > 0 ? Number(p.value) : null), [{ name: 'value', type: 'number', description: 'Multiple such as 1, 1.15, 1.5 or 2' }]);
  add('list.bullet', 'Bulleted list', 'Paragraph', 'Turn the selected paragraphs into a bulleted list, or back.', () => ed.list('bullet'), [], ['Ctrl+Shift+8']);
  add('list.number', 'Numbered list', 'Paragraph', 'Turn the selected paragraphs into a numbered list, or back.', () => ed.list('number'), [], ['Ctrl+Shift+7']);
  add('list.format', 'List format', 'Paragraph', `Number style, text before and after, restart value or bullet character of the selected list paragraphs; with no options, opens the dialog. Number styles: ${NUMBER_FORMATS.join(', ')}.`, (p) => {
    if ([p.format, p.prefix, p.suffix, p.start, p.bullet, p.reset].every((v) => v === undefined)) { listFormatDialog(ed); return true; }
    if (p.format !== undefined && !(NUMBER_FORMATS as readonly string[]).includes(String(p.format))) throw new Error(`format must be one of ${NUMBER_FORMATS.join(', ')}.`);
    const fmt = p.reset ? {} : { format: p.format === undefined ? undefined : String(p.format), prefix: p.prefix === undefined ? undefined : String(p.prefix), suffix: p.suffix === undefined ? undefined : String(p.suffix), bullet: p.bullet === undefined ? undefined : String(p.bullet) };
    const start = p.start === undefined || p.start === '' ? undefined : Math.max(0, Math.round(Number(p.start) || 0));
    if (!ed.run(setListFormat(fmt, start))) throw new Error('Select paragraphs in a bulleted or numbered list first.');
    return true;
  }, [{ name: 'format', type: 'string', description: NUMBER_FORMATS.join(', ') }, { name: 'prefix', type: 'string', description: 'Text before the number' }, { name: 'suffix', type: 'string', description: 'Text after the number (default .)' }, { name: 'start', type: 'number', description: 'Restart the first selected item at this number' }, { name: 'bullet', type: 'string', description: 'One bullet character' }, { name: 'reset', type: 'boolean', description: 'Back to the default look' }]);
  add('list.check', 'Checklist', 'Paragraph', 'Turn the selected paragraphs into a checklist, or back.', () => ed.list('check'), [], ['Ctrl+Shift+9']);

  add('insert.link', 'Link', 'Insert', 'Link the selection to an address; with no address, asks for one.', (p) => (p.href !== undefined ? ed.link(String(p.href) || null) : (ed.promptLink(), true)), [{ name: 'href', type: 'string', description: 'Address; empty removes the link' }], ['Ctrl+K']);
  add('insert.codeBlock', 'Code block', 'Insert', 'Turn the paragraph into a code block, or back.', () => ed.codeBlock());
  add('insert.pageBreak', 'Page break', 'Insert', 'Insert a page break.', () => ed.pageBreak(), [], ['Ctrl+Enter']);
  add('view.outline', 'Outline', 'View', 'Show or hide the outline of headings.', () => ed.toggleOutline());
  add('view.collapseHeading', 'Collapse or expand heading', 'View', 'Fold or unfold the content under the heading at the cursor (or click left of a heading).', () => ed.collapse());

  add('format.painter', 'Format Painter', 'Format', 'Copy the formatting at the cursor; the next selection receives it.', () => ed.togglePainter(), [], ['Ctrl+Shift+C']);
  add('format.paragraph', 'Paragraph settings', 'Format', 'Indents, spacing, line spacing, borders, shading, tab stops and pagination options for the selected paragraphs.', () => { paragraphDialog(ed); return true; });
  add('format.styleSet', 'Style set', 'Format', `Change the fonts, colours and spacing of the document's styles at once; with no set, opens the gallery. Sets: ${STYLE_SETS.map((s) => s.id).join(', ')}.`, async (p) => {
    if (p.set === undefined) { await styleSetDialog(ed); return true; }
    return { applied: await ed.applyStyleSet(String(p.set)) };
  }, [{ name: 'set', type: 'string', description: STYLE_SETS.map((s) => s.id).join(', ') }]);
  add('format.styles', 'Modify style', 'Format', 'Edit the current paragraph style, create a new style from it, or update it to match the selection.', () => { stylesDialog(ed); return true; });
  for (const [mode, label] of [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Capitalize Each Word'], ['sentence', 'Sentence case'], ['toggle', 'tOGGLE cASE']] as const) {
    add(`format.case.${mode}`, `Change case: ${label}`, 'Format', `Change the selected text to ${label}.`, () => ed.recase(mode));
  }
  add('format.underlineStyle', 'Underline style', 'Format', 'Underline the selection with single, double, dotted, dash or wavy; empty removes it.', (p) => ed.setMark('underline', p.style ? { style: String(p.style) } : null), [{ name: 'style', type: 'string', description: 'single, double, dotted, dash or wavy' }]);
  add('format.characterSpacing', 'Character spacing', 'Format', 'Expand or condense the selection by points; 0 removes it.', (p) => ed.setMark('spacing', Number(p.pt) ? { pt: Number(p.pt) } : null), [{ name: 'pt', type: 'number', description: 'Points, negative condenses' }]);
  add('paragraph.set', 'Set paragraph properties', 'Paragraph', 'Set indents, spacing, line spacing, keep options, border, shading or tab stops on the selected paragraphs.', (p) => {
    const allowed = ['align', 'indent', 'indentRight', 'indentFirst', 'spaceBefore', 'spaceAfter', 'lineSpacing', 'keepNext', 'keepLines', 'widowControl', 'border', 'shading'];
    const props: Record<string, unknown> = {};
    for (const k of allowed) if (p[k] !== undefined) props[k] = p[k];
    if (typeof p.tabs === 'string') props.tabs = parseTabs(p.tabs);
    return ed.paraProps(props);
  }, [
    { name: 'indent', type: 'number', description: 'Left indent in points' }, { name: 'indentFirst', type: 'number', description: 'First-line indent in points; negative hangs' },
    { name: 'spaceBefore', type: 'number', description: 'Points' }, { name: 'spaceAfter', type: 'number', description: 'Points' },
    { name: 'keepNext', type: 'boolean', description: 'Keep with next' }, { name: 'border', type: 'string', description: 'box, top, bottom, left, right or empty' },
    { name: 'shading', type: 'string', description: '#rrggbb or empty' }, { name: 'tabs', type: 'string', description: 'Tab stops such as "72 left, 288 right dot"' },
  ]);

  add('layout.pageSetup', 'Page setup', 'Layout', 'Paper size, orientation, margins, page colour, border, watermark and pageless.', () => { pageSetupDialog(ed); return true; });
  add('layout.setPage', 'Set page', 'Layout', 'Set paper size, orientation and margins (inches) without a dialog.', (p) => {
    const s = ed.section();
    if (!s) throw new Error('Open a document first.');
    const m = { ...s.margins };
    for (const k of ['top', 'bottom', 'left', 'right', 'header', 'footer'] as const) if (p[k] !== undefined) m[k] = Number(p[k]) * 72;
    return ed.updatePage({ page: pageGeometry(String(p.size ?? s.page.size), String(p.orientation ?? s.page.orientation)), margins: m });
  }, [
    { name: 'size', type: 'string', description: 'letter, legal, a4, a5, executive or tabloid' }, { name: 'orientation', type: 'string', description: 'portrait or landscape' },
    { name: 'top', type: 'number', description: 'Top margin in inches' }, { name: 'bottom', type: 'number', description: 'Bottom margin in inches' },
    { name: 'left', type: 'number', description: 'Left margin in inches' }, { name: 'right', type: 'number', description: 'Right margin in inches' },
  ]);
  add('insert.headerFooter', 'Header and footer', 'Insert', 'Edit headers and footers, a different first page, odd and even pages, and page number format.', () => { headerFooterDialog(ed); return true; });
  add('insert.pageNumber', 'Page numbers', 'Insert', 'Put "Page N of M" or "N" in the header or footer.', (p) => {
    const s = ed.section();
    if (!s) throw new Error('Open a document first.');
    const where = p.position === 'header' ? 'headers' : 'footers';
    const text = p.withTotal === false ? '{PAGE}' : 'Page {PAGE} of {NUMPAGES}';
    return ed.updatePage({ [where]: { ...(s[where] as Record<string, unknown>), default: { text, align: String(p.align ?? 'center') } } } as Partial<Section>);
  }, [{ name: 'position', type: 'string', description: 'header or footer (default)' }, { name: 'align', type: 'string', description: 'left, center or right' }, { name: 'withTotal', type: 'boolean', description: 'Include "of N" (default true)' }]);
  add('insert.pageNumbers', 'Page numbers in footer', 'Insert', 'Put "Page N of M" centred in the footer.', () => reg.run('insert.pageNumber', {}));
  add('view.pageless', 'Pageless', 'View', 'Switch between pages and one continuous pageless sheet.', () => { const on = !(ed.doc?.settings as unknown as { pageless?: boolean })?.pageless; ed.updatePage({}, { pageless: on }); return on; });
  add('view.zoom', 'Zoom', 'View', 'Set the zoom in percent.', (p) => ed.setZoom(Number(p.percent ?? p.value ?? 100) / 100), [{ name: 'percent', type: 'number', description: '25 to 300' }]);
  add('view.zoomIn', 'Zoom in', 'View', 'Zoom in by 10 percent.', () => ed.setZoom(ed.zoom + 0.1), [], ['Ctrl+=']);
  add('view.zoomOut', 'Zoom out', 'View', 'Zoom out by 10 percent.', () => ed.setZoom(ed.zoom - 0.1), [], ['Ctrl+-']);
  for (const [mode, label, desc] of [['print', 'Print layout', 'Pages as they will print.'], ['draft', 'Draft', 'Text only: no pages, headers or ruler.'], ['read', 'Read mode', 'Pages without editing; press Esc or choose Print layout to edit.'], ['focus', 'Focus mode', 'Hide the toolbar, outline and status bar; Esc returns.']] as const) {
    add(`view.${mode}`, label, 'View', desc, () => ed.setView(mode));
  }
  add('view.ruler', 'Ruler', 'View', 'Show or hide the ruler.', () => { const on = ed.ruler.root.hidden === true; ed.ruler.show(on); return on; });
  add('layout.lineNumbers', 'Line numbers', 'Layout', 'Number lines in the margin: continuous, restart each page, or off.', (p) => {
    const mode = String(p.mode ?? '');
    return ed.updatePage({}, { lineNumbers: ['continuous', 'page'].includes(mode) ? mode : '' });
  }, [{ name: 'mode', type: 'string', description: 'continuous, page, or empty for off' }]);
  add('layout.lineNumbersToggle', 'Line numbers on or off', 'Layout', 'Turn continuous line numbers on or off.', () => {
    const on = !(ed.doc?.settings as unknown as { lineNumbers?: string })?.lineNumbers;
    ed.updatePage({}, { lineNumbers: on ? 'continuous' : '' });
    return on;
  });
  add('insert.coverPage', 'Cover page', 'Insert', 'Insert a centred title page and a page break at the start; the first page gets no header or footer.', (p) => ed.insertCover(String(p.title ?? ''), String(p.subtitle ?? ''), String(p.byline ?? '')), [
    { name: 'title', type: 'string', description: 'Defaults to the document title' }, { name: 'subtitle', type: 'string', description: 'Optional' }, { name: 'byline', type: 'string', description: 'Author, date or organisation' },
  ]);
  add('insert.coverPageDefault', 'Cover page with the title', 'Insert', 'Insert a cover page using the document title.', () => ed.insertCover('', '', new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })));

  add('insert.sectionBreak', 'Section break (next page)', 'Insert', 'Start a new section on the next page; it can have its own headers, footers and page numbering.', () => ed.insertSectionBreak());
  add('insert.tab', 'Tab', 'Insert', 'Insert a tab character that aligns to the next tab stop.', () => ed.run((state, dispatch) => { dispatch?.(state.tr.replaceSelectionWith(schemaTab()).scrollIntoView()); return true; }));
  add('layout.sections', 'List sections', 'Layout', 'List the document sections with their headers and footers.', () => (ed.doc?.sections ?? []).map((s) => ({ id: s.id, headers: s.headers, footers: s.footers, titlePage: s.titlePage, pageNumberStart: s.pageNumberStart ?? null })));
  add('layout.setHeaderFooter', 'Set header or footer', 'Layout', 'Set a header or footer text in a section; {PAGE} and {NUMPAGES} are fields.', (p) => {
    const id = String(p.section ?? ed.currentSectionId());
    const where = p.part === 'footer' ? 'footers' : 'headers';
    const which = ['first', 'even'].includes(String(p.which)) ? String(p.which) : 'default';
    const s = ed.sectionById(id);
    return ed.updateSectionById(s.id, { [where]: { ...(s[where] as Record<string, unknown>), [which]: { text: String(p.text ?? ''), align: String(p.align ?? (where === 'footers' ? 'center' : 'left')) } } } as Partial<Section>);
  }, [{ name: 'part', type: 'string', description: 'header or footer' }, { name: 'text', type: 'string', description: 'Text with optional {PAGE} and {NUMPAGES}' }, { name: 'which', type: 'string', description: 'default, first or even' }, { name: 'section', type: 'string', description: 'Section id; defaults to the section at the cursor' }, { name: 'align', type: 'string', description: 'left, center or right' }]);

  add('layout.restartNumbering', 'Restart page numbering', 'Layout', 'Restart page numbers at the start of a section, or continue from the previous one.', (p) => {
    const id = String(p.section ?? ed.currentSectionId());
    const start = p.start === undefined || p.start === null || p.start === '' ? undefined : Math.max(0, Math.round(Number(p.start)));
    return ed.updateSectionById(id, { pageNumberStart: start } as Partial<Section>);
  }, [{ name: 'section', type: 'string', description: 'Section id; defaults to the section at the cursor' }, { name: 'start', type: 'number', description: 'First page number; empty continues' }]);

  const inTable = (cmd: Command) => () => {
    if (!ed.view || !isInTable(ed.view.state)) throw new Error('Put the cursor in a table first.');
    return ed.run(cmd);
  };
  add('insert.table', 'Table', 'Insert', 'Insert a table as wide as the page body; with no size, asks for one.', (p) => {
    if (p.rows === undefined && p.cols === undefined) { insertTableDialog(ed); return true; }
    return ed.run(insertTable(Number(p.rows) || 3, Number(p.cols) || 3, ed.bodyWidth(), p.header === undefined ? true : !!p.header));
  }, [{ name: 'rows', type: 'number', description: 'Rows, 1 to 200' }, { name: 'cols', type: 'number', description: 'Columns, 1 to 40' }, { name: 'header', type: 'boolean', description: 'First row is a repeating header row (default true)' }]);
  add('table.rowAbove', 'Insert row above', 'Table', 'Insert a row above the cursor.', inTable(addRowBefore));
  add('table.rowBelow', 'Insert row below', 'Table', 'Insert a row below the cursor (Tab in the last cell does the same).', inTable(addRowAfter));
  add('table.colLeft', 'Insert column left', 'Table', 'Insert a column to the left of the cursor.', inTable(addColumnBefore));
  add('table.colRight', 'Insert column right', 'Table', 'Insert a column to the right of the cursor.', inTable(addColumnAfter));
  add('table.deleteRow', 'Delete row', 'Table', 'Delete the selected rows.', inTable(deleteRow));
  add('table.deleteColumn', 'Delete column', 'Table', 'Delete the selected columns.', inTable(deleteColumn));
  add('table.delete', 'Delete table', 'Table', 'Delete the table at the cursor.', inTable(deleteTable));
  add('table.merge', 'Merge cells', 'Table', 'Merge the selected cells into one (drag across cells to select them).', inTable(mergeCells));
  add('table.split', 'Split cell', 'Table', 'Split a merged cell back into single cells.', inTable(splitCell));
  add('table.headerRow', 'Header row', 'Table', 'Turn the first row into header cells, or back.', inTable(toggleHeaderRow));
  add('table.headerColumn', 'Header column', 'Table', 'Turn the first column into header cells, or back.', inTable(toggleHeaderColumn));
  add('table.properties', 'Table properties', 'Table', 'Look, alignment, repeating header rows, cell shading and alignment, column widths and sorting.', () => { tablePropertiesDialog(ed); return true; });
  add('table.look', 'Table look', 'Table', `Set the table look: ${TABLE_LOOKS.join(', ')}.`, (p) => {
    const v = String(p.look ?? 'grid');
    if (!(TABLE_LOOKS as readonly string[]).includes(v)) throw new Error(`Look must be one of ${TABLE_LOOKS.join(', ')}.`);
    return inTable(setTableAttr('look', v))();
  }, [{ name: 'look', type: 'string', description: TABLE_LOOKS.join(', ') }]);
  add('table.repeatHeader', 'Repeat header rows', 'Table', 'Repeat the header rows at the top of each page the table continues on.', (p) => inTable(setTableAttr('repeatHeader', p.on === undefined ? true : !!p.on))(), [{ name: 'on', type: 'boolean', description: 'Default true' }]);
  add('table.align', 'Table alignment', 'Table', 'Place the table at the left or centre of the page body.', (p) => inTable(setTableAttr('align', p.align === 'center' ? 'center' : ''))(), [{ name: 'align', type: 'string', description: 'left or center' }]);
  add('table.shading', 'Cell shading', 'Table', 'Shade the selected cells; empty removes shading.', (p) => inTable(setCellShading(String(p.value ?? '')))(), [{ name: 'value', type: 'string', description: '#rrggbb or empty' }]);
  add('table.borders', 'Cell borders', 'Table', `Borders on the selected cells; with no target, opens the borders dialog. Targets: ${BORDER_TARGETS.join(', ')} (clear goes back to the table look).`, (p) => {
    if (p.target === undefined) { cellBordersDialog(ed); return true; }
    const target = String(p.target);
    if (!(BORDER_TARGETS as readonly string[]).includes(target)) throw new Error(`target must be one of ${BORDER_TARGETS.join(', ')}.`);
    const style = p.style === undefined ? 'solid' : String(p.style);
    if (!['solid', 'dashed', 'dotted', 'double'].includes(style)) throw new Error('style must be solid, dashed, dotted or double.');
    return inTable(setCellBorders(target, { style, width: Math.max(0.25, Math.min(6, Number(p.width) || 0.75)), color: color(p.color) || '#000000' }))();
  }, [{ name: 'target', type: 'string', description: BORDER_TARGETS.join(', ') }, { name: 'style', type: 'string', description: 'solid, dashed, dotted or double' }, { name: 'width', type: 'number', description: 'Points, 0.25 to 6' }, { name: 'color', type: 'string', description: '#rrggbb' }]);
  add('table.valign', 'Cell vertical alignment', 'Table', 'Align cell content to the top, middle or bottom.', (p) => inTable(setCellAttr('valign', ['middle', 'bottom'].includes(String(p.value)) ? String(p.value) : ''))(), [{ name: 'value', type: 'string', description: 'top, middle or bottom' }]);
  add('table.distribute', 'Distribute columns', 'Table', 'Make every column the same width; the table keeps its width unless one is given.', (p) => inTable(distributeColumns(Number(p.width) || undefined))(), [{ name: 'width', type: 'number', description: 'Table width in points (optional)' }]);
  add('table.sort', 'Sort table', 'Table', 'Sort the rows below the header rows by a column; numbers sort as numbers.', (p) => inTable(sortTable((Number(p.column) || 1) - 1, !!p.descending))(), [{ name: 'column', type: 'number', description: 'Column number, from 1' }, { name: 'descending', type: 'boolean', description: 'Largest or Z first' }]);
  add('table.fromText', 'Convert text to table', 'Table', 'Turn the selected paragraphs into a table, splitting each on tabs, commas, semicolons or pipes.', (p) => {
    const ok = ed.run(textToTable(String(p.separator ?? 'tab'), ed.bodyWidth()));
    if (!ok) throw new Error('Select whole paragraphs outside a table first.');
    return ok;
  }, [{ name: 'separator', type: 'string', description: 'tab, comma, semicolon or pipe' }]);
  add('table.toText', 'Convert table to text', 'Table', 'Turn the table into paragraphs with cells separated by tabs.', inTable(tableToText()));
  add('table.info', 'Table at cursor', 'Table', 'Rows, columns, look and the cell at the cursor.', () => (ed.view ? tableInfo(ed.view.state) : null));

  const picker = el<HTMLInputElement>('<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" multiple hidden>');
  ed.root.appendChild(picker);
  picker.addEventListener('change', () => {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    if (files.length) void ed.insertPictures(files).catch((err: Error) => toast(`Could not add the picture: ${err.message}`, 'error'));
  });
  const needPic = (patch: (a: Record<string, unknown>, p: Record<string, unknown>) => Record<string, unknown>) => (p: Record<string, unknown>) => {
    const pic = ed.view ? selectedPicture(ed.view.state) : null;
    if (!pic) throw new Error('Click a picture first (or put the cursor right next to one).');
    return ed.run(setPicture(patch(pic.node.attrs as Record<string, unknown>, p)));
  };
  add('insert.picture', 'Picture', 'Insert', 'Insert pictures from files; with media, inserts a picture already uploaded to the document (POST /api/documents/{id}/media).', (p) => {
    if (!p.media) { picker.click(); return true; }
    const meta = (ed.doc?.media ?? {})[String(p.media)] as { width?: number; height?: number } | undefined;
    const w = Number(p.width) || Math.min(ed.bodyWidth(), (meta?.width ?? 400) * 0.75);
    const h = Number(p.height) || w * ((meta?.height ?? 300) / (meta?.width ?? 400));
    return ed.run(insertPicture({ media: String(p.media), alt: String(p.alt ?? ''), width: w, height: h }));
  }, [{ name: 'media', type: 'string', description: 'Media name returned by the upload' }, { name: 'width', type: 'number', description: 'Width in points' }, { name: 'height', type: 'number', description: 'Height in points; defaults to the picture proportions' }, { name: 'alt', type: 'string', description: 'Alt text' }]);
  add('picture.properties', 'Picture properties', 'Picture', 'Alt text, wrapping, size, rotation, crop, brightness, contrast, saturation, transparency and position (or double-click a picture).', () => { picturePropertiesDialog(ed); return true; });
  add('picture.wrap', 'Wrap text', 'Picture', `Set how text wraps: ${WRAPS.join(', ')}.`, needPic((_a, p) => {
    const wrap = String(p.wrap ?? 'inline');
    if (!(WRAPS as readonly string[]).includes(wrap)) throw new Error(`Wrap must be one of ${WRAPS.join(', ')}.`);
    return { wrap, ...(p.side ? { side: ['left', 'center', 'right'].includes(String(p.side)) ? String(p.side) : 'left' } : {}) };
  }), [{ name: 'wrap', type: 'string', description: WRAPS.join(', ') }, { name: 'side', type: 'string', description: 'left, center or right' }]);
  add('picture.size', 'Picture size', 'Picture', 'Set the size in points; give only width to keep the proportions.', needPic((a, p) => {
    const w = Number(p.width) || Number(a.width);
    const h = Number(p.height) || (Number(p.width) ? w * (Number(a.height) / Math.max(1, Number(a.width))) : Number(a.height));
    return { width: Math.max(9, w), height: Math.max(9, h) };
  }), [{ name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points (optional)' }]);
  add('picture.rotate', 'Rotate picture', 'Picture', 'Rotate to an angle, or by 90 degrees with no angle.', needPic((a, p) => ({ rotate: p.degrees === undefined ? (Number(a.rotate) + 90) % 360 : Number(p.degrees) % 360 })), [{ name: 'degrees', type: 'number', description: 'Angle; empty adds 90' }]);
  add('picture.crop', 'Crop picture', 'Picture', 'Crop each edge by a percentage; all zero removes the crop.', needPic((_a, p) => {
    const f = (v: unknown): number => Math.max(0, Math.min(90, Number(v) || 0)) / 100;
    const c = { t: f(p.top), r: f(p.right), b: f(p.bottom), l: f(p.left) };
    if (c.t + c.b > 0.9 || c.l + c.r > 0.9) throw new Error('Crop can remove at most 90 percent of the width or height.');
    return { crop: c.t || c.r || c.b || c.l ? c : null };
  }), [{ name: 'top', type: 'number', description: 'Percent' }, { name: 'right', type: 'number', description: 'Percent' }, { name: 'bottom', type: 'number', description: 'Percent' }, { name: 'left', type: 'number', description: 'Percent' }]);
  add('picture.adjust', 'Adjust picture', 'Picture', 'Brightness, contrast and saturation from 0 to 200 (100 is unchanged), transparency from 0 to 100.', needPic((a, p) => {
    const r = (v: unknown, d: unknown, max: number): number => (v === undefined ? Number(d) : Math.max(0, Math.min(max, Number(v) || 0)));
    return { brightness: r(p.brightness, a.brightness, 200), contrast: r(p.contrast, a.contrast, 200), saturation: r(p.saturation, a.saturation, 200), transparency: r(p.transparency, a.transparency, 100) };
  }), [{ name: 'brightness', type: 'number', description: '0 to 200' }, { name: 'contrast', type: 'number', description: '0 to 200' }, { name: 'saturation', type: 'number', description: '0 to 200; 0 is greyscale' }, { name: 'transparency', type: 'number', description: '0 to 100' }]);
  add('picture.alt', 'Alt text', 'Picture', 'Set the alt text read by screen readers and exported to Word and HTML.', needPic((_a, p) => ({ alt: String(p.text ?? '').trim() })), [{ name: 'text', type: 'string', description: 'Description' }]);
  add('picture.position', 'Picture position', 'Picture', 'Offset a picture behind or in front of text from the top left of its paragraph, or of the page with relative=page, in points.', needPic((a, p) => ({ x: p.x === undefined ? a.x : Number(p.x) || 0, y: p.y === undefined ? a.y : Number(p.y) || 0, relative: p.relative === undefined ? a.relative : p.relative === 'page' ? 'page' : 'paragraph' })), [{ name: 'x', type: 'number', description: 'Points from the left' }, { name: 'y', type: 'number', description: 'Points from the top' }, { name: 'relative', type: 'string', description: 'paragraph or page' }]);
  add('picture.cropTool', 'Crop on the picture', 'Picture', 'Show the whole picture with crop handles: drag an edge or corner to crop, drag inside to move the frame; Enter or clicking elsewhere applies, Esc cancels.', (p) => {
    const pic = ed.view ? selectedPicture(ed.view.state) : null;
    if (!pic || !ed.view) throw new Error('Click a picture first.');
    const pv = pictureViews.get(ed.view.nodeDOM(pic.pos) as HTMLElement);
    if (!pv) throw new Error('The picture is not on screen.');
    return pv.cropMode(p.on === undefined ? true : !!p.on, p.apply === undefined ? true : !!p.apply);
  }, [{ name: 'on', type: 'boolean', description: 'Start (default) or finish cropping' }, { name: 'apply', type: 'boolean', description: 'When finishing, keep the new crop (default) or discard it' }]);
  add('picture.reset', 'Reset picture', 'Picture', 'Remove crop, rotation and adjustments.', needPic(() => ({ crop: null, rotate: 0, brightness: 100, contrast: 100, saturation: 100, transparency: 0 })));
  add('picture.info', 'Picture at cursor', 'Picture', 'Properties of the selected picture.', () => {
    const pic = ed.view ? selectedPicture(ed.view.state) : null;
    return pic ? { ...pic.node.attrs, pos: pic.pos } : null;
  });
  add('picture.select', 'Select picture', 'Picture', 'Select the first picture in the document, or the next one after the selection.', () => {
    if (!ed.view) throw new Error('Open a document first.');
    const { state } = ed.view;
    let found = -1, first = -1;
    state.doc.descendants((n, pos) => { if (n.type === schema.nodes.image) { if (first < 0) first = pos; if (found < 0 && pos > state.selection.from - (state.selection instanceof NodeSelection ? 0 : 1)) found = pos; } return found < 0; });
    const at = found >= 0 && !(state.selection instanceof NodeSelection && state.selection.from === found) ? found : first;
    if (at < 0) throw new Error('The document has no pictures.');
    ed.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return at;
  });
  ed.root.addEventListener('dblclick', (e) => {
    const pic = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-pic');
    if (!pic || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    const pos = ed.view.posAtDOM(pic, 0);
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, pos)));
    picturePropertiesDialog(ed);
  });

  const needChart = (patch: (a: Record<string, unknown>, p: Record<string, unknown>) => Record<string, unknown>) => (p: Record<string, unknown>) => {
    const c = ed.view ? selectedChart(ed.view.state) : null;
    if (!c) throw new Error('Select a chart first (click it, or run chart.select).');
    return ed.run(setChart(patch(c.node.attrs as Record<string, unknown>, p)));
  };
  const kindOf = (v: unknown): string => {
    const k = String(v ?? 'bar');
    if (!(CHART_KINDS as readonly string[]).includes(k)) throw new Error(`Chart type must be one of ${CHART_KINDS.join(', ')}.`);
    return k;
  };
  add('insert.chart', 'Chart', 'Insert', `Insert a chart; with no data, opens the chart editor. Types: ${CHART_KINDS.join(', ')}.`, (p) => {
    if (p.data === undefined && p.kind === undefined) { chartDialog(ed, true); return true; }
    const data = p.data !== undefined ? parseGrid(String(p.data).replace(/\\t/g, '\t').replace(/\\n/g, '\n')) : SAMPLE;
    if (!data.categories.length) throw new Error('The data needs a header row and at least one row of values.');
    return ed.run(insertChart({ kind: kindOf(p.kind), title: String(p.title ?? ''), width: Math.min(Number(p.width) || 468, ed.bodyWidth()), height: Number(p.height) || 252, data }));
  }, [{ name: 'kind', type: 'string', description: CHART_KINDS.join(', ') }, { name: 'data', type: 'string', description: 'Rows of tab- or comma-separated values, header first; \\n separates rows' }, { name: 'title', type: 'string', description: 'Title above the chart' }, { name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('chart.properties', 'Chart editor', 'Chart', 'Type, title, size, options and data of the selected chart (or double-click a chart).', () => { chartDialog(ed, false); return true; });
  add('chart.kind', 'Chart type', 'Chart', `Change the chart type: ${CHART_KINDS.join(', ')}.`, needChart((_a, p) => ({ kind: kindOf(p.kind) })), [{ name: 'kind', type: 'string', description: CHART_KINDS.join(', ') }]);
  add('chart.data', 'Chart data', 'Chart', 'Replace the data with tab- or comma-separated rows, header first.', needChart((_a, p) => {
    const data = parseGrid(String(p.data ?? '').replace(/\\t/g, '\t').replace(/\\n/g, '\n'));
    if (!data.categories.length) throw new Error('The data needs a header row and at least one row of values.');
    return { data };
  }), [{ name: 'data', type: 'string', description: 'Rows; \\n separates rows' }]);
  add('chart.options', 'Chart options', 'Chart', 'Data labels, legend, smooth lines, stacking, the number shown (sum, average, min, max, count) and a target.', needChart((_a, p) => {
    const o: Record<string, unknown> = {};
    for (const k of ['labels', 'legend', 'smooth', 'stacked']) if (p[k] !== undefined) o[k] = !!p[k];
    if (p.fn !== undefined) { if (!(CHART_FNS as readonly string[]).includes(String(p.fn))) throw new Error(`fn must be one of ${CHART_FNS.join(', ')}.`); o.fn = String(p.fn); }
    if (p.target !== undefined) o.target = Number(p.target) || undefined;
    return { options: o };
  }), [{ name: 'labels', type: 'boolean', description: 'Data labels' }, { name: 'legend', type: 'boolean', description: 'Legend' }, { name: 'smooth', type: 'boolean', description: 'Smooth lines' }, { name: 'stacked', type: 'boolean', description: 'Stack series' }, { name: 'fn', type: 'string', description: CHART_FNS.join(', ') }, { name: 'target', type: 'number', description: 'Target for gauge and radial' }]);
  add('chart.size', 'Chart size', 'Chart', 'Set the chart size in points.', needChart((a, p) => ({ width: Math.max(120, Math.min(ed.bodyWidth(), Number(p.width) || Number(a.width))), height: Math.max(90, Number(p.height) || Number(a.height)) })), [{ name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('chart.title', 'Chart title', 'Chart', 'Set the title shown above the chart.', needChart((_a, p) => ({ title: String(p.text ?? '').trim() })), [{ name: 'text', type: 'string', description: 'Title; empty removes it' }]);
  add('chart.export', 'Export chart', 'Chart', 'Download the selected chart as an SVG or PNG file.', (p) => {
    const c = ed.view ? selectedChart(ed.view.state) : null;
    const svg = c && ed.view ? (ed.view.nodeDOM(c.pos) as HTMLElement | null)?.querySelector('svg') : null;
    if (!c || !svg) throw new Error('Select a chart first.');
    return exportChart(svg as SVGSVGElement, String(c.node.attrs.title || 'chart'), p.format === 'png' ? 'png' : 'svg').then(() => true);
  }, [{ name: 'format', type: 'string', description: 'svg or png' }]);
  add('chart.info', 'Chart at cursor', 'Chart', 'Type, size, options and data of the selected chart.', () => {
    const c = ed.view ? selectedChart(ed.view.state) : null;
    return c ? { ...c.node.attrs, pos: c.pos } : null;
  });
  add('chart.select', 'Select chart', 'Chart', 'Select the first chart, or the next one after the selection.', () => {
    if (!ed.view) throw new Error('Open a document first.');
    const { state } = ed.view;
    const all: number[] = [];
    state.doc.descendants((n, pos) => { if (n.type === schema.nodes.chart) all.push(pos); return true; });
    if (!all.length) throw new Error('The document has no charts.');
    const at = all.find((pos) => pos > state.selection.from) ?? all[0];
    ed.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return at;
  });
  add('insert.symbol', 'Symbol', 'Insert', 'Insert a symbol or special character; with no value, opens the symbol picker.', (p) => {
    if (p.char === undefined && p.code === undefined) { symbolDialog(ed); return true; }
    if (p.char !== undefined) return ed.insertText(String(p.char));
    const hex = String(p.code).trim().replace(/^(u\+|0x)/i, '');
    const n = parseInt(hex, 16);
    if (!/^[0-9a-f]{1,6}$/i.test(hex) || !(n > 31 && n <= 0x10ffff)) throw new Error('code must be a hexadecimal Unicode code such as 00A9.');
    return ed.insertText(String.fromCodePoint(n));
  }, [{ name: 'char', type: 'string', description: 'The character to insert' }, { name: 'code', type: 'string', description: 'Hexadecimal Unicode code, such as 2122' }]);
  const needShape = (patch: (a: Record<string, unknown>, p: Record<string, unknown>) => Record<string, unknown>) => (p: Record<string, unknown>) => {
    const s = ed.view ? selectedShape(ed.view.state) : null;
    if (!s) throw new Error('Select a shape first (click it, or run shape.select).');
    return ed.run(setShape(patch(s.node.attrs as Record<string, unknown>, p)));
  };
  const color = (v: unknown): string => {
    const s = String(v ?? '').trim();
    if (s && !/^#[0-9a-f]{6}$/i.test(s)) throw new Error('Colours are #rrggbb; empty removes it.');
    return s;
  };
  add('insert.shape', 'Shape', 'Insert', `Insert a shape; with no kind, opens the shape gallery. Kinds: ${SHAPES.join(', ')}.`, (p) => {
    if (p.kind === undefined) { shapeGalleryDialog(ed); return true; }
    const kind = String(p.kind);
    if (!(SHAPES as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${SHAPES.join(', ')}.`);
    const attrs = shapeDefaults(kind);
    if (p.text !== undefined) attrs.text = String(p.text);
    if (Number(p.width)) attrs.width = Number(p.width);
    if (Number(p.height)) attrs.height = Number(p.height);
    return ed.run(insertShape(attrs));
  }, [{ name: 'kind', type: 'string', description: SHAPES.join(', ') }, { name: 'text', type: 'string', description: 'Text inside the shape' }, { name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('insert.textBox', 'Text box', 'Insert', 'Insert a text box with square wrapping.', (p) => ed.run(insertShape({ ...shapeDefaults('textBox'), ...(p.text !== undefined ? { text: String(p.text) } : {}) })), [{ name: 'text', type: 'string', description: 'Text' }]);
  add('insert.wordArt', 'WordArt', 'Insert', `Insert decorative text in a style: ${WORDART.join(', ')}.`, (p) => {
    const style = String(p.style ?? 'gradient');
    if (!(WORDART as readonly string[]).includes(style)) throw new Error(`style must be one of ${WORDART.join(', ')}.`);
    return ed.run(insertShape({ ...shapeDefaults('wordArt'), wordart: style, ...(p.text !== undefined ? { text: String(p.text) } : {}) }));
  }, [{ name: 'text', type: 'string', description: 'Text' }, { name: 'style', type: 'string', description: WORDART.join(', ') }]);
  add('shape.properties', 'Shape properties', 'Shape', 'Kind, fill, outline, text, WordArt style, wrapping, size, rotation and position of the selected shape.', () => { shapePropertiesDialog(ed); return true; });
  add('shape.text', 'Shape text', 'Shape', 'Set the text inside the selected shape as plain text (double-click a shape to type and format in it).', needShape((_a, p) => ({ text: String(p.text ?? '').replace(/\\n/g, '\n'), content: null })), [{ name: 'text', type: 'string', description: 'Text; \\n starts a new line' }]);
  const shapeIdAt = (pos: number): string => {
    const v = ed.view!;
    const n = v.state.doc.nodeAt(pos);
    if (!n || n.type !== schema.nodes.shape) throw new Error('That is not a shape.');
    if (n.attrs.id) return String(n.attrs.id);
    const id = newShapeId();
    v.dispatch(v.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, id }).setMeta('addToHistory', false));
    return id;
  };
  const connect = (fromPos: number, toId: string): string => {
    const v = ed.view!;
    const fromId = shapeIdAt(fromPos);
    if (fromId === toId) throw new Error('Pick a different shape to connect to.');
    v.dispatch(v.state.tr.insert(fromPos + 1, schema.nodes.shape.create({ kind: 'connector', id: newShapeId(), from: fromId, to: toId, stroke: '#57534e', strokeWidth: 1.5, arrowEnd: true, fill: '', wrap: 'front', width: 12, height: 12 })));
    return fromId;
  };
  add('shape.connect', 'Connect shapes', 'Shape', 'Draw a connector from the selected shape to another that follows both when they move; with no target, the next shape you click is the target (Esc cancels).', (p) => {
    const s = ed.view ? selectedShape(ed.view.state) : null;
    if (!s || !ed.view) throw new Error('Select the shape to connect from first.');
    if (p.to !== undefined) {
      let target = -1;
      ed.view.state.doc.descendants((n, pos) => { if (n.type === schema.nodes.shape && n.attrs.id === String(p.to)) target = pos; return target < 0; });
      if (target < 0) throw new Error(`No shape has the id ${String(p.to)}; shape.info shows a shape's id.`);
      connect(s.pos, String(p.to));
      return true;
    }
    const from = s.pos;
    const root = ed.view.dom as HTMLElement;
    root.classList.add('is-connecting');
    toast('Click the shape to connect to (Esc cancels).');
    const stop = (): void => { root.classList.remove('is-connecting'); document.removeEventListener('pointerdown', pick, true); document.removeEventListener('keydown', esc, true); };
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    const pick = (e: PointerEvent): void => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-shape');
      stop();
      if (!el || !ed.view) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const at = ed.view.posAtDOM(el, 0);
        const pos = ed.view.state.doc.nodeAt(at)?.type === schema.nodes.shape ? at : at - 1;
        const toId = shapeIdAt(pos);
        connect(from, toId);
      } catch (err) { toast((err as Error).message, 'error'); }
    };
    document.addEventListener('pointerdown', pick, true);
    document.addEventListener('keydown', esc, true);
    return true;
  }, [{ name: 'to', type: 'string', description: 'Id of the target shape (see shape.info)' }]);
  add('shape.fill', 'Shape fill', 'Shape', 'Fill colour; empty removes the fill.', needShape((_a, p) => ({ fill: color(p.color) })), [{ name: 'color', type: 'string', description: '#rrggbb or empty' }]);
  add('shape.outline', 'Shape outline', 'Shape', 'Outline colour and width in points; empty colour removes the outline.', needShape((a, p) => ({ stroke: p.color === undefined ? a.stroke : color(p.color), strokeWidth: p.width === undefined ? a.strokeWidth : Math.max(0, Number(p.width) || 0) })), [{ name: 'color', type: 'string', description: '#rrggbb or empty' }, { name: 'width', type: 'number', description: 'Points' }]);
  add('shape.textFormat', 'Shape text format', 'Shape', 'Text colour, size, bold, font and alignment inside the selected shape.', needShape((a, p) => ({
    color: p.color === undefined ? a.color : color(p.color), size: Number(p.size) || a.size, bold: p.bold === undefined ? a.bold : !!p.bold, font: p.font === undefined ? a.font : String(p.font),
    align: ['left', 'center', 'right'].includes(String(p.align)) ? String(p.align) : a.align, valign: ['top', 'middle', 'bottom'].includes(String(p.valign)) ? String(p.valign) : a.valign,
  })), [{ name: 'color', type: 'string', description: '#rrggbb' }, { name: 'size', type: 'number', description: 'Points' }, { name: 'bold', type: 'boolean', description: 'Bold' }, { name: 'font', type: 'string', description: 'Font family' }, { name: 'align', type: 'string', description: 'left, center or right' }, { name: 'valign', type: 'string', description: 'top, middle or bottom' }]);
  add('shape.kind', 'Change shape', 'Shape', 'Change the shape outline, keeping size, colours and text.', needShape((_a, p) => {
    const kind = String(p.kind ?? '');
    if (!(SHAPES as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${SHAPES.join(', ')}.`);
    return { kind };
  }), [{ name: 'kind', type: 'string', description: SHAPES.join(', ') }]);
  add('shape.wordArt', 'WordArt style', 'Shape', `Set the WordArt style: ${WORDART.join(', ')}.`, needShape((_a, p) => {
    const style = String(p.style ?? '');
    if (!(WORDART as readonly string[]).includes(style)) throw new Error(`style must be one of ${WORDART.join(', ')}.`);
    return { kind: 'wordArt', wordart: style };
  }), [{ name: 'style', type: 'string', description: WORDART.join(', ') }]);
  add('shape.size', 'Shape size', 'Shape', 'Width and height in points.', needShape((a, p) => ({ width: Math.max(6, Number(p.width) || Number(a.width)), height: Math.max(3, Number(p.height) || Number(a.height)) })), [{ name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('shape.rotate', 'Rotate shape', 'Shape', 'Rotate to an angle, or by 90 degrees with no angle.', needShape((a, p) => ({ rotate: p.degrees === undefined ? (Number(a.rotate) + 90) % 360 : Number(p.degrees) % 360 })), [{ name: 'degrees', type: 'number', description: 'Angle; empty adds 90' }]);
  add('shape.wrap', 'Shape wrapping', 'Shape', `Set how text wraps: ${SHAPE_WRAPS.join(', ')}.`, needShape((_a, p) => {
    const wrap = String(p.wrap ?? 'front');
    if (!(SHAPE_WRAPS as readonly string[]).includes(wrap)) throw new Error(`wrap must be one of ${SHAPE_WRAPS.join(', ')}.`);
    return { wrap, ...(p.side ? { side: ['left', 'center', 'right'].includes(String(p.side)) ? String(p.side) : 'left' } : {}) };
  }), [{ name: 'wrap', type: 'string', description: SHAPE_WRAPS.join(', ') }, { name: 'side', type: 'string', description: 'left, center or right' }]);
  add('shape.position', 'Shape position', 'Shape', 'Offset a shape behind or in front of text from the top left of its paragraph, or of the page with relative=page, in points.', needShape((a, p) => ({ x: p.x === undefined ? a.x : Number(p.x) || 0, y: p.y === undefined ? a.y : Number(p.y) || 0, relative: p.relative === undefined ? a.relative : p.relative === 'page' ? 'page' : 'paragraph' })), [{ name: 'x', type: 'number', description: 'Points' }, { name: 'y', type: 'number', description: 'Points' }, { name: 'relative', type: 'string', description: 'paragraph or page' }]);
  add('shape.arrows', 'Line arrows', 'Shape', 'Arrowheads at the start and end of a line.', needShape((a, p) => {
    if (a.kind !== 'line' && a.kind !== 'connector') throw new Error('Arrowheads apply to lines and connectors; insert one with insert.shape kind=line or shape.connect.');
    return { arrowStart: p.start === undefined ? a.arrowStart : !!p.start, arrowEnd: p.end === undefined ? a.arrowEnd : !!p.end };
  }), [{ name: 'start', type: 'boolean', description: 'Arrowhead at the start' }, { name: 'end', type: 'boolean', description: 'Arrowhead at the end' }]);
  add('shape.info', 'Shape at cursor', 'Shape', 'Properties of the selected shape.', () => { const s = ed.view ? selectedShape(ed.view.state) : null; return s ? { ...s.node.attrs, pos: s.pos } : null; });
  add('shape.select', 'Select shape', 'Shape', 'Select the first shape, or the next one after the selection.', () => {
    if (!ed.view) throw new Error('Open a document first.');
    const { state } = ed.view;
    const all: number[] = [];
    state.doc.descendants((n, pos) => { if (n.type === schema.nodes.shape) all.push(pos); return true; });
    if (!all.length) throw new Error('The document has no shapes.');
    const at = all.find((pos) => pos > state.selection.from) ?? all[0];
    ed.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return at;
  });
  add('insert.equation', 'Equation', 'Insert', 'Insert an equation written in LaTeX; with no latex, opens the equation editor (Alt+=).', (p) => {
    if (p.latex === undefined) { equationDialog(ed); return true; }
    return ed.run(putMath(String(p.latex), !!p.display));
  }, [{ name: 'latex', type: 'string', description: 'LaTeX, such as \\frac{a}{b}' }, { name: 'display', type: 'boolean', description: 'On its own line' }], ['Alt+=']);
  add('equation.edit', 'Edit equation', 'Equation', 'Edit the selected equation (or double-click it).', () => { equationDialog(ed); return true; });
  add('equation.info', 'Equation at cursor', 'Equation', 'The LaTeX of the selected equation.', () => { const m = ed.view ? selectedMath(ed.view.state) : null; return m ? { latex: m.node.attrs.latex, display: m.node.attrs.display, pos: m.pos } : null; });
  ed.onEquationKey = () => equationDialog(ed);
  setChipHost({
    docId: () => ed.docId(),
    bodyWidth: () => ed.bodyWidth(),
    openDoc: (id) => { void reg.run('file.open', { id }).catch((err: Error) => toast(err.message, 'error')); },
    dialog: (kind, current) => { void chipDialog(ed, kind, current).catch((err: Error) => toast(err.message, 'error')); },
  });
  add('insert.chip', 'Smart chip', 'Insert', `Insert a smart chip: kind date (date as YYYY-MM-DD, format ${DATE_FORMATS.join(', ')}), person (name, email), dropdown (options separated by commas, or preset ${DROPDOWN_PRESETS.map((p) => p.id).join(', ')}; value) or doc (doc id). With no kind, types @ and opens the chip menu; with a kind and nothing else, opens its dialog.`, async (p) => {
    if (!ed.view) throw new Error('Open a document first.');
    const view = ed.view;
    if (p.kind === undefined) {
      const { from, to } = view.state.selection;
      view.dispatch(view.state.tr.insertText('@', from, to).setMeta(chipKey, { activate: from }));
      await Promise.all([loadDocs(), loadAuthor()]);
      view.dispatch(view.state.tr.setMeta('chipsRefresh', true));
      view.focus();
      return true;
    }
    const kind = String(p.kind);
    if (!(CHIP_KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${CHIP_KINDS.join(', ')}.`);
    const keys = Object.keys(p).filter((k) => k !== 'kind' && p[k] !== undefined);
    if (!keys.length) { await chipDialog(ed, kind, null); return true; }
    let attrs: Partial<ChipAttrs>;
    if (kind === 'date') {
      const date = p.date === undefined || p.date === 'today' ? isoDate(new Date()) : String(p.date);
      if (!parseIsoDate(date)) throw new Error('date must be YYYY-MM-DD or today.');
      attrs = { kind, date, format: String(p.format ?? 'short') };
    } else if (kind === 'person') attrs = { kind, name: String(p.name ?? ''), email: String(p.email ?? '') };
    else if (kind === 'dropdown') {
      const preset = DROPDOWN_PRESETS.find((x) => x.id === String(p.preset ?? p.options));
      const options = preset ? preset.options : String(p.options ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((label, i) => ({ label, color: CHIP_COLORS[i % CHIP_COLORS.length] }));
      if (!options.length) throw new Error('options needs labels separated by commas, or a preset.');
      attrs = { kind, options, value: String(p.value ?? options[0].label) };
    } else {
      await loadDocs();
      const id = String(p.doc ?? '');
      const hit = knownDocs().find((x) => x.id === id);
      if (!hit) throw new Error('doc must be the id of a document in your library (see file.list).');
      attrs = { kind, doc: hit.id, title: hit.title };
    }
    return ed.run((state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(chipNode(attrs), false).insertText(' ').scrollIntoView()); return true; });
  }, [{ name: 'kind', type: 'string', description: CHIP_KINDS.join(', ') }, { name: 'date', type: 'string', description: 'YYYY-MM-DD or today' }, { name: 'format', type: 'string', description: DATE_FORMATS.join(', ') }, { name: 'name', type: 'string', description: 'Person name' }, { name: 'email', type: 'string', description: 'Person email' }, { name: 'options', type: 'string', description: 'Comma-separated options or a preset id' }, { name: 'value', type: 'string', description: 'Chosen option' }, { name: 'doc', type: 'string', description: 'Document id' }]);
  const needChip = (): { node: PMNode; pos: number } => {
    const c = ed.view ? selectedChip(ed.view.state) : null;
    if (!c) throw new Error('Select a smart chip first (click it, or run chip.select).');
    return c;
  };
  add('chip.edit', 'Edit smart chip', 'Chip', 'Open the dialog for the selected chip.', async () => { const c = needChip(); await chipDialog(ed, String(c.node.attrs.kind), c); return true; });
  add('chip.info', 'Chip at cursor', 'Chip', 'Kind, data and shown text of the selected chip.', () => { const c = ed.view ? selectedChip(ed.view.state) : null; return c ? { ...cleanChip(c.node.attrs), text: chipLabel(c.node.attrs), pos: c.pos } : null; });
  add('chip.set', 'Set chip value', 'Chip', 'Change the selected chip: value for a dropdown, date and format for a date, name and email for a person.', (p) => {
    const c = needChip();
    const next = cleanChip({ ...(c.node.attrs as ChipAttrs), ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined && k !== 'kind' && k !== 'options')) });
    if (!next) throw new Error('That value does not fit this chip.');
    if (c.node.attrs.kind === 'dropdown' && p.value !== undefined && next.value !== String(p.value)) throw new Error(`value must be one of ${(c.node.attrs.options as ChipOption[]).map((o) => o.label).join(', ')}.`);
    return ed.run((state, dispatch) => { if (dispatch) dispatch(state.tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, ...next })); return true; });
  }, [{ name: 'value', type: 'string', description: 'Dropdown option' }, { name: 'date', type: 'string', description: 'YYYY-MM-DD' }, { name: 'format', type: 'string', description: DATE_FORMATS.join(', ') }, { name: 'name', type: 'string', description: 'Person name' }, { name: 'email', type: 'string', description: 'Person email' }]);
  add('chip.select', 'Select chip', 'Chip', 'Select the first smart chip, or the next one after the selection.', () => {
    if (!ed.view) throw new Error('Open a document first.');
    const { state } = ed.view;
    const all: number[] = [];
    state.doc.descendants((n, pos) => { if (n.type === schema.nodes.chip) all.push(pos); return true; });
    if (!all.length) throw new Error('The document has no smart chips.');
    const at = all.find((pos) => pos > state.selection.from) ?? all[0];
    ed.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return at;
  });
  add('chips.list', 'List smart chips', 'Chip', 'Every smart chip with its kind, text and position.', () => {
    const out: Array<Record<string, unknown>> = [];
    ed.view?.state.doc.descendants((n, pos) => { if (n.type === schema.nodes.chip) out.push({ pos, ...cleanChip(n.attrs), text: chipLabel(n.attrs) }); return true; });
    return out;
  });
  add('insert.formula', 'Formula', 'Insert', 'Insert a formula field, such as =SUM(ABOVE) in a table cell; with no code, opens the formula dialog.', async (p) => {
    if (p.code === undefined) { formulaDialog(ed); return true; }
    const src = String(p.code).trim();
    if (!src || src === '=') throw new Error('code needs a formula, such as =SUM(ABOVE).');
    const attrs = { kind: 'formula', code: src.startsWith('=') ? src : `=${src}`, format: String(p.format ?? ''), result: '', error: '' };
    const ok = ed.run((state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.field.create(attrs), false).scrollIntoView()); return true; });
    if (ed.view) await updateFields(ed.view);
    return ok;
  }, [{ name: 'code', type: 'string', description: 'Formula such as =SUM(ABOVE) or =B2*C2' }, { name: 'format', type: 'string', description: 'Number format such as #,##0.00, $#,##0.00 or 0%' }]);
  add('fields.update', 'Update fields', 'Fields', 'Recalculate every formula in the document (F9).', async () => (ed.view ? { updated: await updateFields(ed.view) } : null), [], ['F9']);
  add('field.edit', 'Edit formula', 'Fields', 'Edit the selected formula field (or double-click it).', () => { formulaDialog(ed); return true; });
  add('field.info', 'Field at cursor', 'Fields', 'Code, format and result of the selected formula field.', () => { const f = ed.view ? selectedField(ed.view.state) : null; return f ? { ...f.node.attrs, pos: f.pos } : null; });
  add('fields.list', 'List fields', 'Fields', 'Every formula field with its code, result and table cell.', () => (ed.view ? formulaSites(ed.view.state.doc).map((s) => ({ pos: s.pos, code: s.node.attrs.code, format: s.node.attrs.format, result: s.node.attrs.result, error: s.node.attrs.error, row: s.item.row, col: s.item.col })) : []));
  ed.root.addEventListener('dblclick', (e) => {
    const span = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-docfield');
    if (!span || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    const pos = ed.view.posAtDOM(span, 0);
    const at = ed.view.state.doc.resolve(pos).nodeAfter?.type === schema.nodes.field ? pos : pos - 1;
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, at)));
    if (span.dataset.kind === 'variable') variablesDialog(ed); else formulaDialog(ed);
  });
  add('variables.set', 'Set document variable', 'Fields', 'Create or change a document variable; every place it is used updates. With no name, opens the variables dialog.', (p) => {
    if (p.name === undefined) { variablesDialog(ed); return true; }
    const name = String(p.name).trim();
    if (!/^[\p{L}\p{N}_ .-]{1,40}$/u.test(name)) throw new Error('name takes letters, digits, spaces, dots, dashes or underscores (up to 40).');
    ed.setVariables({ ...ed.variables(), [name]: String(p.value ?? '') });
    return { [name]: String(p.value ?? '') };
  }, [{ name: 'name', type: 'string', description: 'Variable name' }, { name: 'value', type: 'string', description: 'Value' }]);
  add('variables.delete', 'Delete document variable', 'Fields', 'Delete a variable; places that use it show !name until it is set again.', (p) => {
    const vars = ed.variables();
    const name = String(p.name ?? '');
    if (!(name in vars)) throw new Error(`No variable is named ${name}.`);
    delete vars[name];
    ed.setVariables(vars);
    return true;
  }, [{ name: 'name', type: 'string', description: 'Variable name' }]);
  add('variables.list', 'List document variables', 'Fields', 'Every document variable and its value.', () => ed.variables());
  add('insert.variable', 'Variable', 'Insert', 'Insert a document variable at the cursor; with no name, opens the variables dialog.', (p) => {
    if (p.name === undefined) { variablesDialog(ed); return true; }
    const name = String(p.name);
    const vars = ed.variables();
    if (p.value !== undefined) { vars[name] = String(p.value); ed.setVariables(vars); }
    if (!(name in vars)) throw new Error(`No variable is named ${name}. Pass value to create it.`);
    return ed.run(insertVariable(name, vars[name]));
  }, [{ name: 'name', type: 'string', description: 'Variable name' }, { name: 'value', type: 'string', description: 'Create or change it with this value' }]);
  add('insert.placeholder', 'Placeholder', 'Insert', 'Insert a placeholder chip that someone fills in later; with no name, opens a dialog.', async (p) => {
    if (p.name === undefined) { await chipDialog(ed, 'placeholder', null); return true; }
    const name = String(p.name).trim();
    if (!name) throw new Error('name cannot be empty.');
    return ed.run((state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(chipNode({ kind: 'placeholder', name }), false).scrollIntoView()); return true; });
  }, [{ name: 'name', type: 'string', description: 'What to fill in, such as Client name' }]);
  add('placeholders.list', 'List placeholders', 'Fields', 'The names of the placeholders in the document.', () => (ed.view ? placeholderNames(ed.view.state.doc) : []));
  add('placeholders.fill', 'Fill in placeholders', 'Fields', 'Replace every placeholder with a name by text; with no name, opens a dialog with a box per placeholder.', (p) => {
    if (p.name === undefined) { placeholderFillDialog(ed); return true; }
    const done = ed.run((state, dispatch) => { const tr = fillPlaceholders(state, { [String(p.name)]: String(p.value ?? '') }); if (tr && dispatch) dispatch(tr); return !!tr; });
    if (!done) throw new Error(`No placeholder is named ${String(p.name)}.`);
    return true;
  }, [{ name: 'name', type: 'string', description: 'Placeholder name' }, { name: 'value', type: 'string', description: 'Text to put in its place (empty removes it)' }]);
  add('insert.block', 'Building block', 'Insert', 'Insert a building block (meeting-notes, email-draft, project-tracker, decision-record, or a saved block id); with no id, opens the gallery.', async (p) => {
    if (p.id === undefined) { await buildingBlocksDialog(ed); return true; }
    const all = await allBlocks(ed.bodyWidth());
    const b = all.find((x) => x.id === String(p.id) || x.name.toLowerCase() === String(p.id).toLowerCase());
    if (!b) throw new Error(`No building block is called ${String(p.id)}. Ids: ${all.map((x) => x.id).join(', ')}.`);
    return ed.run(insertBlock(b));
  }, [{ name: 'id', type: 'string', description: 'Building block id or name' }]);
  add('blocks.list', 'List building blocks', 'Insert', 'Built-in and saved building blocks.', async () => (await allBlocks(ed.bodyWidth())).map((b) => ({ id: b.id, name: b.name, category: b.category, builtIn: !!b.builtIn })));
  add('blocks.save', 'Save as building block', 'Insert', 'Save the selected content as a building block for any document; with no name, opens a dialog.', async (p) => {
    if (!ed.view) throw new Error('Open a document first.');
    if (p.name === undefined) { saveBlockDialog(ed); return true; }
    const b = await saveBlock(ed.view.state, String(p.name), p.category === undefined ? 'Saved' : String(p.category));
    return { id: b.id, name: b.name };
  }, [{ name: 'name', type: 'string', description: 'Name' }, { name: 'category', type: 'string', description: 'Category, Saved by default' }]);
  add('blocks.delete', 'Delete building block', 'Insert', 'Delete a saved building block by id.', async (p) => { await deleteBlock(String(p.id ?? '')); return true; }, [{ name: 'id', type: 'string', description: 'Saved block id' }]);
  const layoutOf = (v: unknown): string => {
    const id = String(v ?? '');
    if (!DIAGRAM_LAYOUTS.some((l) => l.id === id)) throw new Error(`layout must be one of ${DIAGRAM_LAYOUTS.map((l) => l.id).join(', ')}.`);
    return id;
  };
  const needDiagram = (patch: (a: Record<string, unknown>, p: Record<string, unknown>) => Record<string, unknown>) => (p: Record<string, unknown>) => {
    const g = ed.view ? selectedDiagram(ed.view.state) : null;
    if (!g) throw new Error('Select a diagram first (click it, or run diagram.select).');
    return ed.run(setDiagram(patch(g.node.attrs as Record<string, unknown>, p)));
  };
  add('insert.diagram', 'Diagram', 'Insert', `Insert a SmartArt-style diagram; with no layout, opens the diagram editor. Layouts: ${DIAGRAM_LAYOUTS.map((l) => l.id).join(', ')}.`, (p) => {
    if (p.layout === undefined) { diagramDialog(ed, true); return true; }
    const layout = layoutOf(p.layout);
    const items = p.text !== undefined ? textToItems(String(p.text).replace(/\\n/g, '\n').replace(/\\t/g, '\t')) : sampleItems(layout);
    if (!items.length) throw new Error('text needs at least one item.');
    return ed.run(insertDiagram({ layout, items, width: Math.min(Number(p.width) || 468, ed.bodyWidth()), height: Number(p.height) || 216 }));
  }, [{ name: 'layout', type: 'string', description: 'Layout id' }, { name: 'text', type: 'string', description: 'One item per line (\\n); two spaces indent a sub-item' }, { name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('diagram.properties', 'Diagram editor', 'Diagram', 'Layout, text, style, colours and size of the selected diagram (or double-click it).', () => { diagramDialog(ed, false); return true; });
  add('diagram.layout', 'Diagram layout', 'Diagram', 'Change the layout and keep the text.', needDiagram((_a, p) => ({ layout: layoutOf(p.layout) })), [{ name: 'layout', type: 'string', description: 'Layout id' }]);
  add('diagram.text', 'Diagram text', 'Diagram', 'Replace the items: one per line, two spaces indent a sub-item.', needDiagram((_a, p) => {
    const items = textToItems(String(p.text ?? '').replace(/\\n/g, '\n').replace(/\\t/g, '\t'));
    if (!items.length) throw new Error('text needs at least one item.');
    return { items };
  }), [{ name: 'text', type: 'string', description: 'Items; \\n between lines' }]);
  add('diagram.style', 'Diagram style', 'Diagram', `Style (${DIAGRAM_STYLES.join(', ')}) and colours (${DIAGRAM_COLORS.join(', ')}).`, needDiagram((a, p) => {
    if (p.style !== undefined && !(DIAGRAM_STYLES as readonly string[]).includes(String(p.style))) throw new Error(`style must be one of ${DIAGRAM_STYLES.join(', ')}.`);
    if (p.colors !== undefined && !(DIAGRAM_COLORS as readonly string[]).includes(String(p.colors))) throw new Error(`colors must be one of ${DIAGRAM_COLORS.join(', ')}.`);
    return { style: p.style ?? a.style, colors: p.colors ?? a.colors };
  }), [{ name: 'style', type: 'string', description: DIAGRAM_STYLES.join(', ') }, { name: 'colors', type: 'string', description: DIAGRAM_COLORS.join(', ') }]);
  add('diagram.size', 'Diagram size', 'Diagram', 'Width and height in points.', needDiagram((a, p) => ({ width: Math.max(120, Math.min(ed.bodyWidth(), Number(p.width) || Number(a.width))), height: Math.max(72, Number(p.height) || Number(a.height)) })), [{ name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points' }]);
  add('diagram.info', 'Diagram at cursor', 'Diagram', 'Layout, items, style and size of the selected diagram.', () => { const g = ed.view ? selectedDiagram(ed.view.state) : null; return g ? { ...g.node.attrs, text: itemsToText(g.node.attrs.items as DiagramItem[]), pos: g.pos } : null; });
  add('diagram.select', 'Select diagram', 'Diagram', 'Select the first diagram, or the next one after the selection.', () => {
    if (!ed.view) throw new Error('Open a document first.');
    const { state } = ed.view;
    const all: number[] = [];
    state.doc.descendants((n, pos) => { if (n.type === schema.nodes.diagram) all.push(pos); return true; });
    if (!all.length) throw new Error('The document has no diagrams.');
    const at = all.find((pos) => pos > state.selection.from) ?? all[0];
    ed.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
    return at;
  });
  ed.root.addEventListener('dblclick', (e) => {
    const fig = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root figure.ft-diagram');
    if (!fig || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    const pos = ed.view.posAtDOM(fig, 0);
    const at = ed.view.state.doc.resolve(pos).nodeAfter?.type === schema.nodes.diagram ? pos : pos - 1;
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, at)));
    diagramDialog(ed, false);
  });
  add('insert.icon', 'Icon', 'Insert', 'Insert an icon from the Tabler library (4,808 outline and 1,009 filled); with no name, opens the icon picker.', async (p) => {
    if (p.name === undefined) { iconsDialog(ed); return true; }
    const entry = await findIcon(String(p.name));
    if (!entry) throw new Error(`No icon is named ${String(p.name)}. Open the picker to search.`);
    return ed.run(insertShape(iconAttrs(entry, p.style === 'filled', color(p.color) || '#1a1a1a', Math.max(8, Number(p.size) || 36))));
  }, [{ name: 'name', type: 'string', description: 'Icon name such as chart-bar or phone' }, { name: 'style', type: 'string', description: 'outline or filled' }, { name: 'color', type: 'string', description: '#rrggbb' }, { name: 'size', type: 'number', description: 'Points' }]);
  add('view.draw', 'Draw', 'View', 'Turn ink drawing on or off: drag on the page to draw, Esc stops. Each stroke becomes a drawing in front of the text.', (p) => {
    if (p.color !== undefined) ed.ink.color = color(p.color) || ed.ink.color;
    if (p.width !== undefined) ed.ink.width = Math.max(0.5, Math.min(24, Number(p.width) || 2));
    return ed.ink.toggle(p.on === undefined ? !ed.ink.on : !!p.on);
  }, [{ name: 'on', type: 'boolean', description: 'On or off; empty toggles' }, { name: 'color', type: 'string', description: 'Pen colour #rrggbb' }, { name: 'width', type: 'number', description: 'Pen width in points' }]);
  add('shape.effects', 'Shape effects', 'Shape', 'A soft shadow, and a gradient from the fill to a second colour.', needShape((a, p) => ({ shadow: p.shadow === undefined ? a.shadow : !!p.shadow, gradient: p.gradient === undefined ? a.gradient : color(p.gradient) })), [{ name: 'shadow', type: 'boolean', description: 'Soft shadow' }, { name: 'gradient', type: 'string', description: 'Second colour #rrggbb; empty removes it' }]);
  add('picture.style', 'Picture style', 'Picture', 'Border colour and width, rounded corners and a soft shadow.', needPic((a, p) => {
    const width = p.borderWidth === undefined ? Number(a.borderWidth) || 0 : Math.max(0, Number(p.borderWidth) || 0);
    const border = p.border === undefined ? String(a.border || '') : color(p.border);
    return { border: width ? border || '#1a1a1a' : '', borderWidth: width, radius: p.radius === undefined ? a.radius : Math.max(0, Number(p.radius) || 0), shadow: p.shadow === undefined ? a.shadow : !!p.shadow };
  }), [{ name: 'border', type: 'string', description: '#rrggbb' }, { name: 'borderWidth', type: 'number', description: 'Points; 0 removes the border' }, { name: 'radius', type: 'number', description: 'Corner radius in points' }, { name: 'shadow', type: 'boolean', description: 'Soft shadow' }]);
  ed.root.addEventListener('dblclick', (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root .ft-math');
    if (!m || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    const pos = ed.view.posAtDOM(m, 0);
    const $p = ed.view.state.doc.resolve(pos);
    const at = $p.nodeAfter?.type === schema.nodes.math ? pos : pos - 1;
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, at)));
    equationDialog(ed);
  });

  ed.root.addEventListener('dblclick', (e) => {
    const fig = (e.target as HTMLElement).closest<HTMLElement>('.ft-pm-root figure.ft-chart');
    if (!fig || !ed.view || !ed.view.editable) return;
    e.preventDefault();
    const pos = ed.view.posAtDOM(fig, 0);
    const $p = ed.view.state.doc.resolve(pos);
    const at = $p.nodeAfter?.type === schema.nodes.chart ? pos : pos - 1;
    ed.view.dispatch(ed.view.state.tr.setSelection(NodeSelection.create(ed.view.state.doc, at)));
    chartDialog(ed, false);
  });

  const menu = el<HTMLElement>('<div class="ft-menu" role="menu" aria-label="Table" hidden></div>');
  document.getElementById('overlay-root')?.appendChild(menu);
  const closeMenu = (): void => { if (!menu.hidden) setHidden(menu, true); };
  const TABLE_MENU: Array<[string, string] | null> = [['table.rowAbove', 'Insert row above'], ['table.rowBelow', 'Insert row below'], ['table.colLeft', 'Insert column left'], ['table.colRight', 'Insert column right'], null,
    ['table.deleteRow', 'Delete row'], ['table.deleteColumn', 'Delete column'], ['table.delete', 'Delete table'], null,
    ['table.merge', 'Merge cells'], ['table.split', 'Split cell'], ['table.headerRow', 'Header row on or off'], null, ['table.borders', 'Borders...'], ['insert.formula', 'Formula...'], ['fields.update', 'Update fields'], null, ['table.properties', 'Table properties']];
  for (const row of TABLE_MENU) {
    if (!row) { menu.appendChild(el('<div class="ft-menu-sep" role="separator"></div>')); continue; }
    const b = el<HTMLButtonElement>(`<button class="ft-menu-item" role="menuitem" type="button" data-cmd-menu="${row[0]}"></button>`);
    setText(b, row[1]);
    menu.appendChild(b);
  }
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd-menu]')?.dataset.cmdMenu;
    if (!id) return;
    closeMenu();
    void reg.run(id).catch((err: Error) => toast(err.message, 'error'));
  });
  ed.root.addEventListener('contextmenu', (e) => {
    const cell = (e.target as HTMLElement).closest('.ft-pm-root td, .ft-pm-root th');
    if (!cell || !ed.view) return;
    e.preventDefault();
    const sel = ed.view.state.selection;
    const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (pos && !(sel instanceof CellSelection && sel.ranges.length > 1)) ed.view.dispatch(ed.view.state.tr.setSelection(TextSelection.near(ed.view.state.doc.resolve(pos.pos))));
    ed.view.focus();
    menu.style.visibility = 'hidden';
    setHidden(menu, false);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = `${Math.round(Math.max(4, Math.min(e.clientX, window.innerWidth - w - 4)))}px`;
    menu.style.top = `${Math.round(Math.max(4, Math.min(e.clientY, window.innerHeight - h - 4)))}px`;
    menu.style.visibility = '';
  });
  document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target as Node)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  ed.root.querySelector('.ft-scroll')?.addEventListener('scroll', closeMenu, { passive: true });

  ed.root.addEventListener('dblclick', (e) => {
    const part = (e.target as HTMLElement).closest<HTMLElement>('.ft-sheet-header, .ft-sheet-footer');
    if (!part || part.isContentEditable) return;
    const sheet = part.closest<HTMLElement>('.ft-sheet');
    const sid = sheet?.dataset.section ?? ed.currentSectionId();
    const where = part.dataset.part === 'footers' ? 'footers' : 'headers';
    const which = part.dataset.which ?? 'default';
    const s = ed.sectionById(sid);
    const current = ((s[where] as Record<string, { text: string; align: string }>)?.[which]) ?? { text: '', align: where === 'footers' ? 'center' : 'left' };
    part.textContent = current.text;
    part.setAttribute('contenteditable', 'plaintext-only');
    part.focus();
    const sel = window.getSelection();
    sel?.selectAllChildren(part);
    sel?.collapseToEnd();
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      part.removeAttribute('contenteditable');
      part.removeEventListener('keydown', keys);
      if (save) {
        const text = (part.textContent ?? '').replace(/\n+$/, '');
        const fresh = ed.sectionById(sid);
        ed.updateSectionById(sid, { [where]: { ...(fresh[where] as Record<string, unknown>), [which]: { text, align: current.align || (where === 'footers' ? 'center' : 'left') } } } as Partial<Section>);
      } else {
        ed.paginator.layoutNow();
      }
      ed.view?.focus();
    };
    const keys = (ev: KeyboardEvent): void => {
      ev.stopPropagation();
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    };
    part.addEventListener('keydown', keys);
    part.addEventListener('blur', () => finish(true), { once: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (ed.viewMode === 'focus' || ed.viewMode === 'read') && !document.querySelector('.ft-scrim:not([hidden])')) ed.setView('print');
  });

  add('tools.pageCount', 'Page count', 'Tools', 'Return the number of pages laid out for the current tab.', () => ed.pageCount());

  add('styles.list', 'List styles', 'Format', 'List the paragraph styles in this document.', () => Object.entries(ed.styles()).map(([id, s]) => ({ id, name: s.name, basedOn: s.basedOn, next: s.next })));
  add('tools.wordCount', 'Word count', 'Tools', 'Show words, characters and paragraphs in the current tab.', () => { wordCountDialog(ed); return ed.stats(); }, [], ['Ctrl+Shift+G']);
  add('tools.stats', 'Document statistics', 'Tools', 'Return words, characters and paragraphs of the current tab without opening a dialog.', () => ed.stats());

  add('tabs.list', 'List tabs', 'Tabs', 'List the document tabs.', () => ed.tabs().map((t) => ({ id: t.id, title: t.title, active: t.id === ed.activeTab })));
  add('tabs.add', 'Add tab', 'Tabs', 'Add a document tab and switch to it.', (p) => ed.addTab(String(p.title ?? '')));
  add('tabs.select', 'Go to tab', 'Tabs', 'Switch to a document tab by id or title.', (p) => {
    const want = String(p.id ?? p.title ?? '');
    const t = ed.tabs().find((x) => x.id === want || x.title === want);
    if (!t) throw new Error(`No tab matches ${want}. List them with tabs.list.`);
    return ed.selectTab(t.id);
  }, [{ name: 'id', type: 'string', description: 'Tab id or title' }]);
  add('tabs.rename', 'Rename tab', 'Tabs', 'Rename a document tab.', (p) => ed.renameTab(String(p.id ?? ed.activeTab), String(p.title ?? '')), [{ name: 'id', type: 'string', description: 'Tab id; defaults to the current tab' }, { name: 'title', type: 'string', description: 'New name' }]);
  add('tabs.delete', 'Delete tab', 'Tabs', 'Delete a document tab; a document keeps at least one.', (p) => ed.deleteTab(String(p.id ?? ed.activeTab)), [{ name: 'id', type: 'string', description: 'Tab id; defaults to the current tab' }]);

  const bar = ed.root.querySelector('.ft-toolbar') as HTMLElement;
  bar.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.ft-tb-btn')) e.preventDefault(); });
  const param: Record<string, string> = { 'view.zoom': 'percent', 'paragraph.style': 'style', 'format.font': 'family', 'format.size': 'pt', 'format.color': 'value', 'format.highlight': 'value', 'paragraph.lineSpacing': 'value' };
  bar.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement | HTMLInputElement;
    const id = t.dataset.cmd;
    if (id && param[id]) void reg.run(id, { [param[id]]: t.value });
  });
}
