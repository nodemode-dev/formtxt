import { api } from '../../../io/api';
import { type PatchListOptions, patchList } from '../../../ui/dom';

export function patch<T>(container: HTMLElement, items: T[], opts: PatchListOptions<T>): void {
  patchList(container, items, { ...opts, create: (item) => { const n = opts.create(item); opts.update(n, item); return n; } });
}

export const PALETTE = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];

function randomId(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'c' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export const CLIENT_ID = randomId();

export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function wsUrl(path: string): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api${path}`;
}

let cachedName = '';

export async function myName(): Promise<string> {
  if (cachedName) return cachedName;
  try {
    const s = await api.get<Record<string, unknown>>('/settings');
    cachedName = String(s.author ?? '').trim();
  } catch { cachedName = ''; }
  return cachedName || 'Guest';
}

export function forgetName(): void {
  cachedName = '';
}

export function shareTokenFromUrl(): string {
  try { return new URLSearchParams(location.search).get('share') ?? ''; } catch { return ''; }
}

export function later(fn: () => void, ms: number): () => void {
  let t = 0;
  return () => { window.clearTimeout(t); t = window.setTimeout(fn, ms); };
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
