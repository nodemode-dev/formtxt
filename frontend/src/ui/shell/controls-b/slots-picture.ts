import { setStyleVar } from '../../dom';
import { type Ctl, type GItem, type Info, type MI, SEP, button, colorButton, galleryButton, galleryInline, inch, pts, run, spinner, track } from './kit';
import { positionItems, rotateMenu, wrapMenu } from './obj-b';
import { selDom, selNode } from './state-b';

const S = (c: Ctl): HTMLElement => track(c).root;
const NEED = ['picture.info'];
const pic = (i: Info): Info | null => i['picture.info'] ?? null;

const syncPic = (): void => {
  const img = selDom('image')?.querySelector('img');
  const src = img?.getAttribute('src') ?? '';
  setStyleVar(document.documentElement, '--ft-bpic', src ? `url("${src}")` : 'none');
};

const withPic = (c: Ctl): Ctl => {
  const prev = c.patch;
  c.patch = (info) => { syncPic(); prev?.(info); };
  return c;
};

const pthumb = (filter: string, extra = ''): string => `<span class="ft-bpicthumb" style="filter:${filter};${extra}"></span>`;

const STEPS = [-40, -20, 0, 20, 40];

const correctionItems = (): GItem[] => {
  const out: GItem[] = [];
  for (const c of STEPS) {
    for (const b of STEPS) {
      out.push({
        id: `c${b}_${c}`, name: `Brightness ${b >= 0 ? '+' : ''}${b}%, Contrast ${c >= 0 ? '+' : ''}${c}%`, group: c === STEPS[0] ? 'Brightness and Contrast' : undefined,
        thumb: () => pthumb(`brightness(${(100 + b) / 100}) contrast(${(100 + c) / 100})`),
        run: () => run('picture.adjust', { brightness: 100 + b, contrast: 100 + c }),
      });
    }
  }
  return out.map((i) => ({ ...i, group: 'Brightness and Contrast' }));
};

const colorItems = (): GItem[] => [
  ...[['Grayscale', 0], ['Muted', 50], ['Normal', 100], ['Vivid', 150], ['Very Vivid', 200]].map(([n, s]): GItem => ({
    id: `s${s}`, name: `${n} (saturation ${s}%)`, group: 'Color Saturation', thumb: () => pthumb(`saturate(${Number(s) / 100})`), run: () => run('picture.adjust', { saturation: s }),
  })),
];

const EFFECTS: Array<[string, string, Record<string, number>]> = [
  ['Faded', 'brightness(1.15) contrast(0.8) saturate(0.7)', { brightness: 115, contrast: 80, saturation: 70 }],
  ['Vivid', 'contrast(1.15) saturate(1.6)', { contrast: 115, saturation: 160 }],
  ['Dramatic', 'brightness(0.85) contrast(1.5) saturate(1.1)', { brightness: 85, contrast: 150, saturation: 110 }],
  ['Noir', 'grayscale(1) contrast(1.3)', { saturation: 0, contrast: 130 }],
  ['Matte', 'contrast(0.9) saturate(0.85) brightness(1.05)', { contrast: 90, saturation: 85, brightness: 105 }],
  ['Washed Out', 'brightness(1.3) contrast(0.7) saturate(0.6)', { brightness: 130, contrast: 70, saturation: 60 }],
  ['Warm Glow', 'brightness(1.1) saturate(1.3) sepia(0.35)', { brightness: 110, saturation: 130 }],
  ['Original', 'none', { brightness: 100, contrast: 100, saturation: 100, transparency: 0 }],
];

const effectItems = (): GItem[] => EFFECTS.map(([n, f, p]): GItem => ({ id: `e${n}`, name: n, group: 'Artistic Effects', thumb: () => pthumb(f), run: () => run('picture.adjust', p) }));

const TRANS = [0, 15, 30, 50, 65, 80, 90];
const transItems = (): GItem[] => TRANS.map((t): GItem => ({ id: `t${t}`, name: `Transparency ${t}%`, group: 'Picture Transparency Presets', thumb: () => pthumb('none', `opacity:${1 - t / 100}`), run: () => run('picture.adjust', { transparency: t }) }));

