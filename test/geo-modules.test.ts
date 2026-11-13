// The boundaries between the GPU modules' pieces, kept by tests. Each `smaltkit/geo/<piece>` is meant to be used and
// changed on its own: a new dependency between pieces changes the tables here on purpose, never by accident.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Which folders of src/geo each folder may import from. */
const ALLOWED: Record<string, readonly string[]> = {
  core: ['core'],
  map: ['core', 'map'],
  layers: ['core', 'layers'],
  basemap: ['core', 'basemap'],
  data: ['data'],
  // Visuals for hosts compose the rest.
  visual: ['core', 'map', 'layers', 'basemap', 'data', 'visual'],
};
const LAYER_FILES = ['scatter', 'heatmap', 'aggregate', 'arcs', 'paths', 'polygons'];

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), ext) : e.name.endsWith(ext) && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : [],
  );
}

/** Relative imports of a file (static, dynamic, type-only and `new URL(…)` workers), resolved to absolute paths. */
function importsOf(file: string): string[] {
  const code = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of code.matchAll(/(?:from|import\s*\(?|new URL\()\s*['"](\.[^'"]+)['"]/g)) out.push(resolve(dirname(file), m[1]!));
  return out;
}

describe('imports between the geo folders', () => {
  const src = join(root, 'src/geo');
  for (const file of files(src, '.ts')) {
    const rel = relative(src, file);
    if (!rel.includes('/')) continue; // index.ts gathers everything
    const folder = rel.split('/')[0]!;
    it(`${rel} imports only what its folder may`, () => {
      for (const imp of importsOf(file)) {
        const target = relative(src, imp).split('/')[0]!;
        assert.ok(ALLOWED[folder]!.includes(target), `${rel} imports ${relative(src, imp)}`);
      }
    });
  }

  it('the geo and graph modules import nothing outside themselves', () => {
    for (const dir of ['geo', 'graph']) {
      for (const file of files(join(root, 'src', dir), '.ts')) {
        for (const imp of importsOf(file)) assert.ok(imp.startsWith(join(root, 'src', dir)), `${relative(root, file)} imports ${relative(root, imp)}`);
        assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"][^.'"]/, `${relative(root, file)} imports a package`);
      }
    }
  });
});

/** Every file a module loads (its static import closure in dist/, plus workers it starts), relative to dist/. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const imp of importsOf(f)) visit(imp.endsWith('.js') ? imp : `${imp}.js`);
  };
  visit(join(root, entry));
  return [...seen].map((f) => relative(join(root, 'dist'), f));
}

describe('each geo subpath loads only its own part', () => {
  // What must never come along: [subpath, pattern of dist files it must not load].
  const forbidden: Record<string, RegExp> = {
    'geo/core': /^geo\/(?!core\/)/,
    'geo/map': /^geo\/(layers|basemap|data|visual)\//,
    'geo/layer-kit': new RegExp(`^geo/(map|basemap|data|visual)/|^geo/layers/(${LAYER_FILES.join('|')})\\.js$`),
    'geo/vector-tiles': /^geo\/(core\/gpu|core\/contract|map|layers|data|visual)|^geo\/basemap\/(tile-renderer|label-renderer|labels|basemap)\.js$/,
    'geo/basemap': /^geo\/(map|layers|data|visual)\//,
    'geo/data': /^geo\/(?!data\/)/,
    'geo/geojson': /^geo\/(?!data\/geojson\.js)/,
    'geo/smaltdb': /^geo\/(?!data\/)|^geo\/data\/smaltcy\.js$/,
    'geo/smaltcy': /^geo\/(?!data\/)|^geo\/data\/(smaltdb|geojson)\.js$/,
    graph: /^(?!graph\/)/,
  };
  for (const name of LAYER_FILES)
    forbidden[`geo/${name}`] = new RegExp(`^geo/(map|basemap|data|visual)/|^geo/layers/(${LAYER_FILES.filter((n) => n !== name).join('|')})\\.js$`);

  for (const [name, pattern] of Object.entries(forbidden)) {
    it(`smaltkit/${name}`, () => {
      const entry = pkg.exports[`./${name}`];
      assert.ok(entry, `package.json exports ./${name}`);
      const loaded = closure(entry.default);
      assert.ok(loaded.length > 0);
      assert.deepEqual(loaded.filter((f) => pattern.test(f)), []);
    });
  }

  it('the basemap starts its tile worker from a file next to it', () => {
    assert.ok(closure(pkg.exports['./geo/basemap'].default).includes('geo/basemap/tile-worker.js'));
    assert.equal(pkg.exports['./geo/tile-worker.js'], './dist/geo/basemap/tile-worker.js');
  });
});
