import type { DockAdapter, DockAgentStatus, DockTerminal } from './dock/adapter';
import { api, EngineError } from './io/api';
import { socketTo, term } from './io/terminal-api';
import { keyHeaders } from './io/window-key';
import { isMac } from './ui/dom';

const LEAD = "Ask Claude about your document in the line below: draft a section, rewrite a paragraph, apply styles, add a table, check the spelling. It works through FormTxt's commands, every change shows here and in the window, and each one can be undone.";

export function formtxtDock(): DockAdapter {
  return {
    app: { name: 'FormTxt', noun: 'document', start: './formtxt', examples: 'draft a section, rewrite a paragraph, apply styles, add a table, check the spelling' },
    storage: { key: 'formtxt.dock', legacy: ['formtxt.terminal'] },
    sizes: { minHeight: 120, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 320, maxWidthShare: 0.6, defaultWidth: 440 },
    shortcut: { code: 'KeyJ', label: `${isMac ? 'Cmd' : 'Ctrl'}+J` },
    tabs: ['chat', 'shell', 'claude', 'codex', 'cursor'],
    classes: { iconButton: 'ft-tt-btn', button: 'ft-btn sm', primaryButton: 'ft-btn sm cta', input: 'ft-input', select: 'ft-input', note: 'ft-note' },
    mount: (dock) => {
      const app = document.getElementById('app');
      const status = app?.querySelector(':scope > .ft-status');
      if (app && status) app.insertBefore(dock, status);
    },
    t: (key, english) => (key === 'lead' ? LEAD : english),
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders,
    errors: {
      message: (err) => (err instanceof EngineError ? err.message : null),
      missingRoute: (err) => err instanceof EngineError && (err.status === 404 || err.status === 405) && /^(Not Found|Method Not Allowed)$/i.test(err.message),
    },
    terminal: {
      list: async () => (await term.terminals()) as DockTerminal[],
      open: async (kind, o) => {
        if (kind === 'shell') return (await term.openTerminal(o.cols, o.rows)) as DockTerminal;
        if (kind === 'claude') return (await term.openClaude({ prompt: o.prompt, resume: o.resume, cols: o.cols, rows: o.rows })) as DockTerminal;
        return api.post<DockTerminal>('/terminal/agent', { kind, cols: o.cols, rows: o.rows });
      },
      restart: (id) => term.restartTerminal(id),
      close: (id) => term.closeTerminal(id),
      socket: (id) => socketTo(`/terminal/${encodeURIComponent(id)}/stream`),
    },
    agentStatus: async () => {
      const claude = await term.claudeCodeStatus();
      let others: DockAgentStatus = {};
      try { others = (await api.get<{ agents?: DockAgentStatus }>('/claude-code/status')).agents ?? {}; } catch { others = {}; }
      return claude || others.codex || others.cursor ? { ...others, ...(claude ? { claude } : {}) } : null;
    },
    chat: {
      status: () => term.claudeStatus(),
      start: (mode, fresh) => term.claudeStart(mode, fresh),
      send: (text) => term.claudeSend(text),
      stop: () => term.claudeStop(),
      answer: (id, allow) => term.claudeAllow(id, allow),
      socket: () => socketTo('/agent/claude/stream'),
    },
  };
}
