import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import type { AreaRegister } from './types';
import { mountExtensionUI } from './ui';
import { register as refs } from './refs';
import { register as review } from './review';
import { register as versions } from './versions';
import { register as exchange } from './exchange';
import { register as print } from './print';
import { register as proofing } from './proofing';
import { register as ai } from './ai';
import { register as objects } from './objects';
import { register as collab } from './collab';

const AREAS: AreaRegister[] = [refs, review, versions, exchange, print, proofing, ai, objects, collab];

export function registerExtensions(reg: CommandRegistry, ed: DocEditor): void {
  mountExtensionUI();
  for (const area of AREAS) area(reg, ed);
}
