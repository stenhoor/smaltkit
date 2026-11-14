# smaltkit/manifest

The environment manifest's data steps, one format for every app: `applySteps()` runs SQL, imports (CSV, TSV, JSON, Parquet), inline rows, linked files (external tables) and connections, with files from URLs or kept in the browser (`local:`).

The engine's plugin helpers (import, external tables) are passed in, so this module loads none of them itself.
`externalTableSql` writes the statement that links a file as a table, and `referencedFiles` and `localFiles` list the
files a manifest reads, for publishing it.

## Examples

The statement that links a file:

```ts
import { externalTableSql } from 'smaltkit/manifest';

console.log(externalTableSql({ table: 'trips', location: 'https://example.com/trips.parquet', format: 'parquet' }));
```

```text
CREATE EXTERNAL TABLE trips WITH (location = 'https://example.com/trips.parquet', format = 'parquet')
```

The files a manifest's steps read:

```ts
import { referencedFiles, localFiles, formatFromName } from 'smaltkit/manifest';

const steps = [
  { sql: 'CREATE TABLE t (a INT)' },
  { import: 'data/sales.csv', table: 'sales' },
  { link: 'local:trips.parquet', table: 'trips' },
];
console.log(referencedFiles(steps));
console.log(localFiles(steps));
console.log(formatFromName('sales.tsv'));
```

```text
[ 'data/sales.csv' ]
[ 'trips.parquet' ]
tsv
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### applySteps {#applySteps}

```ts
function applySteps<D extends StepDatabase>(db: D, steps: readonly ManifestStep[], options: ApplyOptions<D>): Promise<void>;
```

Run steps against an open database, in order. Throws on the first step that fails, naming it.

#### externalTableSql {#externalTableSql}

```ts
function externalTableSql({ table, location, format, options, connection, columns, ifNotExists }: ExternalTableSpec): string;
```

CREATE EXTERNAL TABLE text for a location (URL, `file:<name>`, or a path under a connection).

#### formatFromName {#formatFromName}

```ts
function formatFromName(name: string): DataFormat;
```

The format a file name implies (by extension); CSV when it says nothing.

#### importParquet {#importParquet}

```ts
function importParquet<D extends StepDatabase>(db: D, io: Pick<StepIO<D>, 'registerFile'>, table: string, blob: Blob): Promise<{
    rows: number;
}>;
```

Copy a Parquet file into a table, through a temporary external table (columns and types come from the file's
footer) and INSERT … SELECT. A missing table is created with the file's column types.

#### localFiles {#localFiles}

```ts
function localFiles(steps: readonly ManifestStep[]): string[];
```

Names of the `local:` files the steps read (files kept in this browser).

#### referencedFiles {#referencedFiles}

```ts
function referencedFiles(steps: readonly ManifestStep[]): string[];
```

Relative paths of the files the steps read (to copy them when publishing a static site).

### Interfaces

#### ApplyOptions {#ApplyOptions}

```ts
interface ApplyOptions<D extends StepDatabase = StepDatabase> {
    base: string;
    io: StepIO<D>;
    log?: StepLog;
    files?: FileStore;
    fetch?: typeof fetch;
}
```

| Member | |
| --- | --- |
| `base` | What relative paths resolve against: the manifest's URL. |
| `fetch?` | Default: the global fetch. |

#### ColumnDef {#ColumnDef}

```ts
interface ColumnDef {
    name: string;
    type?: string;
}
```

#### DataManifest {#DataManifest}

```ts
interface DataManifest {
    database?: {
        name?: string;
        storage?: 'memory' | 'opfs';
    };
    init?: 'always' | 'once' | 'none';
    steps?: ManifestStep[];
}
```

The database part of a manifest. Apps add their own fields (saved queries, notebooks, a report's model).

| Member | |
| --- | --- |
| `database?` | The database to open. Default: in memory, named by the app. |
| `init?` | OPFS only: rebuild on every load (`always`), only when the database is empty (`once`), or never (`none`). |

#### ExternalTableSpec {#ExternalTableSpec}

```ts
interface ExternalTableSpec {
    table: string;
    location: string;
    format?: DataFormat | string;
    options?: ReaderOptions;
    connection?: string;
    columns?: ColumnDef[];
    ifNotExists?: boolean;
}
```

#### FileStore {#FileStore}

```ts
interface FileStore {
    get(name: string): Promise<Blob | null>;
}
```

Files kept in this browser, addressed in steps as `local:<name>`.

#### StepDatabase {#StepDatabase}

```ts
interface StepDatabase {
    exec(sql: string): Promise<{
        changes: number;
    }>;
    query(sql: string, params?: StepParams): Promise<unknown>;
}
```

What the steps need of a database: smaltdb's client `Database` has these.

#### StepIO {#StepIO}

```ts
interface StepIO<D = StepDatabase> {
    importCSV(db: D, table: string, source: Blob | string, options?: Record<string, unknown>): Promise<{
        rows: number;
    }>;
    importJSON(db: D, table: string, source: Blob | string, options?: Record<string, unknown>): Promise<{
        rows: number;
    }>;
    registerFile(db: D, name: string, file: Blob | null): Promise<void>;
}
```

The engine plugins' client helpers (`@smaltdb/io/client`, `@smaltdb/external/client`), as the app loaded them.

### Types

#### DataFormat {#DataFormat}

```ts
type DataFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet';
```

#### ManifestStep {#ManifestStep}

```ts
type ManifestStep = {
    sql: string;
} | {
    sqlFile: string;
} | {
    import: string;
    table: string;
    format?: DataFormat;
    options?: ReaderOptions;
} | {
    link: string;
    table: string;
    format?: DataFormat;
    options?: ReaderOptions;
    connectionName?: string;
    columns?: ColumnDef[];
} | {
    table: string;
    data: Record<string, unknown>[];
    options?: ReaderOptions;
} | {
    connection: string;
    url: string;
};
```

One step. The key that says what it does is `sql`, `sqlFile`, `import`, `link`, `data` or `connection`.

#### ReaderOptions {#ReaderOptions}

```ts
type ReaderOptions = Record<string, string | number | boolean | null | undefined>;
```

Reader options for imports and external tables (header, delimiter, quote, null, skip, encoding, …).

#### StepLog {#StepLog}

```ts
type StepLog = (level: 'ok' | 'warn', text: string) => void;
```

#### StepParams {#StepParams}

```ts
type StepParams = readonly (string | number | bigint | Uint8Array | null)[];
```

SQL parameters, by position.

<!-- api:end -->
