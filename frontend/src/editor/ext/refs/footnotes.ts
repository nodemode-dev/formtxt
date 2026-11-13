import type { DocEditor } from '../../editor';
import { escapeHtml, setHtml } from '../../../ui/dom';
import { schema } from '../../schema';

const PX = 96 / 72;
const SEP = 14;

interface Note { pos: number; n: string; text: string }

export function pageFootnotes(ed: DocEditor): void {
  const pag = ed.paginator;
  const pages = ed.root.querySelector<HTMLElement>('.ft-pages');
  if (!pages) return;
  let reserve = new Map<number, number>();
  let rounds = 0;
  let quietAt = 0;
  let measure: HTMLElement | null = null;
  pag.reserve = (p) => reserve.get(p) ?? 0;

  const active = (): boolean => !!ed.view && ed.viewMode !== 'draft' && pages.dataset.mode === 'paged';

  const notesOf = (): Note[] => {
    const out: Note[] = [];
    ed.view?.state.doc.descendants((node, pos) => {
      if (node.type === schema.nodes.note_ref && node.attrs.kind !== 'endnote') out.push({ pos, n: String(node.attrs.n), text: String(node.attrs.text) });
      return true;
    });
    return out;
  };

  const sheetsOf = (): HTMLElement[] => Array.from(pages.querySelectorAll<HTMLElement>(':scope > .ft-sheets > .ft-sheet'));

  const html = (list: Note[]): string => `<div class="ft-fn-sep"></div>${list.map((x) => `<div class="ft-fn"><sup>${escapeHtml(x.n)}</sup> ${escapeHtml(x.text)}</div>`).join('')}`;

  const heightOf = (list: Note[], width: number): number => {
    if (!measure) {
      measure = document.createElement('div');
      measure.className = 'ft-sheet-notes ft-fn-measure';
      measure.setAttribute('aria-hidden', 'true');
      pages.appendChild(measure);
    }
    measure.style.width = `${width.toFixed(1)}px`;
    measure.innerHTML = html(list);
    return Math.ceil(measure.offsetHeight) + 2;
  };

  const paint = (byPage: Map<number, Note[]>): void => {
    const sheets = sheetsOf();
    sheets.forEach((sheet, i) => {
      let box = sheet.querySelector<HTMLElement>(':scope > .ft-sheet-notes');
      const list = byPage.get(i) ?? [];
      if (!list.length) { if (box && !box.hidden) box.hidden = true; return; }
      if (!box) { box = document.createElement('div'); box.className = 'ft-sheet-notes'; box.setAttribute('role', 'note'); sheet.appendChild(box); }
      const geo = pag.sheetGeo[i]?.sec ?? ed.section();
      if (!geo) return;
      const h = reserve.get(i) ?? 0;
      const css = `left:${(geo.margins.left * PX).toFixed(1)}px;right:${(geo.margins.right * PX).toFixed(1)}px;top:${(geo.page.height * PX - geo.margins.bottom * PX - h + 4).toFixed(1)}px`;
      if (box.getAttribute('style') !== css) box.setAttribute('style', css);
      setHtml(box, html(list), list.map((x) => `${x.n}:${x.text}`).join('|'));
      if (box.hidden) box.hidden = false;
    });
  };

  const settle = (): void => {
    const view = ed.view;
    if (!view) return;
    const on = active();
    pages.dataset.footnotes = on ? 'page' : '';
    const notes = on ? notesOf() : [];
    if (!notes.length) {
      if (reserve.size) { reserve = new Map(); pag.schedule(); }
      paint(new Map());
      return;
    }
    const sheets = sheetsOf();
    const tops = sheets.map((s) => s.getBoundingClientRect().top);
    const byPage = new Map<number, Note[]>();
    for (const note of notes) {
      let y: number;
      try { y = view.coordsAtPos(note.pos + 1).top + 1; } catch { continue; }
      let at = 0;
      for (let k = 0; k < tops.length; k++) if (tops[k] <= y) at = k;
      byPage.set(at, [...(byPage.get(at) ?? []), note]);
    }
    const next = new Map<number, number>();
    for (const [p, list] of byPage) {
      const sec = pag.sheetGeo[p]?.sec ?? ed.section();
      if (!sec) continue;
      const width = (sec.page.width - sec.margins.left - sec.margins.right) * PX;
      next.set(p, Math.min(heightOf(list, width) + SEP, (sec.page.height - sec.margins.top - sec.margins.bottom) * PX * 0.6));
    }
    const same = next.size === reserve.size && [...next].every(([k, v]) => Math.abs((reserve.get(k) ?? -1) - v) < 1);
    if (!same && rounds < 4) {
      const now = performance.now();
      if (now - quietAt > 1500) rounds = 0;
      quietAt = now;
      rounds++;
      reserve = next;
      pag.schedule();
      return;
    }
    rounds = 0;
    paint(byPage);
  };

  const prev = pag.onLayout;
  pag.onLayout = () => { prev?.(); settle(); };
}
