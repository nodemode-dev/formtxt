import { type CommandRegistry, commands } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, escapeHtml, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { addMenuItems } from '../ui';
import { type Peer, liveInfo, onLiveChange, useShareToken } from './session';
import { colorFor, download, initials, message, patch as patchList, shareTokenFromUrl } from './util';

interface Link { token: string; doc: string; mode: 'view' | 'comment' | 'edit'; label: string; created: number; title: string }
interface Network { optIn: boolean; bindHost: string; reachable: boolean; lan: string; port: number }
interface Published { token: string; doc: string; title: string; created: number; updated: number; bytes: number }

const MODE_TEXT: Record<string, string> = { view: 'Can view', comment: 'Can comment', edit: 'Can edit' };
let ed: DocEditor;
let network: Network = { optIn: false, bindHost: '127.0.0.1', reachable: false, lan: '', port: 8199 };
let links: Link[] = [];
let shareUi: { d: Dialog; people: HTMLElement; peopleNote: HTMLElement; list: HTMLElement; empty: HTMLElement; mode: HTMLSelectElement; net: HTMLElement } | null = null;
let publishUi: { d: Dialog; status: HTMLElement; row: HTMLElement; url: HTMLInputElement; go: HTMLButtonElement; off: HTMLButtonElement; save: HTMLButtonElement; open: HTMLButtonElement; info: Published | null } | null = null;
let mailUi: { d: Dialog; list: HTMLElement; empty: HTMLElement; go: HTMLButtonElement } | null = null;
const netBlocks = new Set<{ box: HTMLInputElement; state: HTMLElement }>();

function docId(): string {
  const id = ed.docId();
  if (!id) throw new Error('Open a document first.');
  return id;
}

async function saveNow(): Promise<void> {
  const doc = ed.current();
  if (doc) await api.put(`/documents/${encodeURIComponent(doc.id)}`, doc);
}

function origin(lan = false): string {
  if (lan && network.lan) return `${location.protocol}//${network.lan}:${location.port || network.port}`;
  return location.origin;
}

export function linkUrl(l: Link, lan = false): string {
  return `${origin(lan)}/?share=${encodeURIComponent(l.token)}`;
}

async function loadNetwork(): Promise<void> {
  try {
    network = (await api.get<{ network: Network }>('/collab/info')).network;
  } catch { void 0; }
  paintNetwork();
}

function networkText(): string {
  const host = network.bindHost;
  if (!network.optIn) return `Off. Links work on this computer only, because the engine listens on ${host}.`;
  if (network.reachable) return `On. The engine listens on ${host}${network.lan ? `, so other computers can use http://${network.lan}:${location.port || network.port}` : ''}.`;
  return `On, but the engine still listens on ${host}. Restart FormTxt with FORMTXT_HOST=0.0.0.0 (for example FORMTXT_HOST=0.0.0.0 ./formtxt) to make it reachable.`;
}

function paintNetwork(): void {
  for (const n of netBlocks) {
    if (n.box.checked !== network.optIn) n.box.checked = network.optIn;
    setText(n.state, networkText());
  }
}

export function networkPreference(): HTMLElement {
  const wrap = el('<div class="ft-net"><label class="ft-pref-check"><input type="checkbox"> Let other computers on my network open share links (off by default)</label><p class="ft-net-help">FormTxt listens only on this computer. To let others reach it, tick this, then start FormTxt with the environment variable FORMTXT_HOST=0.0.0.0. The engine has no sign-in, so anyone on your network who has a link can open that document in that mode. Do this only on a network you trust.</p><p class="ft-net-state"></p></div>');
  const box = wrap.querySelector('input') as HTMLInputElement;
  const state = wrap.querySelector('.ft-net-state') as HTMLElement;
  netBlocks.add({ box, state });
  box.addEventListener('change', () => {
    void api.post<{ network: Network }>('/collab/settings', { network: box.checked }).then((r) => { network = r.network; paintNetwork(); }).catch((e) => { box.checked = !box.checked; toast(message(e), 'error'); });
  });
  void loadNetwork();
  return wrap;
}

