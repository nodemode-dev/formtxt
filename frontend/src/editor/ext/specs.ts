import type { MarkSpec, NodeSpec } from 'prosemirror-model';
import type { AreaSpec, ParaAttr } from './types';
import { SPEC as refs } from './refs-spec';
import { SPEC as review } from './review-spec';
import { SPEC as versions } from './versions-spec';
import { SPEC as exchange } from './exchange-spec';
import { SPEC as print } from './print-spec';
import { SPEC as proofing } from './proofing-spec';
import { SPEC as ai } from './ai-spec';
import { SPEC as objects } from './objects-spec';
import { SPEC as collab } from './collab-spec';

const SPECS: AreaSpec[] = [refs, review, versions, exchange, print, proofing, ai, objects, collab];

export const EXT_NODES: Record<string, NodeSpec> = Object.assign({}, ...SPECS.map((s) => s.nodes));
export const EXT_MARKS: Record<string, MarkSpec> = Object.assign({}, ...SPECS.map((s) => s.marks));
export const EXT_PARA: Record<string, ParaAttr> = Object.assign({}, ...SPECS.map((s) => s.paraAttrs));
export const EXT_PARA_ATTRS: Record<string, { default: unknown }> = Object.fromEntries(Object.entries(EXT_PARA).map(([k, v]) => [k, { default: v.default }]));
