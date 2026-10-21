import { collab, getVersion, receiveTransaction, sendableSteps } from 'prosemirror-collab';
import { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from 'prosemirror-state';
import { Step } from 'prosemirror-transform';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { commands } from '../../../engine/registry';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { addPlugin } from '../plugins';
import { CLIENT_ID, colorFor, later, myName, wsUrl } from './util';

export interface Peer { id: string; name: string; color: string; tab: string; access: string }
interface Remote { id: string; name: string; color: string; tab: string; anchor: number; head: number }
interface UiState { id: string; remote: Record<string, Remote> }
type Meta = { set?: Remote; drop?: string };
type Access = 'edit' | 'comment' | 'view';
type Status = 'off' | 'joining' | 'live' | 'offline';

const uiKey = new PluginKey<UiState>('ftCollab');
const collabPlugin = collab({ version: 0, clientID: CLIENT_ID });
const SNAP_EVERY = 80;

let ed: DocEditor | null = null;
let ws: WebSocket | null = null;
let docId = '';
let tab = '';
let token = '';
let tokenDoc = '';
let sid = '';
let stateId = '';
let status: Status = 'off';
let access: Access = 'edit';
let joinDoc: PMNode | null = null;
let inflight = false;
let inflightTimer = 0;
let snapBase = 0;
let retry = 0;
let retryTimer = 0;
let joinTimer = 0;
let peers: Peer[] = [];
let rejoined = false;
let restricted = false;
let forcedRead = false;
const listeners = new Set<() => void>();

const changed = (): void => { for (const l of listeners) l(); };

export function onLiveChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function liveInfo(): { status: Status; access: Access; peers: Peer[]; me: string; docId: string } {
  return { status, access, peers, me: CLIENT_ID, docId };
}

export function useShareToken(t: string, doc: string): void {
  token = t;
  tokenDoc = doc;
}

export function commentsAllowed(): boolean {
  return commands.list().some((c) => /^review\..*comment/i.test(c.id));
}

function commentOnly(tr: Transaction): boolean {
  return tr.steps.every((s) => {
    const j = s.toJSON() as { stepType?: string; mark?: { type?: string } };
    return (j.stepType === 'addMark' || j.stepType === 'removeMark') && String(j.mark?.type ?? '').includes('comment');
  });
}

function setStatus(next: Status): void {
  if (status === next) return;
  status = next;
  changed();
}

function send(message: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function view(): EditorView | null {
  return ed?.view ?? null;
}

function collabState(state: EditorState): { version: number; unconfirmed: unknown[] } {
  return collabPlugin.getState(state) as { version: number; unconfirmed: unknown[] };
}

function applyAccess(): void {
  const v = view();
  if (!v || !ed) return;
  ed.root.dataset.access = access;
  if (access === 'view' && ed.viewMode !== 'read') { forcedRead = true; ed.setView('read'); }
  else if (access !== 'edit') { restricted = true; v.setProps({ editable: () => false }); }
  else if (restricted || forcedRead) {
    if (forcedRead) ed.setView('print');
    v.setProps({ editable: () => ed?.viewMode !== 'read' });
    restricted = false;
    forcedRead = false;
  }
  changed();
}

function closeSocket(): void {
  window.clearTimeout(retryTimer);
  window.clearTimeout(joinTimer);
  window.clearTimeout(inflightTimer);
  const old = ws;
  ws = null;
  if (old) { old.onclose = null; old.onmessage = null; old.onerror = null; old.close(); }
  inflight = false;
  peers = [];
  access = 'edit';
  applyAccess();
  setStatus('off');
}

async function connect(): Promise<void> {
  const id = docId;
  const name = await myName();
  if (id !== docId || !id) return;
  const q = new URLSearchParams({ cid: CLIENT_ID, name, color: colorFor(CLIENT_ID).slice(1) });
  if (token && tokenDoc === id) q.set('token', token);
  const sock = new WebSocket(`${wsUrl(`/collab/${encodeURIComponent(id)}`)}?${q.toString()}`);
  ws = sock;
  sock.onopen = () => { retry = 0; join(!sid || stateIdChanged()); };
  sock.onmessage = (e) => { try { handle(JSON.parse(String(e.data)) as Record<string, unknown>); } catch { void 0; } };
  sock.onerror = () => undefined;
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    inflight = false;
    peers = [];
    setStatus('offline');
    if (e.code === 4403 || e.code === 4404 || retry >= 8) return;
    retry++;
    retryTimer = window.setTimeout(() => { if (docId === id && !ws) void connect(); }, Math.min(30000, 600 * 2 ** retry));
  };
}

function stateIdChanged(): boolean {
  const v = view();
  return !!v && (uiKey.getState(v.state)?.id ?? '') !== stateId;
}

function join(fresh: boolean): void {
  const v = view();
  if (!v || !ed) return;
  stateId = uiKey.getState(v.state)?.id ?? '';
  tab = ed.activeTab;
  if (fresh) {
    sid = '';
    v.dispatch(v.state.tr.setMeta(collabPlugin, { version: 0, unconfirmed: [] }).setMeta('addToHistory', false));
  }
  joinDoc = v.state.doc;
  inflight = false;
  setStatus('joining');
  send({ t: 'join', tab, sid, version: getVersion(v.state), doc: fresh ? v.state.doc.toJSON() : undefined });
  window.clearTimeout(joinTimer);
  joinTimer = window.setTimeout(() => { if (status === 'joining') setStatus('offline'); }, 3000);
}

export function syncSession(): void {
  const v = view();
  if (!ed || !v || !ed.docId()) return;
  const want = ed.docId();
  if (want !== docId) {
    closeSocket();
    docId = want;
    sid = '';
    rejoined = false;
    void connect();
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN && (ed.activeTab !== tab || stateIdChanged())) join(true);
}

function toSteps(raw: unknown): Step[] {
  return (Array.isArray(raw) ? raw : []).map((s) => Step.fromJSON(schema, s));
}

function handle(msg: Record<string, unknown>): void {
  const t = msg.t;
  if (t === 'init' || t === 'denied') onInit(msg);
  else if (t === 'steps') onSteps(msg);
  else if (t === 'peers') { peers = (msg.peers as Peer[]) ?? []; changed(); }
  else if (t === 'presence') onPresence(msg as unknown as Remote);
  else if (t === 'leave') {
    const v = view();
    if (v) v.dispatch(v.state.tr.setMeta(uiKey, { drop: String(msg.id) } satisfies Meta).setMeta('addToHistory', false));
  }
}

function onInit(msg: Record<string, unknown>): void {
  const v = view();
  if (!v || !ed) return;
  window.clearTimeout(joinTimer);
  if (msg.t === 'denied') {
    access = (msg.access as Access) ?? 'view';
    applyAccess();
    join(true);
    return;
  }
  const mode = String(msg.mode);
  access = (msg.access as Access) ?? 'edit';
  if (mode === 'gone') {
    if (rejoined) { setStatus('offline'); return; }
    rejoined = true;
    join(true);
    return;
  }
  rejoined = false;
  sid = String(msg.sid ?? '');
  if (Array.isArray(msg.peers)) peers = msg.peers as Peer[];
  const version = Number(msg.version) || 0;
  const base = msg.base as { version: number; doc: unknown } | null;
  try {
    if (mode === 'replace' && base) {
      let doc = PMNode.fromJSON(schema, base.doc);
      for (const s of toSteps(msg.steps)) {
        const r = s.apply(doc);
        if (!r.doc) throw new Error('A shared step did not apply.');
        doc = r.doc;
      }
      snapBase = base.version;
      if (joinDoc && doc.eq(joinDoc)) {
        v.dispatch(v.state.tr.setMeta(collabPlugin, { version, unconfirmed: collabState(v.state).unconfirmed }).setMeta('addToHistory', false));
      } else {
        const head = v.state.selection.head;
        const tr = v.state.tr.replaceWith(0, v.state.doc.content.size, doc.content).setMeta('collabInit', true).setMeta(collabPlugin, { version, unconfirmed: [] }).setMeta('addToHistory', false);
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(head, tr.doc.content.size))));
        v.dispatch(tr);
      }
    } else if (mode === 'resume') {
      const steps = toSteps(msg.steps);
      if (steps.length) v.dispatch(receiveTransaction(v.state, steps, (msg.ids as string[]).slice(0, steps.length)).setMeta('collabRemote', true));
    } else {
      snapBase = 0;
    }
  } catch {
    setStatus('offline');
    return;
  }
  setStatus('live');
  applyAccess();
  inflight = false;
  flush();
  sendPresence();
}

