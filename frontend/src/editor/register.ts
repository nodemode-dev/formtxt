import type { CommandRegistry } from '../engine/registry';
import type { Section } from '../engine/model';
import { type Command, TextSelection } from 'prosemirror-state';
import { CellSelection, addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, mergeCells, setCellAttr, splitCell, toggleHeaderColumn, toggleHeaderRow } from 'prosemirror-tables';
import { el, setHidden, setText } from '../ui/dom';
import { toast } from '../ui/toast';
import { headerFooterDialog, insertTableDialog, pageGeometry, pageSetupDialog, paragraphDialog, parseTabs, stylesDialog, tablePropertiesDialog, wordCountDialog } from './dialogs';
import { type DocEditor, FONTS } from './editor';
import { TABLE_LOOKS, schema } from './schema';
import { distributeColumns, insertTable, setCellShading, setTableAttr, sortTable, tableInfo, tableToText, textToTable } from './table';

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
  add('list.check', 'Checklist', 'Paragraph', 'Turn the selected paragraphs into a checklist, or back.', () => ed.list('check'), [], ['Ctrl+Shift+9']);

  add('insert.link', 'Link', 'Insert', 'Link the selection to an address; with no address, asks for one.', (p) => (p.href !== undefined ? ed.link(String(p.href) || null) : (ed.promptLink(), true)), [{ name: 'href', type: 'string', description: 'Address; empty removes the link' }], ['Ctrl+K']);
  add('insert.codeBlock', 'Code block', 'Insert', 'Turn the paragraph into a code block, or back.', () => ed.codeBlock());
  add('insert.pageBreak', 'Page break', 'Insert', 'Insert a page break.', () => ed.pageBreak(), [], ['Ctrl+Enter']);
  add('view.outline', 'Outline', 'View', 'Show or hide the outline of headings.', () => ed.toggleOutline());
  add('view.collapseHeading', 'Collapse or expand heading', 'View', 'Fold or unfold the content under the heading at the cursor (or click left of a heading).', () => ed.collapse());

  add('format.painter', 'Format Painter', 'Format', 'Copy the formatting at the cursor; the next selection receives it.', () => ed.togglePainter(), [], ['Ctrl+Shift+C']);
  add('format.paragraph', 'Paragraph settings', 'Format', 'Indents, spacing, line spacing, borders, shading, tab stops and pagination options for the selected paragraphs.', () => { paragraphDialog(ed); return true; });
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

  const menu = el<HTMLElement>('<div class="ft-menu" role="menu" aria-label="Table" hidden></div>');
  document.getElementById('overlay-root')?.appendChild(menu);
  const closeMenu = (): void => { if (!menu.hidden) setHidden(menu, true); };
  const TABLE_MENU: Array<[string, string] | null> = [['table.rowAbove', 'Insert row above'], ['table.rowBelow', 'Insert row below'], ['table.colLeft', 'Insert column left'], ['table.colRight', 'Insert column right'], null,
    ['table.deleteRow', 'Delete row'], ['table.deleteColumn', 'Delete column'], ['table.delete', 'Delete table'], null,
    ['table.merge', 'Merge cells'], ['table.split', 'Split cell'], ['table.headerRow', 'Header row on or off'], null, ['table.properties', 'Table properties']];
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
