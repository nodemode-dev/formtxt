const L = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const PAGE = '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/>';
const TABLE = '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M10 5v14M15 5v14"/>';

export const WORDCMD_ICONS: Record<string, string> = {
  growFont: L('<path d="M3.5 18l4.5-11 4.5 11M5.2 14h5.6"/><path d="M16 9.5l2.5-3 2.5 3"/>'),
  shrinkFont: L('<path d="M3.5 18l4.5-11 4.5 11M5.2 14h5.6"/><path d="M16 6.5l2.5 3 2.5-3"/>'),
  formattingMarks: L('<path d="M14 4.5h-3.5a3.5 3.5 0 0 0 0 7H14M14 4.5V19M17.5 4.5V19"/>'),
  watermark: L(`${PAGE}<path d="M8 15.5l2.2-5 2.2 5M9 14h2.4M14.5 15.5v-5"/>`),
  pageColor: L('<path d="M5 12.5l6-7 7 7-6 6a1.5 1.5 0 0 1-2.1 0z"/><path d="M20 15c1 1.5 1.5 2.3 1.5 3a1.5 1.5 0 0 1-3 0c0-.7.5-1.5 1.5-3z"/>'),
  pageBorders: L(`${PAGE}<rect x="7.5" y="6" width="9" height="12" rx=".6"/>`),
  blankPage: L(`${PAGE}<path d="M9 12h6M12 9v6"/>`),
  navigationPane: L('<rect x="4" y="4.5" width="16" height="15" rx="1.5"/><path d="M9.5 4.5v15M6.2 8.5h1.6M6.2 11.5h1.6M6.2 14.5h1.6"/>'),
  goTo: L('<path d="M5 12h12M13 7.5l4.5 4.5-4.5 4.5"/><path d="M19.5 5v14"/>'),
  pageWidth: L(`${PAGE}<path d="M2.5 12h2.5M19 12h2.5M3.8 10.5L2.5 12l1.3 1.5M20.2 10.5l1.3 1.5-1.3 1.5"/>`),
  fitPage: L('<rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M9.5 8h5M9.5 11h5M9.5 14h3"/>'),
  zoom100: L('<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.5 14.5l5.5 5.5M8.2 10.5h4.6M10.5 8.2v4.6"/>'),
  tableSelect: L(`${TABLE}<rect x="10" y="10" width="5" height="4.5" fill="currentColor" stroke="none" opacity=".35"/>`),
  autofit: L('<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M9.5 6v12M5.8 12h2M14 12h4M16 10.3l2 1.7-2 1.7"/>'),
  rowHeight: L('<rect x="4" y="7" width="16" height="10" rx="1.5"/><path d="M12 3.5v3M12 17.5v3M10.3 5.2L12 3.5l1.7 1.7M10.3 18.8l1.7 1.7 1.7-1.7"/>'),
  colWidth: L('<rect x="7" y="4" width="10" height="16" rx="1.5"/><path d="M3.5 12h3M17.5 12h3M5.2 10.3L3.5 12l1.7 1.7M18.8 10.3l1.7 1.7-1.7 1.7"/>'),
  cellMargins: L('<rect x="4" y="5" width="16" height="14" rx="1.5"/><rect x="8" y="9" width="8" height="6" rx=".6" stroke-dasharray="2 1.6"/>'),
  viewGridlines: L('<rect x="4" y="5" width="16" height="14" rx="1.5" stroke-dasharray="2.4 2"/><path d="M4 12h16M12 5v14" stroke-dasharray="2.4 2"/>'),
  nextComment: L('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V15H6.5A1.5 1.5 0 0 1 5 13.5z"/><path d="M9 9.5h6M13 7.5l2 2-2 2"/>'),
  prevComment: L('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V15H6.5A1.5 1.5 0 0 1 5 13.5z"/><path d="M15 9.5H9M11 7.5l-2 2 2 2"/>'),
  showMarkup: L('<path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12 17.3 17.5 12 17.5 3.5 12 3.5 12z"/><circle cx="12" cy="12" r="2.6"/>'),
  paraShading: L('<rect x="4" y="6" width="16" height="12" rx="1.5" fill="currentColor" stroke="none" opacity=".18"/><path d="M7.5 10h9M7.5 14h6"/>'),
  paraBorders: L('<rect x="4.5" y="6" width="15" height="12" rx="1"/><path d="M8 10.5h8M8 13.5h5"/>'),
  sort: L('<path d="M5 17l2.5-4 2.5 4M5.8 15.5h3.4M5 7h5l-5 4h5"/><path d="M16 5v14M13.5 16.5l2.5 2.5 2.5-2.5"/>'),
  dateTime: L('<rect x="4" y="5.5" width="16" height="14" rx="1.5"/><path d="M4 10h16M8.5 3.5v3M15.5 3.5v3"/><circle cx="14" cy="15" r="2.4"/><path d="M14 13.8v1.3l.9.6"/>'),
  about: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01" stroke-width="2"/>'),
  whatsNew: L('<path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" stroke-linejoin="round"/><path d="M18.5 15.5v4M16.5 17.5h4"/>'),
  feedback: L('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V15H6.5A1.5 1.5 0 0 1 5 13.5z"/><path d="M12 7.5v3.2M12 12.6h.01" stroke-width="2"/>'),
};
