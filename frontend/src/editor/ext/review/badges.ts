import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { allComments, commentRanges, view } from './core';
import { REACTIONS } from './icons';
import { commands } from '../../../engine/registry';
import { panelOpen } from '../ui';

export const badgeKey = new PluginKey<number>('review-badges');
let cache: { doc: PMNode | null; version: number; set: DecorationSet } = { doc: null, version: -1, set: DecorationSet.empty };

function badge(counts: Array<[string, number, string]>, id: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'rv-badge';
  el.contentEditable = 'false';
  el.dataset.comment = id;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', counts.map(([k, n, who]) => `${REACTIONS[k]?.label ?? k} ${n}: ${who}`).join(', '));
  el.title = counts.map(([k, n, who]) => `${REACTIONS[k]?.label ?? k} ${n}: ${who}`).join('\n');
  for (const [k, n] of counts) {
    const item = document.createElement('span');
    item.className = 'rv-badge-item';
    if (REACTIONS[k]) item.innerHTML = REACTIONS[k].svg; else item.textContent = k;
    const c = document.createElement('b');
    c.textContent = String(n);
    item.appendChild(c);
    el.appendChild(item);
  }
  return el;
}

function build(doc: PMNode): DecorationSet {
  const all = allComments();
  const decos: Decoration[] = [];
  for (const [id, r] of commentRanges(doc)) {
    const c = all[id];
    if (!c || c.resolved) continue;
    const counts = Object.entries(c.reactions ?? {}).filter(([, names]) => names.length).map(([k, names]) => [k, names.length, names.join(', ')] as [string, number, string]);
    if (!counts.length) continue;
    const key = `${id}:${counts.map(([k, n]) => `${k}${n}`).join(',')}`;
    decos.push(Decoration.widget(r.to, () => badge(counts, id), { side: 1, key, ignoreSelection: true }));
  }
  return DecorationSet.create(doc, decos);
}

export function badgePlugin(): Plugin<number> {
  return new Plugin<number>({
    key: badgeKey,
    state: {
      init: () => 0,
      apply: (tr, v) => (tr.getMeta(badgeKey) ? v + 1 : v),
    },
    props: {
      decorations(state) {
        const version = badgeKey.getState(state) ?? 0;
        if (cache.doc === state.doc && cache.version === version) return cache.set;
        cache = { doc: state.doc, version, set: build(state.doc) };
        return cache.set;
      },
      handleDOMEvents: {
        mousedown(_view, event) {
          const b = (event.target as HTMLElement).closest<HTMLElement>('.rv-badge');
          if (!b?.dataset.comment) return false;
          event.preventDefault();
          const id = b.dataset.comment;
          void commands.run('review.gotoComment', { id }).then(() => (panelOpen('review') ? true : commands.run('review.panel'))).catch(() => undefined);
          return true;
        },
      },
    },
  });
}

let lastSig = '';

export function refreshBadges(): void {
  const sig = JSON.stringify(Object.entries(allComments()).map(([id, c]) => [id, c.resolved, c.reactions]));
  if (sig === lastSig) return;
  lastSig = sig;
  let v;
  try { v = view(); } catch { return; }
  v.dispatch(v.state.tr.setMeta(badgeKey, true).setMeta('addToHistory', false));
}
