import type { DocEditor } from '../../editor';
import { toast } from '../../../ui/toast';
import { announce } from './kit';
import { addWord } from './spell';
import { applyFix, goToIssue, ignoreKey, issueKeys, issuesOf, nextIssue, proofKey, suggestionsFor, waitForScan } from './check';
import { bump, ignoreAllAdd, ignoreOnceAdd } from './state';
import type { Category, Issue } from './types';

export type Located = Issue & { from: number; to: number };

let walking = false;
let onComplete: (() => void) | null = null;

export function setCompleteHandler(fn: () => void): void { onComplete = fn; }
export function isWalking(): boolean { return walking; }
export function setWalking(on: boolean): void { walking = on; }

export function current(ed: DocEditor): Located | null {
  const view = ed.view;
  if (!view) return null;
  const sel = view.state.selection;
  return issuesOf(view.state).find((i) => i.from <= sel.from && sel.to <= i.to) ?? null;
}

export function dropDecos(ed: DocEditor, issue: { from: number; to: number }): void {
  const view = ed.view;
  if (!view) return;
  view.dispatch(view.state.tr.setMeta(proofKey, { drop: [{ from: issue.from, to: issue.to }] }).setMeta('addToHistory', false));
}

export function replaceIssue(ed: DocEditor, issue: Located, text: string): boolean {
  const view = ed.view;
  if (!view) return false;
  view.dispatch(view.state.tr.insertText(text, issue.from, issue.to).scrollIntoView());
  return true;
}

export async function accept(ed: DocEditor, issue: Located, index: number): Promise<string> {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  if (issue.cat === 'spelling') {
    const list = await suggestionsFor(issue);
    const choice = list[index];
    if (!choice) throw new Error(`No suggestion number ${index + 1} for ${issue.text}.`);
    replaceIssue(ed, issue, choice);
    announce(`Changed ${issue.text} to ${choice}`);
    return choice;
  }
  const fix = issue.fixes[index];
  if (!fix) throw new Error('This suggestion has no automatic fix.');
  applyFix(view, issue, index);
  announce(fix.label);
  return fix.text;
}

export async function changeAll(ed: DocEditor, issue: Located, text: string): Promise<number> {
  const view = ed.view;
  if (!view) return 0;
  const same = issuesOf(view.state).filter((i) => i.cat === issue.cat && i.rule === issue.rule && i.text.toLowerCase() === issue.text.toLowerCase());
  const tr = view.state.tr;
  for (const i of [...same].reverse()) tr.insertText(text, i.from, i.to);
  view.dispatch(tr);
  return same.length;
}

export function ignoreOnce(ed: DocEditor, issue: Located): void {
  ignoreOnceAdd(issueKeys(issue).once);
  dropDecos(ed, issue);
  announce(`Ignored ${issue.text}`);
}

export function ignoreAll(ed: DocEditor, issue: Located): void {
  ignoreAllAdd(ignoreKey(issue));
  const view = ed.view;
  if (view) for (const i of issuesOf(view.state)) if (ignoreKey(i) === ignoreKey(issue)) dropDecos(ed, i);
  announce(`Ignoring every ${issue.text}`);
}

export async function addToDictionary(ed: DocEditor, issue: Located): Promise<void> {
  if (issue.cat !== 'spelling') throw new Error('Only a misspelled word can be added to the dictionary.');
  await addWord(issue.text);
  bump();
  const view = ed.view;
  if (view) for (const i of issuesOf(view.state)) if (i.cat === 'spelling' && i.text.toLowerCase() === issue.text.toLowerCase()) dropDecos(ed, i);
  announce(`Added ${issue.text} to the dictionary`);
}

export function move(ed: DocEditor, dir: 1 | -1, filter?: Category): Located | null {
  const view = ed.view;
  if (!view) return null;
  const all = issuesOf(view.state).filter((i) => !filter || i.cat === filter);
  const sel = view.state.selection;
  const next = nextIssue(view, dir, filter);
  if (!next) {
    if (walking) finishWalk();
    return null;
  }
  const wrapped = dir === 1 ? next.from < sel.from && all.length > 0 : next.from > sel.to;
  if (walking && wrapped) {
    finishWalk();
    return null;
  }
  goToIssue(view, next);
  return next;
}

function finishWalk(): void {
  walking = false;
  toast('The spelling and grammar check is complete.');
  announce('The spelling and grammar check is complete');
  onComplete?.();
}

export async function startWalk(ed: DocEditor): Promise<Located | null> {
  const view = ed.view;
  if (!view) throw new Error('Open a document first.');
  await waitForScan();
  walking = true;
  const all = issuesOf(view.state);
  if (!all.length) {
    finishWalk();
    return null;
  }
  const first = all[0];
  goToIssue(view, first);
  return first;
}
