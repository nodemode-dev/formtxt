import type { CommandRegistry } from '../engine/registry';
import { api } from '../io/api';
import { Dialog } from './dialog';
import { el, escapeHtml, setText } from './dom';
import { toast } from './toast';

export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return '';
  parts.push(k === ' ' ? 'Space' : k);
  return parts.join('+');
}

const NATIVE_KEYS = new Set(['edit.cut', 'edit.copy', 'edit.paste', 'edit.selectAll']);
const DECLARED = /^((Ctrl|Mod|Alt|Shift|Meta)\+)*([A-Za-z0-9]|F\d{1,2}|Enter|Escape|[.,/=\\-])$/;

function normalizeDeclared(raw: string): string {
  if (!DECLARED.test(raw)) return '';
  const parts = raw.replace(/^(.*)\+\+$/, '$1+Plus').split('+');
  const key = parts.pop() as string;
  const mods = new Set(parts.map((m) => (m === 'Ctrl' || m === 'Meta' ? 'Mod' : m)));
  const out = ['Mod', 'Alt', 'Shift'].filter((m) => mods.has(m));
  out.push(key.length === 1 ? key.toUpperCase() : key);
  return out.join('+');
}

function codeCombo(e: KeyboardEvent): string {
  const m = /^(?:Digit|Key)(.)$/.exec(e.code);
  if (!m) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(m[1].toUpperCase());
  return parts.join('+');
}

export class Shortcuts {
  private custom: Record<string, string[]> = {};
  private readonly globals: Record<string, string> = {};

  private declaredMatch(e: KeyboardEvent): string | undefined {
    if (e.defaultPrevented || e.isComposing) return undefined;
    const combo = comboOf(e);
    if (!combo) return undefined;
    const alt = codeCombo(e);
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select') && !/^F\d/.test(combo.replace(/^(Mod\+|Alt\+|Shift\+)+/, ''))) return undefined;
    if (document.querySelector('.ft-scrim:not([hidden]), .ft-dialog-scrim:not([hidden])')) return undefined;
    for (const c of this.reg.list()) {
      if (NATIVE_KEYS.has(c.id) || this.custom[c.id]?.length || (c.params ?? []).length) continue;
      for (const raw of c.keys ?? []) {
        const n = normalizeDeclared(raw);
        if (n && (n.includes('+') || /^F\d/.test(n)) && (n === combo || n === alt)) return c.id;
      }
    }
    return undefined;
  }

  constructor(private readonly reg: CommandRegistry) {
    document.addEventListener('keydown', (e) => {
      const id = this.declaredMatch(e);
      if (!id) return;
      e.preventDefault();
      void Promise.resolve(this.reg.run(id)).catch((err: Error) => toast(err.message, 'error'));
    });
    document.addEventListener('keydown', (e) => {
      const combo = comboOf(e);
      if (!combo || document.querySelector('.ft-scrim:not([hidden]) .is-recording')) return;
      const id = Object.keys(this.custom).find((cid) => this.custom[cid].includes(combo)) ?? this.globals[combo];
      if (!id || !this.reg.has(id)) return;
      e.preventDefault();
      e.stopPropagation();
      void Promise.resolve(this.reg.run(id)).catch((err: Error) => toast(err.message, 'error'));
    }, true);
  }

  bindGlobal(combo: string, id: string): void { this.globals[combo] = id; }

  async load(): Promise<void> {
    const s = await api.get<Record<string, unknown>>('/settings').catch(() => ({} as Record<string, unknown>));
    const keys = s.keys;
    this.custom = keys && typeof keys === 'object' ? (keys as Record<string, string[]>) : {};
  }

  private save(): void {
    void api.post('/settings', { keys: this.custom }).catch((e: Error) => toast(`Could not save shortcuts: ${e.message}`, 'error'));
  }

  keysFor(id: string, defaults: string[] = []): string[] {
    return this.custom[id]?.length ? this.custom[id] : defaults;
  }

  open(): void {
    const d = new Dialog('Keyboard shortcuts', 640);
    d.body.appendChild(el('<p class="ft-note">Click Change, then press the new keys. A custom shortcut takes priority over any built-in one that uses the same keys. Mod is Ctrl on Windows and Linux and Cmd on a Mac.</p>'));
    const table = el('<div class="ft-keys"></div>');
    const commands = this.reg.list().filter((c) => !(c.params ?? []).length).sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    for (const c of commands) {
      const row = el(`<div class="ft-keys-row"><span class="ft-keys-group">${escapeHtml(c.group)}</span><span class="ft-keys-label">${escapeHtml(c.label)}</span><span class="ft-keys-combo"></span><button type="button" class="ft-btn sm" data-k="change">Change</button><button type="button" class="ft-btn sm ghost" data-k="reset">Reset</button></div>`);
      const combo = row.querySelector('.ft-keys-combo') as HTMLElement;
      const paint = (): void => setText(combo, this.keysFor(c.id, c.keys ?? []).join('  ') || 'None');
      paint();
      row.addEventListener('click', (e) => {
        const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k;
        if (k === 'reset') { delete this.custom[c.id]; this.save(); paint(); }
        if (k === 'change') {
          const btn = row.querySelector('[data-k="change"]') as HTMLElement;
          btn.classList.add('is-recording');
          setText(btn, 'Press keys');
          const once = (ev: KeyboardEvent): void => {
            const kc = comboOf(ev);
            if (!kc) return;
            ev.preventDefault();
            ev.stopPropagation();
            document.removeEventListener('keydown', once, true);
            btn.classList.remove('is-recording');
            setText(btn, 'Change');
            if (kc === 'Escape') return;
            for (const id of Object.keys(this.custom)) this.custom[id] = this.custom[id].filter((x) => x !== kc);
            this.custom[c.id] = [kc];
            this.save();
            paint();
          };
          document.addEventListener('keydown', once, true);
        }
      });
      table.appendChild(row);
    }
    d.body.appendChild(table);
    d.button('Done', 'primary', () => d.close());
    d.open();
  }
}
