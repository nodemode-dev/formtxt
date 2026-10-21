import { setBlockType, splitBlockAs, toggleMark } from 'prosemirror-commands';
import type { MarkType, Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { schema } from './schema';

type ParaAttrs = Record<string, unknown>;

function eachPara(state: EditorState, fn: (node: PMNode, pos: number) => ParaAttrs | null): Transaction | null {
  const { from, to } = state.selection;
  const tr = state.tr;
  let changed = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type !== schema.nodes.paragraph) return true;
    const next = fn(node, pos);
    if (next) { tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next }); changed = true; }
    return false;
  });
  return changed ? tr : null;
}

const paraCommand = (fn: (node: PMNode) => ParaAttrs | null): Command => (state, dispatch) => {
  const tr = eachPara(state, fn);
  if (!tr) return false;
  dispatch?.(tr.scrollIntoView());
  return true;
};

export const mark = (name: string): Command => toggleMark(schema.marks[name]);

export function setMarkValue(type: MarkType, attrs: Record<string, unknown> | null): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) {
      if (dispatch) {
        const stored = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type !== type);
        dispatch(state.tr.setStoredMarks(attrs ? [...stored, type.create(attrs)] : stored));
      }
      return true;
    }
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, type);
      if (attrs) tr.addMark(from, to, type.create(attrs));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export const setStyle = (style: string): Command => paraCommand(() => ({ style }));
export const setAlign = (align: string): Command => paraCommand(() => ({ align: align === 'left' ? '' : align }));
export const setLineSpacing = (value: number | null): Command => paraCommand(() => ({ lineSpacing: value }));

export function toggleList(kind: string): Command {
  return (state, dispatch) => {
    const all: PMNode[] = [];
    state.doc.nodesBetween(state.selection.from, state.selection.to, (n) => { if (n.type === schema.nodes.paragraph) all.push(n); return n.type !== schema.nodes.paragraph; });
    const off = all.length > 0 && all.every((n) => n.attrs.list === kind);
    return paraCommand(() => ({ list: off ? '' : kind, checked: false }))(state, dispatch);
  };
}

export function shiftIndent(delta: 1 | -1): Command {
  return paraCommand((n) => {
    if (n.attrs.list) {
      const level = Math.max(0, Math.min(8, Number(n.attrs.level) + delta));
      return level === n.attrs.level ? null : { level };
    }
    const indent = Math.max(0, Number(n.attrs.indent) + delta * 36);
    return indent === n.attrs.indent ? null : { indent };
  });
}

export const toggleChecked: Command = paraCommand((n) => (n.attrs.list === 'check' ? { checked: !n.attrs.checked } : null));

export const clearFormatting: Command = (state, dispatch) => {
  const { from, to } = state.selection;
  if (dispatch) {
    const tr = state.tr;
    for (const t of Object.values(schema.marks)) if (t.name !== 'link') tr.removeMark(from, to, t);
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.paragraph) tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: 'Normal', align: '', indent: 0, spaceBefore: null, spaceAfter: null, lineSpacing: null });
      return node.type !== schema.nodes.paragraph;
    });
    dispatch(tr.setStoredMarks([]).scrollIntoView());
  }
  return true;
};

export function splitWithNextStyle(nextOf: (style: string) => string): Command {
  return (state, dispatch, view) => {
    const { $from, empty } = state.selection;
    const para = $from.parent;
    if (para.type !== schema.nodes.paragraph) return false;
    if (empty && para.attrs.list && para.content.size === 0) {
      dispatch?.(state.tr.setNodeMarkup($from.before(), undefined, { ...para.attrs, list: '', level: 0, checked: false }));
      return true;
    }
    const atEnd = $from.parentOffset === para.content.size;
    return splitBlockAs((node) => ({
      type: schema.nodes.paragraph,
      attrs: { ...node.attrs, id: null, checked: false, style: atEnd && !node.attrs.list ? nextOf(String(node.attrs.style)) : node.attrs.style },
    }))(state, dispatch, view);
  };
}

export const insertPageBreak: Command = (state, dispatch) => {
  if (dispatch) {
    const tr = state.tr.replaceSelectionWith(schema.nodes.page_break.create());
    const after = tr.selection.$to.after();
    if (after >= tr.doc.content.size || tr.doc.resolve(after).nodeAfter === null) tr.insert(tr.doc.content.size, schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, tr.selection.to + 1)))).scrollIntoView());
  }
  return true;
};

export const toggleCodeBlock: Command = (state, dispatch) => {
  const inCode = state.selection.$from.parent.type === schema.nodes.code_block;
  return inCode ? setBlockType(schema.nodes.paragraph, { style: 'Normal' })(state, dispatch) : setBlockType(schema.nodes.code_block)(state, dispatch);
};

export function setLink(href: string | null): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;
    if (dispatch) {
      const tr = state.tr.removeMark(from, to, schema.marks.link);
      if (href) tr.addMark(from, to, schema.marks.link.create({ href }));
      dispatch(tr);
    }
    return true;
  };
}
