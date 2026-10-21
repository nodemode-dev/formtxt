import { type CommandRegistry } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { addMenuItems } from '../ui';
import { runRawCommand } from './macros';
import { runSandboxed } from './sandbox';
import { fileToBase64, message, patch as patchList } from './util';

interface Addin { id: string; name: string; version: string; author: string; description: string; permissions: string[]; commandPrefixes: string[]; bundled: boolean; enabled: boolean }
interface Listing { addins: Addin[]; permissions: Record<string, string>; folder: string }

let ed: DocEditor;
let items: Addin[] = [];
let labels: Record<string, string> = {};
let folder = '';
let ui: { d: Dialog; list: HTMLElement; out: HTMLElement; folder: HTMLElement; file: HTMLInputElement } | null = null;

async function load(): Promise<void> {
  const r = await api.get<Listing>('/collab/addins');
  items = r.addins;
  labels = r.permissions;
  folder = r.folder;
  paint();
}

function paint(): void {
  if (!ui) return;
  setText(ui.folder, folder);
  patchList(ui.list, items, {
    key: (a) => a.id,
    create: (a) => {
      const row = el('<div class="ft-add-row"><div class="ft-add-main"><b class="ft-add-name"></b><span class="ft-add-ver"></span><p class="ft-add-desc"></p><p class="ft-add-perms"></p></div><div class="ft-add-actions"><label class="ft-add-on"><input type="checkbox" data-act="toggle"> Enabled</label><button type="button" class="ft-btn sm" data-act="run">Run</button><button type="button" class="ft-btn sm danger" data-act="remove">Remove</button></div></div>');
      row.dataset.id = a.id;
      return row;
    },
    update: (node, a) => {
      node.dataset.id = a.id;
      setText(node.querySelector('.ft-add-name'), a.name);
      setText(node.querySelector('.ft-add-ver'), `${a.version}${a.bundled ? ', bundled' : ''}${a.author ? `, ${a.author}` : ''}`);
      setText(node.querySelector('.ft-add-desc'), a.description);
      setText(node.querySelector('.ft-add-perms'), a.permissions.length ? `Can: ${a.permissions.map((p) => labels[p] ?? p).join('; ')}${a.permissions.includes('commands') ? ` (${(a.commandPrefixes.length ? a.commandPrefixes : DEFAULT_PREFIXES).join(' ')})` : ''}` : 'Needs no permissions');
      const box = node.querySelector<HTMLInputElement>('[data-act="toggle"]');
      if (box && box.checked !== a.enabled) box.checked = a.enabled;
      const run = node.querySelector<HTMLButtonElement>('[data-act="run"]');
      if (run) run.disabled = !a.enabled;
      setHidden(node.querySelector<HTMLElement>('[data-act="remove"]') as HTMLElement, a.bundled);
    },
  });
}

const DEFAULT_PREFIXES = ['format.', 'paragraph.'];

async function runAddin(id: string): Promise<{ id: string; output: string }> {
  const a = items.find((x) => x.id === id);
  if (!a) throw new Error('No add-in has that id. List them with collab.addin.list.');
  if (!a.enabled) throw new Error(`${a.name} is disabled. Enable it in Tools > Add-ins first.`);
  const res = await fetch(`/api/collab/addins/${encodeURIComponent(id)}/script`);
  if (!res.ok) throw new Error('The add-in script could not be loaded.');
  const code = await res.text();
  let output = '';
  const grant = {
    read: a.permissions.includes('read'),
    write: a.permissions.includes('write'),
    display: a.permissions.includes('display'),
    prefixes: a.permissions.includes('commands') ? (a.commandPrefixes.length ? a.commandPrefixes : DEFAULT_PREFIXES) : [],
  };
  await runSandboxed(ed, code, grant, { run: runRawCommand, show: (t) => { output = t; if (ui) { setText(ui.out, t); setHidden(ui.out, false); } } });
  if (output && (!ui || ui.d.root.hidden)) toast(output.split('\n').slice(0, 4).join(' | '));
  return { id, output };
}

async function install(file: File): Promise<Addin> {
  const added = await api.post<Addin>('/collab/addins/install', { filename: file.name, data: await fileToBase64(file) });
  await load();
  toast(`Installed ${added.name}. Review its permissions, then tick Enabled.`);
  return added;
}

