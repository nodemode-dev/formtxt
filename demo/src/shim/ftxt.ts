export interface Entry { name: string; data: Uint8Array }

const u16 = (b: DataView, at: number): number => b.getUint16(at, true);
const u32 = (b: DataView, at: number): number => b.getUint32(at, true);

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const body = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export async function unzip(bytes: Uint8Array): Promise<Entry[]> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && u32(v, end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('This is not a .ftxt file.');
  const count = u16(v, end + 10);
  let at = u32(v, end + 16);
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(v, at) !== 0x02014b50) throw new Error('The .ftxt file is damaged.');
    const method = u16(v, at + 10);
    const size = u32(v, at + 20);
    const nameLen = u16(v, at + 28);
    const local = u32(v, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + u16(v, at + 30) + u16(v, at + 32);
    const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    const raw = bytes.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`The .ftxt file packs ${name} in a way the page cannot read.`);
    out.push({ name, data: method === 8 ? await inflate(raw) : raw.slice() });
  }
  return out;
}
