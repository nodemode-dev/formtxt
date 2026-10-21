import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { DocEditor } from '../../editor';
import { summaryRange } from './insert';

const WAIT = 20000;

function outsideText(doc: PMNode): string {
  const r = summaryRange(doc);
  let out = '';
  doc.forEach((node, pos) => {
    if (r && pos >= r.from && pos < r.to) return;
    out += node.textContent + '\n';
  });
  return out;
}

export function autoOn(ed: DocEditor): boolean {
  return !!(ed.doc?.settings as unknown as { aiSummaryAuto?: boolean } | undefined)?.aiSummaryAuto;
}

export function autoSummaryPlugin(ed: DocEditor, refresh: () => Promise<unknown>, enabled: () => boolean): Plugin {
  let timer = 0;
  const last = new Map<string, string>();
  let busy = false;
  const run = async (): Promise<void> => {
    timer = 0;
    const view = ed.view;
    const id = ed.docId();
    if (!view || busy || !autoOn(ed) || !enabled() || !summaryRange(view.state.doc)) return;
    const now = outsideText(view.state.doc);
    if (now === last.get(id)) return;
    busy = true;
    try { await refresh(); if (ed.docId() === id && ed.view) last.set(id, outsideText(ed.view.state.doc)); } catch { void 0; } finally { busy = false; }
  };
  return new Plugin({
    view: () => ({
      update: (view, prev) => {
        if (view.state.doc === prev.doc || !autoOn(ed)) return;
        if (!last.has(ed.docId())) { last.set(ed.docId(), outsideText(view.state.doc)); return; }
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void run(), WAIT);
      },
      destroy: () => window.clearTimeout(timer),
    }),
  });
}
