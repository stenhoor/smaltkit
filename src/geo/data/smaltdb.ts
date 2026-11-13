/**
 * smaltdb (SQL) as a data source: `querySmaltdb` runs a query in columnar mode, so numeric columns arrive as
 * Float64Arrays that go straight to the GPU; `loadSmaltdb` writes columns into a table; `importCsv` loads a CSV file.
 * Only the database's public methods are used (it is passed in), so this module doesn't import smaltdb.
 */
import type { QueriedColumns } from './columns.js';
import { findCoordinates } from './geojson.js';

/** What `querySmaltdb` needs from a smaltdb `Database` (smaltdb 0.8.3 and later). */
export interface SmaltdbLike {
  query(sql: string, params?: unknown, options?: { rowMode?: 'columnar' }): Promise<unknown>;
}

/**
 * Runs a SQL query on smaltdb and returns its columns: numeric columns without NULLs come back from the engine's
 * worker as Float64Arrays, handed over without copying.
 */
export async function querySmaltdb(db: SmaltdbLike, sql: string, params?: unknown): Promise<QueriedColumns> {
  const t0 = performance.now();
  const res = (await db.query(sql, params, { rowMode: 'columnar' })) as { columns: string[]; rowCount?: number; data: Record<string, Float64Array | unknown[]> };
  const ms = performance.now() - t0;
  const first = res.columns[0];
  const count = res.rowCount ?? (first ? res.data[first].length : 0);
  return { count, columns: res.data, ms };
}

/** What `loadSmaltdb` needs from a smaltdb `Database`. */
export interface SmaltdbWritable {
  exec(sql: string): Promise<unknown>;
  importCSV(table: string, source: string | Blob, options?: { create?: boolean; header?: boolean }): Promise<{ rows: number }>;
}

/**
 * Writes columns of numbers into a new smaltdb table (replacing one of that name), through smaltdb's CSV import:
 * one transaction, types inferred. Large tables are written in chunks of `chunkRows`.
 */
export async function loadSmaltdb(db: SmaltdbWritable, table: string, columns: Record<string, ArrayLike<number>>, chunkRows = 250_000): Promise<{ rows: number; ms: number }> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`Not a plain table name: ${table}`);
  const names = Object.keys(columns);
  for (const n of names) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(`Not a plain column name: ${n}`);
  const n = Math.min(...names.map((k) => columns[k].length));
  const t0 = performance.now();
  await db.exec(`DROP TABLE IF EXISTS ${table}`);
  // Integer-valued columns stay INTEGER; the rest REAL, with enough digits for coordinates.
  const ints = names.map((k) => {
    const c = columns[k];
    for (let i = 0; i < Math.min(c.length, 1000); i++) if (!Number.isInteger(c[i])) return false;
    return true;
  });
  await db.exec(`CREATE TABLE ${table} (${names.map((k, j) => `${k} ${ints[j] ? 'INTEGER' : 'REAL'}`).join(', ')})`);
  let rows = 0;
  for (let start = 0; start < n; start += chunkRows) {
    const end = Math.min(n, start + chunkRows);
    const lines: string[] = [names.join(',')];
    for (let i = start; i < end; i++) {
      let line = '';
      for (let j = 0; j < names.length; j++) {
        const v = columns[names[j]][i];
        if (j) line += ',';
        line += ints[j] ? String(v) : Number.isFinite(v) ? String(Math.round(v * 1e7) / 1e7) : '';
      }
      lines.push(line);
    }
    rows += (await db.importCSV(table, lines.join('\n'), { header: true })).rows;
  }
  return { rows, ms: performance.now() - t0 };
}

/**
 * Loads a CSV file (text, bytes or a File) into a new smaltdb table, with column types inferred by smaltdb, and reads
 * it back as columns. The longitude and latitude columns are found by their usual names.
 */
export async function importCsv(
  db: SmaltdbWritable & SmaltdbLike,
  table: string,
  source: string | Blob,
): Promise<QueriedColumns & { readonly lng?: string; readonly lat?: string; readonly names: readonly string[] }> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`Not a plain table name: ${table}`);
  await db.exec(`DROP TABLE IF EXISTS ${table}`);
  await db.importCSV(table, source, { create: true, header: true });
  const r = await querySmaltdb(db, `SELECT * FROM ${table}`);
  const names = Object.keys(r.columns);
  return { ...r, ...findCoordinates(names), names };
}
