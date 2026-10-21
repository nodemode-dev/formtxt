import { type Command, NodeSelection, Plugin, type EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { CommandRegistry } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { setDisabled, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { type DocEditor } from '../../editor';
import { schema } from '../../schema';
import { addMenuItems } from '../ui';
import { addNodeView, addPlugin, onDocumentLoaded } from '../plugins';
import { objectHooks } from '../objects-spec';
import { ObjectView } from './object-view';
import { fail, input, note, objectUrl, picker, uploadObjectFiles, type UploadedFile } from './util';

const VIDEO_TYPES = '.mp4,.m4v,.mov,.webm,.ogv,video/mp4,video/webm,video/ogg,video/quicktime';
const AUDIO_TYPES = '.mp3,.wav,.ogg,.oga,.opus,.m4a,.aac,.flac,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac';

export interface OnlineInfo { provider: string; id: string; hash?: string; link: string; title: string; author: string; poster: string; bytes: number; ratio: number }

export function selectedObject(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection;
  return sel instanceof NodeSelection && sel.node.type === schema.nodes.object ? { node: sel.node, pos: sel.from } : null;
}

export function insertObject(attrs: Record<string, unknown>, at?: number): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const node = schema.nodes.object.create(attrs);
    const tr = at === undefined ? state.tr.replaceSelectionWith(node) : state.tr.insert(at, node);
    const pos = at === undefined ? tr.mapping.map(state.selection.from, -1) : at;
    try { tr.setSelection(NodeSelection.create(tr.doc, pos)); } catch { void 0; }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

function setObject(patch: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const o = selectedObject(state);
    if (!o) return false;
    if (dispatch) {
      const tr = state.tr.setNodeMarkup(o.pos, undefined, { ...o.node.attrs, ...patch });
      tr.setSelection(NodeSelection.create(tr.doc, o.pos));
      dispatch(tr);
    }
    return true;
  };
}

function probeVideo(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const done = (w: number, h: number): void => { v.removeAttribute('src'); v.load(); resolve({ w: w || 16, h: h || 9 }); };
    const timer = window.setTimeout(() => done(16, 9), 4000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => { window.clearTimeout(timer); done(v.videoWidth, v.videoHeight); };
    v.onerror = () => { window.clearTimeout(timer); done(16, 9); };
    v.src = url;
  });
}

function remember(ed: DocEditor, f: UploadedFile): void {
  if (!ed.doc) return;
  ed.doc = { ...ed.doc, media: { ...(ed.doc.media ?? {}), [f.name]: { type: f.type, bytes: f.bytes, source: f.source } } };
}

export async function attrsFor(ed: DocEditor, f: UploadedFile): Promise<Record<string, unknown>> {
  const doc = ed.docId();
  const max = Math.max(160, ed.bodyWidth());
  const base = { media: f.name, name: f.source, source: f.source, bytes: f.bytes, mime: f.type, from: '' };
  if (f.kind === 'video') {
    const { w, h } = await probeVideo(objectUrl(doc, f.name));
    const width = Math.min(max, 360);
    return { ...base, kind: 'video', width, height: Math.round(width * (h / w) * 100) / 100 };
  }
  if (f.kind === 'audio') return { ...base, kind: 'audio', width: Math.min(max, 300), height: 54 };
  return { ...base, kind: 'embed', width: Math.min(max, 300), height: 72, thumb: f.thumb ?? '', rows: f.rows?.length ? f.rows : null, pages: f.pages ?? 0 };
}

export async function insertFiles(ed: DocEditor, files: File[], want: string[] = [], at?: number): Promise<UploadedFile[]> {
  if (!ed.doc || !ed.view) throw new Error('Open a document first.');
  const id = ed.doc.id;
  const uploaded = await uploadObjectFiles(id, files);
  if (!ed.doc || ed.doc.id !== id || !ed.view) return [];
  let pos = at;
  const out: UploadedFile[] = [];
  for (const f of uploaded) {
    if (want.length && !want.includes(f.kind)) { toast(`${f.source} is not a ${want.join(' or ')} file; it was added as an embedded file.`); }
    remember(ed, f);
    const attrs = await attrsFor(ed, f);
    ed.run(insertObject(attrs, pos));
    if (pos !== undefined) pos += 1;
    out.push(f);
  }
  return out;
}

