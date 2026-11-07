// The environment manifest's data steps: how a page builds its database when it opens. One format for every smalt app,
// so a manifest written for one opens in another.
//
//   { "database": { "name": "demo", "storage": "memory" | "opfs" },
//     "init": "always" | "once" | "none",
//     "steps": [
//       { "sql": "CREATE TABLE …; INSERT …" },
//       { "sqlFile": "schema.sql" },
//       { "import": "data/cities.csv", "table": "cities", "format": "csv", "options": { "header": true } },
//       { "import": "data/sales.parquet", "table": "sales" },
//       { "import": "local:orders.csv", "table": "orders" },
//       { "table": "notes", "data": [ { "id": 1, "body": "…" } ] },
//       { "link": "data/rates.csv", "table": "rates", "format": "csv", "columns": [ { "name": "rate", "type": "REAL" } ] },
//       { "connection": "api", "url": "https://example.com/v1/" } ] }
//
// Relative paths resolve against the manifest's URL; GitHub and Hugging Face page links become raw-file URLs.
// `local:<name>` is a file kept in this browser (the app's FileStore). `import` copies data into a table; `link` creates
// an external table that reads the source at query time (it must be reachable: same origin or CORS-enabled).
//
// Steps run through the engine's SQL (CREATE EXTERNAL TABLE, CREATE CONNECTION) and its io and external plugins, whose
// client helpers the app passes in (`StepIO`): this module has no dependency on smaltdb.
import { normalizeDataUrl } from './urls.js';

export type DataFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'parquet';

/** Reader options for imports and external tables (header, delimiter, quote, null, skip, encoding, …). */
export type ReaderOptions = Record<string, string | number | boolean | null | undefined>;

export interface ColumnDef {
  name: string;
  type?: string;
}

/** One step. The key that says what it does is `sql`, `sqlFile`, `import`, `link`, `data` or `connection`. */
export type ManifestStep =
  | { sql: string }
  | { sqlFile: string }
  | { import: string; table: string; format?: DataFormat; options?: ReaderOptions }
  | { link: string; table: string; format?: DataFormat; options?: ReaderOptions; connectionName?: string; columns?: ColumnDef[] }
  | { table: string; data: Record<string, unknown>[]; options?: ReaderOptions }
  | { connection: string; url: string };

/** The database part of a manifest. Apps add their own fields (saved queries, notebooks, a report's model). */
export interface DataManifest {
  /** The database to open. Default: in memory, named by the app. */
  database?: { name?: string; storage?: 'memory' | 'opfs' };
  /** OPFS only: rebuild on every load (`always`), only when the database is empty (`once`), or never (`none`). */
  init?: 'always' | 'once' | 'none';
  steps?: ManifestStep[];
}

