import { splitBlock } from 'prosemirror-commands';
import { AllSelection, Selection, TextSelection } from 'prosemirror-state';
import { type CommandRegistry, commands } from '../../../engine/registry';
import { api } from '../../../io/api';
import { Dialog } from '../../../ui/dialog';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { addMenuItems } from '../ui';
import { message } from './util';

type Action = { cmd: string; params?: Record<string, unknown> } | { local: (ed: DocEditor) => void };

interface RecognitionEvent { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };

function sel(ed: DocEditor, make: (doc: NonNullable<DocEditor['view']>['state']) => Selection): void {
  const v = ed.view;
  if (!v) throw new Error('Open a document first.');
  v.dispatch(v.state.tr.setSelection(make(v.state)).scrollIntoView());
  v.focus();
}

const wordAt = (ed: DocEditor): void => sel(ed, (s) => {
  const { $from } = s.selection;
  const text = $from.parent.textContent;
  const off = $from.parentOffset;
  let a = off;
  let b = off;
  while (a > 0 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && /\S/.test(text[b])) b++;
  return TextSelection.create(s.doc, $from.start() + a, $from.start() + b);
});

const TABLE: Record<string, Action> = {
  bold: { cmd: 'format.bold' },
  italic: { cmd: 'format.italic' },
  underline: { cmd: 'format.underline' },
  strikethrough: { cmd: 'format.strike' },
  'clear formatting': { cmd: 'format.clear' },
  undo: { cmd: 'edit.undo' },
  redo: { cmd: 'edit.redo' },
  find: { cmd: 'edit.find' },
  'bulleted list': { cmd: 'list.bullet' },
  'bullet list': { cmd: 'list.bullet' },
  'numbered list': { cmd: 'list.number' },
  checklist: { cmd: 'list.check' },
  'align left': { cmd: 'paragraph.align.left' },
  'align center': { cmd: 'paragraph.align.center' },
  'align right': { cmd: 'paragraph.align.right' },
  justify: { cmd: 'paragraph.align.justify' },
  'normal text': { cmd: 'paragraph.style', params: { style: 'Normal' } },
  'page break': { cmd: 'insert.pageBreak' },
  'select all': { local: (ed) => sel(ed, (s) => new AllSelection(s.doc)) },
  'select paragraph': { local: (ed) => sel(ed, (s) => { const { $from } = s.selection; return $from.depth ? TextSelection.create(s.doc, $from.start(), $from.end()) : s.selection; }) },
  'select word': { local: wordAt },
  'go to end': { local: (ed) => sel(ed, (s) => Selection.atEnd(s.doc)) },
  'go to start': { local: (ed) => sel(ed, (s) => Selection.atStart(s.doc)) },
  'go to the end': { local: (ed) => sel(ed, (s) => Selection.atEnd(s.doc)) },
  'go to the start': { local: (ed) => sel(ed, (s) => Selection.atStart(s.doc)) },
  'go to end of paragraph': { local: (ed) => sel(ed, (s) => { const { $from } = s.selection; return TextSelection.create(s.doc, $from.depth ? $from.end() : $from.pos); }) },
  'go to start of paragraph': { local: (ed) => sel(ed, (s) => { const { $from } = s.selection; return TextSelection.create(s.doc, $from.depth ? $from.start() : $from.pos); }) },
  'new line': { local: (ed) => { const v = ed.view; if (v) { v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); v.focus(); } } },
  'new paragraph': { local: (ed) => { const v = ed.view; if (v) { splitBlock(v.state, v.dispatch); v.focus(); } } },
  delete: { local: (ed) => { const v = ed.view; if (v) { v.dispatch(v.state.tr.deleteSelection().scrollIntoView()); v.focus(); } } },
};

export function voicePhrases(): string[] {
  return [...Object.keys(TABLE), 'heading 1 to 6'].sort();
}

function normalize(phrase: string): string {
  let p = phrase.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  p = p.replace(/^(please|computer)\s+/, '').replace(/\s+please$/, '');
  p = p.replace(/^heading (one|two|three|four|five|six)$/, (_m, n: string) => `heading ${NUMBERS[n]}`);
  if (p === 'bolt' || p === 'bold text') p = 'bold';
  return p;
}

let ed: DocEditor;
let rec: Recognition | null = null;
let listening = false;
let pill: HTMLElement | null = null;

