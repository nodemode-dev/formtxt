import type { Mark, MarkSpec, Node as PMNode, NodeSpec, Schema } from 'prosemirror-model';
import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';

export interface ParaAttr {
  default: unknown;
  dom?: (value: unknown) => Record<string, string> | null;
}

export interface AreaSpec {
  nodes: Record<string, NodeSpec>;
  marks: Record<string, MarkSpec>;
  paraAttrs: Record<string, ParaAttr>;
}

export interface InlineCodec {
  node: string;
  toPM(run: Record<string, unknown>, schema: Schema): PMNode | null;
  fromPM(node: PMNode): Record<string, unknown>;
}

export interface BlockCodec {
  node: string;
  toPM(block: Record<string, unknown>, schema: Schema, top: boolean): PMNode | null;
  fromPM(node: PMNode, section: string): Record<string, unknown>;
}

export interface MarkCodec {
  mark: string;
  toPM(value: unknown, schema: Schema): Mark | null;
  fromPM(mark: Mark): unknown;
}

export interface AreaCodec {
  inline: Record<string, InlineCodec>;
  blocks: Record<string, BlockCodec>;
  marks: Record<string, MarkCodec>;
}

export type AreaRegister = (reg: CommandRegistry, ed: DocEditor) => void;

export const emptySpec = (): AreaSpec => ({ nodes: {}, marks: {}, paraAttrs: {} });
export const emptyCodec = (): AreaCodec => ({ inline: {}, blocks: {}, marks: {} });
