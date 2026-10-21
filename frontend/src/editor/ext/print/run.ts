import type { Section } from '../../../engine/model';

export interface PrintJob {
  pages: HTMLElement[];
  flow: Section | null;
}

let active: HTMLElement | null = null;

export function printing(): boolean {
  return active !== null;
}

export function cleanupPrint(): void {
  active?.remove();
  active = null;
  document.documentElement.classList.remove('ft-printing');
}

function pageRules(job: PrintJob): { css: string; names: string[] } {
  if (job.flow) {
    const s = job.flow;
    const m = s.margins;
    return { css: `@page { size: ${s.page.width}pt ${s.page.height}pt; margin: ${m.top}pt ${m.right}pt ${m.bottom}pt ${m.left}pt; }`, names: [] };
  }
  const sizes = new Map<string, string>();
  const names: string[] = [];
  for (const p of job.pages) {
    const key = `${parseFloat(p.style.width).toFixed(1)}x${parseFloat(p.style.height).toFixed(1)}`;
    let name = sizes.get(key);
    if (!name) { name = `ps${sizes.size}`; sizes.set(key, name); }
    names.push(name);
  }
  const rules = Array.from(sizes).map(([key, name]) => { const [w, h] = key.split('x'); return `@page ${name} { size: ${w}px ${h}px; margin: 0; }`; });
  const first = job.pages[0];
  rules.unshift(`@page { size: ${first ? `${parseFloat(first.style.width)}px ${parseFloat(first.style.height)}px` : 'auto'}; margin: 0; }`);
  return { css: rules.join('\n'), names };
}

export function mountPrintRoot(job: PrintJob, auto = false): HTMLElement {
  cleanupPrint();
  const root = document.createElement('div');
  root.className = 'ft-print-root';
  if (auto) root.dataset.auto = '1';
  const style = document.createElement('style');
  const rules = pageRules(job);
  style.textContent = rules.css;
  root.appendChild(style);
  job.pages.forEach((p, i) => {
    if (rules.names[i]) p.style.setProperty('page', rules.names[i]);
    root.appendChild(p);
  });
  document.body.appendChild(root);
  document.documentElement.classList.add('ft-printing');
  active = root;
  return root;
}

async function settle(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(images.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  try { await document.fonts.ready; } catch { void 0; }
}

export async function runPrint(job: PrintJob): Promise<void> {
  const root = mountPrintRoot(job);
  await settle(root);
  await new Promise<void>((resolve) => {
    const done = (): void => { window.removeEventListener('afterprint', done); window.clearTimeout(timer); resolve(); };
    const timer = window.setTimeout(done, 120000);
    window.addEventListener('afterprint', done);
    window.print();
  });
  cleanupPrint();
}