function openDialog(): void {
  if (!ui) {
    const d = new Dialog('Add-ins', 640);
    d.body.appendChild(el('<p class="ft-add-help">Add-ins are small scripts that run in a sandbox with only the permissions they declare. There is no online store: install an add-in file, or put a folder with manifest.json and main.js in the add-ins folder.</p>'));
    const folderLine = el('<p class="ft-add-folder"></p>');
    const list = el('<div class="ft-add-list"></div>');
    const out = el('<pre class="ft-add-out" hidden></pre>');
    const file = el<HTMLInputElement>('<input type="file" accept=".json,.zip,application/json,application/zip" hidden>');
    d.body.append(folderLine, list, out, file);
    d.button('Install from file', '', () => file.click());
    d.button('Close', 'primary', () => d.close());
    ui = { d, list, out, folder: folderLine, file };
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (f) void install(f).catch((e) => toast(message(e), 'error'));
    });
    list.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const id = box.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (box.dataset.act !== 'toggle' || !id) return;
      void api.post(`/collab/addins/${encodeURIComponent(id)}/enabled`, { enabled: box.checked }).then(load).catch((err) => toast(message(err), 'error'));
    });
    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
      const id = btn?.closest<HTMLElement>('[data-id]')?.dataset.id;
      if (!btn || !id) return;
      if (btn.dataset.act === 'run') {
        setHidden(out, true);
        void runAddin(id).catch((err) => toast(message(err), 'error'));
      } else if (btn.dataset.act === 'remove') void api.del(`/collab/addins/${encodeURIComponent(id)}`).then(load).catch((err) => toast(message(err), 'error'));
    });
  }
  ui.d.open();
  void load().catch((e) => toast(message(e), 'error'));
}

export function registerAddins(reg: CommandRegistry, editor: DocEditor): void {
  ed = editor;
  void load().catch(() => undefined);
  reg.register({ id: 'collab.addins', label: 'Add-ins', group: 'Tools', description: 'Open the add-ins window: bundled samples and add-ins from the add-ins folder, with permissions, enable, disable and install from a file.', run: () => { openDialog(); return true; } });
  reg.register({ id: 'collab.addin.list', label: 'List add-ins', group: 'Tools', description: 'List add-ins with their permissions and whether they are enabled.', run: async () => { await load(); return items.map((a) => ({ id: a.id, name: a.name, enabled: a.enabled, permissions: a.permissions })); } });
  reg.register({
    id: 'collab.addin.run',
    label: 'Run add-in',
    group: 'Tools',
    description: 'Run an enabled add-in in its sandbox with the permissions it declares.',
    params: [{ name: 'id', type: 'string', description: 'Add-in id, from collab.addin.list' }],
    run: async (p) => { await load(); return runAddin(String(p.id ?? '')); },
  });
  reg.register({
    id: 'collab.addin.enable',
    label: 'Enable or disable add-in',
    group: 'Tools',
    description: 'Turn an add-in on or off.',
    params: [{ name: 'id', type: 'string', description: 'Add-in id' }, { name: 'enabled', type: 'boolean', description: 'true to enable, false to disable' }],
    run: async (p) => { await api.post(`/collab/addins/${encodeURIComponent(String(p.id ?? ''))}/enabled`, { enabled: p.enabled !== false }); await load(); return true; },
  });
  reg.register({
    id: 'collab.addin.install',
    label: 'Install add-in',
    group: 'Tools',
    description: 'Install an add-in from a manifest (JSON text) and a script; it starts disabled.',
    params: [{ name: 'manifest', type: 'string', description: 'JSON with id, name, version, description, permissions (read, write, commands, display) and optional commandPrefixes' }, { name: 'script', type: 'string', description: 'JavaScript using the ft object' }],
    run: async (p) => {
      const body = JSON.stringify({ ...(JSON.parse(String(p.manifest ?? '{}')) as object), script: String(p.script ?? '') });
      const added = await api.post<Addin>('/collab/addins/install', { filename: 'add-in.json', data: btoa(unescape(encodeURIComponent(body))) });
      await load();
      return { id: added.id };
    },
  });
  addMenuItems('Tools', [{ cmd: 'collab.addins', label: 'Add-ins...' }]);
}