interface PStyle { id: string; name: string; border: string; borderWidth: number; radius: number; shadow: boolean }
const STYLES: PStyle[] = [
  { id: 'plain', name: 'Plain', border: '', borderWidth: 0, radius: 0, shadow: false },
  { id: 'shadow', name: 'Drop Shadow', border: '', borderWidth: 0, radius: 0, shadow: true },
  { id: 'rounded', name: 'Rounded Corners', border: '', borderWidth: 0, radius: 12, shadow: false },
  { id: 'rounded-shadow', name: 'Rounded with Shadow', border: '', borderWidth: 0, radius: 12, shadow: true },
  { id: 'thin', name: 'Thin Black Border', border: '#111111', borderWidth: 1, radius: 0, shadow: false },
  { id: 'thick', name: 'Thick Black Border', border: '#111111', borderWidth: 4, radius: 0, shadow: false },
  { id: 'frame', name: 'Simple Frame, White', border: '#ffffff', borderWidth: 6, radius: 0, shadow: true },
  { id: 'accent', name: 'Accent Border', border: '#f97316', borderWidth: 3, radius: 0, shadow: false },
  { id: 'blue-round', name: 'Rounded Blue Border', border: '#2563eb', borderWidth: 3, radius: 14, shadow: false },
  { id: 'oval', name: 'Oval', border: '', borderWidth: 0, radius: 999, shadow: false },
  { id: 'oval-border', name: 'Oval with Border', border: '#111111', borderWidth: 2, radius: 999, shadow: true },
  { id: 'green-shadow', name: 'Green Border with Shadow', border: '#16a34a', borderWidth: 3, radius: 4, shadow: true },
];

const styleCss = (s: PStyle): string => `border:${s.borderWidth ? `${Math.min(5, s.borderWidth)}px solid ${s.border}` : '0'};border-radius:${s.radius ? `${Math.min(s.radius, 99)}px` : '0'};${s.shadow ? 'box-shadow:2px 3px 5px rgba(0,0,0,0.45);' : ''}`;

const styleItems = (): GItem[] => STYLES.map((s): GItem => ({
  id: s.id, name: s.name, thumb: () => `<span class="ft-bpicthumb is-framed" style="${styleCss(s)}"></span>`,
  run: () => run('picture.style', { border: s.border, borderWidth: s.borderWidth, radius: s.radius, shadow: s.shadow }),
}));

const activeStyle = (i: Info): string | null => {
  const p = pic(i);
  if (!p) return null;
  return STYLES.find((s) => s.border === (p.border || '') && s.borderWidth === (Number(p.borderWidth) || 0) && s.radius === (Number(p.radius) || 0) && s.shadow === !!p.shadow)?.id ?? null;
};

let borderWeight = 2;

const effectsMenu = (): MI[] => [
  { label: 'Shadow', sub: [
    { label: 'No Shadow', run: () => run('picture.style', { shadow: false }) },
    { label: 'Outer Shadow', run: () => run('picture.style', { shadow: true }) },
  ] },
  { label: 'Rounded Corners', sub: [
    { label: 'None', run: () => run('picture.style', { radius: 0 }) },
    { label: 'Small', run: () => run('picture.style', { radius: 6 }) },
    { label: 'Medium', run: () => run('picture.style', { radius: 12 }) },
    { label: 'Large', run: () => run('picture.style', { radius: 24 }) },
    { label: 'Circle', run: () => run('picture.style', { radius: 999 }) },
  ] },
];

const sizeFrom = (i: Info): { w: number; h: number } | null => { const p = pic(i); return p ? { w: Number(p.width), h: Number(p.height) } : null; };

const setSize = (axis: 'w' | 'h', inches: number): void => {
  const n = selNode('image');
  if (!n) return;
  const w0 = Number(n.node.attrs.width);
  const h0 = Number(n.node.attrs.height);
  const ratio = h0 / Math.max(1, w0);
  if (axis === 'w') run('picture.size', { width: pts(inches), height: pts(inches) * ratio });
  else run('picture.size', { width: pts(inches) / ratio, height: pts(inches) });
};

