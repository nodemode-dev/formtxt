import { type CommandRegistry, commands } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { addMenuItems } from '../ui';
import { SCRIPT_PREFIXES, runSandboxed } from './sandbox';
import { message, patch as patchList } from './util';

interface Step { cmd: string; params: Record<string, unknown> }
interface Macro { id: string; name: string; kind: 'steps' | 'script'; steps: Step[]; code: string; keys: string; modified: number }

const SKIP = ['collab.', 'file.', 'app.', 'home.', 'help.', 'edit.commandPalette'];
const SAMPLE_SCRIPT = "const text = await ft.selection();\nif (text) {\n  await ft.replaceSelection(text.toUpperCase());\n  await ft.run('format.bold');\n} else {\n  await ft.show('Select some text first.');\n}\n";

const rawRun = commands.run.bind(commands);
let recording: Step[] | null = null;
let depth = 0;
let playing = 0;
let macros: Macro[] = [];
let ed: DocEditor;
let pill: HTMLElement | null = null;
let ui: { d: Dialog; list: HTMLElement; empty: HTMLElement; status: HTMLElement; form: HTMLElement; name: HTMLInputElement; keys: HTMLInputElement; body: HTMLTextAreaElement; kind: HTMLSelectElement; error: HTMLElement; editing: string; recBtn: HTMLButtonElement } | null = null;

export function runRawCommand(id: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return rawRun(id, params);
}

function clone(params: Record<string, unknown>): Record<string, unknown> {
  try { return JSON.parse(JSON.stringify(params)) as Record<string, unknown>; } catch { return {}; }
}

function wrapRun(): void {
  commands.run = async (id: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    const outer = depth === 0 && playing === 0;
    depth++;
    try {
      const out = await rawRun(id, params);
      if (outer && recording && !SKIP.some((p) => id === p || id.startsWith(p))) {
        recording.push({ cmd: id, params: clone(params) });
        setText(pill?.querySelector('.ft-macro-count') ?? null, `${recording.length} step${recording.length === 1 ? '' : 's'}`);
      }
      return out;
    } finally {
      depth--;
    }
  };
}

