import { TextSelection } from 'prosemirror-state';
import { type PatchListOptions, el, escapeHtml, patchList, setClass, setDisabled, setHidden, setHtml, setText, setValue } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { type Emoji, loadEmoji, searchEmoji } from '../../emoji';
import { authorColor } from '../review-spec';
import { type Comment, type Mode, type Reply, allComments, ed, me, onChange, people, sameName, view, when } from './core';
import { REVIEW_META, activeId, addComment, deleteMessage, editMessage, gotoComment, linkTo, mentionsIn, replyTo, selectionRange, setAssignee, setKnownNames, setResolved, toggleReaction, threads } from './comments';
import { ICON, REACTIONS } from './icons';
import { type Change, type Editor, KIND_LABEL, applyChanges, collectChanges, currentMode, editorsWithHistory, moveToChange, onMode, setMode } from './track';

type Tab = 'comments' | 'changes';
type Compose = { kind: 'new' | 'reply' | 'edit'; cid: string; rid: string; range?: { from: number; to: number } };

let root: HTMLElement | null = null;
let tab: Tab = 'comments';
let show: 'open' | 'resolved' | 'all' = 'open';
let mine = false;
let compose: Compose | null = null;
let pickHandler: ((key: string) => void) | null = null;
let emojiAll: Emoji[] = [];
let mentionItems: string[] = [];
let mentionAt = 0;

setKnownNames(() => people());

const q = <T extends HTMLElement>(sel: string): T => root!.querySelector(sel) as T;

function patch<T>(container: HTMLElement, items: T[], o: PatchListOptions<T>): void {
  patchList(container, items, { ...o, create: (item) => { const n = o.create(item); o.update(n, item); return n; } });
}

const btn = (act: string, label: string, svg: string): string => `<button type="button" class="rv-ib" data-act="${act}" title="${label}" aria-label="${label}">${svg}</button>`;

const SKELETON = `<div class="rv">
<div class="rv-top">
<select class="ft-tb-select rv-mode" aria-label="Editing mode"><option value="editing">Editing</option><option value="suggesting">Suggesting</option><option value="viewing">Viewing</option></select>
<div class="rv-tabs" role="tablist"><button type="button" class="rv-tab is-on" role="tab" data-tab="comments">Comments <span class="rv-count" data-count="comments"></span></button><button type="button" class="rv-tab" role="tab" data-tab="changes">Changes <span class="rv-count" data-count="changes"></span></button></div>
</div>
<section class="rv-view" data-view="comments">
<div class="rv-bar"><select class="ft-tb-select rv-show" aria-label="Show comments"><option value="open">Open</option><option value="resolved">Resolved</option><option value="all">All</option></select><label class="rv-check"><input type="checkbox" class="rv-mine"> Assigned to me</label><button type="button" class="ft-btn sm" data-act="new">Add comment</button></div>
<div class="rv-scroll"><div class="rv-list" data-list="comments"></div><p class="rv-empty ft-note" data-empty="comments"></p></div>
</section>
<section class="rv-view" data-view="changes" hidden>
<div class="rv-bar"><button type="button" class="ft-btn sm" data-act="prev">Previous</button><button type="button" class="ft-btn sm" data-act="next">Next</button><button type="button" class="ft-btn sm" data-act="acceptAll">Accept all</button><button type="button" class="ft-btn sm" data-act="rejectAll">Reject all</button><button type="button" class="ft-btn sm ghost" data-act="editors">Show editors</button></div>
<div class="rv-scroll"><div class="rv-editors" data-list="editors"></div><div class="rv-list" data-list="changes"></div><p class="rv-empty ft-note" data-empty="changes"></p></div>
</section>
<form class="rv-compose" hidden>
<div class="rv-ctx"></div>
<textarea class="ft-input rv-ta" rows="3" aria-label="Comment text" placeholder="Write here. Type @ to mention someone."></textarea>
<label class="rv-check rv-assign-box" hidden><input type="checkbox" class="rv-assign"> Assign to the first person mentioned</label>
<div class="rv-bar rv-end"><button type="button" class="ft-btn sm ghost" data-act="cancel">Cancel</button><button type="submit" class="ft-btn sm cta rv-post">Comment</button></div>
<div class="rv-mention" hidden></div>
</form>
<div class="rv-picker" hidden role="dialog" aria-label="Choose a reaction"><div class="rv-picker-row">${Object.entries(REACTIONS).map(([k, r]) => `<button type="button" class="rv-ib" data-pick="${k}" title="${r.label}" aria-label="${r.label}">${r.svg}</button>`).join('')}</div><input class="ft-input rv-picker-q" type="text" placeholder="Search emoji" aria-label="Search emoji" spellcheck="false"><div class="rv-picker-grid"></div></div>
</div>`;

