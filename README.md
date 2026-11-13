# smaltkit

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stenhoor/smalt-brand/main/badges/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="https://raw.githubusercontent.com/stenhoor/smalt-brand/main/badges/work-in-progress.svg" height="56"></picture></a>

[smaltworks.dev](https://smaltworks.dev/products/kits)

Shared browser code for the smalt apps: [smaltui](https://github.com/stenhoor/smaltui) (the query workbench) and
[smaltbi](https://github.com/stenhoor/smaltbi). Both run [smaltdb](https://github.com/stenhoor/smaltdb) in the browser
and need the same pieces around it; smaltkit holds those pieces once, in strict TypeScript, with type definitions.

## Modules

| Import | What it does |
| --- | --- |
| `smaltkit/engine` | Loads the smaltdb client at run time from the app's vendor copy, npm (jsDelivr) or a URL, starts its worker (through a blob module when cross-origin), reports its version; lists and deletes the databases in OPFS. `npm: false` turns npm engines off, for an app whose engine has smaltql and plugins built in. |
| `smaltkit/urls` | Rewrites pasted data URLs (GitHub, Hugging Face file pages) to raw-file URLs a page can fetch, and explains CORS errors. |
| `smaltkit/format` | Number and date formatting: presets (`currency0`, `percent`, `month`, …), format objects and patterns, compact axis labels. Dates never shift time zones. |
| `smaltkit/svg` | SVG helpers for charts: nice ticks, linear, log and band scales, calendar ticks, arcs, line paths, text measuring, colour ramps. |
| `smaltkit/charts` | Charts drawn as SVG/HTML strings: bar, column, line, area, combo, pie, donut, funnel, treemap, waterfall, gauge, KPI card, scatter, heatmap. Bar, column, line, area and combo take axis options (a continuous date or number axis, log scale, fixed ends, titles), reference lines, and small multiples (a `multiples` field: a panel per value, one scale). |
| `smaltkit/maps` | Maps drawn as SVG: GeoJSON and TopoJSON shapes, Mercator and equirectangular projections fitted to a box, and `mapChart`, a filled-region (choropleth) and point map. Shapes come from the app; none are bundled. |
| `smaltkit/table` | A flat table (sortable headers, totals, data bars, heat colours, pages, column widths set by dragging, frozen leading columns) and a pivot matrix with row, column and grand totals: stepped (levels indented, parents expand and collapse and show subtotals) or tabular. With the charts' `cellFormat` hook, measure values (and a KPI card's value) take a tone (good, bad, warning, accent) as text or background colour, and an icon. |
| `smaltkit/grid` | A virtualized data grid: draws only the visible rows; resizable, sortable columns; keyboard selection, copy and in-place editing. Rows come from an array or from a source that fetches blocks as they scroll into view, so a page never holds a whole result. `exportRows` writes CSV, TSV, JSON, NDJSON or SQL. |
| `smaltkit/sql` | SQL text utilities: a tokenizer and highlighter, statement splitting, parameter scanning, identifier and literal quoting, completion helpers and a light formatter. Text only: nothing here runs SQL. |
| `smaltkit/editor` | A small code editor (a textarea over a highlighted layer, no dependencies) with line numbers, auto-indent, comment toggling, bracket pairing, a completion popup and warnings (`setWarnings`: underlined, and their lines marked in the gutter with the messages on hover). Languages: `sqlLanguage` (statement shading, completion from the schema) and `typescriptLanguage`, which highlights SQL inside `` sql`…` `` and `` exec`…` `` templates as SQL. |
| `smaltkit/dom` | A small DOM toolkit: the `h()` element builder, menus, dialogs, toasts, downloads and file pickers. |
| `smaltkit/manifest` | The environment manifest's data steps, one format for every app: `applySteps()` runs SQL, imports (CSV, TSV, JSON, Parquet), inline rows, linked files (external tables) and connections, with files from URLs or kept in the browser (`local:`); plus `externalTableSql` and `referencedFiles` (for publishing). The engine's plugin helpers are passed in. |
| `smaltkit/controls` | Controls for picking values: a list (checkboxes or radios), a dropdown, buttons, a range and a search box, each reporting its selection through `onChange`. |
| `smaltkit/markdown` | Markdown to HTML, small and safe: headings, paragraphs, bold, italic, code, links (http(s) only), lists, quotes, rules, fenced code and pipe tables. Everything is escaped; raw HTML shows as text. |
| `smaltkit/git` | Reads a local git repository's `.git` folder, read only: objects (loose and packed, with deltas), refs and packed refs, branches, commits, trees and blobs, a file at any commit, history (of a file too), `blobId` (to compare a working file with a commit's) and a line diff (`diffLines`). It never writes to `.git` and never talks to a remote. In a page, `gitDirFromHandle` reads the folder through the File System Access API. |
| `smaltkit/pretty` | Pretty printing for people to read: `formatJson` lays out JSON (plans, results) on one line when it fits and one item per line when it doesn't; `formatTypeScript` re-indents TypeScript by bracket depth, changing only whitespace at line starts and ends. |
| `smaltkit/typescript` | TypeScript for TypeScript tabs and cells, with [smaltty](https://github.com/stenhoor/smaltty): `stripTypes` replaces the types with spaces, so every line and column of the JavaScript is the one the user wrote, and code that would make code of its own (enums, namespaces with values, parameter properties, `<T>x`) is refused with a `TypeScriptSyntaxError` that gives the line, the column and what to write instead. TypeScript's rules: an import of something that is only a type says `type`. smaltty is there too, as `smaltty` (its parser, its binder, its node kinds: all of it but the checker), for code that works on TypeScript's structure. It loads smaltty's stripping path (`smaltty/strip`) and binder (`smaltty/bind`), never the checker. smaltty is copied into `dist/smaltty/`, so this loads without a bundler. |
| `smaltkit/typecheck` | Type checking for TypeScript tabs and cells, with smaltty's checker: calls into the libraries the code uses, read from their declarations (`.d.ts`), with the names a page gives the code as `globals`. Errors are warnings (`TypeWarning`: offsets, line, column, tsc's code and message); every one is an error tsc reports too. `typeCheckWorker(setup)` checks in a worker (`typecheck-worker.js`), where a check replaced by a newer one before it starts resolves to `null`. This module loads none of the checker: its code (`smaltty/check`) is loaded in the worker only. A re-check after an edit takes about a millisecond: the libraries stay parsed between checks. The libraries can come prepared (`setup.prepared`: smaltty's `prepare()` buffer, written by the app's build), read in place of parsing their text, so the first check is quicker; a buffer this smaltty can't read is ignored, and the text read from `files` or fetched from `setup.fallback` (the app's `types.json`). `typeCheckWorker(setup, { warm: true })` gets the worker ready as soon as it starts (the prepared libraries read, a check of nothing): start it while the page is idle. |
| `smaltkit/typechecker` | The same checks in the page's thread, loading the checker there: `typeChecker(setup)` (call it with the code, get its warnings; `.warm()` gets it ready), `typeCheckHandler()`, the worker's side of `typeCheckWorker`, and `preparedReadable(setup)`, whether this smaltty reads the setup's prepared libraries. |
| `smaltkit/graph` | A graph view drawn on the GPU (WebGPU only), 2D and 3D, for nodes and relationships from any source: a force-directed layout in compute shaders (100,000 nodes) or a fixed one (a cluster per group, nothing overlapping), a spread to push nodes apart, animated changes (`setGraph(g, { animate: true })`, for stepping through versions), captions, hover and click, search, highlight and focus, and touch, mouse and keyboard to pan, zoom and orbit. `theme: 'css'` takes the colours from the `--sk-*` properties the charts read. `resultsToGraph` turns rows of graph values (`{ kind: 'node' }`, relationships, paths) into a graph. Rejects with `GpuUnavailableError` where there's no WebGPU. |
| `smaltkit/timeline` | A timeline for versions: a ruler of commits by time or by number, dragged, zoomed or stepped with the keyboard, with play, a tooltip per commit (time, author, message) and `onChange`. Styled through `--sk-tl-*`, then `--sk-*`. |
| `smaltkit/ui.css` | Styles for the charts, tables, grid, editor, controls, menus, dialogs and toasts, read from `--sk-*` custom properties that default to the smalt brand tokens. |

