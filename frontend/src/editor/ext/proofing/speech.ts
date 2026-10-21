import { splitBlock } from 'prosemirror-commands';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { DocEditor } from '../../editor';
import { schema } from '../../schema';
import { announce, reveal } from './kit';
import { documentLanguage } from './state';
import { OBJECT, paraText, sentences, spanAt } from './text';

export const speakKey = new PluginKey<{ from: number; to: number } | null>('proofing-speak');

export function speakPlugin(): Plugin {
  return new Plugin<{ from: number; to: number } | null>({
    key: speakKey,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(speakKey) as { set?: { from: number; to: number } | null } | undefined;
        if (meta && 'set' in meta) return meta.set ?? null;
        if (value && tr.docChanged) return { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to) };
        return value;
      },
    },
    props: {
      decorations(state) {
        const r = speakKey.getState(state);
        return r && r.to > r.from ? DecorationSet.create(state.doc, [Decoration.inline(r.from, r.to, { class: 'ft-speaking' })]) : null;
      },
    },
  });
}

function store(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { void 0; }
}

interface Chunk { text: string; map: number[]; lang: string; start: number }

export type ReadStatus = 'idle' | 'playing' | 'paused';

export class ReadAloud {
  status: ReadStatus = 'idle';
  rate = Number(store('ft.speech.rate', '1')) || 1;
  voiceURI = store('ft.speech.voice', '');
  private chunks: Chunk[] = [];
  private index = 0;
  private token = 0;
  private readonly listeners = new Set<() => void>();
  lastWord = '';

  constructor(private readonly ed: DocEditor) {}

  onChange(fn: () => void): void { this.listeners.add(fn); }

  private emit(): void { for (const l of this.listeners) l(); }

  supported(): boolean { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }

  voices(): SpeechSynthesisVoice[] { return this.supported() ? window.speechSynthesis.getVoices() : []; }

  setRate(r: number): number {
    this.rate = Math.max(0.5, Math.min(3, r));
    save('ft.speech.rate', String(this.rate));
    this.emit();
    return this.rate;
  }

  setVoice(uri: string): void {
    this.voiceURI = uri;
    save('ft.speech.voice', uri);
    this.emit();
  }