export async function say(phrase: string): Promise<string> {
  const p = normalize(phrase);
  const h = /^heading ([1-6])$/.exec(p);
  const action: Action | undefined = h ? { cmd: 'paragraph.style', params: { style: `Heading${h[1]}` } } : TABLE[p];
  if (!action) throw new Error(`"${phrase}" is not a voice command. Say one of: ${voicePhrases().join(', ')}.`);
  if ('local' in action) action.local(ed);
  else await commands.run(action.cmd, action.params ?? {});
  return p;
}

function recognizer(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function optedIn(): Promise<boolean> {
  const info = await api.get<{ settings: { voice: boolean } }>('/collab/info');
  return info.settings.voice;
}

function consent(): Promise<boolean> {
  return new Promise((resolve) => {
    const d = new Dialog('Turn on voice commands', 480);
    d.body.appendChild(el('<p>Voice commands use the speech recognition built into your browser. In Chrome and Edge the audio is sent to the browser maker\'s speech service to be turned into text. FormTxt itself sends nothing, and you can turn this off at any time.</p>'));
    let answered = false;
    const answer = (v: boolean): void => { answered = true; d.close(); resolve(v); };
    d.button('Not now', 'ghost', () => answer(false));
    d.button('Turn on', 'primary', () => answer(true));
    d.root.addEventListener('click', (e) => { if (!answered && (e.target === d.root || (e.target as HTMLElement).closest('[data-close]'))) resolve(false); });
    d.open();
  });
}

function paint(): void {
  if (pill) setHidden(pill, !listening);
}

async function start(): Promise<boolean> {
  const Rec = recognizer();
  if (!Rec) throw new Error('This browser has no speech recognition, so voice commands cannot listen. Chrome and Edge include it. You can still run a phrase with collab.voice.say.');
  if (!(await optedIn())) {
    if (!(await consent())) return false;
    await api.post('/collab/settings', { voice: true });
  }
  if (listening) return true;
  const r = new Rec();
  r.continuous = true;
  r.interimResults = false;
  r.lang = document.documentElement.lang || navigator.language || 'en-US';
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const heard = e.results[i][0].transcript.trim();
      if (!heard) continue;
      setText(pill?.querySelector('.ft-voice-heard') ?? null, heard);
      void say(heard).catch((err) => toast(message(err), 'error'));
    }
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    listening = false;
    paint();
    toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was blocked. Allow it in the browser to use voice commands.' : e.error === 'network' ? 'The browser could not reach its speech service. Voice commands need it.' : `Speech recognition stopped: ${e.error}.`, 'error');
  };
  r.onend = () => { if (listening && rec === r) { try { r.start(); } catch { listening = false; paint(); } } };
  rec = r;
  listening = true;
  r.start();
  paint();
  return true;
}

function stop(): boolean {
  listening = false;
  const r = rec;
  rec = null;
  r?.stop();
  paint();
  return false;
}

export function registerVoice(reg: CommandRegistry, editor: DocEditor): void {
  ed = editor;
  const bar = document.querySelector<HTMLElement>('.ft-editor .ft-menubar');
  if (bar) {
    pill = el('<span class="ft-voice-pill" hidden><i></i>Listening <span class="ft-voice-heard"></span></span>');
    bar.appendChild(pill);
  }
  reg.register({
    id: 'collab.voice.toggle',
    label: 'Voice commands',
    group: 'Tools',
    description: 'Start or stop listening for spoken commands such as bold, select paragraph, new line, undo and go to end. Needs browser speech recognition and a one-time opt-in.',
    run: async () => (listening ? stop() : start()),
  });
  reg.register({
    id: 'collab.voice.say',
    label: 'Say a voice command',
    group: 'Tools',
    description: 'Run a spoken command from text, as if it had been heard: bold, italic, underline, undo, redo, select paragraph, select word, select all, go to end, go to start, new line, new paragraph, heading 1 to 6, bulleted list and more.',
    params: [{ name: 'phrase', type: 'string', description: 'The phrase, for example select paragraph' }],
    run: async (p) => ({ command: await say(String(p.phrase ?? '')) }),
  });
  reg.register({ id: 'collab.voice.list', label: 'List voice commands', group: 'Tools', description: 'List the phrases voice commands understand.', run: () => voicePhrases() });
  addMenuItems('Tools', [{ cmd: 'collab.voice.toggle', label: 'Voice commands' }]);
}
