import { api } from '../../../io/api';

export interface VersionRow { id: string; ts: number; name: string; auto: boolean; author: string; words: number; bytes: number; reason: string }
export interface ActivityRow { ts: number; until: number; who: string; kind: string; count: number; detail: string }
export interface VersionDetail { version: VersionRow; title: string; outline: Array<{ style: string; text: string }>; diff: { wordsThen: number; wordsNow: number; added: number; removed: number; changes: Array<{ added: string; removed: string }> } }
export interface Sheet { rows: string[][]; sheets: string[] }

const e = encodeURIComponent;

export const vx = {
  list: async (id: string) => (await api.get<{ versions: VersionRow[] }>(`/versions/${e(id)}`)).versions,
  opened: (id: string) => api.post<{ snapshot: boolean }>(`/versions/${e(id)}/open`),
  name: (id: string, name: string) => api.post<VersionRow>(`/versions/${e(id)}/name`, { name }),
  detail: (id: string, vid: string) => api.get<VersionDetail>(`/versions/${e(id)}/v/${e(vid)}`),
  rename: (id: string, vid: string, name: string) => api.post<VersionRow>(`/versions/${e(id)}/v/${e(vid)}/name`, { name }),
  remove: (id: string, vid: string) => api.del<{ ok: boolean }>(`/versions/${e(id)}/v/${e(vid)}`),
  restore: (id: string, vid: string) => api.post<{ ok: boolean }>(`/versions/${e(id)}/v/${e(vid)}/restore`),
  activity: async (id: string) => (await api.get<{ events: ActivityRow[] }>(`/versions/${e(id)}/activity`)).events,
  status: (id: string) => api.get<{ protected: boolean; unlocked: boolean }>(`/versions/${e(id)}/status`),
  unlock: (id: string, password: string) => api.post<{ ok: boolean }>(`/versions/${e(id)}/unlock`, { password }),
  setPassword: (id: string, password: string, current: string) => api.post<{ ok: boolean }>(`/versions/${e(id)}/password`, { password, current }),
  removePassword: (id: string, password: string) => api.post<{ ok: boolean }>(`/versions/${e(id)}/password/remove`, { password }),
  cloud: () => api.get<{ folder: string }>('/versions/cloud'),
  setCloud: (folder: string) => api.post<{ folder: string }>('/versions/cloud', { folder }),
  sign: (id: string) => api.post<{ ok: boolean; path: string; message: string }>(`/versions/${e(id)}/sign`),
  envelope: (body: Record<string, unknown>) => api.post<{ id: string; title: string }>('/versions/envelope', body),
  labels: (body: Record<string, unknown>) => api.post<{ id: string; title: string }>('/versions/labels', body),
  merge: (body: Record<string, unknown>) => api.post<{ id: string; title: string }>('/versions/merge', body),
};

export async function parseData(file: File, sheet = ''): Promise<Sheet> {
  const form = new FormData();
  form.append('files', file, file.name);
  form.append('sheet', sheet);
  const res = await fetch('/api/data/parse', { method: 'POST', body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { void 0; }
    throw new Error(String(detail));
  }
  return (await res.json()) as Sheet;
}
