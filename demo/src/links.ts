import './links.css';

const PAGES: ReadonlyArray<{ id: string; label: string; path: string }> = [
  { id: 'review', label: 'Review', path: 'demo/index.html' },
  { id: 'paper', label: 'Paper', path: 'demos/paper/index.html' },
  { id: 'newsletter', label: 'Newsletter', path: 'demos/newsletter/index.html' },
];

export function mountLinks(current: string): void {
  const up = current === 'review' ? '../' : '../../';
  const nav = document.createElement('nav');
  nav.className = 'dz-links';
  nav.setAttribute('aria-label', 'FormTxt demos');
  const head = document.createElement('span');
  head.textContent = 'Demos';
  nav.append(head);
  for (const p of PAGES) {
    const a = document.createElement('a');
    a.href = `${up}${p.path}`;
    a.textContent = p.label;
    if (p.id === current) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  const fill = document.querySelector('.ft-status .ft-st-fill');
  if (fill) fill.append(nav);
  else document.body.append(nav);
}
