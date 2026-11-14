// Writes the generated parts of the reference: the API of each module's page (docs/reference/<module>.md), from the
// built declarations (dist/*.d.ts) and their doc comments, between `<!-- api:start -->` and `<!-- api:end -->`; and the
// custom properties of docs/reference/styles.md, from src/ui.css, between `<!-- css:start -->` and `<!-- css:end -->`.
// The rest of each page (what the module is for, its examples) is written by hand. `--check` writes nothing and fails if a page is out of date (CI).
//
//   npm run build && node scripts/docs-api.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const START = '<!-- api:start -->';
const END = '<!-- api:end -->';

// The modules, as package.json exports them (not the CSS, the worker or the whole package).
const modules = Object.keys(pkg.exports)
  .filter((k) => k.startsWith('./') && !k.endsWith('.css') && !k.endsWith('-worker') && !k.endsWith('.js') && !k.endsWith('.json'))
  .map((k) => k.slice(2));

const files = modules.map((m) => path.join(root, 'dist', `${m}.d.ts`));
for (const f of files) if (!existsSync(f)) throw new Error(`${path.relative(root, f)} is missing: run npm run build first`);
const program = ts.createProgram(files, { strict: true, skipLibCheck: true, noEmit: true, types: [] });
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: true });

const KIND = [
  ['Functions', (d) => ts.isFunctionDeclaration(d)],
  ['Classes', (d) => ts.isClassDeclaration(d)],
  ['Constants', (d) => ts.isVariableDeclaration(d)],
  ['Namespaces', (d) => ts.isSourceFile(d) || ts.isModuleDeclaration(d) || ts.isNamespaceExport(d)],
  ['Interfaces', (d) => ts.isInterfaceDeclaration(d)],
  ['Types', (d) => ts.isTypeAliasDeclaration(d)],
];

/** The declaration's text as TypeScript would print it, without comments and without `export declare`. */
function signature(decl) {
  let node = decl;
  if (ts.isVariableDeclaration(decl)) node = decl.parent.parent;
  if (ts.isSourceFile(decl)) return null;
  const sf = node.getSourceFile();
  let text = printer.printNode(ts.EmitHint.Unspecified, node, sf);
  text = text.replace(/^export\s+/, '').replace(/^declare\s+/, '');
  return text.trim();
}

/** A symbol's doc comment (with @param and @returns tags kept as text). */
function docs(sym) {
  const text = ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();
  const tags = sym.getJsDocTags(checker).filter((t) => t.name !== 'internal');
  const lines = tags.map((t) => `- \`@${t.name}\`${t.text ? ` ${ts.displayPartsToString(t.text)}` : ''}`);
  return [text, lines.join('\n')].filter(Boolean).join('\n\n');
}

/** The doc comment just before a node that has no symbol of its own (`export * as name from`). */
function leadingDoc(node) {
  const text = node.getSourceFile().text;
  const ranges = ts.getLeadingCommentRanges(text, node.pos) ?? [];
  const last = ranges.filter((r) => text.startsWith('/**', r.pos)).at(-1);
  if (!last) return '';
  return text.slice(last.pos + 3, last.end - 2).split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').trim();
}

/** Doc text made safe for VitePress: outside code spans, `<` is not a tag and `{{` is not Vue. */
function prose(text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;').replace(/\{\{/g, '&#123;&#123;')))
    .join('');
}

function isInternal(sym) {
  return sym.getJsDocTags(checker).some((t) => t.name === 'internal');
}

/** Interfaces' members: name, type and doc comment, for a table. */
function members(decl) {
  if (!ts.isInterfaceDeclaration(decl)) return null;
  return decl.members.map((m) => {
    const sym = m.symbol;
    const name = m.name ? m.name.getText() : ts.isCallSignatureDeclaration(m) ? '(call)' : '[index]';
    return { name, optional: !!m.questionToken, doc: sym ? docs(sym) : '' };
  });
}

function api(module) {
  const sf = program.getSourceFile(path.join(root, 'dist', `${module}.d.ts`));
  const modSym = checker.getSymbolAtLocation(sf);
  if (!modSym) return '_This module exports nothing._\n';
  const groups = new Map(KIND.map(([k]) => [k, []]));
  for (const exported of checker.getExportsOfModule(modSym)) {
    const sym = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (isInternal(sym)) continue;
    const decl = sym.declarations?.[0];
    if (!decl) continue;
    const kind = KIND.find(([, test]) => test(decl))?.[0];
    if (!kind) continue;
    groups.get(kind).push({ name: exported.name, sym, decl, exported });
  }
  let out = '';
  for (const [kind, items] of groups) {
    if (!items.length) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));
    out += `### ${kind}\n\n`;
    for (const { name, sym, decl, exported } of items) {
      out += `#### ${name} {#${name}}\n\n`;
      if (kind === 'Namespaces') {
        out += `\`smaltkit/${module}\` exports \`${name}\` as a namespace.\n\n`;
        const ns = exported.declarations?.find((d) => ts.isNamespaceExport(d));
        const d = ns ? leadingDoc(ns.parent) : docs(sym);
        if (d) out += `${prose(d)}\n\n`;
        continue;
      }
      const sigs = sym.declarations.filter((d) => !ts.isSourceFile(d)).map(signature).filter(Boolean);
      out += '```ts\n' + sigs.join('\n') + '\n```\n\n';
      const d = docs(sym);
      if (d) out += `${prose(d)}\n\n`;
      const ms = members(decl)?.filter((m) => m.doc);
      if (ms?.length) {
        out += '| Member | |\n| --- | --- |\n';
        for (const m of ms) out += `| \`${m.name}${m.optional ? '?' : ''}\` | ${prose(m.doc).replace(/\n+/g, ' ').replace(/\|/g, '\\|')} |\n`;
        out += '\n';
      }
    }
  }
  return out;
}

/** The custom properties ui.css reads, with their defaults, from its `:where(:root)` block. */
function cssProperties() {
  const css = readFileSync(path.join(root, 'src', 'ui.css'), 'utf8');
  const block = /:where\(:root\)\s*\{([\s\S]*?)\n\}/.exec(css)[1];
  let out = '| Property | Default |\n| --- | --- |\n';
  for (const m of block.matchAll(/^\s*(--sk-[\w-]+):\s*([^;]+);/gm)) out += `| \`${m[1]}\` | \`${m[2].trim().replace(/\|/g, '\\|')}\` |\n`;
  return out;
}

const blocks = [
  ...modules.map((m) => ({ page: `reference/${m}.md`, start: START, end: END, text: () => api(m) })),
  { page: 'reference/styles.md', start: '<!-- css:start -->', end: '<!-- css:end -->', text: cssProperties },
];

let stale = 0;
for (const { page: rel, start: START, end: END, text: generate } of blocks) {
  const page = path.join(root, 'docs', rel);
  if (!existsSync(page)) {
    console.error(`docs/${rel} is missing`);
    stale++;
    continue;
  }
  const text = readFileSync(page, 'utf8');
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < a) {
    console.error(`docs/${rel} has no ${START} … ${END} block`);
    stale++;
    continue;
  }
  const next = `${text.slice(0, a + START.length)}\n\n${generate()}${text.slice(b)}`;
  if (next === text) continue;
  if (check) {
    console.error(`docs/${rel} is out of date: run npm run docs:api`);
    stale++;
  } else {
    writeFileSync(page, next);
    console.log(`wrote docs/${rel}`);
  }
}
if (stale) process.exit(1);
