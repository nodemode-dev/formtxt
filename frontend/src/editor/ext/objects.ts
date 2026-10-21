import type { CommandRegistry } from '../../engine/registry';
import type { DocEditor } from '../editor';
import { registerChartLink } from './objects/chartlink';
import { registerFonts } from './objects/fonts';
import { registerMedia } from './objects/media';
import { registerParagraph } from './objects/paragraph';
import { registerScreenshot } from './objects/screenshot';
import { registerTypography } from './objects/typography';

export function register(reg: CommandRegistry, ed: DocEditor): void {
  registerTypography(reg, ed);
  registerParagraph(reg, ed);
  registerFonts(reg, ed);
  registerMedia(reg, ed);
  registerScreenshot(reg, ed);
  registerChartLink(reg, ed);
}
