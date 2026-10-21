import type { EditorView } from 'prosemirror-view';
import type { DocEditor } from '../../editor';
import { el, escapeHtml, setHidden, setHtml } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { accept, addToDictionary, ignoreAll, ignoreOnce, replaceIssue, type Located } from './actions';
import { issueAt, suggestionsFor } from './check';

let pop: HTMLElement | null = null;
let issue: Located | null = null;
let edRef: DocEditor | null = null;

function ensure(): HTMLElement {
  if (pop) return pop;
  pop = el('<div class="ft-menu ft-pf-menu" role="menu" aria-label="Spelling and grammar suggestions" hidden></div>');
  document.getElementById('overlay-root')?.appendChild(pop);
  pop.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-do]');
    if (!item || !issue || !edRef) return;
    const act = item.dataset.do;
    const target = issue;
    const ed = edRef;
    close();
    const run = async (): Promise<void> => {
      if (act === 'sug') {
        const i = Number(item.dataset.i);
        if (target.cat === 'spelling') replaceIssue(ed, target, item.dataset.text ?? '');
        else await accept(ed, target, i);
      } else if (act === 'once') ignoreOnce(ed, target);
      else if (act === 'all') ignoreAll(ed, target);
      else if (act === 'dict') await addToDictionary(ed, target);
      ed.view?.focus();
    };
    void run().catch((err: Error) => toast(err.message, 'error'));
  });
  pop.addEventListener('keydown', (e) => {
    const items = Array.from(pop?.querySelectorAll<HTMLElement>('.ft-menu-item') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); edRef?.view?.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); close(); edRef?.view?.focus(); }
  });
  document.addEventListener('mousedown', (e) => { if (pop && !pop.hidden && !(e.target as HTMLElement).closest('.ft-pf-menu')) close(); }, true);
  return pop;
}

export function close(): void {
  if (pop && !pop.hidden) setHidden(pop, true);
}

export function menuOpen(): boolean {
  return !!pop && !pop.hidden;
}

export async function openMenu(ed: DocEditor, found: Located, x: number, y: number): Promise<void> {
  const box = ensure();
  edRef = ed;
  issue = found;
  const sugs = (await Promise.race([suggestionsFor(found), new Promise<string[]>((r) => setTimeout(() => r([]), 1500))])).slice(0, 5);
  const parts: string[] = [`<div class="ft-pf-menu-title" role="presentation">${escapeHtml(found.cat === 'spelling' ? found.text : found.message)}</div>`];
  if (sugs.length) sugs.forEach((s, i) => parts.push(`<button type="button" class="ft-menu-item ft-pf-menu-sug" role="menuitem" data-do="sug" data-i="${i}" data-text="${escapeHtml(s)}">${escapeHtml(s || '(delete)')}</button>`));
  else parts.push('<div class="ft-pf-menu-none" role="presentation">No suggestions</div>');
  parts.push('<div class="ft-menu-sep" role="separator"></div>');
  parts.push('<button type="button" class="ft-menu-item" role="menuitem" data-do="once">Ignore once</button>');
  parts.push('<button type="button" class="ft-menu-item" role="menuitem" data-do="all">Ignore all</button>');
  if (found.cat === 'spelling') parts.push('<button type="button" class="ft-menu-item" role="menuitem" data-do="dict">Add to dictionary</button>');
  const html = parts.join('');
  setHtml(box, html, html);
  box.style.left = '0px';
  box.style.top = '0px';
  setHidden(box, false);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.max(4, Math.min(x, window.innerWidth - r.width - 8))}px`;
  box.style.top = `${Math.max(4, Math.min(y, window.innerHeight - r.height - 8))}px`;
  box.querySelector<HTMLElement>('.ft-menu-item')?.focus({ preventScroll: true });
}

export function contextMenuHandler(ed: DocEditor): (view: EditorView, event: Event) => boolean {
  return (view, event) => {
    const e = event as MouseEvent;
    const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (!at) return false;
    const hit = issueAt(view.state, at.pos);
    if (!hit) return false;
    e.preventDefault();
    void openMenu(ed, hit as Located, e.clientX, e.clientY);
    return true;
  };
}

export function openAtCaret(ed: DocEditor): boolean {
  const view = ed.view;
  if (!view) return false;
  const hit = issueAt(view.state, view.state.selection.head);
  if (!hit) return false;
  const c = view.coordsAtPos(view.state.selection.head);
  void openMenu(ed, hit as Located, c.left, c.bottom + 4);
  return true;
}
