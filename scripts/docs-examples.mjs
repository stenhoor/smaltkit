// The docs' examples are tests (BRAND.md, Documentation, rule 5). In docs/**/*.md, a ```ts fence followed by a ```text
// fence is an example and what it prints: the code is stripped of its types by smaltkit's own stripTypes, run by Node
// against the built package, and its output must be the text fence's. A ```ts fence without a ```text fence after it
// (code for a page, which needs a DOM) is shown, not run.
//
//   node scripts/docs-examples.mjs           check every example (test/docs.test.ts runs this)
//   node scripts/docs-examples.mjs --write   run them and write what they print into the text fences
//   node scripts/docs-examples.mjs --types   type-check every ```ts fence written by hand, run or not, with
//                                            TypeScript 7 against the built package (CI runs this)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { stripTypes } from 'smaltkit/typescript';

const root = path.resolve(import.meta.dirname, '..');
const FENCE = /^```ts\n((?:(?!^```)[\s\S])*?)^```\n\n?```text\n((?:(?!^```)[\s\S])*?)^```$/gm;

/** Every Markdown file under docs/, but VitePress's own folder. */
export function pages(dir = path.join(root, 'docs')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'public') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pages(p) : e.name.endsWith('.md') ? [p] : [];
  });
}

/** The examples in a page: their code, the output written under them, and where that output is. */
export function examples(text) {
  return [...text.matchAll(FENCE)].map((m) => ({
    code: m[1],
    expected: m[2].replace(/\n$/, ''),
    at: m.index + m[0].length - 3 - m[2].length,
    length: m[2].length,
    line: text.slice(0, m.index).split('\n').length,
  }));
}

/** What `code` prints, run in a module inside the package, in VitePress's cache folder (so `smaltkit/…` resolves to the build). */
export function run(code) {
  const dir = path.join(root, 'docs', '.vitepress', 'cache', 'examples');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `example-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(file, stripTypes(code));
  try {
    return execFileSync(process.execPath, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\n$/, '');
  } catch (e) {
    throw new Error(`the example failed:\n${e.stderr || e.message}`);
  } finally {
    rmSync(file, { force: true });
  }
}

// Names the examples for a page use as the page's own, declared for --types in a global file of their own, so an
// example can declare the same name.
const PRELUDE = `declare const rows: unknown; declare const code: string; declare const dfTypes: string; declare const csv: string;
declare function show(version: number): void; declare function showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
`;

/** Type-checks every ```ts fence outside a page's generated API, each as a module of its own. */
function typeCheck() {
  const dir = path.join(root, 'docs', '.vitepress', 'cache', 'types');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const where = new Map();
  for (const page of pages()) {
    // The generated API's code is declarations, not examples: blank it, keeping its lines for the line numbers.
    const text = readFileSync(page, 'utf8').replace(/<!-- api:start -->[\s\S]*?<!-- api:end -->/g, (m) => m.replace(/[^\n]/g, ''));
    for (const m of text.matchAll(/^```ts\n((?:(?!^```)[\s\S])*?)^```$/gm)) {
      const file = `example-${++n}.ts`;
      where.set(file, [path.relative(root, page), text.slice(0, m.index).split('\n').length + 1]);
      writeFileSync(path.join(dir, file), `${m[1]}export {};\n`);
    }
  }
  writeFileSync(path.join(dir, 'page.d.ts'), PRELUDE);
  const config = { extends: path.join(root, 'tsconfig.json'), compilerOptions: { types: [] }, include: ['*.ts'] };
  writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(config));
  try {
    execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript7', 'bin', 'tsc'), '-p', dir], { encoding: 'utf8' });
    console.log(`${n} examples type-check`);
  } catch (e) {
    // Name the page and its line instead of the generated file.
    console.error(String(e.stdout).replace(/^.*?(example-\d+\.ts)\((\d+),(\d+)\)/gm, (_, f, l, c) => {
      const [page, first] = where.get(f);
      return `${page}:${first + Number(l) - 1}:${c}`;
    }));
    process.exit(1);
  }
}

if (process.argv.includes('--types') && import.meta.url === `file://${process.argv[1]}`) typeCheck();
else if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  let failed = 0;
  for (const page of pages()) {
    let text = readFileSync(page, 'utf8');
    const rel = path.relative(root, page);
    // Back to front, so earlier offsets stay right as outputs change length.
    for (const ex of examples(text).reverse()) {
      let actual;
      try {
        actual = run(ex.code);
      } catch (e) {
        console.error(`${rel}:${ex.line}: ${e.message}`);
        failed++;
        continue;
      }
      if (actual === ex.expected) continue;
      if (write) text = text.slice(0, ex.at) + (actual ? `${actual}\n` : '') + text.slice(ex.at + ex.length);
      else {
        console.error(`${rel}:${ex.line}: prints\n${actual}\nnot\n${ex.expected}\n`);
        failed++;
      }
    }
    if (write) writeFileSync(page, text);
  }
  if (failed) process.exit(1);
}
