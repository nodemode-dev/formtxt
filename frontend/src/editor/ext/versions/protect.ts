import { Plugin, type EditorState, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import type { Node as PMNode } from 'prosemirror-model';
import { commands } from '../../../engine/registry';
import { Dialog } from '../../../ui/dialog';
import { el, setClass, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { pagesKey } from '../../pages';
import { FORM, type Loose, SYSTEM, ask, docSettings, input, note, requireView, setSetting, sha, when } from './core';
import { setSealed } from './props';

export type Mode = '' | 'readonly' | 'comments' | 'tracked' | 'forms';

export const MODES: Array<[Mode, string, string]> = [
  ['readonly', 'No changes (read only)', 'Nobody can edit the document.'],
  ['comments', 'Comments', 'Readers can add comments but not change the text.'],
  ['tracked', 'Tracked changes', 'Every edit is recorded as a tracked change.'],
  ['forms', 'Filling in forms', 'Readers can only fill in the form controls.'],
];

const TRACK_IDS = ['review.setMode', 'review.trackChanges', 'review.toggleTrackChanges'];

interface Approval { status: string; note: string; due: string; requestedAt: number; people: Array<{ name: string; status: string; comment: string; at: number }> }

let editor: DocEditor | null = null;
let banner: HTMLElement | null = null;
let lastWarn = 0;

export function protectionOf(ed: DocEditor): { mode: Mode; salt?: string; hash?: string } {
  const p = docSettings(ed).protection as Loose | undefined;
  return p && typeof p.mode === 'string' ? { mode: p.mode as Mode, salt: p.salt, hash: p.hash } : { mode: '' };
}

export function approvalOf(ed: DocEditor): Approval | null {
  const a = docSettings(ed).approval as Approval | undefined;
  return a && Array.isArray(a.people) ? a : null;
}

export function approvalStatus(a: Approval | null): string {
  if (!a || !a.people.length) return '';
  if (a.people.some((p) => p.status === 'rejected')) return 'rejected';
  return a.people.every((p) => p.status === 'approved') ? 'approved' : 'pending';
}

export function effectiveMode(): Mode {
  if (!editor?.doc) return '';
  if (approvalStatus(approvalOf(editor)) === 'approved') return 'readonly';
  return protectionOf(editor).mode;
}

export function trackingAvailable(): boolean {
  return TRACK_IDS.some((id) => commands.has(id));
}

function trackingOn(): boolean {
  return !!docSettings(editor!).trackChanges;
}

async function enableTracking(): Promise<boolean> {
  if (trackingOn()) return true;
  const id = TRACK_IDS.find((i) => commands.has(i));
  if (!id) return false;
  try { await commands.run(id, id === 'review.setMode' ? { mode: 'suggesting' } : { on: true }); } catch { return false; }
  return trackingOn();
}

function insideControl(doc: PMNode, from: number, to: number): boolean {
  const a = doc.resolve(from);
  const b = doc.resolve(to);
  for (let d = a.depth; d > 0; d--) {
    if (a.node(d).type.name === 'content_control') return b.depth >= d && b.node(d) === a.node(d) && a.node(d).attrs.kind !== 'checkbox' && a.node(d).attrs.kind !== 'date' && a.node(d).attrs.kind !== 'dropdown';
  }
  return false;
}

function warn(text: string): void {
  const now = Date.now();
  if (now - lastWarn < 4000) return;
  lastWarn = now;
  toast(text);
}

function allowed(tr: Transaction): boolean {
  if (!tr.docChanged || !editor?.doc) return true;
  if (tr.getMeta(SYSTEM) || tr.getMeta('fields') || tr.getMeta(pagesKey) || tr.getMeta('collabRemote') || tr.getMeta('collabInit')) return true;
  const mode = effectiveMode();
  if (!mode) return true;
  if (mode === 'readonly') { warn(approvalStatus(approvalOf(editor)) === 'approved' ? 'This document is approved and read only. Cancel the approval to edit it.' : 'This document is read only.'); return false; }
  if (mode === 'comments') {
    if (tr.getMeta('comment') || tr.getMeta('comments')) return true;
    if (tr.steps.length && tr.steps.every((s) => (s instanceof AddMarkStep || s instanceof RemoveMarkStep) && /comment/i.test(s.mark.type.name))) return true;
    warn('This document allows comments only.');
    return false;
  }
  if (mode === 'tracked') {
    if (trackingOn() && trackingAvailable()) return true;
    if (trackingAvailable()) void enableTracking();
    warn(trackingAvailable() ? 'Tracked changes are required here. Tracking is being turned on; try again.' : 'Tracked changes are not available yet, so this document is read only.');
    return false;
  }
  if (tr.getMeta(FORM)) return true;
  const ok = tr.steps.length > 0 && tr.steps.every((s, i) => s instanceof ReplaceStep && insideControl(tr.docs[i], (s as unknown as { from: number }).from, (s as unknown as { to: number }).to));
  if (!ok) warn('This document allows filling in form controls only.');
  return ok;
}

export const protectPlugin = new Plugin({ filterTransaction: (tr: Transaction, _s: EditorState) => allowed(tr) });

export function bannerText(): string {
  if (!editor?.doc) return '';
  const a = approvalOf(editor);
  const st = approvalStatus(a);
  const mode = protectionOf(editor).mode;
  const parts: string[] = [];
  if (st === 'approved') parts.push('Approved. Read only until the approval is cancelled');
  else if (mode === 'readonly') parts.push('Read only. Editing is restricted');
  else if (mode === 'comments') parts.push('Comments only. Editing is restricted');
  else if (mode === 'tracked') parts.push(trackingAvailable() ? 'Tracked changes only. Editing is restricted' : 'Tracked changes only. Tracking is not available, so editing is read only');
  else if (mode === 'forms') parts.push('Filling in forms only. Editing is restricted');
  if (st === 'pending' && a) parts.push(`Waiting for approval (${a.people.filter((p) => p.status === 'approved').length} of ${a.people.length})`);
  if (st === 'rejected') parts.push('Approval rejected');
  return parts.join('. ');
}

export function refreshProtection(): void {
  const text = bannerText();
  if (!banner) return;
  setText(banner.querySelector('.ft-vx-banner-text'), text);
  setHidden(banner, !text);
  setClass(banner, 'is-locked', effectiveMode() !== '');
  if (editor?.view) editor.view.dom.setAttribute('aria-readonly', effectiveMode() ? 'true' : 'false');
}

export function mountBanner(ed: DocEditor, open: () => void): void {
  editor = ed;
  const bar = document.querySelector<HTMLElement>('.ft-menubar');
  if (!bar || banner) return;
  banner = el('<button type="button" class="ft-vx-banner" hidden aria-live="polite"><span class="ft-vx-banner-dot" aria-hidden="true"></span><span class="ft-vx-banner-text"></span></button>');
  banner.addEventListener('click', open);
  bar.appendChild(banner);
}

export async function applyProtection(ed: DocEditor, mode: Mode, password: string): Promise<string> {
  requireView(ed);
  if (!mode) throw new Error('Choose what readers can do.');
  const value: Loose = { mode };
  if (password) {
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    value.salt = salt;
    value.hash = await sha(password, salt);
  }
  setSetting(ed, 'protection', value);
  if (mode === 'tracked') await enableTracking();
  refreshProtection();
  return bannerText();
}

export async function removeProtection(ed: DocEditor, password: string): Promise<void> {
  requireView(ed);
  const p = protectionOf(ed);
  if (!p.mode) return;
  if (p.hash && (await sha(password, p.salt ?? '')) !== p.hash) throw new Error('That password is not right.');
  setSetting(ed, 'protection', undefined);
  refreshProtection();
}

export function protectDialog(ed: DocEditor): void {
  requireView(ed);
  const cur = protectionOf(ed);
  const d = new Dialog('Restrict editing', 480);
  const group = el('<div class="ft-vx-modes" role="radiogroup" aria-label="Allowed editing"></div>');
  const radios: HTMLInputElement[] = [];
  for (const [mode, label, help] of MODES) {
    const row = el('<label class="ft-vx-mode"><input type="radio" name="vx-mode"><span class="ft-vx-mode-text"><span class="ft-vx-mode-name"></span><span class="ft-vx-mode-help"></span></span></label>');
    const r = row.querySelector('input') as HTMLInputElement;
    r.value = mode;
    r.checked = cur.mode === mode || (!cur.mode && mode === 'readonly');
    setText(row.querySelector('.ft-vx-mode-name'), label);
    setText(row.querySelector('.ft-vx-mode-help'), help);
    radios.push(r);
    group.appendChild(row);
  }
  d.body.appendChild(group);
  const pw = input('password', '', 'autocomplete="new-password" placeholder="Optional password to turn this off"');
  d.field(cur.mode ? 'Password (needed to change or stop)' : 'Password (optional)', pw);
  note(d, 'The password only controls who can turn the restriction off. It does not encrypt the document; use File > Password protect for that.');
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  const fail = (e: Error): void => { err.textContent = e.message; err.hidden = false; };
  d.button('Cancel', 'ghost', () => d.close());
  if (cur.mode) d.button('Stop protection', '', () => { void removeProtection(ed, pw.value).then(() => d.close()).catch(fail); });
  d.button(cur.mode ? 'Change' : 'Start protection', 'primary', () => {
    const mode = (radios.find((r) => r.checked)?.value ?? 'readonly') as Mode;
    const go = async (): Promise<void> => {
      if (cur.mode && cur.hash && (await sha(pw.value, cur.salt ?? '')) !== cur.hash) throw new Error('That password is not right.');
      await applyProtection(ed, mode, pw.value || '');
      d.close();
    };
    void go().catch(fail);
  });
  d.open(radios.find((r) => r.checked));
}

export function requestApproval(ed: DocEditor, people: string[], due: string, text: string): Approval {
  requireView(ed);
  const names = Array.from(new Set(people.map((p) => p.trim()).filter(Boolean))).slice(0, 20);
  if (!names.length) throw new Error('Name at least one person who should approve.');
  const a: Approval = { status: 'pending', note: text.slice(0, 500), due: due.slice(0, 10), requestedAt: Date.now() / 1000, people: names.map((name) => ({ name: name.slice(0, 80), status: 'pending', comment: '', at: 0 })) };
  setSetting(ed, 'approval', a);
  refreshProtection();
  return a;
}

export function respondApproval(ed: DocEditor, person: string, decision: string, comment: string): Approval {
  const a = approvalOf(ed);
  if (!a) throw new Error('There is no approval request on this document.');
  const p = a.people.find((x) => x.name.toLowerCase() === person.trim().toLowerCase());
  if (!p) throw new Error(`${person} was not asked to approve. Asked: ${a.people.map((x) => x.name).join(', ')}.`);
  if (decision !== 'approve' && decision !== 'reject') throw new Error('decision takes approve or reject.');
  p.status = decision === 'approve' ? 'approved' : 'rejected';
  p.comment = comment.slice(0, 500);
  p.at = Date.now() / 1000;
  a.status = approvalStatus(a);
  setSetting(ed, 'approval', { ...a, people: a.people.map((x) => ({ ...x })) });
  refreshProtection();
  return a;
}

export function cancelApproval(ed: DocEditor): boolean {
  requireView(ed);
  if (!approvalOf(ed)) return false;
  setSetting(ed, 'approval', undefined);
  refreshProtection();
  return true;
}

export function approvalDialog(ed: DocEditor): void {
  requireView(ed);
  const d = new Dialog('Approvals', 520);
  const body = el('<div class="ft-vx-approval"></div>');
  d.body.appendChild(body);
  const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
  d.body.appendChild(err);
  const people = input('text', '', 'placeholder="Names, separated by commas" spellcheck="false"');
  const due = input('date');
  const text = input('text', '', 'maxlength="500" placeholder="A note for the approvers"');
  const form = el('<div class="ft-vx-request"></div>');
  const fields: Array<[string, HTMLElement]> = [['Approvers', people], ['Due date', due], ['Note', text]];
  for (const [label, control] of fields) { const row = el('<label class="ft-field"><span class="ft-field-label"></span></label>'); setText(row.firstElementChild, label); row.appendChild(control); form.appendChild(row); }
  const list = el('<div class="ft-vx-people" role="list"></div>');
  const summary = el('<p class="ft-note ft-vx-summary"></p>');
  body.append(summary, list, form);
  const send = d.button('Request approval', 'primary', () => {
    try { requestApproval(ed, people.value.split(','), due.value, text.value); err.hidden = true; paint(); } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
  });
  const cancel = d.button('Cancel approval', '', () => { cancelApproval(ed); paint(); });
  d.button('Close', 'ghost', () => d.close());
  const paint = (): void => {
    const a = approvalOf(ed);
    setHidden(form, !!a);
    setHidden(list, !a);
    setHidden(send, !!a);
    setHidden(cancel, !a);
    if (!a) { setText(summary, 'Ask named people to approve this document. Once everyone approves, it becomes read only until you cancel the approval.'); list.replaceChildren(); return; }
    const st = approvalStatus(a);
    setText(summary, `${st === 'approved' ? 'Approved by everyone' : st === 'rejected' ? 'Rejected' : 'Waiting for approval'}${a.due ? `, due ${a.due}` : ''}${a.note ? `. Note: ${a.note}` : ''}`);
    list.replaceChildren(...a.people.map((p) => {
      const row = el('<div class="ft-vx-person" role="listitem"><span class="ft-vx-person-name"></span><span class="ft-vx-person-state"></span><input class="ft-input" type="text" maxlength="500" placeholder="Comment" aria-label="Comment"><button type="button" class="ft-btn sm" data-d="approve">Approve</button><button type="button" class="ft-btn sm danger" data-d="reject">Reject</button></div>');
      setText(row.querySelector('.ft-vx-person-name'), p.name);
      setText(row.querySelector('.ft-vx-person-state'), p.status === 'pending' ? 'Waiting' : `${p.status === 'approved' ? 'Approved' : 'Rejected'} ${when(p.at)}${p.comment ? `: ${p.comment}` : ''}`);
      const c = row.querySelector('input') as HTMLInputElement;
      row.addEventListener('click', (e) => {
        const dec = (e.target as HTMLElement).closest<HTMLElement>('[data-d]')?.dataset.d;
        if (dec) { respondApproval(ed, p.name, dec, c.value); paint(); }
      });
      return row;
    }));
  };
  paint();
  d.open(people);
}

export function passwordPrompt(ed: DocEditor, kind: 'set' | 'remove'): void {
  requireView(ed);
  const id = ed.docId();
  if (kind === 'set') {
    const d = new Dialog('Password protect', 440);
    note(d, 'The document is encrypted on this computer. Without the password nobody can open it, and it cannot be recovered. The title stays visible in the library.');
    const cur = input('password', '', 'autocomplete="off" placeholder="Only if one is set already"');
    const a = input('password', '', 'autocomplete="new-password"');
    const b = input('password', '', 'autocomplete="new-password"');
    d.field('Current password', cur);
    d.field('New password', a);
    d.field('Type it again', b);
    const err = el('<p class="ft-note ft-vx-error" role="alert" hidden></p>');
    d.body.appendChild(err);
    d.button('Cancel', 'ghost', () => d.close());
    d.button('Encrypt', 'primary', () => {
      if (!a.value || a.value !== b.value) { err.textContent = 'The two passwords do not match.'; err.hidden = false; return; }
      void import('./api').then(({ vx }) => vx.setPassword(id, a.value, cur.value)).then(() => { setSealed(id, true); d.close(); toast('The document is password protected.'); }).catch((e: Error) => { err.textContent = e.message; err.hidden = false; });
    });
    d.open(a);
    return;
  }
  ask('Remove password', 'Password', 'password', 'Remove password', async (pw) => { const { vx } = await import('./api'); await vx.removePassword(id, pw); setSealed(id, false); toast('The password was removed and the document is no longer encrypted.'); });
}
