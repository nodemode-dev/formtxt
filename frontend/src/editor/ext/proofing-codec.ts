import { type AreaCodec, emptyCodec } from './types';

export const CODEC: AreaCodec = {
  ...emptyCodec(),
  marks: {
    lang: {
      mark: 'lang',
      toPM: (value, schema) => (typeof value === 'string' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value) ? schema.marks.lang.create({ code: value }) : null),
      fromPM: (mark) => String(mark.attrs.code),
    },
  },
};
