import { InputRule, inputRules, textblockTypeInputRule } from 'prosemirror-inputrules';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { schema } from './schema';

function newId(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return 'p_' + Array.from(a, (b) => (b % 36).toString(36)).join('');
}

export const uniqueIds = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some((t) => t.docChanged)) return null;
    const seen = new Set<string>();
    const tr = state.tr;
    let changed = false;
    state.doc.forEach((node, pos) => {
      if (node.type !== schema.nodes.paragraph && node.type !== schema.nodes.code_block) return;
      const id = node.attrs.id as string | null;
      if (!id || seen.has(id)) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, id: newId() }); changed = true; }
      else seen.add(id);
    });
    return changed ? tr.setMeta('addToHistory', false) : null;
  },
});

const para = (attrs: Record<string, unknown>) => (state: EditorState, _m: RegExpMatchArray, start: number, end: number) => {
  const $s = state.doc.resolve(start);
  const node = $s.parent;
  if (node.type !== schema.nodes.paragraph) return null;
  return state.tr.delete(start, end).setNodeMarkup($s.before(), undefined, { ...node.attrs, ...attrs });
};

export const rules = inputRules({
  rules: [
    ...[1, 2, 3, 4, 5, 6].map((level) => new InputRule(new RegExp(`^#{${level}}\\s$`), para({ style: `Heading${level}` }))),
    new InputRule(/^[-*]\s$/, para({ list: 'bullet', level: 0 })),
    new InputRule(/^1[.)]\s$/, para({ list: 'number', level: 0 })),
    new InputRule(/^\[( |x)?\]\s$/, para({ list: 'check', level: 0, checked: false })),
    new InputRule(/^>\s$/, para({ style: 'Quote' })),
    textblockTypeInputRule(/^```$/, schema.nodes.code_block),
  ],
});

function headingLevel(node: { attrs: Record<string, unknown> }): number {
  const m = /^Heading([1-9])$/.exec(String(node.attrs.style ?? ''));
  return m ? Number(m[1]) : 0;
}

export const collapsePlugin = new Plugin({
  props: {
    decorations(state) {
      const decos: Decoration[] = [];
      let hideBelow = 0;
      state.doc.forEach((node, pos) => {
        const level = headingLevel(node);
        if (hideBelow && level && level <= hideBelow) hideBelow = 0;
        if (hideBelow) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ft-folded' }));
        else if (level && node.attrs.collapsed) hideBelow = level;
      });
      return decos.length ? DecorationSet.create(state.doc, decos) : null;
    },
  },
});

export interface FindState {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  matches: Array<{ from: number; to: number }>;
  current: number;
  error: string;
}

export const findKey = new PluginKey<FindState>('find');

export function findMatches(doc: EditorState['doc'], query: string, regex: boolean, caseSensitive: boolean): { matches: Array<{ from: number; to: number }>; error: string } {
  const out: Array<{ from: number; to: number }> = [];
  if (!query) return { matches: out, error: '' };
  let re: RegExp;
  try {
    re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return { matches: out, error: (e as Error).message };
  }
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map: number[] = [];
    node.forEach((child, offset) => {
      const t = child.isText ? child.text ?? '' : '\n';
      for (let i = 0; i < t.length; i++) map.push(pos + 1 + offset + i);
      text += t;
    });
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && out.length < 5000) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push({ from: map[m.index], to: map[m.index + m[0].length - 1] + 1 });
    }
    return false;
  });
  return { matches: out, error: '' };
}

export const findPlugin = new Plugin<FindState>({
  key: findKey,
  state: {
    init: () => ({ query: '', regex: false, caseSensitive: false, matches: [], current: -1, error: '' }),
    apply(tr, value, _old, state) {
      const meta = tr.getMeta(findKey) as Partial<FindState> | undefined;
      if (!meta && !tr.docChanged) return value;
      const next = { ...value, ...(meta ?? {}) };
      const found = findMatches(state.doc, next.query, next.regex, next.caseSensitive);
      const current = found.matches.length ? Math.min(Math.max(next.current, 0), found.matches.length - 1) : -1;
      return { ...next, matches: found.matches, error: found.error, current };
    },
  },
  props: {
    decorations(state) {
      const f = findKey.getState(state);
      if (!f || !f.matches.length) return null;
      return DecorationSet.create(state.doc, f.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === f.current ? 'ft-find-hit is-current' : 'ft-find-hit' })));
    },
  },
});
