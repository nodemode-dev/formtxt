import { commands } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, patchList, setClass, setDisabled, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { type ActivityRow, type CompareResult, type VersionDetail, type VersionRow, vx } from './api';
import { ask, requireView, when } from './core';

let root: HTMLElement | null = null;
let rows: VersionRow[] = [];
let selected = '';
let editor: DocEditor | null = null;
let detailToken = 0;

type ListItem = { kind: 'head'; key: string; title: string; sub: string } | { kind: 'row'; key: string; v: VersionRow };

const SESSION_GAP = 3600;
let poll = 0;

const label = (v: VersionRow): string => v.name || (v.reason === 'open' ? 'Opened' : 'Automatic version');
const clock = (ts: number): string => new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const editorsOf = (v: VersionRow): string[] => (v.editors && v.editors.length ? v.editors : [v.author]);

export function groupRows(list: VersionRow[]): ListItem[] {
  const sorted = [...list].sort((a, b) => b.ts - a.ts);
  const groups: VersionRow[][] = [];
  let cur: VersionRow[] = [];
  for (const v of sorted) {
    const prev = cur[cur.length - 1];
    if (prev && (prev.reason === 'open' || prev.ts - v.ts > SESSION_GAP || dayLabel(prev.ts) !== dayLabel(v.ts))) { groups.push(cur); cur = []; }
    cur.push(v);
  }
  if (cur.length) groups.push(cur);
  const out: ListItem[] = [];
  for (const g of groups) {
    const names = Array.from(new Set(g.flatMap(editorsOf)));
    const first = g[g.length - 1]!;
    const last = g[0]!;
    const span = g.length > 1 && clock(first.ts) !== clock(last.ts) ? `${clock(first.ts)} to ${clock(last.ts)}` : clock(first.ts);
    out.push({ kind: 'head', key: `h:${first.id}`, title: `${dayLabel(last.ts)}, ${span}`, sub: `${names.join(', ')} · ${g.length} version${g.length === 1 ? '' : 's'}` });
    for (const v of g) out.push({ kind: 'row', key: v.id, v });
  }
  return out;
}

export function bindHistory(ed: DocEditor): void {
  editor = ed;
}

export function historyElement(ed: DocEditor): HTMLElement {
  editor = ed;
  if (root) return root;
  root = el(`<div class="ft-vx-history">
<div class="ft-vx-name-row"><input class="ft-input" type="text" maxlength="120" placeholder="Name this version" aria-label="Version name"><button type="button" class="ft-btn primary" data-a="save">Save</button></div>
<div class="ft-vx-list" role="list" aria-label="Versions"></div>
<label class="ft-vx-auto"><span>Automatic version every</span><select class="ft-input" data-a="interval" aria-label="Automatic version interval"><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
<p class="ft-note ft-vx-empty" hidden>No versions yet. Versions are kept as you work, or save one with a name.</p>
<section class="ft-vx-detail" hidden aria-live="polite">
<h3 class="ft-vx-detail-title"></h3><p class="ft-note ft-vx-detail-meta"></p>
<div class="ft-vx-thumb"><img alt="" decoding="async"></div>
<p class="ft-vx-diff"></p><p class="ft-vx-cmp-title">Changes since this version</p><div class="ft-vx-changes" aria-label="Changes since this version"></div><p class="ft-note ft-vx-cmp-note"></p>
<div class="ft-vx-text" tabindex="0" aria-label="Text of this version"></div>
<div class="ft-vx-actions"><button type="button" class="ft-btn primary" data-a="restore">Restore this version</button><button type="button" class="ft-btn" data-a="rename">Name this version</button><button type="button" class="ft-btn danger" data-a="delete">Delete</button></div>
</section></div>`);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const row = t.closest<HTMLElement>('[data-vid]');
    const act = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (act === 'save') { const box = root!.querySelector('input') as HTMLInputElement; void saveNamed(box.value).then(() => { box.value = ''; }); return; }
    if (act === 'restore') { confirmRestore(selected); return; }
    if (act === 'rename') { const v = rows.find((r) => r.id === selected); if (v) ask('Rename version', 'Name', 'text', 'Rename', async (n) => { await vx.rename(editor!.docId(), v.id, n); await refreshHistory(); }); return; }
    if (act === 'delete') { void removeVersion(selected); return; }
    if (row?.dataset.vid) select(row.dataset.vid);
  });
  const sel = root.querySelector<HTMLSelectElement>('[data-a="interval"]')!;
  sel.addEventListener('change', () => { void vx.setAutoMinutes(Number(sel.value)).then(() => toast(`Automatic versions every ${sel.value} minutes.`)).catch((e: Error) => toast(e.message, 'error')); });
  void vx.autoSettings().then((s) => {
    const m = String(Math.round(s.autoVersionMinutes));
    if (!Array.from(sel.options).some((o) => o.value === m)) { const o = document.createElement('option'); o.value = m; o.textContent = `${m} minutes`; sel.appendChild(o); }
    sel.value = m;
  }).catch(() => undefined);
  if (!poll) poll = window.setInterval(() => { if (root?.isConnected && !document.hidden) void refreshHistory().catch(() => undefined); }, 30000);
  return root;
}

