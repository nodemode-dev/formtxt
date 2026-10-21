import type { CommandRegistry } from '../engine/registry';
import { asAgent } from './actor';

function safe(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function connectBridge(reg: CommandRegistry): void {
  let delay = 500;
  const open = (): void => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/live`);
    ws.onopen = () => { delay = 500; };
    ws.onmessage = async (ev) => {
      let msg: { t?: string; id?: string; command?: string; params?: Record<string, unknown> };
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.t !== 'run' || !msg.id || !msg.command) return;
      try {
        const result = await asAgent(async () => reg.run(msg.command!, msg.params ?? {}));
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, result: safe(result) }));
      } catch (e) {
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: (e as Error).message }));
      }
    };
    ws.onclose = () => { window.setTimeout(open, delay); delay = Math.min(delay * 2, 10000); };
  };
  open();
}