Everything except the CSS is also exported from `smaltkit`. Planned next: the dev server and vendor scripts
([smaltbi ADR 0005](https://github.com/stenhoor/smaltbi/blob/main/docs/adr/0005-smaltkit-and-smalt-brand.md)).

## Use it

smaltkit is not on npm yet. Depend on a commit of this repository:

```json
"dependencies": { "smaltkit": "github:stenhoor/smaltkit#<commit>" }
```

npm clones that commit and runs `prepare`, which builds `dist/`. Pin a full commit, not a branch, so installs are
repeatable, and update it deliberately. Once smaltkit is published, change the line to a version range
(`"smaltkit": "^0.1.0"`); imports stay the same.

```ts
import { normalizeDataUrl, corsHint } from 'smaltkit/urls';
import { engineSpec, loadEngine } from 'smaltkit/engine';

const engine = await loadEngine(engineSpec('myapp.engine'), { vendorUrl: 'vendor/smaltdb/', appName: 'myapp' });
const db = await engine.open('sales', { storage: 'opfs' });
```

`smaltkit/engine` uses smaltdb's types (`import type`, nothing at run time), so `smaltdb` is an optional peer
dependency: an app that imports the engine module has smaltdb installed already. From smaltdb 0.9, an app that builds
its own worker entry with plugins puts it in its vendor folder (as `smaltdb-worker.js`, or names it with
`workerFile`); engines from npm or a URL run smaltdb's stock worker, without the app's plugins.

### Charts and tables

A renderer takes a `ChartContext`: the element to draw into, its size, the options, and the data as columns tagged
with a role (`category`, `series`, `values`, `x`, `rows`, …) and a kind (`dimension` or `measure`). It writes the
chart in one `innerHTML` assignment. Marks carry `data-row="<row>"`, so the page can add selection, tooltips and drill
on top, and get `sk-dim` / `sk-on` when `ctx.selected(row)` returns false / true.

```ts
import { chartData, columnChart, type ChartColumn } from 'smaltkit/charts';

const columns: ChartColumn[] = [
  { key: 'c', role: 'category', label: 'Category', kind: 'dimension', values: ['Tea', 'Coffee'], fmt: String },
  { key: 'v', role: 'values', label: 'Revenue', kind: 'measure', values: [120, 340], fmt: String },
];
columnChart({
  el: document.querySelector('#chart')!, width: 480, height: 280, options: { labels: true },
  data: chartData(columns, 2), extra: {}, palette: 12, selected: () => null,
});
```

Load `dist/ui.css` with the page (after the brand's `tokens.css`, if it has it). To restyle, set `--sk-*` properties
on any ancestor: `--sk-text`, `--sk-muted`, `--sk-surface`, `--sk-border`, `--sk-grid`, `--sk-accent`, `--sk-pos`,
`--sk-neg`, `--sk-on-mark`, the series colours `--sk-c0` … `--sk-c11`, the ramps `--sk-seq-lo/hi` and
`--sk-div-lo/mid/hi`, the fonts `--sk-font`, `--sk-font-num`, and the sizes `--sk-fs-label`, `--sk-fs-sub`,
`--sk-fs-small`, `--sk-fs-kpi`. A report theme is a set of these values.

The output is plain ES2022 modules with no dependencies, one file per module (`dist/urls.js`), so a page can load them
without a bundler: copy `node_modules/smaltkit/dist/` next to the app, or use a bundler that resolves the package.

## Develop

```bash
npm install          # builds dist/ (prepare)
```

```bash
npm run typecheck    # TypeScript 7's tsc, strict, over src/ and test/
```

```bash
npm test             # builds, then node --test against the built package
```

```bash
npm run test:browser # builds, then the graph view and the timeline in Chromium (Playwright, installed globally)
```

Sources are in `src/`; `dist/` is generated and not committed. TypeScript 7 checks the code (the `typescript7` dev
dependency); TypeScript 6.0.3 (`typescript`, so `npx tsc`) still emits `dist/` and its `.d.ts` files. Tests import the
package by name (`smaltkit/urls`), so they check what the apps get. Node 22.18 or later runs the `.ts` tests directly.

## License

<a href="https://smaltworks.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/stenhoor/smalt-brand/main/badges/a-smaltworks-project-on-dark.svg"><img alt="A smaltworks project" src="https://raw.githubusercontent.com/stenhoor/smalt-brand/main/badges/a-smaltworks-project.svg" height="28"></picture></a>

MIT License.
