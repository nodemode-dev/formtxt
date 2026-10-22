import type { DocEditor } from '../../../editor/editor';
import { cmdStateChanged, setCmdState } from '../cmd';
import { registerBCommands } from './commands-b';
import { env } from './kit';
import { chartSlots } from './slots-chart';
import { drawSlots } from './slots-draw';
import { eqSlots } from './slots-eq';
import { hfSlots } from './slots-hf';
import { pictureSlots } from './slots-picture';
import { refsSlots } from './slots-refs';
import { reviewSlots } from './slots-review';
import { shapeSlots } from './slots-shape';
import { tableSlots } from './slots-table';
import { viewSlots } from './slots-view';

type Slots = Record<string, () => HTMLElement>;

const prefixed = (m: Slots): Slots => {
  const out: Slots = {};
  for (const [k, v] of Object.entries(m)) out[k.startsWith('b.') ? k : `b.${k}`] = v;
  return out;
};

export function bSlots(o: { editor: DocEditor }): Slots {
  env.ed = o.editor;
  registerBCommands(o.editor);
  const mode = (m: string) => (): boolean => o.editor.viewMode === m;
  for (const m of ['read', 'print', 'draft', 'focus']) setCmdState(`view.${m}`, { checked: mode(m) });
  setCmdState('view.pageless', { checked: () => !!(o.editor.doc?.settings as unknown as { pageless?: boolean } | undefined)?.pageless });
  cmdStateChanged();
  return {
    ...refsSlots(),
    ...reviewSlots(),
    ...viewSlots(),
    ...drawSlots(),
    ...tableSlots(),
    ...pictureSlots(),
    ...prefixed(shapeSlots()),
    ...prefixed(chartSlots()),
    ...prefixed(hfSlots()),
    ...prefixed(eqSlots()),
  };
}
