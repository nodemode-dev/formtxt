import type { Mark, Schema } from 'prosemirror-model';
import { type AreaCodec, type MarkCodec, emptyCodec } from './types';

const change = (name: 'ins' | 'del'): MarkCodec => ({
  mark: name,
  toPM(value: unknown, schema: Schema): Mark | null {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    return schema.marks[name].create({ id: String(v.id ?? ''), author: String(v.author ?? ''), time: Number(v.time ?? 0) || 0 });
  },
  fromPM(mark: Mark): unknown {
    return { id: mark.attrs.id, author: mark.attrs.author, time: mark.attrs.time };
  },
});

export const CODEC: AreaCodec = {
  ...emptyCodec(),
  marks: {
    comment: {
      mark: 'comment',
      toPM(value: unknown, schema: Schema): Mark | null {
        const ids = (Array.isArray(value) ? value : [value]).map((v) => String(v ?? '')).filter(Boolean);
        return ids.length ? schema.marks.comment.create({ ids }) : null;
      },
      fromPM(mark: Mark): unknown {
        return mark.attrs.ids;
      },
    },
    ins: change('ins'),
    del: change('del'),
    fmt: {
      mark: 'fmt',
      toPM(value: unknown, schema: Schema): Mark | null {
        if (!value || typeof value !== 'object') return null;
        const v = value as Record<string, unknown>;
        const ops = Array.isArray(v.ops) ? v.ops.filter((o) => o && typeof o === 'object') : [];
        return schema.marks.fmt.create({ id: String(v.id ?? ''), author: String(v.author ?? ''), time: Number(v.time ?? 0) || 0, ops });
      },
      fromPM(mark: Mark): unknown {
        return { id: mark.attrs.id, author: mark.attrs.author, time: mark.attrs.time, ops: mark.attrs.ops };
      },
    },
  },
};
