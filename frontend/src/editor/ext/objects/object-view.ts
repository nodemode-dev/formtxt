import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mediaDocument } from '../../schema';
import { objectUrl, sizeText } from './util';

const PX = 96 / 72;
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const RESIZABLE = new Set(['video', 'audio', 'online', 'embed']);

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function setStyle(n: HTMLElement, prop: string, value: string): void {
  if (n.style.getPropertyValue(prop) !== value) { if (value) n.style.setProperty(prop, value); else n.style.removeProperty(prop); }
}

export function embedUrl(provider: string, vid: string, hash: string): string {
  if (provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(vid)) return `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0`;
  if (provider === 'vimeo' && /^\d{3,12}$/.test(vid)) return `https://player.vimeo.com/video/${vid}?autoplay=1&dnt=1${/^[0-9a-f]{6,20}$/.test(hash) ? `&h=${hash}` : ''}`;
  return '';
}

export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toUpperCase() : 'FILE';
}

export class ObjectView implements NodeView {
  dom: HTMLElement;
  private readonly body: HTMLElement;
  private readonly handle: HTMLElement;
  private node: PMNode;
  private key = '';
  private drag: { x: number; w: number; ratio: number } | null = null;

  constructor(node: PMNode, private readonly view: EditorView, private readonly getPos: () => number | undefined) {
    this.node = node;
    this.dom = make('span', 'ft-object');
    this.dom.contentEditable = 'false';
    this.body = this.dom.appendChild(make('span', 'ft-object-body'));
    this.handle = this.dom.appendChild(make('span', 'ft-object-handle'));
    this.handle.title = 'Drag to resize';
    this.handle.addEventListener('pointerdown', (e) => this.down(e));
    this.dom.addEventListener('dblclick', (e) => {
      if (this.node.attrs.kind !== 'embed' || (e.target as HTMLElement).closest('button,a')) return;
      e.preventDefault();
      this.download();
    });
    this.apply();
  }

  private doc(): string { return String(this.node.attrs.from || mediaDocument()); }

