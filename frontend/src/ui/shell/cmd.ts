import { commands as registry, type Command as RegCommand } from '../../engine/registry';
import { isMac } from '../dom';
import { toast } from '../toast';

export interface CmdState {
  icon?: string;
  label?: string | (() => string);
  enabled?: () => boolean;
  checked?: () => boolean;
}

export interface Command {
  id: string;
  label: string | (() => string);
  keys?: string[];
  icon?: string;
  group: string;
  description: string;
  run: (params?: Record<string, unknown>) => unknown;
  enabled?: () => boolean;
  checked?: () => boolean;
}

const states = new Map<string, CmdState>();
const changeListeners = new Set<() => void>();

export function setCmdState(id: string, state: CmdState): void {
  states.set(id, { ...states.get(id), ...state });
}

export function setCmdStates(all: Record<string, CmdState>): void {
  for (const [id, s] of Object.entries(all)) setCmdState(id, s);
}

export function onCmdStateChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function cmdStateChanged(): void {
  for (const fn of changeListeners) fn();
}

const GLYPHS: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Shift: '⇧', Alt: '⌥', Backspace: '⌫', Delete: '⌦', Enter: '↩', Up: '↑', Down: '↓', Left: '←', Right: '→', Escape: 'Esc' };

export function formatKeys(combo: string): string {
  const parts = combo.replace(/^Ctrl\+/, 'Mod+').split('+');
  if (combo.endsWith('++')) { parts.pop(); parts[parts.length - 1] = '+'; }
  if (isMac) return parts.map((p) => GLYPHS[p] ?? p).join('');
  return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
}

function view(c: RegCommand): Command {
  const s = states.get(c.id) ?? {};
  return {
    id: c.id,
    label: s.label ?? c.label,
    keys: c.keys,
    icon: s.icon,
    group: c.group,
    description: c.description,
    run: (params) => registry.run(c.id, params ?? {}),
    enabled: s.enabled,
    checked: s.checked,
  };
}

export class Commands {
  onRun: ((cmd: Command, label: string) => void) | null = null;

  get(id: string): Command | undefined {
    const c = registry.get(id);
    return c ? view(c) : undefined;
  }

  has(id: string): boolean { return registry.has(id); }
  all(): Command[] { return registry.list().map(view); }
  label(cmd: Command): string { return typeof cmd.label === 'function' ? cmd.label() : cmd.label; }
  enabled(cmd: Command): boolean { return cmd.enabled ? cmd.enabled() : true; }
  why(_cmd: Command): string { return ''; }
  keyLabel(cmd: Command): string { const k = cmd.keys?.[0]; return k ? formatKeys(k) : ''; }

  run(id: string, params?: Record<string, unknown>): boolean {
    const cmd = this.get(id);
    if (!cmd || !this.enabled(cmd)) return false;
    const label = this.label(cmd);
    void Promise.resolve(registry.run(id, params ?? {})).catch((e: Error) => toast(e.message, 'error')).finally(cmdStateChanged);
    this.onRun?.(cmd, label);
    return true;
  }

  async call(id: string, params?: Record<string, unknown>): Promise<{ ran: boolean; result?: unknown }> {
    const cmd = this.get(id);
    if (!cmd || !this.enabled(cmd)) return { ran: false };
    const result = await registry.run(id, params ?? {});
    this.onRun?.(cmd, this.label(cmd));
    cmdStateChanged();
    return { ran: true, result };
  }
}

export const shellCommands = new Commands();
