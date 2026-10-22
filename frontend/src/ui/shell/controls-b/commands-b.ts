import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { commands as registry, type CommandParam } from '../../../engine/registry';
import type { DocEditor } from '../../../editor/editor';
import { schema } from '../../../editor/schema';
import { currentTable, tableInfo } from '../../../editor/table';
import { mergeData } from '../../../editor/ext/versions/merge';
import { collectChanges } from '../../../editor/ext/review/track';
import { Dialog } from '../../dialog';
import { el } from '../../dom';
import { toast } from '../../toast';

const P = (name: string, type: CommandParam['type'], description: string): CommandParam => ({ name, type, description });

const PART = '.ft-sheet-header, .ft-sheet-footer';

export function registerBCommands(ed: DocEditor): void {
  const add = (id: string, label: string, group: string, description: string, fn: (p: Record<string, unknown>) => unknown, params: CommandParam[] = []): void => {
    if (registry.has(id)) return;
    registry.register({ id, label, group, description, params, run: (p) => fn(p) });
  };
  const view = () => {
    if (!ed.view) throw new Error('Open a document first.');
    return ed.view;
  };

  add('layout.headerOptions', 'Header and footer options', 'Layout', 'Different first page, different odd and even pages, and the distance of the header and footer from the page edge in inches. With no parameters returns the current values.', (p) => {
    const s = ed.sectionById(ed.currentSectionId());
    const settings = (ed.doc?.settings ?? {}) as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const sp: Record<string, unknown> = {};
    if (p.firstPage !== undefined) patch.titlePage = !!p.firstPage;
    if (p.evenOdd !== undefined) sp.evenOdd = !!p.evenOdd;
    const m = { ...s.margins };
    let moved = false;
    if (p.headerDistance !== undefined) { m.header = Math.max(0, Number(p.headerDistance) * 72); moved = true; }
    if (p.footerDistance !== undefined) { m.footer = Math.max(0, Number(p.footerDistance) * 72); moved = true; }
    if (moved) patch.margins = m;
    if (Object.keys(patch).length || Object.keys(sp).length) {
      ed.updateSectionById(s.id, patch as never, sp);
      const f = ed.sectionById(s.id);
      return { section: s.id, firstPage: !!f.titlePage, evenOdd: Object.keys(sp).length ? !!sp.evenOdd : !!settings.evenOdd, headerDistance: f.margins.header / 72, footerDistance: f.margins.footer / 72 };
    }
    return { section: s.id, firstPage: !!s.titlePage, evenOdd: !!settings.evenOdd, headerDistance: s.margins.header / 72, footerDistance: s.margins.footer / 72 };
  }, [P('firstPage', 'boolean', 'Different first page'), P('evenOdd', 'boolean', 'Different odd and even pages'), P('headerDistance', 'number', 'Header from the top edge, inches'), P('footerDistance', 'number', 'Footer from the bottom edge, inches')]);

  add('layout.closeHeaderFooter', 'Close header and footer', 'Layout', 'Finish editing the header or footer and return to the document body.', () => {
    const a = document.activeElement as HTMLElement | null;
    const was = !!a?.closest(PART);
    if (a) a.blur();
    ed.view?.focus();
    return { closed: was };
  });

  add('layout.gotoHeaderFooter', 'Go to header or footer', 'Layout', 'Start editing the header or footer of the current page or section; direction next or previous moves to the neighbouring section.', (p) => {
    const part = p.part === 'footer' ? 'footer' : 'header';
    const sheets = Array.from(ed.root.querySelectorAll<HTMLElement>('.ft-sheets > .ft-sheet'));
    if (!sheets.length) throw new Error('Switch to Print layout to edit headers and footers.');
    const active = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.ft-sheet');
    let target: HTMLElement | undefined;
    const dir = String(p.direction ?? 'current');
    if (dir === 'current') {
      const sid = ed.currentSectionId();
      const scroll = ed.root.querySelector<HTMLElement>('.ft-scroll')?.getBoundingClientRect();
      target = sheets.find((s) => s.dataset.section === sid && scroll && s.getBoundingClientRect().bottom > scroll.top + 40) ?? sheets.find((s) => s.dataset.section === sid) ?? sheets[0];
    } else if (active) {
      const at = sheets.indexOf(active);
      const here = active.dataset.section;
      const order = dir === 'next' ? sheets.slice(at + 1) : sheets.slice(0, at).reverse();
      target = order.find((s) => s.dataset.section !== here);
      if (!target) { toast(dir === 'next' ? 'This is the last section.' : 'This is the first section.'); return false; }
    } else target = sheets[0];
    const node = target.querySelector<HTMLElement>(part === 'footer' ? '.ft-sheet-footer' : '.ft-sheet-header');
    if (!node) return false;
    const cur = document.activeElement as HTMLElement | null;
    if (cur?.closest(PART)) cur.blur();
    node.scrollIntoView({ block: 'nearest' });
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return true;
  }, [P('part', 'string', 'header or footer'), P('direction', 'string', 'current, next or previous')]);

  add('layout.insertHeaderFooterText', 'Insert into header or footer', 'Layout', 'Insert a page number, page count, date or time into the header or footer being edited.', (p) => {
    const a = document.activeElement as HTMLElement | null;
    if (!a?.closest(PART)) throw new Error('Double-click a header or footer first.');
    const now = new Date();
    const f = String(p.field ?? 'page');
    const text = f === 'pages' ? '{NUMPAGES}' : f === 'date' ? now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : f === 'time' ? now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : f === 'text' ? String(p.text ?? '') : '{PAGE}';
    return document.execCommand('insertText', false, text);
  }, [P('field', 'string', 'page, pages, date, time or text'), P('text', 'string', 'Literal text when field is text')]);

  add('references.nextNote', 'Go to a footnote or endnote', 'References', 'Select the next or previous footnote or endnote, wrapping around the document.', (p) => {
    const v = view();
    const kind = String(p.kind ?? 'any');
    const dir = p.direction === 'previous' ? -1 : 1;
    const list: number[] = [];
    v.state.doc.descendants((n, pos) => { if (n.type === schema.nodes.note_ref && (kind === 'any' || n.attrs.kind === kind)) list.push(pos); return true; });
    if (!list.length) throw new Error(kind === 'any' ? 'The document has no notes.' : `The document has no ${kind}s.`);
    const at = v.state.selection.from;
    const sel = v.state.selection instanceof NodeSelection ? v.state.selection.from : -1;
    const pick = dir > 0 ? list.find((x) => x > at && x !== sel) ?? list[0] : [...list].reverse().find((x) => x < at && x !== sel) ?? list[list.length - 1];
    v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, pick)).scrollIntoView());
    v.focus();
    return { pos: pick };
  }, [P('kind', 'string', 'footnote, endnote or any'), P('direction', 'string', 'next or previous')]);

  add('references.removeToc', 'Remove table of contents', 'References', 'Delete the table of contents at the caret, or the first one in the document.', () => {
    const v = view();
    const found: Array<{ pos: number; size: number }> = [];
    v.state.doc.descendants((n, pos) => { if (n.type === schema.nodes.ref_toc) found.push({ pos, size: n.nodeSize }); return n.type !== schema.nodes.ref_toc; });
    if (!found.length) throw new Error('The document has no table of contents.');
    const at = v.state.selection.from;
    const t = found.find((f) => at >= f.pos && at <= f.pos + f.size) ?? found[0];
    v.dispatch(v.state.tr.delete(t.pos, t.pos + t.size).scrollIntoView());
    return true;
  });

  add('references.insertTocStyle', 'Insert built-in table of contents', 'References', 'Insert a table of contents in one of the built-in styles: auto1 (Contents), auto2 (Table of Contents) or manual (no links).', async (p) => {
    const variant = String(p.variant ?? 'auto1');
    const title = variant === 'auto1' ? 'Contents' : 'Table of Contents';
    await registry.run('references.insertToc', { from: 1, to: 3, pages: true, links: variant !== 'manual' });
    const v = view();
    const sel = v.state.selection;
    let pos = -1;
    if (sel instanceof NodeSelection && sel.node.type === schema.nodes.ref_toc) pos = sel.from;
    else v.state.doc.descendants((n, at) => { if (pos < 0 && n.type === schema.nodes.ref_toc) pos = at; return pos < 0; });
    if (pos >= 0) {
      const node = v.state.doc.nodeAt(pos);
      if (node) v.dispatch(v.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title }));
    }
    return true;
  }, [P('variant', 'string', 'auto1, auto2 or manual')]);

  add('references.insertBibliographyStyle', 'Insert built-in bibliography', 'References', 'Insert a bibliography headed Bibliography, References or Works Cited.', async (p) => {
    const title = ['Bibliography', 'References', 'Works Cited'].includes(String(p.title)) ? String(p.title) : 'References';
    await registry.run('references.insertBibliography', {});
    const v = view();
    let pos = -1;
    const sel = v.state.selection;
    if (sel instanceof NodeSelection && sel.node.type === schema.nodes.ref_bibliography) pos = sel.from;
    else v.state.doc.descendants((n, at) => { if (n.type === schema.nodes.ref_bibliography) pos = at; return pos < 0 || n.type !== schema.nodes.ref_bibliography; });
    if (pos >= 0) {
      const node = v.state.doc.nodeAt(pos);
      if (node) v.dispatch(v.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title }));
    }
    return true;
  }, [P('title', 'string', 'Bibliography, References or Works Cited')]);

  const hiddenAuthors = new Set<string>();
  const markupStyle = (): void => {
    let s = document.getElementById('ft-b-markup');
    if (!s) { s = document.createElement('style'); s.id = 'ft-b-markup'; document.head.appendChild(s); }
    const esc = (a: string): string => a.replace(/["\\]/g, '\\$&');
    const css = Array.from(hiddenAuthors).map((a) => `.ft-editor .ft-ins[data-author="${esc(a)}"], .ft-editor .ft-fmt[data-author="${esc(a)}"] { color: inherit; text-decoration: none; box-shadow: none; } .ft-editor .ft-del[data-author="${esc(a)}"] { display: none; }`).join('\n');
    if (s.textContent !== css) s.textContent = css;
  };
  add('review.markupFilter', 'Show markup', 'Review', 'Choose which markup is shown: insertions and deletions, formatting, comments, or the changes of one reviewer. With no parameters returns the current choices and the reviewers.', (p) => {
    const root = ed.root;
    const keys: Record<string, string> = { insertions: 'mkIns', formatting: 'mkFmt', comments: 'mkCm' };
    const k = p.kind === undefined ? '' : keys[String(p.kind)];
    if (p.kind !== undefined && !k) throw new Error('kind must be insertions, formatting or comments.');
    if (k) {
      const on = p.on === undefined ? root.dataset[k] === 'off' : !!p.on;
      if (on) delete root.dataset[k]; else root.dataset[k] = 'off';
    }
    if (p.author !== undefined) {
      const a = String(p.author);
      const on = p.on === undefined ? hiddenAuthors.has(a) : !!p.on;
      if (on) hiddenAuthors.delete(a); else hiddenAuthors.add(a);
      markupStyle();
    }
    const authors = new Set<string>();
    if (ed.view) for (const c of collectChanges(ed.view.state.doc)) authors.add(c.author);
    return { insertions: root.dataset.mkIns !== 'off', formatting: root.dataset.mkFmt !== 'off', comments: root.dataset.mkCm !== 'off', hidden: Array.from(hiddenAuthors), authors: Array.from(authors) };
  }, [P('kind', 'string', 'insertions, formatting or comments'), P('author', 'string', 'Reviewer name to show or hide'), P('on', 'boolean', 'Show (true) or hide (false) instead of toggling')]);

  add('references.noteDialog', 'Footnote and endnote options', 'References', 'Insert a footnote or endnote, or convert every note to the other kind.', () => {
    const d = new Dialog('Footnote and Endnote', 420);
    const row = (label: string, id: string): void => {
      const b = el<HTMLButtonElement>('<button class="ft-btn" type="button" style="width:100%;justify-content:flex-start;margin-bottom:8px"></button>');
      b.textContent = label;
      b.addEventListener('click', () => { d.close(); void registry.run(id, {}).catch((e: Error) => toast(e.message, 'error')); });
      d.body.appendChild(b);
    };
    row('Insert Footnote', 'references.insertFootnote');
    row('Insert Endnote', 'references.insertEndnote');
    row('Convert all footnotes to endnotes', 'references.convertToEndnotes');
    row('Convert all endnotes to footnotes', 'references.convertToFootnotes');
    d.button('Close', 'ghost', () => d.close());
    d.open();
    return true;
  });

  const columns = (): string[] => mergeData(ed)?.columns ?? [];
  const pickCol = (re: RegExp, cols: string[]): string | undefined => cols.find((c) => re.test(c));

  add('merge.addressBlock', 'Address block', 'Tools', 'Insert merge fields for the name and address columns of the mail merge data as an address block.', () => {
    const v = view();
    const cols = columns();
    if (!cols.length) throw new Error('Choose recipients first.');
    const first = pickCol(/first/i, cols);
    const last = pickCol(/last|sur/i, cols);
    const name = pickCol(/^name$|full.?name|^recipient/i, cols);
    const lines: string[][] = [];
    if (first || last) lines.push([first, last].filter((x): x is string => !!x));
    else if (name) lines.push([name]);
    const company = pickCol(/company|organi[sz]ation/i, cols);
    if (company) lines.push([company]);
    const street = pickCol(/address|street/i, cols);
    if (street) lines.push([street]);
    const city = pickCol(/city|town/i, cols);
    const state = pickCol(/state|province|region|county/i, cols);
    const zip = pickCol(/zip|post/i, cols);
    const tail = [city, state, zip].filter((x): x is string => !!x);
    if (tail.length) lines.push(tail);
    const country = pickCol(/country/i, cols);
    if (country) lines.push([country]);
    if (!lines.length) lines.push(cols.slice(0, Math.min(3, cols.length)));
    const nodes: PMNode[] = [];
    lines.forEach((line, li) => {
      line.forEach((c, i) => {
        if (i > 0) nodes.push(schema.text(line[i - 1] === city && !!city && (c === state || (!state && c === zip)) ? ', ' : ' '));
        nodes.push(schema.nodes.merge_field.create({ name: c }));
      });
      if (li < lines.length - 1) nodes.push(schema.nodes.hard_break.create());
    });
    const tr = v.state.tr.deleteSelection();
    let at = tr.selection.from;
    for (const n of nodes) { tr.insert(at, n); at += n.nodeSize; }
    v.dispatch(tr.scrollIntoView());
    return { lines: lines.length };
  });

  add('merge.greetingLine', 'Greeting line', 'Tools', 'Insert a greeting such as Dear «First name», using the best matching column of the mail merge data.', () => {
    const v = view();
    const cols = columns();
    if (!cols.length) throw new Error('Choose recipients first.');
    const col = pickCol(/first/i, cols) ?? pickCol(/name/i, cols) ?? cols[0];
    const tr = v.state.tr;
    let at = tr.selection.from;
    for (const n of [schema.text('Dear '), schema.nodes.merge_field.create({ name: col }), schema.text(',')]) { tr.insert(at, n); at += n.nodeSize; }
    v.dispatch(tr.scrollIntoView());
    return { column: col };
  });

  add('merge.highlightFields', 'Highlight merge fields', 'Tools', 'Shade every merge field in the document so they stand out; run again to turn it off.', (p) => {
    const on = p.on === undefined ? ed.root.dataset.mfHighlight !== 'on' : !!p.on;
    if (on) ed.root.dataset.mfHighlight = 'on'; else delete ed.root.dataset.mfHighlight;
    return { on };
  }, [P('on', 'boolean', 'Turn on or off instead of toggling')]);

  add('merge.newList', 'Type a new recipient list', 'Tools', 'Type recipients into a table (first row is the column names) and use them as the mail merge data.', () => {
    const d = new Dialog('New recipient list', 560);
    const ta = el<HTMLTextAreaElement>('<textarea class="ft-input" rows="9" spellcheck="false" style="width:100%;font-family:var(--font-mono)" placeholder="First Name,Last Name,Address,City&#10;Ada,Lovelace,12 Analytical Way,London"></textarea>');
    d.field('Columns on the first line, one recipient per line, separated by commas', ta);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Use list', 'primary', () => {
      void registry.run('merge.setData', { csv: ta.value, source: 'typed list' }).then(() => d.close()).catch((e: Error) => toast(e.message, 'error'));
    });
    d.open(ta);
    return true;
  });

  add('table.splitTable', 'Split table', 'Table', 'Split the table in two above the row at the cursor, with a paragraph between.', () => {
    const v = view();
    const t = currentTable(v.state);
    const info = tableInfo(v.state);
    if (!t || !info) throw new Error('Put the cursor in a table first.');
    if (info.row < 1) throw new Error('Put the cursor below the first row to split the table there.');
    const rows: ReturnType<typeof t.node.child>[] = [];
    t.node.forEach((r) => rows.push(r));
    const a = t.node.type.create(t.node.attrs, rows.slice(0, info.row));
    const b = t.node.type.create({ ...t.node.attrs, id: null }, rows.slice(info.row));
    const tr = v.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, [a, schema.nodes.paragraph.create(), b]);
    const inside = t.pos + a.nodeSize + 1 + 3;
    try { tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(inside, tr.doc.content.size)))); } catch { void 0; }
    v.dispatch(tr.scrollIntoView());
    return { rows: [info.row, info.rows - info.row] };
  });

  add('table.distributeRows', 'Distribute rows', 'Table', 'Make every row of the table at the cursor the same height, the average of the current heights.', () => {
    const v = view();
    const t = currentTable(v.state);
    if (!t) throw new Error('Click inside a table first.');
    const dom = v.nodeDOM(t.pos) as HTMLElement | null;
    const trs = dom ? Array.from(dom.querySelectorAll<HTMLElement>(':scope > tbody > tr, :scope > tr')) : [];
    if (!trs.length) throw new Error('The table is not displayed.');
    const z = ed.zoom || 1;
    const avg = Math.round(trs.reduce((s, r) => s + r.getBoundingClientRect().height, 0) / trs.length * 0.75 / z * 10) / 10;
    const tr = v.state.tr;
    let i = 0;
    t.node.forEach((row, off) => { tr.setNodeMarkup(t.pos + 1 + off, undefined, { ...row.attrs, height: avg }); i++; });
    v.dispatch(tr);
    return { rows: i, height: avg };
  });

  add('picture.change','Change picture', 'Picture', 'Replace the selected picture with another image file, keeping its size and wrapping.', () => {
    const v = view();
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.image) throw new Error('Click a picture first.');
    const pos = sel.from;
    const old = sel.node;
    const input = el<HTMLInputElement>('<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" hidden>');
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return;
      void (async () => {
        const after = pos + old.nodeSize;
        const names = await ed.insertPictures([f], after);
        const vv = view();
        const added = vv.state.doc.nodeAt(after);
        if (!names.length || !added || added.type !== schema.nodes.image) return;
        const ratio = Number(added.attrs.height) / Math.max(1, Number(added.attrs.width));
        const width = Number(old.attrs.width);
        const tr = vv.state.tr.delete(after, after + added.nodeSize);
        tr.setNodeMarkup(pos, undefined, { ...old.attrs, media: names[0], alt: added.attrs.alt, width, height: Math.round(width * ratio), crop: null });
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        vv.dispatch(tr);
      })().catch((e: Error) => toast(e.message, 'error'));
    }, { once: true });
    input.click();
    return true;
  });

  add('equation.append', 'Add to equation', 'Equation', 'Add LaTeX to the end of the selected equation, or insert a new equation when none is selected.', (p) => {
    const snippet = String(p.latex ?? '');
    if (!snippet) throw new Error('latex needs some LaTeX.');
    const v = view();
    const sel = v.state.selection;
    if (sel instanceof NodeSelection && sel.node.type === schema.nodes.math) {
      const cur = String(sel.node.attrs.latex ?? '');
      v.dispatch(v.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, latex: cur ? `${cur} ${snippet}` : snippet }));
      return true;
    }
    return registry.run('insert.equation', { latex: snippet, display: false });
  }, [P('latex', 'string', 'LaTeX to add')]);

  add('chart.switchRowColumn', 'Switch row and column', 'Chart', 'Swap the series and the categories of the selected chart.', () => {
    const v = view();
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.chart) throw new Error('Select a chart first.');
    const d = sel.node.attrs.data as { categories: string[]; series: Array<{ name: string; values: number[] }> };
    if (!d.series.length || !d.categories.length) throw new Error('The chart has no data.');
    const categories = d.series.map((s) => s.name);
    const series = d.categories.map((c, i) => ({ name: c, values: d.series.map((s) => Number(s.values[i] ?? 0)) }));
    v.dispatch(v.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, data: { ...d, categories, series } }));
    return { categories, series: series.length };
  });

  add('equation.display', 'Equation display', 'Equation', 'Show the selected equation on its own line (display) or inside the text line (inline).', (p) => {
    const v = view();
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.math) throw new Error('Select an equation first.');
    v.dispatch(v.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, display: !!p.display }));
    return { display: !!p.display };
  }, [P('display', 'boolean', 'true for its own line, false for inline')]);

  add('chart.style','Chart style', 'Chart', 'Colour the series of the selected chart from a list of colour names such as orange, blue, teal, amber, rose, green, cyan, pink, violet, gray; the list repeats across the series.', (p) => {
    const v = view();
    const sel = v.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type !== schema.nodes.chart) throw new Error('Select a chart first.');
    const names = String(p.colors ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) throw new Error('colors needs at least one colour name.');
    const d = sel.node.attrs.data as { categories: string[]; series: Array<{ name: string; values: number[]; color?: string }> };
    const series = d.series.map((s, i) => ({ ...s, color: names[i % names.length] }));
    v.dispatch(v.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, data: { ...d, series } }));
    return { series: series.length };
  }, [P('colors', 'string', 'Comma separated colour names')]);
}
