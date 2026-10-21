import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { toggleHeaderRow } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';

export type Level = 'error' | 'warning' | 'tip';
export type FixKind = 'input' | 'action';

export interface A11yIssue {
  id: string;
  level: Level;
  rule: string;
  message: string;
  pos: number;
  size: number;
  fix: FixKind | '';
  fixLabel: string;
  seed: string;
  data: Record<string, unknown>;
}

const GENERIC_LINK = /^(click here|here|link|this link|click|read more|more|more info|this page|this|learn more|see here|go here|follow this link|click this link|details)$/i;
const URLISH = /^(https?:\/\/|www\.)\S+$/i;

export function parseColor(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function readableOn(bg: string): string {
  const white = contrast('#ffffff', bg) ?? 0;
  const black = contrast('#000000', bg) ?? 0;
  return white > black ? '#ffffff' : '#000000';
}

function headingLevel(node: PMNode): number {
  const m = /^Heading([1-9])$/.exec(String(node.attrs.style ?? ''));
  return m ? Number(m[1]) : 0;
}

export function accessibilityIssues(ed: DocEditor): A11yIssue[] {
  const view = ed.view;
  if (!view || !ed.doc) return [];
  const out: A11yIssue[] = [];
  const add = (i: Omit<A11yIssue, 'id'> & { id?: string }): void => { out.push({ ...i, id: i.id ?? `${i.rule}:${i.pos}` }); };
  const section = ed.doc.sections[0] as unknown as { pageColor?: string };
  const pageColor = section?.pageColor && parseColor(section.pageColor) ? section.pageColor : '#ffffff';

  const inlineObject = (node: PMNode, pos: number): void => {
    if (node.type.name === 'image' && !String(node.attrs.alt ?? '').trim()) {
      add({ rule: 'alt', level: 'error', message: 'Picture has no alt text', pos, size: node.nodeSize, fix: 'input', fixLabel: 'Add alt text', seed: '', data: {} });
    } else if (node.type.name === 'shape') {
      const kind = String(node.attrs.kind);
      const hasText = !!String(node.attrs.text ?? '').trim() || !!node.attrs.content;
      if (kind !== 'connector' && !String(node.attrs.alt ?? '').trim() && (!hasText || kind === 'icon' || kind === 'ink')) {
        add({ rule: 'alt', level: 'error', message: `${kind === 'icon' ? 'Icon' : kind === 'ink' ? 'Drawing' : 'Shape'} has no alt text`, pos, size: node.nodeSize, fix: 'input', fixLabel: 'Add alt text', seed: '', data: {} });
      }
    }
  };

  const title = (ed.doc.title ?? '').trim();
  if (!title || /^untitled/i.test(title)) {
    let seed = '';
    view.state.doc.descendants((n) => { if (!seed && n.isTextblock && n.textContent.trim()) seed = n.textContent.trim().slice(0, 80); return !seed && !n.isTextblock; });
    add({ rule: 'title', level: 'warning', message: 'The document has no title', pos: 0, size: 0, fix: 'input', fixLabel: 'Set title', seed, data: {} });
  }

  let previousHeading = 0;
  let emptyRun: Array<{ pos: number; size: number }> = [];
  const flushEmpty = (): void => {
    if (emptyRun.length > 1) {
      const extra = emptyRun.slice(1);
      add({ rule: 'blank', level: 'warning', message: `${emptyRun.length} blank paragraphs in a row. Use paragraph spacing instead.`, pos: extra[0].pos, size: extra[0].size, fix: 'action', fixLabel: 'Remove extra blanks', seed: '', data: { extra } });
    }
    emptyRun = [];
  };

  view.state.doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === 'paragraph') {
      const level = headingLevel(node);
      if (level) {
        if (previousHeading && level > previousHeading + 1) add({ rule: 'heading', level: 'warning', message: `Heading level skipped: ${node.textContent.slice(0, 40) || 'Heading'} jumps from level ${previousHeading} to ${level}`, pos, size: node.nodeSize, fix: 'action', fixLabel: `Change to Heading ${previousHeading + 1}`, seed: '', data: { to: previousHeading + 1 } });
        previousHeading = level;
      }
      const empty = node.content.size === 0;
      if (empty && !node.attrs.list && parent?.type.name === 'doc') emptyRun.push({ pos, size: node.nodeSize });
      else flushEmpty();

      const style = ed.resolvedStyle(String(node.attrs.style || 'Normal'));
      const styleColor = String((style.run.color as string | undefined) ?? '#1a1a1a');
      const styleSize = Number(style.run.size ?? 11);
      const styleBold = !!style.run.bold;
      const shading = typeof node.attrs.shading === 'string' && parseColor(node.attrs.shading) ? node.attrs.shading : '';
      let runStart = -1;
      let runEnd = -1;
      let runKey = '';
      let runInfo: { fg: string; bg: string; ratio: number; need: number } | null = null;
      const closeRun = (): void => {
        if (runInfo && runStart >= 0) add({ rule: 'contrast', level: 'warning', message: `Low contrast text (${runInfo.ratio.toFixed(1)}:1, needs ${runInfo.need}:1)`, pos: runStart, size: runEnd - runStart, fix: 'action', fixLabel: 'Use a readable colour', seed: '', data: { bg: runInfo.bg, from: runStart, to: runEnd } });
        runStart = -1; runEnd = -1; runKey = ''; runInfo = null;
      };
      let linkText = '';
      let linkHref = '';
      let linkStart = -1;
      const closeLink = (): void => {
        const t = linkText.trim();
        if (linkStart >= 0 && (GENERIC_LINK.test(t) || URLISH.test(t))) add({ rule: 'link', level: 'warning', message: `Link text "${t.slice(0, 40)}" does not describe where the link goes`, pos: linkStart, size: linkText.length, fix: 'input', fixLabel: 'Rewrite link text', seed: t, data: { from: linkStart, to: linkStart + linkText.length, href: linkHref } });
        linkText = ''; linkHref = ''; linkStart = -1;
      };
      node.forEach((child, offset) => {
        const at = pos + 1 + offset;
        const link = child.isText ? child.marks.find((m) => m.type.name === 'link') : undefined;
        if (link) {
          const href = String(link.attrs.href);
          if (linkStart >= 0 && href !== linkHref) closeLink();
          if (linkStart < 0) { linkStart = at; linkHref = href; }
          linkText += child.text ?? '';
        } else closeLink();
        if (!child.isText) { inlineObject(child, at); closeRun(); return; }
        if (!(child.text ?? '').trim()) return;
        const colorMark = child.marks.find((m) => m.type.name === 'color');
        const highlight = child.marks.find((m) => m.type.name === 'highlight');
        const sizeMark = child.marks.find((m) => m.type.name === 'size');
        const boldMark = child.marks.some((m) => m.type.name === 'bold');
        const fg = colorMark ? String(colorMark.attrs.value) : styleColor;
        const bg = highlight ? String(highlight.attrs.value) : shading || pageColor;
        const pt = sizeMark ? Number(sizeMark.attrs.pt) : styleSize;
        const large = pt >= 18 || ((boldMark || styleBold) && pt >= 14);
        const need = large ? 3 : 4.5;
        const ratio = contrast(fg, bg);
        const key = `${fg}|${bg}|${need}`;
        if (ratio !== null && ratio < need) {
          if (runKey && runKey !== key) closeRun();
          if (runStart < 0) { runStart = at; runKey = key; runInfo = { fg, bg, ratio, need }; }
          runEnd = at + child.nodeSize;
        } else closeRun();
      });
      closeRun();
      closeLink();
      return false;
    }
    flushEmpty();
    if (name === 'chart') {
      const opts = (node.attrs.options ?? {}) as { alt?: string };
      if (!String(opts.alt ?? '').trim()) add({ rule: 'alt', level: String(node.attrs.title ?? '').trim() ? 'warning' : 'error', message: String(node.attrs.title ?? '').trim() ? 'Chart has a title but no alt text' : 'Chart has no alt text', pos, size: node.nodeSize, fix: 'input', fixLabel: 'Add alt text', seed: String(node.attrs.title ?? ''), data: { chart: true } });
    } else if (name === 'mermaid' && !String(node.attrs.alt ?? '').trim()) {
      add({ rule: 'alt', level: 'error', message: 'Diagram has no alt text', pos, size: node.nodeSize, fix: 'input', fixLabel: 'Add alt text', seed: '', data: {} });
    } else if (name === 'diagram' && !(Array.isArray(node.attrs.items) && node.attrs.items.length)) {
      add({ rule: 'alt', level: 'error', message: 'Diagram has no text', pos, size: node.nodeSize, fix: '', fixLabel: '', seed: '', data: {} });
    } else if (name === 'table') {
      const header = node.firstChild?.firstChild?.type.name === 'table_header';
      if (!header) add({ rule: 'table', level: 'error', message: 'Table has no header row', pos, size: node.nodeSize, fix: 'action', fixLabel: 'Make the first row a header', seed: '', data: {} });
      return true;
    }
    return name === 'table' || name === 'table_row' || name === 'table_cell' || name === 'table_header';
  });
  flushEmpty();
  return out;
}

