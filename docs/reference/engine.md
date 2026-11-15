# smaltkit/engine

Loads the smaltdb client at run time and starts its worker, reports the engine's version, and lists and deletes the databases smaltdb keeps in this origin's private storage (OPFS).

An app picks the engine with a spec, usually from the page's `?engine=` parameter:

| Spec | Engine |
| --- | --- |
| `vendor` (default) | The app's own copy, such as `vendor/smaltdb/`, copied from the package by `npm install`. |
| `https://…/dist/` | Any folder that serves `smaltdb.js` and `smaltdb-worker.js`. |

The client is imported when the page asks for it, not bundled, so a page switches engines without a rebuild. Engines
are never loaded from a CDN: the specs `npm` and `npm@<version>` are refused, and a missing vendor copy is an error
that says how to build it. A worker script must come from the page's own origin, so an engine from another origin is
started through a small blob module that imports it. An app whose engine has smaltql and plugins built in builds its
own worker and puts it in the vendor folder as `smaltdb-worker.js` (or names it with `workerFile`).

`smaltkit/engine` uses smaltdb's types only (`import type`), so `smaltdb` is an optional peer dependency.

## Examples

Open a database with the engine the page asks for:

```ts
import { engineSpec, loadEngine } from 'smaltkit/engine';

const engine = await loadEngine(engineSpec('myapp.engine'), { vendorUrl: 'vendor/smaltdb/', appName: 'myapp' });
const db = await engine.open('sales', { storage: 'opfs' });
```

List the databases kept in OPFS:

```ts
import { listOpfsDatabases, opfsAvailable } from 'smaltkit/engine';

if (opfsAvailable()) for (const d of await listOpfsDatabases()) console.log(d.name, d.size);
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`deleteOpfsDatabase`](./engine/deleteOpfsDatabase) | Delete a database and its side files. |
| [`engineSpec`](./engine/engineSpec) | The engine spec for this page: `?engine=` if present, else the one saved under `storageKey` (see setEngineSpec), else 'vendor'. |
| [`listOpfsDatabases`](./engine/listOpfsDatabases) | The databases smaltdb has stored in this origin's OPFS, sorted by name. |
| [`loadEngine`](./engine/loadEngine) | Import the smaltdb client for `spec` and prepare its worker. |
| [`opfsAvailable`](./engine/opfsAvailable) | Whether this page can use OPFS (it needs a secure context). |
| [`resolveEngine`](./engine/resolveEngine) | Where an engine spec loads from. |
| [`setEngineSpec`](./engine/setEngineSpec) | Remember an engine spec for later page loads ('vendor' or '' clears it). |

### Interfaces

#### Engine {#Engine}

```ts noplay
interface Engine {
    spec: string;
    label: string;
    version: EngineVersion | null;
    workerUrl: string;
    module: SmaltdbModule;
    open(name: string, options?: Omit<OpenOptions, 'worker'>): Promise<Database>;
}
```

| Member | |
| --- | --- |
| `spec` | The spec the engine was loaded from. |
| `label` | A short description for the UI, such as "bundled smaltdb" or the engine folder's URL. |
| `workerUrl` | The worker script open() starts: the engine's own URL, or a blob: URL for a cross-origin engine. |
| `open` | Open a database with this engine's worker. |

#### EngineLocation {#EngineLocation}

```ts noplay
interface EngineLocation {
    base: string;
    label: string;
}
```

| Member | |
| --- | --- |
| `base` | The folder the client (smaltdb.js) and worker are loaded from, ending in '/'. |

#### EngineVersion {#EngineVersion}

```ts noplay
interface EngineVersion {
    source: string;
    version?: string;
    commit?: string | null;
    path?: string;
}
```

What the loaded engine says about its version: VERSION.json in the vendor folder, or the npm package.

| Member | |
| --- | --- |
| `source` | 'npm' for a published package, 'checkout' for a build of a local smaltdb checkout. |

#### LoadEngineOptions {#LoadEngineOptions}

```ts noplay
interface LoadEngineOptions {
    vendorUrl: string | URL;
    baseUrl?: string | URL;
    workerFile?: string;
    appName?: string;
    npm?: boolean;
}
```

| Member | |
| --- | --- |
| `vendorUrl` | The app's vendor copy of smaltdb, used for the 'vendor' spec. Relative URLs resolve against `baseUrl`. |
| `baseUrl?` | What relative URLs (vendorUrl, a custom engine folder) resolve against. Default: the page (document.baseURI). |
| `workerFile?` | The worker's file name in the engine folder. Default: smaltdb-worker.js. |
| `appName?` | The app's name, used in console messages. |
| `npm?` | - `@deprecated` Ignored. Engines are no longer loaded from a CDN, so `npm` specs are always refused and a missing vendor copy is always an error. Kept so that apps passing `npm: false` still compile. |

#### OpfsDatabase {#OpfsDatabase}

```ts noplay
interface OpfsDatabase {
    name: string;
    size: number | null;
    modified: number | null;
}
```

| Member | |
| --- | --- |
| `size` | Bytes, including the write-ahead log; null while another tab holds the file open. |
| `modified` | Last modified, ms since the epoch; null while another tab holds the file open. |

### Types

#### Database {#Database}

```ts noplay
type Database = Smaltdb.Database;
```

#### OpenOptions {#OpenOptions}

```ts noplay
type OpenOptions = Smaltdb.OpenOptions;
```

#### SmaltdbModule {#SmaltdbModule}

```ts noplay
type SmaltdbModule = typeof Smaltdb;
```

The smaltdb client module, as loaded at run time.

<!-- api:end -->
