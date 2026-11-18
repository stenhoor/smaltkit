/**
 * What this JavaScript engine's WebAssembly offers: 128-bit SIMD (every major browser since 2021–2023, and Node), and
 * relaxed SIMD's fused multiply-add (Chrome 114 and later; not in every browser). Each is found by validating a
 * module of a few bytes that uses it, written out below, byte by byte.
 */

/** The module header: "\0asm", then version 1. */
const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

/** A module with one function, of type `params → v128`, whose body is `code` (no locals). */
function module(params: number, code: number[]): Uint8Array<ArrayBuffer> {
  const V128 = 0x7b;
  const type = [0x01, 0x60, params, ...Array<number>(params).fill(V128), 0x01, V128];
  const body = [0x00, ...code, 0x0b]; // no locals, the instructions, end
  return Uint8Array.from([
    ...HEADER,
    0x01, type.length, ...type, // type section: one function type
    0x03, 0x02, 0x01, 0x00, // function section: one function, of type 0
    0x0a, body.length + 2, 0x01, body.length, ...body, // code section: its body
  ]);
}

/** `v128.const 0`: the SIMD prefix 0xfd, then instruction 12 and sixteen bytes of zero. */
const SIMD = module(0, [0xfd, 0x0c, ...Array<number>(16).fill(0)]);

/** `f64x2.relaxed_madd` of three parameters: local.get 0, 1 and 2, then the SIMD prefix and instruction 0x107. */
const RELAXED = module(3, [0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0xfd, 0x87, 0x02]);

/** What this engine's WebAssembly supports. */
export interface SimdSupport {
  /** 128-bit SIMD: modules using `v128` instructions validate and run. */
  simd: boolean;
  /** Relaxed SIMD: `f64x2.relaxed_madd` and the other relaxed instructions are available. */
  relaxed: boolean;
}

function valid(bytes: Uint8Array<ArrayBuffer>): boolean {
  const wasm = (globalThis as { WebAssembly?: { validate(b: Uint8Array<ArrayBuffer>): boolean } }).WebAssembly;
  try {
    return !!wasm && wasm.validate(bytes);
  } catch {
    return false;
  }
}

/** Whether this engine has WebAssembly SIMD, and relaxed SIMD. Doesn't compile or run anything. */
export function simdSupport(): SimdSupport {
  const simd = valid(SIMD);
  return { simd, relaxed: simd && valid(RELAXED) };
}

/** The probe modules simdSupport() validates, for tests. */
export const probes = { SIMD, RELAXED };
