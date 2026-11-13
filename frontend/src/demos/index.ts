import type { DocSummary } from '../engine/model';
import type { CommandRegistry } from '../engine/registry';
import { api } from '../io/api';
import { toast } from '../ui/toast';

export type DemoId = 'review' | 'paper' | 'newsletter';

export interface DemoDef {
  id: DemoId;
  title: string;
  blurb: string;
  file: string;
  after?: string;
}

export const DEMOS: DemoDef[] = [
  { id: 'review', title: 'A report under review', blurb: 'An annual report with suggested edits by two people, a comment thread, a chart and a table.', file: 'harbour-trust-annual-report.ftxt' },
  { id: 'paper', title: 'A paper with references', blurb: 'A lab paper with contents, equations, figures, footnotes, citations and a bibliography.', file: 'tidal-flats-paper.ftxt', after: 'references.updateAll' },
  { id: 'newsletter', title: 'A two-column newsletter', blurb: 'A community newsletter in columns with Text Art, an IntelligentArt diagram, pictures and events.', file: 'riverside-newsletter.ftxt' },
];

export const demoCommand = (d: DemoDef): string => `demo.${d.id}`;
export const demoCover = (d: DemoDef): string => `${import.meta.env.BASE_URL}demos/${d.id}.webp`;

let opening = false;

export async function openDemo(id: DemoId, open: (docId: string) => Promise<unknown>): Promise<string> {
  const d = DEMOS.find((x) => x.id === id);
  if (!d) throw new Error(`No demo has the id ${id}.`);
  if (opening) { toast('A demo is already opening.'); return ''; }
  opening = true;
  toast('Opening the demo as a new document in your library...');
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demos/${d.file}`);
    if (!res.ok) throw new Error(res.statusText || String(res.status));
    const file = new File([await res.blob()], d.file, { type: 'application/x-formtxt' });
    const out = await api.upload<{ documents: DocSummary[]; errors: string[] }>('/documents/import', [file]);
    const made = out.documents[0];
    if (!made) throw new Error(out.errors.join(' ') || 'the engine made no document');
    await open(made.id);
    return made.id;
  } catch (e) {
    throw new Error(`The demo could not open: ${(e as Error).message}`);
  } finally {
    opening = false;
  }
}

export function registerDemoCommands(commands: CommandRegistry, open: (docId: string) => Promise<unknown>): void {
  for (const d of DEMOS) {
    commands.register({
      id: demoCommand(d),
      label: d.title,
      group: 'Help',
      description: `Open the demo "${d.title}" as a new document in your library. Nothing of yours is changed.`,
      run: async () => {
        const id = await openDemo(d.id, open);
        if (id && d.after && commands.has(d.after)) {
          await new Promise((r) => window.setTimeout(r, 400));
          await Promise.resolve(commands.run(d.after, {})).catch(() => undefined);
        }
        return { id, demo: d.id };
      },
    });
  }
}