async function loadLinks(): Promise<void> {
  const r = await api.get<{ links: Link[]; network: Network }>(`/collab/links?doc=${encodeURIComponent(docId())}`);
  links = r.links;
  network = r.network;
  paintLinks();
  paintNetwork();
}

function paintLinks(): void {
  if (!shareUi) return;
  patchList(shareUi.list, links, {
    key: (l) => l.token,
    create: (l) => {
      const row = el('<div class="ft-link-row"><span class="ft-link-mode"></span><input class="ft-input ft-link-url" type="text" readonly aria-label="Link"><button type="button" class="ft-btn sm" data-act="copy">Copy</button><button type="button" class="ft-btn sm ghost" data-act="copy-lan">Copy network link</button><button type="button" class="ft-btn sm danger" data-act="revoke">Revoke</button></div>');
      row.dataset.token = l.token;
      return row;
    },
    update: (node, l) => {
      setText(node.querySelector('.ft-link-mode'), MODE_TEXT[l.mode] ?? l.mode);
      const input = node.querySelector<HTMLInputElement>('.ft-link-url');
      if (input && input.value !== linkUrl(l)) input.value = linkUrl(l);
      setHidden(node.querySelector<HTMLElement>('[data-act="copy-lan"]') as HTMLElement, !(network.optIn && network.reachable && network.lan));
    },
  });
  setHidden(shareUi.empty, links.length > 0);
}

function paintPeople(): void {
  if (!shareUi) return;
  const info = liveInfo();
  const list = info.peers;
  patchList(shareUi.people, list, {
    key: (p) => p.id,
    create: () => el('<div class="ft-share-person"><span class="ft-who"></span><span class="ft-share-pname"></span><span class="ft-share-pmeta"></span></div>'),
    update: (node, p) => {
      const chip = node.querySelector<HTMLElement>('.ft-who');
      if (chip) { setText(chip, initials(p.name)); chip.style.setProperty('--who', p.color || colorFor(p.id)); }
      setText(node.querySelector('.ft-share-pname'), p.id === info.me ? `${p.name} (you)` : p.name);
      setText(node.querySelector('.ft-share-pmeta'), MODE_TEXT[p.access] ?? p.access);
    },
  });
  setText(shareUi.peopleNote, info.status === 'live' ? (list.length > 1 ? `${list.length} windows are editing this document now.` : 'Only this window has the document open.') : info.status === 'joining' ? 'Connecting to the engine.' : 'Live editing is not connected. Edits are kept and shared when it reconnects.');
}

async function ensureLink(mode: Link['mode']): Promise<Link> {
  const found = (await api.get<{ links: Link[] }>(`/collab/links?doc=${encodeURIComponent(docId())}`)).links.find((l) => l.mode === mode);
  return found ?? api.post<Link>('/collab/links', { doc: docId(), mode });
}

function mailto(to: string[], subject: string, body: string): string {
  const url = `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

const title = (): string => ed.doc?.title || 'Document';

async function emailLink(mode: Link['mode']): Promise<{ url: string; mailto: string }> {
  const l = await ensureLink(mode);
  const url = linkUrl(l);
  const note = network.optIn && network.reachable && network.lan ? '' : '\n\nThis link opens on the computer where FormTxt is running.';
  return { url, mailto: mailto([], title(), `${MODE_TEXT[l.mode]}: ${url}${note}`) };
}

async function sendCopy(): Promise<{ file: string; mailto: string }> {
  const id = docId();
  await saveNow();
  const a = document.createElement('a');
  a.href = `/api/documents/${encodeURIComponent(id)}/download`;
  a.download = `${title()}.ftxt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  await new Promise((r) => window.setTimeout(r, 350));
  return { file: `${title()}.ftxt`, mailto: mailto([], title(), `I saved a copy of "${title()}" to your Downloads folder. Attach the file ${title()}.ftxt to this message before sending.`) };
}

interface Person { name: string; email: string; from: string }

