const S = (body: string): string => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const REACTIONS: Record<string, { label: string; svg: string }> = {
  like: { label: 'Like', svg: S('<path d="M7.5 11v8.5H5a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1z"/><path d="M7.5 11l3.2-6.2a1.6 1.6 0 0 1 3 .9L13 9.5h5a1.8 1.8 0 0 1 1.8 2.2l-1.1 5.6a2.4 2.4 0 0 1-2.4 2H7.5"/>') },
  love: { label: 'Love', svg: S('<path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z"/>') },
  agree: { label: 'Agree', svg: S('<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.5 2.5 5-5.3"/>') },
  celebrate: { label: 'Celebrate', svg: S('<path d="M12 4v3M5.5 7l2 2M18.5 7l-2 2"/><path d="M5 20l3.2-9.5 6.3 6.3z"/><path d="M14.5 11.5l1.2-1.2"/>') },
  question: { label: 'Question', svg: S('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 16.6h.01"/>') },
};

export const ICON = {
  comment: S('<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z"/>'),
  react: S('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0M9.5 9.8h.01M14.5 9.8h.01"/>'),
  reply: S('<path d="M10 6L4.5 11.5 10 17"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 5.5 5.5v1"/>'),
  resolve: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  reopen: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/>'),
  edit: S('<path d="M4.5 19.5l1-4L16.5 4.5a1.8 1.8 0 0 1 2.5 2.5L8 18z"/><path d="M14.5 6.5l3 3"/>'),
  trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  link: S('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  accept: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  reject: S('<path d="M6 6l12 12M18 6L6 18"/>'),
};
