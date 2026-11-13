// After tsc: copies smaltty's built modules into dist/smaltty/ and points smaltkit's modules that import smaltty (and
// their .d.ts) at them, so they load in a page without a bundler, the way the apps load smaltkit (a copy of dist/).
// Each import name is mapped by smaltty's own exports map: `smaltty` to ./smaltty/index.js, `smaltty/strip` to the
// file its `./strip` export names, and so on.
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const smalttyPkgPath = createRequire(join(root, 'package.json')).resolve('smaltty/package.json');
const smalttyPkg = JSON.parse(readFileSync(smalttyPkgPath, 'utf8'));
const smalttyDist = join(dirname(smalttyPkgPath), 'dist');
const out = join(dist, 'smaltty');
rmSync(out, { recursive: true, force: true });
cpSync(smalttyDist, out, { recursive: true, filter: (p) => !p.endsWith('.map') });

/** Where an import name of smaltty's is, relative to dist/: `smaltty/strip` → `./smaltty/entry-strip.js`. */
function target(specifier) {
  const sub = specifier === 'smaltty' ? '.' : `./${specifier.slice('smaltty/'.length)}`;
  const entry = smalttyPkg.exports?.[sub];
  const file = typeof entry === 'string' ? entry : entry?.default;
  if (!file?.startsWith('./dist/')) throw new Error(`smaltty has no export '${specifier}' in dist/: update scripts/copy-smaltty.mjs.`);
  return `./smaltty/${file.slice('./dist/'.length)}`;
}

// The modules that import smaltty: each must, or this script no longer matches them.
const importers = ['typescript.js', 'typescript-kit.js', 'typechecker.js'];
const matched = new Set();
for (const file of readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.d.ts'))) {
  const path = join(dist, file);
  const text = readFileSync(path, 'utf8');
  const rewritten = text.replace(/(from |import\()(['"])(smaltty(?:\/[\w-]+)?)\2/g, (_, before, quote, specifier) => {
    matched.add(file);
    return `${before}${quote}${target(specifier)}${quote}`;
  });
  if (rewritten !== text) writeFileSync(path, rewritten);
}
for (const file of importers) {
  if (!matched.has(file)) throw new Error(`dist/${file} doesn't import smaltty: update scripts/copy-smaltty.mjs.`);
}
for (const file of matched) {
  if (!importers.includes(file) && !importers.includes(file.replace(/\.d\.ts$/, '.js'))) {
    throw new Error(`dist/${file} imports smaltty, and isn't listed: add it to scripts/copy-smaltty.mjs.`);
  }
}

writeFileSync(join(out, 'VERSION.json'), JSON.stringify({ name: 'smaltty', version: smalttyPkg.version }, null, 2) + '\n');
