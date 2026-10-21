let agent = false;
let person = false;
let running = 0;

export async function asAgent<T>(fn: () => Promise<T>): Promise<T> {
  running++;
  try { return await fn(); } finally { window.setTimeout(() => { running = Math.max(0, running - 1); }, 0); }
}

export function noteEdit(): void {
  if (running > 0) agent = true; else person = true;
}

export function takeEditor(): string {
  const by = agent && person ? 'both' : agent ? 'agent' : person ? 'person' : '';
  agent = false;
  person = false;
  return by;
}
