import { Plugin } from 'prosemirror-state';
import type { CommandRegistry } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, patchList, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { FtxtDocument } from '../../../engine/model';
import { type DocEditor, FONTS } from '../../editor';
import { addMenuItems } from '../ui';
import { addPlugin, onDocumentLoaded } from '../plugins';
import { fail, input, note, picker, sizeText } from './util';

export interface LibraryFont { file: string; family: string; weight: number; style: string; bytes: number; source: string }
interface Embedded { family: string; weight: number; style: string; media: string; bytes?: number }

const faces = new Map<string, FontFace>();
const known = new Set(FONTS);
let ready: Promise<unknown> = Promise.resolve();
let library: LibraryFont[] = [];

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function addOption(ed: DocEditor, family: string): void {
  if (!FONTS.includes(family)) FONTS.push(family);
  const select = ed.root.querySelector<HTMLSelectElement>('.ft-tb-font');
  if (!select || Array.from(select.options).some((o) => o.value === family)) return;
  const opt = document.createElement('option');
  opt.value = family;
  opt.textContent = family;
  select.insertBefore(opt, select.querySelector('option[value=""]'));
}

function dropOption(ed: DocEditor, family: string): void {
  const i = FONTS.indexOf(family);
  if (i >= 0 && !known.has(family)) FONTS.splice(i, 1);
  ed.root.querySelector<HTMLSelectElement>('.ft-tb-font')?.querySelector(`option[value="${CSS.escape(family)}"]`)?.remove();
}

async function register(key: string, family: string, url: string, weight: number, style: string): Promise<void> {
  if (faces.has(key) || typeof FontFace !== 'function') return;
  const face = new FontFace(family, `url("${url}")`, { weight: String(weight), style });
  faces.set(key, face);
  try {
    await face.load();
    document.fonts.add(face);
  } catch {
    faces.delete(key);
  }
}

async function loadLibrary(ed: DocEditor): Promise<LibraryFont[]> {
  const out = await api.get<{ fonts: LibraryFont[] }>('/objects/fonts');
  const files = new Set(out.fonts.map((f) => f.file));
  for (const [key, face] of Array.from(faces)) {
    if (key.startsWith('lib:') && !files.has(key.slice(4))) { document.fonts.delete(face); faces.delete(key); }
  }
  await Promise.all(out.fonts.map((f) => register(`lib:${f.file}`, f.family, `/api/objects/fonts/${encodeURIComponent(f.file)}`, f.weight, f.style)));
  const families = new Set(out.fonts.map((f) => f.family));
  for (const old of library) if (!families.has(old.family)) dropOption(ed, old.family);
  for (const f of out.fonts) addOption(ed, f.family);
  library = out.fonts;
  return out.fonts;
}

function usedFamilies(doc: FtxtDocument): Set<string> {
  const out = new Set<string>();
  for (const s of Object.values(doc.styles)) if (s.run?.font) out.add(s.run.font);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const font = (o.marks as Record<string, unknown> | undefined)?.font;
    if (typeof font === 'string') out.add(font);
    for (const x of Object.values(o)) if (x && typeof x === 'object') walk(x);
  };
  walk(doc.tabs);
  return out;
}

const embeddedOf = (ed: DocEditor): Embedded[] => ((ed.doc?.settings as unknown as { embeddedFonts?: Embedded[] } | undefined)?.embeddedFonts ?? []);
export const embedOn = (ed: DocEditor): boolean => !!(ed.doc?.settings as unknown as { embedFonts?: boolean } | undefined)?.embedFonts;

let syncing = false;

export async function syncEmbedded(ed: DocEditor): Promise<Embedded[]> {
  const doc = ed.current();
  if (!doc || syncing) return embeddedOf(ed);
  syncing = true;
  try {
    const used = usedFamilies(doc);
    const on = embedOn(ed);
    const have = embeddedOf(ed);
    const wanted = on ? Array.from(used).filter((f) => library.some((l) => l.family === f)) : [];
    const keep = on ? have.filter((h) => used.has(h.family) && !library.some((l) => l.family === h.family)) : [];
    const expect = new Set([...library.filter((l) => wanted.includes(l.family)).map((l) => l.file), ...keep.map((k) => k.media)]);
    if (expect.size === have.length && have.every((h) => expect.has(h.media))) return have;
    const fonts = wanted.length ? (await api.post<{ fonts: Embedded[] }>(`/objects/${encodeURIComponent(doc.id)}/embed-fonts`, { families: wanted })).fonts : [];
    const all = [...fonts, ...keep];
    if (ed.doc?.id === doc.id) ed.updatePage({}, { embeddedFonts: all });
    return all;
  } finally {
    syncing = false;
  }
}

export async function registerEmbedded(doc: FtxtDocument): Promise<void> {
  const list = ((doc.settings as unknown as { embeddedFonts?: Embedded[] }).embeddedFonts ?? []).filter((f) => f && typeof f.family === 'string' && typeof f.media === 'string');
  if (!list.length) return;
  const loads = list.map((f) => register(`doc:${doc.id}:${f.media}`, f.family, `/api/objects/${encodeURIComponent(doc.id)}/file/${encodeURIComponent(f.media)}`, f.weight || 400, f.style || 'normal'));
  await Promise.race([Promise.all(loads), wait(1500)]);
}

