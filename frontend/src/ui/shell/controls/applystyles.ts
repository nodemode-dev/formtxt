import { commands as registry } from '../../../engine/registry';
import { el, escapeHtml, setClass, setHidden } from '../../dom';
import { shellCommands } from '../cmd';
import { registerPanel } from './popover';

interface StyleRow { id: string; name: string }

export function registerApplyStyles(): void {
  let list: StyleRow[] = [];
  let box: HTMLElement;
  let input: HTMLInputElement;
  const rows = new Map<string, HTMLButtonElement>();
  let hot = 0;

  const visible = (): HTMLButtonElement[] => Array.from(rows.values()).filter((r) => !r.hidden);
  const mark = (): void => visible().forEach((r, i) => setClass(r, 'is-hover', i === hot));
  const filter = (): void => {
    const t = input.value.trim().toLowerCase();
    for (const [id, r] of rows) setHidden(r, !!t && !(r.textContent ?? '').toLowerCase().includes(t) && !id.toLowerCase().includes(t));
    hot = 0;
    mark();
  };

  registerPanel({
    id: 'applystyles',
    w: 236,
    secs: [{
      t: 'custom',
      build: (close) => {
        const root = el('<div class="ft-pp-apply"><div class="ft-pp-head">Apply Styles</div><input class="ft-pp-find" type="text" placeholder="Style name" spellcheck="false" autocomplete="off" aria-label="Style name"><div class="ft-pp-apply-list" role="listbox"></div></div>');
        input = root.querySelector('input') as HTMLInputElement;
        box = root.querySelector('.ft-pp-apply-list') as HTMLElement;
        const pick = (id: string): void => { close(); shellCommands.run('paragraph.style', { style: id }); };
        box.addEventListener('click', (e) => { const r = (e.target as HTMLElement).closest<HTMLElement>('[data-id]'); if (r?.dataset.id) pick(r.dataset.id); });
        input.addEventListener('input', filter);
        input.addEventListener('keydown', (e) => {
          const v = visible();
          if (e.key === 'ArrowDown') { e.preventDefault(); hot = Math.min(v.length - 1, hot + 1); mark(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); hot = Math.max(0, hot - 1); mark(); }
          else if (e.key === 'Enter') { e.preventDefault(); const id = v[hot]?.dataset.id; if (id) pick(id); }
          e.stopPropagation();
        });
        return root;
      },
      patch: () => {
        void Promise.resolve(registry.run('styles.list', {})).then((r) => {
          list = (r as StyleRow[]) ?? [];
          for (const s of list) {
            if (!rows.has(s.id)) {
              const b = el<HTMLButtonElement>(`<button class="ft-wlist-row" type="button" role="option" data-id="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`);
              rows.set(s.id, b);
              box.appendChild(b);
            }
          }
          input.value = '';
          filter();
          input.focus();
        }).catch(() => undefined);
      },
    }],
  });
}