  download(): void {
    const a = this.node.attrs;
    const url = objectUrl(this.doc(), String(a.media), String(a.name || a.source || a.media));
    if (!url) return;
    const link = make('a');
    link.href = url;
    link.download = String(a.name || a.media);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  private build(): void {
    const a = this.node.attrs;
    const kind = String(a.kind);
    const doc = this.doc();
    this.body.replaceChildren();
    if (kind === 'video') {
      const v = this.body.appendChild(make('video', 'ft-object-media'));
      v.controls = true;
      v.preload = 'metadata';
      v.playsInline = true;
      v.src = objectUrl(doc, String(a.media));
      this.body.appendChild(this.caption());
    } else if (kind === 'audio') {
      const au = this.body.appendChild(make('audio', 'ft-object-media'));
      au.controls = true;
      au.preload = 'metadata';
      au.src = objectUrl(doc, String(a.media));
      this.body.appendChild(this.caption());
    } else if (kind === 'online') {
      const card = this.body.appendChild(make('span', 'ft-object-online'));
      const poster = card.appendChild(make('img', 'ft-object-poster'));
      poster.alt = '';
      poster.draggable = false;
      poster.src = objectUrl(doc, String(a.poster));
      const play = card.appendChild(make('button', 'ft-object-play'));
      play.type = 'button';
      play.setAttribute('aria-label', `Play ${String(a.name || 'video')}`);
      play.innerHTML = PLAY_ICON;
      play.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.play(card); });
      const bar = card.appendChild(make('span', 'ft-object-bar'));
      bar.appendChild(make('span', 'ft-object-title', String(a.name || (a.provider === 'vimeo' ? 'Vimeo video' : 'YouTube video'))));
      const link = bar.appendChild(make('a', 'ft-object-link', a.provider === 'vimeo' ? 'Vimeo' : 'YouTube'));
      link.href = /^https:\/\/(www\.youtube\.com|vimeo\.com)\//.test(String(a.link)) ? String(a.link) : '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else {
      const card = this.body.appendChild(make('span', 'ft-object-file'));
      const head = card.appendChild(make('span', 'ft-object-filehead'));
      const thumb = head.appendChild(make('span', 'ft-object-thumb'));
      if (a.thumb) {
        const img = thumb.appendChild(make('img'));
        img.alt = '';
        img.draggable = false;
        img.src = objectUrl(doc, String(a.thumb));
      } else {
        thumb.innerHTML = FILE_ICON;
        thumb.appendChild(make('span', 'ft-object-ext', extOf(String(a.name || a.source || ''))));
      }
      const text = head.appendChild(make('span', 'ft-object-filetext'));
      text.appendChild(make('span', 'ft-object-title', String(a.name || a.source || 'Embedded file')));
      const meta = [extOf(String(a.name || a.source || '')), sizeText(Number(a.bytes) || 0)];
      if (Number(a.pages) > 1) meta.push(`${Number(a.pages)} pages`);
      text.appendChild(make('span', 'ft-object-meta', meta.join('  ')));
      const open = text.appendChild(make('button', 'ft-object-open', 'Download'));
      open.type = 'button';
      open.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.download(); });
      const rows = a.rows as string[][] | null;
      if (rows?.length) {
        const t = card.appendChild(make('table', 'ft-object-rows'));
        rows.forEach((r, i) => {
          const tr = t.appendChild(make('tr'));
          r.forEach((c) => tr.appendChild(make(i === 0 ? 'th' : 'td', '', c)));
        });
      }
    }
  }

  private caption(): HTMLElement {
    const a = this.node.attrs;
    const cap = make('span', 'ft-object-caption');
    cap.appendChild(make('span', 'ft-object-title', String(a.name || a.source || a.media)));
    cap.appendChild(make('span', 'ft-object-meta', sizeText(Number(a.bytes) || 0)));
    return cap;
  }

  private play(card: HTMLElement): void {
    const a = this.node.attrs;
    const src = embedUrl(String(a.provider), String(a.vid), String(a.hash));
    if (!src) return;
    const f = make('iframe', 'ft-object-frame');
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.setAttribute('title', String(a.name || 'Video'));
    f.allowFullscreen = true;
    f.src = src;
    card.replaceChildren(f);
  }

  private apply(): void {
    const a = this.node.attrs;
    const kind = String(a.kind);
    const key = [kind, a.media, a.poster, a.thumb, a.vid, a.name, a.bytes, a.pages, a.from, JSON.stringify(a.rows)].join('|');
    if (key !== this.key) { this.key = key; this.build(); }
    if (this.dom.dataset.kind !== kind) this.dom.dataset.kind = kind;
    const wrap = a.wrap === 'square' ? 'square' : 'inline';
    if (this.dom.dataset.wrap !== wrap) this.dom.dataset.wrap = wrap;
    if (this.dom.dataset.side !== String(a.side)) this.dom.dataset.side = String(a.side);
    const w = Number(a.width) * PX;
    setStyle(this.dom, 'width', `${w.toFixed(2)}px`);
    setStyle(this.dom, 'height', kind === 'video' || kind === 'online' ? `${(Number(a.height) * PX).toFixed(2)}px` : '');
    this.handle.hidden = !RESIZABLE.has(kind);
    const label = String(a.name || a.source || kind);
    if (this.dom.title !== label && kind !== 'online') this.dom.title = label;
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.drag) this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  ignoreMutation(): boolean { return true; }

  stopEvent(e: Event): boolean {
    if (this.drag) return true;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return false;
    return !!t.closest('video,audio,iframe,button,a,.ft-object-handle');
  }

  destroy(): void { this.body.replaceChildren(); }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.view.editable) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = this.dom.getBoundingClientRect();
    const scale = rect.width && this.dom.offsetWidth ? rect.width / this.dom.offsetWidth : 1;
    const a = this.node.attrs;
    this.drag = { x: e.clientX, w: this.dom.offsetWidth, ratio: Number(a.height) / Math.max(1, Number(a.width)) };
    this.handle.setPointerCapture(e.pointerId);
    const widthAt = (ev: PointerEvent): number => Math.max(96, this.drag!.w + (ev.clientX - this.drag!.x) / scale);
    const move = (ev: PointerEvent): void => {
      if (!this.drag) return;
      const w = widthAt(ev);
      setStyle(this.dom, 'width', `${w.toFixed(2)}px`);
      if (a.kind === 'video' || a.kind === 'online') setStyle(this.dom, 'height', `${(w * this.drag.ratio).toFixed(2)}px`);
    };
    const up = (ev: PointerEvent): void => {
      this.handle.removeEventListener('pointermove', move);
      this.handle.removeEventListener('pointerup', up);
      this.handle.removeEventListener('pointercancel', up);
      const d = this.drag;
      const final = d ? widthAt(ev) : 0;
      this.drag = null;
      const pos = this.getPos();
      if (!d || pos === undefined || Math.abs(ev.clientX - d.x) < 1) { this.apply(); return; }
      const w = Math.round((final / PX) * 100) / 100;
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width: w, height: Math.round(w * d.ratio * 100) / 100 });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      this.view.dispatch(tr);
    };
    this.handle.addEventListener('pointermove', move);
    this.handle.addEventListener('pointerup', up);
    this.handle.addEventListener('pointercancel', up);
  }
}

