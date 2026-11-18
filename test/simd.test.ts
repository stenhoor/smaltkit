// smaltkit/simd: the binary format's encodings, the instruction writer and module builder, Room, the engine's support,
// and the f64x2 math against JavaScript's Math.
// The math: the f64x2 math functions (simdMath) against JavaScript's Math, over their whole domains and their edges: the
// worst difference, in units in the last place (ulps) of the result as Math gives it. Measured over a million random
// inputs per range (2026-11-17): exp within 1 ulp, log1p and ln within 3; Math's own rounding is part of that.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Code, encode, F64, I32, ModuleBuilder, Room, simdMath, simdSupport, V128 } from 'smaltkit/simd';

test('LEB128, as the specification\'s examples give it', () => {
  assert.deepEqual(encode.u32(0), [0x00]);
  assert.deepEqual(encode.u32(127), [0x7f]);
  assert.deepEqual(encode.u32(128), [0x80, 0x01]);
  assert.deepEqual(encode.u32(624485), [0xe5, 0x8e, 0x26]);
  assert.deepEqual(encode.u32(0xffffffff), [0xff, 0xff, 0xff, 0xff, 0x0f]);
  assert.deepEqual(encode.s32(0), [0x00]);
  assert.deepEqual(encode.s32(63), [0x3f]);
  assert.deepEqual(encode.s32(64), [0xc0, 0x00]);
  assert.deepEqual(encode.s32(-1), [0x7f]);
  assert.deepEqual(encode.s32(-64), [0x40]);
  assert.deepEqual(encode.s32(-65), [0xbf, 0x7f]);
  assert.deepEqual(encode.s32(-123456), [0xc0, 0xbb, 0x78]);
  assert.throws(() => encode.u32(-1), RangeError);
  assert.throws(() => encode.s32(2 ** 31), RangeError);
  assert.deepEqual(encode.section(1, [1, 2, 3]), [1, 3, 1, 2, 3]);
});

test('a module built here runs: f64x2 arithmetic through memory', async () => {
  // dot(a, b) for two pairs of f64 at addresses a and b: lane 0 + lane 1 of a · b, fused or not.
  for (const fused of [false, true]) {
    const c = new Code(2);
    const acc = c.local(V128);
    c.v128Zero().set(acc);
    if (fused) c.get(0).v128Load().get(1).v128Load().get(acc).f64x2RelaxedMadd().set(acc);
    else c.get(acc).get(0).v128Load().get(1).v128Load().f64x2Mul().f64x2Add().set(acc);
    c.get(acc).f64x2ExtractLane(0).get(acc).f64x2ExtractLane(1).f64Add();
    const bytes = new ModuleBuilder().memory(1).func('dot', [I32, I32], [F64], c).encode();
    assert.ok(WebAssembly.validate(bytes));
    // The module imports its memory (env.memory).
    const memory = new WebAssembly.Memory({ initial: 1 });
    const { instance } = (await WebAssembly.instantiate(bytes, { env: { memory } })) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
    const ex = instance.exports as { dot(a: number, b: number): number };
    new Float64Array(memory.buffer).set([1.5, -2, 4, 0.25]);
    assert.equal(ex.dot(0, 16), 1.5 * 4 + -2 * 0.25);
  }
});

test('loops and branches: a sum of 1 to n', async () => {
  const c = new Code(1);
  const i = c.local(I32);
  const s = c.local(I32);
  c.i32(0).set(s).i32(1).set(i);
  c.block().loop();
  c.get(i).get(0).i32GeU().brIf(1); // stop once i ≥ n + 1
  c.get(s).get(i).i32Add().set(s);
  c.get(i).i32(1).i32Add().set(i);
  c.br(0).end().end();
  c.get(s);
  const bytes = new ModuleBuilder().func('sum', [I32], [I32], c).encode();
  const { instance } = (await WebAssembly.instantiate(bytes)) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
  assert.equal((instance.exports as { sum(n: number): number }).sum(101), 5050);
});

test('Room: a larger reserve makes a new memory, zeroed, and never grows one', async () => {
  const c = new Code(1);
  c.get(0).f64Load().get(0).f64Load().f64Add();
  const module = await WebAssembly.compile(new ModuleBuilder().memory(1).func('twice', [I32], [F64], c).encode());
  const grow = WebAssembly.Memory.prototype.grow;
  let grew = 0;
  WebAssembly.Memory.prototype.grow = function (pages: number) {
    grew++;
    return grow.call(this, pages);
  };
  try {
    const room = new Room<{ twice(at: number): number }>(module);
    const small = room.reserve(16);
    small[1] = 21;
    assert.equal(room.exports.twice(8), 42);
    assert.equal(room.reserve(8), small, 'enough room: the same memory');
    const big = room.reserve(3 * 65536);
    assert.ok(big.byteLength >= 3 * 65536);
    assert.equal(big[1], 0, 'a new memory starts at zero');
    big[100] = 2.5;
    assert.equal(room.exports.twice(800), 5, 'the new instance works on the new memory');
  } finally {
    WebAssembly.Memory.prototype.grow = grow;
  }
  assert.equal(grew, 0);
});