const MSG_ACTIONS_COMMENT = btn('react', 'Add reaction', ICON.react) + btn('reply', 'Reply', ICON.reply) + btn('resolve', 'Resolve', ICON.resolve) + btn('edit', 'Edit', ICON.edit) + btn('delete', 'Delete', ICON.trash) + btn('link', 'Copy link to comment', ICON.link);
const MSG_ACTIONS_REPLY = btn('react', 'Add reaction', ICON.react) + btn('edit', 'Edit', ICON.edit) + btn('delete', 'Delete', ICON.trash);

function msgHtml(role: 'comment' | 'reply'): string {
  return `<div class="rv-msg" data-role="${role}"><div class="rv-head"><span class="rv-dot"></span><b class="rv-author"></b><span class="rv-time"></span>${role === 'comment' ? '<span class="rv-badge">Resolved</span>' : ''}</div>${role === 'comment' ? '<blockquote class="rv-quote"></blockquote>' : ''}<div class="rv-text"></div>${role === 'comment' ? '<div class="rv-assigned"><span class="rv-assigned-name"></span><button type="button" class="rv-link" data-act="unassign">Unassign</button></div>' : ''}<div class="rv-reacts"></div><div class="rv-actions">${role === 'comment' ? MSG_ACTIONS_COMMENT : MSG_ACTIONS_REPLY}</div></div>`;
}

