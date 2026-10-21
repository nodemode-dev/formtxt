import { keymap } from 'prosemirror-keymap';
import { Plugin } from 'prosemirror-state';
import { commands, type CommandRegistry, type CommandParam } from '../../engine/registry';
import { toast } from '../../ui/toast';
import type { DocEditor } from '../editor';
import { addPlugin, onDocumentLoaded } from './plugins';
import { addMenuItems, openPanel, togglePanel } from './ui';
import { type Mode, bind, ed, me, notify, onChange, view } from './review/core';
import { askCompare, runCompare } from './review/compare';
import { addComment, clearTrash, deleteMessage, detectActive, editMessage, gotoComment, activeId, paintSheet, reactToSelection, replyTo, restoreFromTrash, setActive, setAssignee, setResolved, threads, toggleReaction } from './review/comments';
import { beginNewComment, copyLink, openPicker, panelElement, refresh, setTab, showEditors } from './review/panel';
import { REACTIONS } from './review/icons';
import { badgePlugin, refreshBadges } from './review/badges';
import { applyChanges, changesAtSelection, collectChanges, currentMode, editorsOf, moveToChange, setMode, syncModeFromDoc, trackPlugin } from './review/track';

const PANEL = 'review';
const str = (name: string, description: string): CommandParam => ({ name, type: 'string', description });
const AUTHOR = str('author', 'Name to act as. Defaults to Agent when run from the command line or an agent.');
const asAgent = (p: Record<string, unknown>): string => String(p.author ?? '').trim() || 'Agent';

function showPanel(tab: 'comments' | 'changes'): void {
  openPanel(PANEL, 'Review', panelElement());
  setTab(tab);
  refresh();
}

function pickChange(id: string): ReturnType<typeof collectChanges> {
  const all = collectChanges(view().state.doc);
  if (!id) {
    const here = changesAtSelection();
    if (!here.length) throw new Error('There is no tracked change at the caret. Move to one, or pass an id from review.listChanges.');
    return here;
  }
  const hit = all.filter((c) => c.key === id || c.id === id);
  if (!hit.length) throw new Error(`No tracked change has the id ${id}.`);
  return hit;
}

function summarize(): Array<Record<string, unknown>> {
  return threads().map((t) => ({
    id: t.comment.id, author: t.comment.author, text: t.comment.text, quote: t.comment.quote, resolved: !!t.comment.resolved,
    assignee: t.comment.assignee, replies: t.comment.replies.length, reactions: Object.keys(t.comment.reactions ?? {}), time: t.comment.time,
  }));
}

function viewPlugin(): Plugin {
  return new Plugin({
    view: () => ({
      update(v, prev) {
        const docChanged = v.state.doc !== prev.doc;
        if (docChanged) restoreFromTrash();
        if (docChanged || !v.state.selection.eq(prev.selection)) detectActive();
        if (docChanged) notify();
      },
    }),
  });
}

function openFromLink(): void {
  const params = new URLSearchParams(location.search);
  const doc = params.get('doc') ?? '';
  const comment = params.get('comment') ?? '';
  if (!doc && !comment) return;
  let target = comment;
  const finish = (): void => {
    const id = target;
    target = '';
    history.replaceState(null, '', location.pathname);
    window.setTimeout(() => {
      try {
        showPanel('comments');
        if (id && !gotoComment(id)) toast('That comment is no longer in the document.');
      } catch (e) { toast((e as Error).message, 'error'); }
    }, 60);
  };
  onDocumentLoaded(() => { if (target) finish(); });
  let tries = 0;
  const go = (): void => {
    if (doc && commands.has('file.open')) { void commands.run('file.open', { id: doc }).catch((e: Error) => toast(`Could not open the linked document: ${e.message}`, 'error')); return; }
    if (!doc) { if (ed().view) finish(); return; }
    if (++tries < 20) window.setTimeout(go, 100);
  };
  window.setTimeout(go, 0);
}

