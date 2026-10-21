import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { toast } from '../../ui/toast';
import { PrintDialog } from './print/dialog';
import { buildJob, defaultOptions } from './print/job';
import { exportPdf, openPdf } from './print/pdf';
import type { PrintOptions } from './print/ranges';
import { cleanupPrint, mountPrintRoot, printing, runPrint } from './print/run';
import { addMenuItems } from './ui';

export function register(reg: CommandRegistry, ed: DocEditor): void {
  let dialog: PrintDialog | null = null;

  const print = async (opts: PrintOptions): Promise<{ pages: number; sheets: number }> => {
    const info = buildJob(ed, opts);
    await runPrint(info.job);
    return { pages: info.pages, sheets: info.sheets };
  };

  reg.register({
    id: 'print.open',
    label: 'Print',
    group: 'File',
    description: 'Open the print window with a live preview of the pages, a page range, copies and one or two sides.',
    keys: ['Ctrl+P'],
    run: () => {
      if (!ed.view) throw new Error('Open a document first.');
      dialog ??= new PrintDialog(ed, async (opts) => { try { await print(opts); } catch (e) { toast((e as Error).message, 'error'); } });
      dialog.open();
      return true;
    },
  });

  reg.register({
    id: 'print.run',
    label: 'Print without the preview',
    group: 'File',
    description: 'Send pages straight to the browser print window. Range is all, current, selection or custom (with pages such as 1-3, 5).',
    params: [
      { name: 'range', type: 'string', description: 'all, current, selection or custom' },
      { name: 'pages', type: 'string', description: 'Pages for a custom range, such as 1-3, 5' },
      { name: 'copies', type: 'number', description: 'Number of copies, 1 to 99' },
      { name: 'collate', type: 'boolean', description: 'Keep each copy together' },
      { name: 'sides', type: 'string', description: 'one or two' },
    ],
    run: (p) => {
      const base = defaultOptions();
      const range = String(p.range ?? base.range);
      const opts: PrintOptions = {
        range: (['all', 'current', 'selection', 'custom'].includes(range) ? range : 'all') as PrintOptions['range'],
        pages: String(p.pages ?? ''),
        copies: Number(p.copies ?? 1),
        collate: p.collate === undefined ? true : p.collate === true || p.collate === 'true',
        sides: String(p.sides ?? 'one') === 'two' ? 'two' : 'one',
      };
      if (opts.range === 'custom' && !opts.pages) throw new Error('Give the pages to print, such as 1-3, 5.');
      return print(opts);
    },
  });

  reg.register({
    id: 'print.exportPdf',
    label: 'Export to PDF',
    group: 'File',
    description: 'Save the document as a tagged PDF with its title, language, headings as bookmarks, links, headers and footers.',
    params: [
      { name: 'tagged', type: 'boolean', description: 'Write structure tags for accessibility (default true)' },
      { name: 'id', type: 'string', description: 'Export a saved document by id instead of the open one' },
    ],
    run: (p) => exportPdf(ed, p.tagged === undefined ? true : p.tagged === true || p.tagged === 'true', String(p.id ?? '')),
  });

  reg.register({
    id: 'print.openPdf',
    label: 'Open a PDF',
    group: 'File',
    description: 'Turn a PDF into a new editable document: paragraphs, headings, lists, tables and pictures.',
    params: [{ name: 'path', type: 'string', description: 'Path of a PDF on this computer; leave empty to choose a file' }],
    run: (p) => openPdf(String(p.path ?? '')),
  });

  addMenuItems('File', [
    { cmd: 'print.open', label: 'Print', keys: 'Ctrl+P' },
    { cmd: 'print.exportPdf', label: 'Export to PDF' },
    { cmd: 'print.openPdf', label: 'Open a PDF' },
  ]);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p' && ed.view && !ed.root.hidden) {
      e.preventDefault();
      e.stopPropagation();
      void reg.run('print.open').catch((err: Error) => toast(err.message, 'error'));
    }
  }, true);

  window.addEventListener('beforeprint', () => {
    if (printing() || !ed.view) return;
    try {
      const info = buildJob(ed, defaultOptions());
      mountPrintRoot(info.job, true);
    } catch { void 0; }
  });
  window.addEventListener('afterprint', () => {
    if (document.querySelector('.ft-print-root[data-auto]')) cleanupPrint();
  });
}
