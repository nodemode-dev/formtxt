import type { PItem } from './types';

export const R = (label: string | (() => string), cmd: string, params?: Record<string, unknown>, o: Partial<PItem> = {}): PItem => ({ label, cmd, params, ...o });
export const X = (label: string | (() => string), run: () => unknown, o: Partial<PItem> = {}): PItem => ({ label, run, ...o });