export function collaborators(): Person[] {
  const out = new Map<string, Person>();
  const add = (name: string, email: string, from: string): void => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
    if (!out.has(e)) out.set(e, { name: name.trim(), email: e, from });
  };
  ed.view?.state.doc.descendants((n) => {
    if (n.type.name === 'chip' && n.attrs.kind === 'person') add(String(n.attrs.name || ''), String(n.attrs.email || ''), 'Person chip');
    return true;
  });
  const comments = (ed.doc as unknown as { comments?: Record<string, Record<string, unknown>> } | null)?.comments ?? {};
  for (const c of Object.values(comments)) {
    if (!c || typeof c !== 'object') continue;
    add(String(c.author ?? ''), String(c.email ?? c.authorEmail ?? ''), 'Comment');
    const replies = Array.isArray(c.replies) ? (c.replies as Array<Record<string, unknown>>) : [];
    for (const r of replies) add(String(r.author ?? ''), String(r.email ?? r.authorEmail ?? ''), 'Comment');
  }
  return [...out.values()];
}

function openMailDialog(): void {
  if (!mailUi) {
    const d = new Dialog('Email collaborators', 480);
    d.body.appendChild(el('<p class="ft-share-note">People named with an email address in this document: person chips and comments. Pick who to write to.</p>'));
    const list = el('<div class="ft-mail-list"></div>');
    const empty = el('<p class="ft-share-note ft-mail-empty">No email addresses yet. Add people with the @ smart chip or comment as someone with an email address.</p>');
    d.body.append(list, empty);
    d.button('Close', 'ghost', () => d.close());
    const go = d.button('Write email', 'primary', () => {
      const to = Array.from(list.querySelectorAll<HTMLInputElement>('input:checked')).map((i) => i.value);
      if (!to.length) { toast('Pick at least one person.', 'error'); return; }
      d.close();
      mailto(to, title(), '');
    });
    mailUi = { d, list, empty, go };
  }
  const people = collaborators();
  patchList(mailUi.list, people, {
    key: (p) => p.email,
    create: (p) => el(`<label class="ft-mail-row"><input type="checkbox" checked value="${escapeHtml(p.email)}"><span class="ft-mail-name"></span><span class="ft-mail-addr"></span></label>`),
    update: (node, p) => { setText(node.querySelector('.ft-mail-name'), p.name || p.email); setText(node.querySelector('.ft-mail-addr'), p.name ? `${p.email}, ${p.from}` : p.from); },
  });
  setHidden(mailUi.empty, people.length > 0);
  mailUi.go.disabled = people.length === 0;
  mailUi.d.open(people.length ? mailUi.go : undefined);
}

function openShare(): void {
  docId();
  if (!shareUi) {
    const d = new Dialog('Share', 600);
    const people = el('<div class="ft-share-people"></div>');
    const peopleNote = el('<p class="ft-share-note"></p>');
    const list = el('<div class="ft-share-links"></div>');
    const empty = el('<p class="ft-share-note">No links yet. Create one to open this document in another window.</p>');
    const mode = el<HTMLSelectElement>('<select class="ft-input" aria-label="Link permission"><option value="view">Can view</option><option value="comment">Can comment</option><option value="edit">Can edit</option></select>');
    const create = el<HTMLButtonElement>('<button type="button" class="ft-btn primary sm">Create link</button>');
    const newRow = el('<div class="ft-share-new"></div>');
    newRow.append(mode, create);
    const net = networkPreference();
    const mail = el('<div class="ft-share-actions"><button type="button" class="ft-btn sm" data-cmd="collab.emailLink">Email a link</button><button type="button" class="ft-btn sm" data-cmd="collab.sendCopy">Send a copy</button><button type="button" class="ft-btn sm" data-cmd="collab.emailCollaborators">Email collaborators</button><button type="button" class="ft-btn sm" data-cmd="collab.publish.open">Publish to the web</button></div>');
    for (const [h, node] of [['People here', [people, peopleNote]], ['Share by link', [list, empty, newRow]], ['Other computers', [net]], ['Send', [mail]]] as const) {
      const sec = el('<section class="ft-share-sec"><h3></h3></section>');
      setText(sec.querySelector('h3'), h);
      sec.append(...node);
      d.body.appendChild(sec);
    }
    d.body.appendChild(el('<p class="ft-share-note">Links open this document on the computer where FormTxt runs. View links open it read only, comment links allow comments only when the Review tools are available, and edit links let people change it. Revoke a link to stop it working.</p>'));
    d.button('Close', 'primary', () => d.close());
    shareUi = { d, people, peopleNote, list, empty, mode, net };
    create.addEventListener('click', () => {
      void api.post<Link>('/collab/links', { doc: docId(), mode: mode.value }).then(loadLinks).catch((e) => toast(message(e), 'error'));
    });
    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const token = btn?.closest<HTMLElement>('[data-token]')?.dataset.token;
      const l = links.find((x) => x.token === token);
      if (!btn || !l) return;
      if (btn.dataset.act === 'revoke') void api.del(`/collab/links/${encodeURIComponent(l.token)}`).then(loadLinks).catch((err) => toast(message(err), 'error'));
      else void navigator.clipboard?.writeText(linkUrl(l, btn.dataset.act === 'copy-lan')).then(() => toast('Link copied.'), () => toast('Copy the link from the box.', 'error'));
    });
    mail.addEventListener('click', (e) => {
      const cmd = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]')?.dataset.cmd;
      if (cmd) { d.close(); void commands.run(cmd).catch((err: Error) => toast(err.message, 'error')); }
    });
  }
  paintPeople();
  shareUi.d.open();
  void loadLinks().catch((e) => toast(message(e), 'error'));
}

