import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { NodeSelection, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Block } from '../../../engine/model';
import type { CommandRegistry } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { blocksToNodes, fromPM } from '../../convert';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { addPlugin } from '../plugins';
import { addMenuItems } from '../ui';
import { later, message, patch as patchList, wsUrl } from './util';

interface Component { id: string; name: string; rev: number; source?: string; blocks: Block[] }
interface Summary { id: string; name: string; rev: number; modified: number; blocks: number }

const ALLOWED = new Set(['paragraph', 'code_block', 'table']);
const key = new PluginKey('ftComponents');
const synced = new Map<string, string>();
const seen = new WeakSet<PMNode>();
const timers = new Map<string, number>();
let live: WebSocket | null = null;
let liveRetry = 0;
let ed: DocEditor;

function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== 'id').map(([k, x]) => [k, strip(x)]));
  return v;
}

const norm = (blocks: unknown): string => JSON.stringify(strip(blocks));
const section = (): string => ed.doc?.sections[0]?.id ?? '';
const blocksOf = (node: PMNode): Block[] => fromPM(node, section());

function instances(doc: PMNode): Array<{ pos: number; node: PMNode }> {
  const out: Array<{ pos: number; node: PMNode }> = [];
  doc.forEach((node, pos) => { if (node.type === schema.nodes.component) out.push({ pos, node }); });
  return out;
}

function withSource(node: PMNode, src: string): PMNode {
  if (node.type === schema.nodes.image) return node.attrs.from || !src ? node : node.type.create({ ...node.attrs, from: src }, null, node.marks);
  if (node.isLeaf) return node;
  const kids: PMNode[] = [];
  node.forEach((c) => kids.push(withSource(c, src)));
  return node.copy(Fragment.fromArray(kids));
}

function contentNodes(blocks: Block[], src: string): PMNode[] {
  const own = ed.docId();
  return blocksToNodes(blocks).filter((n) => ALLOWED.has(n.type.name)).map((n) => (src && src !== own ? withSource(n, src) : n));
}

function ensureLive(): void {
  if (live && live.readyState <= WebSocket.OPEN) return;
  const sock = new WebSocket(wsUrl('/collab/components/live'));
  live = sock;
  sock.onopen = () => { liveRetry = 0; };
  sock.onmessage = (e) => { try { onLive(JSON.parse(String(e.data)) as Record<string, unknown>); } catch { void 0; } };
  sock.onclose = () => {
    if (live !== sock) return;
    live = null;
    const v = ed.view;
    if (v && instances(v.state.doc).length) {
      liveRetry = Math.min(liveRetry + 1, 5);
      window.setTimeout(ensureLive, 1000 * 2 ** liveRetry);
    }
  };
}

function replaceContent(v: EditorView, cid: string, comp: { name: string; rev: number; source?: string; blocks: Block[] }): void {
  const target = norm(comp.blocks);
  let tr = v.state.tr;
  let any = false;
  for (const { pos, node } of instances(v.state.doc).reverse()) {
    if (node.attrs.cid !== cid) continue;
    if (timers.has(cid) && norm(blocksOf(node)) !== target) continue;
    if (norm(blocksOf(node)) === target && node.attrs.name === comp.name) continue;
    const nodes = contentNodes(comp.blocks, comp.source ?? '');
    if (!nodes.length) continue;
    tr = tr.replaceWith(pos + 1, pos + node.nodeSize - 1, nodes);
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, name: comp.name, rev: comp.rev });
    any = true;
  }
  synced.set(cid, target);
  if (any) v.dispatch(tr.setMeta('componentSync', true).setMeta('addToHistory', false).setMeta('paste', true));
}

function unwrap(v: EditorView, cid: string): void {
  let tr = v.state.tr;
  let any = false;
  for (const { pos, node } of instances(v.state.doc).reverse()) {
    if (node.attrs.cid !== cid) continue;
    tr = tr.replaceWith(pos, pos + node.nodeSize, node.content);
    any = true;
  }
  synced.delete(cid);
  if (any) v.dispatch(tr.setMeta('componentSync', true));
}

function onLive(msg: Record<string, unknown>): void {
  const v = ed.view;
  if (!v) return;
  const cid = String(msg.id ?? '');
  if (msg.t === 'component') replaceContent(v, cid, { name: String(msg.name ?? ''), rev: Number(msg.rev) || 0, source: String(msg.source ?? ''), blocks: msg.blocks as Block[] });
  else if (msg.t === 'component-gone') unwrap(v, cid);
}

function push(cid: string): void {
  timers.delete(cid);
  const v = ed.view;
  if (!v) return;
  const known = synced.get(cid);
  let blocks: Block[] = [];
  let n = '';
  let name = '';
  for (const { node } of instances(v.state.doc)) {
    if (node.attrs.cid !== cid) continue;
    const b = blocksOf(node);
    if (norm(b) !== known) { blocks = b; n = norm(b); name = String(node.attrs.name); break; }
  }
  if (!n) return;
  synced.set(cid, n);
  void api.put(`/collab/components/${encodeURIComponent(cid)}`, { name, blocks, source: ed.docId() }).catch((e: Error) => toast(`Could not update the component: ${e.message}`, 'error'));
}

