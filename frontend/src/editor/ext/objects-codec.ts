import type { Node as PMNode } from 'prosemirror-model';
import { cleanFeatures } from './objects-spec';
import { type AreaCodec, type InlineCodec, type MarkCodec, emptyCodec } from './types';

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const safeName = (v: unknown): string => (/^[A-Za-z0-9._-]{1,80}$/.test(String(v)) ? String(v) : '');

const KIND_OF: Record<string, string> = { video: 'video', audio: 'audio', embed: 'embed', onlineVideo: 'online' };
const TYPE_OF: Record<string, string> = { video: 'video', audio: 'audio', embed: 'embed', online: 'onlineVideo' };

function cleanRows(v: unknown): string[][] | null {
  if (!Array.isArray(v)) return null;
  const rows = v.slice(0, 7).map((r) => (Array.isArray(r) ? r.slice(0, 6).map((c) => str(c, 40)) : [])).filter((r) => r.length);
  return rows.length ? rows : null;
}

function objectCodec(type: string): InlineCodec {
  const kind = KIND_OF[type];
  return {
    node: 'object',
    toPM: (run, schema) => {
      const w = num(run.width, 24, 2000, kind === 'audio' ? 300 : 320);
      const attrs: Record<string, unknown> = {
        kind, width: w, height: num(run.height, 24, 2000, kind === 'audio' ? 40 : kind === 'embed' ? 72 : 180),
        wrap: run.wrap === 'square' ? 'square' : 'inline', side: run.side === 'right' ? 'right' : 'left',
      };
      if (kind === 'online') {
        const provider = run.provider === 'vimeo' ? 'vimeo' : 'youtube';
        Object.assign(attrs, { provider, vid: str(run.id, 40), hash: str(run.hash, 24), link: str(run.link, 600), name: str(run.title, 200), author: str(run.author, 120), poster: safeName(run.poster) });
        if (!/^[A-Za-z0-9_-]{4,40}$/.test(String(attrs.vid))) return null;
      } else {
        const media = safeName(run.media);
        if (!media) return null;
        Object.assign(attrs, { media, name: str(run.name, 200), bytes: num(run.bytes, 0, 1e10, 0), mime: str(run.mime, 80) });
        if (kind === 'embed') Object.assign(attrs, { thumb: safeName(run.thumb), rows: cleanRows(run.rows), pages: num(run.pages, 0, 100000, 0) });
      }
      return schema.nodes.object.create(attrs);
    },
    fromPM: (n: PMNode) => {
      const a = n.attrs;
      const out: Record<string, unknown> = { type: TYPE_OF[String(a.kind)] ?? 'embed' };
      if (a.kind === 'online') Object.assign(out, { provider: a.provider, id: a.vid, link: a.link, title: a.name, poster: a.poster, ...(a.hash ? { hash: a.hash } : {}), ...(a.author ? { author: a.author } : {}) });
      else {
        Object.assign(out, { media: a.media, name: a.name, bytes: a.bytes });
        if (a.mime) out.mime = a.mime;
        if (a.kind === 'embed') {
          if (a.thumb) out.thumb = a.thumb;
          if (a.rows) out.rows = a.rows;
          if (a.pages) out.pages = a.pages;
        }
      }
      out.width = a.width;
      out.height = a.height;
      if (a.wrap !== 'inline') { out.wrap = a.wrap; out.side = a.side; }
      return out;
    },
  };
}

const kerning: MarkCodec = {
  mark: 'kerning',
  toPM: (v, schema) => (v === false || v === null || v === undefined ? null : schema.marks.kerning.create({ min: num(v === true ? 0 : v, 0, 1638, 0) })),
  fromPM: (m) => Number(m.attrs.min) || 0,
};

const scale: MarkCodec = {
  mark: 'scale',
  toPM: (v, schema) => {
    const pct = num(v, 20, 600, 100);
    return pct === 100 ? null : schema.marks.scale.create({ pct });
  },
  fromPM: (m) => m.attrs.pct,
};

const position: MarkCodec = {
  mark: 'position',
  toPM: (v, schema) => {
    const pt = num(v, -1584, 1584, 0);
    return pt ? schema.marks.position.create({ pt }) : null;
  },
  fromPM: (m) => m.attrs.pt,
};

const otf: MarkCodec = {
  mark: 'otf',
  toPM: (v, schema) => {
    const f = cleanFeatures(v);
    return f ? schema.marks.otf.create(f) : null;
  },
  fromPM: (m) => {
    const f = cleanFeatures(m.attrs) ?? { lig: '', num: '', nsp: '', ss: 0 };
    const out: Record<string, unknown> = {};
    if (f.lig) out.ligatures = f.lig;
    if (f.num) out.numberForm = f.num;
    if (f.nsp) out.numberSpacing = f.nsp;
    if (f.ss) out.stylisticSet = f.ss;
    return out;
  },
};

export const CODEC: AreaCodec = {
  ...emptyCodec(),
  inline: { video: objectCodec('video'), audio: objectCodec('audio'), embed: objectCodec('embed'), onlineVideo: objectCodec('onlineVideo') },
  marks: { kerning, scale, position, features: otf },
};
