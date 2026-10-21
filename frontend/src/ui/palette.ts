import type { Command, CommandRegistry } from '../engine/registry';
import { Dialog } from './dialog';
import { el, escapeHtml, patchList, setClass, setText } from './dom';
import { toast } from './toast';

export class CommandPalette {
  private readonly d: Dialog;
  private readonly q: HTMLInputElement;
  private readonly list: HTMLElement;
  private rows: Command[] = [];
  private index = 0;

  constructor(private readonly reg: CommandRegistry) {
    this.d = new Dialog('Find a command', 560);
    this.q = el<HTMLInputElement>('<input class="ft-input" type="search" placeholder="Type a command, such as bold, heading or outline" spellcheck="false" aria-label="Command">');
    this.list = el('<div class="ft-palette" role="listbox"></div>');
    this.d.body.append(this.q, this.list, el('<p class="ft-note ft-palette-note">Commands that take values (font, size, colour, style) are on the toolbar and in ./formtxt cli.</p>'));
    this.q.addEventListener('input', () => { this.index = 0; this.render(); });
    this.q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.index = (this.index + (e.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % Math.max(1, this.rows.length); this.render(); }
      else if (e.key === 'Enter') { e.preventDefault(); this.runAt(this.index); }
    });
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (row) this.runAt(Number(row.dataset.i));
    });
  }

  open(): void {
    this.q.value = '';
    this.index = 0;
    this.render();
    this.d.open(this.q);
  }

  private runAt(i: number): void {
    const cmd = this.rows[i];
    if (!cmd) return;
    this.d.close();
    void Promise.resolve(this.reg.run(cmd.id)).catch((e: Error) => toast(e.message, 'error'));
  }

  private render(): void {
    const words = this.q.value.toLowerCase().split(/\s+/).filter(Boolean);
    this.rows = this.reg.list().filter((c) => !(c.params ?? []).length && words.every((w) => `${c.label} ${c.group} ${c.id} ${c.description}`.toLowerCase().includes(w))).slice(0, 40);
    const items = this.rows.map((c, i) => ({ c, i }));
    patchList(this.list, items, {
      key: (x) => x.c.id,
      create: (x) => el(`<button type="button" class="ft-palette-row" role="option"><span class="ft-palette-label"></span><span class="ft-palette-group">${escapeHtml(x.c.group)}</span><span class="ft-palette-keys"></span></button>`),
      update: (n, x) => {
        n.dataset.i = String(x.i);
        setText(n.querySelector('.ft-palette-label'), x.c.label);
        setText(n.querySelector('.ft-palette-keys'), (x.c.keys ?? []).join('  '));
        setClass(n, 'is-active', x.i === this.index);
      },
    });
    for (const n of Array.from(this.list.children) as HTMLElement[]) {
      const x = items.find((it) => it.c.id === n.dataset.key);
      if (x) { n.dataset.i = String(x.i); setText(n.querySelector('.ft-palette-label'), x.c.label); setText(n.querySelector('.ft-palette-keys'), (x.c.keys ?? []).join('  ')); setClass(n, 'is-active', x.i === this.index); }
    }
    (this.list.querySelector('.is-active') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }
}
