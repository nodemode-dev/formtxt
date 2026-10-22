const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const SHELL_ICONS: Record<string, string> = {
  check: L('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  chevronLeft: L('<path d="M15 6l-6 6 6 6"/>'),
  chevronRight: L('<path d="M9 6l6 6-6 6"/>'),
  chevronUp: L('<path d="M6 15l6-6 6 6"/>'),
  chevronDown: L('<path d="M6 9l6 6 6-6"/>'),
  collapse: L('<path d="M6 14.5l6-6 6 6"/><path d="M6 19h12"/>'),
  pin: L('<path d="M9 4.5h6M10 4.5v5l-3 4.5h10l-3-4.5v-5"/><path d="M12 14v6"/>'),
  ribbon: L('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9.5h17M7 13.5h3M12.5 13.5h4.5"/>'),
  simplified: L('<rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 12h2M11.5 12h2M16 12h1"/>'),
  iconRail: L('<rect x="3.5" y="8" width="17" height="8" rx="2"/><circle cx="8" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="16" cy="12" r="1"/>'),
  qat: L('<rect x="3.5" y="4.5" width="17" height="6" rx="1.5"/><path d="M7 7.5h2M12 7.5h2"/><path d="M8.5 15.5l3.5 3.5 3.5-3.5"/>'),
  customize: L('<path d="M4.5 7h9M17.5 7h2M4.5 17h2M10.5 17h9"/><circle cx="15.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>'),
  file: L('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>'),
  moreH: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>`,
  launcher: L('<path d="M9 5.5H6.5a1 1 0 0 0-1 1V9"/><path d="M10.5 13.5l8-8"/><path d="M13.5 5.5h5v5"/>'),
  moveUp: L('<path d="M12 19V6M7 10.5L12 5.5l5 5"/>'),
  moveDown: L('<path d="M12 5v13M7 13.5l5 5 5-5"/>'),
  dots: L('<circle cx="12" cy="12" r="1.2"/>'),
};
