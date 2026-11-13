import dataUrl from '../data/tabler-icons.json?url';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setText } from '../ui/dom';
import { toast } from '../ui/toast';
import type { DocEditor } from './editor';
import { retiredPath } from './retired-icons';
import { insertShape } from './shape';

interface Entry { name: string; cat: number; tags: string; o: string; f: string; label: string }
interface Library { source: string; cats: string[]; icons: Entry[] }

const LIMIT = 240;
let library: Promise<Library> | null = null;

function load(): Promise<Library> {
  library ??= fetch(dataUrl).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then((raw: { source: string; cats: string[]; icons: Array<[string, number, string, string, string]> }) => ({
    source: raw.source, cats: raw.cats, icons: raw.icons.filter((e) => !retiredPath(e[3])).map(([name, cat, tags, o, f]) => ({ name, cat, tags, o, f, label: name.replace(/-/g, ' ') })),
  }));
  library.catch(() => { library = null; });
  return library;
}

export async function findIcon(name: string): Promise<Entry | null> {
  const lib = await load();
  return lib.icons.find((e) => e.name === name) ?? null;
}

export function iconAttrs(e: Entry, filled: boolean, color: string, size: number): Record<string, unknown> {
  const solid = filled && !!e.f;
  return { kind: 'icon', path: solid ? e.f : e.o, box: [24, 24], width: size, height: size, fill: solid ? color : '', stroke: solid ? '' : color, strokeWidth: 0, text: '', wrap: 'inline', alt: e.label };
}

export function iconsDialog(ed: DocEditor): void {
  const d = new Dialog('Icons', 720);
  const search = el<HTMLInputElement>('<input class="ft-input" type="search" placeholder="Search 4,800 icons, such as arrow, chart or phone" spellcheck="false" aria-label="Search icons">');
  const cat = el<HTMLSelectElement>('<select class="ft-input" aria-label="Category"><option value="-1">All categories</option></select>');
  const style = el<HTMLSelectElement>('<select class="ft-input" aria-label="Style"><option value="outline">Outline</option><option value="filled">Filled</option></select>');
  const color = el<HTMLInputElement>('<input class="ft-input" type="color" value="#1a1a1a" aria-label="Colour">');
  const size = el<HTMLInputElement>('<input class="ft-input" type="number" min="8" max="400" step="1" value="36" aria-label="Size in points">');
  const bar = el('<div class="ft-icon-bar"></div>');
  bar.append(search, cat, style, color, size);
  const gridEl = el('<div class="ft-icon-grid" role="grid" aria-label="Icons"></div>');
  const status = el('<p class="ft-note"></p>');
  setText(status, 'Loading icons...');
  d.body.append(bar, gridEl, status);
  let lib: Library | null = null;
  let shown: Entry[] = [];
  let frame = 0;
  const render = (): void => {
    if (!lib || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const q = search.value.trim().toLowerCase();
      const c = Number(cat.value);
      const filled = style.value === 'filled';
      const words = q.split(/\s+/).filter(Boolean);
      const all = lib!.icons.filter((e) => (c < 0 || e.cat === c) && (!filled || !!e.f) && words.every((w) => e.name.includes(w) || e.tags.includes(w)));
      shown = all.slice(0, LIMIT);
      patchList(gridEl, shown, {
        key: (e) => `${filled ? 'f' : 'o'}:${e.name}`,
        create: (e) => el(`<button type="button" class="ft-icon-pick" title="${escapeHtml(e.label)}" aria-label="${escapeHtml(e.label)}">${filled ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${escapeHtml(e.f)}" fill-rule="evenodd"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${escapeHtml(e.o)}"/></svg>`}</button>`),
        update: () => undefined,
      });
      setText(status, all.length > LIMIT ? `Showing ${LIMIT} of ${all.length.toLocaleString()} icons; type to narrow the list. ${lib!.source}, MIT licence.` : `${all.length.toLocaleString()} icons. ${lib!.source}, MIT licence.`);
    });
  };
  for (const n of [search, cat, style]) n.addEventListener('input', render);
  gridEl.addEventListener('click', (e) => {
    const name = (e.target as HTMLElement).closest<HTMLElement>('.ft-icon-pick')?.dataset.key?.slice(2);
    const entry = name === undefined ? null : shown.find((x) => x.name === name);
    if (!entry) return;
    ed.run(insertShape(iconAttrs(entry, style.value === 'filled', color.value, Math.max(8, Number(size.value) || 36))));
    d.close();
  });
  d.button('Close', 'ghost', () => d.close());
  d.open(search);
  void load().then((l) => {
    lib = l;
    cat.insertAdjacentHTML('beforeend', l.cats.map((c, i) => `<option value="${i}">${escapeHtml(c)}</option>`).join(''));
    render();
  }).catch((e: Error) => { setText(status, ''); toast(`Could not load the icon library: ${e.message}`, 'error'); });
}
