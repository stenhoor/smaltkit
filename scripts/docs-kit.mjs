// Copies the built package (dist/) to docs/public/kit/, so the docs site serves it: its playgrounds import the
// examples' modules from there, as a page would. Run by docs:dev and docs:build after npm run build.
import { cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'dist');
const to = path.join(root, 'docs', 'public', 'kit');
if (!existsSync(from)) throw new Error('dist/ is missing: run npm run build first');
rmSync(to, { recursive: true, force: true });
// The JavaScript and its CSS; not the declarations or source maps.
cpSync(from, to, { recursive: true, filter: (f) => !/\.(d\.ts|map)$/.test(f) });
console.log('copied dist/ to docs/public/kit/');