function pageUrl(token: string): string {
  return `${origin()}/api/published/${encodeURIComponent(token)}`;
}

function paintPublish(): void {
  if (!publishUi) return;
  const p = publishUi.info;
  setText(publishUi.status, p ? `Published. Last updated ${new Date(p.updated * 1000).toLocaleString()}, ${Math.max(1, Math.round(p.bytes / 1024))} KB.` : 'Not published.');
  setHidden(publishUi.row, !p);
  if (p && publishUi.url.value !== pageUrl(p.token)) publishUi.url.value = pageUrl(p.token);
  setText(publishUi.go, p ? 'Republish' : 'Publish');
  publishUi.off.disabled = !p;
  publishUi.open.disabled = !p;
}

async function loadPublish(): Promise<void> {
  publishUi && (publishUi.info = (await api.get<{ published: Published | null }>(`/collab/publish/${encodeURIComponent(docId())}`)).published);
  paintPublish();
}

async function doPublish(): Promise<Published> {
  await saveNow();
  const r = await api.post<{ published: Published }>(`/collab/publish/${encodeURIComponent(docId())}`);
  if (publishUi) { publishUi.info = r.published; paintPublish(); }
  return r.published;
}

async function doUnpublish(): Promise<boolean> {
  const r = await api.del<{ removed: boolean }>(`/collab/publish/${encodeURIComponent(docId())}`);
  if (publishUi) { publishUi.info = null; paintPublish(); }
  return r.removed;
}

