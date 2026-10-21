import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { DocEditor } from '../../editor';

const PX = 96 / 72;

export const semanticsKey = new PluginKey<{ doc: PMNode; decos: DecorationSet; key: string }>('proofing-semantics');

function inlineOnly(tr: Transaction): boolean {
  return tr.steps.every((s, i) => {
    if (s instanceof AddMarkStep || s instanceof RemoveMarkStep) return true;
    if (!(s instanceof ReplaceStep)) return false;
    const { from, to } = s as unknown as { from: number; to: number };
    const before = tr.docs[i];
    const a = before.resolve(from);
    return a.parent.isTextblock && a.sameParent(before.resolve(to)) && s.slice.content.content.every((n) => n.isInline) && s.slice.openStart === 0 && s.slice.openEnd === 0;
  });
}

function build(doc: PMNode, ed: DocEditor): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return node.type.name !== 'code_block';
    const end = pos + node.nodeSize;
    const heading = /^Heading([1-9])$/.exec(String(node.attrs.style ?? ''));
    if (heading) decos.push(Decoration.node(pos, end, { role: 'heading', 'aria-level': heading[1] }));
    if (node.attrs.dir === 'rtl') {
      const resolved = ed.doc ? ed.resolvedStyle(String(node.attrs.style || 'Normal')) : null;
      const base = String(node.attrs.align || (resolved?.para.align as string | undefined) || 'left');
      const css: string[] = [];
      if (!node.attrs.align && (base === 'left' || base === '')) css.push('text-align:right');
      const left = Number(node.attrs.indent) || 0;
      const right = Number(node.attrs.indentRight) || 0;
      if (left || right) css.push(`margin-left:${right * PX}px`, `margin-right:${left * PX}px`);
      if (css.length) decos.push(Decoration.node(pos, end, { style: css.join(';') }));
    }
    return false;
  });
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export function semanticsPlugin(ed: DocEditor): Plugin {
  return new Plugin({
    key: semanticsKey,
    state: {
      init: (_c, state) => ({ doc: state.doc, decos: build(state.doc, ed), key: '' }),
      apply(tr, value, _old, state) {
        if (!tr.docChanged && !tr.getMeta(semanticsKey)) return value;
        if (tr.docChanged && !tr.getMeta(semanticsKey) && inlineOnly(tr)) return { doc: state.doc, decos: value.decos.map(tr.mapping, tr.doc), key: '' };
        return { doc: state.doc, decos: build(state.doc, ed), key: '' };
      },
    },
    props: { decorations: (state) => semanticsKey.getState(state)?.decos ?? null },
  });
}
