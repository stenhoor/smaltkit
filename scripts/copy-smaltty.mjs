// After tsc: copies smaltty's built modules into dist/smaltty/ and points dist/typescript.js (and its .d.ts) at them,
// so smaltkit/typescript loads in a page without a bundler, the way the apps load smaltkit (a copy of dist/).
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
// smaltty's exports map lists only its entry point: find the package from it (dist/index.js).
const smalttyDist = dirname(createRequire(join(root, 'package.json')).resolve('smaltty'));
const out = join(dist, 'smaltty');
rmSync(out, { recursive: true, force: true });
cpSync(smalttyDist, out, { recursive: true, filter: (p) => !p.endsWith('.map') });
for (const file of ['typescript.js', 'typescript.d.ts']) {
  const path = join(dist, file);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  const rewritten = text.replace(/from 'smaltty'/g, "from './smaltty/index.js'");
  if (rewritten === text) throw new Error(`dist/${file} doesn't import 'smaltty': update scripts/copy-smaltty.mjs.`);
  writeFileSync(path, rewritten);
}
const version = JSON.parse(readFileSync(join(smalttyDist, '..', 'package.json'), 'utf8')).version;
writeFileSync(join(out, 'VERSION.json'), JSON.stringify({ name: 'smaltty', version }, null, 2) + '\n');
