import { api } from '../../../io/api';
import { el, patchList, setHidden, setText } from '../../../ui/dom';

export interface Pick { id: string; title: string }
interface Row { id: string; title: string; words: number; snippet: string }

export function attachPicker(host: HTMLElement, input: HTMLTextAreaElement, skipId: () => string, onPick: (p: Pick) => void): void {
  const box = el('<div class="ft-ai-picker" hidden><div class="ft-ai-pick-list" role="listbox" aria-label="Library documents"></div><p class="ft-ai-pick-empty" hidden>No documents match.</p></div>');
  const list = box.querySelector('.ft-ai-pick-list') as HTMLElement;
  const none = box.querySelector('.ft-ai-pick-empty') as HTMLElement;
  host.appendChild(box);
  let rows: Row[] = [];
  let at = 0;
  let timer = 0;
  let ticket = 0;
  let open = false;

  const token = (): { start: number; query: string } | null => {
    const pos = input.selectionStart ?? input.value.length;
    const m = /(^|\s)([/@])([^\s/@]*)$/.exec(input.value.slice(0, pos));
    return m ? { start: pos - m[2].length - m[3].length, query: m[3] } : null;
  };

  const close = (): void => { open = false; setHidden(box, true); };

  const paint = (): void => {
    patchList(list, rows, {
      key: (r) => r.id,
      create: (r) => {
        const b = el('<button type="button" class="ft-ai-pick" role="option"><span class="ft-ai-pick-title"></span><span class="ft-ai-pick-meta"></span></button>');
        b.dataset.id = r.id;
        setText(b.querySelector('.ft-ai-pick-title'), r.title);
        setText(b.querySelector('.ft-ai-pick-meta'), `${r.words.toLocaleString()} words`);
        return b;
      },
      update: () => undefined,
    });
    Array.from(list.children).forEach((c, i) => c.classList.toggle('is-active', i === at));
  };

  const choose = (r: Row | undefined): void => {
    const t = token();
    if (!r || !t) return;
    const end = input.selectionStart ?? input.value.length;
    input.value = (input.value.slice(0, t.start) + input.value.slice(end)).replace(/\s+$/, ' ');
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    close();
    onPick({ id: r.id, title: r.title });
    input.focus();
  };

  const search = (q: string): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const mine = ++ticket;
      try {
        const out = await api.get<{ results: Row[] }>(`/ai/library?${new URLSearchParams({ q, limit: '8', skip: skipId() })}`);
        if (mine !== ticket || !open) return;
        rows = out.results;
        at = 0;
        paint();
        setHidden(none, rows.length > 0);
      } catch { close(); }
    }, 140);
  };

  input.addEventListener('input', () => {
    const t = token();
    if (!t) { close(); return; }
    open = true;
    setHidden(box, false);
    search(t.query);
  });
  input.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(rows.length - 1, at + 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); paint(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (rows[at]) { e.preventDefault(); choose(rows[at]); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  input.addEventListener('blur', () => window.setTimeout(close, 150));
  box.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
    choose(rows.find((r) => r.id === id));
  });
}
