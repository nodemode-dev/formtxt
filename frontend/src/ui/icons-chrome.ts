const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const CHROME_ICONS: Record<string, string> = {
  capMin: L('<path d="M6 12h12"/>'),
  capMax: L('<rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
  capRestore: L('<rect x="5.5" y="9" width="9.5" height="9.5" rx="1.5"/><path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5H17.5A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15"/>'),
  capClose: L('<path d="M6 6l12 12M18 6L6 18"/>'),
  tbSearch: L('<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/>'),
  tbSun: L('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  tbMoon: L('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  tbGear: L('<circle cx="12" cy="12" r="3"/><path d="M10.3 3.8h3.4l.5 2.1 1.6.9 2-.7 1.7 2.9-1.5 1.5v1.8l1.5 1.5-1.7 2.9-2-.7-1.6.9-.5 2.1h-3.4l-.5-2.1-1.6-.9-2 .7-1.7-2.9 1.5-1.5v-1.8L4.5 8.9l1.7-2.9 2 .7 1.6-.9z"/>'),
  tbComment: L('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  tbShare: L('<path d="M12 15V4.5M8 8l4-4 4 4"/><path d="M5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6"/>'),
  tbChevron: L('<path d="M7 10l5 5 5-5"/>'),
  tbCheck: L('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  modeEdit: L('<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M12.5 7.5l4 4"/>'),
  modeSuggest: L('<path d="M13 5.5l3.5 3.5L7.5 18H4v-3.5z"/><path d="M17 15.5h4M19 13.5v4"/>'),
  modeView: L('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  stProofOk: L('<path d="M5.5 4.5H17a1.5 1.5 0 0 1 1.5 1.5v11H7a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M5.5 18.5A1.5 1.5 0 0 0 7 20h11.5"/><path d="M9 11l2 2 3.5-4"/>'),
  stProofIssue: L('<path d="M5.5 4.5H17a1.5 1.5 0 0 1 1.5 1.5v11H7a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M5.5 18.5A1.5 1.5 0 0 0 7 20h11.5"/><path d="M12 8.5v3.2M12 14h.01"/>'),
  stProofOff: L('<path d="M5.5 4.5H17a1.5 1.5 0 0 1 1.5 1.5v11H7a1.5 1.5 0 0 0-1.5 1.5z"/><path d="M5.5 18.5A1.5 1.5 0 0 0 7 20h11.5"/><path d="M9 11.5h5"/>'),
  stLanguage: L('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.6 8.7 8.6 12s1 6.1 3.4 8.5"/>'),
  stAccess: L('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="8.2" r="1" fill="currentColor"/><path d="M8 10.5l4 .8 4-.8M12 11.3v3.4M10 17l2-2.3 2 2.3"/>'),
  stAccessWarn: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2M12 15.8h.01"/>'),
  stTrack: L('<path d="M14.5 5.5l4 4L8 20H4v-4z"/><path d="M4 21h16" stroke-dasharray="2 2.5"/>'),
  stSaved: L('<path d="M7 18.5h10a4 4 0 0 0 .9-7.9A5.5 5.5 0 0 0 7.4 9.2 4.7 4.7 0 0 0 7 18.5z"/><path d="M9.5 13.5l2 2 3.5-3.8"/>'),
  stSaving: L('<path d="M12 4.5a7.5 7.5 0 1 1-7.5 7.5"/><path d="M4.5 6.5v5.5h5.5"/>'),
  stUnsaved: L('<path d="M7 18.5h10a4 4 0 0 0 .9-7.9A5.5 5.5 0 0 0 7.4 9.2 4.7 4.7 0 0 0 7 18.5z"/><path d="M12 10.5v3M12 15.8h.01"/>'),
  stEngine: L('<rect x="4.5" y="5" width="15" height="6" rx="1.5"/><rect x="4.5" y="13" width="15" height="6" rx="1.5"/><path d="M8 8h.01M8 16h.01"/>'),
  stFocus: L('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
  stRead: L('<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z"/><path d="M12 6.5v13"/>'),
  stPrint: L('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M8.5 12.5h7M8.5 15.5h7"/>'),
  stWeb: L('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17M7 7h.01M10 7h.01"/>'),
  stMinus: L('<path d="M6 12h12"/>'),
  stPlus: L('<path d="M12 6v12M6 12h12"/>'),
  stBusy: L('<path d="M12 4a8 8 0 1 0 8 8"/>'),
};

export function chromeIcon(name: string, size = 16): string {
  const svg = CHROME_ICONS[name] ?? CHROME_ICONS.stEngine;
  return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>`;
}
