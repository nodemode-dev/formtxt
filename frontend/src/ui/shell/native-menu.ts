import type { Commands } from './cmd';
import type { MenuDef, MenuItem as MenuSpec } from './types';

export const MENUS_IN_WINDOW_KEY = 'formtxt.menusInWindow';

export function menusInWindow(): boolean {
  try { return localStorage.getItem(MENUS_IN_WINDOW_KEY) === '1'; } catch { return false; }
}

export function setMenusInWindow(on: boolean): void {
  try { localStorage.setItem(MENUS_IN_WINDOW_KEY, on ? '1' : '0'); } catch { void 0; }
}

export const wantsNativeMenus = (): boolean => '__TAURI_INTERNALS__' in window && /Mac/.test(navigator.platform) && !menusInWindow();

export function accelerator(combo: string | undefined): string | null {
  if (!combo) return null;
  const parts = combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), 'Plus'] : combo.split('+');
  const names: Record<string, string> = { Mod: 'CmdOrCtrl', Ctrl: 'CmdOrCtrl', Alt: 'Alt', Shift: 'Shift', '=': '=', '-': '-', '[': '[', ']': ']', ',': ',', Delete: 'Delete', Backspace: 'Backspace', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Space: 'Space', Plus: 'Plus' };
  const out: string[] = [];
  for (const p of parts) {
    if (names[p]) out.push(names[p]);
    else if (/^[A-Za-z0-9]$/.test(p)) out.push(p.toUpperCase());
    else if (/^F([1-9]|1[0-2])$/.test(p)) out.push(p);
    else return null;
  }
  return out.join('+');
}

type Api = typeof import('@tauri-apps/api/menu');

const TEXT_EDITS: Record<string, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.selectAll': 'select-all',
};
const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image']);

export function textFieldFocused(): boolean {
  const a = document.activeElement;
  if (a instanceof HTMLTextAreaElement) return !a.readOnly && !a.disabled;
  if (a instanceof HTMLInputElement) return !NOT_TEXT.has(a.type) && !a.readOnly && !a.disabled;
  return a instanceof HTMLElement && a.isContentEditable && !a.closest('.ProseMirror');
}

function editFallback(action: string): void {
  document.execCommand(action === 'select-all' ? 'selectAll' : action);
}

interface Live { key: string; id: string; item: { setEnabled(on: boolean): Promise<void>; setChecked?(on: boolean): Promise<void> } }

export class NativeMenus {
  private items: Live[] = [];
  private building = false;
  private again = false;
  private stateTimer = 0;

  constructor(private readonly commands: Commands, private readonly menus: () => MenuDef[], private readonly appName = 'FormTxt', private readonly preferencesId = 'app.preferences') {
    for (const ev of ['pointerup', 'keyup', 'focusin', 'focusout'] as const) window.addEventListener(ev, () => { if (this.items.length) this.refresh(); }, { passive: true });
  }

