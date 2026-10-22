const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const PREF_ICONS: Record<string, string> = {
  pfGeneral: L('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  pfInterface: L('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M9 9v10.5"/>'),
  pfDisplay: L('<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 20h6M12 15.5V20"/>'),
  pfProofing: L('<path d="M4 16l3-8 3 8M5 13.5h4"/><path d="M13 14.5l3 3 5-6"/>'),
  pfSave: L('<path d="M5 4.5h11l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8 4.5v5h7v-5M8 20.5v-6h8v6"/>'),
  pfLanguage: L('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5M12 3.5C9.5 6 8.5 9 8.5 12s1 6 3.5 8.5"/>'),
  pfAccess: L('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="8.2" r="1.2"/><path d="M7.5 10.5l4.5.8 4.5-.8M12 11.3v3.2M10 18l2-3.5 2 3.5"/>'),
  pfAdvanced: L('<path d="M7 4v16M17 4v16"/><circle cx="7" cy="9" r="2.2"/><circle cx="17" cy="15" r="2.2"/>'),
  pfRibbon: L('<rect x="3.5" y="5" width="17" height="6" rx="1.5"/><path d="M6.5 8h3M12 8h2M16.5 8h1"/><rect x="3.5" y="14" width="17" height="5.5" rx="1.5"/>'),
  pfKeyboard: L('<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10h1M10.5 10h1M14 10h1M17 10h.5M7.5 14h9"/>'),
  pfAddins: L('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 4v7M13 7.5h7"/>'),
  pfShare: L('<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.3"/><path d="M16.5 13.2a4.5 4.5 0 0 1 4 4.3"/>'),
  pfAI: L('<path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>'),
  pfPrivacy: L('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>'),
  pfFold: L('<path d="M15 6l-6 6 6 6"/>'),
};
