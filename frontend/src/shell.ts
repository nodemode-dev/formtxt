import { NodeSelection } from 'prosemirror-state';
import { isInTable } from 'prosemirror-tables';
import type { DocEditor } from './editor/editor';
import { cmdStateChanged, onCmdStateChange, setCmdState, shellCommands } from './ui/shell/cmd';
import { TitleBar } from './ui/shell/titlebar';
import { StatusBar } from './ui/shell/status';
import { CaptionButtons } from './ui/shell/caption-buttons';
import { NativeMenus, wantsNativeMenus } from './ui/shell/native-menu';
import { MenuBar } from './ui/shell/menu';
import { Ribbon } from './ui/shell/ribbon';
import { Qat } from './ui/shell/qat';
import { KeyTips } from './ui/shell/key-tips';
import { wordTabs } from './ui/shell/word-tabs';
import { wordMenus } from './ui/shell/word-menus';
import { applyCommandIcons } from './ui/shell/word-icons';
import { wordSlots } from './ui/shell/word-slots';
import { commands } from './engine/registry';

export interface ShellDeps {
  root: HTMLElement;
  editor: DocEditor;
  recent: () => Array<{ id: string; title: string }>;
  onFile: () => void;
}

export interface Shell {
  titlebar: TitleBar;
  status: StatusBar;
  ribbon: Ribbon;
  ribbonHost: HTMLElement;
  rebuildMenus: () => void;
  syncDocument: () => void;
}

const ACTS: Record<string, string> = { paste: 'edit.paste', cut: 'edit.cut', copy: 'edit.copy', 'select-all': 'edit.selectAll' };

function registerClipboard(ed: DocEditor): void {
  const focusDoc = (): void => { if (ed.view && !ed.view.hasFocus()) ed.view.focus(); };
  commands.register({ id: 'edit.cut', label: 'Cut', group: 'Edit', description: 'Cut the selection to the clipboard.', keys: ['Ctrl+X'], run: () => { focusDoc(); return document.execCommand('cut'); } });
  commands.register({ id: 'edit.copy', label: 'Copy', group: 'Edit', description: 'Copy the selection to the clipboard.', keys: ['Ctrl+C'], run: () => { focusDoc(); return document.execCommand('copy'); } });
  commands.register({
    id: 'edit.paste', label: 'Paste', group: 'Edit', description: 'Paste from the clipboard at the cursor, keeping formatting.', keys: ['Ctrl+V'],
    run: async () => {
      focusDoc();
      const view = ed.view;
      if (!view) return false;
      const data = new DataTransfer();
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) for (const type of item.types) if (type === 'text/html' || type === 'text/plain') data.setData(type, await (await item.getType(type)).text());
      } catch {
        try { data.setData('text/plain', await navigator.clipboard.readText()); } catch { throw new Error('The browser did not allow reading the clipboard here. Press Ctrl+V to paste.'); }
      }
      view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    },
  });
  commands.register({ id: 'edit.pastePlain', label: 'Paste as plain text', group: 'Edit', description: 'Paste the clipboard text without its formatting (Keep Text Only).', keys: ['Ctrl+Shift+V'], run: async () => { focusDoc(); const text = await navigator.clipboard.readText(); const view = ed.view; if (!view) return false; view.dispatch(view.state.tr.insertText(text)); return true; } });
  commands.register({ id: 'edit.selectAll', label: 'Select all', group: 'Edit', description: 'Select the whole document.', keys: ['Ctrl+A'], run: () => { focusDoc(); return document.execCommand('selectAll'); } });
}

const tb = (ed: DocEditor): HTMLElement | null => ed.root.querySelector('.ft-toolbar');

function contexts(ed: DocEditor): string[] {
  const out: string[] = [];
  const view = ed.view;
  if (!view) return out;
  const { state } = view;
  const sel = state.selection;
  if (isInTable(state)) out.push('table');
  if (sel instanceof NodeSelection) {
    const n = sel.node.type.name;
    if (n === 'image') out.push('picture');
    else if (n === 'shape') out.push('shape');
    else if (n === 'chart') out.push('chart');
    else if (n === 'diagram' || n === 'mermaid') out.push('diagram');
    else if (n === 'math') out.push('equation');
  }
  const active = document.activeElement as HTMLElement | null;
  if (active?.closest('.ft-sheet-header, .ft-sheet-footer')) out.push('headerFooter');
  return out;
}

function currentPage(ed: DocEditor): number {
  const view = ed.view;
  if (!view) return 1;
  let top = 0;
  try { top = view.coordsAtPos(view.state.selection.head).top; } catch { return 1; }
  const sheets = Array.from(ed.root.querySelectorAll<HTMLElement>('.ft-sheet'));
  let page = 1;
  for (let i = 0; i < sheets.length; i++) if (sheets[i].getBoundingClientRect().top <= top) page = i + 1;
  return page;
}

