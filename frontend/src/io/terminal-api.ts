import { api, EngineError } from './api';

export interface TerminalInfo { id: string; title: string; cwd?: string; alive: boolean; kind: 'shell' | 'claude' | 'agent' }
export interface ClaudeCodeStatus { installed: boolean; version: string | null; install: string; signedIn: boolean | null }
export interface ClaudeOpen { prompt?: string; resume?: string; cols?: number; rows?: number; fresh?: boolean }
export type AgentMode = 'ask' | 'auto-edits' | 'plan';
export interface ClaudeStatus { installed: boolean; path: string | null; version: string | null; signedIn: boolean | null; install: string; running: boolean; state: string; mode: AgentMode; session: string | null; modes: AgentMode[] }
export type AgentEvent =
  | { type: 'state'; running: boolean; state: string; mode: AgentMode; session: string | null }
  | { type: 'user'; text: string }
  | { type: 'block'; id: string; kind: 'text' | 'thinking' }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; id: string; name: string; summary: string }
  | { type: 'tool_result'; id: string; text: string; error: boolean }
  | { type: 'permission'; id: string; tool: string; summary: string }
  | { type: 'permission_done'; id: string; allowed: boolean }
  | { type: 'result'; ok: boolean; text: string; costUsd: number | null }
  | { type: 'notice'; text: string };

export function socketTo(path: string): WebSocket {
  return new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api${path}`);
}

export const term = {
  async terminals(): Promise<TerminalInfo[]> {
    return (await api.get<{ terminals: TerminalInfo[] }>('/terminal')).terminals;
  },
  openTerminal: (cols: number, rows: number): Promise<TerminalInfo> => api.post<TerminalInfo>('/terminal', { cols, rows }),
  async restartTerminal(id: string): Promise<void> { await api.post(`/terminal/${encodeURIComponent(id)}/restart`); },
  async closeTerminal(id: string): Promise<void> { await api.del(`/terminal/${encodeURIComponent(id)}`); },
  async openClaude(opts: ClaudeOpen): Promise<TerminalInfo> {
    const info = await api.post<Partial<TerminalInfo> | null>('/terminal/claude', opts);
    if (!info || typeof info.id !== 'string' || info.id === '') throw new EngineError('Claude Code did not start.', 502);
    return info as TerminalInfo;
  },
  async claudeCodeStatus(): Promise<ClaudeCodeStatus | null> {
    let now: Partial<ClaudeCodeStatus> | null = null;
    try { now = await api.get<Partial<ClaudeCodeStatus>>('/claude-code/status'); } catch { now = null; }
    if (now?.installed === true) return { installed: true, version: now.version ?? null, install: '', signedIn: now.signedIn ?? null };
    const old = await term.claudeStatus();
    if (!now && !old) return null;
    return { installed: now ? false : old?.installed === true, version: now?.version ?? old?.version ?? null, install: now?.install || old?.install || '', signedIn: now?.signedIn ?? old?.signedIn ?? null };
  },
  async claudeStatus(fresh = false): Promise<ClaudeStatus | null> {
    try { return await api.get<ClaudeStatus>(`/agent/claude/status${fresh ? '?fresh=true' : ''}`); } catch { return null; }
  },
  async claudeStart(mode: AgentMode, fresh = false): Promise<void> { await api.post('/agent/claude/start', { mode, fresh }); },
  async claudeSend(text: string): Promise<void> { await api.post('/agent/claude/send', { text }); },
  async claudeStop(): Promise<void> { await api.post('/agent/claude/stop'); },
  async claudeAllow(id: string, allow: boolean): Promise<void> { await api.post('/agent/claude/permission', { id, allow }); },
};
