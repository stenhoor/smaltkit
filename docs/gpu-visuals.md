# GPU maps and graphs in an app

How an app (a BI report, a notebook) uses `smaltkit/geo` and `smaltkit/graph` as its own visuals. Written for
whoever, person or agent, brings them into [smaltbi](https://github.com/stenhoor/smaltbi): the steps are in order, each
with where in smaltbi's code it goes and how to know it is done. Read smaltbi's `CLAUDE.md`, `docs/ARCHITECTURE.md`
("From a visual to SQL") and `src/visuals/api.ts` first.

The code came from smaltgl ([stenhoor/smalt-geo](https://github.com/stenhoor/smalt-geo)), which keeps the docs site with
runnable examples, the tech demo, sample datasets and a plugin build of these visuals. Its browser tests run this
kit's GPU code on a real WebGPU device (SwiftShader in CI).

## What the kit provides

| Import | What it is |
| --- | --- |
| `smaltkit/geo/visual` | `VISUALS`: the map visuals with their data roles and options, in the shapes of a BI tool's `RoleDef` and `OptionDef`. `MapVisual`: a controller mounted once per frame and updated on every render. `themeFromCss`: the app's colours from CSS variables. `buildVisual`: role-tagged columns to layers, a pure function. |
| `smaltkit/geo/map`, `…/scatter`, `…/basemap`, … | The map and its pieces, for visuals the catalogue doesn't have. |
| `smaltkit/geo/smaltcy` | Graph query results with coordinates as map layers: nodes as points, relationships and paths as arcs (`graphLayers`). |
| `smaltkit/graph` | The node-link graph renderer: `createGraphView(canvas)`, 2D and 3D, force layout on the GPU; `resultsToGraph` turns graph query results into what it draws. |

The map visuals (roles are all `max: 1`):

| Kind | Dimension roles | Measure roles | Row limit | Selects rows |
| --- | --- | --- | --- | --- |
| `points` | `latitude`, `longitude`, `category` | `values` (colour), `size` | 1,000,000 | yes |
| `heatmap` | `latitude`, `longitude` | `weight` | 2,000,000 | no |
| `hexbin` | `latitude`, `longitude` | `values` | 2,000,000 | no |
| `arcs` | `originLatitude`, `originLongitude`, `destinationLatitude`, `destinationLongitude` | `values` | 200,000 | yes |
| `regions` | `location` | `values` | 50,000 | yes |

Every visual has a `basemap` option (`auto` follows the theme, `light`, `dark`, `none`) and `tilt`; the rest are in
`src/geo/visual/catalogue.ts`. Kinds and role names are a contract with saved reports: the kit adds, never renames.

## Step 1: pin the kit

Bump smaltbi's `smaltkit` pin (`package.json`) to a commit with `smaltkit/geo`, run `npm install`, commit the
lockfile. In smaltbi's Vite config, keep `smaltkit` out of dependency pre-bundling (`optimizeDeps.exclude`): the
basemap starts its tile worker with `new URL('./tile-worker.js', import.meta.url)`, which Vite bundles only from
unbundled sources (the type checker's worker works the same way).

**Done when:** `import { VISUALS } from 'smaltkit/geo/visual'` type-checks in smaltbi and `npm run build` succeeds.

## Step 2: register the map visuals

Add a module next to smaltbi's own map visual (`smaltkit/maps`, in `src/visuals/`) that turns each catalogue entry
into a `VisualDef`, with a type such as `geo.points`, and registers it in the gallery. For each `render(ctx)`:

1. **One `MapVisual` per frame.** Keep a `Map<HTMLElement, MapVisual>`. On the first render into `ctx.el`, call
   `MapVisual.mount(ctx.el, { onSelect })`. It is async (it asks for a GPU device); keep the latest `ctx` and apply
   it when the mount resolves. Later renders call `visual.update(…)` on the same object: the device, the basemap and
   its tiles live on.
2. **Data by role.** Hand the columns over as they are, no object per row:

   ```ts
   const data: VisualData = {
     rows: ctx.data.rows,
     column: (role) => {
       const c = ctx.data.role(role)[0];
       return c && { values: c.values, label: c.label, format: c.fmt };
     },
   };
   ```

   Values may be numbers, numeric text, bigints or nulls (as SQL results have them), text for categories. Reuse the
   same `VisualData` object for the same result (a `WeakMap` keyed by `ctx.data`): the same object means the same
   data, so layers are not rebuilt when only the selection or the options change.
3. **Theme.** `themeFromCss(ctx.el, { palette: ['--sk-c0', …, '--sk-c11'], sequential: ['--sk-seq-lo', '--sk-seq-hi'],
   background: '--sk-surface' })`, the variables `styles/report.css` already sets. Any CSS colour syntax works,
   `oklch()` and `color-mix()` included. Cache it per theme; `basemap: 'auto'` follows it into light or dark.
4. **Selection.** `selection: (row) => ctx.selected(row)`. It becomes a byte per row on the GPU and dims unselected
   rows; a change is one small upload. Mark the def `selfInteractive: true` so smaltbi renders again when the
   selection changes and leaves clicks to the map.
5. **Clicks.** `onSelect(row, additive)`: a data row (with Ctrl, Cmd or Shift: additive) calls
   `ctx.api.select(row, additive)`; `null` (the empty map) calls `ctx.api.setFilters([])`.
6. **Errors.** `mount` rejects with `GpuUnavailableError` (from `smaltkit/geo/core`) where the browser has no WebGPU: show its message in the
   frame. A visual missing a role draws nothing and says what is missing.

smalt-geo's `src/hosts/smaltbi.ts` does all of this for smaltbi's plugin API 1 (about 200 lines, with role and option
mapping and icons for the gallery): copy from it, leaving out what only a plugin file needs (the inlined tile worker,
`__SMALTGL_TILE_WORKER__`, and the sweep for detached frames, which step 3 replaces).

**Done when:** an end-to-end test (in `test/e2e.mjs`, launched with WebGPU on SwiftShader: the flags are `WEBGPU_ARGS`
in smalt-geo's `test/browser/harness.mjs`) renders a `geo.points` visual over a table with latitude and longitude,
with `basemap: 'none'` so it needs no network: the canvas has coloured pixels, a click on a point selects it and the
page's other visuals filter, and a selection elsewhere dims the map's other points.

## Step 3: free maps when their frames go

A map holds a GPU device, uploaded data and tiles. Call `visual.destroy()` (and drop it from the map of frames)
whenever smaltbi drops a visual's body element, in `src/report/view.ts`:

- a page change or a re-layout that replaces the frames;
- a deleted visual, or a change of its type;
- `ReportView.destroy()`;
- `drawRepeat`, whose `rt.body.replaceChildren(...)` replaces panels' bodies;
- an error written over the body (`rt.body.innerHTML = …`).

A `dispose?(el)` on `VisualDef` that the view calls in those places is the general form, and plugins can use it too.

**Done when:** switching pages frees each map's device at once (count `destroy` calls in a test).

## Step 4: raw rows and limits for big data

The default plan (`ReportView.plan()`, `defaultPlan`) groups by every dimension and aggregates every measure. For
locations with totals that is right; for a million GPS pings it is a `GROUP BY` over latitude and longitude that
returns nearly every row, more slowly, and the designer's row limits are sized for SVG.

- `src/core/compile.ts`, `QuerySpec`: add `rows?: true`, compiled with no `GROUP BY` and no aggregate (dimension
  fields as they are; measure-role fields must be columns; an aggregate expression is an error naming the field).
- `VisualDef`: a flag such as `rows?: 'grouped' | 'raw' | 'choose'`; `heatmap` and `hexbin` want raw rows, `points`
  either (an "Aggregate by location" switch).
- `src/designer/panel.ts` ("Row limit"): allow the catalogue's `limit` (millions).
- `src/data/runner.ts`: keep results columnar (`Float64Array` for numbers): they go to the GPU as they are.

**Done when:** a heatmap over a 1,000,000-row table runs one `SELECT lat, lng` and draws.

## Step 5: export and print

A map finishes drawing after its tiles arrive, after `render` returns. Anything that captures a page (print, export,
thumbnails) awaits `visual.ready()` for every map on it first. A WebGPU canvas is read in the task that draws it:
a `snapshot()` on `MapVisual` (draw a frame, `toBlob` in the same task) is the kit's follow-up when smaltbi needs PNGs.

**Done when:** printing a page with a map shows the map with its basemap.

## Step 6: the basemap's network, and one device per page

- **Tiles.** The basemap fetches OpenStreetMap vector tiles from OpenFreeMap unless told otherwise:
  `MapVisual.mount(el, { tiles })` takes another TileJSON URL or tile template, and the `basemap: 'none'` option makes
  no requests (offline reports, private networks). A report-level setting for these is smaltbi's call. A published
  site with a Content-Security-Policy needs `worker-src 'self'` and the tile host in `connect-src`.
- **One device.** Each map asks for its own GPU device. For a page of many maps, request one device
  (`navigator.gpu.requestAdapter()`, then `requestDevice()`) and pass it to every mount (`{ device }`); a map never
  destroys a device it was given.

**Done when:** a report with `basemap: 'none'` makes no tile requests, and a page of four maps calls `requestDevice`
once.

## Step 7: graph data

- **On a map.** Graph results whose nodes have coordinates draw as points and arcs: `graphLayers(graph, cypher)` from
  `smaltkit/geo/smaltcy` collects them as columns for the scatter and arcs layers on a map from `smaltkit/geo/map` (or as `points` and `arcs` visuals, with the node
  and relationship columns as roles).
- **As a network.** `createGraphView(canvas)` from `smaltkit/graph` draws nodes and relationships (`setGraph`, with
  `resultsToGraph` for query results), with picking for clicks. A catalogue entry for it, like the map visuals' (roles
  for source, target, label, group and size), is the next piece for the kit, so a host can register it the same way.

## Things not to change

- smaltbi's own `map` visual (SVG, `smaltkit/maps`) stays for small maps that must print and export as vectors; the GPU
  visuals are for large data, density, flows, 3D and graphs.
- Visual kinds and role names are saved in reports: add, don't rename.

## Checklist

- [ ] 1. `smaltkit` pinned to a commit with `smaltkit/geo`; `smaltkit` excluded from Vite's pre-bundling
- [ ] 2. the catalogue's visuals registered, one `MapVisual` per frame; end-to-end test (render, click, dim)
- [ ] 3. `destroy()` wherever a visual's body is dropped
- [ ] 4. raw-row queries (`QuerySpec.rows`) and the catalogue's limits in the designer
- [ ] 5. `ready()` awaited by print and export
- [ ] 6. tile source and `basemap: 'none'` settings; one device per page
- [ ] 7. graph results on maps; a network visual once the kit has its catalogue entry
