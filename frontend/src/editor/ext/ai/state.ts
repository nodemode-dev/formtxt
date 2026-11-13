import { api } from '../../../io/api';

export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  defaultBaseUrl: string;
  keySet: boolean;
  needsKey: boolean;
  imageModel: string;
  imageBaseUrl: string;
  imageKeySet: boolean;
  imageAvailable: boolean;
  effort: string;
  efforts: string[];
  models: string[];
  providers: string[];
}

export interface SourceRef { id: string; title: string; kind: 'library' | 'file'; text?: string }
export interface CitedSource { id: string; title: string; kind: string; n: number; cited: boolean }
export interface Reply { text: string; model: string; sources: CitedSource[]; usage?: { input?: number; output?: number } }

export interface AskBody {
  task: string;
  instruction?: string;
  text?: string;
  mode?: string;
  language?: string;
  selection?: boolean;
  sources?: SourceRef[];
  history?: Array<{ role: string; content: string }>;
  model?: string;
  effort?: string;
}

let status: AIStatus | null = null;
const listeners = new Set<(s: AIStatus) => void>();

export function cached(): AIStatus | null { return status; }
export function isOn(): boolean { return !!status?.enabled; }

export function onStatus(fn: (s: AIStatus) => void): void {
  listeners.add(fn);
  if (status) fn(status);
}

function publish(s: AIStatus): AIStatus {
  status = s;
  for (const fn of listeners) fn(s);
  return s;
}

export async function loadStatus(): Promise<AIStatus> {
  return publish(await api.get<AIStatus>('/ai/status'));
}

export async function saveSettings(patch: Record<string, unknown>): Promise<AIStatus> {
  return publish(await api.post<AIStatus>('/ai/settings', patch));
}

export async function requireOn(): Promise<AIStatus> {
  const s = status ?? (await loadStatus());
  if (!s.enabled) throw new Error('AI is turned off. Turn it on in AI settings first.');
  if (s.needsKey) throw new Error('Add your API key in AI settings first.');
  return s;
}

export async function ask(body: AskBody): Promise<Reply> {
  const s = await requireOn();
  const library = (body.sources ?? []).filter((x) => x.kind === 'library').map((x) => x.id).slice(0, 12);
  const files = (body.sources ?? []).filter((x) => x.kind === 'file').map((x) => ({ title: x.title, text: x.text ?? '' })).slice(0, 8);
  return api.post<Reply>('/ai/complete', {
    task: body.task, instruction: (body.instruction ?? '').slice(0, 20000), text: (body.text ?? '').slice(0, 400000), mode: body.mode ?? '', language: body.language ?? '',
    selection: !!body.selection, history: (body.history ?? []).slice(-24), model: body.model ?? s.model, effort: body.effort ?? s.effort, sources: library, files,
  });
}