function schedule(cid: string): void {
  window.clearTimeout(timers.get(cid));
  timers.set(cid, window.setTimeout(() => push(cid), 450));
}

async function reconcile(): Promise<void> {
  const v = ed.view;
  if (!v) return;
  const list = instances(v.state.doc);
  if (!list.length) return;
  ensureLive();
  const ids = [...new Set(list.map((i) => String(i.node.attrs.cid)))];
  for (const cid of ids) {
    try {
      const comp = await api.get<Component>(`/collab/components/${encodeURIComponent(cid)}`);
      if (ed.view === v) replaceContent(v, cid, comp);
    } catch {
      const first = list.find((i) => i.node.attrs.cid === cid);
      if (first) synced.set(cid, norm(blocksOf(first.node)));
    }
  }
}

const plugin = new Plugin({
  key,
  view() {
    const first = later(() => void reconcile(), 60);
    first();
    return {
      update(v: EditorView, prev: EditorState) {
        if (v.state.doc === prev.doc) return;
        for (const { node } of instances(v.state.doc)) {
          if (seen.has(node)) continue;
          seen.add(node);
          const cid = String(node.attrs.cid);
          if (cid && synced.has(cid) && synced.get(cid) !== norm(blocksOf(node))) schedule(cid);
        }
      },
    };
  },
});

function topRange(state: EditorState): { from: number; to: number } {
  const { selection } = state;
  const { $from, $to } = selection;
  if (selection instanceof NodeSelection && selection.$from.depth === 0) return { from: selection.from, to: selection.to };
  if ($from.depth === 0 || $to.depth === 0) throw new Error('Select some text first.');
  return { from: $from.before(1), to: $to.after(1) };
}

async function createFromSelection(name: string): Promise<{ id: string; name: string }> {
  const v = ed.view;
  if (!v) throw new Error('Open a document first.');
  const { from, to } = topRange(v.state);
  const nodes: PMNode[] = [];
  v.state.doc.nodesBetween(from, to, (n, pos) => { if (pos >= from && pos + n.nodeSize <= to && (n.type.name !== 'doc')) { nodes.push(n); return false; } return true; });
  if (!nodes.length) throw new Error('Select some text first.');
  if (nodes.some((n) => !ALLOWED.has(n.type.name))) throw new Error('A component can hold paragraphs, code and tables.');
  const holder = schema.nodes.component.create({}, nodes);
  const blocks = blocksOf(holder);
  const title = name.trim() || (nodes[0].textContent.trim().slice(0, 40) || 'Component');
  const comp = await api.post<Component>('/collab/components', { name: title, blocks, source: ed.docId() });
  synced.set(comp.id, norm(blocks));
  const instance = schema.nodes.component.create({ cid: comp.id, name: comp.name, rev: comp.rev, src: ed.docId() }, nodes);
  seen.add(instance);
  v.dispatch(v.state.tr.replaceWith(from, to, instance).setMeta('componentSync', true));
  ensureLive();
  return { id: comp.id, name: comp.name };
}

async function insertComponent(id: string): Promise<{ id: string; name: string }> {
  const v = ed.view;
  if (!v) throw new Error('Open a document first.');
  const comp = await api.get<Component>(`/collab/components/${encodeURIComponent(id)}`);
  const nodes = contentNodes(comp.blocks, comp.source ?? '');
  if (!nodes.length) throw new Error('That component is empty.');
  const instance = schema.nodes.component.create({ cid: comp.id, name: comp.name, rev: comp.rev, src: comp.source ?? '' }, nodes);
  const { $to } = v.state.selection;
  const at = $to.depth >= 1 ? $to.after(1) : $to.pos;
  synced.set(comp.id, norm(comp.blocks));
  seen.add(instance);
  v.dispatch(v.state.tr.insert(at, instance).setMeta('componentSync', true).setMeta('paste', true).scrollIntoView());
  ensureLive();
  return { id: comp.id, name: comp.name };
}

function unlinkAtCursor(): boolean {
  const v = ed.view;
  if (!v) throw new Error('Open a document first.');
  const { $from } = v.state.selection;
  for (let d = $from.depth; d >= 1; d--) {
    const n = $from.node(d);
    if (n.type === schema.nodes.component) {
      const pos = $from.before(d);
      v.dispatch(v.state.tr.replaceWith(pos, pos + n.nodeSize, n.content));
      return true;
    }
  }
  throw new Error('Put the cursor inside a component first.');
}

let dialog: { d: Dialog; list: HTMLElement; note: HTMLElement; name: HTMLInputElement } | null = null;

