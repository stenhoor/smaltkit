# Reference

smaltkit is one module per job. Import a module by its subpath (`smaltkit/engine`) to load only that module, or
everything from `smaltkit`; the styles are `smaltkit/ui.css`. Each page says what the module is for, shows it with
examples, and lists its API: the signatures and doc comments of everything it exports, generated from its declarations.

Functions are moving to pages of their own, a few modules at a time: so far those of `smaltkit/urls`, `format`,
`markdown`, `pretty` and `typescript`. A function's page has its signature, parameters, what it returns and the errors it
raises, then examples, a demo and related functions.

Examples with their output under them are tests: CI runs them against the built package and checks what they print.
Examples for a page (the charts, the grid, the editor) need a DOM and are type-checked only.

## Engine and data

| Module | What it does |
| --- | --- |
| [`smaltkit/engine`](./engine) | Loads the smaltdb client at run time (the app's copy, npm or a URL), starts its worker and reports its version; lists and deletes the databases in OPFS. |
| [`smaltkit/manifest`](./manifest) | The environment manifest's data steps, one format for every app: SQL, imports, inline rows, linked files and connections. |
| [`smaltkit/urls`](./urls) | Rewrites pasted data URLs to raw-file URLs a page can fetch, and explains CORS errors. |
| [`smaltkit/git`](./git) | Reads a local git repository's `.git` folder, read only: commits, trees, blobs, history and a line diff. |

## Languages

| Module | What it does |
| --- | --- |
| [`smaltkit/sql`](./sql) | SQL text utilities: tokenizer, highlighter, statement splitting, parameters, quoting, completion and a light formatter. |
| [`smaltkit/cypher`](./cypher) | Cypher text utilities: tokenizer, highlighter, statement splitting and completion. |
| [`smaltkit/typescript`](./typescript) | TypeScript stripped by smaltty, positions kept, and smaltty's parser and binder. |
| [`smaltkit/typecheck`](./typecheck) | Type checking with smaltty's checker in a worker; errors are warnings. |
| [`smaltkit/typechecker`](./typechecker) | The same checks in the page's thread. |

## Text

| Module | What it does |
| --- | --- |
| [`smaltkit/format`](./format) | Number and date formatting: presets, patterns and format objects, compact axis labels. |
| [`smaltkit/markdown`](./markdown) | Markdown to HTML, small and safe. |
| [`smaltkit/pretty`](./pretty) | Pretty printing of JSON and re-indenting of TypeScript. |

## Drawing

| Module | What it does |
| --- | --- |
| [`smaltkit/svg`](./svg) | SVG helpers: ticks, scales, arcs, line paths, text measuring, colour ramps. |
| [`smaltkit/charts`](./charts) | Charts as SVG and HTML strings, from bar to heatmap, with axes, reference lines and small multiples. |
| [`smaltkit/maps`](./maps) | GeoJSON and TopoJSON maps: projections, paths, filled-region and point maps. |
| [`smaltkit/table`](./table) | A flat table and a pivot matrix with totals. |
| [`smaltkit/graph`](./graph) | A graph view on the GPU (WebGPU), 2D and 3D, up to 100,000 nodes. |
| [`smaltkit/timeline`](./timeline) | A timeline of versions to drag, zoom, step and play through. |

## Interface

| Module | What it does |
| --- | --- |
| [`smaltkit/grid`](./grid) | A virtualized data grid, with export to CSV, TSV, JSON, NDJSON or SQL. |
| [`smaltkit/editor`](./editor) | A small code editor for SQL, Cypher and TypeScript, with completion and warnings. |
| [`smaltkit/controls`](./controls) | Controls for picking values: lists, dropdowns, buttons, ranges and search. |
| [`smaltkit/dom`](./dom) | The `h()` element builder, menus, dialogs, toasts, downloads and file pickers. |
| [`smaltkit/ui.css`](./styles) | The styles for all of these, read from `--sk-*` custom properties. |
