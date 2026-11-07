// SQL text utilities: tokenizer, highlighter, statement splitter, parameter scanner, identifier and literal quoting,
// completion helpers and a light formatter. Text only: nothing here runs SQL. The highlighter's classes (sk-tk-*) are
// styled by ui.css.

export const KEYWORDS = new Set(
  `ABORT ACTION ADD AFTER ALL ALTER ALWAYS ANALYZE AND ANY AS ASC ATTACH AUTOINCREMENT BEFORE BEGIN BETWEEN BY CASCADE CASE CAST
  CHECK COLLATE COLUMN COMMIT CONCURRENTLY CONFLICT CONNECTION CONSTRAINT CREATE CROSS CURRENT CURRENT_DATE CURRENT_TIME
  CURRENT_TIMESTAMP DATA DATABASE DEFAULT DEFERRABLE DEFERRED DELETE DESC DETACH DISTINCT DO DROP EACH ELSE END ESCAPE EXCEPT
  EXCLUDE EXCLUSIVE EXISTS EXPLAIN EXTERNAL FAIL FILTER FIRST FOLLOWING FOR FOREIGN FROM FULL GENERATED GLOB GROUP GROUPS HAVING
  IF IGNORE IMMEDIATE IN INCLUDE INDEX INDEXED INITIALLY INNER INSERT INSTEAD INTERSECT INTO IS ISNULL JOIN KEY LAST LEFT LIKE
  LIMIT LOOSE MATCH MATERIALIZED NATURAL NO NOT NOTHING NOTNULL NULL NULLS OF OFFSET ON OR ORDER OTHERS OUTER OVER PARTITION
  PLAN PRAGMA PRECEDING PRIMARY QUERY RAISE RANGE RECURSIVE REFERENCES REFRESH REGEXP REINDEX RELEASE RENAME REPLACE RESTRICT
  RETURNING RIGHT ROLLBACK ROW ROWS SAVEPOINT SELECT SET STORED STRICT TABLE TEMP TEMPORARY THEN TIES TO TRANSACTION TRIGGER
  UNBOUNDED UNION UNIQUE UPDATE USING VACUUM VALUES VIEW VIRTUAL WHEN WHERE WINDOW WITH WITHOUT TRUE FALSE CHANGED`.split(/\s+/),
);

export const TYPES = new Set('INTEGER INT REAL TEXT BLOB ANY NUMERIC BOOLEAN DATE DATETIME TIMESTAMP FLOAT DOUBLE VARCHAR CHAR BIGINT'.split(' '));

export const FUNCTIONS = new Set(
  `abs avg changes char coalesce count date datetime format glob group_concat hex ifnull iif instr julianday last_insert_rowid
  length like lower ltrim max min nullif printf quote random randomblob read_csv read_json replace round rtrim sign sqlite_version
  strftime string_agg substr substring sum time total trim typeof unicode unixepoch upper zeroblob row_number rank dense_rank
  percent_rank cume_dist ntile lag lead first_value last_value nth_value`.split(/\s+/),
);

/**
 * Tokenize SQL. Every character belongs to exactly one token, so tokens concatenate back to the input.
 * Types: ws, comment, string, ident (quoted identifier), word, number, param, op, punct.
 */
export type TokenType = 'ws' | 'comment' | 'string' | 'ident' | 'word' | 'number' | 'param' | 'op' | 'punct';

export interface Token {
  type: TokenType;
  start: number;
  end: number;
  text: string;
}

/** A statement in a script: its text and its offsets in the script. */
export interface Statement {
  sql: string;
  start: number;
  end: number;
}

/** A bind parameter slot, numbered as the engine numbers them. */
export interface ParamSlot {
  label: string;
  index: number;
}