export function pictureSlots(): Record<string, () => HTMLElement> {
  return {
    'b.p.corrections': () => S(withPic(galleryButton({ label: 'Corrections', icon: 'corrections', large: true, items: correctionItems, tw: 54, th: 44, popCols: 5, popHead: 'Corrections', needs: NEED, enabled: (i) => !!pic(i),
      active: (i) => { const p = pic(i); return p ? `c${Number(p.brightness) - 100}_${Number(p.contrast) - 100}` : null; },
      footer: [SEP, { label: 'Reset Picture', icon: 'refresh', cmd: 'picture.reset' }] }))),
    'b.p.color': () => S(withPic(galleryButton({ label: 'Color', icon: 'colorPic', large: true, items: colorItems, tw: 54, th: 44, popCols: 5, popHead: 'Color', needs: NEED, enabled: (i) => !!pic(i),
      active: (i) => { const p = pic(i); return p ? `s${Number(p.saturation)}` : null; } }))),
    'b.p.artistic': () => S(withPic(galleryButton({ label: 'Artistic Effects', icon: 'artistic', large: true, items: effectItems, tw: 54, th: 44, popCols: 4, popHead: 'Artistic Effects', needs: NEED, enabled: (i) => !!pic(i) }))),
    'b.p.transparency': () => S(withPic(galleryButton({ label: 'Transparency', icon: 'transparency', large: true, items: transItems, tw: 54, th: 44, popCols: 4, popHead: 'Transparency', needs: NEED, enabled: (i) => !!pic(i),
      active: (i) => { const p = pic(i); return p ? `t${Number(p.transparency) || 0}` : null; } }))),
    'b.p.change': () => S(button({ label: 'Change Picture', icon: 'changePicture', text: true, cmd: 'picture.change', needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.styles': () => S(withPic(galleryInline({ label: 'Picture Styles', items: styleItems, tw: 58, th: 54, popCols: 4, popHead: 'Picture Styles', needs: NEED, active: activeStyle, enabled: (i) => !!pic(i) }))),
    'b.p.border': () => S(colorButton({
      label: 'Picture Border', icon: 'pictureBorder', text: true, needs: NEED, enabled: (i) => !!pic(i),
      palette: {
        onPick: (c) => run('picture.style', c ? { border: c, borderWidth: borderWeight } : { borderWidth: 0 }),
        none: 'No Outline', noneValue: '',
        extras: [{ label: 'Weight', icon: 'borderWeight', menu: [0.5, 1, 2, 3, 4.5, 6].map((w): MI => ({ label: `${w} pt`, radio: true, checked: () => borderWeight === w, run: () => { borderWeight = w; run('picture.style', { borderWidth: w }); } })) }],
      },
    })),
    'b.p.effects': () => S(button({ label: 'Picture Effects', icon: 'effects', text: true, menu: effectsMenu, needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.position': () => S(withPic(galleryButton({ label: 'Position', icon: 'position', large: true, items: () => positionItems('picture', () => (selNode('image')?.node.attrs as Info) ?? null), tw: 46, th: 42, popCols: 3, needs: NEED, enabled: (i) => !!pic(i) }))),
    'b.p.wrap': () => S(button({ label: 'Wrap Text', icon: 'wrapText', large: true, menu: () => wrapMenu('picture', () => String(selNode('image')?.node.attrs.wrap ?? 'inline'), true), needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.forward': () => S(button({ label: 'Bring Forward', icon: 'bringForward', text: true, split: true, run: () => run('picture.wrap', { wrap: 'front' }), menu: [
      { label: 'Bring in Front of Text', icon: 'bringForward', run: () => run('picture.wrap', { wrap: 'front' }) },
      { label: 'Bring Forward', icon: 'bringForward', run: () => run('picture.wrap', { wrap: 'front' }) },
    ], needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.backward': () => S(button({ label: 'Send Backward', icon: 'sendBackward', text: true, split: true, run: () => run('picture.wrap', { wrap: 'behind' }), menu: [
      { label: 'Send Behind Text', icon: 'sendBackward', run: () => run('picture.wrap', { wrap: 'behind' }) },
      { label: 'Send Backward', icon: 'sendBackward', run: () => run('picture.wrap', { wrap: 'behind' }) },
    ], needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.rotate': () => S(button({ label: 'Rotate', icon: 'rotate', text: true, menu: () => rotateMenu('picture'), needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.crop': () => S(button({ label: 'Crop', icon: 'crop', large: true, split: true, run: () => run('picture.cropTool', { on: true }), menu: [
      { label: 'Crop', icon: 'crop', run: () => run('picture.cropTool', { on: true }) },
      { label: 'Apply Crop', run: () => run('picture.cropTool', { on: true, apply: true }) },
      { label: 'Stop Cropping', run: () => run('picture.cropTool', { on: false }) },
      SEP,
      { label: 'Crop Edges...', cmd: 'picture.crop' },
    ], needs: NEED, enabled: (i) => !!pic(i) })),
    'b.p.height': () => S(spinner({ label: 'Height:', min: 0.1, max: 22, step: 0.1, unit: '"', needs: NEED, get: (i) => { const s = sizeFrom(i); return s ? inch(s.h) : null; }, set: (v) => setSize('h', v) })),
    'b.p.width': () => S(spinner({ label: 'Width:', min: 0.1, max: 22, step: 0.1, unit: '"', needs: NEED, get: (i) => { const s = sizeFrom(i); return s ? inch(s.w) : null; }, set: (v) => setSize('w', v) })),
  };
}