  async build(): Promise<void> {
    if (this.building) { this.again = true; return; }
    this.building = true;
    try {
      const api: Api = await import('@tauri-apps/api/menu');
      const items: Live[] = [];
      const ids = new Set<string>();
      const run = (id: string, params?: Record<string, unknown>): void => {
        const edit = TEXT_EDITS[id];
        if (edit && textFieldFocused()) {
          void import('@tauri-apps/api/core').then((m) => m.invoke('text_edit', { action: edit })).catch(() => editFallback(edit));
        } else this.commands.run(id, params);
        this.refresh();
      };
      const make = async (spec: MenuSpec): Promise<unknown> => {
        if (spec === '-') return api.PredefinedMenuItem.new({ item: 'Separator' });
        if (typeof spec === 'object' && 'items' in spec) return api.Submenu.new({ text: spec.label, items: (await Promise.all(spec.items.map(make))).filter(Boolean) as never[] });
        const id = typeof spec === 'string' ? spec : spec.cmd;
        const params = typeof spec === 'string' ? undefined : spec.params;
        const cmd = this.commands.get(id);
        if (!cmd) return null;
        ids.add(id);
        const text = typeof spec === 'string' ? this.commands.label(cmd) : spec.label;
        const acc = typeof spec === 'string' ? accelerator(cmd.keys?.[0]) : null;
        const opts = { text, enabled: this.enabled(id), action: () => run(id, params) };
        let item;
        if (cmd.checked && typeof spec === 'string') {
          const copts = { ...opts, checked: !!cmd.checked() };
          try { item = await api.CheckMenuItem.new(acc ? { ...copts, accelerator: acc } : copts); } catch { item = await api.CheckMenuItem.new(copts); }
        } else {
          try { item = await api.MenuItem.new(acc ? { ...opts, accelerator: acc } : opts); } catch { item = await api.MenuItem.new(opts); }
        }
        items.push({ key: typeof spec === 'string' ? id : `${id}:${JSON.stringify(params ?? {})}`, id, item });
        return item;
      };
      const top: unknown[] = [];
      top.push(await api.Submenu.new({ text: this.appName, items: [
        await api.PredefinedMenuItem.new({ item: { About: { name: this.appName } }, text: `About ${this.appName}` }),
        await api.PredefinedMenuItem.new({ item: 'Separator' }),
        ...(this.commands.get(this.preferencesId) ? [await this.preferences(api, run)] : []),
        await api.PredefinedMenuItem.new({ item: 'Separator' }),
        await api.PredefinedMenuItem.new({ item: 'Hide' }),
        await api.PredefinedMenuItem.new({ item: 'Quit' }),
      ] as never[] }));
      for (const def of this.menus()) {
        const list = typeof def.items === 'function' ? def.items() : def.items;
        const made = (await Promise.all(list.map(make))).filter(Boolean) as unknown[];
        if (def.label.toLowerCase() === 'edit' && !Object.keys(TEXT_EDITS).some((k) => k.match(/cut|copy|paste|selectAll/) && ids.has(k))) {
          made.push(
            await api.PredefinedMenuItem.new({ item: 'Separator' }),
            await api.PredefinedMenuItem.new({ item: 'Cut' }),
            await api.PredefinedMenuItem.new({ item: 'Copy' }),
            await api.PredefinedMenuItem.new({ item: 'Paste' }),
            await api.PredefinedMenuItem.new({ item: 'SelectAll' }),
          );
        }
        top.push(await api.Submenu.new({ text: def.label, items: made as never[] }));
      }
      const menu = await api.Menu.new({ items: top as never[] });
      await menu.setAsAppMenu();
      this.items = items;
      document.documentElement.classList.add('has-native-menus');
    } finally {
      this.building = false;
      if (this.again) { this.again = false; void this.build(); }
    }
  }

  private async preferences(api: Api, run: (id: string) => void): Promise<unknown> {
    const id = this.preferencesId;
    const cmd = this.commands.get(id);
    const text = cmd ? this.commands.label(cmd).replace(/\.\.\.$/, '') + '...' : 'Preferences...';
    const opts = { text, enabled: true, action: () => run(id) };
    try { return await api.MenuItem.new({ ...opts, accelerator: 'CmdOrCtrl+,' }); } catch { return api.MenuItem.new(opts); }
  }

  private enabled(id: string): boolean {
    if (TEXT_EDITS[id] && textFieldFocused()) return true;
    const cmd = this.commands.get(id);
    return !!cmd && this.commands.enabled(cmd);
  }

  refresh(): void {
    if (this.stateTimer) return;
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = 0;
      for (const { key, id, item } of this.items) {
        const cmd = this.commands.get(id);
        if (!cmd) continue;
        void item.setEnabled(this.enabled(id)).catch(() => undefined);
        if (cmd.checked && item.setChecked && !key.includes(':')) void item.setChecked(!!cmd.checked()).catch(() => undefined);
      }
    }, 150);
  }
}
