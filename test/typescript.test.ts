import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { stripTypes, typescriptTranspiler, TypeScriptSyntaxError } from 'smaltkit/typescript';

test('types become spaces: every line and column stays where it was', () => {
  const code = "const n: number = 2;\ntable('orders').head(n as number)";
  const js = stripTypes(code);
  assert.equal(js, "const n         = 2;\ntable('orders').head(n          )");
  const table = () => ({ head: (k: number) => k * 10 });
  assert.equal(new Function('table', `${js}; return n`)(table), 2);
});

test('syntax errors and code that would make code say where', () => {
  assert.throws(() => stripTypes("table('orders').head(n;", { filename: 'tab.ts' }), (e: unknown) => {
    assert.ok(e instanceof TypeScriptSyntaxError && e instanceof SyntaxError);
    assert.deepEqual([e.line, e.column], [1, 23]);
    assert.match(e.message, /^tab\.ts, line 1, column 23: /);
    return true;
  });
  assert.throws(() => stripTypes('enum Color { Red }'), /line 1, column 1: An enum makes code/);
});

test('the Transpiler shape', () => {
  assert.equal(typescriptTranspiler.name, 'smaltty');
  assert.equal(typescriptTranspiler.transpile('let a: string = "x"'), 'let a         = "x"');
});

test('dist/ loads without a bundler: no bare imports, smaltty included', () => {
  const dist = dirname(createRequire(import.meta.url).resolve('smaltkit'));
  const bare: string[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/(?:^|[\s;])(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
          if (!m[1]!.startsWith('.')) bare.push(`${p.slice(dist.length + 1)}: ${m[1]}`);
        }
      }
    }
  };
  walk(dist);
  // engine.js imports smaltdb's types only; at run time it loads the engine by URL.
  assert.deepEqual(bare, []);
  assert.ok(readdirSync(join(dist, 'smaltty')).includes('index.js'));
});
