// Runs against the built package. Node has no OPFS, localStorage or page location, so the tests stand those in.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { deleteOpfsDatabase, engineSpec, listOpfsDatabases, loadEngine, opfsAvailable, resolveEngine, setEngineSpec } from 'smaltkit/engine';

const g = globalThis as Record<string, unknown>;
const page = 'https://example.org/app/index.html';

test('resolveEngine: vendor, npm, npm@version and a custom folder', () => {
  assert.deepEqual(resolveEngine('vendor', 'vendor/smaltdb', page), { base: 'https://example.org/app/vendor/smaltdb/', label: 'bundled smaltdb' });
  assert.equal(resolveEngine('', '../vendor/smaltdb/', 'https://example.org/app/js/main.js').base, 'https://example.org/app/vendor/smaltdb/');
  assert.deepEqual(resolveEngine('npm', 'vendor/smaltdb/', page), { base: 'https://cdn.jsdelivr.net/npm/smaltdb@latest/dist/', label: 'smaltdb@latest (npm)' });
  assert.equal(resolveEngine('npm@0.8.3', 'vendor/smaltdb/', page).base, 'https://cdn.jsdelivr.net/npm/smaltdb@0.8.3/dist/');
  assert.deepEqual(resolveEngine('https://cdn.example.com/smaltdb/dist', 'vendor/smaltdb/', page), {
    base: 'https://cdn.example.com/smaltdb/dist/',
    label: 'https://cdn.example.com/smaltdb/dist/',
  });
  assert.equal(resolveEngine('builds/dev/', 'vendor/smaltdb/', page).base, 'https://example.org/app/builds/dev/');
});

test('engineSpec: ?engine= wins, then the saved choice, then vendor', () => {
  const store = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  try {
    assert.equal(engineSpec('app.engine', ''), 'vendor');
    setEngineSpec('app.engine', 'npm@0.8.3');
    assert.equal(engineSpec('app.engine', ''), 'npm@0.8.3');
    assert.equal(engineSpec('app.engine', '?engine=npm'), 'npm');
    assert.equal(engineSpec(undefined, ''), 'vendor', 'without a key, nothing is read from storage');
    setEngineSpec('app.engine', 'vendor');
    assert.equal(store.has('app.engine'), false);
    g.localStorage = {
      getItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    assert.equal(engineSpec('app.engine', ''), 'vendor', 'blocked storage falls back to vendor');
    setEngineSpec('app.engine', 'npm');
  } finally {
    delete g.localStorage;
  }
});

// A stand-in engine folder: a client module whose open() echoes its arguments, and a VERSION.json.
const dir = mkdtempSync(join(tmpdir(), 'smaltkit-engine-'));
const vendor = pathToFileURL(join(dir, 'vendor/smaltdb/')).href;
{
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(dir, 'vendor/smaltdb'), { recursive: true });
  writeFileSync(join(dir, 'vendor/smaltdb/smaltdb.js'), 'export async function open(name, options) { return { name, options }; }\n');
  writeFileSync(join(dir, 'vendor/smaltdb/VERSION.json'), JSON.stringify({ source: 'npm', version: '0.8.3' }));
}
after(() => {
  delete g.location;
});

test('loadEngine: vendor folder, same origin, passes its worker to open()', async () => {
  g.location = new URL(pathToFileURL(join(dir, 'index.html')).href);
  const engine = await loadEngine('vendor', { vendorUrl: 'vendor/smaltdb/', baseUrl: pathToFileURL(join(dir, 'index.html')) });
  assert.equal(engine.spec, 'vendor');
  assert.equal(engine.label, 'bundled smaltdb');
  assert.equal(engine.workerUrl, vendor + 'smaltdb-worker.js');
  // Node's fetch does not read file: URLs, so the version is unknown here; over http it is VERSION.json.
  assert.equal(engine.version, null);
  const db = (await engine.open('demo', { storage: 'memory' })) as unknown as { name: string; options: Record<string, unknown> };
  assert.deepEqual(db, { name: 'demo', options: { storage: 'memory', worker: vendor + 'smaltdb-worker.js' } });
});

test('loadEngine: an app worker entry in the vendor folder', async () => {
  g.location = new URL(pathToFileURL(join(dir, 'index.html')).href);
  const engine = await loadEngine('', { vendorUrl: vendor, workerFile: 'app-worker.js' });
  assert.equal(engine.workerUrl, vendor + 'app-worker.js');
});

test('loadEngine: a cross-origin engine starts through a blob: worker', async () => {
  g.location = new URL(page);
  const engine = await loadEngine(vendor, { vendorUrl: 'vendor/smaltdb/', baseUrl: page });
  assert.match(engine.workerUrl, /^blob:/);
  assert.equal(engine.label, vendor);
  assert.equal(engine.version, null, 'a custom URL is not probed for its version');
});

test('loadEngine: a missing custom engine throws, and does not fall back', async () => {
  g.location = new URL(page);
  await assert.rejects(loadEngine(pathToFileURL(join(dir, 'missing/')).href, { vendorUrl: vendor, baseUrl: page }));
});

// A stand-in OPFS: directory handles with entries(), getDirectoryHandle(), removeEntry(); files with getFile().
function fakeOpfs(files: Record<string, { size: number; lastModified: number } | 'locked'>) {
  const names = new Map(Object.entries(files));
  const fileHandle = (name: string) => ({
    kind: 'file',
    async getFile() {
      const f = names.get(name);
      if (f === 'locked') throw new Error('NoModificationAllowedError');
      return f;
    },
  });
  const smaltdb = {
    kind: 'directory',
    async *entries() {
      for (const name of names.keys()) yield [name, fileHandle(name)];
    },
    async removeEntry(name: string) {
      names.delete(name);
    },
  };
  const root = {
    async getDirectoryHandle(name: string) {
      if (name !== 'smaltdb' || names.size === 0) throw new Error('NotFoundError');
      return smaltdb;
    },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { storage: { getDirectory: async () => root } }, configurable: true });
  g.isSecureContext = true;
  return names;
}

beforeEach(() => {
  delete g.isSecureContext;
});

test('listOpfsDatabases: names, sizes with the WAL, locked files, sorted', async () => {
  fakeOpfs({
    'sales.db': { size: 4096, lastModified: 1000 },
    'sales.db-wal': { size: 100, lastModified: 1001 },
    'archive.db': 'locked',
    'notes.txt': { size: 1, lastModified: 1 },
  });
  assert.equal(opfsAvailable(), true);
  assert.deepEqual(await listOpfsDatabases(), [
    { name: 'archive', size: null, modified: null },
    { name: 'sales', size: 4196, modified: 1000 },
  ]);
});

test('listOpfsDatabases: empty when OPFS is unavailable or unused', async () => {
  fakeOpfs({});
  assert.deepEqual(await listOpfsDatabases(), []);
  delete g.isSecureContext;
  assert.equal(opfsAvailable(), false);
  assert.deepEqual(await listOpfsDatabases(), []);
});

test('deleteOpfsDatabase removes the database and its side files only', async () => {
  const names = fakeOpfs({
    'sales.db': { size: 1, lastModified: 1 },
    'sales.db-wal': { size: 1, lastModified: 1 },
    'sales.db-shm': { size: 1, lastModified: 1 },
    'sales2.db': { size: 1, lastModified: 1 },
  });
  await deleteOpfsDatabase('sales');
  assert.deepEqual([...names.keys()], ['sales2.db']);
});
