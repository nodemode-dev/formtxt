import type { CommandRegistry } from '../../engine/registry';
import { toast } from '../../ui/toast';
import type { DocEditor } from '../editor';
import { addPlugin, onDocumentLoaded } from './plugins';
import { addMenuItems, panelOpen, togglePanel } from './ui';
import { vx } from './versions/api';
import { bindControlDblClick, bindPopClose, controlDialog, controlPlugin, controlSites, controlValue, fillControl, insertControl } from './versions/controls';
import { type Loose, ask, requireView } from './versions/core';
import { bindFieldClicks, fieldDialog, infoPlugin, insertInfoField, listInfoFields, updateInfoFields } from './versions/fields';
import { activityDialog, bindHistory, historyElement, nameDialog, refreshHistory, restoreVersion, saveNamed, versionRows } from './versions/history';
import { envelopeDialog, labelsDialog, makeEnvelope, makeLabels } from './versions/mail';
import { bindMerge, finishMerge, insertMergeField, mergeData, mergePanel, mergePlugin, paint as paintMerge, previewRecord, setCsv, setPreview } from './versions/merge';
import { type Mode, MODES, applyProtection, approvalDialog, approvalOf, approvalStatus, bannerText, cancelApproval, mountBanner, passwordPrompt, protectDialog, protectPlugin, protectionOf, refreshProtection, removeProtection, requestApproval, respondApproval } from './versions/protect';
import { bindRecovery, offerRecovery, propertiesDialog, propertiesOf, recoveryPlugin, setProperties } from './versions/props';
import { insertSignatureLine, requestSignature, signatureDialog } from './versions/sign';

type P = Record<string, unknown>;
type Param = { name: string; type: 'string' | 'number' | 'boolean'; description: string };

export function unlockDocument(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ask('Password needed', 'Password', 'password', 'Open', async (pw) => { await vx.unlock(id, pw); resolve(); }, 'This document is password protected. Type its password to open it.', () => reject(new Error('The document stays locked.')));
  });
}

