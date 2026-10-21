import type { Block } from '../../../engine/model';

interface Run { type: 'text'; text: string; marks?: Record<string, unknown> }

const INLINE = /\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)(?<!\s)\*|`([^`]+)`|~~(.+?)~~|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

export function inlineRuns(text: string, base: Record<string, unknown> = {}): Run[] {
  const out: Run[] = [];
  let rest = text;
  const push = (t: string, marks: Record<string, unknown>): void => {
    if (!t) return;
    const run: Run = { type: 'text', text: t };
    if (Object.keys(marks).length) run.marks = marks;
    out.push(run);
  };
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { push(rest, base); break; }
    if (m.index) push(rest.slice(0, m.index), base);
    if (m[1] !== undefined) out.push(...inlineRuns(m[1], { ...base, bold: true }));
    else if (m[2] !== undefined) out.push(...inlineRuns(m[2], { ...base, bold: true }));
    else if (m[3] !== undefined) out.push(...inlineRuns(m[3], { ...base, italic: true }));
    else if (m[4] !== undefined) push(m[4], { ...base, code: true });
    else if (m[5] !== undefined) out.push(...inlineRuns(m[5], { ...base, strike: true }));
    else out.push(...inlineRuns(m[6], { ...base, link: m[7] }));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

function cells(line: string): string[] {
  let parts = line.trim().split(/(?<!\\)\|/);
  if (parts.length && !parts[0].trim()) parts = parts.slice(1);
  if (parts.length && !parts[parts.length - 1].trim()) parts = parts.slice(0, -1);
  return parts.map((p) => p.trim().replace(/\\\|/g, '|'));
}

const para = (style: string, content: Run[], extra: Record<string, unknown> = {}): Block => ({ type: 'paragraph', id: '', style, content, ...extra } as unknown as Block);

export interface MdOptions { title?: boolean }

export function parseMarkdown(md: string, opts: MdOptions = {}): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let buf: string[] = [];
  let titled = false;
  const flush = (): void => {
    if (buf.length) out.push(para('Normal', inlineRuns(buf.join(' ').trim())));
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      out.push({ type: 'code', id: '', text: code.join('\n') } as unknown as Block);
      continue;
    }
    if (!line) { flush(); continue; }
    if (line.startsWith('|') && line.split('|').length >= 3) {
      flush();
      const rows: string[][] = [];
      let head = false;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const c = cells(lines[i]);
        if (c.length && c.every((x) => /^:?-{2,}:?$/.test(x))) head = rows.length === 1;
        else rows.push(c);
        i++;
      }
      i--;
      const width = Math.max(1, ...rows.map((r) => r.length));
      out.push({
        type: 'table', id: '', look: 'grid', columns: Array(width).fill(0), repeatHeader: head,
        rows: rows.map((r, ri) => ({ cells: Array.from({ length: width }, (_, c) => ({ header: head && ri === 0 ? true : undefined, body: [para('Normal', inlineRuns(r[c] ?? ''))] })) })),
      } as unknown as Block);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const first = level === 1 && opts.title && !titled && out.length === 0;
      if (first) titled = true;
      out.push(para(first ? 'Title' : `Heading${level}`, inlineRuns(h[2].trim())));
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); continue; }
    if (line.startsWith('>')) { flush(); out.push(para('Quote', inlineRuns(line.replace(/^>\s?/, '')))); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (li) {
      flush();
      const level = Math.min(8, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
      const num = /\d/.test(li[2]);
      const chk = /^\[( |x|X)\]\s+(.*)$/.exec(li[3]);
      const list = chk ? { kind: 'check', level, checked: chk[1].toLowerCase() === 'x' } : { kind: num ? 'number' : 'bullet', level };
      out.push(para('Normal', inlineRuns((chk ? chk[2] : li[3]).trim()), { list }));
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

export function isPlain(blocks: Block[]): boolean {
  if (blocks.length !== 1) return false;
  const b = blocks[0] as unknown as { type: string; style?: string; list?: unknown };
  return b.type === 'paragraph' && b.style === 'Normal' && !b.list;
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\*\*|__|\*|`|~~)/g, '')
    .replace(/\[\d{1,2}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