export function mountShell(d: ShellDeps): Shell {
  const { root, editor } = d;
  registerClipboard(editor);
  const titlebar = new TitleBar(root, { commands: shellCommands });
  const ribbonHost = document.createElement('div');
  ribbonHost.className = 'ft-ribbon-host';
  titlebar.root.after(ribbonHost);
  new CaptionButtons(titlebar.root);

  const checkedFromToolbar = (id: string) => (): boolean => !!tb(editor)?.querySelector(`[data-cmd="${id}"].is-on`);
  for (const id of ['format.bold', 'format.italic', 'format.underline', 'format.strike', 'format.superscript', 'format.subscript', 'paragraph.align.left', 'paragraph.align.center', 'paragraph.align.right', 'paragraph.align.justify', 'list.bullet', 'list.number', 'list.check', 'insert.codeBlock', 'format.painter', 'view.outline', 'view.split', 'edit.find', 'view.draw']) setCmdState(id, { checked: checkedFromToolbar(id) });
  applyCommandIcons();

  const selectValue = (cls: string): string => (tb(editor)?.querySelector<HTMLSelectElement>(cls)?.value ?? '');
  const selectOptions = (cls: string): string[] => Array.from(tb(editor)?.querySelectorAll<HTMLOptionElement>(`${cls} option`) ?? []).filter((o) => o.value && !o.hidden).map((o) => o.value);
  const probe = {
    style: () => selectValue('.ft-tb-style'),
    font: () => selectValue('.ft-tb-font'),
    size: () => selectValue('.ft-tb-size'),
    styles: () => selectOptions('.ft-tb-style'),
    fonts: () => selectOptions('.ft-tb-font'),
    onChange: (fn: () => void) => { onCmdStateChange(fn); },
  };

  const qat = new Qat(shellCommands);
  const ribbon: Ribbon = new Ribbon(ribbonHost, shellCommands, qat, {
    tabs: wordTabs(),
    slots: wordSlots(probe),
    act: (id) => { const cmd = ACTS[id] ?? id; if (commands.has(cmd)) shellCommands.run(cmd); },
    onFile: () => d.onFile(),
    customize: async (what) => {
      const m = await import('./ui/shell/customize');
      if (what === 'ribbon') m.customizeRibbon(shellCommands, ribbon); else m.customizeQat(shellCommands, qat);
    },
    qatHost: () => titlebar.qatHost,
  });
  new KeyTips(ribbon.tipHost(), () => !document.querySelector('.ft-dialog-scrim:not([hidden]), .ft-scrim:not([hidden])'));

  const menus = wordMenus(d.recent);
  new MenuBar(titlebar.menubar, shellCommands, menus);
  let native: NativeMenus | null = null;
  if (wantsNativeMenus()) {
    native = new NativeMenus(shellCommands, () => menus);
    void native.build().catch(() => undefined);
  }

  const status = new StatusBar(root, { commands: shellCommands });

  let ctxKey = '';
  const syncDocument = (): void => {
    const ctx = contexts(editor);
    const key = ctx.join(',');
    if (key !== ctxKey) { ctxKey = key; ribbon.setContexts(ctx); }
    status.setPage(currentPage(editor), editor.pageCount());
    const sel = editor.view?.state.selection;
    const selected = sel && !sel.empty ? editor.view!.state.doc.textBetween(sel.from, sel.to, ' ').split(/\s+/).filter(Boolean).length : 0;
    status.setWords(editor.words(), selected);
    const pageless = !!(editor.doc?.settings as unknown as { pageless?: boolean } | undefined)?.pageless;
    status.setView(editor.viewMode as 'print' | 'read' | 'draft' | 'focus' | 'web', pageless);
    status.setZoom(Math.round(editor.zoom * 100));
  };
  onCmdStateChange(() => { ribbon.refresh(); native?.refresh(); syncDocument(); });
  document.addEventListener('selectionchange', () => cmdStateChanged());

  commands.register({ id: 'ribbon.collapse', label: 'Collapse the ribbon', group: 'View', description: 'Show only the ribbon tabs, or show the whole ribbon again (Ctrl+F1).', keys: ['Ctrl+F1'], run: () => { ribbon.setCollapsed(!ribbon.collapsed); return ribbon.collapsed; } });
  commands.register({ id: 'ribbon.simplified', label: 'Simplified ribbon', group: 'View', description: 'Switch between the simplified one-line ribbon and the full ribbon.', run: () => { ribbon.setSimplified(!ribbon.simplified); return ribbon.simplified; } });
  commands.register({ id: 'ribbon.compact', label: 'Icons-only ribbon', group: 'View', description: 'Show ribbon buttons as icons without labels, or with labels again.', run: () => { ribbon.setCompact(!ribbon.compact); return ribbon.compact; } });
  commands.register({ id: 'ribbon.customize', label: 'Customize the ribbon', group: 'View', description: 'Hide tabs and groups, or add your own tabs and groups of commands.', run: async () => { const m = await import('./ui/shell/customize'); m.customizeRibbon(shellCommands, ribbon); return true; } });
  commands.register({ id: 'qat.customize', label: 'Customize the Quick Access Toolbar', group: 'View', description: 'Choose the commands on the Quick Access Toolbar above the ribbon.', run: async () => { const m = await import('./ui/shell/customize'); m.customizeQat(shellCommands, qat); return true; } });
  setCmdState('ribbon.collapse', { checked: () => ribbon.collapsed });
  setCmdState('ribbon.simplified', { checked: () => ribbon.simplified });
  setCmdState('ribbon.compact', { checked: () => ribbon.compact });

  return {
    titlebar,
    status,
    ribbon,
    ribbonHost,
    rebuildMenus: () => { void native?.build().catch(() => undefined); },
    syncDocument,
  };
}
