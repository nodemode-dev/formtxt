import { Dialog } from '../../../ui/dialog';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { vx } from './api';
import { grid, input, requireView, saveNow } from './core';

export function insertSignatureLine(ed: DocEditor, signer: string, title: string, instructions: string): boolean {
  requireView(ed);
  const view = ed.view!;
  const node = view.state.schema.nodes.signature_line.create({ id: `sig_${Math.random().toString(36).slice(2, 10)}`, signer: signer.slice(0, 120), title: title.slice(0, 120), instructions: instructions.slice(0, 300) });
  const { $to } = view.state.selection;
  const after = $to.depth ? $to.after(1) : $to.pos;
  view.dispatch(view.state.tr.insert(Math.min(after, view.state.doc.content.size), node).scrollIntoView());
  return true;
}

export function signatureDialog(ed: DocEditor): void {
  requireView(ed);
  const d = new Dialog('Signature line', 460);
  const signer = input('text', '', 'maxlength="120" placeholder="Suggested signer"');
  const title = input('text', '', 'maxlength="120" placeholder="Title of the signer"');
  const note = input('text', '', 'maxlength="300" placeholder="Instructions to the signer"');
  grid(d, [['Suggested signer', signer], ['Signer title', title], ['Instructions to the signer', note]]);
  d.button('Cancel', 'ghost', () => d.close());
  d.button('Insert', 'primary', () => { insertSignatureLine(ed, signer.value, title.value, note.value); d.close(); });
  d.open(signer);
}

export async function requestSignature(ed: DocEditor): Promise<{ ok: boolean; message: string; path: string }> {
  requireView(ed);
  await saveNow(ed);
  const out = await vx.sign(ed.docId());
  toast(out.message, out.ok ? 'info' : 'error');
  return out;
}