export async function onlineVideoInfo(ed: DocEditor, url: string): Promise<OnlineInfo> {
  if (!ed.doc) throw new Error('Open a document first.');
  return api.post<OnlineInfo>(`/objects/${encodeURIComponent(ed.doc.id)}/online-video`, { url });
}

export function insertOnline(ed: DocEditor, info: OnlineInfo): boolean {
  const width = Math.min(Math.max(160, ed.bodyWidth()), 400);
  ed.doc = ed.doc ? { ...ed.doc, media: { ...(ed.doc.media ?? {}), [info.poster]: { type: 'image/jpeg', bytes: info.bytes, source: `${info.provider} poster` } } } : ed.doc;
  return ed.run(insertObject({ kind: 'online', provider: info.provider, vid: info.id, hash: info.hash ?? '', link: info.link, name: info.title, author: info.author, poster: info.poster, width, height: Math.round((width / (info.ratio || 16 / 9)) * 100) / 100 }));
}

function onlineDialog(ed: DocEditor): void {
  if (!ed.view) throw new Error('Open a document first.');
  const d = new Dialog('Insert online video', 520);
  const url = input('url', '', 'placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..." spellcheck="false" autocomplete="off"');
  d.field('Video address', url);
  note(d, 'Inserting contacts YouTube or Vimeo once, only now, to read the title and save a poster frame in the document. Nothing from the provider loads when the document opens. Pressing play loads the provider\'s privacy-enhanced player inside a sandboxed frame.');
  const status = note(d, '');
  d.button('Cancel', 'ghost', () => d.close());
  const go = d.button('Insert', 'primary', () => {
    if (!url.value.trim()) { setText(status, 'Paste a YouTube or Vimeo address.'); return; }
    setDisabled(go, true);
    setText(go, 'Fetching...');
    setText(status, '');
    void onlineVideoInfo(ed, url.value.trim()).then((info) => { insertOnline(ed, info); d.close(); })
      .catch((e: Error) => setText(status, e.message))
      .finally(() => { setDisabled(go, false); setText(go, 'Insert'); });
  });
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
  d.open(url);
}

