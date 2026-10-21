import type { CommandRegistry } from '../engine/registry';
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

  const bar = ed.root.querySelector('.ft-toolbar') as HTMLElement;
  bar.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.ft-tb-btn')) e.preventDefault(); });
  const param: Record<string, string> = { 'paragraph.style': 'style', 'format.font': 'family', 'format.size': 'pt', 'format.color': 'value', 'format.highlight': 'value', 'paragraph.lineSpacing': 'value' };
  bar.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement | HTMLInputElement;
    const id = t.dataset.cmd;
    if (id && param[id]) void reg.run(id, { [param[id]]: t.value });
  });
}
