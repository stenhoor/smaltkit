// A few `expect` matchers over node:assert, for tests ported from a vitest suite (the GPU modules came with theirs).
import assert from 'node:assert/strict';

type Matchers = {
  toBe(v: unknown): void;
  toEqual(v: unknown): void;
  toMatchObject(v: object): void;
  toBeCloseTo(v: number, digits?: number): void;
  toBeGreaterThan(v: number): void;
  toBeGreaterThanOrEqual(v: number): void;
  toBeLessThan(v: number): void;
  toBeLessThanOrEqual(v: number): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toHaveLength(n: number): void;
  toContain(v: unknown): void;
  toMatch(re: RegExp | string): void;
  toThrow(re?: RegExp | string): void;
};

function subset(actual: unknown, want: unknown): boolean {
  if (want === null || typeof want !== 'object') return Object.is(actual, want);
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(want)) return Array.isArray(actual) && actual.length === want.length && want.every((w, i) => subset(actual[i], w));
  return Object.entries(want).every(([k, w]) => subset((actual as Record<string, unknown>)[k], w));
}

function matchers(actual: any, negate: boolean, message?: string): Matchers {
  const check = (pass: boolean, what: string) => {
    if (pass === negate) assert.fail(message ?? `expected ${String(actual)} ${negate ? 'not ' : ''}${what}`);
  };
  const deep = (v: unknown) => {
    try {
      assert.deepStrictEqual(actual, v);
      return true;
    } catch {
      return false;
    }
  };
  return {
    toBe: (v) => check(Object.is(actual, v), `to be ${String(v)}`),
    toEqual: (v) => check(deep(v), `to equal ${JSON.stringify(v)}`),
    toMatchObject: (v) => check(subset(actual, v), `to match ${JSON.stringify(v)}`),
    toBeCloseTo: (v, digits = 2) => check(Math.abs(actual - v) < 10 ** -digits / 2, `to be close to ${v}`),
    toBeGreaterThan: (v) => check(actual > v, `> ${v}`),
    toBeGreaterThanOrEqual: (v) => check(actual >= v, `>= ${v}`),
    toBeLessThan: (v) => check(actual < v, `< ${v}`),
    toBeLessThanOrEqual: (v) => check(actual <= v, `<= ${v}`),
    toBeUndefined: () => check(actual === undefined, 'to be undefined'),
    toBeNull: () => check(actual === null, 'to be null'),
    toHaveLength: (n) => check(actual?.length === n, `to have length ${n}`),
    toContain: (v) => check(typeof actual === 'string' ? actual.includes(v as string) : [...actual].includes(v), `to contain ${String(v)}`),
    toMatch: (re) => check(typeof re === 'string' ? actual.includes(re) : re.test(actual), `to match ${String(re)}`),
    toThrow: (re) => {
      let threw = false, msg = '';
      try {
        actual();
      } catch (e) {
        threw = true;
        msg = String((e as Error)?.message ?? e);
      }
      check(threw && (!re || (typeof re === 'string' ? msg.includes(re) : re.test(msg))), 'to throw');
    },
  };
}

export function expect(actual: unknown, message?: string): Matchers & { not: Matchers } {
  return Object.assign(matchers(actual, false, message), { not: matchers(actual, true, message) });
}