export function comboOf(e: KeyboardEvent): string {
  const code = e.code;
  let key = '';
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code;
  if (!key) return '';
  const mods = [(e.ctrlKey || e.metaKey) ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  if (!mods.length && !/^F/.test(key)) return '';
  return [...mods, key].join('+');
}

function conflict(keys: string): string {
  const norm = (k: string): string => k.replace(/\s/g, '').toLowerCase();
  const hit = commands.list().find((c) => (c.keys ?? []).some((k) => norm(k) === norm(keys)));
  return hit ? hit.label : '';
}

async function load(): Promise<void> {
  try { macros = (await api.get<{ macros: Macro[] }>('/collab/macros')).macros; } catch { macros = []; }
  paintList();
}

function find(ref: string): Macro | undefined {
  const r = ref.trim().toLowerCase();
  return macros.find((m) => m.id === ref) ?? macros.find((m) => m.name.toLowerCase() === r);
}

export async function runMacro(m: Macro): Promise<number> {
  playing++;
  try {
    if (m.kind === 'script') {
      await runSandboxed(ed, m.code, { read: true, write: true, display: true, prefixes: SCRIPT_PREFIXES }, { run: rawRun, show: (t) => toast(t) });
      return 1;
    }
    let n = 0;
    for (const s of m.steps) {
      try { await rawRun(s.cmd, s.params); } catch (e) { throw new Error(`Step ${n + 1} (${s.cmd}) failed: ${message(e)}`); }
      n++;
    }
    return n;
  } finally {
    playing--;
  }
}

function nextName(): string {
  let i = macros.length + 1;
  while (macros.some((m) => m.name === `Macro ${i}`)) i++;
  return `Macro ${i}`;
}

function startRecording(): boolean {
  if (recording) throw new Error('A recording is already running. Stop it first.');
  recording = [];
  setText(pill?.querySelector('.ft-macro-count') ?? null, '0 steps');
  if (pill) setHidden(pill, false);
  syncRecButton();
  return true;
}

async function stopRecording(name?: string): Promise<{ id: string; name: string; steps: number }> {
  if (!recording) throw new Error('No recording is running.');
  const steps = recording;
  recording = null;
  if (pill) setHidden(pill, true);
  syncRecButton();
  if (!steps.length) { toast('Nothing was recorded.'); return { id: '', name: '', steps: 0 }; }
  const saved = await api.post<Macro>('/collab/macros', { name: name?.trim() || nextName(), kind: 'steps', steps });
  await load();
  if (!name) { openDialog(); editMacro(saved.id); }
  return { id: saved.id, name: saved.name, steps: steps.length };
}

function syncRecButton(): void {
  if (!ui) return;
  ui.recBtn.textContent = recording ? 'Stop recording' : 'Record macro';
  setText(ui.status, recording ? `Recording: ${recording.length} step${recording.length === 1 ? '' : 's'}. Run commands from menus, the toolbar or Find a Command.` : 'Record the commands you run, then replay them with one click or a shortcut.');
}

function paintList(): void {
  if (!ui) return;
  patchList(ui.list, macros, {
    key: (m) => m.id,
    create: (m) => {
      const row = el('<div class="ft-mac-row"><span class="ft-mac-name"></span><span class="ft-mac-meta"></span><button type="button" class="ft-btn sm" data-act="run">Run</button><button type="button" class="ft-btn sm ghost" data-act="edit">Edit</button><button type="button" class="ft-btn sm danger" data-act="delete">Delete</button></div>');
      row.dataset.id = m.id;
      return row;
    },
    update: (node, m) => {
      node.dataset.id = m.id;
      setText(node.querySelector('.ft-mac-name'), m.name);
      setText(node.querySelector('.ft-mac-meta'), `${m.kind === 'script' ? 'Script' : `${m.steps.length} step${m.steps.length === 1 ? '' : 's'}`}${m.keys ? `, ${m.keys}` : ''}`);
    },
  });
  setHidden(ui.empty, macros.length > 0);
}

function editMacro(id: string | null, kind: 'steps' | 'script' = 'steps'): void {
  if (!ui) return;
  const m = id ? macros.find((x) => x.id === id) : undefined;
  ui.editing = m?.id ?? '';
  ui.name.value = m?.name ?? (kind === 'script' ? 'New script' : nextName());
  ui.keys.value = m?.keys ?? '';
  ui.kind.value = m?.kind ?? kind;
  ui.body.value = m ? (m.kind === 'script' ? m.code : JSON.stringify(m.steps, null, 2)) : (kind === 'script' ? SAMPLE_SCRIPT : '[\n  { "cmd": "format.bold", "params": {} }\n]');
  setText(ui.error, '');
  setHidden(ui.form, false);
  ui.name.focus();
}

async function saveForm(): Promise<void> {
  if (!ui) return;
  const kind = ui.kind.value as 'steps' | 'script';
  const payload: Record<string, unknown> = { name: ui.name.value, kind, keys: ui.keys.value.trim() };
  try {
    if (kind === 'script') payload.code = ui.body.value;
    else {
      const parsed = JSON.parse(ui.body.value) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Steps are a JSON list such as [{"cmd": "format.bold", "params": {}}].');
      payload.steps = parsed;
    }
    if (ui.editing) await api.put(`/collab/macros/${encodeURIComponent(ui.editing)}`, payload);
    else await api.post('/collab/macros', payload);
  } catch (e) {
    setText(ui.error, e instanceof SyntaxError ? `The steps are not valid JSON: ${e.message}` : message(e));
    return;
  }
  const clash = payload.keys ? conflict(String(payload.keys)) : '';
  if (clash) toast(`That shortcut is also used by ${clash}; the macro takes it while it is saved.`);
  setHidden(ui.form, true);
  ui.editing = '';
  await load();
}

function openDialog(): void {
  if (!ui) {
    const d = new Dialog('Macros', 640);
    const status = el('<p class="ft-mac-help"></p>');
    const recBtn = el<HTMLButtonElement>('<button type="button" class="ft-btn sm primary">Record macro</button>');
    const newSteps = el<HTMLButtonElement>('<button type="button" class="ft-btn sm">New from steps</button>');
    const newScript = el<HTMLButtonElement>('<button type="button" class="ft-btn sm">New script</button>');
    const bar = el('<div class="ft-mac-bar"></div>');
    bar.append(recBtn, newSteps, newScript);
    const list = el('<div class="ft-mac-list"></div>');
    const empty = el('<p class="ft-mac-empty">No macros yet. Record one, or write a script.</p>');
    const name = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false">');
    const keys = el<HTMLInputElement>('<input class="ft-input" type="text" spellcheck="false" readonly placeholder="Click here, then press a shortcut such as Ctrl+Alt+1">');
    const kind = el<HTMLSelectElement>('<select class="ft-input"><option value="steps">Steps (commands with parameters)</option><option value="script">Script (JavaScript in a sandbox)</option></select>');
    const body = el<HTMLTextAreaElement>('<textarea class="ft-input ft-mac-code" rows="9" spellcheck="false"></textarea>');
    const error = el('<p class="ft-mac-error" role="alert"></p>');
    const form = el('<div class="ft-mac-form" hidden></div>');
    const fields = el('<div class="ft-mac-fields"></div>');
    for (const [label, input] of [['Name', name], ['Shortcut', keys], ['Kind', kind], ['Steps or script', body]] as const) {
      const row = el('<label class="ft-field"><span class="ft-field-label"></span></label>');
      setText(row.querySelector('.ft-field-label'), label);
      row.appendChild(input);
      fields.appendChild(row);
    }
    const actions = el('<div class="ft-mac-actions"><button type="button" class="ft-btn sm primary" data-act="save">Save macro</button><button type="button" class="ft-btn sm ghost" data-act="cancel">Cancel</button></div>');
    form.append(fields, error, actions);
    d.body.append(status, bar, list, empty, form);
    d.button('Close', 'primary', () => d.close());
    ui = { d, list, empty, status, form, name, keys, body, kind, error, editing: '', recBtn };
    recBtn.addEventListener('click', () => { void (recording ? stopRecording() : Promise.resolve(startRecording())).catch((e) => toast(message(e), 'error')); });
    newSteps.addEventListener('click', () => editMacro(null, 'steps'));
    newScript.addEventListener('click', () => editMacro(null, 'script'));
    keys.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Backspace' || e.key === 'Delete') { keys.value = ''; return; }
      const c = comboOf(e);
      if (c) keys.value = c;
    });
    kind.addEventListener('change', () => { if (!ui?.editing) body.value = kind.value === 'script' ? SAMPLE_SCRIPT : '[\n  { "cmd": "format.bold", "params": {} }\n]'; });
    actions.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'save') void saveForm();
      else if (act === 'cancel' && ui) setHidden(ui.form, true);
    });
    list.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      const id = btn?.closest<HTMLElement>('[data-id]')?.dataset.id;
      const m = id ? macros.find((x) => x.id === id) : undefined;
      if (!btn || !m) return;
      if (btn.dataset.act === 'run') { d.close(); void runMacro(m).catch((err) => toast(message(err), 'error')); }
      else if (btn.dataset.act === 'edit') editMacro(m.id);
      else if (btn.dataset.act === 'delete') void api.del(`/collab/macros/${encodeURIComponent(m.id)}`).then(load).catch((err) => toast(message(err), 'error'));
    });
  }
  syncRecButton();
  paintList();
  ui.d.open(ui.recBtn);
  void load();
}

