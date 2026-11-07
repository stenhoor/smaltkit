# CLAUDE.md

smaltkit is shared browser code for the smalt apps, [smaltui](https://github.com/stenhoor/smaltui) and
[smaltbi](https://github.com/stenhoor/smaltbi). Several Claude Code sessions work on the smalt repos in parallel and
cannot see each other: this file is the shared starting point. smaltui and smaltdb have matching files; keep the working
rules the same.

## Brand: read smalt-brand first

Before changing this repository's site, README, or how it describes the product, read smalt-brand's
[BRAND.md](https://github.com/stenhoor/smalt-brand/blob/main/BRAND.md) (the family table, and "Sites and READMEs", the
standard every product site and README follows) and
[DECISIONS.md](https://github.com/stenhoor/smalt-brand/blob/main/DECISIONS.md). A newer decision there wins over any
copy here: lines and roles change, and a copy taken before the change is out of date.

- Copy brand files and the site kit (`themes/vitepress/`) unchanged. To change them, change smalt-brand first, then
  copy them again.
- A change to this product's status or to what it does comes with a smalt-brand PR that updates smaltworks.dev (its
  status page and this product's page), linked with `Depends on:`.

## Commands

```bash
npm install            # prepare builds dist/ (tsc -p tsconfig.build.json)
npm run typecheck      # tsc --noEmit, strict, over src/ and test/ (CI runs it)
npm test               # build, then node --test test/*.test.ts against the built package
```

## Repo map

- `src/` holds the modules (strict TypeScript). Each is its own subpath export (`smaltkit/urls` → `dist/urls.js`) and
  is re-exported from `src/index.ts`. Keep relative imports as `./name.js`.
- `test/*.test.ts` import the package by name, so they test the built output.
- `dist/` and `node_modules/` are generated: do not edit or commit them.

## Rules for code here

- Browser-first: no Node or DOM-framework dependencies in `src/`, no runtime dependencies at all unless agreed. Output
  must load in a page without a bundler.
- No app names in user-facing text: write "the raw file is used", not "smaltui uses the raw file".
- Adding a module: add `src/<name>.ts`, an `exports` entry in package.json, a line in `src/index.ts`, tests, and a row in
  the README's module table.
- Changing an export is a breaking change for both apps. Until 1.0, bump the minor version for breaking changes and
  say in the PR what the apps must change.

## Working rules for sessions

- One task per branch and PR. Do not add unrelated work to an open PR: it holds up everything else in it.
- Mark unfinished work clearly, and open a PR only when CI passes.
- Read review comments on your PR and answer them with commits that say what they address.
- When a PR depends on another repo's PR, add a line such as `Depends on: stenhoor/smalt-brand#2`.

## Cross-repo impact

- **Consumers:** smaltui and smaltbi depend on a pinned commit (`github:stenhoor/smaltkit#<commit>`) until smaltkit is
  on npm. A merge here changes nothing in the apps until they bump the pin; when you change an export, open or note the
  follow-up PRs there.
- **smaltdb:** modules that wrap the engine use its types (`import type ... from 'smaltdb'`) and should not pin a
  version narrower than the apps do.
- **smalt-brand:** UI moved here (editor, grid) takes colours from the brand tokens (`--primary`, `--text-2`,
  `--syn-*`, …), never hand-picked hex values.
