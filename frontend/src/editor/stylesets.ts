import type { Style } from '../engine/model';

export interface StyleSet {
  id: string;
  name: string;
  body: { font: string; size: number; color: string; lineSpacing: number; spaceAfter: number };
  heading: { font: string; color: string; italic?: boolean; sizes: [number, number, number, number] };
  titleAlign: 'left' | 'center';
  subtitleColor: string;
}

export const STYLE_SETS: StyleSet[] = [
  { id: 'standard', name: 'Standard', body: { font: 'Inter', size: 11, color: '#000000', lineSpacing: 1.15, spaceAfter: 8 }, heading: { font: 'Inter', color: '#000000', sizes: [28, 20, 16, 14] }, titleAlign: 'left', subtitleColor: '#5a5a5a' },
  { id: 'classic', name: 'Classic serif', body: { font: 'Source Serif 4', size: 11.5, color: '#1f1f1f', lineSpacing: 1.2, spaceAfter: 8 }, heading: { font: 'Source Serif 4', color: '#1f1f1f', sizes: [30, 20, 16, 13] }, titleAlign: 'center', subtitleColor: '#595959' },
  { id: 'editorial', name: 'Editorial', body: { font: 'Lora', size: 11, color: '#222222', lineSpacing: 1.3, spaceAfter: 9 }, heading: { font: 'Playfair Display', color: '#111111', sizes: [34, 22, 17, 14] }, titleAlign: 'left', subtitleColor: '#6b6b6b' },
  { id: 'report', name: 'Report', body: { font: 'IBM Plex Sans', size: 10.5, color: '#222222', lineSpacing: 1.2, spaceAfter: 7 }, heading: { font: 'IBM Plex Sans', color: '#1d4ed8', sizes: [26, 18, 14, 12] }, titleAlign: 'left', subtitleColor: '#4b5563' },
  { id: 'academic', name: 'Academic', body: { font: 'Libre Baskerville', size: 11, color: '#000000', lineSpacing: 1.6, spaceAfter: 0 }, heading: { font: 'Libre Baskerville', color: '#000000', sizes: [16, 14, 12, 11] }, titleAlign: 'center', subtitleColor: '#000000' },
  { id: 'modern', name: 'Modern', body: { font: 'Work Sans', size: 11, color: '#262626', lineSpacing: 1.25, spaceAfter: 8 }, heading: { font: 'Space Grotesk', color: '#0f766e', sizes: [32, 21, 16, 13] }, titleAlign: 'left', subtitleColor: '#525252' },
  { id: 'warm', name: 'Warm', body: { font: 'Merriweather', size: 10.5, color: '#2b2b2b', lineSpacing: 1.35, spaceAfter: 8 }, heading: { font: 'Merriweather', color: '#9a3412', sizes: [28, 19, 15, 12.5] }, titleAlign: 'left', subtitleColor: '#78716c' },
  { id: 'technical', name: 'Technical', body: { font: 'IBM Plex Serif', size: 10.5, color: '#1f2937', lineSpacing: 1.2, spaceAfter: 7 }, heading: { font: 'IBM Plex Sans', color: '#374151', sizes: [26, 18, 14, 12] }, titleAlign: 'left', subtitleColor: '#6b7280' },
  { id: 'elegant', name: 'Elegant', body: { font: 'Lora', size: 11, color: '#1c1c1c', lineSpacing: 1.35, spaceAfter: 10 }, heading: { font: 'Playfair Display', color: '#7c2d12', italic: true, sizes: [36, 22, 17, 14] }, titleAlign: 'center', subtitleColor: '#7c2d12' },
];

export function setFonts(set: StyleSet): string[] {
  return [...new Set([set.body.font, set.heading.font])];
}

export function applyStyleSet(styles: Record<string, Style>, set: StyleSet): Record<string, Style> {
  const out: Record<string, Style> = { ...styles };
  const patch = (id: string, run: Record<string, unknown>, para: Record<string, unknown>): void => {
    const cur = out[id];
    if (!cur) return;
    out[id] = { ...cur, run: { ...(cur.run ?? {}), ...run }, para: { ...(cur.para ?? {}), ...para } } as Style;
  };
  const b = set.body, h = set.heading;
  patch('Normal', { font: b.font, size: b.size, color: b.color }, { lineSpacing: b.lineSpacing, spaceAfter: b.spaceAfter });
  patch('Title', { font: h.font, size: h.sizes[0], color: h.color, bold: false, italic: !!h.italic }, { align: set.titleAlign });
  patch('Subtitle', { font: h.font, color: set.subtitleColor, italic: !!h.italic }, { align: set.titleAlign });
  for (let level = 1; level <= 9; level++) {
    const size = level <= 3 ? h.sizes[level] : level === 4 ? Math.max(b.size, h.sizes[3] - 2) : b.size;
    patch(`Heading${level}`, { font: h.font, color: h.color, size, bold: level <= 3, italic: !!h.italic && level <= 3 }, {});
  }
  patch('Quote', { font: b.font, color: b.color, italic: true }, {});
  return out;
}

export function currentSetId(styles: Record<string, Style>): string {
  const n = styles.Normal?.run, h = styles.Heading1?.run;
  const hit = STYLE_SETS.find((s) => n?.font === s.body.font && n?.size === s.body.size && h?.font === s.heading.font && h?.color === s.heading.color);
  return hit?.id ?? '';
}
