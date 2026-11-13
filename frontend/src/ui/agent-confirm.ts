import { api } from '../io/api';
import { Dialog } from './dialog';
import { el, setText } from './dom';

class AgentConfirmDialog extends Dialog {
  private readonly text = el('<p class="ft-note"></p>');
  private readonly deny: HTMLButtonElement;
  private answer: ((ok: boolean) => void) | null = null;

  constructor() {
    super('Allow outside agents?', 460);
    this.body.append(this.text);
    this.deny = this.button("Don't Allow", 'ghost', () => this.settle(false));
    this.button('Allow', 'primary', () => this.settle(true));
  }

  ask(text: string): Promise<boolean> {
    setText(this.text, text);
    this.open(this.deny);
    return new Promise((ok) => { this.answer = ok; });
  }

  close(): void { const a = this.answer; this.answer = null; super.close(); a?.(false); }

  private settle(ok: boolean): void { const a = this.answer; this.answer = null; if (a) { super.close(); a(ok); } }
}

let pending: Promise<boolean> | null = null;

export function askAgents(): Promise<boolean> {
  pending ??= (async () => {
    let client = '';
    try { client = (await api.get<{ lastClient?: string }>('/mcp/status')).lastClient ?? ''; } catch { client = ''; }
    const who = client && client !== 'unknown agent' ? client : 'An agent outside FormTxt';
    const ok = await new AgentConfirmDialog().ask(`${who} asks to run FormTxt commands on the document you have open. You see each change happen and Undo reverses it. Allow outside agents now and from now on? You can turn this off in Preferences, under Privacy.`);
    if (ok) await api.post('/settings', { agentsAllowed: true }).catch(() => undefined);
    return ok;
  })().finally(() => { pending = null; });
  return pending;
}
