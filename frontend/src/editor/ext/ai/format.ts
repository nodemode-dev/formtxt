import { api } from '../../../io/api';
import type { DocSummary, FtxtDocument, Section } from '../../../engine/model';
import type { DocEditor } from '../../editor';

export async function libraryDocs(skip = ''): Promise<DocSummary[]> {
  const out = await api.get<{ documents: DocSummary[] }>('/documents');
  return out.documents.filter((d) => d.id !== skip);
}

export async function matchFormat(ed: DocEditor, fromId: string, parts: { styles: boolean; page: boolean }): Promise<string> {
  if (!ed.doc) throw new Error('Open a document first.');
  if (!fromId || fromId === ed.docId()) throw new Error('Choose another document to copy the format from.');
  const src = await api.get<FtxtDocument>(`/documents/${encodeURIComponent(fromId)}`);
  const done: string[] = [];
  if (parts.styles) {
    const fonts = new Set<string>();
    for (const s of Object.values(src.styles ?? {})) if (s.run?.font) fonts.add(s.run.font);
    await ed.preloadFonts(Array.from(fonts));
    ed.setStyles({ ...ed.styles(), ...JSON.parse(JSON.stringify(src.styles ?? {})) });
    done.push(`${Object.keys(src.styles ?? {}).length} styles`);
  }
  if (parts.page) {
    const from = src.sections?.[0];
    if (from && ed.doc) {
      const patch = { page: { ...from.page }, margins: { ...from.margins }, columns: { ...from.columns } } as Partial<Section>;
      const defaultTab = Number(src.settings?.defaultTab) || undefined;
      for (const sec of [...ed.doc.sections]) ed.updateSectionById(sec.id, patch, defaultTab ? { defaultTab } : {});
      done.push('page setup');
    }
  }
  if (!done.length) throw new Error('Choose styles, page setup or both.');
  return `Copied ${done.join(' and ')} from "${src.title}".`;
}
