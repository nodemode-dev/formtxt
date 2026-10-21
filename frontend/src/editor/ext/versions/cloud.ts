import { Dialog } from '../../../ui/dialog';
import { el } from '../../../ui/dom';
import { setOptions } from '../refs/forms';

let dialog: Dialog | null = null;
let select: HTMLSelectElement | null = null;
let resolve: ((name: string) => void) | null = null;

export function pickCloudFile(names: string[]): Promise<string> {
  if (!dialog) {
    dialog = new Dialog('Open from cloud storage', 460);
    select = el<HTMLSelectElement>('<select class="ft-input" size="8" aria-label="Documents in cloud storage"></select>');
    dialog.field('Documents', select);
    dialog.button('Cancel', 'ghost', () => { dialog?.close(); resolve?.(''); resolve = null; });
    dialog.button('Open', 'primary', () => { const v = select?.value ?? ''; dialog?.close(); resolve?.(v); resolve = null; });
    select.addEventListener('dblclick', () => { const v = select?.value ?? ''; dialog?.close(); resolve?.(v); resolve = null; });
  }
  setOptions(select!, names.map((n) => [n, n.replace(/\.ftxt$/, '')]));
  select!.value = names[0] ?? '';
  return new Promise((r) => { resolve = r; dialog!.open(select!); });
}