/** A SQL value as smaltdb returns or accepts it. */
export type SqlValue = string | number | bigint | Uint8Array | null;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  const push = (type: TokenType, start: number, end: number) => out.push({ type, start, end, text: text.slice(start, end) });
  while (i < n) {
    const c = text[i];
    const start = i;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      while (i < n && /\s/.test(text[i])) i++;
      push('ws', start, i);
    } else if (c === '-' && text[i + 1] === '-') {
      while (i < n && text[i] !== '\n') i++;
      push('comment', start, i);
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      push('comment', start, i);
    } else if (c === "'" || ((c === 'x' || c === 'X') && text[i + 1] === "'")) {
      i += c === "'" ? 1 : 2;
      for (;;) {
        if (i >= n) break;
        if (text[i] === "'") {
          if (text[i + 1] === "'") i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      push('string', start, i);
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      i++;
      for (;;) {
        if (i >= n) break;
        if (text[i] === close) {
          if (close !== ']' && text[i + 1] === close) i += 2;
          else {
            i++;
            break;
          }
        } else i++;
      }
      push('ident', start, i);
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      if (c === '0' && (text[i + 1] === 'x' || text[i + 1] === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F_]/.test(text[i])) i++;
      } else {
        while (i < n && /[0-9_]/.test(text[i])) i++;
        if (text[i] === '.') {
          i++;
          while (i < n && /[0-9_]/.test(text[i])) i++;
        }
        if ((text[i] === 'e' || text[i] === 'E') && /[0-9+-]/.test(text[i + 1] ?? '')) {
          i += 2;
          while (i < n && /[0-9]/.test(text[i])) i++;
        }
      }
      push('number', start, i);
    } else if (c === '?') {
      i++;
      while (i < n && /[0-9]/.test(text[i])) i++;
      push('param', start, i);
    } else if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/.test(text[i + 1] ?? '')) {
      i++;
      while (i < n && /[A-Za-z0-9_]/.test(text[i])) i++;
      push('param', start, i);
    } else if (/[A-Za-z_\u0080-￿]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$\u0080-￿]/.test(text[i])) i++;
      push('word', start, i);
    } else if (c === ';' || c === ',' || c === '(' || c === ')' || c === '.') {
      i++;
      push('punct', start, i);
    } else {
      const two = text.slice(i, i + 2);
      i += ['<=', '>=', '<>', '!=', '==', '||', '<<', '>>', '->', '=>'].includes(two) ? 2 : 1;
      if (text.slice(start, i) === '->' && text[i] === '>') i++;
      push('op', start, i);
    }
  }
  return out;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML for the editor's highlight layer. `names` is an optional Set of lower-cased object names. */
export function highlight(text: string, names?: Set<string>): string {
  let html = '';
  const toks = tokenize(text);
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    let cls = null;
    switch (t.type) {
      case 'comment':
        cls = 'c';
        break;
      case 'string':
        cls = 's';
        break;
      case 'number':
        cls = 'n';
        break;
      case 'param':
        cls = 'p';
        break;
      case 'ident':
        cls = 'i';
        break;
      case 'op':
        cls = 'o';
        break;
      case 'word': {
        const u = t.text.toUpperCase();
        let next = toks[k + 1];
        if (next && next.type === 'ws') next = toks[k + 2];
        if (next && next.text === '(' && FUNCTIONS.has(t.text.toLowerCase())) cls = 'f';
        else if (KEYWORDS.has(u)) cls = 'k';
        else if (TYPES.has(u)) cls = 't';
        else if (names && names.has(t.text.toLowerCase())) cls = 'obj';
        break;
      }
    }
    html += cls ? `<span class="sk-tk-${cls}">${esc(t.text)}</span>` : esc(t.text);
  }
  // A trailing newline needs content after it to take up a line in the <pre>.
  return html + '\n';
}

/** Split a script into statements: [{ sql, start, end }] (offsets into `text`, trimmed of whitespace/semicolon). */
export function splitStatements(text: string): Statement[] {
  const toks = tokenize(text);
  const out: Statement[] = [];
  let start = -1;
  let end = -1;
  let depthBeginEnd = 0;
  let prevWord = '';
  const flush = () => {
    if (start >= 0) out.push({ sql: text.slice(start, end), start, end });
    start = -1;
    end = -1;
    depthBeginEnd = 0;
  };
  for (const t of toks) {
    if (t.type === 'ws' || t.type === 'comment') continue;
    if (t.type === 'punct' && t.text === ';' && depthBeginEnd === 0) {
      flush();
      continue;
    }
    if (t.type === 'word') {
      const u = t.text.toUpperCase();
      // CREATE TRIGGER … BEGIN … END bodies contain semicolons.
      if (u === 'BEGIN' && start >= 0 && /TRIGGER/i.test(text.slice(start, t.start))) depthBeginEnd++;
      else if (u === 'END' && depthBeginEnd > 0 && prevWord !== 'CASE') depthBeginEnd--;
      prevWord = u;
    }
    if (start < 0) start = t.start;
    end = t.end;
  }
  flush();
  return out;
}