/** What the steps need of a database: smaltdb's client `Database` has these. */
export interface StepDatabase {
  exec(sql: string): Promise<{ changes: number }>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** The engine plugins' client helpers (`@smaltdb/io/client`, `@smaltdb/external/client`), as the app loaded them. */
export interface StepIO<D = StepDatabase> {
  importCSV(db: D, table: string, source: Blob | string, options?: Record<string, unknown>): Promise<{ rows: number }>;
  importJSON(db: D, table: string, source: Blob | string, options?: Record<string, unknown>): Promise<{ rows: number }>;
  registerFile(db: D, name: string, file: Blob | null): Promise<void>;
}

/** Files kept in this browser, addressed in steps as `local:<name>`. */
export interface FileStore {
  get(name: string): Promise<Blob | null>;
}

export type StepLog = (level: 'ok' | 'warn', text: string) => void;

export interface ApplyOptions<D extends StepDatabase = StepDatabase> {
  /** What relative paths resolve against: the manifest's URL. */
  base: string;
  io: StepIO<D>;
  log?: StepLog;
  files?: FileStore;
  /** Default: the global fetch. */
  fetch?: typeof fetch;
}

/** Run steps against an open database, in order. Throws on the first step that fails, naming it. */
export async function applySteps<D extends StepDatabase>(db: D, steps: readonly ManifestStep[], options: ApplyOptions<D>): Promise<void> {
  const { io, log = () => {}, files } = options;
  const doFetch = options.fetch ?? fetch;
  const resolve = (p: string) => normalizeDataUrl(new URL(p, options.base).href).url;
  const blobOf = async (p: string): Promise<Blob> => {
    if (p.startsWith('local:')) {
      const b = await files?.get(p.slice(6));
      if (!b) throw new Error(`the local file ${p.slice(6)} is not available in this browser: import it again`);
      return b;
    }
    const url = resolve(p);
    const r = await doFetch(url);
    if (!r.ok) throw new Error(`cannot fetch ${url}: HTTP ${r.status}`);
    return r.blob();
  };
  let n = 0;
  for (const step of steps) {
    const label = `step ${++n}`;
    try {
      if ('sql' in step || 'sqlFile' in step) {
        const sql = 'sql' in step ? step.sql : await (await blobOf(step.sqlFile)).text();
        await db.exec(sql);
        log('ok', `${label}: ran ${'sqlFile' in step ? step.sqlFile : 'SQL'}`);
      } else if ('connection' in step) {
        await db.exec(`CREATE CONNECTION IF NOT EXISTS ${quoteIdent(step.connection)} WITH (url = ${quoteLiteral(resolve(step.url))})`);
        log('ok', `${label}: connection ${step.connection}`);
      } else if ('import' in step) {
        const table = requireTable(step);
        const blob = await blobOf(step.import);
        const format = step.format ?? formatFromName(step.import);
        const opts = { create: true, ...(step.options ?? {}) };
        const res =
          format === 'parquet'
            ? await importParquet(db, io, table, blob)
            : format === 'json' || format === 'ndjson'
              ? await io.importJSON(db, table, blob, opts)
              : await io.importCSV(db, table, blob, format === 'tsv' ? { delimiter: '\t', ...opts } : opts);
        log('ok', `${label}: imported ${res.rows} rows into ${table}`);
      } else if ('data' in step) {
        const table = requireTable(step);
        const res = await io.importJSON(db, table, JSON.stringify(step.data), { create: true, ...(step.options ?? {}) });
        log('ok', `${label}: loaded ${res.rows} rows into ${table}`);
      } else if ('link' in step) {
        const table = requireTable(step);
        let location = step.link;
        if (location.startsWith('local:')) {
          const name = location.slice(6);
          await io.registerFile(db, name, await blobOf(location));
          location = 'file:' + name;
        } else if (!/^[a-z][a-z0-9+.-]*:/i.test(location) || /^https?:/i.test(location)) location = resolve(location);
        await db.exec(externalTableSql({ table, location, format: step.format, options: step.options, connection: step.connectionName, columns: step.columns, ifNotExists: true }));
        log('ok', `${label}: linked ${table} → ${location}`);
      } else {
        log('warn', `${label}: unknown step ${JSON.stringify(step).slice(0, 80)}`);
      }
    } catch (e) {
      throw new Error(`${label}: ${(e as Error).message}`, { cause: e });
    }
  }
}

function requireTable(step: { table?: string }): string {
  if (!step.table) throw new Error('"table" is required');
  return step.table;
}

/** The format a file name implies (by extension); CSV when it says nothing. */
export function formatFromName(name: string): DataFormat {
  const m = /\.(csv|tsv|json|ndjson|jsonl|txt|parquet)(\?|#|$)/i.exec(name);
  const ext = (m?.[1] ?? 'csv').toLowerCase();
  return (ext === 'jsonl' ? 'ndjson' : ext === 'txt' ? 'csv' : ext) as DataFormat;
}

/**
 * Copy a Parquet file into a table, through a temporary external table (columns and types come from the file's
 * footer) and INSERT … SELECT. A missing table is created with the file's column types.
 */
export async function importParquet<D extends StepDatabase>(db: D, io: Pick<StepIO<D>, 'registerFile'>, table: string, blob: Blob): Promise<{ rows: number }> {
  const tmp = `__import_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await io.registerFile(db, tmp, blob);
  try {
    await db.exec(`CREATE EXTERNAL TABLE ${quoteIdent(tmp)} WITH (location = ${quoteLiteral('file:' + tmp)}, format = 'parquet')`);
    try {
      const cols = (await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ? ORDER BY ordinal_position', [tmp])) as { column_name: string; data_type: string | null }[];
      await db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (${cols.map((c) => `${quoteIdent(c.column_name)} ${c.data_type || 'ANY'}`).join(', ')})`);
      const names = cols.map((c) => quoteIdent(c.column_name)).join(', ');
      const r = await db.exec(`INSERT INTO ${quoteIdent(table)} (${names}) SELECT ${names} FROM ${quoteIdent(tmp)}`);
      return { rows: r.changes };
    } finally {
      await db.exec(`DROP EXTERNAL TABLE IF EXISTS ${quoteIdent(tmp)}`);
    }
  } finally {
    await io.registerFile(db, tmp, null).catch(() => {});
  }
}

export interface ExternalTableSpec {
  table: string;
  location: string;
  format?: DataFormat | string;
  options?: ReaderOptions;
  connection?: string;
  columns?: ColumnDef[];
  ifNotExists?: boolean;
}

/** CREATE EXTERNAL TABLE text for a location (URL, `file:<name>`, or a path under a connection). */
export function externalTableSql({ table, location, format, options = {}, connection, columns, ifNotExists = false }: ExternalTableSpec): string {
  const withs = [`location = ${quoteLiteral(location)}`];
  if (connection) withs.push(`connection = ${quoteLiteral(connection)}`);
  if (format) withs.push(`format = ${quoteLiteral(format)}`);
  for (const [k, v] of Object.entries(options ?? {})) {
    if (v === undefined || v === '' || v === null) continue;
    withs.push(`${k} = ${typeof v === 'boolean' ? String(v) : typeof v === 'number' ? v : quoteLiteral(String(v))}`);
  }
  const cols = columns?.length ? ` (${columns.map((c) => `${quoteIdent(c.name)} ${c.type || 'ANY'}`).join(', ')})` : '';
  return `CREATE EXTERNAL TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${quoteIdent(table)}${cols} WITH (${withs.join(', ')})`;
}

/** Relative paths of the files the steps read (to copy them when publishing a static site). */
export function referencedFiles(steps: readonly ManifestStep[]): string[] {
  const out = new Set<string>();
  for (const s of steps) {
    const p = 'sqlFile' in s ? s.sqlFile : 'import' in s ? s.import : 'link' in s ? s.link : null;
    if (p && !/^[a-z][a-z0-9+.-]*:/i.test(p)) out.add(p);
  }
  return [...out];
}

/** Names of the `local:` files the steps read (files kept in this browser). */
export function localFiles(steps: readonly ManifestStep[]): string[] {
  const out = new Set<string>();
  for (const s of steps) {
    const p = 'import' in s ? s.import : 'link' in s ? s.link : null;
    if (p?.startsWith('local:')) out.add(p.slice(6));
  }
  return [...out];
}

/** A SQL identifier, quoted (SQLite rules, as smaltql reads them). */
export function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** A SQL literal: NULL, numbers, booleans as 1 / 0, blobs as X'…', strings quoted. */
export function quoteLiteral(v: string | number | bigint | boolean | Uint8Array | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return "X'" + Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('') + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}
