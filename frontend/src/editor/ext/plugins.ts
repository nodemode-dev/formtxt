import type { Plugin } from 'prosemirror-state';
import type { NodeViewConstructor } from 'prosemirror-view';

export const EXT_PLUGINS: Plugin[] = [];
export const EXT_NODE_VIEWS: Record<string, NodeViewConstructor> = {};
export const EXT_LOADED: Array<() => void> = [];

export function addPlugin(plugin: Plugin): void {
  EXT_PLUGINS.push(plugin);
}

export function addNodeView(node: string, view: NodeViewConstructor): void {
  EXT_NODE_VIEWS[node] = view;
}

export function onDocumentLoaded(fn: () => void): void {
  EXT_LOADED.push(fn);
}
