// The few vitest-style matchers the graph and timeline tests use, on node:assert, so they read as they did where they
// were written.
import assert from 'node:assert/strict';

function matches(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === 'object' && actual !== null && typeof actual === 'object') {
    return Object.entries(expected).every(([k, v]) => matches((actual as Record<string, unknown>)[k], v));
  }
  return Object.is(actual, expected);
}

export function expect(actual: unknown, message?: string) {
  const num = () => {
    assert.equal(typeof actual, 'number', message);
    return actual as number;
  };
  return {
    toBe: (expected: unknown) => assert.ok(Object.is(actual, expected), message ?? `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: (expected: unknown) => assert.deepStrictEqual(actual, expected, message),
    toMatchObject: (expected: object) => assert.ok(matches(actual, expected), message ?? `expected ${JSON.stringify(actual)} to match ${JSON.stringify(expected)}`),
    toBeCloseTo: (expected: number, digits = 2) => assert.ok(Math.abs(num() - expected) < 10 ** -digits / 2, message ?? `expected ${String(actual)} to be close to ${expected}`),
    toBeGreaterThan: (n: number) => assert.ok(num() > n, message ?? `expected ${String(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => assert.ok(num() >= n, message ?? `expected ${String(actual)} >= ${n}`),
    toBeLessThan: (n: number) => assert.ok(num() < n, message ?? `expected ${String(actual)} < ${n}`),
    toBeLessThanOrEqual: (n: number) => assert.ok(num() <= n, message ?? `expected ${String(actual)} <= ${n}`),
    toHaveLength: (n: number) => assert.equal((actual as { length: number }).length, n, message),
    toContain: (item: unknown) => assert.ok((actual as { includes(x: unknown): boolean }).includes(item), message ?? `expected ${String(actual)} to contain ${String(item)}`),
    toBeNull: () => assert.equal(actual, null, message),
    not: {
      toBe: (expected: unknown) => assert.ok(!Object.is(actual, expected), message ?? `expected ${String(actual)} not to be ${String(expected)}`),
    },
  };
}
