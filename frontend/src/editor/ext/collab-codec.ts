import type { Node as PMNode } from 'prosemirror-model';
import type { Block } from '../../engine/model';
import { blocksToNodes, fromPM } from '../convert';
import { type AreaCodec, emptyCodec } from './types';

const ALLOWED = new Set(['paragraph', 'code_block', 'table']);

const newId = (): string => 'k_' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');

export const CODEC: AreaCodec = {
  ...emptyCodec(),
  blocks: {
    component: {
      node: 'component',
      toPM(block, schema, top) {
        if (!top) return null;
        const nodes = blocksToNodes((block.content as Block[] | undefined) ?? []).filter((n: PMNode) => ALLOWED.has(n.type.name));
        if (!nodes.length) return null;
        return schema.nodes.component.create({ cid: String(block.component ?? ''), name: String(block.name ?? ''), rev: Number(block.rev) || 0, src: String(block.source ?? '') }, nodes);
      },
      fromPM(node, section) {
        const out: Record<string, unknown> = { id: newId(), component: node.attrs.cid, name: node.attrs.name, rev: node.attrs.rev, content: fromPM(node, section) };
        if (node.attrs.src) out.source = node.attrs.src;
        return out;
      },
    },
  },
};
