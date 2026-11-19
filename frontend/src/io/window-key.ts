const HEADER = 'X-Formtxt-Window-Key';
const STORE = 'formtxt-window-key';

let key = '';

function remembered(): string {
  try { return sessionStorage.getItem(STORE) ?? ''; } catch { return ''; }
}

function remember(value: string): void {
  try { sessionStorage.setItem(STORE, value); } catch { return; }
}

export async function loadWindowKey(): Promise<void> {
  const holder = window as unknown as { __FORMTXT_WINDOW_KEY?: unknown };
  const given = holder.__FORMTXT_WINDOW_KEY;
  delete holder.__FORMTXT_WINDOW_KEY;
  if (typeof given === 'string' && given) { key = given; return; }
  try {
    const res = await fetch('/api/window/key', { method: 'POST' });
    const body = res.ok ? await res.json() as { key?: unknown } : {};
    if (typeof body.key === 'string' && body.key) { key = body.key; remember(key); return; }
  } catch { key = ''; }
  key = remembered();
}

export const keyHeaders = (): Record<string, string> => (key ? { [HEADER]: key } : {});

export function keyedSocket(url: string): WebSocket {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'key', key })));
  return ws;
}
