import type { DocEditor } from '../../editor';
import { el, patchList, setClass, setHidden, setText, setValue } from '../../../ui/dom';
import { toast } from '../../../ui/toast';
import { LANGUAGES } from './layout';
import { NO_RECOGNITION, type ReadAloud, type Voice } from './speech';
import { documentLanguage } from './state';

export const READ_PANEL = 'readaloud';
export const VOICE_PANEL = 'voice';

export class ReadPanel {
  readonly root: HTMLElement;
  private readonly refs: Record<string, HTMLElement>;

  constructor(private readonly ed: DocEditor, private readonly speaker: ReadAloud) {
    this.root = el(`<section class="ft-pf-panel" aria-label="Read aloud">
<div class="ft-pf-transport" role="group" aria-label="Playback">
  <button type="button" class="ft-btn sm" data-act="prev" aria-label="Previous sentence">Back</button>
  <button type="button" class="ft-btn sm primary" data-act="play" data-ref="play">Play</button>
  <button type="button" class="ft-btn sm" data-act="stop" data-ref="stop">Stop</button>
  <button type="button" class="ft-btn sm" data-act="next" aria-label="Next sentence">Next</button>
</div>
<label class="ft-field"><span class="ft-field-label">Speed <output data-ref="rateOut">1.0x</output></span><input type="range" min="0.5" max="2" step="0.1" value="1" data-ref="rate" aria-label="Speed"></label>
<label class="ft-field"><span class="ft-field-label">Voice</span><select class="ft-input" data-ref="voice" aria-label="Voice"></select></label>
<p class="ft-pf-state" role="status" data-ref="state">Ready</p>
<p class="ft-pf-word" aria-hidden="true" data-ref="word"></p>
<p class="ft-note">Reads from the cursor, or only the selection if there is one. Voices come from your system; the highlighted word follows the speech.</p>
<p class="ft-note" data-ref="none" hidden>No voices are installed for this browser, so playback cannot start.</p>
</section>`);
    this.refs = {};
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-ref]'))) this.refs[n.dataset.ref ?? ''] = n;
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act) return;
      const fail = (err: Error): void => toast(err.message, 'error');
      if (act === 'play') {
        if (speaker.status === 'playing') speaker.pause();
        else if (speaker.status === 'paused') speaker.resume();
        else void speaker.start().catch(fail);
      } else if (act === 'stop') speaker.stop();
      else if (act === 'prev') speaker.skip(-1);
      else if (act === 'next') speaker.skip(1);
    });
    this.refs.rate.addEventListener('input', () => speaker.setRate(Number((this.refs.rate as HTMLInputElement).value)));
    this.refs.voice.addEventListener('change', () => speaker.setVoice((this.refs.voice as HTMLSelectElement).value));
    speaker.onChange(() => this.patch());
    if (speaker.supported()) window.speechSynthesis.addEventListener('voiceschanged', () => this.patch());
    this.patch();
  }

  patch(): void {
    const s = this.speaker;
    setText(this.refs.play, s.status === 'playing' ? 'Pause' : s.status === 'paused' ? 'Resume' : 'Play');
    (this.refs.stop as HTMLButtonElement).disabled = s.status === 'idle';
    setText(this.refs.state, !s.supported() ? 'Speech synthesis is not available in this browser.' : s.status === 'playing' ? 'Reading aloud' : s.status === 'paused' ? 'Paused' : 'Ready');
    setText(this.refs.rateOut, `${s.rate.toFixed(1)}x`);
    const rate = this.refs.rate as HTMLInputElement;
    if (Number(rate.value) !== s.rate) rate.value = String(s.rate);
    setText(this.refs.word, s.status === 'idle' ? '' : s.lastWord);
    const voices = s.voices();
    const sel = this.refs.voice as HTMLSelectElement;
    patchList(sel, [{ uri: '', name: 'System default', lang: '' }, ...voices.map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }))], {
      key: (v) => v.uri || 'default',
      create: (v) => { const o = document.createElement('option'); o.value = v.uri; o.textContent = v.lang ? `${v.name} (${v.lang})` : v.name; return o; },
      update: (o, v) => { const op = o as HTMLOptionElement; op.value = v.uri; setText(op, v.lang ? `${v.name} (${v.lang})` : v.name); },
    });
    setValue(sel, s.voiceURI);
    setHidden(this.refs.none, voices.length > 0 || !s.supported());
  }
}

