/**
 * A function body, instruction by instruction: each method writes one WebAssembly instruction's bytes (the
 * WebAssembly Core Specification, section 5.4, "Instructions", and the SIMD and relaxed SIMD proposals' opcode
 * tables). Methods return the body, so instructions chain in the order they run on the stack machine.
 */
import { s32, u32, type ValueType } from './encode.js';

/** The SIMD instructions' prefix byte: each is 0xfd, then its number in LEB128. */
const SIMD = 0xfd;

/** A local variable: its index in the function. */
export type Local = number;

export class Code {
  readonly bytes: number[] = [];
  readonly #params: number;
  readonly #locals: ValueType[] = [];

  /** A body for a function with `params` parameters; they are locals 0 to params − 1. */
  constructor(params: number) {
    this.#params = params;
  }

  /** A new local of this type, after the parameters. */
  local(type: ValueType): Local {
    this.#locals.push(type);
    return this.#params + this.#locals.length - 1;
  }

  /** The body as the code section holds it: its size, its locals (in runs of one type), its instructions, `end`. */
  encode(): number[] {
    const runs: [number, ValueType][] = [];
    for (const t of this.#locals) {
      const last = runs[runs.length - 1];
      if (last && last[1] === t) last[0]++;
      else runs.push([1, t]);
    }
    const body = [...u32(runs.length), ...runs.flatMap(([n, t]) => [...u32(n), t]), ...this.bytes, 0x0b];
    return [...u32(body.length), ...body];
  }

