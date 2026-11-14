# applySteps

<!-- api:start -->

```ts
import { applySteps } from 'smaltkit/manifest';
function applySteps<D extends StepDatabase>(db: D, steps: readonly ManifestStep[], options: ApplyOptions<D>): Promise<void>;
```

Run steps against an open database, in order. Throws on the first step that fails, naming it.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `db` | `D` | An open database. |
| `steps` | `readonly ManifestStep[]` | The manifest's data steps. |
| `options` | `ApplyOptions&lt;D>` | What relative paths resolve against (`base`), the engine plugins' helpers (`io`), a log, the browser's files (`local:` names), and a fetch. |

## Returns

`Promise<void>`

## Errors

- Error naming the step that failed and why: a file that can't be fetched, a `local:` file this browser doesn't have, or the engine's error.

<!-- api:end -->

## Examples

Steps run in order:

```ts
import { applySteps } from 'smaltkit/manifest';

// A stand-in database and plugin helpers that record what they're asked to do.
const done: string[] = [];
const db = {
  exec: async (sql: string) => (done.push(sql), { changes: 0 }),
  query: async () => [],
};
const io = {
  importCSV: async (_db: unknown, table: string, source: Blob | string) => (done.push(`import ${table} (${typeof source === 'string' ? 'text' : 'file'})`), { rows: 2 }),
  importJSON: async (_db: unknown, table: string) => (done.push(`import ${table} (json)`), { rows: 1 }),
  registerFile: async (_db: unknown, name: string) => void done.push(`register ${name}`),
};
const fetch = (async (url: string) => new Response(`a,b\n1,2\n3,4`, { status: url.includes('missing') ? 404 : 200 })) as typeof globalThis.fetch;
await applySteps(db, [
  { sql: 'CREATE TABLE notes (text TEXT)' },
  { import: 'data/sales.csv', table: 'sales' },
], { base: 'https://example.com/env/manifest.json', io, fetch, log: (level, text) => console.log(level, text) });
console.log(done);
```

```text
ok step 1: ran SQL
ok step 2: imported 2 rows into sales
[ 'CREATE TABLE notes (text TEXT)', 'import sales (file)' ]
```

The first step that fails stops the rest, and is named:

```ts
import { applySteps } from 'smaltkit/manifest';

// A stand-in database and plugin helpers that record what they're asked to do.
const done: string[] = [];
const db = {
  exec: async (sql: string) => (done.push(sql), { changes: 0 }),
  query: async () => [],
};
const io = {
  importCSV: async (_db: unknown, table: string, source: Blob | string) => (done.push(`import ${table} (${typeof source === 'string' ? 'text' : 'file'})`), { rows: 2 }),
  importJSON: async (_db: unknown, table: string) => (done.push(`import ${table} (json)`), { rows: 1 }),
  registerFile: async (_db: unknown, name: string) => void done.push(`register ${name}`),
};
const fetch = (async (url: string) => new Response(`a,b\n1,2\n3,4`, { status: url.includes('missing') ? 404 : 200 })) as typeof globalThis.fetch;
try {
  await applySteps(db, [{ import: 'missing.csv', table: 't' }, { sql: 'SELECT 1' }], { base: 'https://example.com/', io, fetch });
} catch (e) {
  console.log((e as Error).message);
}
console.log(done.length);
```

```text
step 1: cannot fetch https://example.com/missing.csv: HTTP 404
0
```

## See also

- [`externalTableSql`](./externalTableSql): what a `link` step runs.
- [`referencedFiles`](./referencedFiles) and [`localFiles`](./localFiles).
- [`loadEngine`](../engine/loadEngine): the database.
