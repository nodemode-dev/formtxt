import type { ConsentChoice, ConsentRequest, DockAdapter, DockAgentStatus, DockChannel, DockChatEvent, DockTerminal, StoredChoice, StoredChoiceState } from './dock/adapter';
import { jsonLegacy } from './dock/state';
import { api, EngineError } from './io/api';
import { socketTo, term } from './io/terminal-api';
import { keyHeaders } from './io/window-key';
import { isMac } from './ui/dom';

const LEAD = "Ask Claude about your document in the line below: draft a section, rewrite a paragraph, apply styles, add a table, check the spelling. It works through FormTxt's commands, every change shows here and in the window, and each one can be undone.";
const ALWAYS_NOTE = 'An allowed agent runs FormTxt commands on the document you have open. You see each change happen and Undo reverses it. It can also run a report, which saves a file on this computer where the agent asks. You can change this in Preferences, under Privacy.';
const CHOICES: ConsentChoice[] = ['deny', 'once', 'always'];

type Reply = (result: Record<string, boolean>) => void;
interface Asked { agent?: unknown; what?: unknown; answers?: unknown; always?: unknown; expiresAt?: unknown }
interface Settings { agentsAllowed?: boolean; agentsBlocked?: boolean; sealBroken?: boolean }
const adders: Array<(request: ConsentRequest) => void> = [];
const withdrawers: Array<(id: string) => void> = [];
const waiting = new Map<string, { request: ConsentRequest; reply: Reply }>();

export const outsideAgents = {
  arrive(id: string, asked: Asked, reply: Reply): void {
    const held = waiting.get(id);
    if (held) { held.reply = reply; return; }
    const offers = Array.isArray(asked.answers) ? CHOICES.filter((c) => (asked.answers as unknown[]).includes(c)) : CHOICES;
    const request: ConsentRequest = {
      id, agent: typeof asked.agent === 'string' ? asked.agent : '', what: typeof asked.what === 'string' && asked.what ? asked.what : 'run FormTxt commands',
      offers: offers.length ? offers : CHOICES, always: asked.always === 'agent' ? 'agent' : 'all', escape: 'deny', notes: [ALWAYS_NOTE],
      ...(typeof asked.expiresAt === 'number' ? { expires: Math.round(asked.expiresAt * 1000) } : {}),
    };
    waiting.set(id, { request, reply });
    for (const add of adders) add(request);
  },
  gone(id: string): void {
    if (waiting.delete(id)) for (const withdraw of withdrawers) withdraw(id);
  },
  lost(): void {
    for (const id of [...waiting.keys()]) outsideAgents.gone(id);
  },
  subscribe(add: (request: ConsentRequest) => void, withdraw: (id: string) => void): void {
    adders.push(add);
    withdrawers.push(withdraw);
    for (const held of waiting.values()) add(held.request);
  },
  async answer(id: string, choice: ConsentChoice): Promise<void> {
    const held = waiting.get(id);
    waiting.delete(id);
    held?.reply(choice === 'deny' ? { allowed: false } : choice === 'once' ? { allowed: true, once: true } : { allowed: true });
  },
  async get(): Promise<StoredChoiceState> {
    const s = await api.get<Settings>('/settings');
    return { value: s.agentsBlocked === true ? 'blocked' : s.agentsAllowed === true ? 'allowed' : 'ask', changedOutside: s.sealBroken === true };
  },
  async set(value: StoredChoice): Promise<void> {
    await api.post('/settings', { agentsAllowed: value === 'allowed', agentsBlocked: value === 'blocked' });
  },
};

const isDockChord = (e: KeyboardEvent): boolean => (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === 'KeyJ';
const passKey = (e: KeyboardEvent): boolean => (e.metaKey || e.ctrlKey) && !e.altKey && ((!e.shiftKey && e.key === ',') || (e.shiftKey && e.code === 'KeyP'));

function socketChannel(socket: WebSocket): DockChannel {
  let data = (_chunk: string | Uint8Array): void => undefined;
  let exit = (): void => undefined;
  let closed = (): void => undefined;
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (msg) => {
    if (typeof msg.data === 'string') { data(msg.data); return; }
    try { if ((JSON.parse(new TextDecoder().decode(msg.data as ArrayBuffer)) as { type?: string }).type === 'exit') exit(); } catch { return; }
  });
  socket.addEventListener('close', () => closed());
  const send = (text: string): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
    else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', () => socket.send(text), { once: true });
  };
  return {
    send: (chunk) => send(JSON.stringify({ type: 'input', data: chunk })),
    resize: (cols, rows) => send(JSON.stringify({ type: 'resize', cols, rows })),
    onData: (handler) => { data = handler; },
    onExit: (handler) => { exit = handler; },
    onClose: (handler) => { closed = handler; },
    close: () => socket.close(),
  };
}