async function saveHtml(forceDownload = false): Promise<{ saved: string }> {
  const id = docId();
  await saveNow();
  const res = await fetch(`/api/collab/export/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('The page could not be built.');
  const html = await res.text();
  const name = `${title().replace(/[^\w .-]+/g, '').trim() || 'document'}.html`;
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<{ getFileHandle(n: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>; name: string }> }).showDirectoryPicker;
  if (picker && !forceDownload) {
    const dir = await picker.call(window);
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(html);
    await w.close();
    return { saved: `${dir.name}/${name}` };
  }
  download(name, html, 'text/html');
  return { saved: `Downloads/${name}` };
}

function openPublish(): void {
  docId();
  if (!publishUi) {
    const d = new Dialog('Publish to the web', 560);
    d.body.appendChild(el('<p class="ft-share-note">Publishing makes one self-contained page (text, formatting and pictures in a single HTML file). It is served by the engine at the address below and can also be saved to a folder you pick. It does not put the page on the public internet: only computers that can reach this engine can open it.</p>'));
    const status = el('<p class="ft-pub-status"></p>');
    const row = el('<div class="ft-pub-row" hidden><input class="ft-input" type="text" readonly aria-label="Published address"><button type="button" class="ft-btn sm" data-act="copy">Copy</button></div>');
    const url = row.querySelector('input') as HTMLInputElement;
    d.body.append(status, row);
    const go = d.button('Publish', 'primary', () => { void doPublish().then(() => toast('Published.')).catch((e) => toast(message(e), 'error')); });
    const open = d.button('Open page', '', () => { if (publishUi?.info) window.open(pageUrl(publishUi.info.token), '_blank', 'noopener'); });
    const save = d.button('Save to a folder', '', () => { void saveHtml().then((r) => toast(`Saved ${r.saved}.`)).catch((e) => { if ((e as Error).name !== 'AbortError') toast(message(e), 'error'); }); });
    const off = d.button('Unpublish', 'ghost', () => { void doUnpublish().then(() => toast('Unpublished.')).catch((e) => toast(message(e), 'error')); });
    d.button('Close', '', () => d.close());
    publishUi = { d, status, row, url, go, off, save, open, info: null };
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act="copy"]')) void navigator.clipboard?.writeText(url.value).then(() => toast('Address copied.'), () => undefined);
    });
  }
  paintPublish();
  publishUi.d.open(publishUi.go);
  void loadPublish().catch((e) => toast(message(e), 'error'));
}

function mountWho(): void {
  const actions = document.querySelector<HTMLElement>('.ft-titlebar .ft-actions');
  if (!actions || actions.querySelector('.ft-collab-who')) return;
  const who = el('<button type="button" class="ft-collab-who" aria-label="Who is here" title="Who is here: open Share"></button>');
  actions.prepend(who);
  who.addEventListener('click', () => { void commands.run('collab.share').catch((e: Error) => toast(e.message, 'error')); });
  const paint = (): void => {
    const info = liveInfo();
    const list: Peer[] = info.status === 'live' || info.status === 'joining' ? info.peers : [];
    who.style.visibility = info.docId ? 'visible' : 'hidden';
    const shown = list.slice(0, 4);
    patchList(who, shown, {
      key: (p) => p.id,
      create: () => el('<span class="ft-who"></span>'),
      update: (node, p) => {
        setText(node, initials(p.name));
        node.style.setProperty('--who', p.color || colorFor(p.id));
        node.title = `${p.id === info.me ? `${p.name} (you)` : p.name}, ${MODE_TEXT[p.access]?.toLowerCase() ?? p.access}`;
        node.classList.toggle('is-me', p.id === info.me);
      },
    });
    let more = who.querySelector<HTMLElement>('.ft-who-more');
    if (list.length > shown.length) {
      if (!more) { more = el('<span class="ft-who-more"></span>'); who.appendChild(more); }
      setText(more, `+${list.length - shown.length}`);
    } else more?.remove();
    if (shareUi && !shareUi.d.root.hidden) paintPeople();
  };
  onLiveChange(paint);
  paint();
}

function openFromLink(): void {
  const token = shareTokenFromUrl();
  if (!token) return;
  void api.get<{ doc: string; mode: string }>(`/collab/links/resolve/${encodeURIComponent(token)}`).then((info) => {
    useShareToken(token, info.doc);
    const go = (): void => { void commands.run('file.open', { id: info.doc }).catch((e: Error) => toast(`Could not open the shared document: ${e.message}`, 'error')); };
    if (commands.has('file.open')) { window.setTimeout(go, 50); return; }
    const off = commands.onRegister((c) => { if (c.id === 'file.open') { off(); window.setTimeout(go, 50); } });
  }).catch((e) => toast(message(e), 'error'));
}

export function registerShare(reg: CommandRegistry, editor: DocEditor): void {
  ed = editor;
  mountWho();
  openFromLink();
  const modeParam = { name: 'mode', type: 'string' as const, description: 'view, comment or edit' };
  reg.register({ id: 'collab.share', label: 'Share', group: 'Share', description: 'Open the Share window: who is here, share links with permissions, and sending options.', run: () => { openShare(); return true; } });
  reg.register({
    id: 'collab.link.create',
    label: 'Create share link',
    group: 'Share',
    description: 'Create a link that opens this document as view, comment or edit.',
    params: [modeParam],
    run: async (p) => { const l = await api.post<Link>('/collab/links', { doc: docId(), mode: String(p.mode ?? 'view') }); await loadLinks().catch(() => undefined); return { token: l.token, mode: l.mode, url: linkUrl(l) }; },
  });
  reg.register({ id: 'collab.link.list', label: 'List share links', group: 'Share', description: 'List the share links of this document.', run: async () => { await loadLinks(); return links.map((l) => ({ token: l.token, mode: l.mode, url: linkUrl(l), created: l.created })); } });
  reg.register({
    id: 'collab.link.revoke',
    label: 'Revoke share link',
    group: 'Share',
    description: 'Stop a share link from working.',
    params: [{ name: 'token', type: 'string', description: 'Token, from collab.link.list' }],
    run: async (p) => { await api.del(`/collab/links/${encodeURIComponent(String(p.token ?? ''))}`); await loadLinks().catch(() => undefined); return true; },
  });
  reg.register({
    id: 'collab.emailLink',
    label: 'Email a link',
    group: 'Share',
    description: 'Open a new email in your mail app with a share link to this document.',
    params: [modeParam],
    run: (p) => emailLink((['view', 'comment', 'edit'].includes(String(p.mode)) ? String(p.mode) : 'view') as Link['mode']),
  });
  reg.register({ id: 'collab.sendCopy', label: 'Send a copy', group: 'Share', description: 'Download this document as a .ftxt file and open an email to attach it to.', run: () => sendCopy() });
  reg.register({
    id: 'collab.emailCollaborators',
    label: 'Email collaborators',
    group: 'Share',
    description: 'Choose people named with an email address in this document (person chips and comments) and open an email to them.',
    run: () => { docId(); openMailDialog(); return collaborators(); },
  });
  reg.register({ id: 'collab.who', label: 'Who is here', group: 'Share', description: 'List the windows that have this document open, with their names and permissions.', run: () => { const i = liveInfo(); return { status: i.status, access: i.access, people: i.peers }; } });
  reg.register({ id: 'collab.publish.open', label: 'Publish to the web', group: 'Share', description: 'Open the publish window: publish, republish, unpublish and save the page to a folder.', run: () => { openPublish(); return true; } });
  reg.register({ id: 'collab.publish', label: 'Publish page', group: 'Share', description: 'Publish this document as one self-contained HTML page served by the engine, or update the published page; returns its address.', run: async () => { const p = await doPublish(); return { token: p.token, url: pageUrl(p.token) }; } });
  reg.register({ id: 'collab.unpublish', label: 'Unpublish page', group: 'Share', description: 'Remove the published page of this document.', run: () => doUnpublish() });
  reg.register({ id: 'collab.publish.save', label: 'Save page to a folder', group: 'Share', description: 'Save this document as a self-contained HTML file in a folder you pick (or the Downloads folder when the browser cannot pick one).', params: [{ name: 'download', type: 'boolean', description: 'true to download the file instead of picking a folder' }], run: (p) => saveHtml(p.download === true) });
  reg.register({
    id: 'collab.network',
    label: 'Allow links on my network',
    group: 'Share',
    description: 'Opt in or out of making share links usable from other computers. Reaching the engine also needs FORMTXT_HOST=0.0.0.0 when it starts.',
    params: [{ name: 'enabled', type: 'boolean', description: 'true to opt in' }],
    run: async (p) => { const r = await api.post<{ network: Network }>('/collab/settings', { network: p.enabled === true }); network = r.network; paintNetwork(); return network; },
  });
  addMenuItems('Share', [
    { cmd: 'collab.share', label: 'Share...' },
    { cmd: 'collab.emailLink', label: 'Email a link' },
    { cmd: 'collab.sendCopy', label: 'Send a copy' },
    { cmd: 'collab.emailCollaborators', label: 'Email collaborators' },
    { cmd: 'collab.publish.open', label: 'Publish to the web...' },
  ]);
}
