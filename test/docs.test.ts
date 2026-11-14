import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error: a plain .mjs script, without declarations
import { pages, examples, run } from '../scripts/docs-examples.mjs';

// The docs' examples are tests (smalt-brand BRAND.md, Documentation, rule 5): each example with its output under it
// prints that output, run against the built package.
for (const page of pages() as string[]) {
  const text = readFileSync(page, 'utf8');
  for (const ex of examples(text) as { code: string; expected: string; line: number }[]) {
    test(`${path.relative(process.cwd(), page)}:${ex.line}`, () => {
      assert.equal(run(ex.code), ex.expected);
    });
  }
}
