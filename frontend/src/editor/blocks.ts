import { Fragment, Slice } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import type { Block } from '../engine/model';
import { api } from '../io/api';
import { DROPDOWN_PRESETS } from './chips';
import { blocksToNodes, fromPM } from './convert';
import { isoDate, schema } from './schema';

export interface BuildingBlock { id: string; name: string; category: string; description?: string; builtIn?: boolean; blocks: Block[] }

type Run = Record<string, unknown>;
const t = (text: string, marks?: Record<string, unknown>): Run => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const ph = (name: string): Run => ({ type: 'chip', kind: 'placeholder', name, text: name });
const today = (): Run => ({ type: 'chip', kind: 'date', date: isoDate(new Date()), format: 'short' });
const status = (opts = DROPDOWN_PRESETS[0].options, value = opts[0].label): Run => ({ type: 'chip', kind: 'dropdown', options: opts, value });
const para = (content: Run[], style = 'Normal', list?: { kind: string; level: number; checked?: boolean }): Block => ({ type: 'paragraph', style, content, ...(list ? { list } : {}) } as unknown as Block);
const cell = (content: Run[], header = false): Record<string, unknown> => ({ ...(header ? { header: true } : {}), body: [para(content)] });
const table = (rows: Run[][][], widthPt: number, header: boolean, look = 'grid', fractions?: number[]): Block => {
  const cols = rows[0].length;
  const f = fractions ?? Array.from({ length: cols }, () => 1 / cols);
  return { type: 'table', look, repeatHeader: header, columns: f.map((x) => Math.floor(widthPt * x)), rows: rows.map((r, i) => ({ cells: r.map((c) => cell(c, header && i === 0)) })) } as unknown as Block;
};

export function builtInBlocks(widthPt: number): BuildingBlock[] {
  const decision = [{ label: 'Proposed', color: '#f59e0b' }, { label: 'Accepted', color: '#22c55e' }, { label: 'Rejected', color: '#ef4444' }, { label: 'Superseded', color: '#9ca3af' }];
  return [
    { id: 'meeting-notes', name: 'Meeting notes', category: 'Built in', builtIn: true, description: 'Date, attendees, notes and a checklist of action items.', blocks: [
      para([today(), t(' '), ph('Meeting title')], 'Heading2'),
      para([t('Attendees: ', { bold: true }), ph('Attendees')]),
      para([t('Notes')], 'Heading3'),
      para([], 'Normal', { kind: 'bullet', level: 0 }),
      para([t('Action items')], 'Heading3'),
      para([ph('Action'), t(' '), ph('Owner')], 'Normal', { kind: 'check', level: 0, checked: false }),
    ] },
    { id: 'email-draft', name: 'Email draft', category: 'Built in', builtIn: true, description: 'To, Cc, Bcc and Subject lines above the message.', blocks: [
      table([[[t('To', { bold: true })], [ph('Recipients')]], [[t('Cc', { bold: true })], []], [[t('Bcc', { bold: true })], []], [[t('Subject', { bold: true })], [ph('Subject')]]], widthPt, false, 'rows', [0.18, 0.82]),
      para([ph('Message')]),
    ] },
    { id: 'project-tracker', name: 'Project tracker', category: 'Built in', builtIn: true, description: 'A table of tasks with owner, status and due date.', blocks: [
      table([[[t('Task')], [t('Owner')], [t('Status')], [t('Due')], [t('Notes')]], ...[1, 2, 3].map((): Run[][] => [[ph('Task')], [ph('Owner')], [status()], [today()], []])], widthPt, true, 'banded', [0.28, 0.18, 0.18, 0.16, 0.2]),
    ] },
    { id: 'decision-record', name: 'Decision record', category: 'Built in', builtIn: true, description: 'Status, date and owner, then context, options and the decision.', blocks: [
      para([t('Decision: '), ph('Title')], 'Heading2'),
      table([[[t('Status', { bold: true })], [status(decision)]], [[t('Date', { bold: true })], [today()]], [[t('Owner', { bold: true })], [ph('Owner')]]], widthPt, false, 'rows', [0.2, 0.8]),
      para([t('Context')], 'Heading3'), para([ph('What is the problem and why now')]),
      para([t('Options considered')], 'Heading3'), para([], 'Normal', { kind: 'number', level: 0 }),
      para([t('Decision')], 'Heading3'), para([ph('What we chose and why')]),
      para([t('Consequences')], 'Heading3'), para([], 'Normal', { kind: 'bullet', level: 0 }),
    ] },
  ];
}

let saved: BuildingBlock[] | null = null;

export async function savedBlocks(force = false): Promise<BuildingBlock[]> {
  if (saved && !force) return saved;
  const r = await api.get<{ blocks: BuildingBlock[] }>('/blocks');
  saved = r.blocks;
  return saved;
}

export async function allBlocks(widthPt: number): Promise<BuildingBlock[]> {
  let mine: BuildingBlock[] = [];
  try { mine = await savedBlocks(); } catch { mine = []; }
  return [...builtInBlocks(widthPt), ...mine];
}

export function insertBlock(b: BuildingBlock): Command {
  return (state, dispatch) => {
    const nodes = blocksToNodes(b.blocks);
    if (!nodes.length) return false;
    if (!dispatch) return true;
    const $from = state.selection.$from;
    const tr = state.tr;
    if ($from.parent.type === schema.nodes.paragraph && !$from.parent.content.size && $from.depth >= 1 && state.selection.empty) tr.replaceWith($from.before(), $from.after(), nodes);
    else tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function selectionBlocks(state: EditorState): Block[] {
  if (state.selection.empty) throw new Error('Select the content to save first.');
  const content = state.selection.content().content;
  let doc;
  try { doc = schema.nodes.doc.createChecked(null, content); } catch { throw new Error('Select whole paragraphs or a whole table to save as a building block.'); }
  return fromPM(doc, '').map(withoutIds);
}

function withoutIds(b: Block): Block {
  const { id: _id, section: _section, ...rest } = b as Block & { id?: string; section?: string };
  const out = rest as Record<string, unknown>;
  if (out.type === 'table' && Array.isArray(out.rows)) {
    out.rows = (out.rows as Array<{ cells?: Array<{ body?: Block[] }> }>).map((r) => ({ ...r, cells: (r.cells ?? []).map((c) => ({ ...c, body: (c.body ?? []).map(withoutIds) })) }));
  }
  return out as unknown as Block;
}

export async function saveBlock(state: EditorState, name: string, category = 'Saved'): Promise<BuildingBlock> {
  const blocks = selectionBlocks(state);
  const entry = await api.post<BuildingBlock>('/blocks', { name, category, blocks });
  saved = null;
  return entry;
}

export async function deleteBlock(id: string): Promise<void> {
  await api.del(`/blocks/${encodeURIComponent(id)}`);
  saved = null;
}