export function register(reg: CommandRegistry, ed: DocEditor): void {
  const add = (id: string, label: string, group: string, description: string, run: (p: P) => unknown, params: Param[] = [], keys: string[] = []): void =>
    reg.register({ id, label, group, description, run, params, keys });

  addPlugin(protectPlugin);
  addPlugin(controlPlugin);
  addPlugin(mergePlugin);
  addPlugin(recoveryPlugin);
  addPlugin(infoPlugin(ed));
  bindRecovery(ed);
  bindHistory(ed);
  bindMerge(ed);
  bindFieldClicks(ed);
  bindControlDblClick(ed);
  bindPopClose();
  mountBanner(ed, () => { if (protectionOf(ed).mode || !approvalOf(ed)) protectDialog(ed); else approvalDialog(ed); });

  onDocumentLoaded(() => {
    refreshProtection();
    paintMerge();
    const id = ed.docId();
    void vx.opened(id).then(() => { if (panelOpen('versions')) void refreshHistory(); }).catch(() => undefined);
    updateInfoFields(ed);
    window.setTimeout(() => { if (ed.docId() === id) updateInfoFields(ed); }, 900);
    void offerRecovery(ed).catch(() => undefined);
    if (panelOpen('versions')) void refreshHistory().catch(() => undefined);
  });

  add('versions.panel', 'Version history', 'File', 'Show or hide the Version history panel: every saved version of this document by time and author, with preview, naming and restore.', () => {
    requireView(ed);
    const open = togglePanel('versions', 'Version history', () => historyElement(ed));
    if (open) void refreshHistory().catch((e: Error) => toast(e.message, 'error'));
    return open;
  });
  add('versions.list', 'List versions', 'File', 'List the saved versions of the open document, newest first.', async () => { requireView(ed); await refreshHistory(); return versionRows(); });
  add('versions.name', 'Name this version', 'File', 'Save the document as it is now as a named version that is never thinned out. With no name, asks for one.', async (p) => {
    requireView(ed);
    if (p.name === undefined) { nameDialog(ed); return true; }
    const row = await saveNamed(String(p.name));
    return { id: row.id, name: row.name };
  }, [{ name: 'name', type: 'string', description: 'Version name' }]);
  add('versions.preview', 'Preview a version', 'File', 'Read a saved version without opening it: its text and what differs from the current document.', async (p) => {
    requireView(ed);
    return vx.detail(ed.docId(), String(p.id ?? ''));
  }, [{ name: 'id', type: 'string', description: 'Version id, from versions.list' }]);
  add('versions.restore', 'Restore a version', 'File', 'Restore a saved version. The current document is kept as a version called Before restore, so nothing is lost.', async (p) => {
    await restoreVersion(String(p.id ?? ''));
    return true;
  }, [{ name: 'id', type: 'string', description: 'Version id, from versions.list' }]);
  add('versions.rename', 'Rename a version', 'File', 'Give a saved version a name, or clear its name by passing an empty one.', async (p) => {
    requireView(ed);
    const row = await vx.rename(ed.docId(), String(p.id ?? ''), String(p.name ?? ''));
    await refreshHistory();
    return row;
  }, [{ name: 'id', type: 'string', description: 'Version id' }, { name: 'name', type: 'string', description: 'New name' }]);
  add('versions.delete', 'Delete a version', 'File', 'Delete one saved version.', async (p) => {
    requireView(ed);
    await vx.remove(ed.docId(), String(p.id ?? ''));
    await refreshHistory();
    return true;
  }, [{ name: 'id', type: 'string', description: 'Version id' }]);
  add('activity.show', 'Activity', 'File', 'Show who opened and edited this document and when, with changes from the command line listed as Agent.', async () => { await activityDialog(ed); return true; });
  add('activity.list', 'List activity', 'File', 'Opens and edits of the open document, newest first, by person or Agent.', async () => { requireView(ed); return vx.activity(ed.docId()); });
  add('file.properties', 'Document properties', 'File', 'Edit title, subject, author, keywords, category and comments; with parameters, sets them without the dialog.', (p) => {
    requireView(ed);
    if (!Object.keys(p).length) { propertiesDialog(ed); return true; }
    return setProperties(ed, p as Loose);
  }, [{ name: 'title', type: 'string', description: 'Title' }, { name: 'subject', type: 'string', description: 'Subject' }, { name: 'author', type: 'string', description: 'Author' }, { name: 'keywords', type: 'string', description: 'Keywords separated by commas' }, { name: 'category', type: 'string', description: 'Category' }, { name: 'comments', type: 'string', description: 'Comments' }]);
  add('properties.get', 'Get document properties', 'File', 'Title, subject, author, keywords, category, comments, created, modified and word count.', () => propertiesOf(ed));
  add('file.recover', 'Recover unsaved changes', 'File', 'Check this browser for a newer copy of the open document, kept as you typed, and offer to recover it.', async () => offerRecovery(ed, false));

  add('password.set', 'Password protect', 'File', 'Encrypt the document on this computer with a password. With no password, asks for one.', async (p) => {
    requireView(ed);
    if (p.password === undefined) { passwordPrompt(ed, 'set'); return true; }
    await vx.setPassword(ed.docId(), String(p.password), String(p.current ?? ''));
    return true;
  }, [{ name: 'password', type: 'string', description: 'New password' }, { name: 'current', type: 'string', description: 'Current password, when changing one' }]);
  add('password.remove', 'Remove password', 'File', 'Decrypt the document and remove its password.', async (p) => {
    requireView(ed);
    if (p.password === undefined) { passwordPrompt(ed, 'remove'); return true; }
    await vx.removePassword(ed.docId(), String(p.password));
    return true;
  }, [{ name: 'password', type: 'string', description: 'Current password' }]);
  add('password.status', 'Password status', 'File', 'Whether the open document is password protected.', async () => { requireView(ed); return vx.status(ed.docId()); });

  add('protect.dialog', 'Restrict editing', 'Review', 'Choose what readers may do: nothing, comment, tracked changes only, or fill in forms.', () => { protectDialog(ed); return true; });
  add('protect.set', 'Protect the document', 'Review', `Restrict editing. Modes: ${MODES.map((m) => m[0]).join(', ')}. An optional password is needed to turn it off.`, async (p) => {
    const mode = String(p.mode ?? '') as Mode;
    if (!MODES.some((m) => m[0] === mode)) throw new Error(`mode takes one of ${MODES.map((m) => m[0]).join(', ')}.`);
    return applyProtection(ed, mode, String(p.password ?? ''));
  }, [{ name: 'mode', type: 'string', description: 'readonly, comments, tracked or forms' }, { name: 'password', type: 'string', description: 'Optional password to turn it off' }]);
  add('protect.off', 'Stop protection', 'Review', 'Turn off editing restrictions; asks for the password when one was set.', async (p) => { requireView(ed); if (protectionOf(ed).hash && p.password === undefined) { protectDialog(ed); return true; } await removeProtection(ed, String(p.password ?? '')); return true; }, [{ name: 'password', type: 'string', description: 'The protection password, if one was set' }]);
  add('protect.status', 'Protection status', 'Review', 'The editing restriction and approval status of the open document.', () => {
    requireView(ed);
    return { mode: protectionOf(ed).mode, passwordSet: !!protectionOf(ed).hash, approval: approvalStatus(approvalOf(ed)) || 'none', banner: bannerText() };
  });

  add('approval.dialog', 'Approvals', 'Review', 'Request approval from named people, record approvals and rejections, and cancel an approval.', () => { approvalDialog(ed); return true; });
  add('approval.request', 'Request approval', 'Review', 'Ask named people to approve the document, with a due date and a note. Once everyone approves it becomes read only.', (p) => {
    const people = Array.isArray(p.people) ? p.people.map(String) : String(p.people ?? '').split(',');
    return requestApproval(ed, people, String(p.due ?? ''), String(p.note ?? ''));
  }, [{ name: 'people', type: 'string', description: 'Names separated by commas' }, { name: 'due', type: 'string', description: 'Due date, YYYY-MM-DD' }, { name: 'note', type: 'string', description: 'Note to the approvers' }]);
  add('approval.respond', 'Approve or reject', 'Review', 'Record one person\'s decision with an optional comment.', (p) => respondApproval(ed, String(p.person ?? ''), String(p.decision ?? ''), String(p.comment ?? '')), [{ name: 'person', type: 'string', description: 'Name as requested' }, { name: 'decision', type: 'string', description: 'approve or reject' }, { name: 'comment', type: 'string', description: 'Comment' }]);
  add('approval.cancel', 'Cancel approval', 'Review', 'Remove the approval request; an approved document becomes editable again.', () => cancelApproval(ed));
  add('approval.status', 'Approval status', 'Review', 'The approval request, who has decided, and the overall status.', () => { requireView(ed); const a = approvalOf(ed); return a ? { ...a, status: approvalStatus(a) } : null; });

  add('field.insert', 'Insert field', 'Insert', 'Insert a document field that updates: DATE, TIME, CREATEDATE, SAVEDATE, AUTHOR, FILENAME, TITLE, SUBJECT, NUMWORDS or NUMPAGES. With no code, opens the field dialog.', (p) => {
    requireView(ed);
    if (p.code === undefined) { fieldDialog(ed); return true; }
    return insertInfoField(ed, String(p.code), String(p.format ?? ''));
  }, [{ name: 'code', type: 'string', description: 'Field code such as DATE or NUMPAGES' }, { name: 'format', type: 'string', description: 'Format such as MMMM d, yyyy or h:mm AM/PM' }]);
  add('fields.updateInfo', 'Update document fields', 'Insert', 'Refresh date, time, author, title, word count and page count fields.', () => { requireView(ed); return { updated: updateInfoFields(ed) }; });
  add('fields.listInfo', 'List document fields', 'Insert', 'Every document field with its code, format and current text.', () => listInfoFields(ed));

  add('control.dialog', 'Content control', 'Insert', 'Insert a content control (plain text, rich text, check box, date picker or drop-down list), or edit the one at the cursor.', () => { controlDialog(ed); return true; });
  add('control.insert', 'Insert content control', 'Insert', 'Insert a content control with a title and placeholder. kind: text, richtext, checkbox, date or dropdown.', (p) => {
    const site = insertControl(ed, p as Loose);
    return { pos: site.pos, kind: site.node.attrs.kind };
  }, [{ name: 'kind', type: 'string', description: 'text, richtext, checkbox, date or dropdown' }, { name: 'title', type: 'string', description: 'Control title' }, { name: 'tag', type: 'string', description: 'Name used to fill it by automation' }, { name: 'placeholder', type: 'string', description: 'Placeholder text' }, { name: 'options', type: 'string', description: 'Drop-down items, comma separated' }, { name: 'format', type: 'string', description: 'Date format such as MMMM d, yyyy' }]);
  add('control.list', 'List content controls', 'Insert', 'Every content control with its kind, title, tag and value.', () => { requireView(ed); return controlSites(ed).map((s) => ({ pos: s.pos, kind: s.node.attrs.kind, title: s.node.attrs.title, tag: s.node.attrs.tag, value: controlValue(s.node) })); });
  add('control.fill', 'Fill a content control', 'Insert', 'Set the value of every content control with a title or tag (a check box takes true or false). Works in a form-only document.', (p) => fillControl(ed, String(p.key ?? ''), typeof p.value === 'boolean' ? p.value : String(p.value ?? '')), [{ name: 'key', type: 'string', description: 'Control title or tag' }, { name: 'value', type: 'string', description: 'Value to set' }]);

  add('merge.panel', 'Mail merge', 'Tools', 'Show or hide the Mail merge panel: choose a data file, insert merge fields, preview records and finish.', () => {
    requireView(ed);
    const open = togglePanel('merge', 'Mail merge', () => mergePanel(ed));
    paintMerge();
    return open;
  });
  add('merge.setData', 'Set mail merge data', 'Tools', 'Use CSV text (first row is the column names) as the mail merge data.', (p) => { const d = setCsv(ed, String(p.csv ?? ''), String(p.source ?? 'pasted data')); return { columns: d.columns, records: d.rows.length }; }, [{ name: 'csv', type: 'string', description: 'CSV or tab separated text with a header row' }, { name: 'source', type: 'string', description: 'Label for the data' }]);
  add('merge.loadFile', 'Choose mail merge data file', 'Tools', 'Open the Mail merge panel and choose a CSV or Excel data file.', () => { togglePanel('merge', 'Mail merge', () => mergePanel(ed)); const input = document.querySelector<HTMLInputElement>('.ft-vx-merge input[type="file"]'); input?.click(); return true; });
  add('merge.insertField', 'Insert merge field', 'Tools', 'Insert a merge field for a data column at the cursor.', (p) => insertMergeField(ed, String(p.name ?? '')), [{ name: 'name', type: 'string', description: 'Column name' }]);
  add('merge.preview', 'Preview merge results', 'Tools', 'Show the values of one record in place of the merge fields; 0 turns the preview off.', (p) => setPreview(ed, Number(p.record ?? 1)), [{ name: 'record', type: 'number', description: 'Record number from 1, or 0 for none' }]);
  add('merge.finish', 'Finish and merge', 'Tools', 'Create one new document with a page for each record and open it.', (p) => finishMerge(ed, String(p.title ?? '')), [{ name: 'title', type: 'string', description: 'Title of the merged document' }]);
  add('merge.info', 'Mail merge status', 'Tools', 'The data columns, record count and preview position.', () => { requireView(ed); const d = mergeData(ed); return d ? { source: d.source, columns: d.columns, records: d.rows.length, preview: previewRecord() } : null; });

  add('envelope.dialog', 'Envelope', 'Insert', 'Build an envelope document with a delivery and return address.', () => { envelopeDialog(ed); return true; });
  add('envelope.create', 'Create envelope', 'Insert', 'Create a new envelope document. size: dl, env10, c5 or monarch.', async (p) => makeEnvelope({ size: String(p.size ?? 'dl'), delivery: String(p.delivery ?? ''), sender: String(p.sender ?? '') }), [{ name: 'size', type: 'string', description: 'dl, env10, c5 or monarch' }, { name: 'delivery', type: 'string', description: 'Delivery address, lines separated by newlines' }, { name: 'sender', type: 'string', description: 'Return address' }]);
  add('labels.dialog', 'Labels', 'Insert', 'Build a sheet of address labels, the same label or one per row of a data file.', () => { labelsDialog(ed); return true; });
  add('labels.create', 'Create labels', 'Insert', 'Create a new labels document on an Avery sheet (5160, 5161 or 5163). Use {Column} in the template with the mail merge data, or give a count for the same label.', async (p) => {
    const d = mergeData(ed);
    const useData = p.fromData === true || String(p.fromData) === 'true';
    const records = useData && d ? d.rows.map((r) => Object.fromEntries(d.columns.map((c, i) => [c, r[i] ?? '']))) : null;
    return makeLabels({ sheet: String(p.sheet ?? '5160'), template: String(p.template ?? ''), records, count: Number(p.count ?? 0), skip: Number(p.skip ?? 0) });
  }, [{ name: 'sheet', type: 'string', description: '5160, 5161 or 5163' }, { name: 'template', type: 'string', description: 'Label text' }, { name: 'count', type: 'number', description: 'How many of the same label' }, { name: 'fromData', type: 'boolean', description: 'One label per mail merge record' }, { name: 'skip', type: 'number', description: 'Labels already used on the sheet' }]);

  add('signature.dialog', 'Signature line', 'Insert', 'Insert a signature line with a signer, title and instructions.', () => { signatureDialog(ed); return true; });
  add('signature.insert', 'Insert signature line', 'Insert', 'Insert a signature line block after the current paragraph.', (p) => insertSignatureLine(ed, String(p.signer ?? ''), String(p.title ?? ''), String(p.instructions ?? '')), [{ name: 'signer', type: 'string', description: 'Suggested signer' }, { name: 'title', type: 'string', description: 'Signer title' }, { name: 'instructions', type: 'string', description: 'Instructions to the signer' }]);
  add('signature.request', 'Sign in FormPDF', 'File', 'Export the document to PDF and open it in FormPDF to collect a signature. Says plainly if FormPDF is not running.', () => requestSignature(ed));

  add('cloud.get', 'Get cloud copy folder', 'File', 'The folder that also receives a copy of every save, or empty.', async () => (await vx.cloud()).folder);
  add('cloud.set', 'Set cloud copy folder', 'File', 'Also save a copy of each document to a folder, such as a synced Dropbox or OneDrive folder; empty turns it off.', async (p) => (await vx.setCloud(String(p.folder ?? ''))).folder, [{ name: 'folder', type: 'string', description: 'Folder path on this computer' }]);

  addMenuItems('File', [
    { cmd: 'versions.panel', label: 'Version history' },
    { cmd: 'versions.name', label: 'Name this version...' },
    { cmd: 'activity.show', label: 'Activity...' },
    { cmd: 'file.properties', label: 'Properties...' },
    { cmd: 'file.recover', label: 'Recover unsaved changes' },
    { cmd: 'password.set', label: 'Password protect...' },
    { cmd: 'password.remove', label: 'Remove password...' },
    { cmd: 'signature.request', label: 'Sign in FormPDF' },
  ]);
  addMenuItems('Review', [
    { cmd: 'protect.dialog', label: 'Restrict editing...' },
    { cmd: 'protect.off', label: 'Stop protection' },
    { cmd: 'approval.dialog', label: 'Approvals...' },
  ]);
  addMenuItems('Insert', [
    { cmd: 'field.insert', label: 'Field...' },
    { cmd: 'control.dialog', label: 'Content control...' },
    { cmd: 'signature.dialog', label: 'Signature line...' },
    { cmd: 'envelope.dialog', label: 'Envelope...' },
    { cmd: 'labels.dialog', label: 'Labels...' },
  ]);
  addMenuItems('Tools', [{ cmd: 'merge.panel', label: 'Mail merge' }]);
}
