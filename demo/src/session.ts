import { commands } from '../../frontend/src/engine/registry';
import { mountLinks } from './links';

const wait = (ms: number): Promise<void> => new Promise((done) => window.setTimeout(done, ms));
const frame = (): Promise<void> => new Promise((done) => requestAnimationFrame(() => done()));

async function card(id: string): Promise<HTMLElement> {
  for (let i = 0; i < 400; i++) {
    const b = document.querySelector<HTMLElement>(`.ft-demo-card[data-cmd="demo.${id}"]`);
    if (b && document.body.classList.contains('app-ready')) return b;
    await wait(50);
  }
  throw new Error('The demo window did not start.');
}

export async function openSession(id: string): Promise<void> {
  try {
    const button = await card(id);
    mountLinks(id);
    const run = commands.run.bind(commands);
    let opened = null as Promise<unknown> | null;
    commands.run = (cmd, params) => { const out = run(cmd, params); if (cmd === `demo.${id}`) opened = out; return out; };
    try {
      button.click();
    } finally {
      commands.run = run;
    }
    if (opened) await Promise.resolve(opened).catch(() => undefined);
  } finally {
    await frame();
    await frame();
    document.documentElement.removeAttribute('data-demo');
  }
}
