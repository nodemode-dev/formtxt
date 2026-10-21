import { api } from '../../../io/api';
import type { DocEditor } from '../../editor';
import { fitSize, insertPicture, naturalSize } from '../../picture';
import { mediaUrl, schema } from '../../schema';
import { Selection, TextSelection, NodeSelection } from 'prosemirror-state';
import { requireOn } from './state';

export const SIZES: Array<[string, string]> = [['1024x1024', 'Square'], ['1536x1024', 'Wide'], ['1024x1536', 'Tall']];

interface Made { name: string; w: number; h: number }

async function generate(ed: DocEditor, prompt: string, size: string): Promise<Made> {
  const s = await requireOn();
  if (!s.imageAvailable) throw new Error('This provider has no image endpoint. Use Insert > Stock images, or add an image address in AI settings.');
  if (!ed.doc || !ed.view) throw new Error('Open a document first.');
  const id = ed.doc.id;
  const out = await api.post<{ media: { name: string; type: string; bytes: number; source: string } }>('/ai/image', { prompt, size, documentId: id });
  if (!ed.doc || ed.doc.id !== id) throw new Error('The document closed before the picture arrived.');
  const m = out.media;
  const { w, h } = await naturalSize(mediaUrl(m.name));
  ed.doc = { ...ed.doc, media: { ...(ed.doc.media ?? {}), [m.name]: { type: m.type, bytes: m.bytes, source: m.source, width: w, height: h } } };
  return { name: m.name, w, h };
}

export async function insertGenerated(ed: DocEditor, prompt: string, size: string): Promise<string> {
  const made = await generate(ed, prompt, size);
  const view = ed.view;
  if (!view) throw new Error('The document closed before the picture arrived.');
  const sel = view.state.selection;
  if (sel instanceof NodeSelection) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(sel.to))));
  const fit = fitSize(made.w, made.h, ed.bodyWidth(), ed.bodyHeight() - 24);
  ed.run(insertPicture({ media: made.name, alt: prompt.slice(0, 200), ...fit }));
  return made.name;
}

export async function insertBanner(ed: DocEditor, prompt: string, title: string): Promise<string> {
  const made = await generate(ed, prompt, '1536x1024');
  const view = ed.view;
  if (!view) throw new Error('The document closed before the picture arrived.');
  const width = Math.round(ed.bodyWidth() * 100) / 100;
  const aspect = made.w / made.h;
  const target = 3;
  const crop = { t: 0, r: 0, b: 0, l: 0 };
  let height = width / aspect;
  if (aspect < target) {
    const cut = Math.min(0.9, (1 - aspect / target) / 2);
    crop.t = crop.b = Math.round(cut * 1000) / 1000;
    height = width / target;
  } else if (aspect > target) {
    const cut = Math.min(0.9, (1 - target / aspect) / 2);
    crop.l = crop.r = Math.round(cut * 1000) / 1000;
    height = width / target;
  }
  const pic = schema.nodes.image.create({ media: made.name, alt: prompt.slice(0, 200), width, height: Math.round(height * 100) / 100, crop });
  const nodes = [schema.nodes.paragraph.create({ style: 'Normal', spaceAfter: 6 }, pic)];
  if (title.trim()) nodes.push(schema.nodes.paragraph.create({ style: 'Title' }, schema.text(title.trim())));
  const tr = view.state.tr.insert(0, nodes);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.doc.content.size, nodes.reduce((n, x) => n + x.nodeSize, 0))), -1));
  view.dispatch(tr.scrollIntoView());
  return made.name;
}
