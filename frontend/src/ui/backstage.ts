import { FORMATS } from '../editor/ext/exchange/transfer';
import type { DocSummary, FtxtDocument } from '../engine/model';
import { api } from '../io/api';
import { el, escapeHtml, setDisabled, setText } from './dom';
import { icon } from './icons';
import { HOME_ICONS } from './icons-home';
import { shellCommands } from './shell/cmd';
import { toast } from './toast';

export function hicon(name: string, size = 16): string {
  const svg = HOME_ICONS[name];
  return svg ? `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>` : icon(name, size);
}

export interface BackstageDeps {
  hasDocument(): boolean;
  current(): { id: string; title: string } | null;
  summary(id: string): DocSummary | undefined;
  leave(): void;
  show(page: string): void;
}

interface Action { icon: string; title: string; desc: string; cmd?: string; params?: Record<string, unknown>; page?: string; stay?: boolean }

const card = (a: Action): string => {
  const attrs = a.page ? `data-bs-page="${a.page}"` : `data-bs="${a.cmd}"${a.params ? ` data-p='${escapeHtml(JSON.stringify(a.params))}'` : ''}${a.stay ? ' data-stay' : ''}`;
  return `<button class="ft-bs-card" type="button" ${attrs}><span class="ft-bs-card-icon">${hicon(a.icon, 20)}</span><span class="ft-bs-card-text"><span class="ft-bs-card-title">${escapeHtml(a.title)}</span><span class="ft-bs-card-desc">${escapeHtml(a.desc)}</span></span></button>`;
};

const head = (title: string, sub: string): string => `<div class="ft-home-head"><div><h1 class="ft-home-title">${title}</h1><p class="ft-home-sub">${sub}</p></div></div>`;
const section = (title: string, body: string): string => `<section class="ft-home-section ft-bs-section"><div class="ft-home-section-head"><h2 class="ft-home-section-title">${title}</h2></div><div class="ft-bs-cards">${body}</div></section>`;
const nodoc = '<p class="ft-note ft-bs-nodoc" hidden>Open a document to use this page.</p>';

const SAVE_ICON: Record<string, string> = { docx: 'document', dotx: 'template', odt: 'document', rtf: 'fileText', txt: 'fileText', html: 'globe', md: 'fileText', epub: 'template' };

export function backstageMarkup(): string {
  const formats = FORMATS.map((f) => card({ icon: SAVE_ICON[f.id] ?? 'document', title: f.label, desc: `Download a copy as ${f.ext}`, cmd: 'exchange.download', params: { format: f.id }, stay: true })).join('');
  return `<div data-page="info" hidden>${head('Info', 'Properties, protection and history of this document.')}${nodoc}
<div class="ft-bs-info"><div class="ft-bs-info-main">
<div class="ft-bs-doc"><span class="ft-bs-doc-icon">${icon('document', 28)}</span><div class="ft-bs-doc-text"><div class="ft-bs-doc-title" data-ref="title"></div><div class="ft-bs-doc-meta" data-ref="meta"></div></div></div>
${section('Protect', card({ icon: 'lock', title: 'Password', desc: 'Encrypt this document on this computer', cmd: 'password.set' }) + card({ icon: 'key', title: 'Remove password', desc: 'Decrypt the document', cmd: 'password.remove' }) + card({ icon: 'shield', title: 'Restrict editing', desc: 'Read only, comments, tracked changes or forms', cmd: 'protect.dialog' }))}
${section('Inspect', card({ icon: 'access', title: 'Check accessibility', desc: 'Find what a screen reader or reader would miss', cmd: 'access.check' }) + card({ icon: 'access', title: 'Accessibility panel', desc: 'Review and fix each issue', cmd: 'access.panel' }) + card({ icon: 'fileText', title: 'Document statistics', desc: 'Words, characters, pages and reading time', cmd: 'tools.stats' }))}
${section('Versions', card({ icon: 'versions', title: 'Version history', desc: 'Browse, name, compare and restore earlier versions', cmd: 'versions.panel' }) + card({ icon: 'clock', title: 'Recover unsaved changes', desc: 'Bring back work from an earlier session', cmd: 'file.recover' }))}
</div><aside class="ft-bs-props"><div class="ft-bs-props-head"><h2 class="ft-home-section-title">Properties</h2></div><dl class="ft-bs-facts" data-ref="facts"></dl><button class="ft-btn" type="button" data-bs="file.properties">${hicon('edit', 14)}Edit properties</button></aside></div></div>
<div data-page="save" hidden>${head('Save a Copy', 'Download this document in another format. The original stays in your library.')}${nodoc}${section('Formats', formats + card({ icon: 'pdf', title: 'PDF', desc: 'A tagged PDF with the page layout kept', cmd: 'print.exportPdf', stay: true }))}</div>
<div data-page="print" hidden>${head('Print', 'Print the document or save it as a PDF.')}${nodoc}${section('Print', card({ icon: 'print', title: 'Print', desc: 'Choose pages, copies and a printer in the preview', cmd: 'print.open' }) + card({ icon: 'print', title: 'Print now', desc: 'Send every page without the preview', cmd: 'print.run', params: { range: 'all' } }) + card({ icon: 'pdf', title: 'Export to PDF', desc: 'Save a tagged PDF', cmd: 'print.exportPdf', stay: true }) + card({ icon: 'pageSetup', title: 'Page setup', desc: 'Paper size, orientation and margins', cmd: 'layout.pageSetup' }))}</div>
<div data-page="share" hidden>${head('Share', 'Send a link or a copy. Links work on your own network when you allow it.')}${nodoc}${section('Share', card({ icon: 'share', title: 'Share', desc: 'Create view, comment or edit links', cmd: 'collab.share' }) + card({ icon: 'mail', title: 'Email a link', desc: 'Open your mail app with a link', cmd: 'collab.emailLink', params: { mode: 'view' } }) + card({ icon: 'mail', title: 'Send a copy', desc: 'Attach a copy to a new message', cmd: 'collab.sendCopy' }) + card({ icon: 'globe', title: 'Publish to the web', desc: 'Make a read-only page', cmd: 'collab.publish.open' }))}</div>
<div data-page="export" hidden>${head('Export', 'Make a PDF, a web page or a file in another format.')}${nodoc}${section('Export', card({ icon: 'pdf', title: 'Create a PDF', desc: 'A tagged PDF for sharing and printing', cmd: 'print.exportPdf', stay: true }) + card({ icon: 'globe', title: 'Save as a web page', desc: 'Download a self-contained page', cmd: 'collab.publish.save', params: { download: true }, stay: true }) + card({ icon: 'saveCopy', title: 'Change the file type', desc: 'Word, OpenDocument, RTF, HTML, Markdown, text or EPUB', page: 'save' }) + card({ icon: 'document', title: 'Convert to the current format', desc: 'Leave Compatibility Mode', cmd: 'exchange.convertCompat' }))}</div>
<div data-page="account" hidden>${head('Account', 'FormTxt keeps everything on this computer.')}
<section class="ft-home-section ft-bs-section"><div class="ft-bs-account"><span class="ft-bs-doc-icon">${hicon('user', 28)}</span><div class="ft-bs-doc-text"><div class="ft-bs-doc-title">Local only</div><div class="ft-bs-doc-meta">No sign-in, no cloud account. Documents, templates and settings stay in your FormTxt folder.</div></div></div>
<label class="ft-field ft-bs-author"><span class="ft-field-label">Author name for new documents</span><input class="ft-input" type="text" data-ref="author" spellcheck="false" placeholder="Your name"></label><div class="ft-bs-author-actions"><button class="ft-btn cta" type="button" data-bs-save-author>Save name</button></div></section></div>`;
}