export function register(reg: CommandRegistry, e: DocEditor): void {
  bind(e);
  addPlugin(trackPlugin());
  addPlugin(viewPlugin());
  addPlugin(badgePlugin());
  addPlugin(keymap({
    'Mod-Alt-m': () => { void commands.run('review.newComment').catch((err: Error) => toast(err.message, 'error')); return true; },
    'Mod-Alt-e': () => { void commands.run('review.toggleTracking').catch((err: Error) => toast(err.message, 'error')); return true; },
  }));
  onDocumentLoaded(() => {
    syncModeFromDoc();
    clearTrash();
    setActive('');
    paintSheet();
    notify();
  });
  onChange(paintSheet);
  onChange(refreshBadges);

  const add = (id: string, label: string, description: string, params: CommandParam[], run: (p: Record<string, unknown>) => unknown, keys?: string[]): void =>
    reg.register({ id, label, group: 'Review', description, params, keys, run });

  add('review.panel', 'Comments and changes', 'Show or hide the Review panel with comments and tracked changes.', [], () => {
    if (togglePanel(PANEL, 'Review', panelElement)) { refresh(); return true; }
    return false;
  });
  add('review.newComment', 'Add comment', 'Comment on the selected text (or the word at the caret) from the Review panel.', [], () => { showPanel('comments'); beginNewComment(); return true; }, ['Ctrl+Alt+M']);
  add('review.addComment', 'Add comment with text', 'Attach a comment with the given text to the selected text (or the word at the caret).', [str('text', 'Comment text; @Name mentions a person'), AUTHOR, str('assignee', 'Person to assign the comment to')], (p) => {
    const c = addComment({ text: String(p.text ?? ''), author: asAgent(p), assignee: String(p.assignee ?? '') });
    return { id: c.id };
  });
  add('review.listComments', 'List comments', 'List the comments in the open tab in document order.', [str('status', 'open, resolved or all (default all)')], (p) => {
    const s = String(p.status ?? 'all');
    return summarize().filter((c) => s === 'all' || (s === 'resolved') === !!c.resolved);
  });
  add('review.replyComment', 'Reply to comment', 'Add a reply to a comment thread.', [str('id', 'Comment id'), str('text', 'Reply text'), AUTHOR, str('assignee', 'Person to assign the thread to')], (p) => ({ id: replyTo(String(p.id ?? ''), String(p.text ?? ''), asAgent(p), p.assignee ? String(p.assignee) : undefined).id }));
  add('review.editComment', 'Edit comment', 'Change the text of your own comment or reply.', [str('id', 'Comment id'), str('text', 'New text'), str('replyId', 'Reply id, to edit a reply'), AUTHOR], (p) => { editMessage(String(p.id ?? ''), String(p.replyId ?? ''), String(p.text ?? ''), asAgent(p)); return true; });
  add('review.deleteComment', 'Delete comment', 'Delete your own comment (and its thread) or reply. Undo restores the highlight.', [str('id', 'Comment id'), str('replyId', 'Reply id, to delete a reply'), AUTHOR], (p) => { deleteMessage(String(p.id ?? ''), String(p.replyId ?? ''), asAgent(p)); return true; });
  add('review.resolveComment', 'Resolve comment', 'Mark a comment thread resolved.', [str('id', 'Comment id')], (p) => { setResolved(String(p.id ?? ''), true); return true; });
  add('review.reopenComment', 'Reopen comment', 'Reopen a resolved comment thread.', [str('id', 'Comment id')], (p) => { setResolved(String(p.id ?? ''), false); return true; });
  add('review.assignComment', 'Assign comment', 'Assign a comment to a person; an empty name unassigns it.', [str('id', 'Comment id'), str('to', 'Person name')], (p) => { setAssignee(String(p.id ?? ''), String(p.to ?? '')); return true; });
  add('review.reactComment', 'React to comment', `Toggle a reaction on a comment or reply. The reaction is one of ${Object.keys(REACTIONS).join(', ')} or any emoji character.`, [str('id', 'Comment id'), str('reaction', 'Reaction name or emoji'), str('replyId', 'Reply id, to react to a reply'), AUTHOR], (p) => { toggleReaction(String(p.id ?? ''), String(p.replyId ?? ''), String(p.reaction ?? ''), asAgent(p)); return true; });
  add('review.reactToSelection', 'React to selection', 'React to the selected text with an icon or emoji, without writing a comment.', [str('reaction', 'Reaction name or emoji; omit to choose in the panel'), AUTHOR], (p) => {
    if (p.reaction) return { id: reactToSelection(String(p.reaction), asAgent(p)).id };
    showPanel('comments');
    openPicker(null, (key) => { reactToSelection(key, me()); });
    return true;
  });
  add('review.copyCommentLink', 'Copy link to comment', 'Copy a link that opens this document and selects the comment. Uses the active comment when no id is given.', [str('id', 'Comment id')], (p) => copyLink(String(p.id ?? '') || activeId()));
  add('review.gotoComment', 'Go to comment', 'Select the text a comment is attached to.', [str('id', 'Comment id')], (p) => {
    if (!gotoComment(String(p.id ?? ''))) throw new Error('That comment is not in the open tab.');
    return true;
  });

  add('review.setMode', 'Set editing mode', 'Switch between Editing, Suggesting (changes are tracked) and Viewing (read only).', [str('mode', 'editing, suggesting or viewing')], (p) => {
    const m = String(p.mode ?? '');
    if (!['editing', 'suggesting', 'viewing'].includes(m)) throw new Error('mode must be editing, suggesting or viewing.');
    return setMode(m as Mode);
  });
  add('review.toggleTracking', 'Track changes', 'Switch between Editing and Suggesting. In Suggesting, typing becomes insertions and deletions stay struck through until accepted.', [], () => setMode(currentMode() === 'suggesting' ? 'editing' : 'suggesting'), ['Ctrl+Alt+E']);
  add('review.listChanges', 'List tracked changes', 'List tracked insertions and deletions in the open tab.', [], () => collectChanges(view().state.doc).map((c) => ({ id: c.key, kind: ({ ins: 'insertion', del: 'deletion', fmt: 'formatting', split: 'paragraph split', join: 'paragraph join' } as const)[c.kind], author: c.author, time: c.time, text: c.text, ...(c.ops ? { ops: c.ops } : {}) })));
  add('review.acceptChange', 'Accept change', 'Accept the tracked change at the caret or selection, or the one with the given id.', [str('id', 'Change id from review.listChanges')], (p) => applyChanges(pickChange(String(p.id ?? '')), true));
  add('review.rejectChange', 'Reject change', 'Reject the tracked change at the caret or selection, or the one with the given id.', [str('id', 'Change id from review.listChanges')], (p) => applyChanges(pickChange(String(p.id ?? '')), false));
  add('review.nextChange', 'Next change', 'Select the next tracked change.', [], () => { const c = moveToChange(1); if (!c) throw new Error('There are no tracked changes.'); return c.key; });
  add('review.previousChange', 'Previous change', 'Select the previous tracked change.', [], () => { const c = moveToChange(-1); if (!c) throw new Error('There are no tracked changes.'); return c.key; });
  add('review.acceptAll', 'Accept all changes', 'Accept every tracked change in the open tab.', [], () => applyChanges(collectChanges(view().state.doc), true));
  add('review.rejectAll', 'Reject all changes', 'Reject every tracked change in the open tab.', [], () => applyChanges(collectChanges(view().state.doc), false));
  add('review.showEditors', 'Show editors', 'Show who edited the selected paragraphs and when (from version history), and who typed, deleted or commented on the selected text (the whole tab when nothing is selected).', [], async () => {
    showPanel('changes');
    return showEditors();
  });

  const compare = (mode: 'compare' | 'suggest' | 'combine') => (p: Record<string, unknown>): unknown => {
    if (!p.other) return askCompare(mode).then(() => true);
    return runCompare(mode, String(p.other), String(p.author ?? ''));
  };
  const OTHER = str('other', 'Id of the other document in the library; omit to choose from a list');
  add('review.compareDocuments', 'Compare documents', 'Compare this document with another and create a new document where every difference is a tracked insertion or deletion by the other document\'s author.', [OTHER, str('author', 'Name to attribute the changes to; defaults to the other document\'s author')], compare('compare'));
  add('review.suggestFromDocument', 'Suggest edits from another document', 'Turn the differences from another document into tracked changes in this one.', [OTHER, str('author', 'Name to attribute the changes to')], compare('suggest'));
  add('review.combineDocuments', 'Combine documents', 'Merge another document into this one: its differences become tracked changes and its comments are copied over.', [OTHER, str('author', 'Name to attribute the changes to')], compare('combine'));

  addMenuItems('Review', [
    { cmd: 'review.newComment', label: 'Add comment', keys: 'Ctrl+Alt+M' },
    { cmd: 'review.panel', label: 'Show comments and changes' },
    { cmd: 'review.reactToSelection', label: 'React to selection' },
    { cmd: 'review.copyCommentLink', label: 'Copy link to comment' },
  ]);
  addMenuItems('Review', [
    { cmd: 'review.setMode', label: 'Editing', params: { mode: 'editing' } },
    { cmd: 'review.setMode', label: 'Suggesting', params: { mode: 'suggesting' } },
    { cmd: 'review.setMode', label: 'Viewing', params: { mode: 'viewing' } },
    { cmd: 'review.toggleTracking', label: 'Track changes', keys: 'Ctrl+Alt+E' },
  ]);
  addMenuItems('Review', [
    { cmd: 'review.acceptChange', label: 'Accept change' },
    { cmd: 'review.rejectChange', label: 'Reject change' },
    { cmd: 'review.nextChange', label: 'Next change' },
    { cmd: 'review.previousChange', label: 'Previous change' },
    { cmd: 'review.acceptAll', label: 'Accept all changes' },
    { cmd: 'review.rejectAll', label: 'Reject all changes' },
    { cmd: 'review.showEditors', label: 'Show editors' },
  ]);
  addMenuItems('Review', [
    { cmd: 'review.compareDocuments', label: 'Compare documents' },
    { cmd: 'review.suggestFromDocument', label: 'Suggest edits from another document' },
    { cmd: 'review.combineDocuments', label: 'Combine documents' },
  ]);

  openFromLink();
}