/** The statement containing (or just before) offset `pos`. */
export function statementAt(text: string, pos: number): Statement | null {
  const stmts = splitStatements(text);
  if (stmts.length === 0) return null;
  for (const s of stmts) if (pos >= s.start && pos <= s.end) return s;
  // Between statements: pick the nearest one before the cursor (the one just typed), else the next.
  let best: Statement | null = null;
  for (const s of stmts) if (s.end <= pos) best = s;
  return best ?? stmts[0];
}

/** First significant keyword of a statement, upper-cased. */
export function leadingKeyword(sql: string): string {
  for (const t of tokenize(sql)) {
    if (t.type === 'ws' || t.type === 'comment' || (t.type === 'punct' && t.text === '(')) continue;
    return t.type === 'word' ? t.text.toUpperCase() : '';
  }
  return '';
}

/** Whether a statement produces rows (and should be streamed into a grid rather than run with exec). */
export function returnsRows(sql: string): boolean {
  const kw = leadingKeyword(sql);
  if (['SELECT', 'WITH', 'VALUES', 'EXPLAIN', 'PRAGMA', 'TABLE'].includes(kw)) {
    if (kw === 'WITH') {
      // WITH … INSERT/UPDATE/DELETE without RETURNING is a write.
      const words = tokenize(sql).filter((t) => t.type === 'word').map((t) => t.text.toUpperCase());
      const dml = words.some((w) => w === 'INSERT' || w === 'UPDATE' || w === 'DELETE');
      return !dml || words.includes('RETURNING');
    }
    if (kw === 'PRAGMA') return !/=/.test(sql);
    return true;
  }
  return tokenize(sql).some((t) => t.type === 'word' && t.text.toUpperCase() === 'RETURNING');
}

/** Whether a statement changes the schema (the object explorer should refresh). */
export function changesSchema(sql: string): boolean {
  return ['CREATE', 'DROP', 'ALTER', 'REFRESH'].includes(leadingKeyword(sql));
}

/**
 * Parameter slots in the order the engine numbers them: `?` takes the next number, `?N` is explicit,
 * and a name (`:a`, `@a`, `$a`) takes the next number on first use.
 */
export function scanParams(sql: string): ParamSlot[] {
  const slots: ParamSlot[] = [];
  const named = new Map<string, number>();
  let n = 0;
  for (const t of tokenize(sql)) {
    if (t.type !== 'param') continue;
    if (t.text === '?') {
      n++;
      slots[n - 1] = { label: `?${n}`, index: n };
    } else if (t.text[0] === '?') {
      const k = Number(t.text.slice(1));
      if (k > n) n = k;
      slots[k - 1] = { label: t.text, index: k };
    } else if (!named.has(t.text)) {
      n++;
      named.set(t.text, n);
      slots[n - 1] = { label: t.text, index: n };
    }
  }
  for (let i = 0; i < n; i++) if (!slots[i]) slots[i] = { label: `?${i + 1}`, index: i + 1 };
  return slots;
}

/** Quote an identifier when needed. */
export function quoteIdent(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !KEYWORDS.has(name.toUpperCase())) return name;
  return '"' + String(name).replace(/"/g, '""') + '"';
}

