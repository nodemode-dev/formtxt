import { commands as registry } from '../../../engine/registry';
import { shellCommands } from '../cmd';
import { docRoot, paraInfo } from './state';

const call = (id: string, params: Record<string, unknown> = {}): Promise<unknown> => shellCommands.call(id, params);
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const raw = (id: string, params: Record<string, unknown> = {}): Promise<unknown> => Promise.resolve(registry.run(id, params));

export async function mergePaste(): Promise<void> {
  const root = docRoot();
  if (!root) return;
  root.focus();
  const data = new DataTransfer();
  let html = '';
  let text = '';
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
    }
  } catch {
    try { text = await navigator.clipboard.readText(); } catch { throw new Error('The browser did not allow reading the clipboard here. Press Ctrl+V to paste.'); }
  }
  if (html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    for (const n of Array.from(d.body.querySelectorAll<HTMLElement>('*'))) for (const a of ['style', 'class', 'face', 'color', 'size', 'bgcolor', 'align', 'width', 'height']) n.removeAttribute(a);
    data.setData('text/html', d.body.innerHTML);
  }
  data.setData('text/plain', text);
  root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}

export async function bulletStyle(ch: string): Promise<void> {
  const p = paraInfo();
  if (!ch) { if (p.list === 'bullet') await call('list.bullet'); return; }
  if (p.list !== 'bullet') await call('list.bullet');
  await call('list.format', { bullet: ch });
}

export async function numberStyle(format: string, suffix: string): Promise<void> {
  const p = paraInfo();
  if (!format) { if (p.list === 'number') await call('list.number'); return; }
  if (p.list !== 'number') await call('list.number');
  await call('list.format', { format, suffix });
}

export async function toggleSpace(which: 'spaceBefore' | 'spaceAfter'): Promise<void> {
  const p = paraInfo();
  const cur = which === 'spaceBefore' ? p.before : p.after;
  await call('paragraph.set', { [which]: cur > 0 ? 0 : 12 });
}

export async function documentSpacing(line: number, before: number, after: number): Promise<void> {
  await call('edit.selectAll');
  await wait(60);
  await call('paragraph.lineSpacing', { value: line });
  await call('paragraph.set', { spaceBefore: before, spaceAfter: after });
}

export async function removeCover(): Promise<void> {
  const root = docRoot();
  if (!root || !root.querySelector(':scope > hr.ft-page-break')) return;
  const first = root.firstElementChild as HTMLElement;
  const br = root.querySelector(':scope > hr.ft-page-break') as HTMLElement;
  root.focus();
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(br);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  await wait(80);
  document.execCommand('delete');
  await wait(60);
  await raw('layout.sections');
}

async function title(): Promise<string> {
  try { const r = (await raw('properties.get')) as { title?: string }; return r.title ?? ''; } catch { return ''; }
}

export async function setHeaderFooter(part: 'header' | 'footer', align: string, text: string): Promise<void> {
  const t = text === '@title' ? await title() : text;
  await call('layout.setHeaderFooter', { part, align, text: t });
}

export async function removeHeaderFooter(part: 'header' | 'footer'): Promise<void> {
  await call('layout.setHeaderFooter', { part, text: '' });
}

export async function removePageNumbers(): Promise<void> {
  const list = (await raw('layout.sections')) as Array<{ headers: Record<string, { text?: string }>; footers: Record<string, { text?: string }> }>;
  const cur = list[0];
  if (!cur) return;
  for (const [part, map] of [['header', cur.headers], ['footer', cur.footers]] as const) {
    for (const which of ['default', 'first', 'even']) {
      const v = map?.[which];
      if (v?.text && v.text.includes('{PAGE}')) await call('layout.setHeaderFooter', { part, which, text: '' });
    }
  }
}

const RECENT = 'formtxt.recentSymbols';
export function recentSymbols(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
export function noteSymbol(ch: string): void {
  try { localStorage.setItem(RECENT, JSON.stringify([ch, ...recentSymbols().filter((c) => c !== ch)].slice(0, 20))); } catch { void 0; }
}

export async function insertSymbol(ch: string): Promise<void> {
  noteSymbol(ch);
  await call('insert.symbol', { char: ch });
}
