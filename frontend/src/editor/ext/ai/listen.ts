export type ListenState = 'idle' | 'playing' | 'paused';

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function voiceList(): SpeechSynthesisVoice[] {
  return speechAvailable() ? window.speechSynthesis.getVoices() : [];
}

function chunks(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g) ?? []) {
    let s = sentence.trim();
    while (s.length > 220) {
      const cut = s.lastIndexOf(' ', 220);
      out.push(s.slice(0, cut > 0 ? cut : 220));
      s = s.slice(cut > 0 ? cut : 220).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

export class Listener {
  state: ListenState = 'idle';
  private queue: string[] = [];
  private token = 0;

  constructor(private readonly onState: (s: ListenState, done: number, total: number) => void) {}

  private total = 0;

  play(text: string, voice: string, rate: number): void {
    if (!speechAvailable()) throw new Error('This browser has no speech synthesis. Install system voices to listen.');
    this.stop();
    this.queue = chunks(text);
    this.total = this.queue.length;
    if (!this.queue.length) throw new Error('There is no text to read.');
    this.state = 'playing';
    const mine = ++this.token;
    this.next(mine, voice, rate);
  }

  private next(mine: number, voice: string, rate: number): void {
    if (mine !== this.token) return;
    const part = this.queue.shift();
    if (part === undefined) { this.state = 'idle'; this.onState('idle', this.total, this.total); return; }
    const u = new SpeechSynthesisUtterance(part);
    const v = voiceList().find((x) => x.name === voice);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate;
    u.onend = () => this.next(mine, voice, rate);
    u.onerror = (e) => { if (e.error === 'canceled' || e.error === 'interrupted') return; this.state = 'idle'; this.onState('idle', this.total - this.queue.length, this.total); };
    this.onState(this.state, this.total - this.queue.length, this.total);
    window.speechSynthesis.speak(u);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    window.speechSynthesis.pause();
    this.state = 'paused';
    this.onState('paused', this.total - this.queue.length, this.total);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    window.speechSynthesis.resume();
    this.state = 'playing';
    this.onState('playing', this.total - this.queue.length, this.total);
  }

  stop(): void {
    this.token++;
    this.queue = [];
    if (speechAvailable()) window.speechSynthesis.cancel();
    if (this.state !== 'idle') { this.state = 'idle'; this.onState('idle', 0, this.total); }
  }
}
