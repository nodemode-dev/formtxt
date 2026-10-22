import { registerApplyStyles } from './applystyles';
import { registerDesignPanels } from './panels-design';
import { registerHomePanels } from './panels-home';
import { registerInsertPanels } from './panels-insert';
import { registerLayoutPanels } from './panels-layout';
import { panelIds, warmPanel } from './popover';
import { refreshPage } from './state';

export { closePanel, exec, onPanelClose, openPanel, panelEnabled, panelIds, panelOpen, panelSpec, patchPanel, registerPanel, warmPanel } from './popover';
export { combo } from './combo';
export { spin } from './spin';
export { caretBlock, objectSelected, onPage, pageInfo, paraInfo, refreshPage, selKind } from './state';
export type { PAct, PItem, PanelSpec, Sec } from './types';
export { R, X } from './helpers';

let done = false;

export function registerAllPanels(): void {
  if (done) return;
  done = true;
  registerHomePanels();
  registerInsertPanels();
  registerDesignPanels();
  registerLayoutPanels();
  registerApplyStyles();
  refreshPage();
}

export function warmAllPanels(): void {
  const run = (): void => { for (const id of panelIds()) warmPanel(id); };
  const ric = (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback;
  if (ric) ric(run); else window.setTimeout(run, 400);
}