function onSteps(msg: Record<string, unknown>): void {
  const v = view();
  if (!v) return;
  if (typeof msg.base === 'number') snapBase = msg.base;
  const from = Number(msg.from) || 0;
  const have = getVersion(v.state);
  if (from > have) { join(false); return; }
  const skip = have - from;
  const steps = toSteps(msg.steps).slice(skip);
  const ids = ((msg.ids as string[]) ?? []).slice(skip);
  try {
    if (steps.length) v.dispatch(receiveTransaction(v.state, steps, ids).setMeta('collabRemote', true));
  } catch {
    join(true);
    return;
  }
  inflight = false;
  window.clearTimeout(inflightTimer);
  flush();
  maybeSnapshot();
}

function flush(): void {
  const v = view();
  if (!v || status !== 'live' || inflight || access === 'view') return;
  const s = sendableSteps(v.state);
  if (!s) return;
  inflight = true;
  send({ t: 'steps', version: s.version, steps: s.steps.map((x) => x.toJSON()) });
  window.clearTimeout(inflightTimer);
  inflightTimer = window.setTimeout(() => { inflight = false; flush(); }, 4000);
}

const snapLater = later(() => {
  const v = view();
  if (!v || status !== 'live' || access !== 'edit' || sendableSteps(v.state)) return;
  const version = getVersion(v.state);
  if (version - snapBase >= SNAP_EVERY) send({ t: 'snap', version, doc: v.state.doc.toJSON() });
}, 1500);

