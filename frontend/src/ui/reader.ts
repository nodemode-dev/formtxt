import type { Block, FtxtDocument, ParaProps, RunProps, TextRun } from '../engine/model';
import { el, setHtml } from './dom';

const PX = 96 / 72;
const SERIF = new Set(['Source Serif 4', 'Libre Baskerville', 'Lora', 'Merriweather', 'Playfair Display', 'IBM Plex Serif']);

function family(name?: string): string {
  if (!name) return 'var(--font-ui)';
  return `'${name.replace(/'/g, '')}', ${SERIF.has(name) ? 'Georgia, serif' : "'Inter', system-ui, sans-serif"}`;
}

function resolve(doc: FtxtDocument, sid: string): { run: RunProps; para: ParaProps } {
  const chain = [];
  const seen = new Set<string>();
  let id: string | null = sid;
  while (id && doc.styles[id] && !seen.has(id)) {
    seen.add(id);
    chain.push(doc.styles[id]);
    id = doc.styles[id].basedOn;
  }
  const run: RunProps = {};
  const para: ParaProps = {};
  for (const s of chain.reverse()) { Object.assign(run, s.run ?? {}); Object.assign(para, s.para ?? {}); }
  return { run, para };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

function runHtml(r: TextRun): string {
  const m = r.marks ?? {};
  let h = esc(r.text);
  if (m.code) h = `<code>${h}</code>`;
  if (m.bold) h = `<strong>${h}</strong>`;
  if (m.italic) h = `<em>${h}</em>`;
  if (typeof m.link === 'string') h = `<a href="${esc(m.link)}" target="_blank" rel="noopener">${h}</a>`;
  return h;
}

function blockHtml(doc: FtxtDocument, b: Block): string {
  const sid = b.style ?? 'Normal';
  const { run, para } = resolve(doc, sid);
  const css = [
    `font-family:${family(run.font)}`,
    `font-size:${((run.size ?? 11) * PX).toFixed(2)}px`,
    `color:${run.color ?? '#1a1a1a'}`,
    `font-weight:${run.bold ? 700 : 400}`,
    `font-style:${run.italic ? 'italic' : 'normal'}`,
    `text-align:${para.align ?? 'left'}`,
    `line-height:${(para.lineSpacing ?? 1.15) * 1.2}`,
    `margin:${((para.spaceBefore ?? 0) * PX).toFixed(1)}px ${((para.indentRight ?? 0) * PX).toFixed(1)}px ${((para.spaceAfter ?? 8) * PX).toFixed(1)}px ${((para.indentLeft ?? 0) * PX).toFixed(1)}px`,
  ].join(';');
  const tag = sid === 'Title' || sid.startsWith('Heading') ? 'h2' : 'p';
  const inner = (b.content ?? []).map(runHtml).join('') || '&nbsp;';
  return `<${tag} class="ft-block ft-s-${esc(sid)}" style="${css}">${inner}</${tag}>`;
}

export class Reader {
  readonly root: HTMLElement;
  private readonly sheet: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = el('<div class="ft-reader" hidden><p class="ft-reader-note">Read-only for now: typing and formatting arrive with the editor in Phase 2.</p><article class="ft-page"></article></div>');
    this.sheet = this.root.querySelector('.ft-page') as HTMLElement;
    host.appendChild(this.root);
  }

  show(doc: FtxtDocument): void {
    const s = doc.sections[0];
    const m = s.margins;
    this.sheet.style.width = `${(s.page.width * PX).toFixed(0)}px`;
    this.sheet.style.minHeight = `${(s.page.height * PX).toFixed(0)}px`;
    this.sheet.style.padding = `${(m.top * PX).toFixed(0)}px ${(m.right * PX).toFixed(0)}px ${(m.bottom * PX).toFixed(0)}px ${(m.left * PX).toFixed(0)}px`;
    const tpl = (doc.settings as unknown as { template?: { layout?: string; accent?: string } }).template;
    this.sheet.dataset.layout = tpl?.layout ?? 'classic';
    this.sheet.style.setProperty('--doc-accent', tpl?.accent ?? '#f97316');
    const body = doc.tabs[0]?.body ?? [];
    setHtml(this.sheet, body.map((b) => blockHtml(doc, b)).join(''), `${doc.id}:${doc.meta.modified}`);
    this.root.scrollTop = 0;
  }
}
