// crc32 of a string, the same as Python's zlib.crc32(value.encode()) & 0x7fffffff. Exact-match values are
// stored in Typesense as these numbers (search/typesense/load-leads.py), so filters hash the same way.
const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc(value: string): number {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(value)) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0) & 0x7fffffff;
}
