const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const PAGE = '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>';

export const ICONS: Record<string, string> = {
  brand: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M7.5 7.5h9M12 7.5v10" stroke="var(--bg-secondary)" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
  document: L(`${PAGE}<path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h3"/>`),
  plus: L('<path d="M12 5v14M5 12h14"/>'),
  sun: L('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: L('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  info: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  home: L('<path d="M4 11.5L12 4.5l8 7"/><path d="M6.5 9.5v10h11v-10"/><path d="M10 19.5v-5h4v5"/>'),
  clock: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  template: L('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 8.5h16M9.5 8.5v12"/>'),
  trash: L('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>'),
  agent: L('<rect x="5" y="7.5" width="14" height="11" rx="3"/><path d="M12 4v3.5M9.5 12.5h.01M14.5 12.5h.01M9.5 15.5h5"/>'),
  cloudOff: L('<path d="M7 18.5h10a4 4 0 0 0 .9-7.9A5.5 5.5 0 0 0 7.4 9.2 4.7 4.7 0 0 0 7 18.5z"/><path d="M4 4l16 16"/>'),
  settings: L('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>'),
  upload: L('<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>'),
  folderOpen: L('<path d="M3.5 18V6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V10"/><path d="M3.5 18l2.5-7.5h15L18.5 18z"/>'),
  fileText: L(`${PAGE}<path d="M8.5 12.5h7M8.5 15.5h5"/>`),
  search: L('<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'),
  more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>`,
  undo: L('<path d="M9 7.5L4.5 12 9 16.5"/><path d="M4.5 12H14a5.5 5.5 0 0 1 0 11h-2"/>'),
  inbox: L('<path d="M4 13.5l2.5-8h11l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/>'),
  close: L('<path d="M6 6l12 12M18 6L6 18"/>'),
};

export function icon(name: string, size = 16): string {
  const svg = ICONS[name] ?? ICONS.info;
  return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>`;
}