export function registerMedia(reg: CommandRegistry, ed: DocEditor): void {
  addNodeView('object', (node, view, getPos) => new ObjectView(node, view, getPos));
  onDocumentLoaded(() => { objectHooks.doc = () => ed.docId(); });
  objectHooks.doc = () => ed.docId();
  const choose = (accept: string, want: string[]) => picker(accept, true, (files) => { void insertFiles(ed, files, want).catch(fail('Could not add the file')); });
  const pickVideo = choose(VIDEO_TYPES, ['video']);
  const pickAudio = choose(AUDIO_TYPES, ['audio']);
  const pickAny = choose('', []);
  const params = [
    { name: 'media', type: 'string' as const, description: 'File name returned by POST /api/objects/{id}/files' },
    { name: 'width', type: 'number' as const, description: 'Width in points' },
    { name: 'height', type: 'number' as const, description: 'Height in points' },
  ];
  const place = (kind: string, p: Record<string, unknown>): boolean => {
    const name = String(p.media);
    const meta = (ed.doc?.media ?? {})[name] as { source?: string; bytes?: number; type?: string } | undefined;
    const width = Number(p.width) || Math.min(ed.bodyWidth(), kind === 'audio' ? 300 : 360);
    const height = Number(p.height) || (kind === 'audio' ? 54 : (width * 9) / 16);
    return ed.run(insertObject({ kind, media: name, name: meta?.source ?? name, source: meta?.source ?? '', bytes: meta?.bytes ?? 0, mime: meta?.type ?? '', width, height }));
  };
  reg.register({
    id: 'insert.video', label: 'Video file', group: 'Insert',
    description: 'Insert a video file (mp4, m4v, mov, webm, ogv) with native controls; with media, inserts a file already uploaded to POST /api/objects/{id}/files.',
    params, run: (p) => { if (!p.media) { pickVideo(); return true; } return place('video', p); },
  });
  reg.register({
    id: 'insert.audio', label: 'Audio file', group: 'Insert',
    description: 'Insert an audio file (mp3, wav, ogg, m4a, aac, flac) with native controls; with media, inserts a file already uploaded.',
    params, run: (p) => { if (!p.media) { pickAudio(); return true; } return place('audio', p); },
  });
  reg.register({
    id: 'insert.embeddedFile', label: 'Embedded file', group: 'Insert',
    description: 'Embed any file (a spreadsheet, PDF or other) as an object with its name and size; .csv and .xlsx show their first rows and a PDF its first page. Double-click downloads it.',
    params: [{ name: 'media', type: 'string', description: 'File name returned by POST /api/objects/{id}/files' }],
    run: (p) => {
      if (!p.media) { pickAny(); return true; }
      const name = String(p.media);
      const meta = (ed.doc?.media ?? {})[name] as { source?: string; bytes?: number; type?: string } | undefined;
      return ed.run(insertObject({ kind: 'embed', media: name, name: meta?.source ?? name, source: meta?.source ?? '', bytes: meta?.bytes ?? 0, width: Math.min(ed.bodyWidth(), 300), height: 72 }));
    },
  });
  reg.register({
    id: 'insert.onlineVideo', label: 'Online video', group: 'Insert',
    description: 'Insert a YouTube or Vimeo video as a card with its poster frame, title and link. The engine contacts the provider once, now, for the poster; the player loads only when play is pressed. With no url, opens a dialog.',
    params: [{ name: 'url', type: 'string', description: 'YouTube or Vimeo address' }],
    run: async (p) => {
      if (!p.url) { onlineDialog(ed); return true; }
      return insertOnline(ed, await onlineVideoInfo(ed, String(p.url)));
    },
  });
  const need = (): { node: PMNode; pos: number } => {
    const o = ed.view ? selectedObject(ed.view.state) : null;
    if (!o) throw new Error('Click a video, audio or embedded file object first.');
    return o;
  };
  reg.register({
    id: 'object.size', label: 'Object size', group: 'Object',
    description: 'Set the width of the selected video, audio or file object in points; video keeps its proportions unless height is given.',
    params: [{ name: 'width', type: 'number', description: 'Points' }, { name: 'height', type: 'number', description: 'Points (optional)' }],
    run: (p) => {
      const o = need();
      const w = Math.max(72, Number(p.width) || Number(o.node.attrs.width));
      const h = Number(p.height) || (w * Number(o.node.attrs.height)) / Math.max(1, Number(o.node.attrs.width));
      return ed.run(setObject({ width: w, height: Math.max(24, h) }));
    },
  });
  reg.register({
    id: 'object.wrap', label: 'Object wrapping', group: 'Object',
    description: 'Keep the selected object in the line (inline) or float it with text flowing around it (square).',
    params: [{ name: 'wrap', type: 'string', description: 'inline or square' }, { name: 'side', type: 'string', description: 'left or right' }],
    run: (p) => { need(); return ed.run(setObject({ wrap: p.wrap === 'square' ? 'square' : 'inline', side: p.side === 'right' ? 'right' : 'left' })); },
  });
  reg.register({
    id: 'object.download', label: 'Download object', group: 'Object',
    description: 'Download the file behind the selected embedded file or media object.',
    run: () => {
      const o = need();
      const url = objectUrl(String(o.node.attrs.from || ed.docId()), String(o.node.attrs.media), String(o.node.attrs.name || o.node.attrs.media));
      if (!url) throw new Error('This object has no file.');
      const a = document.createElement('a');
      a.href = url;
      a.download = String(o.node.attrs.name || o.node.attrs.media);
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    },
  });
  addPlugin(new Plugin({
    props: {
      handleDrop: (view, e) => {
        const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => !f.type.startsWith('image/'));
        if (!files.length) return false;
        e.preventDefault();
        const at = view.posAtCoords({ left: (e as DragEvent).clientX, top: (e as DragEvent).clientY })?.pos;
        void insertFiles(ed, files, [], at).catch(fail('Could not add the file'));
        return true;
      },
      handlePaste: (_view, e) => {
        const files = Array.from(e.clipboardData?.files ?? []).filter((f) => !f.type.startsWith('image/'));
        if (!files.length) return false;
        void insertFiles(ed, files).catch(fail('Could not add the file'));
        return true;
      },
    },
  }));
  addMenuItems('Insert', [
    { cmd: 'insert.video', label: 'Video file...' },
    { cmd: 'insert.audio', label: 'Audio file...' },
    { cmd: 'insert.onlineVideo', label: 'Online video...' },
    { cmd: 'insert.screenshot', label: 'Screenshot or screen clip...' },
    { cmd: 'insert.embeddedFile', label: 'Embedded file...' },
    { cmd: 'chart.linkSource', label: 'Link chart to a spreadsheet...' },
  ]);
}
