import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { registerAddins } from './collab/addins';
import { registerComponents } from './collab/components';
import { registerMacros } from './collab/macros';
import { startSession } from './collab/session';
import { registerShare } from './collab/share';
import { registerVoice } from './collab/voice';

export function register(reg: CommandRegistry, ed: DocEditor): void {
  startSession(ed);
  registerShare(reg, ed);
  registerComponents(reg, ed);
  registerMacros(reg, ed);
  registerAddins(reg, ed);
  registerVoice(reg, ed);
}