function manageDialog(ed: DocEditor): void {
  const d = new Dialog('Manage fonts', 560);
  const list = el('<div class="ft-fonts-list" role="list"></div>');
  const empty = el('<p class="ft-note ft-fonts-empty"></p>');
  const family = input('text', '', 'placeholder="Optional family name for a single file" spellcheck="false"');
  d.body.append(list, empty);
  const row = el('<label class="ft-field"><span class="ft-field-label">Family name</span></label>');
  row.appendChild(family);
  d.body.appendChild(row);
  note(d, 'Fonts are kept in your library and available in every document. Use .ttf, .otf, .woff or .woff2 files you have the right to use. A .woff2 file takes its family name from the box above, or from its file name.');
  const paint = (): void => {
    setText(empty, library.length ? '' : 'No added fonts yet.');
    empty.hidden = library.length > 0;
    patchList(list, library, {
      key: (f) => f.file,
      create: (f) => {
        const r = el(`<div class="ft-fonts-row" role="listitem"><span class="ft-fonts-name"></span><span class="ft-fonts-meta"></span><button type="button" class="ft-btn sm ghost" data-remove>Remove</button></div>`);
        r.querySelector('[data-remove]')?.addEventListener('click', () => { void removeFont(ed, f.file).then(paint).catch(fail('Could not remove the font')); });
        return r;
      },
      update: (node, f) => {
        const name = node.querySelector<HTMLElement>('.ft-fonts-name');
        if (name) { setText(name, f.family); name.style.fontFamily = `'${f.family.replace(/'/g, '')}'`; }
        setText(node.querySelector('.ft-fonts-meta'), `${f.weight}${f.style === 'italic' ? ' italic' : ''}, ${sizeText(f.bytes)}`);
      },
    });
  };
  const choose = picker('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', true, (files) => {
    void addFonts(ed, files, family.value.trim()).then(() => { family.value = ''; paint(); }).catch(fail('Could not add the font'));
  });
  d.button('Close', 'ghost', () => d.close());
  d.button('Add font file...', 'primary', choose);
  paint();
  d.open();
}

export async function addFonts(ed: DocEditor, files: File[], familyName = ''): Promise<LibraryFont[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  if (familyName && files.length === 1) form.append('family', familyName);
  const res = await fetch('/api/objects/fonts', { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as { fonts?: LibraryFont[]; errors?: string[]; detail?: string };
  if (!res.ok) throw new Error(body.detail ?? res.statusText);
  for (const e of body.errors ?? []) toast(e, 'error');
  await loadLibrary(ed);
  const added = body.fonts ?? [];
  if (added.length) toast(`Added ${Array.from(new Set(added.map((f) => f.family))).join(', ')}.`);
  return added;
}

export async function removeFont(ed: DocEditor, file: string): Promise<boolean> {
  await api.del(`/objects/fonts/${encodeURIComponent(file)}`);
  await loadLibrary(ed);
  return true;
}

export function registerFonts(reg: CommandRegistry, ed: DocEditor): void {
  ready = loadLibrary(ed).catch(() => undefined);
  const original = ed.load.bind(ed);
  ed.load = async (doc) => {
    await Promise.race([ready, wait(1500)]);
    await registerEmbedded(doc);
    for (const f of (doc.settings as unknown as { embeddedFonts?: Embedded[] }).embeddedFonts ?? []) if (typeof f?.family === 'string') addOption(ed, f.family);
    await original(doc);
  };
  let timer = 0;
  addPlugin(new Plugin({
    view: () => ({
      update: (view, prev) => {
        if (view.state.doc === prev.doc || !embedOn(ed)) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { void syncEmbedded(ed).catch(() => undefined); }, 1500);
      },
    }),
  }));
  onDocumentLoaded(() => { if (embedOn(ed)) void syncEmbedded(ed).catch(() => undefined); });
  const choose = picker('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', true, (files) => { void addFonts(ed, files).catch(fail('Could not add the font')); });
  reg.register({
    id: 'font.add', label: 'Add font', group: 'Format',
    description: 'Add .ttf, .otf, .woff or .woff2 fonts to the library; they appear in the font list at once. Upload with POST /api/objects/fonts, then run font.refresh.',
    run: () => { choose(); return true; },
  });
  reg.register({
    id: 'font.refresh', label: 'Refresh fonts', group: 'Format',
    description: 'Read the library fonts folder again and register any new fonts without reloading the page.',
    run: async () => (await loadLibrary(ed)).map((f) => ({ family: f.family, weight: f.weight, style: f.style, file: f.file })),
  });
  reg.register({
    id: 'font.manage', label: 'Manage fonts', group: 'Format',
    description: 'List the fonts added to the library and remove them.',
    run: async () => { await loadLibrary(ed).catch(() => undefined); manageDialog(ed); return true; },
  });
  reg.register({
    id: 'font.remove', label: 'Remove font', group: 'Format',
    description: 'Remove an added font file from the library.',
    params: [{ name: 'file', type: 'string', description: 'File name from font.refresh' }],
    run: (p) => removeFont(ed, String(p.file ?? '')),
  });
  reg.register({
    id: 'document.embedFonts', label: 'Embed fonts in the file', group: 'Format',
    description: 'Store the added fonts this document uses inside the .ftxt file so other FormTxt installs show them. With no parameter, toggles.',
    params: [{ name: 'on', type: 'boolean', description: 'true to embed, false to stop' }],
    run: async (p) => {
      const on = p.on === undefined ? !embedOn(ed) : p.on === true || p.on === 'true';
      ed.updatePage({}, { embedFonts: on });
      const list = await syncEmbedded(ed);
      return { on, embedded: list.map((f) => f.family) };
    },
  });
  addMenuItems('Format', [
    { cmd: 'font.add', label: 'Add font...' },
    { cmd: 'font.manage', label: 'Manage fonts...' },
    { cmd: 'document.embedFonts', label: 'Embed fonts in the file' },
  ]);
}
