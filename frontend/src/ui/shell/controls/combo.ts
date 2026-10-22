import { el, escapeHtml, setClass, setHidden, setValue } from '../../dom';
import { icon } from '../../icons';

export interface ComboOpts {
  cls: string;
  label: string;
  read: () => string;
  options: () => string[];
  apply: (value: string) => void;
  preview?: boolean;
  recentKey?: string;
  heads?: [string, string];
}

const recentOf = (key: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 4) : []; } catch { return []; }
};

const noteRecent = (key: string, v: string): void => {
  try { localStorage.setItem(key, JSON.stringify([v, ...recentOf(key).filter((x) => x !== v)].slice(0, 4))); } catch { void 0; }
};

export function combo(o: ComboOpts): { root: HTMLElement; patch: () => void } {
  const root = el(`<div class="ft-wcombo ${o.cls}"><input class="ft-wcombo-in" type="text" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="false" aria-label="${escapeHtml(o.label)}" title="${escapeHtml(o.label)}"><button class="ft-wcombo-btn" type="button" tabindex="-1" aria-label="${escapeHtml(o.label)} list">${icon('chevronDown', 12)}</button></div>`);
  const input = root.querySelector('input') as HTMLInputElement;
  const btn = root.querySelector('button') as HTMLButtonElement;
  const pop = el(`<div class="ft-rb-pop ft-wlist ft-wlist2 ${o.cls}-pop" role="listbox" aria-label="${escapeHtml(o.label)}" hidden></div>`);
  (document.getElementById('overlay-root') ?? document.body).appendChild(pop);
  const recentHead = el(`<div class="ft-pp-head" hidden>${escapeHtml(o.heads?.[0] ?? 'Recently Used')}</div>`);
  const recentBox = el('<div class="ft-wlist-box"></div>');
  const allHead = el(`<div class="ft-pp-head" hidden>${escapeHtml(o.heads?.[1] ?? 'All')}</div>`);
  const allBox = el('<div class="ft-wlist-box"></div>');
  pop.append(recentHead, recentBox, allHead, allBox);
  const rows = new Map<string, HTMLButtonElement>();
  const recents: HTMLButtonElement[] = [];
  let hover: HTMLButtonElement | null = null;

  const make = (v: string): HTMLButtonElement => {
    const row = el<HTMLButtonElement>('<button class="ft-wlist-row" type="button" role="option" tabindex="-1"></button>');
    row.textContent = v;
    row.dataset.v = v;
    if (o.preview) row.style.fontFamily = `"${v}", var(--font-ui)`;
    return row;
  };

  const setHover = (row: HTMLButtonElement | null): void => {
    if (hover === row) return;
    hover?.classList.remove('is-hover');
    hover = row;
    row?.classList.add('is-hover');
    row?.scrollIntoView({ block: 'nearest' });
  };

  const sync = (): void => {
    const current = o.read();
    const opts = o.options();
    for (const v of opts) {
      if (!rows.has(v)) { const r = make(v); rows.set(v, r); allBox.appendChild(r); }
    }
    for (const [v, r] of rows) { setClass(r, 'is-active', v === current); setHidden(r, !opts.includes(v)); }
    if (o.recentKey) {
      const list = recentOf(o.recentKey).filter((v) => opts.includes(v)).slice(0, 3);
      while (recents.length < 3) { const r = make('x'); recents.push(r); recentBox.appendChild(r); }
      recents.forEach((r, i) => {
        const v = list[i];
        setHidden(r, !v);
        if (v && r.dataset.v !== v) { r.dataset.v = v; r.textContent = v; if (o.preview) r.style.fontFamily = `"${v}", var(--font-ui)`; }
        setClass(r, 'is-active', v === current);
      });
      setHidden(recentHead, list.length === 0);
      setHidden(recentBox, list.length === 0);
      setHidden(allHead, list.length === 0);
    }
  };

  const open = (): void => {
    sync();
    setHidden(pop, false);
    input.setAttribute('aria-expanded', 'true');
    const r = root.getBoundingClientRect();
    const w = Math.max(r.width, o.preview ? 200 : 72);
    pop.style.minWidth = `${w}px`;
    pop.style.left = `${Math.round(Math.min(r.left, window.innerWidth - w - 8))}px`;
    const h = pop.offsetHeight;
    pop.style.top = `${Math.round(r.bottom + 2 + h <= window.innerHeight - 4 ? r.bottom + 2 : Math.max(4, r.top - h - 2))}px`;
    const act = pop.querySelector<HTMLElement>('.is-active:not([hidden])');
    if (act) pop.scrollTop = Math.max(0, act.offsetTop - pop.clientHeight / 2 + act.offsetHeight / 2);
  };

  const close = (): void => {
    if (pop.hidden) return;
    setHidden(pop, true);
    input.setAttribute('aria-expanded', 'false');
    setHover(null);
  };

  const commit = (v: string): void => {
    const value = v.trim();
    if (value) {
      const match = Array.from(rows.keys()).find((k) => k.toLowerCase() === value.toLowerCase());
      const final = match ?? value;
      if (o.recentKey && match) noteRecent(o.recentKey, final);
      o.apply(final);
    }
    close();
  };

  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.ft-wlist-row');
    if (row?.dataset.v) commit(row.dataset.v);
  });
  pop.addEventListener('pointermove', (e) => { const row = (e.target as HTMLElement).closest<HTMLButtonElement>('.ft-wlist-row'); if (row && !row.hidden) setHover(row); });
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => { if (pop.hidden) open(); else close(); });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(hover?.dataset.v ?? input.value); input.blur(); }
    else if (e.key === 'Escape') { setValue(input, o.read()); close(); input.blur(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (pop.hidden) open();
      const vis = Array.from(pop.querySelectorAll<HTMLButtonElement>('.ft-wlist-row')).filter((r) => !r.hidden && r.offsetParent !== null);
      const at = hover ? vis.indexOf(hover) : vis.findIndex((r) => r.classList.contains('is-active'));
      const next = Math.min(vis.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)));
      setHover(vis[next] ?? null);
      if (vis[next]?.dataset.v) input.value = vis[next].dataset.v as string;
      input.select();
    }
  });
  input.addEventListener('input', () => {
    const t = input.value.toLowerCase();
    if (!t) return;
    if (pop.hidden) open();
    const hit = Array.from(rows.entries()).find(([k, r]) => !r.hidden && k.toLowerCase().startsWith(t));
    setHover(hit ? hit[1] : null);
  });
  input.addEventListener('blur', () => { window.setTimeout(() => { if (document.activeElement !== input) { close(); if (input.value !== o.read()) input.value = o.read(); } }, 0); });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target as Node) && !root.contains(e.target as Node)) close(); }, true);
  window.addEventListener('resize', close);

  const patch = (): void => {
    setValue(input, o.read());
    if (!pop.hidden) sync();
  };
  patch();
  return { root, patch };
}
