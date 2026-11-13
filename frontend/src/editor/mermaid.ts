import type { Node as PMNode } from 'prosemirror-model';
import type { NodeView, EditorView } from 'prosemirror-view';
import { NodeSelection, type Transaction } from 'prosemirror-state';

const PX = 96 / 72;

export const MERMAID_SAMPLES: Array<{ id: string; label: string; code: string }> = [
  { id: 'flowchart', label: 'Flowchart', code: 'flowchart LR\n  A[Idea] --> B{Approved?}\n  B -- Yes --> C[Build]\n  B -- No --> D[Revise]\n  D --> A' },
  { id: 'sequence', label: 'Sequence', code: 'sequenceDiagram\n  participant Client\n  participant Server\n  Client->>Server: Request\n  Server-->>Client: Response' },
  { id: 'gantt', label: 'Gantt', code: 'gantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Design\n  Research :a1, 2026-11-02, 5d\n  Drafts :after a1, 4d\n  section Build\n  First release :2026-11-12, 8d' },
  { id: 'class', label: 'Class', code: 'classDiagram\n  class Document {\n    +title\n    +save()\n  }\n  class Page\n  Document "1" --> "*" Page' },
  { id: 'state', label: 'State', code: 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Review\n  Review --> Draft: changes\n  Review --> Published\n  Published --> [*]' },
  { id: 'er', label: 'Entity relationship', code: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains' },
  { id: 'pie', label: 'Pie', code: 'pie title Time spent\n  "Writing" : 45\n  "Review" : 30\n  "Meetings" : 25' },
  { id: 'mindmap', label: 'Mind map', code: 'mindmap\n  root((Launch))\n    Product\n      Docs\n      Pricing\n    Marketing\n      Blog\n      Events' },
  { id: 'timeline', label: 'Timeline', code: 'timeline\n  title Roadmap\n  Q1 : Research\n  Q2 : Beta\n  Q3 : Launch' },
];

type MermaidApi = { initialize: (c: Record<string, unknown>) => void; parse: (code: string) => Promise<unknown>; render: (id: string, code: string) => Promise<{ svg: string }> };
let api: Promise<MermaidApi> | null = null;
let seq = 0;
let queue: Promise<unknown> = Promise.resolve();

function load(): Promise<MermaidApi> {
  if (!api) {
    api = import('mermaid').then((m) => {
      const mm = (m.default ?? m) as unknown as MermaidApi;
      mm.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Inter, system-ui, sans-serif', htmlLabels: false, markdownAutoWrap: false, flowchart: { htmlLabels: false }, class: { htmlLabels: false }, state: { htmlLabels: false } });
      return mm;
    });
  }
  return api;
}

export function sanitizeSvg(svg: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  for (const bad of Array.from(root.querySelectorAll('script, iframe, object, embed, foreignObject, animate, set, handler, listener'))) bad.remove();
  const risky = /@import|url\s*\((?!\s*['"]?\s*#)|image-set\s*\(|expression\s*\(|javascript:/;
  for (const st of Array.from(root.querySelectorAll('style'))) { const t = (st.textContent ?? '').toLowerCase(); if (risky.test(t) || t.includes('\\')) st.remove(); }
  for (const n of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const at of Array.from(n.attributes)) {
      const name = at.name.toLowerCase();
      const v = at.value.trim().toLowerCase();
      if (name.startsWith('on')) n.removeAttribute(at.name);
      else if ((name === 'href' || name === 'xlink:href' || name === 'src') && !v.startsWith('#') && !v.startsWith('data:image/')) n.removeAttribute(at.name);
      else if (risky.test(v) || (name === 'style' && v.includes('\\'))) n.removeAttribute(at.name);
    }
  }
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

export function svgSize(svg: string): { w: number; h: number } {
  const m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  return m ? { w: Math.round(Number(m[1])), h: Math.round(Number(m[2])) } : { w: 400, h: 240 };
}

export async function renderMermaid(code: string): Promise<{ ok: true; svg: string; w: number; h: number } | { ok: false; error: string }> {
  const src = code.trim();
  if (!src) return { ok: false, error: 'Type a diagram, such as flowchart LR then A --> B.' };
  const run = queue.then(async () => {
    const mm = await load();
    try { await mm.parse(src); } catch (e) { return { ok: false as const, error: String((e as Error)?.message ?? e).split('\n').slice(0, 3).join(' ') }; }
    try {
      const { svg } = await mm.render(`ftmm${++seq}`, src);
      const clean = sanitizeSvg(svg);
      if (!clean) return { ok: false as const, error: 'The diagram could not be drawn.' };
      const out = new XMLSerializer().serializeToString(clean);
      return { ok: true as const, svg: out, ...svgSize(out) };
    } catch (e) { return { ok: false as const, error: String((e as Error)?.message ?? e).split('\n')[0] }; }
    finally { for (const stray of Array.from(document.querySelectorAll('body > [id^="dftmm"], body > #dmermaid'))) stray.remove(); }
  });
  queue = run.catch(() => undefined);
  return run;
}

export function placeBlock(tr: Transaction, node: PMNode): Transaction {
  const sel = tr.selection;
  if (sel instanceof NodeSelection && sel.node.isBlock) return tr.insert(sel.to, node);
  return tr.replaceSelectionWith(node);
}

export function mermaidWidth(attrs: Record<string, unknown>, bodyPt: number): number {
  const natural = Number(attrs.w) / PX || 300;
  const want = Number(attrs.width) > 0 ? Number(attrs.width) : natural;
  return Math.max(72, Math.min(bodyPt, want));
}

export class MermaidView implements NodeView {
  dom: HTMLElement;
  private readonly box: HTMLElement;
  private readonly note: HTMLElement;
  private shown = '';
  private pending = '';

  constructor(private node: PMNode, private readonly view: EditorView, private readonly getPos: () => number | undefined, private readonly bodyPt: () => number) {
    this.dom = document.createElement('figure');
    this.dom.className = 'ft-mermaid';
    this.dom.setAttribute('contenteditable', 'false');
    this.box = this.dom.appendChild(document.createElement('div'));
    this.box.className = 'ft-mermaid-box';
    this.box.setAttribute('role', 'img');
    this.note = this.dom.appendChild(document.createElement('div'));
    this.note.className = 'ft-mermaid-note';
    this.apply();
  }

  private apply(): void {
    const a = this.node.attrs as Record<string, unknown>;
    const align = String(a.align || 'center');
    if (this.dom.dataset.align !== align) this.dom.dataset.align = align;
    const wPt = mermaidWidth(a, this.bodyPt());
    const ratio = Number(a.h) > 0 && Number(a.w) > 0 ? Number(a.h) / Number(a.w) : 0.6;
    const w = `${(wPt * PX).toFixed(0)}px`, h = `${(wPt * PX * ratio).toFixed(0)}px`;
    if (this.box.style.width !== w) this.box.style.width = w;
    if (this.box.style.height !== h) this.box.style.height = h;
    const label = String(a.alt || '') || `Diagram: ${String(a.code).split('\n')[0]}`;
    if (this.box.getAttribute('aria-label') !== label) this.box.setAttribute('aria-label', label);
    const err = String(a.error || '');
    if (this.note.textContent !== err) this.note.textContent = err;
    this.dom.classList.toggle('has-error', !!err);
    const svg = String(a.svg || '');
    if (svg && svg !== this.shown) {
      const el = sanitizeSvg(svg);
      if (el) {
        el.removeAttribute('width'); el.removeAttribute('height'); el.removeAttribute('style');
        el.setAttribute('width', '100%'); el.setAttribute('height', '100%');
        el.setAttribute('aria-hidden', 'true');
        this.box.replaceChildren(el);
        this.shown = svg;
      }
    }
    if (!svg && a.code && this.pending !== a.code) this.refresh(String(a.code));
  }

  private refresh(code: string): void {
    this.pending = code;
    void renderMermaid(code).then((r) => {
      const pos = this.getPos();
      if (pos === undefined || this.pending !== code) return;
      const cur = this.view.state.doc.nodeAt(pos);
      if (!cur || cur.type.name !== 'mermaid' || cur.attrs.code !== code) return;
      const patch = r.ok ? { svg: r.svg, w: r.w, h: r.h, error: '' } : { error: r.error };
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...patch }).setMeta('addToHistory', false));
    });
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.apply();
    return true;
  }

  selectNode(): void { this.dom.classList.add('is-selected'); }
  deselectNode(): void { this.dom.classList.remove('is-selected'); }
  stopEvent(): boolean { return false; }
  ignoreMutation(): boolean { return true; }
}
