import { api } from '../../../io/api';
import { DEFAULT_PREFS, type ProofingPrefs } from './types';

type Listener = () => void;

let prefs: ProofingPrefs = JSON.parse(JSON.stringify(DEFAULT_PREFS)) as ProofingPrefs;
let version = 1;
let engineUp = true;
let docLang = 'en-US';
const listeners = new Set<Listener>();
const ignoredAll = new Set<string>();
const ignoredOnce = new Set<string>();

export function getPrefs(): ProofingPrefs { return prefs; }
export function checkVersion(): number { return version; }
export function bump(): void { version++; for (const l of listeners) l(); }
export function onChange(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function engineAvailable(): boolean { return engineUp; }
export function setEngineAvailable(up: boolean): void { if (engineUp !== up) { engineUp = up; bump(); } }
export function documentLanguage(): string { return docLang; }
export function setDocumentLanguage(code: string): void { const next = code || 'en-US'; if (docLang !== next) { docLang = next; bump(); } }

export function ignoreAllHas(key: string): boolean { return ignoredAll.has(key); }
export function ignoreAllAdd(key: string): void { ignoredAll.add(key); bump(); }
export function ignoreOnceHas(key: string): boolean { return ignoredOnce.has(key); }
export function ignoreOnceAdd(key: string): void { ignoredOnce.add(key); bump(); }
export function clearIgnores(): void { ignoredAll.clear(); ignoredOnce.clear(); }

export async function loadPrefs(): Promise<ProofingPrefs> {
  try {
    prefs = await api.get<ProofingPrefs>('/proofing/prefs');
    engineUp = true;
  } catch {
    engineUp = false;
  }
  bump();
  return prefs;
}

export async function savePrefs(patch: Record<string, unknown>): Promise<ProofingPrefs> {
  prefs = await api.put<ProofingPrefs>('/proofing/prefs', patch);
  bump();
  return prefs;
}