test('Node has WebAssembly SIMD and relaxed SIMD', () => {
  assert.deepEqual(simdSupport(), { simd: true, relaxed: true });
});

test('without WebAssembly, nothing is supported', () => {
  const saved = globalThis.WebAssembly;
  try {
    // @ts-expect-error: removed for the test
    delete globalThis.WebAssembly;
    assert.deepEqual(simdSupport(), { simd: false, relaxed: false });
  } finally {
    globalThis.WebAssembly = saved;
  }
});

type Emit = (c: Code, x: number, out: number) => void;

/** A module whose `f(count)` applies the function to `count` (even) f64 at address 0, in place. */
function apply(emit: Emit): (xs: Float64Array) => Float64Array {
  const c = new Code(1);
  const at = c.local(I32);
  const x = c.local(V128);
  const out = c.local(V128);
  c.i32(0).set(at);
  c.block().loop();
  c.get(at).get(0).i32(8).i32Mul().i32GeU().brIf(1);
  c.get(at).v128Load().set(x);
  emit(c, x, out);
  c.get(at).get(out).v128Store();
  c.get(at).i32(16).i32Add().set(at);
  c.br(0).end().end();
  const mod = new ModuleBuilder().memory(1).func('f', [I32], [], c).encode();
  assert.ok(WebAssembly.validate(mod));
  const compiled = new WebAssembly.Module(mod);
  // The module imports its memory: a new, larger one where more is needed, as Room does.
  let memory = new WebAssembly.Memory({ initial: 1 });
  let ex = new WebAssembly.Instance(compiled, { env: { memory } }).exports as { f(count: number): void };
  return (xs) => {
    const n = xs.length + (xs.length & 1);
    const need = n * 8;
    if (memory.buffer.byteLength < need) {
      memory = new WebAssembly.Memory({ initial: Math.ceil(need / 65536) });
      ex = new WebAssembly.Instance(compiled, { env: { memory } }).exports as { f(count: number): void };
    }
    const mem = new Float64Array(memory.buffer, 0, n);
    mem.fill(0);
    mem.set(xs);
    ex.f(n);
    return mem.slice(0, xs.length);
  };
}

/** The size of one ulp at v. */
function ulp(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return Number.MIN_VALUE;
  return Math.max(2 ** (Math.floor(Math.log2(a)) - 52), Number.MIN_VALUE);
}

function worstUlps(got: Float64Array, want: (x: number) => number, xs: Float64Array): { ulps: number; at: number } {
  let worst = { ulps: 0, at: NaN };
  for (let i = 0; i < xs.length; i++) {
    const w = want(xs[i]!);
    const u = Math.abs(got[i]! - w) / ulp(w);
    if (!(u <= worst.ulps)) worst = { ulps: u, at: xs[i]! };
  }
  return worst;
}

function grid(from: number, to: number, n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

test('exp(x), x ≤ 0: within 2 ulps of Math.exp down to −708, then 0', () => {
  const f = apply(simdMath.exp);
  const xs = Float64Array.from([...grid(-708, 0, 200_001), ...grid(-1, 0, 100_001), ...grid(-1e-12, 0, 1001), -0, -5e-324, -0.34657359027997264, -0.6931471805599453]);
  const w = worstUlps(f(xs), Math.exp, xs);
  assert.ok(w.ulps <= 2, `worst ${w.ulps} ulps at ${w.at}`);
  assert.deepEqual(Array.from(f(Float64Array.from([-708.5, -800, -Infinity]))), [0, 0, 0]);
  assert.equal(f(Float64Array.from([0]))[0], 1);
});

test('log1p(u), 0 ≤ u ≤ 1: within 3 ulps of Math.log1p', () => {
  const f = apply(simdMath.log1p);
  const xs = Float64Array.from([...grid(0, 1, 200_001), ...grid(0, 1e-8, 10_001), 5e-324, 1e-300, 1]);
  const w = worstUlps(f(xs), Math.log1p, xs);
  assert.ok(w.ulps <= 3, `worst ${w.ulps} ulps at ${w.at}`);
  assert.equal(f(Float64Array.from([0]))[0], 0);
});

test('ln x, x ≥ 1: within 3 ulps of Math.log', () => {
  const f = apply(simdMath.logAtLeast1);
  const xs = Float64Array.from([...grid(1, 2, 100_001), ...grid(1, 1000, 100_001), 1 + 2 ** -52, 2 - 2 ** -52, 2, 4, 1e10, 1e300]);
  const w = worstUlps(f(xs), Math.log, xs);
  assert.ok(w.ulps <= 3, `worst ${w.ulps} ulps at ${w.at}`);
  assert.equal(f(Float64Array.from([1]))[0], 0);
});
