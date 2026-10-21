import { api } from '../io/api';
import { Dialog } from '../ui/dialog';
import { el, escapeHtml, patchList, setClass, setHidden, setText } from '../ui/dom';
import { toast } from '../ui/toast';
import type { DocEditor } from './editor';

export interface StockItem { source: string; id: string; title: string; width: number; height: number; creator: string; license: string; provider: string; sourceUrl: string }
interface Sources { enabled: boolean; sources: Array<{ id: string; name: string; ready: boolean; note: string }> }

export async function stockSearch(source: string, q: string, page = 1): Promise<{ items: StockItem[]; total: number }> {
  return api.get<{ items: StockItem[]; total: number }>(`/stock/search?${new URLSearchParams({ q, source, page: String(page), per: '24' })}`);
}

export async function stockDialog(ed: DocEditor): Promise<void> {
  if (!ed.view) throw new Error('Open a document first.');
  const info = await api.get<Sources>('/stock/sources');
  if (!info.enabled) throw new Error('Stock picture search is turned off in Preferences.');
  const d = new Dialog('Stock images', 720);
  let source = 'openverse';
  let page = 1;
  let items: StockItem[] = [];
  let total = 0;
  let ticket = 0;
  const tabs = el(`<div class="ft-stock-tabs" role="tablist">${info.sources.map((s) => `<button type="button" role="tab" class="ft-emoji-tab" data-source="${s.id}" title="${escapeHtml(s.note)}">${escapeHtml(s.name)}</button>`).join('')}</div>`);
  const search = el<HTMLInputElement>('<input class="ft-input" type="search" placeholder="Search pictures, such as mountain lake" aria-label="Search stock images" spellcheck="true">');
  const go = el<HTMLButtonElement>('<button type="button" class="ft-btn">Search</button>');
  const head = el('<div class="ft-stock-head"></div>');
  head.append(search, go);
  const keyRow = el('<div class="ft-stock-key" hidden><input class="ft-input" type="password" autocomplete="off" spellcheck="false" placeholder="Pexels API key (free at pexels.com/api)" aria-label="Pexels API key"><button type="button" class="ft-btn">Save key</button></div>');
  const keyInput = keyRow.querySelector('input') as HTMLInputElement;
  const grid = el('<div class="ft-stock-grid" role="listbox" aria-label="Pictures"></div>');
  const status = el('<p class="ft-stock-status" aria-live="polite"></p>');
  const more = el<HTMLButtonElement>('<button type="button" class="ft-btn ghost ft-stock-more" style="visibility:hidden">More results</button>');
  const credit = el<HTMLInputElement>('<input type="checkbox" checked>');
  const creditRow = el('<label class="ft-stock-credit"></label>');
  creditRow.append(credit, document.createTextNode(' Add a credit line under the picture (Creative Commons licences require it)'));
  d.body.append(tabs, keyRow, head, grid, more, status, creditRow);
  const ready = (id: string): boolean => info.sources.find((s) => s.id === id)?.ready ?? false;
  const paint = (): void => {
    for (const b of tabs.querySelectorAll<HTMLElement>('[data-source]')) { const on = b.dataset.source === source; setClass(b, 'is-active', on); b.setAttribute('aria-selected', String(on)); }
    const needKey = source === 'pexels' && !ready('pexels');
    setHidden(keyRow, !needKey);
    setHidden(head, needKey);
    patchList(grid, items, {
      key: (it) => `${it.source}:${it.id}`,
      create: (it) => {
        const b = el<HTMLButtonElement>('<button type="button" class="ft-stock-item" role="option"><img alt="" loading="lazy" decoding="async"><span class="ft-stock-by"></span></button>');
        const img = b.querySelector('img') as HTMLImageElement;
        img.src = `/api/stock/thumb/${encodeURIComponent(it.source)}/${encodeURIComponent(it.id)}`;
        img.alt = it.title;
        b.dataset.source = it.source; b.dataset.id = it.id;
        b.title = `${it.title || 'Untitled'}\n${it.creator ? `by ${it.creator}, ` : ''}${it.license}, ${it.provider}`;
        setText(b.querySelector('.ft-stock-by'), it.creator || it.provider);
        return b;
      },
      update: () => undefined,
    });
    more.style.visibility = items.length && items.length < total ? '' : 'hidden';
  };
  const run = async (append = false): Promise<void> => {
    const q = search.value.trim();
    if (!q) { setText(status, 'Type what the picture should show.'); return; }
    if (source === 'pexels' && !ready('pexels')) { setText(status, 'Add a Pexels API key above to search Pexels.'); return; }
    const t = ++ticket;
    if (!append) { page = 1; items = []; paint(); }
    setText(status, 'Searching...');
    try {
      const r = await stockSearch(source, q, page);
      if (t !== ticket) return;
      items = append ? [...items, ...r.items.filter((x) => !items.some((y) => y.id === x.id))] : r.items;
      total = r.total;
      paint();
      setText(status, items.length ? `${items.length} of ${total.toLocaleString()} pictures from ${source === 'pexels' ? 'Pexels' : 'Openverse'}. Click one to insert it.` : 'No pictures match that search.');
    } catch (e) {
      if (t !== ticket) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (source === 'pexels' && /api key/i.test(msg)) {
        const px = info.sources.find((x) => x.id === 'pexels');
        if (px) px.ready = false;
        paint();
      }
      setText(status, msg);
    }
  };
  tabs.addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>('[data-source]')?.dataset.source;
    if (!s || s === source) return;
    source = s;
    items = [];
    paint();
    if (search.value.trim()) void run();
    else setText(status, '');
  });
  go.addEventListener('click', () => void run());
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } });
  more.addEventListener('click', () => { page++; void run(true); });
  (keyRow.querySelector('button') as HTMLButtonElement).addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) { toast('Paste your Pexels API key first.', 'error'); return; }
    void api.post<Record<string, unknown>>('/settings', { pexelsKey: key }).then((s) => {
      const px = info.sources.find((x) => x.id === 'pexels');
      if (px) px.ready = !!s.pexelsKeySet;
      keyInput.value = '';
      paint();
      toast('Pexels key saved on this computer.');
      if (search.value.trim()) void run();
    }).catch((err: Error) => toast(err.message, 'error'));
  });
  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.ft-stock-item');
    if (!b || b.classList.contains('is-busy')) return;
    b.classList.add('is-busy');
    setText(status, 'Downloading the picture...');
    void ed.insertStockPicture(b.dataset.source ?? '', b.dataset.id ?? '', credit.checked).then(() => d.close()).catch((err: Error) => { b.classList.remove('is-busy'); setText(status, err.message); });
  });
  d.button('Close', 'ghost', () => d.close());
  paint();
  d.open(search);
}