function maybeSnapshot(): void {
  const v = view();
  if (v && getVersion(v.state) - snapBase >= SNAP_EVERY) snapLater();
}

const presenceLater = later(() => sendPresence(), 80);

function sendPresence(): void {
  const v = view();
  if (!v || status !== 'live') return;
  const { anchor, head } = v.state.selection;
  send({ t: 'presence', anchor, head });
}

function onPresence(r: Remote): void {
  const v = view();
  if (!v || !r.id || r.id === CLIENT_ID || r.tab !== tab) return;
  v.dispatch(v.state.tr.setMeta(uiKey, { set: r } satisfies Meta).setMeta('addToHistory', false));
}

function caret(r: Remote): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'ft-rc';
  wrap.style.setProperty('--rc', r.color);
  const bar = document.createElement('i');
  bar.className = 'ft-rc-caret';
  const label = document.createElement('b');
  label.className = 'ft-rc-label';
  label.textContent = r.name;
  wrap.append(bar, label);
  return wrap;
}

const uiPlugin = new Plugin<UiState>({
  key: uiKey,
  state: {
    init: () => ({ id: Math.random().toString(36).slice(2), remote: {} }),
    apply(tr, value) {
      let remote = value.remote;
      if (tr.docChanged && Object.keys(remote).length) {
        remote = Object.fromEntries(Object.entries(remote).map(([k, r]) => [k, { ...r, anchor: tr.mapping.map(r.anchor), head: tr.mapping.map(r.head) }]));
      }
      const meta = tr.getMeta(uiKey) as Meta | undefined;
      if (meta?.set) remote = { ...remote, [meta.set.id]: meta.set };
      if (meta?.drop && remote[meta.drop]) { remote = { ...remote }; delete remote[meta.drop]; }
      return remote === value.remote ? value : { id: value.id, remote };
    },
  },
  props: {
    decorations(state) {
      const s = uiKey.getState(state);
      const list = s ? Object.values(s.remote) : [];
      if (!list.length) return null;
      const max = state.doc.content.size;
      const decos: Decoration[] = [];
      for (const r of list) {
        const a = Math.max(0, Math.min(max, r.anchor));
        const h = Math.max(0, Math.min(max, r.head));
        if (a !== h) decos.push(Decoration.inline(Math.min(a, h), Math.max(a, h), { class: 'ft-rc-sel', style: `--rc:${r.color}` }));
        decos.push(Decoration.widget(h, () => caret(r), { key: `rc-${r.id}-${r.name}-${r.color}`, side: 1, ignoreSelection: true }));
      }
      return DecorationSet.create(state.doc, decos);
    },
  },
  filterTransaction(tr) {
    if (!tr.docChanged || access === 'edit' || tr.getMeta('collabRemote') || tr.getMeta('collabInit')) return true;
    return access === 'comment' && commentsAllowed() && commentOnly(tr);
  },
  view() {
    queueMicrotask(syncSession);
    return {
      update(v, prev) {
        if (v.state.doc !== prev.doc) { flush(); maybeSnapshot(); }
        if (v.state.selection !== prev.selection || v.state.doc !== prev.doc) presenceLater();
      },
    };
  },
});

export function startSession(editor: DocEditor): void {
  ed = editor;
  addPlugin(collabPlugin);
  addPlugin(uiPlugin);
}
