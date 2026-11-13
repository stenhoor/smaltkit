import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { typeCheckWorker, type TypeCheckRequest, type TypeCheckSetup } from 'smaltkit/typecheck';
import { typeChecker, typeCheckHandler } from 'smaltkit/typechecker';

// A library as a page has it: declarations only.
const setup: TypeCheckSetup = {
  files: {
    '/df/index.d.ts': `export declare class Frame {\n  head(n?: number): Frame;\n  filter(predicate: Expr): Frame;\n}\nexport declare class Expr {\n  gt(value: number): Expr;\n}\nexport declare function table(name: string): Frame;\nexport declare function col(name: string): Expr;\n`,
    '/page.d.ts': `export * from '@smaltdb/df';\nexport declare function show(value: unknown, title?: string): void;\n`,
  },
  packages: { '@smaltdb/df': '/df/index.d.ts' },
  globals: ['/page.d.ts'],
};

test('a tab: the globals in scope, its errors as warnings with lines and columns', () => {
  const check = typeChecker(setup);
  const code = "table('t')\n  .filter(col('qty').gt(0))\n  .hed(5);\nshow(table('t'), 'all', 3);\n";
  assert.deepEqual(check(code), [
    { start: 42, end: 45, line: 3, column: 4, code: 2551, message: "Property 'hed' does not exist on type 'Frame'. Did you mean 'head'?" },
    { start: 74, end: 75, line: 4, column: 25, code: 2554, message: 'Expected 1-2 arguments, but got 3.' },
  ]);
  assert.deepEqual(check("table('t').head(5);\nshow(1);\n"), [], 'a re-check after an edit');
  assert.deepEqual(check("const table = (n: number) => n;\ntable(1).toFixed(2);\n"), [], 'a name the code declares comes first');
});

test('imports: the same library imported by name', () => {
  const check = typeChecker(setup);
  assert.deepEqual(check("import { table } from '@smaltdb/df';\ntable('a').fliter(1);\n").map((w) => [w.line, w.code]), [[2, 2551]]);
});

test("the worker's handler: a setup, then checks answered by id", () => {
  const handle = typeCheckHandler();
  assert.deepEqual(handle({ kind: 'check', id: 1, code: '' }), { id: 1, error: 'the type checker has no setup' });
  assert.equal(handle({ kind: 'setup', setup }), undefined);
  const reply = handle({ kind: 'check', id: 2, code: "table('t').tail();" });
  assert.ok(reply && 'warnings' in reply && reply.id === 2);
  assert.deepEqual(reply.warnings.map((w) => w.code), [2339]);
});

/** A Worker stand-in for Node: the handler, answering on a later turn, as a worker does. */
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  handle = typeCheckHandler();
  seen: number[] = [];
  terminated = false;
  readonly url: URL;
  constructor(url: URL) {
    this.url = url;
  }
  postMessage(message: TypeCheckRequest) {
    if (message.kind === 'check') this.seen.push(message.id);
    setTimeout(() => {
      const reply = this.handle(message);
      if (reply && !this.terminated) this.onmessage?.({ data: reply });
    }, 5);
  }
  terminate() {
    this.terminated = true;
  }
}

test('typeCheckWorker: checks in order; one replaced before it starts resolves to null', async () => {
  const workers: FakeWorker[] = [];
  (globalThis as { Worker?: unknown }).Worker = class extends FakeWorker {
    constructor(url: URL) {
      super(url);
      workers.push(this);
    }
  };
  try {
    const checker = typeCheckWorker(setup);
    assert.match(String(workers[0]!.url), /\/typecheck-worker\.js$/);
    const first = checker.check("table('a').hed();"); // sent at once
    const second = checker.check("table('b').hed();"); // waits, then is replaced
    const third = checker.check("table('c').head();");
    assert.equal(await second, null);
    assert.deepEqual((await first)!.map((w) => w.code), [2551]);
    assert.deepEqual(await third, []);
    assert.deepEqual(workers[0]!.seen, [1, 2], 'the replaced check is never sent');
    const last = checker.check("table('d');");
    checker.close();
    assert.equal(await last, null);
    assert.ok(workers[0]!.terminated);
  } finally {
    delete (globalThis as { Worker?: unknown }).Worker;
  }
});

/** The files of dist/smaltty/ that importing `specifier` loads, in a fresh process (a resolve hook records them). */
function smalttyLoaded(specifier: string): string[] {
  const code = `
    import { registerHooks } from 'node:module';
    const urls = new Set();
    registerHooks({ resolve(s, c, next) { const r = next(s, c); urls.add(r.url); return r; } });
    await import(${JSON.stringify(specifier)});
    console.log(JSON.stringify([...urls].filter((u) => u.includes('/dist/smaltty/')).map((u) => u.slice(u.lastIndexOf('/') + 1)).sort()));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', cwd: import.meta.dirname }));
}

test("the page's side loads none of smaltty: the checker is loaded in the worker only", () => {
  assert.deepEqual(smalttyLoaded('smaltkit/typecheck'), []);
  const checker = smalttyLoaded('smaltkit/typechecker');
  assert.ok(checker.includes('checker.js') && checker.includes('builtins.js'), checker.join(', '));
  assert.ok(!checker.includes('strip.js'), 'the checker loads no stripper');
});

test('smaltkit/typescript loads the stripping path and the binder, not the checker', () => {
  const loaded = smalttyLoaded('smaltkit/typescript');
  assert.ok(loaded.includes('strip.js') && loaded.includes('parser.js') && loaded.includes('binder.js'), loaded.join(', '));
  assert.ok(!loaded.includes('checker.js') && !loaded.includes('builtins.js'), loaded.join(', '));
});