function mentionHtml(text: string): string {
  let html = escapeHtml(text);
  const names = people().sort((a, b) => b.length - a.length);
  for (const n of names) {
    const pat = new RegExp(`@${escapeHtml(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    html = html.replace(pat, (m) => `<span class="rv-tag">${m}</span>`);
  }
  return html;
}

function paintMsg(node: HTMLElement, m: { author: string; time: number; text: string; reactions: Record<string, string[]> }): void {
  const own = sameName(m.author, me());
  const dot = node.querySelector<HTMLElement>('.rv-dot')!;
  const color = authorColor(m.author);
  if (dot.style.background !== color) dot.style.background = color;
  setText(node.querySelector('.rv-author'), m.author);
  setText(node.querySelector('.rv-time'), when(m.time));
  const text = node.querySelector<HTMLElement>('.rv-text')!;
  setHtml(text, mentionHtml(m.text), `${m.text}|${people().join(',')}`);
  setHidden(text, !m.text);
  for (const a of ['edit', 'delete']) setHidden(node.querySelector<HTMLElement>(`[data-act="${a}"]`)!, !own);
  const entries = Object.entries(m.reactions ?? {}).map(([key, names]) => ({ key, names }));
  patch(node.querySelector<HTMLElement>('.rv-reacts')!, entries, {
    key: (e) => e.key,
    create: (e) => el(`<button type="button" class="rv-react" data-act="toggleReact" data-react="${escapeHtml(e.key)}"><span class="rv-glyph"></span><span class="rv-n"></span></button>`),
    update: (n, e) => {
      const glyph = n.querySelector<HTMLElement>('.rv-glyph')!;
      if (REACTIONS[e.key]) setHtml(glyph, REACTIONS[e.key].svg, e.key); else setText(glyph, e.key);
      setText(n.querySelector('.rv-n'), String(e.names.length));
      setClass(n, 'is-mine', e.names.some((x) => sameName(x, me())));
      const tip = `${REACTIONS[e.key]?.label ?? e.key}: ${e.names.join(', ')}`;
      if (n.title !== tip) n.title = tip;
    },
  });
}

function createThread(): HTMLElement {
  return el(`<article class="rv-thread">${msgHtml('comment')}<div class="rv-replies"></div></article>`);
}

function updateThread(node: HTMLElement, c: Comment): void {
  const msg = node.querySelector<HTMLElement>(':scope > .rv-msg')!;
  paintMsg(msg, c);
  setClass(node, 'is-active', activeId() === c.id);
  setClass(node, 'is-resolved', !!c.resolved);
  setText(msg.querySelector('.rv-quote'), c.quote);
  setHidden(msg.querySelector<HTMLElement>('.rv-quote')!, !c.quote);
  setHidden(msg.querySelector<HTMLElement>('.rv-badge')!, !c.resolved);
  const assigned = msg.querySelector<HTMLElement>('.rv-assigned')!;
  setHidden(assigned, !c.assignee);
  setText(assigned.querySelector('.rv-assigned-name'), c.assignee ? `Assigned to ${c.assignee}` : '');
  const rb = msg.querySelector<HTMLElement>('[data-act="resolve"]')!;
  const label = c.resolved ? 'Reopen' : 'Resolve';
  setHtml(rb, c.resolved ? ICON.reopen : ICON.resolve, label);
  if (rb.title !== label) { rb.title = label; rb.setAttribute('aria-label', label); }
  patch(node.querySelector<HTMLElement>('.rv-replies')!, c.replies ?? [], {
    key: (r) => r.id,
    create: () => el(msgHtml('reply')),
    update: (n, r: Reply) => paintMsg(n, r),
  });
}

function createChange(): HTMLElement {
  return el(`<div class="rv-change"><span class="rv-dot"></span><div class="rv-change-body"><div class="rv-head"><b class="rv-author"></b><span class="rv-kind"></span><span class="rv-time"></span></div><div class="rv-snip"></div></div><div class="rv-actions">${btn('accept', 'Accept change', ICON.accept)}${btn('reject', 'Reject change', ICON.reject)}</div></div>`);
}

function updateChange(n: HTMLElement, c: Change): void {
  const dot = n.querySelector<HTMLElement>('.rv-dot')!;
  const color = authorColor(c.author);
  if (dot.style.background !== color) dot.style.background = color;
  setText(n.querySelector('.rv-author'), c.author || 'Unknown');
  setText(n.querySelector('.rv-kind'), c.kind === 'fmt' ? `formatted: ${(c.ops ?? []).map((o) => `${o.op === 'add' ? '' : 'not '}${o.mark}`).join(', ')}` : KIND_LABEL[c.kind]);
  setText(n.querySelector('.rv-time'), when(c.time));
  const snip = n.querySelector<HTMLElement>('.rv-snip')!;
  setText(snip, c.text.length > 140 ? `${c.text.slice(0, 140)}...` : c.text);
  setClass(snip, 'is-del', c.kind === 'del');
}

export function refresh(): void {
  if (!root || !ed().view) return;
  const v = view();
  const modeSel = q<HTMLSelectElement>('.rv-mode');
  setValue(modeSel, currentMode());
  const changes = collectChanges(v.state.doc);
  const all = threads();
  const open = all.filter((t) => !t.comment.resolved).length;
  setText(q('[data-count="comments"]'), open ? String(open) : '');
  setText(q('[data-count="changes"]'), changes.length ? String(changes.length) : '');
  if (tab === 'comments') {
    const list = all.filter((t) => (show === 'all' || (show === 'open') !== !!t.comment.resolved) && (!mine || sameName(t.comment.assignee, me())));
    patch(q('[data-list="comments"]'), list, { key: (t) => t.comment.id, create: createThread, update: (n, t) => updateThread(n, t.comment) });
    setText(q('[data-empty="comments"]'), list.length ? '' : mine ? 'No comments are assigned to you.' : show === 'resolved' ? 'No resolved comments.' : 'No comments yet. Select text and choose Add comment.');
    setHidden(q('[data-empty="comments"]'), list.length > 0);
  } else {
    patch(q('[data-list="changes"]'), changes, { key: (c) => c.key, create: createChange, update: updateChange });
    setText(q('[data-empty="changes"]'), changes.length ? '' : 'No tracked changes. Switch to Suggesting to record edits.');
    setHidden(q('[data-empty="changes"]'), changes.length > 0);
  }
  const hasChanges = changes.length > 0;
  for (const a of ['prev', 'next', 'acceptAll', 'rejectAll']) setDisabled(q<HTMLButtonElement>(`[data-act="${a}"]`), !hasChanges);
}

export async function showEditors(): Promise<Editor[]> {
  if (!root) return [];
  const rows = await editorsWithHistory();
  patch(q('[data-list="editors"]'), rows, {
    key: (r) => r.author.toLowerCase(),
    create: () => el('<div class="rv-editor"><span class="rv-dot"></span><b class="rv-author"></b><span class="rv-time"></span></div>'),
    update: (n, r) => {
      const dot = n.querySelector<HTMLElement>('.rv-dot')!;
      const color = authorColor(r.author);
      if (dot.style.background !== color) dot.style.background = color;
      setText(n.querySelector('.rv-author'), r.author);
      const parts = [r.edited ? `edited ${r.edited} paragraph${r.edited === 1 ? '' : 's'}` : '', r.last ? `last ${when(r.last)}` : '', r.inserted ? `${r.inserted} typed` : '', r.deleted ? `${r.deleted} deleted` : '', r.commented ? `${r.commented} comment${r.commented === 1 ? '' : 's'}` : ''].filter(Boolean);
      setText(n.querySelector('.rv-time'), parts.join(', '));
    },
  });
  return rows;
}

export function setTab(next: Tab): void {
  tab = next;
  if (!root) return;
  for (const b of root.querySelectorAll<HTMLElement>('[data-tab]')) setClass(b, 'is-on', b.dataset.tab === next);
  for (const s of root.querySelectorAll<HTMLElement>('[data-view]')) setHidden(s, s.dataset.view !== next);
  refresh();
}

function runSafe(fn: () => void): void {
  try { fn(); } catch (e) { toast((e as Error).message, 'error'); }
}

function mentionState(): void {
  const ta = q<HTMLTextAreaElement>('.rv-ta');
  const pop = q('.rv-mention');
  const m = /@([^\s@]*)$/.exec(ta.value.slice(0, ta.selectionStart));
  const names = m ? people().filter((n) => n.toLowerCase().includes(m[1].toLowerCase())).slice(0, 6) : [];
  mentionItems = names;
  if (mentionAt >= names.length) mentionAt = 0;
  setHidden(pop, !names.length);
  patch(pop, names, {
    key: (n) => n.toLowerCase(),
    create: (n) => el(`<button type="button" class="rv-mention-item" data-mention="${escapeHtml(n)}"></button>`),
    update: (node, n) => { setText(node, n); setClass(node, 'is-on', names[mentionAt] === n); },
  });
  const first = mentionsIn(ta.value);
  setHidden(q('.rv-assign-box'), !first.length || compose?.kind === 'edit');
}

function pickMention(name: string): void {
  const ta = q<HTMLTextAreaElement>('.rv-ta');
  const upto = ta.value.slice(0, ta.selectionStart);
  const m = /@([^\s@]*)$/.exec(upto);
  if (!m) return;
  const start = upto.length - m[0].length;
  const tail = ta.value.slice(ta.selectionStart);
  ta.value = `${ta.value.slice(0, start)}@${name} ${tail}`;
  const caret = start + name.length + 2;
  ta.setSelectionRange(caret, caret);
  mentionState();
  ta.focus();
}

export function startCompose(c: Compose, text = ''): void {
  if (!root) return;
  compose = c;
  const form = q<HTMLFormElement>('.rv-compose');
  const ta = q<HTMLTextAreaElement>('.rv-ta');
  const all = allComments();
  const base = all[c.cid];
  const ctx = c.kind === 'new' ? 'New comment' : c.kind === 'reply' ? `Reply to ${base?.author ?? ''}` : 'Edit';
  setText(q('.rv-ctx'), ctx);
  setText(q('.rv-post'), c.kind === 'new' ? 'Comment' : c.kind === 'reply' ? 'Reply' : 'Save');
  ta.value = text;
  q<HTMLInputElement>('.rv-assign').checked = false;
  setHidden(form, false);
  mentionState();
  ta.focus();
}

function endCompose(): void {
  compose = null;
  if (!root) return;
  setHidden(q('.rv-compose'), true);
  setHidden(q('.rv-mention'), true);
}

export function beginNewComment(): void {
  const range = selectionRange();
  startCompose({ kind: 'new', cid: '', rid: '', range });
}

function submit(): void {
  if (!compose) return;
  const ta = q<HTMLTextAreaElement>('.rv-ta');
  const c = compose;
  const text = ta.value.trim();
  const assignee = q<HTMLInputElement>('.rv-assign').checked ? mentionsIn(text)[0] ?? '' : '';
  runSafe(() => {
    if (c.kind === 'new') addComment({ text, assignee, range: c.range });
    else if (c.kind === 'reply') replyTo(c.cid, text, undefined, assignee || undefined);
    else editMessage(c.cid, c.rid, text);
    endCompose();
  });
}

export function openPicker(anchor: HTMLElement | null, onPick: (key: string) => void): void {
  if (!root) return;
  const pop = q('.rv-picker');
  pickHandler = onPick;
  setHidden(pop, false);
  const r = (anchor ?? q('.rv-top')).getBoundingClientRect();
  const w = pop.offsetWidth || 260;
  const h = pop.offsetHeight || 260;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  const input = q<HTMLInputElement>('.rv-picker-q');
  input.value = '';
  void loadEmoji().then((all) => { emojiAll = all; paintGrid(''); });
  input.focus();
}

function closePicker(): void {
  if (!root) return;
  pickHandler = null;
  setHidden(q('.rv-picker'), true);
}

function paintGrid(query: string): void {
  const list = query.trim() ? searchEmoji(emojiAll, query, 56) : emojiAll.filter((e) => e.group === 0).slice(0, 56);
  patch(q('.rv-picker-grid'), list, {
    key: (e) => e.char,
    create: (e) => el(`<button type="button" class="rv-emoji" data-pick="${escapeHtml(e.char)}"></button>`),
    update: (n, e) => { setText(n, e.char); if (n.title !== e.label) n.title = e.label; },
  });
}

function pick(key: string): void {
  const fn = pickHandler;
  closePicker();
  if (fn) runSafe(() => fn(key));
}

function onAction(act: string, target: HTMLElement): void {
  const thread = target.closest<HTMLElement>('.rv-thread');
  const cid = thread?.dataset.key ?? '';
  const rid = target.closest<HTMLElement>('.rv-msg[data-role="reply"]')?.dataset.key ?? '';
  const comment = allComments()[cid];
  runSafe(() => {
    switch (act) {
      case 'new': beginNewComment(); break;
      case 'cancel': endCompose(); break;
      case 'react': openPicker(target, (key) => toggleReaction(cid, rid, key)); break;
      case 'toggleReact': toggleReaction(cid, rid, target.dataset.react ?? ''); break;
      case 'reply': startCompose({ kind: 'reply', cid, rid: '' }); break;
      case 'resolve': setResolved(cid, !comment?.resolved); break;
      case 'edit': startCompose({ kind: 'edit', cid, rid }, rid ? comment?.replies.find((r) => r.id === rid)?.text ?? '' : comment?.text ?? ''); break;
      case 'delete': deleteMessage(cid, rid); break;
      case 'unassign': setAssignee(cid, ''); break;
      case 'link': copyLink(cid); break;
      case 'prev': moveToChange(-1); break;
      case 'next': moveToChange(1); break;
      case 'acceptAll': applyChanges(collectChanges(view().state.doc), true); break;
      case 'rejectAll': applyChanges(collectChanges(view().state.doc), false); break;
      case 'editors': showEditors(); break;
      case 'accept':
      case 'reject': {
        const key = target.closest<HTMLElement>('.rv-change')?.dataset.key;
        const c = collectChanges(view().state.doc).find((x) => x.key === key);
        if (c) applyChanges([c], act === 'accept');
        break;
      }
      default: break;
    }
  });
}

export function copyLink(id: string): string {
  if (!allComments()[id]) throw new Error(`No comment has the id ${id}.`);
  const url = linkTo(id);
  void navigator.clipboard?.writeText(url).then(() => toast('Link to comment copied.')).catch(() => toast(url));
  return url;
}

function build(): HTMLElement {
  const node = el(SKELETON);
  root = node;
  onChange(refresh);
  onMode((m: Mode) => { setValue(q<HTMLSelectElement>('.rv-mode'), m); });
  node.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.tab as Tab); return; }
    const pickBtn = t.closest<HTMLElement>('[data-pick]');
    if (pickBtn) { pick(pickBtn.dataset.pick ?? ''); return; }
    const men = t.closest<HTMLElement>('[data-mention]');
    if (men) { pickMention(men.dataset.mention ?? ''); return; }
    const act = t.closest<HTMLElement>('[data-act]');
    if (act) { onAction(act.dataset.act ?? '', act); return; }
    const thread = t.closest<HTMLElement>('.rv-thread');
    if (thread && !t.closest('textarea')) { gotoComment(thread.dataset.key ?? ''); return; }
    const row = t.closest<HTMLElement>('.rv-change');
    if (row) {
      const c = collectChanges(view().state.doc).find((x) => x.key === row.dataset.key);
      if (c) {
        const v = view();
        v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, c.ranges[0].from, c.ranges[c.ranges.length - 1].to)).scrollIntoView().setMeta(REVIEW_META, true));
      }
    }
  });
  node.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('.rv-mode')) runSafe(() => setMode((t as HTMLSelectElement).value as Mode));
    else if (t.matches('.rv-show')) { show = (t as HTMLSelectElement).value as typeof show; refresh(); }
    else if (t.matches('.rv-mine')) { mine = (t as HTMLInputElement).checked; refresh(); }
  });
  node.querySelector('.rv-compose')!.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  const ta = q<HTMLTextAreaElement>('.rv-ta');
  ta.addEventListener('input', () => { mentionAt = 0; mentionState(); });
  ta.addEventListener('keydown', (e) => {
    const open = !q('.rv-mention').hidden && mentionItems.length > 0;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); mentionAt = (mentionAt + (e.key === 'ArrowDown' ? 1 : mentionItems.length - 1)) % mentionItems.length; mentionState(); }
    else if (open && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMention(mentionItems[mentionAt]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (open) setHidden(q('.rv-mention'), true); else endCompose(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  });
  const pq = q<HTMLInputElement>('.rv-picker-q');
  pq.addEventListener('input', () => paintGrid(pq.value));
  pq.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); } });
  document.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    if (root && !q('.rv-picker').hidden && !t.closest('.rv-picker') && !t.closest('[data-act="react"]')) closePicker();
  });
  return node;
}

export function panelElement(): HTMLElement {
  return root ?? build();
}
