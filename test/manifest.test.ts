import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySteps, externalTableSql, formatFromName, localFiles, quoteIdent, quoteLiteral, referencedFiles, type ManifestStep, type StepIO } from 'smaltkit/manifest';

/** A database that records the SQL it is sent; information_schema reports two Parquet columns. */
function fakeDb() {
  const sql: string[] = [];
  return {
    sql,
    async exec(s: string) {
      sql.push(s);
      return { changes: s.startsWith('INSERT') ? 7 : 0 };
    },
    async query(s: string, params?: unknown[]) {
      sql.push(`${s} ${JSON.stringify(params ?? [])}`);
      return [
        { column_name: 'id', data_type: 'INTEGER' },
        { column_name: 'name', data_type: null },
      ];
    },
  };
}

function fakeIo() {
  const calls: string[] = [];
  const io: StepIO<ReturnType<typeof fakeDb>> = {
    async importCSV(_db, table, source, options) {
      calls.push(`csv ${table} ${typeof source === 'string' ? source : await source.text()} ${JSON.stringify(options)}`);
      return { rows: 2 };
    },
    async importJSON(_db, table, source, options) {
      calls.push(`json ${table} ${typeof source === 'string' ? source : await source.text()} ${JSON.stringify(options)}`);
      return { rows: 1 };
    },
    async registerFile(_db, name, file) {
      calls.push(`file ${name} ${file ? 'set' : 'cleared'}`);
    },
  };
  return { io, calls };
}

const served: Record<string, string> = {
  'https://example.com/m/data/a.csv': 'id,name\n1,x\n',
  'https://example.com/m/data/b.tsv': 'id\tname\n',
  'https://example.com/m/views.sql': 'CREATE VIEW v AS SELECT 1',
  'https://raw.githubusercontent.com/o/r/main/c.json': '[{"id":1}]',
};
const fakeFetch = (async (url: string) => (url in served ? new Response(served[url]) : new Response('', { status: 404 }))) as typeof fetch;

test('steps run in order: SQL, files, imports, inline rows, links and connections', async () => {
  const db = fakeDb();
  const { io, calls } = fakeIo();
  const log: string[] = [];
  const steps: ManifestStep[] = [
    { sql: 'CREATE TABLE t (id INTEGER)' },
    { sqlFile: 'views.sql' },
    { import: 'data/a.csv', table: 'a', options: { header: true } },
    { import: 'data/b.tsv', table: 'b' },
    { import: 'https://github.com/o/r/blob/main/c.json', table: 'c' },
    { table: 'd', data: [{ id: 1 }] },
    { link: 'data/rates.csv', table: 'rates', format: 'csv', columns: [{ name: 'rate', type: 'REAL' }] },
    { link: 's3://bucket/x.parquet', table: 'x', connectionName: 'lake' },
    { connection: 'api', url: 'api/' },
  ];
  await applySteps(db, steps, { base: 'https://example.com/m/env.json', io, fetch: fakeFetch, log: (l, t) => log.push(`${l} ${t}`) });
  assert.deepEqual(db.sql, [
    'CREATE TABLE t (id INTEGER)',
    'CREATE VIEW v AS SELECT 1',
    `CREATE EXTERNAL TABLE IF NOT EXISTS "rates" ("rate" REAL) WITH (location = 'https://example.com/m/data/rates.csv', format = 'csv')`,
    `CREATE EXTERNAL TABLE IF NOT EXISTS "x" WITH (location = 's3://bucket/x.parquet', connection = 'lake')`,
    `CREATE CONNECTION IF NOT EXISTS "api" WITH (url = 'https://example.com/m/api/')`,
  ]);
  assert.deepEqual(calls, [
    'csv a id,name\n1,x\n {"create":true,"header":true}',
    'csv b id\tname\n {"delimiter":"\\t","create":true}',
    'json c [{"id":1}] {"create":true}',
    'json d [{"id":1}] {"create":true}',
  ]);
  assert.equal(log.length, steps.length);
  assert.match(log[2]!, /^ok step 3: imported 2 rows into a$/);
});

test('Parquet goes through a temporary external table; local files come from the FileStore', async () => {
  const db = fakeDb();
  const { io, calls } = fakeIo();
  const files = { get: async (name: string) => (name === 'sales.parquet' ? new Blob(['PAR1']) : null) };
  await applySteps(db, [{ import: 'local:sales.parquet', table: 'sales' }, { link: 'local:sales.parquet', table: 'linked', format: 'parquet' }], { base: 'https://example.com/', io, files });
  const tmp = /"(__import_\w+)"/.exec(db.sql[0]!)![1];
  assert.match(db.sql[0]!, /^CREATE EXTERNAL TABLE "__import_\w+" WITH \(location = 'file:__import_\w+', format = 'parquet'\)$/);
  assert.equal(db.sql[2], 'CREATE TABLE IF NOT EXISTS "sales" ("id" INTEGER, "name" ANY)');
  assert.equal(db.sql[3], `INSERT INTO "sales" ("id", "name") SELECT "id", "name" FROM "${tmp}"`);
  assert.equal(db.sql[4], `DROP EXTERNAL TABLE IF EXISTS "${tmp}"`);
  assert.equal(db.sql[5], `CREATE EXTERNAL TABLE IF NOT EXISTS "linked" WITH (location = 'file:sales.parquet', format = 'parquet')`);
  assert.deepEqual(calls, [`file ${tmp} set`, `file ${tmp} cleared`, 'file sales.parquet set']);
});

test('a failing step is named; a missing local file says what to do', async () => {
  const { io } = fakeIo();
  await assert.rejects(applySteps(fakeDb(), [{ sql: 'SELECT 1' }, { import: 'nope.csv', table: 't' }], { base: 'https://example.com/m/', io, fetch: fakeFetch }), /^Error: step 2: cannot fetch https:\/\/example\.com\/m\/nope\.csv: HTTP 404$/);
  await assert.rejects(applySteps(fakeDb(), [{ import: 'local:gone.csv', table: 't' }], { base: 'https://example.com/', io, files: { get: async () => null } }), /step 1: the local file gone\.csv is not available in this browser/);
});

test('helpers', () => {
  assert.equal(formatFromName('x/y.PARQUET?v=1'), 'parquet');
  assert.equal(formatFromName('a.jsonl'), 'ndjson');
  assert.equal(formatFromName('a.txt'), 'csv');
  assert.equal(formatFromName('noext'), 'csv');
  assert.equal(quoteIdent('a"b'), '"a""b"');
  assert.equal(quoteLiteral("it's"), "'it''s'");
  assert.equal(quoteLiteral(true), '1');
  assert.equal(quoteLiteral(Number.NaN), 'NULL');
  assert.equal(quoteLiteral(new Uint8Array([1, 255])), "X'01ff'");
  assert.equal(externalTableSql({ table: 't', location: 'u', options: { header: true, skip: 1, null: '', delimiter: ';' } }), `CREATE EXTERNAL TABLE "t" WITH (location = 'u', header = true, skip = 1, delimiter = ';')`);
  const steps: ManifestStep[] = [{ sqlFile: 'a.sql' }, { import: 'data/b.csv', table: 'b' }, { link: 'https://x/c.csv', table: 'c' }, { import: 'local:d.csv', table: 'd' }, { link: 'local:e.parquet', table: 'e' }];
  assert.deepEqual(referencedFiles(steps), ['a.sql', 'data/b.csv']);
  assert.deepEqual(localFiles(steps), ['d.csv', 'e.parquet']);
});
