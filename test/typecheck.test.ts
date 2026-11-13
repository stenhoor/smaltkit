import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { typeCheckWorker, type TypeCheckRequest, type TypeCheckSetup } from 'smaltkit/typecheck';
import { preparedReadable, typeChecker, typeCheckHandler } from 'smaltkit/typechecker';
import { prepare } from 'smaltty/check';

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

test("syntax: 'tolerant' sets aside the broken statement and checks the rest; strict, the default, doesn't", () => {
  const code = "table('t').hed(5);\nconst x = (1 + ;\nshow(table('t'), 'all', 3);\n";
  assert.deepEqual(typeChecker(setup)(code), [], 'strict: code with a syntax error gets no warnings, as before');
  const warnings = typeChecker({ ...setup, syntax: 'tolerant' })(code);
  const syntax = warnings.filter((w) => w.code < 2000);
  assert.equal(syntax.length, 1, 'one syntax error');
  assert.equal(syntax[0]!.line, 2, 'on the broken line');
  assert.deepEqual(
    warnings.filter((w) => w.code >= 2000).map((w) => [w.line, w.code]),
    [[1, 2551], [3, 2554]],
    'the other lines checked',
  );
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

test('prepared libraries: the same warnings as from their text; a buffer smaltty can\'t read is ignored', () => {
  const code = "table('t')\n  .filter(col('qty').gt(0))\n  .hed(5);\nshow(table('t'), 'all', 3);\n";
  const expected = typeChecker(setup)(code);
  assert.equal(expected.length, 2);
  const prepared = prepare(setup.files);
  const fromPrepared = typeChecker({ ...setup, files: {}, prepared });
  assert.deepEqual(fromPrepared(code), expected);
  assert.deepEqual(fromPrepared("table('t').head(5);\n"), [], 'a re-check after an edit');
  assert.deepEqual(typeChecker({ ...setup, files: {}, prepared: prepared.slice().buffer })(code), expected, 'an ArrayBuffer, as fetch() gives');
  // Another smaltty's buffer (here: another format): the text is read where it's given, and quiet where it isn't.
  const stale = prepared.slice();
  new Int32Array(stale.buffer)[1] += 1;
  assert.equal(preparedReadable({ ...setup, prepared: stale }), false);
  assert.equal(preparedReadable({ ...setup, prepared }), true);
  assert.equal(preparedReadable(setup), true);
  assert.deepEqual(typeChecker({ ...setup, prepared: stale })(code), expected);
  assert.deepEqual(typeChecker({ ...setup, files: {}, prepared: stale })(code), []);
});

test('warm: the prepared libraries read and nothing checked, with no reply; then checks as before', () => {
  const handle = typeCheckHandler();
  assert.equal(handle({ kind: 'warm' }), undefined, 'before a setup: nothing to do');
  handle({ kind: 'setup', setup: { ...setup, files: {}, prepared: prepare(setup.files) } });
  assert.equal(handle({ kind: 'warm' }), undefined);
  const reply = handle({ kind: 'check', id: 1, code: "table('t').tail();" });
  assert.ok(reply && 'warnings' in reply);
  assert.deepEqual(reply.warnings.map((w) => w.code), [2339]);
});

test("the worker: a setup whose prepared libraries can't be read is completed from its fallback first", async () => {
  const stale = prepare(setup.files).slice();
  new Int32Array(stale.buffer)[1] += 1;
  const replies: unknown[] = [];
  const fetched: string[] = [];
  const scope = globalThis as unknown as Record<string, unknown>;
  const saved = { self: scope.self, fetch: scope.fetch };
  scope.self = { postMessage: (m: unknown) => replies.push(m) };
  scope.fetch = async (url: string) => {
    fetched.push(url);
    return { ok: true, json: async () => ({ files: setup.files, packages: setup.packages, globals: setup.globals }) };
  };
  try {
    await import(new URL('../dist/typecheck-worker.js', import.meta.url).href);
    const onmessage = (scope.self as { onmessage: (e: { data: TypeCheckRequest }) => void }).onmessage;
    onmessage({ data: { kind: 'setup', setup: { files: {}, prepared: stale, fallback: 'https://app.example/types.json' } } });
    onmessage({ data: { kind: 'warm' } });
    onmessage({ data: { kind: 'check', id: 1, code: "table('t').hed(1);" } });
    for (let i = 0; i < 100 && !replies.length; i++) await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(fetched, ['https://app.example/types.json']);
    assert.deepEqual((replies[0] as { warnings: { code: number }[] }).warnings.map((w) => w.code), [2551]);
  } finally {
    scope.self = saved.self;
    scope.fetch = saved.fetch;
  }
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
  kinds: string[] = [];
  postMessage(message: TypeCheckRequest) {
    this.kinds.push(message.kind);
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
    assert.deepEqual(workers[0]!.kinds, ['setup', 'check', 'check', 'check'], 'no warm-up unless asked for');
    // warm: the worker warms itself as soon as it has the setup, before any check.
    const warmed = typeCheckWorker({ ...setup, files: {}, prepared: prepare(setup.files) }, { warm: true });
    assert.deepEqual((await warmed.check("table('a').hed();"))!.map((w) => w.code), [2551]);
    assert.deepEqual(workers[1]!.kinds, ['setup', 'warm', 'check']);
    warmed.close();
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
