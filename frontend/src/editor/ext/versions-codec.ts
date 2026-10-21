import type { Mark, Node as PMNode, Schema } from 'prosemirror-model';
import { type AreaCodec, emptyCodec } from './types';
import { CONTROL_KINDS, defaultPlaceholder } from './versions-spec';

const FLAGS = ['bold', 'italic', 'strike', 'superscript', 'subscript', 'smallCaps', 'allCaps', 'code'];

export function marksOut(marks: readonly Mark[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const m of marks) {
    const n = m.type.name;
    if (FLAGS.includes(n)) out[n] = true;
    else if (n === 'underline') out.underline = m.attrs.style === 'single' ? true : m.attrs.style;
    else if (n === 'font') out.font = m.attrs.family;
    else if (n === 'size') out.size = m.attrs.pt;
    else if (n === 'color') out.color = m.attrs.value;
    else if (n === 'highlight') out.highlight = m.attrs.value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function marksIn(m: Record<string, unknown> | undefined, schema: Schema): Mark[] {
  const out: Mark[] = [];
  if (!m) return out;
  for (const k of FLAGS) if (m[k] && schema.marks[k]) out.push(schema.marks[k].create());
  if (m.underline && schema.marks.underline) out.push(schema.marks.underline.create({ style: typeof m.underline === 'string' ? m.underline : 'single' }));
  if (typeof m.font === 'string' && m.font) out.push(schema.marks.font.create({ family: m.font }));
  if (typeof m.size === 'number' && m.size > 0) out.push(schema.marks.size.create({ pt: m.size }));
  if (typeof m.color === 'string' && m.color) out.push(schema.marks.color.create({ value: m.color }));
  if (typeof m.highlight === 'string' && m.highlight) out.push(schema.marks.highlight.create({ value: m.highlight }));
  return out;
}

const str = (v: unknown, max = 200): string => String(v ?? '').slice(0, max);

export const CODEC: AreaCodec = {
  ...emptyCodec(),
  inline: {
    control: {
      node: 'content_control',
      toPM(run, schema) {
        const kind = (CONTROL_KINDS as readonly string[]).includes(str(run.kind)) ? str(run.kind) : 'text';
        const options = Array.isArray(run.options) ? run.options.map((o) => str(o, 80)).slice(0, 60) : [];
        const attrs = { kind, title: str(run.title, 80), tag: str(run.tag, 60), placeholder: str(run.placeholder, 120), options, format: str(run.format, 40), checked: !!run.checked, empty: false };
        const parts: PMNode[] = [];
        if (kind !== 'checkbox') {
          const runs = Array.isArray(run.content) ? (run.content as Array<Record<string, unknown>>) : null;
          if (runs) for (const r of runs) { if (r.type === 'text' && r.text) parts.push(schema.text(str(r.text, 20000), marksIn(r.marks as Record<string, unknown> | undefined, schema))); }
          else if (run.text) parts.push(schema.text(str(run.text, 20000)));
          if (!parts.length) { parts.push(schema.text(attrs.placeholder || defaultPlaceholder(kind))); attrs.empty = true; }
        }
        return schema.nodes.content_control.create(attrs, parts);
      },
      fromPM(node) {
        const a = node.attrs;
        const out: Record<string, unknown> = { kind: a.kind, title: a.title, text: a.empty ? '' : node.textContent };
        if (a.tag) out.tag = a.tag;
        if (a.placeholder) out.placeholder = a.placeholder;
        if (a.kind === 'dropdown' && (a.options as string[]).length) out.options = a.options;
        if (a.kind === 'date' && a.format) out.format = a.format;
        if (a.kind === 'checkbox') out.checked = !!a.checked;
        const runs: Array<Record<string, unknown>> = [];
        let styled = false;
        if (!a.empty) node.forEach((c) => { const marks = marksOut(c.marks); if (marks) styled = true; runs.push(marks ? { type: 'text', text: c.text ?? '', marks } : { type: 'text', text: c.text ?? '' }); });
        if (styled) out.content = runs;
        return out;
      },
    },
    mergefield: {
      node: 'merge_field',
      toPM(run, schema) {
        const name = str(run.name, 80);
        if (!name) return null;
        return schema.nodes.merge_field.create({ name }, null, marksIn(run.marks as Record<string, unknown> | undefined, schema));
      },
      fromPM(node) {
        const marks = marksOut(node.marks);
        return marks ? { name: node.attrs.name, marks } : { name: node.attrs.name };
      },
    },
  },
  blocks: {
    signatureLine: {
      node: 'signature_line',
      toPM(block, schema) {
        return schema.nodes.signature_line.create({ id: str(block.id, 40) || `sig_${Math.random().toString(36).slice(2, 10)}`, signer: str(block.signer, 120), title: str(block.title, 120), instructions: str(block.instructions, 300) });
      },
      fromPM(node) {
        const a = node.attrs;
        const out: Record<string, unknown> = { id: a.id, signer: a.signer };
        if (a.title) out.title = a.title;
        if (a.instructions) out.instructions = a.instructions;
        return out;
      },
    },
  },
};
