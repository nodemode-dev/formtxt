import { Plugin } from 'prosemirror-state';
import { el, setHidden, setText } from '../../../ui/dom';
import { toast } from '../../../ui/toast';

let card: HTMLElement | null = null;
let timer = 0;
let current: HTMLElement | null = null;

function build(): HTMLElement {
  const c = el(`<div class="ft-linkcard" role="tooltip" hidden>
<div class="ft-linkcard-site"></div><div class="ft-linkcard-title"></div><div class="ft-linkcard-desc"></div><div class="ft-linkcard-url"></div>
<div class="ft-linkcard-row"><a class="ft-btn sm" data-open target="_blank" rel="noopener">Open</a><button type="button" class="ft-btn sm ghost" data-copy>Copy link</button></div></div>`);
  c.addEventListener('mouseenter', () => window.clearTimeout(timer));
  c.addEventListener('mouseleave', () => hideSoon());
  c.querySelector('[data-copy]')?.addEventListener('click', () => {
    const href = c.dataset.href ?? '';
    void navigator.clipboard?.writeText(href).then(() => toast('Link copied.'), () => toast(href));
  });
  document.getElementById('overlay-root')?.appendChild(c);
  return c;
}

function show(chip: HTMLElement): void {
  card ??= build();
  const c = card;
  const href = chip.getAttribute('href') ?? '';
  c.dataset.href = href;
  setText(c.querySelector('.ft-linkcard-site'), chip.dataset.site ?? '');
  setText(c.querySelector('.ft-linkcard-title'), chip.dataset.title || href);
  setText(c.querySelector('.ft-linkcard-desc'), chip.dataset.desc ?? '');
  setHidden(c.querySelector('.ft-linkcard-desc') as HTMLElement, !chip.dataset.desc);
  setText(c.querySelector('.ft-linkcard-url'), href);
  (c.querySelector('[data-open]') as HTMLAnchorElement).href = href;
  const r = chip.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - 336, r.left));
  const below = r.bottom + 6;
  c.style.left = `${Math.round(left)}px`;
  c.style.top = `${Math.round(below)}px`;
  setHidden(c, false);
  current = chip;
}

function hideSoon(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { if (card) setHidden(card, true); current = null; }, 250);
}

export function linkCardPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mouseover(_view, e) {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('a.ft-linkchip');
          if (!chip) return false;
          window.clearTimeout(timer);
          if (current === chip && card && !card.hidden) return false;
          timer = window.setTimeout(() => show(chip), 350);
          return false;
        },
        mouseout(_view, e) {
          const chip = (e.target as HTMLElement).closest<HTMLElement>('a.ft-linkchip');
          if (chip && !chip.contains(e.relatedTarget as Node | null)) hideSoon();
          return false;
        },
        keydown() {
          if (card && !card.hidden) { setHidden(card, true); current = null; }
          return false;
        },
      },
    },
  });
}