export class VoicePanel {
  readonly root: HTMLElement;
  private readonly refs: Record<string, HTMLElement>;

  constructor(private readonly ed: DocEditor, private readonly voice: Voice) {
    this.root = el(`<section class="ft-pf-panel" aria-label="Dictate and transcribe">
<label class="ft-field"><span class="ft-field-label">Mode</span><select class="ft-input" data-ref="mode" aria-label="Mode"><option value="dictate">Dictate into the document</option><option value="transcribe">Transcribe into a transcript</option></select></label>
<label class="ft-field"><span class="ft-field-label">Spoken language</span><select class="ft-input" data-ref="lang" aria-label="Spoken language"></select></label>
<div class="ft-pf-transport">
  <button type="button" class="ft-btn sm primary" data-act="toggle" data-ref="toggle">Start</button>
  <button type="button" class="ft-btn sm" data-act="file" data-ref="fileBtn" hidden>Transcribe an audio file</button>
  <input type="file" accept="audio/*" data-ref="file" hidden aria-label="Audio file">
</div>
<p class="ft-pf-state" role="status" data-ref="state">Ready</p>
<p class="ft-pf-interim" data-ref="interim" aria-hidden="true"></p>
<p class="ft-note" data-ref="warn" hidden></p>
<p class="ft-note">Dictation uses the speech recognition built into your browser. In Chrome and Edge that sends your audio to the browser maker's online service; FormTxt itself sends nothing. Say "comma", "period", "question mark", "new line" or "new paragraph" to add punctuation and breaks.</p>
</section>`);
    this.refs = {};
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('[data-ref]'))) this.refs[n.dataset.ref ?? ''] = n;
    (this.refs.lang as HTMLSelectElement).innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
    this.root.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      const fail = (err: Error): void => toast(err.message, 'error');
      if (act === 'toggle') {
        if (voice.active) voice.stop();
        else try { voice.start(voice.mode); } catch (err) { fail(err as Error); }
      } else if (act === 'file') (this.refs.file as HTMLInputElement).click();
    });
    (this.refs.mode as HTMLSelectElement).addEventListener('change', () => { if (voice.active) voice.stop(); voice.mode = (this.refs.mode as HTMLSelectElement).value as 'dictate' | 'transcribe'; this.patch(); });
    (this.refs.lang as HTMLSelectElement).addEventListener('change', () => { voice.lang = (this.refs.lang as HTMLSelectElement).value; });
    (this.refs.file as HTMLInputElement).addEventListener('change', () => {
      const f = (this.refs.file as HTMLInputElement).files?.[0];
      if (f) void voice.transcribeFile(f).catch((err: Error) => toast(err.message, 'error'));
      (this.refs.file as HTMLInputElement).value = '';
    });
    voice.onChange(() => this.patch());
    this.patch();
  }

  patch(): void {
    const v = this.voice;
    setValue(this.refs.mode as HTMLSelectElement, v.mode);
    setValue(this.refs.lang as HTMLSelectElement, v.lang || documentLanguage());
    setText(this.refs.toggle, v.active ? 'Stop' : 'Start');
    setClass(this.refs.toggle, 'is-recording', v.active);
    setHidden(this.refs.fileBtn, v.mode !== 'transcribe');
    setText(this.refs.state, !v.supported() ? 'Speech recognition is not available in this browser.' : v.active ? (v.mode === 'dictate' ? 'Listening. Speak to type at the cursor.' : `Transcribing, ${v.segments} segment${v.segments === 1 ? '' : 's'}`) : 'Ready');
    setText(this.refs.interim, v.interim);
    const warn = !v.supported() ? NO_RECOGNITION : v.error;
    setText(this.refs.warn, warn);
    setHidden(this.refs.warn, !warn);
  }
}
