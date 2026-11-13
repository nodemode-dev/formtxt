import retired from '../data/retired-icons.json';

const paths = new Set(Object.values(retired.tabler).flat());
const emoji = new Set(retired.emoji);

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function retiredPath(d: string): boolean {
  return !!d && paths.has(fnv(d));
}

export function retiredEmoji(char: string): boolean {
  return emoji.has([...char].filter((c) => c !== '️').map((c) => c.codePointAt(0)!.toString(16)).join('-'));
}