export class Backstage {
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly facts: HTMLElement;
  private readonly author: HTMLInputElement;
  private run = 0;

  constructor(private readonly root: HTMLElement, private readonly deps: BackstageDeps) {
    this.title = root.querySelector('[data-ref="title"]') as HTMLElement;
    this.meta = root.querySelector('[data-ref="meta"]') as HTMLElement;
    this.facts = root.querySelector('[data-ref="facts"]') as HTMLElement;
    this.author = root.querySelector('[data-ref="author"]') as HTMLInputElement;
    for (const k of ['Title', 'Author', 'Words', 'Size', 'Modified', 'Created']) {
      const dt = el('<dt></dt>'), dd = el(`<dd data-k="${k}"></dd>`);
      setText(dt, k);
      this.facts.append(dt, dd);
    }
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const page = (t.closest('[data-bs-page]') as HTMLElement | null)?.dataset.bsPage;
      if (page) { this.deps.show(page); return; }
      if (t.closest('[data-bs-save-author]')) { this.saveAuthor(); return; }
      const b = t.closest('[data-bs]') as HTMLElement | null;
      if (!b || (b as HTMLButtonElement).disabled) return;
      let params: Record<string, unknown> | undefined;
      try { params = b.dataset.p ? (JSON.parse(b.dataset.p) as Record<string, unknown>) : undefined; } catch { params = undefined; }
      this.exec(b.dataset.bs as string, params, b.hasAttribute('data-stay'));
    });
  }

  exec(id: string, params?: Record<string, unknown>, stay = false): void {
    if (!stay) this.deps.leave();
    void Promise.resolve(shellCommands.call(id, params)).then((r) => { if (!r.ran) toast('That is not available right now.', 'error'); }).catch((err: Error) => toast(err.message, 'error'));
  }

  private saveAuthor(): void {
    const name = this.author.value.trim();
    void api.post('/settings', { author: name }).then(() => toast('Author name saved.')).catch((err: Error) => toast(`Could not save: ${err.message}`, 'error'));
  }

  refresh(): void {
    const has = this.deps.hasDocument();
    for (const n of Array.from(this.root.querySelectorAll<HTMLElement>('.ft-bs-nodoc'))) n.hidden = has;
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-bs]'))) setDisabled(b, !has || !shellCommands.has(b.dataset.bs as string));
    const cur = this.deps.current();
    const sum = cur ? this.deps.summary(cur.id) : undefined;
    const fact = (k: string, v: string): void => setText(this.facts.querySelector(`[data-k="${k}"]`), v);
    const when = (s?: number): string => (s ? new Date(s * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
    const size = (n?: number): string => (!n ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    setText(this.title, cur?.title ?? '');
    setText(this.meta, sum ? `${sum.words} word${sum.words === 1 ? '' : 's'} · Saved ${when(sum.modified)}` : '');
    fact('Title', cur?.title ?? '');
    fact('Words', sum ? String(sum.words) : '');
    fact('Size', size(sum?.bytes));
    fact('Modified', when(sum?.modified));
    fact('Created', when(sum?.created));
    const run = ++this.run;
    if (cur) {
      void api.get<FtxtDocument>(`/documents/${encodeURIComponent(cur.id)}`).then((d) => { if (run === this.run) fact('Author', d.meta.author || 'Not set'); }).catch(() => { if (run === this.run) fact('Author', ''); });
    } else fact('Author', '');
    void api.get<Record<string, unknown>>('/settings').then((s) => { if (document.activeElement !== this.author) this.author.value = String(s.author ?? ''); }).catch(() => undefined);
  }
}
