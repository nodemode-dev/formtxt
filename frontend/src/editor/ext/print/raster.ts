import type { DocEditor } from '../../editor';

const KEEP = ['display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'box-sizing', 'margin', 'padding', 'border', 'border-radius', 'background', 'background-color', 'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'white-space', 'overflow', 'opacity', 'transform', 'transform-origin', 'translate', 'rotate', 'scale', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-opacity', 'stroke-opacity', 'font-variant', 'vertical-align', 'flex', 'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns', 'grid-template-rows', 'place-items', 'filter', 'clip-path', 'object-fit', 'visibility'];

function inline(src: Element, dst: Element): void {
  const cs = getComputedStyle(src);
  const css = KEEP.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';');
  (dst as HTMLElement).setAttribute('style', css);
  for (let i = 0; i < src.children.length; i++) if (dst.children[i]) inline(src.children[i], dst.children[i]);
}

export async function rasterize(el: HTMLElement, scale = 2): Promise<string | null> {
  const r = el.getBoundingClientRect();
  const zoom = r.width && el.offsetWidth ? r.width / el.offsetWidth : 1;
  const w = Math.ceil(r.width / zoom), h = Math.ceil(r.height / zoom);
  if (w < 2 || h < 2) return null;
  const clone = el.cloneNode(true) as HTMLElement;
  inline(el, clone);
  clone.style.margin = '0';
  clone.style.position = 'static';
  clone.style.transform = 'none';
  clone.style.translate = 'none';
  clone.querySelectorAll('img').forEach((img) => img.remove());
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}"><foreignObject width="${w}" height="${h}" transform="scale(${scale})"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px">${xml}</div></foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try { await img.decode(); } catch { return null; }
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0);
  try { return canvas.toDataURL('image/png'); } catch { return null; }
}

const fx = (v: unknown): string => (Number(v) || 0).toFixed(2);

export function shapeKey(a: Record<string, unknown>): string {
  return JSON.stringify([String(a.kind ?? ''), fx(a.width), fx(a.height), fx(a.x), fx(a.y), String(a.path ?? ''), String(a.text ?? '')]);
}

export async function drawings(ed: DocEditor): Promise<{ blocks: Record<string, string>; shapes: Record<string, string> }> {
  const out = { blocks: {} as Record<string, string>, shapes: {} as Record<string, string> };
  const view = ed.view;
  if (!view) return out;
  const jobs: Array<Promise<void>> = [];
  view.state.doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === 'chart' || name === 'diagram' || name === 'mermaid' || name === 'shape') {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) {
        const target = name === 'shape' ? (dom.querySelector<HTMLElement>('.ft-shape-frame') ?? dom) : dom;
        jobs.push(rasterize(target).then((url) => {
          if (!url) return;
          if (name === 'shape') out.shapes[shapeKey(node.attrs)] = url;
          else if (node.attrs.id) out.blocks[String(node.attrs.id)] = url;
        }));
      }
      return false;
    }
    return true;
  });
  await Promise.all(jobs);
  return out;
}
