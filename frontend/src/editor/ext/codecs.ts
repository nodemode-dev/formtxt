import type { AreaCodec, BlockCodec, InlineCodec, MarkCodec } from './types';
import { CODEC as refs } from './refs-codec';
import { CODEC as review } from './review-codec';
import { CODEC as versions } from './versions-codec';
import { CODEC as exchange } from './exchange-codec';
import { CODEC as print } from './print-codec';
import { CODEC as proofing } from './proofing-codec';
import { CODEC as ai } from './ai-codec';
import { CODEC as objects } from './objects-codec';
import { CODEC as collab } from './collab-codec';

const CODECS: AreaCodec[] = [refs, review, versions, exchange, print, proofing, ai, objects, collab];

export const INLINE_BY_TYPE: Record<string, InlineCodec> = Object.assign({}, ...CODECS.map((c) => c.inline));
export const BLOCK_BY_TYPE: Record<string, BlockCodec> = Object.assign({}, ...CODECS.map((c) => c.blocks));
export const MARK_BY_KEY: Record<string, MarkCodec> = Object.assign({}, ...CODECS.map((c) => c.marks));
export const INLINE_BY_NODE: Record<string, [string, InlineCodec]> = Object.fromEntries(Object.entries(INLINE_BY_TYPE).map(([t, c]) => [c.node, [t, c]]));
export const BLOCK_BY_NODE: Record<string, [string, BlockCodec]> = Object.fromEntries(Object.entries(BLOCK_BY_TYPE).map(([t, c]) => [c.node, [t, c]]));
export const MARK_BY_NAME: Record<string, [string, MarkCodec]> = Object.fromEntries(Object.entries(MARK_BY_KEY).map(([k, c]) => [c.mark, [k, c]]));
