import { call, ed, run, schedule, type GItem, type Info, type MI, SEP } from './kit';

export const posThumb = (v: number, h: number): string => {
  const x = 6 + h * 13;
  const y = 5 + v * 11;
  return `<svg viewBox="0 0 40 36" width="40" height="36" aria-hidden="true"><rect x="3.5" y="1.5" width="33" height="33" rx="2" fill="#ffffff" stroke="#9ca3af"/><path d="M7 7h26M7 12h26M7 17h26M7 22h26M7 27h26" stroke="#d1d5db" stroke-width="1"/><rect x="${x}" y="${y}" width="12" height="9" rx="1" fill="#f97316" stroke="#c2410c"/></svg>`;
};

export const inlineThumb = (): string => `<svg viewBox="0 0 40 36" width="40" height="36" aria-hidden="true"><rect x="3.5" y="1.5" width="33" height="33" rx="2" fill="#ffffff" stroke="#9ca3af"/><path d="M7 8h8M7 13h26M7 24h26M7 29h20" stroke="#d1d5db" stroke-width="1"/><rect x="16" y="6" width="9" height="6" rx="1" fill="#f97316" stroke="#c2410c"/></svg>`;

const NAMES = [['Top Left', 'Top Center', 'Top Right'], ['Middle Left', 'Middle Center', 'Middle Right'], ['Bottom Left', 'Bottom Center', 'Bottom Right']];

export const positionItems = (prefix: 'picture' | 'shape', info: () => Info | null): GItem[] => {
  const items: GItem[] = [{ id: 'inline', name: 'In Line with Text', group: 'In Line with Text', thumb: () => inlineThumb(), run: () => run(`${prefix}.wrap`, { wrap: 'inline' }) }];
  for (let v = 0; v < 3; v++) {
    for (let h = 0; h < 3; h++) {
      items.push({
        id: `p${v}${h}`, name: NAMES[v][h], title: `${NAMES[v][h]} of the page, text wraps around`, group: 'With Text Wrapping', thumb: () => posThumb(v, h),
        run: () => {
          const i = info();
          if (!i) return;
          const sec = ed().sectionById(ed().currentSectionId());
          const m = sec.margins;
          const w = Number(i.width) || 100;
          const hh = Number(i.height) || 100;
          const x = h === 0 ? m.left : h === 1 ? (sec.page.width - w) / 2 : sec.page.width - m.right - w;
          const y = v === 0 ? m.top : v === 1 ? (sec.page.height - hh) / 2 : sec.page.height - m.bottom - hh;
          void call(`${prefix}.wrap`, { wrap: 'front' }).then(() => call(`${prefix}.position`, { x: Math.round(x), y: Math.round(y), relative: 'page' })).then(schedule).catch(() => undefined);
        },
      });
    }
  }
  return items;
};

export const wrapMenu = (prefix: 'picture' | 'shape' | 'object', current: () => string, includeTight = false): MI[] => {
  const rows: Array<[string, string, string]> = [['In Line with Text', 'inline', 'wrapInline'], ['Square', 'square', 'wrapSquare']];
  if (includeTight) rows.push(['Tight', 'tight', 'wrapTight']);
  rows.push(['Top and Bottom', 'topBottom', 'wrapTopBottom'], ['Behind Text', 'behind', 'wrapBehind'], ['In Front of Text', 'front', 'wrapFront']);
  return rows.map(([n, w, ic]): MI => ({ label: n, icon: ic, radio: true, checked: () => current() === w, run: () => run(`${prefix}.wrap`, { wrap: w }) }));
};

export const rotateMenu = (prefix: 'picture' | 'shape'): MI[] => [
  { label: 'Rotate Right 90', icon: 'rotateRight', run: () => run(`${prefix}.rotate`, { degrees: 90 }) },
  { label: 'Rotate Left 90', icon: 'rotateLeft', run: () => run(`${prefix}.rotate`, { degrees: 270 }) },
  { label: 'Rotate 180', icon: 'rotate', run: () => run(`${prefix}.rotate`, { degrees: 180 }) },
  SEP,
  { label: 'Reset Rotation', run: () => run(`${prefix}.rotate`, { degrees: 0 }) },
  { label: 'More Rotation Options...', cmd: `${prefix}.rotate` },
];