export async function saveNamed(name: string): Promise<VersionRow> {
  requireView(editor!);
  const cur = editor!.current();
  if (cur) await api.put(`/documents/${encodeURIComponent(cur.id)}`, cur);
  const row = await vx.name(editor!.docId(), name.trim());
  await refreshHistory();
  select(row.id);
  toast(`Saved version ${row.name}.`);
  return row;
}

async function removeVersion(vid: string): Promise<void> {
  if (!vid) return;
  await vx.remove(editor!.docId(), vid);
  selected = '';
  await refreshHistory();
}

export function confirmRestore(vid: string): void {
  const v = rows.find((r) => r.id === vid);
  if (!v) return;
  const d = new Dialog('Restore this version', 440);
  const p = el('<p class="ft-note"></p>');
  setText(p, `Restore "${label(v)}" from ${when(v.ts)}? Your document as it is now is kept as a version called Before restore, so nothing is lost.`);
  d.body.appendChild(p);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Restore', 'primary', () => { d.close(); void restoreVersion(vid).catch((e: Error) => toast(e.message, 'error')); });
  d.open();
}

export async function restoreVersion(vid: string): Promise<void> {
  requireView(editor!);
  const id = editor!.docId();
  await commands.run('file.open', { id });
  await vx.restore(id, vid);
  await commands.run('file.open', { id });
  toast('Version restored. The earlier text is still in the version list.');
}

function select(vid: string): void {
  selected = vid;
  paintList();
  void paintDetail(vid);
}

function paintList(): void {
  if (!root) return;
  const list = root.querySelector('.ft-vx-list') as HTMLElement;
  patchList(list, groupRows(rows), {
    key: (it) => it.key,
    create: (it) => {
      if (it.kind === 'head') {
        const h = el('<div class="ft-vx-group" role="presentation"><span class="ft-vx-group-title"></span><span class="ft-vx-group-sub"></span></div>');
        paintHead(h, it);
        return h;
      }
      const n = el('<button type="button" class="ft-vx-row" role="listitem"><span class="ft-vx-row-name"></span><span class="ft-vx-row-meta"></span></button>');
      n.dataset.vid = it.v.id;
      paintRow(n, it.v);
      return n;
    },
    update: (n, it) => { if (it.kind === 'head') paintHead(n, it); else paintRow(n, it.v); },
  });
  setHidden(root.querySelector('.ft-vx-empty') as HTMLElement, rows.length > 0);
  setHidden(root.querySelector('.ft-vx-detail') as HTMLElement, !selected || !rows.some((r) => r.id === selected));
}

function paintHead(n: HTMLElement, it: Extract<ListItem, { kind: 'head' }>): void {
  setText(n.querySelector('.ft-vx-group-title'), it.title);
  setText(n.querySelector('.ft-vx-group-sub'), it.sub);
}

function paintRow(n: HTMLElement, v: VersionRow): void {
  setText(n.querySelector('.ft-vx-row-name'), label(v));
  setText(n.querySelector('.ft-vx-row-meta'), `${clock(v.ts)} · ${editorsOf(v).join(', ')} · ${v.words} word${v.words === 1 ? '' : 's'}${v.name ? '' : ' · automatic'}`);
  setClass(n, 'is-named', !!v.name);
  setClass(n, 'is-selected', v.id === selected);
  n.setAttribute('aria-current', v.id === selected ? 'true' : 'false');
}

