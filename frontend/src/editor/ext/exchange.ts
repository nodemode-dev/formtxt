import type { CommandRegistry } from '../../engine/registry';
import { commands } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { toast } from '../../ui/toast';
import { clearCompat, isCompat, mountBadge, paintBadge } from './exchange/compat';
import { FORMATS, fetchExport, pickFiles, saveBlob, sendFiles } from './exchange/transfer';
import { onDocumentLoaded } from './plugins';
import { addMenuItems } from './ui';

export function register(reg: CommandRegistry, ed: DocEditor): void {
  reg.register({
    id: 'exchange.download',
    label: 'Download as',
    group: 'File',
    description: 'Save the open document as a file: docx, dotx, odt, rtf, txt, html, md or epub. Pass an id to export a saved document instead.',
    params: [
      { name: 'format', type: 'string', description: 'docx, dotx, odt, rtf, txt, html, md or epub' },
      { name: 'id', type: 'string', description: 'Export a saved document by id instead of the open one' },
    ],
    run: async (p) => {
      const format = String(p.format ?? 'docx').toLowerCase();
      if (!FORMATS.some((f) => f.id === format)) throw new Error(`Pick one of ${FORMATS.map((f) => f.id).join(', ')}.`);
      const id = String(p.id ?? '') || ed.docId();
      if (!id) throw new Error('Open a document first.');
      const live = p.id ? undefined : ed.current();
      const { blob, name } = await fetchExport(id, format, live ?? undefined);
      saveBlob(blob, name);
      return { name, bytes: blob.size };
    },
  });

  reg.register({
    id: 'exchange.open',
    label: 'Open or import file',
    group: 'File',
    description: 'Pick a file from this computer (docx, dotx, odt, rtf, html, doc, md, txt) and open it as a new document.',
    run: async () => {
      const files = await pickFiles();
      if (!files.length) return false;
      const out = await sendFiles(files);
      for (const e of out.errors) toast(e, 'error');
      if (out.documents.length === 1) await commands.run('file.open', { id: out.documents[0].id });
      else if (out.documents.length > 1) toast(`Added ${out.documents.length} documents to your library.`);
      return out.documents.map((d) => ({ id: d.id, title: d.title }));
    },
  });

  reg.register({
    id: 'exchange.convertCompat',
    label: 'Convert to the current format',
    group: 'File',
    description: 'Leave Compatibility Mode: keep the document as a regular FormTxt document.',
    run: () => {
      if (!isCompat(ed)) return false;
      clearCompat(ed);
      paintBadge(ed);
      toast('Converted to the current format.');
      return true;
    },
  });

  addMenuItems('File', [{ cmd: 'exchange.open', label: 'Open or import file' }]);
  addMenuItems('File', FORMATS.map((f) => ({ cmd: 'exchange.download', label: `Download as ${f.label} (${f.ext})`, params: { format: f.id } })));
  addMenuItems('File', [{ cmd: 'exchange.convertCompat', label: 'Convert to the current format' }], false);

  mountBadge(() => { void commands.run('exchange.convertCompat').catch((e: Error) => toast(e.message, 'error')); });
  onDocumentLoaded(() => {
    mountBadge(() => { void commands.run('exchange.convertCompat').catch((e: Error) => toast(e.message, 'error')); });
    paintBadge(ed);
  });
}