export function formtxtDock(openSettings: () => void): DockAdapter {
  return {
    words: { app: 'FormTxt', noun: 'document', lead: LEAD, example: 'rewrite this paragraph in plain words', start: './formtxt' },
    strings: { consentChanged: 'The Allow outside agents setting was changed outside {app}, so {app} asks again.' },
    placement: {
      mode: 'own',
      storage: { key: 'formtxt.dock', legacy: jsonLegacy(['formtxt.terminal'], true) },
      sizes: { minHeight: 120, maxHeightShare: 0.7, defaultHeight: 280, minWidth: 320, maxWidthShare: 0.6, defaultWidth: 440 },
    },
    isDockChord,
    chordLabel: () => `${isMac ? 'Cmd' : 'Ctrl'}+J`,
    passKey,
    tabs: () => ({ builtin: ['chat', 'shell', 'claude', 'codex', 'cursor'] }),
    classes: { iconButton: 'ft-tt-btn', button: 'ft-btn sm', primaryButton: 'ft-btn sm cta', input: 'ft-input', select: 'ft-input', note: 'ft-note' },
    t: (_key, english) => english,
    onTheme: (handler) => { document.addEventListener('nm:ui-settings-changed', handler); },
    keyHeaders,
    errors: {
      message: (err) => (err instanceof EngineError ? err.message : null),
      kind: (err) => {
        if (err instanceof TypeError) return 'unreachable';
        if (!(err instanceof EngineError)) return null;
        if (err.status === 403) return 'refused';
        if ((err.status === 404 || err.status === 405) && /^(Not Found|Method Not Allowed)$/i.test(err.message)) return 'oldEngine';
        if (/not installed/i.test(err.message)) return 'notInstalled';
        if (err.status === 409) return 'busy';
        return err.status === 502 || err.status === 503 || err.status === 504 ? 'unreachable' : null;
      },
    },
    terminal: {
      list: async () => (await term.terminals()) as DockTerminal[],
      open: async (kind, o) => {
        if (kind === 'shell') return (await term.openTerminal(o.cols, o.rows)) as DockTerminal;
        if (kind === 'claude') return (await term.openClaude({ ...(o.prompt ? { prompt: o.prompt } : {}), ...(o.resume ? { resume: o.resume } : {}), cols: o.cols, rows: o.rows })) as DockTerminal;
        return api.post<DockTerminal>('/terminal/agent', { kind, cols: o.cols, rows: o.rows });
      },
      restart: (id) => term.restartTerminal(id),
      close: (id) => term.closeTerminal(id),
      channel: (id) => socketChannel(socketTo(`/terminal/${encodeURIComponent(id)}/stream`)),
    },
    agentStatus: async () => {
      try { return await api.get<DockAgentStatus>('/agents/status'); } catch (err) {
        if (!(err instanceof EngineError) || err.status !== 404) return null;
        const old = await term.claudeCodeStatus();
        return old ? { claude: old } : null;
      }
    },
    chat: {
      status: () => term.claudeStatus(),
      start: (mode, fresh) => term.claudeStart(mode ?? 'ask', fresh),
      send: (text) => term.claudeSend(text),
      stop: () => term.claudeStop(),
      answer: (id, allow) => term.claudeAllow(id, allow),
      modes: ['ask', 'auto-edits', 'plan'],
      subscribe: (handlers) => {
        const socket = socketTo('/agent/claude/stream');
        socket.addEventListener('open', () => handlers.open());
        socket.addEventListener('message', (msg) => { try { handlers.event(JSON.parse(String(msg.data)) as DockChatEvent); } catch { return; } });
        socket.addEventListener('close', () => handlers.close());
        return () => socket.close();
      },
    },
    consent: { subscribe: (add, withdraw) => outsideAgents.subscribe(add, withdraw), answer: (id, choice) => outsideAgents.answer(id, choice) },
    storedChoice: { get: () => outsideAgents.get(), set: (value) => outsideAgents.set(value) },
    openSettings,
  };
}