async function paintDetail(vid: string): Promise<void> {
  if (!root || !vid) return;
  const token = ++detailToken;
  const v = rows.find((r) => r.id === vid);
  if (!v) return;
  setHidden(root.querySelector('.ft-vx-detail') as HTMLElement, false);
  setText(root.querySelector('.ft-vx-detail-title'), label(v));
  setText(root.querySelector('.ft-vx-detail-meta'), `${when(v.ts)} by ${v.author}`);
  const img = root.querySelector('.ft-vx-thumb img') as HTMLImageElement;
  const src = `/api/versions/${encodeURIComponent(editor!.docId())}/v/${encodeURIComponent(vid)}/thumb.svg`;
  if (img.getAttribute('src') !== src) img.src = src;
  let d: VersionDetail;
  let cmp: CompareResult | null = null;
  try {
    const both = await Promise.all([vx.detail(editor!.docId(), vid), vx.compare(editor!.docId(), vid).catch(() => null)]);
    d = both[0];
    cmp = both[1];
  } catch (e) { toast((e as Error).message, 'error'); return; }
  if (token !== detailToken || !root) return;
  setText(root.querySelector('.ft-vx-diff'), d.diff.added || d.diff.removed ? `Compared with the current document: ${d.diff.removed} word${d.diff.removed === 1 ? '' : 's'} would come back, ${d.diff.added} would go.` : 'The text matches the current document.');
  const changes = root.querySelector('.ft-vx-changes') as HTMLElement;
  patchList(changes, (cmp?.rows ?? []).map((c, i) => ({ ...c, i })), {
    key: (c) => String(c.i),
    create: () => el('<p class="ft-vx-change"></p>'),
    update: (n, c) => {
      const spans = c.segments.map((s) => {
        const sp = document.createElement('span');
        sp.className = `ft-vx-seg is-${s.kind}`;
        sp.textContent = s.text;
        return sp;
      });
      n.replaceChildren(...spans);
    },
  });
  setText(root.querySelector('.ft-vx-cmp-note'), cmp ? (cmp.changed ? `${cmp.changed} paragraph${cmp.changed === 1 ? '' : 's'} differ. Green was added since this version, red was removed.${cmp.truncated ? ' Only the first are shown.' : ''}` : 'No differences from the current document.') : 'The comparison is not available.');
  const text = root.querySelector('.ft-vx-text') as HTMLElement;
  patchList(text, d.outline.slice(0, 200).map((o, i) => ({ ...o, i })), {
    key: (o) => String(o.i),
    create: () => el('<p class="ft-vx-line"></p>'),
    update: (n, o) => { setText(n, o.text || ' '); n.dataset.style = o.style; },
  });
  setDisabled(root.querySelector('[data-a="restore"]') as HTMLButtonElement, false);
}

export async function refreshHistory(): Promise<VersionRow[]> {
  if (!editor?.doc) return [];
  rows = await vx.list(editor.docId());
  if (selected && !rows.some((r) => r.id === selected)) selected = '';
  paintList();
  return rows;
}

export function versionRows(): VersionRow[] {
  return rows;
}

const KINDS: Record<string, string> = { open: 'Opened', edit: 'Edited', version: 'Saved version', restore: 'Restored a version', password: 'Password', unlock: 'Unlocked' };

export async function activityDialog(ed: DocEditor): Promise<ActivityRow[]> {
  requireView(ed);
  const events = await vx.activity(ed.docId());
  const d = new Dialog('Activity', 560);
  const list = el('<div class="ft-vx-activity" role="list"></div>');
  patchList(list, events.map((ev, i) => ({ ...ev, i })), {
    key: (ev) => String(ev.i),
    create: (ev) => {
      const n = el('<div class="ft-vx-act" role="listitem"><span class="ft-vx-act-who"></span><span class="ft-vx-act-what"></span><span class="ft-vx-act-when"></span></div>');
      setText(n.querySelector('.ft-vx-act-who'), ev.who);
      setClass(n, 'is-agent', ev.who === 'Agent');
      setText(n.querySelector('.ft-vx-act-what'), `${KINDS[ev.kind] ?? ev.kind}${ev.kind === 'edit' && ev.count > 1 ? ` (${ev.count} saves)` : ''}${ev.detail ? `: ${ev.detail}` : ''}`);
      setText(n.querySelector('.ft-vx-act-when'), ev.kind === 'edit' && ev.until - ev.ts > 60 ? `${when(ev.ts)} to ${new Date(ev.until * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : when(ev.ts));
      return n;
    },
    update: () => undefined,
  });
  if (!events.length) list.appendChild(el('<p class="ft-note">No activity has been recorded yet.</p>'));
  d.body.appendChild(list);
  d.body.appendChild(el('<p class="ft-note">Opens and saves are recorded by person. Changes made through the command line or the live bridge are listed as Agent.</p>'));
  d.button('Close', 'primary', () => d.close());
  d.open();
  return events;
}

export function nameDialog(ed: DocEditor): void {
  requireView(ed);
  ask('Name this version', 'Version name', 'text', 'Save version', async (n) => { await saveNamed(n); });
}