export function quoteLiteral(v: SqlValue | boolean | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Uint8Array) return "x'" + [...v].map((b) => b.toString(16).padStart(2, '0')).join('') + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/** A safe table name derived from a file name or URL. */
export function tableNameFrom(source: string): string {
  let base = String(source).split(/[\\/?#]/).filter(Boolean).pop() ?? 'data';
  base = base.replace(/\.(csv|tsv|txt|json|ndjson|jsonl|parquet)(\.gz)?$/i, '');
  base = base.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  if (!base) base = 'data';
  if (/^[0-9]/.test(base)) base = 't_' + base;
  return base;
}

/** Identifier-ish word immediately before offset `pos` (for completion). */
export function wordBefore(text: string, pos: number): { word: string; start: number; qualifier: string | null } {
  let i = pos;
  while (i > 0 && /[A-Za-z0-9_$]/.test(text[i - 1])) i--;
  const word = text.slice(i, pos);
  let qualifier = null;
  if (text[i - 1] === '.') {
    let j = i - 1;
    while (j > 0 && /[A-Za-z0-9_$"]/.test(text[j - 1])) j--;
    qualifier = text.slice(j, i - 1).replace(/"/g, '');
  }
  return { word, start: i, qualifier };
}

/** Table aliases in a statement: Map alias(lower) → table name. */
export function aliasesIn(sql: string, tableNames: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  const toks = tokenize(sql).filter((t) => t.type !== 'ws' && t.type !== 'comment');
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if ((t.type !== 'word' && t.type !== 'ident') || !tableNames.has(unquote(t.text).toLowerCase())) continue;
    const prev = toks[k - 1]?.text.toUpperCase();
    if (!['FROM', 'JOIN', 'UPDATE', 'INTO', ','].includes(prev)) continue;
    let a = toks[k + 1];
    if (a && a.type === 'word' && a.text.toUpperCase() === 'AS') a = toks[k + 2];
    if (a && (a.type === 'word' || a.type === 'ident') && !KEYWORDS.has(a.text.toUpperCase())) map.set(unquote(a.text).toLowerCase(), unquote(t.text));
    map.set(unquote(t.text).toLowerCase(), unquote(t.text));
  }
  return map;
}

export function unquote(s: string): string {
  if (s.length >= 2 && (s[0] === '"' || s[0] === '`')) return s.slice(1, -1).replace(new RegExp(s[0] + s[0], 'g'), s[0]);
  if (s.length >= 2 && s[0] === '[') return s.slice(1, -1);
  return s;
}

/** A light SQL formatter: one clause per line, upper-case keywords. Comments and literals are kept as written. */
export function formatSql(sql: string): string {
  const breakBefore = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'VALUES', 'SET', 'RETURNING', 'WINDOW']);
  const joins = new Set(['JOIN', 'LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'NATURAL']);
  const toks = tokenize(sql);
  let out = '';
  let depth = 0;
  let prevSig = null;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'ws') {
      if (!out.endsWith('\n') && !out.endsWith(' ') && out.length) out += ' ';
      continue;
    }
    let txt = t.text;
    if (t.type === 'word' && KEYWORDS.has(txt.toUpperCase())) txt = txt.toUpperCase();
    const u = txt.toUpperCase();
    const pad = '  '.repeat(depth);
    if (t.type === 'word' && (breakBefore.has(u) || (joins.has(u) && !joins.has(prevSig?.text.toUpperCase() ?? '') && prevSig?.text.toUpperCase() !== 'OUTER')) && prevSig && prevSig.text !== '(') {
      out = out.replace(/ $/, '') + '\n' + pad;
    } else if (t.type === 'word' && (u === 'AND' || u === 'OR') && depth === 0) {
      out = out.replace(/ $/, '') + '\n' + pad + '  ';
    }
    if (t.text === '(') depth++;
    if (t.text === ')') depth = Math.max(0, depth - 1);
    if ((t.text === ',' || t.text === ')' || t.text === ';' || t.text === '.') && out.endsWith(' ')) out = out.slice(0, -1);
    if (prevSig?.text === '.' || prevSig?.text === '(') out = out.replace(/ $/, '');
    out += txt;
    if (t.text === ';') out += '\n\n';
    else if (t.text === ',' && depth === 0) out += '\n' + pad + '  ';
    prevSig = t;
  }
  return out.replace(/[ \t]+\n/g, '\n').trim() + '\n';
}
