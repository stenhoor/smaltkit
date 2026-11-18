/**
 * The WebAssembly binary format's encodings (the WebAssembly Core Specification, section 5, "Binary Format"): numbers
 * in LEB128, names, vectors and sections. Every byte a module built here holds is written by these functions or by
 * code.ts's instructions.
 */

/** An unsigned whole number in LEB128: seven bits a byte, low bits first, the top bit set on every byte but the last. */
export function u32(n: number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError(`u32 out of range: ${n}`);
  const out: number[] = [];
  do {
    let byte = n & 0x7f;
    n = Math.floor(n / 128);
    if (n !== 0) byte |= 0x80;
    out.push(byte);
  } while (n !== 0);
  return out;
}

/** A signed whole number in LEB128: as u32(), in two's complement, until the rest is all sign. */
export function s32(n: number): number[] {
  if (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff) throw new RangeError(`s32 out of range: ${n}`);
  const out: number[] = [];
  for (;;) {
    const byte = n & 0x7f;
    n >>= 7;
    const done = (n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) return out;
  }
}

/** A name: its UTF-8 length, then its bytes. */
export function name(s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  return [...u32(bytes.length), ...bytes];
}

/** A vector: the number of items, then the items. */
export function vec(items: number[][]): number[] {
  return [...u32(items.length), ...items.flat()];
}

/** A section: its id, its size in bytes, then its contents. */
export function section(id: number, contents: number[]): number[] {
  return [id, ...u32(contents.length), ...contents];
}

/** Value types. */
export const I32 = 0x7f;
export const F64 = 0x7c;
export const V128 = 0x7b;
export type ValueType = typeof I32 | typeof F64 | typeof V128;