export function describe(level: Level): string {
  return level === 'error' ? 'Error' : level === 'warning' ? 'Warning' : 'Tip';
}

export function goToIssue(view: EditorView, issue: A11yIssue): void {
  const size = view.state.doc.content.size;
  const at = Math.max(0, Math.min(issue.pos, size));
  try {
    const sel = issue.size && issue.size < 4 ? TextSelection.near(view.state.doc.resolve(at)) : TextSelection.near(view.state.doc.resolve(Math.min(at + 1, size)));
    view.dispatch(view.state.tr.setSelection(sel));
  } catch { void 0; }
  const dom = view.nodeDOM(at) as HTMLElement | null;
  (dom && dom.nodeType === 1 ? dom : view.domAtPos(at).node as HTMLElement)?.scrollIntoView?.({ block: 'center' });
  view.focus();
}

export function applyFix(ed: DocEditor, issue: A11yIssue, value: string): boolean {
  const view = ed.view;
  if (!view || !ed.doc) return false;
  const state = view.state;
  const node = issue.pos < state.doc.content.size ? state.doc.nodeAt(issue.pos) : null;
  if (issue.rule === 'title') {
    const t = value.trim();
    if (!t) return false;
    ed.doc = { ...ed.doc, title: t };
    ed.updatePage({});
    const name = document.querySelector<HTMLElement>('[data-ref="docname"]');
    if (name) name.textContent = t;
    document.title = `${t} \u00b7 FormTxt`;
    return true;
  }
  if (issue.rule === 'alt' && node) {
    if (!value.trim()) return false;
    const attrs = node.type.name === 'chart' ? { ...node.attrs, options: { ...(node.attrs.options as object), alt: value.trim() } } : { ...node.attrs, alt: value.trim() };
    view.dispatch(state.tr.setNodeMarkup(issue.pos, undefined, attrs));
    return true;
  }
  if (issue.rule === 'heading' && node) {
    view.dispatch(state.tr.setNodeMarkup(issue.pos, undefined, { ...node.attrs, style: `Heading${Number(issue.data.to)}` }));
    return true;
  }
  if (issue.rule === 'blank') {
    const extra = (issue.data.extra as Array<{ pos: number; size: number }>) ?? [];
    const tr = state.tr;
    for (const e of [...extra].reverse()) tr.delete(e.pos, e.pos + e.size);
    view.dispatch(tr);
    return true;
  }
  if (issue.rule === 'contrast') {
    const from = Number(issue.data.from);
    const to = Number(issue.data.to);
    view.dispatch(state.tr.addMark(from, to, schema.marks.color.create({ value: readableOn(String(issue.data.bg)) })));
    return true;
  }
  if (issue.rule === 'link') {
    const t = value.trim();
    if (!t) return false;
    const from = Number(issue.data.from);
    const to = Number(issue.data.to);
    const href = String(issue.data.href);
    view.dispatch(state.tr.replaceWith(from, to, schema.text(t, [schema.marks.link.create({ href })])));
    return true;
  }
  if (issue.rule === 'table' && node) {
    const first = issue.pos + 3;
    view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(first))));
    return toggleHeaderRow(view.state, view.dispatch);
  }
  return false;
}