  private collect(from: number, to: number): Chunk[] {
    const view = this.ed.view;
    if (!view) return [];
    const out: Chunk[] = [];
    const lang = documentLanguage();
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== 'paragraph') return node.type.name !== 'code_block';
      const p = paraText(node, pos, lang);
      for (const s of sentences(p.text)) {
        let a = s.from;
        while (a < s.to && p.map[a] < from) a++;
        let b = s.to;
        while (b > a && p.map[b - 1] >= to) b--;
        if (b <= a) continue;
        const raw = p.text.slice(a, b);
        const text = raw.replace(new RegExp(OBJECT, 'g'), ' ').replace(/[\n\t]/g, ' ');
        if (!/[\p{L}\p{N}]/u.test(text)) continue;
        out.push({ text, map: p.map.slice(a, b), lang: spanAt(p, a)?.lang ?? lang, start: a });
      }
      return false;
    });
    return out;
  }

  async start(): Promise<number> {
    const view = this.ed.view;
    if (!view) throw new Error('Open a document first.');
    if (!this.supported()) throw new Error('This browser has no speech synthesis, so Read aloud is not available.');
    if (!this.voices().length) {
      await new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, 1200);
        window.speechSynthesis.addEventListener('voiceschanged', () => { window.clearTimeout(t); resolve(); }, { once: true });
      });
    }
    if (!this.voices().length) throw new Error('No speech voices are installed for this browser. Install a system voice (for example speech-dispatcher with eSpeak NG on Linux) and try again.');
    const sel = view.state.selection;
    const end = view.state.doc.content.size;
    this.chunks = this.collect(sel.empty ? sel.from : sel.from, sel.empty ? end : sel.to);
    if (!this.chunks.length) throw new Error('There is no text to read from here.');
    window.speechSynthesis.cancel();
    this.token++;
    this.index = 0;
    this.status = 'playing';
    this.emit();
    announce('Reading aloud');
    this.speak(this.token);
    return this.chunks.length;
  }

  private speak(token: number): void {
    if (token !== this.token) return;
    const chunk = this.chunks[this.index];
    if (!chunk) { this.finish(); return; }
    const u = new SpeechSynthesisUtterance(chunk.text);
    u.rate = this.rate;
    const voice = this.voices().find((v) => v.voiceURI === this.voiceURI);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = chunk.lang;
    u.onboundary = (e) => {
      if (token !== this.token) return;
      const at = e.charIndex;
      const m = /^[\p{L}\p{N}'\u2019-]+/u.exec(chunk.text.slice(at));
      const len = m ? m[0].length : Math.max(1, e.charLength || 1);
      this.mark(chunk.map[at], chunk.map[Math.min(at + len, chunk.map.length) - 1] + 1, chunk.text.slice(at, at + len));
    };
    u.onend = () => {
      if (token !== this.token || this.status === 'idle') return;
      this.index++;
      this.speak(token);
    };
    u.onerror = (e) => {
      if (token !== this.token) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.finish();
    };
    window.speechSynthesis.speak(u);
  }

  private mark(from: number, to: number, word: string): void {
    const view = this.ed.view;
    if (!view || from === undefined || to === undefined) return;
    this.lastWord = word;
    view.dispatch(view.state.tr.setMeta(speakKey, { set: { from, to } }).setMeta('addToHistory', false));
    const at = view.domAtPos(from);
    const node = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : (at.node as HTMLElement);
    reveal(node);
  }

  private clearMark(): void {
    const view = this.ed.view;
    if (view) view.dispatch(view.state.tr.setMeta(speakKey, { set: null }).setMeta('addToHistory', false));
  }

  private finish(): void {
    this.status = 'idle';
    this.token++;
    this.clearMark();
    this.emit();
    announce('Finished reading');
  }

  pause(): boolean {
    if (this.status !== 'playing') return false;
    window.speechSynthesis.pause();
    this.status = 'paused';
    this.emit();
    announce('Paused');
    return true;
  }

  resume(): boolean {
    if (this.status !== 'paused') return false;
    window.speechSynthesis.resume();
    this.status = 'playing';
    this.emit();
    announce('Resumed');
    return true;
  }

  stop(): boolean {
    if (this.status === 'idle') return false;
    this.token++;
    if (this.supported()) window.speechSynthesis.cancel();
    this.status = 'idle';
    this.clearMark();
    this.emit();
    announce('Stopped reading');
    return true;
  }

  skip(dir: 1 | -1): boolean {
    if (this.status === 'idle') return false;
    window.speechSynthesis.cancel();
    this.token++;
    this.index = Math.max(0, Math.min(this.chunks.length, this.index + dir));
    this.status = 'playing';
    this.speak(this.token);
    this.emit();
    return true;
  }
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: (track?: MediaStreamTrack) => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

export function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const NO_RECOGNITION = 'This browser does not provide speech recognition (the Web Speech API). Chrome and Edge do, and send the audio to the browser maker\'s service; Firefox and the Linux desktop webview do not. Your system\'s own dictation still works when you type into the page.';

const SPOKEN: Array<[RegExp, string, 'tight' | 'open' | 'close' | 'free']> = [
  [/\b(?:full stop|period)\b/gi, '.', 'tight'],
  [/\bcomma\b/gi, ',', 'tight'],
  [/\bquestion mark\b/gi, '?', 'tight'],
  [/\bexclamation (?:mark|point)\b/gi, '!', 'tight'],
  [/\bsemicolon\b/gi, ';', 'tight'],
  [/\bcolon\b/gi, ':', 'tight'],
  [/\b(?:open|left) (?:parenthesis|bracket)\b/gi, '(', 'open'],
  [/\b(?:close|right) (?:parenthesis|bracket)\b/gi, ')', 'close'],
  [/\bopen quote\b/gi, '\u201c', 'open'],
  [/\b(?:close|end) quote\b/gi, '\u201d', 'close'],
  [/\bhyphen\b/gi, '-', 'close'],
  [/\bdash\b/gi, '\u2013', 'free'],
];

export type DictOp = { kind: 'text'; text: string } | { kind: 'paragraph' } | { kind: 'line' };

export function parseSpeech(transcript: string): DictOp[] {
  const ops: DictOp[] = [];
  const pieces = transcript.split(/\b(new paragraph|new line)\b/i);
  for (const piece of pieces) {
    if (/^new paragraph$/i.test(piece)) { ops.push({ kind: 'paragraph' }); continue; }
    if (/^new line$/i.test(piece)) { ops.push({ kind: 'line' }); continue; }
    let t = piece;
    for (const [re, sym, mode] of SPOKEN) t = t.replace(re, mode === 'free' ? ` ${sym} ` : `\u0001${mode}${sym}\u0002`);
    t = t.replace(/\s*\u0001tight([^\u0002]*)\u0002/g, '$1').replace(/\u0001open([^\u0002]*)\u0002\s*/g, ' $1').replace(/\s*\u0001close([^\u0002]*)\u0002/g, '$1').replace(/[\u0001\u0002]/g, '').replace(/\s+/g, ' ');
    if (t.trim()) ops.push({ kind: 'text', text: t });
  }
  return ops;
}

function capitalise(before: string, text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed) return text;
  const startOfSentence = before === '' || /[.!?]["')\u201d]*\s*$/.test(before);
  if (!startOfSentence) return text;
  const lead = text.length - trimmed.length;
  return text.slice(0, lead) + trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function insertDictation(view: EditorView, ops: DictOp[]): number {
  let inserted = 0;
  for (const op of ops) {
    if (op.kind !== 'text') {
      const $h = view.state.selection.$from;
      if ($h.parent.textBetween(Math.max(0, $h.parentOffset - 1), $h.parentOffset) === ' ') view.dispatch(view.state.tr.delete($h.pos - 1, $h.pos));
    }
    const state = view.state;
    if (op.kind === 'paragraph') {
      splitBlock(state, view.dispatch);
      inserted++;
    } else if (op.kind === 'line') {
      view.dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
      inserted++;
    } else {
      const $ = state.selection.$from;
      const before = $.parent.textBetween(0, $.parentOffset, undefined, OBJECT);
      let text = op.text;
      const noSpace = before === '' || /[\s(\u201c\n]$/.test(before) || before.endsWith(OBJECT) || /^[.,;:!?)\u201d]/.test(text.trimStart());
      text = noSpace ? text.trimStart() : (/^\s/.test(text) ? text : ` ${text}`);
      text = capitalise(before, text);
      view.dispatch(state.tr.insertText(text).scrollIntoView());
      inserted += text.length;
    }
  }
  return inserted;
}

export type VoiceMode = 'dictate' | 'transcribe';

function stamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function newId(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return `p_${Array.from(a, (b) => (b % 36).toString(36)).join('')}`;
}

export class Voice {
  mode: VoiceMode = 'dictate';
  active = false;
  interim = '';
  error = '';
  lang = '';
  private rec: RecognitionLike | null = null;
  private wantOn = false;
  private startedAt = 0;
  private lastPara = '';
  private readonly listeners = new Set<() => void>();
  segments = 0;

  constructor(private readonly ed: DocEditor) {}

  onChange(fn: () => void): void { this.listeners.add(fn); }

  private emit(): void { for (const l of this.listeners) l(); }

  supported(): boolean { return recognitionCtor() !== null; }

  start(mode: VoiceMode, track?: MediaStreamTrack): void {
    const Ctor = recognitionCtor();
    if (!Ctor) throw new Error(NO_RECOGNITION);
    if (!this.ed.view) throw new Error('Open a document first.');
    if (this.active) this.stop();
    this.mode = mode;
    this.error = '';
    this.interim = '';
    this.segments = 0;
    this.lastPara = '';
    this.startedAt = performance.now();
    const rec = new Ctor();
    rec.lang = this.lang || documentLanguage();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => { this.active = true; this.emit(); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) this.final(text);
        else interim += text;
      }
      this.interim = interim;
      this.emit();
    };
    rec.onerror = (e) => {
      const map: Record<string, string> = {
        'not-allowed': 'The microphone is blocked. Allow microphone access for this page and try again.',
        'service-not-allowed': 'The browser\'s speech service is not allowed for this page.',
        'network': 'The browser\'s speech service could not be reached. Dictation needs a network connection in this browser.',
        'no-speech': 'No speech was heard.',
        'audio-capture': 'No microphone was found.',
        'language-not-supported': 'The browser does not support dictation in this language.',
      };
      this.error = map[e.error] ?? `Speech recognition stopped: ${e.error}`;
      if (e.error !== 'no-speech' && e.error !== 'aborted') this.wantOn = false;
      this.emit();
    };
    rec.onend = () => {
      if (this.wantOn) { try { rec.start(); return; } catch { void 0; } }
      this.active = false;
      this.interim = '';
      this.emit();
    };
    this.rec = rec;
    this.wantOn = true;
    try {
      if (track) rec.start(track); else rec.start();
    } catch (err) {
      this.wantOn = false;
      throw new Error(`Could not start speech recognition: ${(err as Error).message}`);
    }
    this.active = true;
    announce(mode === 'dictate' ? 'Dictation started' : 'Transcription started');
    this.emit();
  }

  stop(): boolean {
    if (!this.rec) return false;
    this.wantOn = false;
    try { this.rec.stop(); } catch { void 0; }
    this.rec = null;
    this.active = false;
    this.interim = '';
    announce(this.mode === 'dictate' ? 'Dictation stopped' : 'Transcription stopped');
    this.emit();
    return true;
  }

  final(text: string): void {
    const view = this.ed.view;
    if (!view || !text.trim()) return;
    this.segments++;
    if (this.mode === 'dictate') { insertDictation(view, parseSpeech(text)); return; }
    this.transcript(view, text.trim());
  }

  private transcript(view: EditorView, text: string): void {
    const at = stamp(performance.now() - this.startedAt);
    const para = schema.nodes.paragraph;
    const bold = schema.marks.bold.create();
    const build = (): ReturnType<typeof para.create> => para.create({ id: newId() }, [schema.text(`[${at}] `, [bold]), schema.text(text)]);
    const state = view.state;
    let insertAt = -1;
    if (this.lastPara) state.doc.descendants((node, pos) => { if (node.attrs.id === this.lastPara) insertAt = pos + node.nodeSize; return insertAt < 0 && !node.isTextblock; });
    const tr = state.tr;
    if (insertAt < 0) {
      const $ = state.selection.$from;
      const topAfter = $.depth ? $.after(1) : state.selection.to;
      const heading = para.create({ id: newId(), style: 'Heading2' }, schema.text('Transcript'));
      const node = build();
      tr.insert(topAfter, [heading, node]);
      this.lastPara = String(node.attrs.id);
    } else {
      const node = build();
      tr.insert(insertAt, node);
      this.lastPara = String(node.attrs.id);
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(state.selection.head), tr.doc.content.size))));
    view.dispatch(tr.scrollIntoView());
  }

  async transcribeFile(file: File): Promise<void> {
    if (!recognitionCtor()) throw new Error(NO_RECOGNITION);
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(file);
    audio.preload = 'auto';
    const capture = (audio as unknown as { captureStream?: () => MediaStream }).captureStream;
    if (!capture) throw new Error('This browser cannot capture audio from a file for speech recognition. Play the recording near the microphone and use live transcription instead.');
    await new Promise<void>((resolve, reject) => { audio.onloadedmetadata = () => resolve(); audio.onerror = () => reject(new Error('The browser could not read that audio file.')); });
    const stream = capture.call(audio);
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error('The audio file has no audio track the browser can capture.');
    this.start('transcribe', track);
    audio.onended = () => { window.setTimeout(() => this.stop(), 800); URL.revokeObjectURL(audio.src); };
    await audio.play();
  }
}
