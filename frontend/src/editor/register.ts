import type { CommandRegistry } from '../engine/registry';
import { paragraphDialog, parseTabs, stylesDialog, wordCountDialog } from './dialogs';
import { type DocEditor, FONTS } from './editor';

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
  add('paragraph.indent', 'Increase indent', 'Paragraph', 'Indent the paragraph, or move a list item one level deeper.', () => ed.indent(1), [], ['Tab']);
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
  const param: Record<string, string> = { 'paragraph.style': 'style', 'format.font': 'family', 'format.size': 'pt', 'format.color': 'value', 'format.highlight': 'value', 'paragraph.lineSpacing': 'value' };
  bar.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement | HTMLInputElement;
    const id = t.dataset.cmd;
    if (id && param[id]) void reg.run(id, { [param[id]]: t.value });
  });
}