async function refreshDialog(): Promise<void> {
  if (!dialog) return;
  const { components } = await api.get<{ components: Summary[] }>('/collab/components');
  patchList(dialog.list, components, {
    key: (c) => c.id,
    create: (c) => {
      const row = el('<div class="ft-cmp-row"><span class="ft-cmp-name"></span><span class="ft-cmp-meta"></span><button type="button" class="ft-btn sm" data-act="insert">Insert</button><button type="button" class="ft-btn sm ghost" data-act="rename">Rename</button><button type="button" class="ft-btn sm danger" data-act="delete">Delete</button></div>');
      row.dataset.id = c.id;
      return row;
    },
    update: (node, c) => {
      node.dataset.id = c.id;
      node.dataset.name = c.name;
      setText(node.querySelector('.ft-cmp-name'), c.name);
      setText(node.querySelector('.ft-cmp-meta'), `${c.blocks} block${c.blocks === 1 ? '' : 's'}, revision ${c.rev}`);
    },
  });
  dialog.note.hidden = components.length > 0;
}

function openDialog(): void {
  if (!dialog) {
    const d = new Dialog('Components', 560);
    d.body.appendChild(el('<p class="ft-cmp-help">A component is a block of text or a table kept in your library. Insert it into any document; an edit in one place updates every copy, on open and live while documents are open.</p>'));
    const name = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" placeholder="Name for the selection (optional)">');
    d.field('Save the selection as a component', name);
    const save = el<HTMLButtonElement>('<button type="button" class="ft-btn sm primary">Save selection as component</button>');
    d.body.appendChild(save);
    const list = el('<div class="ft-cmp-list"></div>');
    const note = el('<p class="ft-cmp-empty">No components yet. Select some text and save it as a component.</p>');
    d.body.append(el('<h3 class="ft-cmp-head">In your library</h3>'), list, note);
    d.button('Close', 'primary', () => d.close());
    save.addEventListener('click', () => {
      void createFromSelection(name.value).then((c) => { toast(`Saved ${c.name}.`); name.value = ''; return refreshDialog(); }).catch((e) => toast(message(e), 'error'));
    });
    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const row = btn?.closest<HTMLElement>('[data-id]');
      if (!btn || !row?.dataset.id) return;
      const id = row.dataset.id;
      if (btn.dataset.act === 'insert') void insertComponent(id).then(() => d.close()).catch((err) => toast(message(err), 'error'));
      else if (btn.dataset.act === 'delete') void api.del(`/collab/components/${encodeURIComponent(id)}`).then(refreshDialog).catch((err) => toast(message(err), 'error'));
      else if (btn.dataset.act === 'rename') {
        const next = window.prompt('Component name', row.dataset.name ?? '');
        if (next?.trim()) void api.put(`/collab/components/${encodeURIComponent(id)}`, { name: next.trim() }).then(refreshDialog).catch((err) => toast(message(err), 'error'));
      }
    });
    dialog = { d, list, note, name };
  }
  dialog.d.open(dialog.name);
  void refreshDialog().catch((e) => toast(message(e), 'error'));
}

export function registerComponents(reg: CommandRegistry, editor: DocEditor): void {
  ed = editor;
  addPlugin(plugin);
  reg.register({ id: 'collab.component.manage', label: 'Components', group: 'Share', description: 'Open the library of components: blocks you insert into many documents and edit in one place.', run: () => { openDialog(); return true; } });
  reg.register({
    id: 'collab.component.create',
    label: 'Save selection as component',
    group: 'Share',
    description: 'Save the selected paragraphs or table as a live component in the library; the selection becomes the first copy.',
    params: [{ name: 'name', type: 'string', description: 'Name of the component; defaults to the start of the text' }],
    run: (p) => createFromSelection(String(p.name ?? '')),
  });
  reg.register({
    id: 'collab.component.insert',
    label: 'Insert component',
    group: 'Share',
    description: 'Insert a copy of a library component after the current block.',
    params: [{ name: 'id', type: 'string', description: 'Component id, from collab.component.list' }],
    run: (p) => insertComponent(String(p.id ?? '')),
  });
  reg.register({
    id: 'collab.component.list',
    label: 'List components',
    group: 'Share',
    description: 'List the components in the library.',
    run: async () => (await api.get<{ components: Summary[] }>('/collab/components')).components.map((c) => ({ id: c.id, name: c.name, rev: c.rev })),
  });
  reg.register({
    id: 'collab.component.delete',
    label: 'Delete component',
    group: 'Share',
    description: 'Delete a component from the library; copies in documents become ordinary text.',
    params: [{ name: 'id', type: 'string', description: 'Component id' }],
    run: async (p) => { await api.del(`/collab/components/${encodeURIComponent(String(p.id ?? ''))}`); return true; },
  });
  reg.register({ id: 'collab.component.unlink', label: 'Unlink component', group: 'Share', description: 'Turn the component copy at the cursor into ordinary text that no longer updates.', run: () => unlinkAtCursor() });
  addMenuItems('Share', [
    { cmd: 'collab.component.create', label: 'Save selection as component' },
    { cmd: 'collab.component.manage', label: 'Components...' },
  ]);
}