function onKey(e: KeyboardEvent): void {
  if (e.repeat || !macros.length) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('.ft-dialog, .ft-find, input, select, textarea') && !target.closest('.ft-pm')) return;
  const c = comboOf(e);
  if (!c) return;
  const m = macros.find((x) => x.keys === c);
  if (!m) return;
  e.preventDefault();
  e.stopPropagation();
  void runMacro(m).catch((err) => toast(message(err), 'error'));
}

export function registerMacros(reg: CommandRegistry, editor: DocEditor): void {
  ed = editor;
  wrapRun();
  const bar = document.querySelector<HTMLElement>('.ft-editor .ft-menubar');
  if (bar) {
    pill = el('<span class="ft-macro-rec" hidden><i></i>Recording macro <span class="ft-macro-count">0 steps</span></span>');
    bar.appendChild(pill);
  }
  document.addEventListener('keydown', onKey, true);
  void load();

  reg.register({ id: 'collab.macros', label: 'Macros', group: 'Tools', description: 'Open the macros window: record, name, edit, run, delete and bind macros to shortcuts.', run: () => { openDialog(); return true; } });
  reg.register({ id: 'collab.macro.record', label: 'Record macro', group: 'Tools', description: 'Start recording the registry commands you run, with their parameters.', run: () => startRecording() });
  reg.register({
    id: 'collab.macro.stop',
    label: 'Stop recording',
    group: 'Tools',
    description: 'Stop the recording and save it as a macro.',
    params: [{ name: 'name', type: 'string', description: 'Name for the macro; when empty the Macros window opens to name it' }],
    run: (p) => stopRecording(p.name ? String(p.name) : undefined),
  });
  reg.register({
    id: 'collab.macro.run',
    label: 'Run macro',
    group: 'Tools',
    description: 'Run a saved macro by name or id and return how many steps ran.',
    params: [{ name: 'name', type: 'string', description: 'Macro name or id, from collab.macro.list' }],
    run: async (p) => {
      const m = find(String(p.name ?? p.id ?? ''));
      if (!m) throw new Error('No macro has that name. List them with collab.macro.list.');
      return { steps: await runMacro(m) };
    },
  });
  reg.register({ id: 'collab.macro.list', label: 'List macros', group: 'Tools', description: 'List the saved macros with their kind, step count and shortcut.', run: async () => { await load(); return macros.map((m) => ({ id: m.id, name: m.name, kind: m.kind, steps: m.steps.length, keys: m.keys })); } });
  reg.register({
    id: 'collab.macro.save',
    label: 'Save macro',
    group: 'Tools',
    description: 'Create a macro from a JSON list of steps (each cmd and params) or from a script; an existing name is replaced.',
    params: [
      { name: 'name', type: 'string', description: 'Macro name' },
      { name: 'steps', type: 'string', description: 'JSON list such as [{"cmd":"format.bold","params":{}}]' },
      { name: 'code', type: 'string', description: 'JavaScript for a script macro; leave steps empty' },
      { name: 'keys', type: 'string', description: 'Shortcut such as Ctrl+Alt+1' },
    ],
    run: async (p) => {
      const body: Record<string, unknown> = { name: String(p.name ?? ''), keys: String(p.keys ?? '') };
      if (p.code) { body.kind = 'script'; body.code = String(p.code); }
      else { body.kind = 'steps'; body.steps = JSON.parse(String(p.steps ?? '[]')); }
      const old = find(String(p.name ?? ''));
      const saved = old ? await api.put<Macro>(`/collab/macros/${encodeURIComponent(old.id)}`, body) : await api.post<Macro>('/collab/macros', body);
      await load();
      return { id: saved.id, name: saved.name };
    },
  });
  reg.register({
    id: 'collab.macro.delete',
    label: 'Delete macro',
    group: 'Tools',
    description: 'Delete a saved macro by name or id.',
    params: [{ name: 'name', type: 'string', description: 'Macro name or id' }],
    run: async (p) => {
      const m = find(String(p.name ?? p.id ?? ''));
      if (!m) throw new Error('No macro has that name.');
      await api.del(`/collab/macros/${encodeURIComponent(m.id)}`);
      await load();
      return true;
    },
  });
  reg.register({
    id: 'collab.script.run',
    label: 'Run script',
    group: 'Tools',
    description: 'Run JavaScript in a sandbox that can only call formatting and editing commands through ft.run, read text with ft.text and ft.selection, write with ft.insert and ft.replaceSelection, and show a result with ft.show.',
    params: [{ name: 'code', type: 'string', description: 'Script body; use await ft.run("format.bold")' }],
    run: async (p) => {
      let shown = '';
      await runSandboxed(ed, String(p.code ?? ''), { read: true, write: true, display: true, prefixes: SCRIPT_PREFIXES }, { run: rawRun, show: (t) => { shown = t; } });
      return { shown };
    },
  });
  addMenuItems('Tools', [
    { cmd: 'collab.macros', label: 'Macros...' },
    { cmd: 'collab.macro.record', label: 'Record macro' },
    { cmd: 'collab.macro.stop', label: 'Stop recording' },
  ]);
}