  #op(...bytes: number[]): this {
    this.bytes.push(...bytes);
    return this;
  }

  #simd(op: number, ...rest: number[]): this {
    return this.#op(SIMD, ...u32(op), ...rest);
  }

  /** A memory argument: the alignment, as a power of two, and a constant offset in bytes. */
  #mem(align: number, offset: number): number[] {
    return [...u32(align), ...u32(offset)];
  }

  // Control

  /** `block`, with no result: `br` to it jumps past its `end`. */
  block(): this { return this.#op(0x02, 0x40); }
  /** `loop`, with no result: `br` to it jumps back to its start. */
  loop(): this { return this.#op(0x03, 0x40); }
  /** `end` of a block or loop. */
  end(): this { return this.#op(0x0b); }
  /** `br depth`: jump to the enclosing block or loop `depth` levels out (0 is the innermost). */
  br(depth: number): this { return this.#op(0x0c, ...u32(depth)); }
  /** `br_if depth`: as br(), when the i32 on the stack isn't 0. */
  brIf(depth: number): this { return this.#op(0x0d, ...u32(depth)); }

  // Locals

  /** `local.get` */
  get(l: Local): this { return this.#op(0x20, ...u32(l)); }
  /** `local.set` */
  set(l: Local): this { return this.#op(0x21, ...u32(l)); }
  /** `local.tee`: set, and leave the value on the stack. */
  tee(l: Local): this { return this.#op(0x22, ...u32(l)); }

  // i32

  /** `i32.const` */
  i32(n: number): this { return this.#op(0x41, ...s32(n)); }
  /** `i32.add` */
  i32Add(): this { return this.#op(0x6a); }
  /** `i32.sub` */
  i32Sub(): this { return this.#op(0x6b); }
  /** `i32.mul` */
  i32Mul(): this { return this.#op(0x6c); }
  /** `i32.ne`: 1 when a ≠ b. */
  i32Ne(): this { return this.#op(0x47); }
  /** `i32.lt_u`: 1 when a < b, unsigned. */
  i32LtU(): this { return this.#op(0x49); }
  /** `i32.ge_u`: 1 when a ≥ b, unsigned. */
  i32GeU(): this { return this.#op(0x4f); }

  // f64

  /** `f64.load`, 8-byte aligned. */
  f64Load(offset = 0): this { return this.#op(0x2b, ...this.#mem(3, offset)); }
  /** `f64.store`, 8-byte aligned. */
  f64Store(offset = 0): this { return this.#op(0x39, ...this.#mem(3, offset)); }
  /** `f64.add` */
  f64Add(): this { return this.#op(0xa0); }

  // v128 and f64x2: two 64-bit floats side by side

  /** `v128.load`, 16-byte aligned: two f64 from memory. */
  v128Load(offset = 0): this { return this.#simd(0x00, ...this.#mem(4, offset)); }
  /** `v128.store`, 16-byte aligned: two f64 to memory (address, then value, on the stack). */
  v128Store(offset = 0): this { return this.#simd(0x0b, ...this.#mem(4, offset)); }
  /** `v128.const 0`: sixteen bytes of zero, so 0 in both f64 lanes. */
  v128Zero(): this { return this.#simd(0x0c, ...Array<number>(16).fill(0)); }
  /** `f64x2.splat`: an f64 in both lanes. */
  f64x2Splat(): this { return this.#simd(0x14); }
  /** `f64x2.extract_lane lane`: one lane, as an f64. */
  f64x2ExtractLane(lane: 0 | 1): this { return this.#simd(0x21, lane); }
  /** `f64x2.add`, lane by lane. */
  f64x2Add(): this { return this.#simd(0xf0); }
  /** `f64x2.mul`, lane by lane. */
  f64x2Mul(): this { return this.#simd(0xf2); }
  /**
   * `f64x2.relaxed_madd` (relaxed SIMD): a · b + c, lane by lane, with one rounding where the processor fuses it and
   * two where it doesn't.
   */
  f64x2RelaxedMadd(): this { return this.#simd(0x107); }

  // More f64x2, and the bit-level v128 and i64x2 instructions the math functions (math.ts) need

  /** `v128.const`: two f64, lane 0 then lane 1, as their little-endian bytes. */
  f64x2Const(a: number, b = a): this {
    const bytes = new Uint8Array(new Float64Array([a, b]).buffer);
    return this.#simd(0x0c, ...bytes);
  }
  /** `v128.const`: two 64-bit integers' bits, lane 0 then lane 1, little-endian. */
  i64x2Const(a: bigint, b = a): this {
    const bytes = new Uint8Array(new BigUint64Array([a, b]).buffer);
    return this.#simd(0x0c, ...bytes);
  }
  /** `f64x2.sub`, lane by lane. */
  f64x2Sub(): this { return this.#simd(0xf1); }
  /** `f64x2.div`, lane by lane. */
  f64x2Div(): this { return this.#simd(0xf3); }
  /** `f64x2.max`, lane by lane. */
  f64x2Max(): this { return this.#simd(0xf5); }
  /** `f64x2.abs`, lane by lane. */
  f64x2Abs(): this { return this.#simd(0xec); }
  /** `f64x2.neg`, lane by lane. */
  f64x2Neg(): this { return this.#simd(0xed); }
  /** `f64x2.nearest`: rounded to the nearest whole number, ties to even, lane by lane. */
  f64x2Nearest(): this { return this.#simd(0x94); }
  /** `f64x2.eq`: all ones in a lane where a = b, else zeros. */
  f64x2Eq(): this { return this.#simd(0x47); }
  /** `f64x2.lt`: all ones in a lane where a < b, else zeros. */
  f64x2Lt(): this { return this.#simd(0x49); }
  /** `f64x2.ge`: all ones in a lane where a ≥ b, else zeros. */
  f64x2Ge(): this { return this.#simd(0x4c); }
  /** `v128.and` */
  v128And(): this { return this.#simd(0x4e); }
  /** `v128.or` */
  v128Or(): this { return this.#simd(0x50); }
  /** `v128.bitselect`: bits of a where the mask (on top of the stack) is 1, of b where it is 0. */
  v128Bitselect(): this { return this.#simd(0x52); }
  /** `i64x2.shl`: each 64-bit lane shifted left by an i32 count. */
  i64x2Shl(): this { return this.#simd(0xcb); }
  /** `i64x2.shr_u`: each 64-bit lane shifted right, unsigned, by an i32 count. */
  i64x2ShrU(): this { return this.#simd(0xcd); }
  /** `i64x2.sub`, lane by lane. */
  i64x2Sub(): this { return this.#simd(0xd1); }
}
