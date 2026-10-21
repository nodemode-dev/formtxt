import { ReplaceStep } from 'prosemirror-transform';
import { Slice } from 'prosemirror-model';
import type { DocEditor } from '../../editor';
import { el, setHidden, setTitle } from '../../../ui/dom';

type Loose = Record<string, unknown>;

export function isCompat(ed: DocEditor): boolean {
  return Boolean((ed.doc?.settings as unknown as Loose | undefined)?.compatMode);
}

export function clearCompat(ed: DocEditor): void {
  if (!ed.doc || !ed.view) throw new Error('Open a document first.');
  const next: Loose = { ...(ed.doc.settings as unknown as Loose) };
  delete next.compatMode;
  ed.doc = { ...ed.doc, settings: next as never };
  const tr = ed.view.state.tr;
  tr.step(new ReplaceStep(0, 0, Slice.empty));
  ed.view.dispatch(tr.setMeta('addToHistory', false).setMeta('ftxt-system', true));
}

let badge: HTMLButtonElement | null = null;

export function mountBadge(onClick: () => void): HTMLButtonElement | null {
  if (badge) return badge;
  const status = document.querySelector<HTMLElement>('.ft-status');
  if (!status) return null;
  badge = el<HTMLButtonElement>('<button type="button" class="ft-compat" hidden>Compatibility Mode</button>');
  setTitle(badge, 'This file came from Word 97-2003. Click to convert it to the current format.');
  badge.addEventListener('click', onClick);
  status.appendChild(badge);
  return badge;
}

export function paintBadge(ed: DocEditor): void {
  if (badge) setHidden(badge, !isCompat(ed));
}
