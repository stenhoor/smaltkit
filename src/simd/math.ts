/**
 * Math functions on f64x2, written into a function body as instructions: WebAssembly has no SIMD exp or log, so kernels
 * that need them carry their own. Each is our own, from its definition: a range reduction and a polynomial or series
 * whose truncation error is far below a rounding step, so results agree with Math.exp, Math.log1p and Math.log to
 * within a few rounding steps (test/math.test.ts: exp within 1 ulp, log1p and ln within 3), but not bit for bit.
 *
 * Each takes its argument from a local and leaves its result in another; the locals it needs on the way are its own.
 */
import type { Code, Local } from './code.js';
import { V128 } from './encode.js';

/**
 * out = a₀ + a₁x + … + aₙxⁿ: the low `exact` terms by Horner's rule, a₀ + x(a₁ + x(… + x·T)), and the tail T by
 * Estrin's scheme (pairs a₂ᵢ + a₂ᵢ₊₁x, then pairs of those with x², then x⁴ …). Estrin's chain of dependent
 * multiply-adds is about log₂ n long, against Horner's n, so the processor overlaps the rest; Horner's last steps keep
 * the rounding of the large low-order terms as small as a plain Horner evaluation's.
 */
export function polynomial(c: Code, x: Local, coefficients: readonly number[], out: Local, exact = 2): void {
  const tail = coefficients.slice(exact);
  let terms: Local[] = [];
  for (let i = 0; i < tail.length; i += 2) {
    const t = c.local(V128);
    if (i + 1 < tail.length) c.get(x).f64x2Const(tail[i + 1]!).f64x2Mul().f64x2Const(tail[i]!).f64x2Add().set(t);
    else c.f64x2Const(tail[i]!).set(t);
    terms.push(t);
  }
  let power = c.local(V128);
  c.get(x).get(x).f64x2Mul().set(power); // x², then x⁴, x⁸ …
  while (terms.length > 1) {
    const next: Local[] = [];
    for (let i = 0; i < terms.length; i += 2) {
      if (i + 1 < terms.length) c.get(terms[i]!).get(terms[i + 1]!).get(power).f64x2Mul().f64x2Add().set(terms[i]!);
      next.push(terms[i]!);
    }
    terms = next;
    if (terms.length > 1) {
      const p2 = c.local(V128);
      c.get(power).get(power).f64x2Mul().set(p2);
      power = p2;
    }
  }
  c.get(terms[0]!).set(out);
  for (let i = exact - 1; i >= 0; i--) c.get(out).get(x).f64x2Mul().f64x2Const(coefficients[i]!).f64x2Add().set(out);
}

/** ln 2, split so that k · LN2_HI is exact for the k exp() uses: the high part has its last 32 bits zero. */
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const LOG2E = 1.4426950408889634;
/** 2⁵²: adding it to a whole number below 2⁵² puts the number in the mantissa's low bits. */
const TWO52 = 4503599627370496;
const TWO52_BITS = 0x4330000000000000n;
const ONE_BITS = 0x3ff0000000000000n;
const MANTISSA = 0x000fffffffffffffn;
/** Below this, exp(x) is under 2⁻¹⁰²¹; taken as 0. */
const EXP_MIN = -708;

/** 1/n!, for n = 0 … 13: exp(r) = Σ rⁿ/n! for |r| ≤ ln2/2, where the first left-out term is under 5 · 10⁻¹⁸. */
const EXP_TAYLOR = Array.from({ length: 14 }, (_, n) => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return 1 / f;
});

/**
 * out = eˣ, lane by lane, for x ≤ 0 (such as a logistic function's exp(−|z|), or a softmax's exp(z − max)). Below −708, 0.
 *
 * x = k · ln 2 + r, with k = round(x / ln 2) and |r| ≤ ln2/2; eˣ = 2ᵏ · eʳ. eʳ is its Taylor series to r¹³, by
 * polynomial(); 2ᵏ is built from its bits: (k + 1023) in the exponent field.
 */
export function exp(c: Code, x: Local, out: Local): void {
  const xc = c.local(V128);
  const k = c.local(V128);
  const r = c.local(V128);
  const p = c.local(V128);
  c.get(x).f64x2Const(EXP_MIN).f64x2Max().set(xc);
  c.get(xc).f64x2Const(LOG2E).f64x2Mul().f64x2Nearest().set(k);
  // r = x − k·ln2_hi − k·ln2_lo: the first product is exact, so r keeps its low bits.
  c.get(xc).get(k).f64x2Const(LN2_HI).f64x2Mul().f64x2Sub().get(k).f64x2Const(LN2_LO).f64x2Mul().f64x2Sub().set(r);
  polynomial(c, r, EXP_TAYLOR, p);
  // 2ᵏ: (k + 1023 + 2⁵²)'s bits less 2⁵²'s are the whole number k + 1023; shifted into the exponent field.
  c.get(k).f64x2Const(1023 + TWO52).f64x2Add().i64x2Const(TWO52_BITS).i64x2Sub().i32(52).i64x2Shl();
  c.get(p).f64x2Mul().set(out);
  // Below EXP_MIN, 0: bitselect takes its first operand where the mask is set.
  c.f64x2Const(0).get(out).get(x).f64x2Const(EXP_MIN).f64x2Lt().v128Bitselect().set(out);
}

/** The odd terms of 2·atanh: 1/(2j + 1), for j = 0 … 18. With t ≤ 1/3, the first left-out term is under 10⁻¹⁸. */
const ATANH_TERMS = Array.from({ length: 19 }, (_, j) => 1 / (2 * j + 1));

/**
 * out = ln(1 + u), lane by lane, for 0 ≤ u ≤ 1.
 *
 * ln(1 + u) = 2·atanh(t) with t = u / (2 + u) ≤ 1/3: 2t · Σ t²ʲ/(2j + 1), a polynomial in t². No cancellation, so
 * small u keeps its relative accuracy.
 */
export function log1p(c: Code, u: Local, out: Local): void {
  const t = c.local(V128);
  const s = c.local(V128);
  const q = c.local(V128);
  c.get(u).get(u).f64x2Const(2).f64x2Add().f64x2Div().set(t);
  c.get(t).get(t).f64x2Mul().set(s);
  polynomial(c, s, ATANH_TERMS, q);
  c.get(t).get(t).f64x2Add().get(q).f64x2Mul().set(out);
}

/**
 * out = ln x, lane by lane, for x ≥ 1 (a softmax's Σ e^(z − max), which is at least 1).
 *
 * x = 2ᵉ · m with 1 ≤ m < 2, read from x's bits; ln x = e · ln 2 + ln(1 + (m − 1)), where m − 1 is exact.
 */
export function logAtLeast1(c: Code, x: Local, out: Local): void {
  const e = c.local(V128);
  const v = c.local(V128);
  const l = c.local(V128);
  // e: the exponent field (x > 0, so no sign bit), as a float by the 2⁵² trick, less the bias.
  c.get(x).i32(52).i64x2ShrU().i64x2Const(TWO52_BITS).v128Or().f64x2Const(TWO52 + 1023).f64x2Sub().set(e);
  // v = m − 1: x's mantissa under 1.0's exponent, less 1.
  c.get(x).i64x2Const(MANTISSA).v128And().i64x2Const(ONE_BITS).v128Or().f64x2Const(1).f64x2Sub().set(v);
  log1p(c, v, l);
  c.get(e).f64x2Const(LN2_HI).f64x2Mul().get(l).get(e).f64x2Const(LN2_LO).f64x2Mul().f64x2Add().f64x2Add().set(out);
}
