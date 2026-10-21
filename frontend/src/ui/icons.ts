const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const PAGE = '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>';

export const ICONS: Record<string, string> = {
  brand: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M7.5 7.5h9M12 7.5v10" stroke="var(--bg-secondary)" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
  document: L(`${PAGE}<path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3"/>`),
  plus: L('<path d="M12 5v14M5 12h14"/>'),
  sun: L('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: L('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  info: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
};

export function icon(name: string, size = 16): string {
  const svg = ICONS[name] ?? ICONS.info;
  return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>`;
}
