import { splitBlock } from 'prosemirror-commands';
import { commands } from '../../../engine/registry';
import type { DocEditor } from '../../editor';

export interface Grant {
  read: boolean;
  write: boolean;
  display: boolean;
  prefixes: string[];
}

export interface SandboxOptions {
  timeoutMs?: number;
  show?: (text: string) => void;
  run?: (id: string, params: Record<string, unknown>) => Promise<unknown>;
}

export const SCRIPT_PREFIXES = ['format.', 'paragraph.', 'edit.', 'list.', 'insert.', 'table.', 'tools.', 'review.', 'layout.'];
const DENIED = ['file.', 'app.', 'collab.', 'ai.', 'home.', 'help.', 'view.toggleTheme'];

const FRAME = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'"><script>
(function () {
  var pending = {}; var n = 0;
  function call(op, args) { return new Promise(function (res, rej) { var id = ++n; pending[id] = { res: res, rej: rej }; parent.postMessage({ ft: 1, id: id, op: op, args: args || {} }, '*'); }); }
  var ft = Object.freeze({
    text: function () { return call('text'); },
    selection: function () { return call('selection'); },
    insert: function (t) { return call('insert', { text: String(t) }); },
    replaceSelection: function (t) { return call('replaceSelection', { text: String(t) }); },
    run: function (cmd, params) { return call('run', { cmd: String(cmd), params: params || {} }); },
    show: function (t) { return call('show', { text: String(t) }); }
  });
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || m.ft !== 1) return;
    if (m.type === 'result') {
      var p = pending[m.id]; if (!p) return; delete pending[m.id];
      if (m.error) p.rej(new Error(m.error)); else p.res(m.value);
    } else if (m.type === 'start') {
      var AF = Object.getPrototypeOf(async function () {}).constructor;
      new AF('ft', m.code)(ft).then(function () { parent.postMessage({ ft: 1, op: 'done' }, '*'); }, function (err) { parent.postMessage({ ft: 1, op: 'fail', error: String(err && err.message || err) }, '*'); });
    }
  });
  parent.postMessage({ ft: 1, op: 'ready' }, '*');
})();
<\/script>`;

function allowed(id: string, prefixes: string[]): boolean {
  if (DENIED.some((d) => id === d || id.startsWith(d))) return false;
  return prefixes.some((p) => id.startsWith(p));
}

function insertLines(ed: DocEditor, text: string): void {
  const v = ed.view;
  if (!v) throw new Error('Open a document first.');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (i > 0) splitBlock(v.state, v.dispatch);
    if (line) v.dispatch(v.state.tr.insertText(line));
  });
}

export function runSandboxed(ed: DocEditor, code: string, grant: Grant, opts: SandboxOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    let done = false;
    const finish = (error?: string): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      if (error) reject(new Error(error)); else resolve();
    };
    const timer = window.setTimeout(() => finish('The script ran longer than its time limit and was stopped.'), opts.timeoutMs ?? 10000);
    const reply = (id: number, value?: unknown, error?: string): void => {
      if (done) return;
      frame.contentWindow?.postMessage({ ft: 1, type: 'result', id, value, error }, '*');
    };
    const exec = async (op: string, args: Record<string, unknown>): Promise<unknown> => {
      const v = ed.view;
      if (op === 'text' || op === 'selection') {
        if (!grant.read) throw new Error('This script has no permission to read the document.');
        if (!v) throw new Error('Open a document first.');
        if (op === 'text') return v.state.doc.textBetween(0, v.state.doc.content.size, '\n', ' ');
        return v.state.doc.textBetween(v.state.selection.from, v.state.selection.to, '\n', ' ');
      }
      if (op === 'insert' || op === 'replaceSelection') {
        if (!grant.write) throw new Error('This script has no permission to change the document.');
        if (!v) throw new Error('Open a document first.');
        const text = String(args.text ?? '').slice(0, 200000);
        if (op === 'replaceSelection' && !v.state.selection.empty) v.dispatch(v.state.tr.deleteSelection());
        insertLines(ed, text);
        return true;
      }
      if (op === 'run') {
        const cmd = String(args.cmd ?? '');
        if (!allowed(cmd, grant.prefixes)) throw new Error(`This script may not run ${cmd}.`);
        const params = args.params && typeof args.params === 'object' ? (args.params as Record<string, unknown>) : {};
        const call = opts.run ? opts.run(cmd, params) : commands.run(cmd, params);
        return await Promise.race([call, new Promise((_, no) => window.setTimeout(() => no(new Error(`${cmd} did not finish in time.`)), 8000))]);
      }
      if (op === 'show') {
        if (!grant.display) throw new Error('This script has no permission to show results.');
        opts.show?.(String(args.text ?? '').slice(0, 20000));
        return true;
      }
      throw new Error(`Unknown call ${op}.`);
    };
    function onMessage(e: MessageEvent): void {
      if (e.source !== frame.contentWindow) return;
      const m = e.data as { ft?: number; id?: number; op?: string; args?: Record<string, unknown>; error?: string };
      if (!m || m.ft !== 1) return;
      if (m.op === 'ready') frame.contentWindow?.postMessage({ ft: 1, type: 'start', code }, '*');
      else if (m.op === 'done') finish();
      else if (m.op === 'fail') finish(m.error ?? 'The script failed.');
      else if (typeof m.id === 'number' && m.op) {
        const id = m.id;
        exec(m.op, m.args ?? {}).then((value) => reply(id, value), (err: Error) => reply(id, undefined, err.message));
      }
    }
    window.addEventListener('message', onMessage);
    frame.srcdoc = FRAME;
    document.body.appendChild(frame);
  });
}
