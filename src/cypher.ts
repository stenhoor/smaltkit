// Cypher text utilities (the dialect smaltcy speaks): a tokenizer and highlighter, statement splitting and completion.
// Text only: nothing here runs Cypher. The highlighter's classes (sk-tk-*) are styled in ui.css, as SQL's are.

import { esc } from './svg.js';

/** The clause and expression keywords smaltcy's parser reads, upper-cased. */
export const CYPHER_KEYWORDS: readonly string[] = `ALL ALLSHORTESTPATHS AND ANY AS ASC ASCENDING AT BY CASE CONTAINS CREATE DELETE
  DESC DESCENDING DETACH DISTINCT DROP ELSE END ENDS EXISTS EXPLAIN FALSE FOR IF IN INDEX IS LIMIT MATCH MERGE NONE NOT
  NULL ON OPTIONAL OR ORDER REMOVE RETURN SET SHORTESTPATH SINGLE SKIP STARTS THEN TIME TRUE UNION UNWIND VERSION WHEN
  WHERE WITH XOR`.split(/\s+/);

/** The functions smaltcy's library documents, as Cypher spells them. */
export const CYPHER_FUNCTIONS: readonly string[] = `abs acos asin atan atan2 avg ceil coalesce collect commit commits cos count
  degree e elementId endNode exists exp floor head history id isEmpty keys labels last left length log log10 ltrim max
  min nodes pi properties rand range relationships replace reverse right round rtrim sign sin size split sqrt stDev
  stDevP startNode substring sum tail tan timestamp toBoolean toFloat toInteger toLower toString toUpper trim type
  valueType version`.split(/\s+/);

const KEYWORD_SET = new Set(CYPHER_KEYWORDS);
const FUNCTION_SET = new Set(CYPHER_FUNCTIONS.map((f) => f.toLowerCase()));

export type CypherTokenType = 'ws' | 'comment' | 'string' | 'ident' | 'number' | 'param' | 'word' | 'punct';

export interface CypherToken {
  type: CypherTokenType;
  text: string;
  start: number;
  end: number;
}

/**
 * The text's tokens, in order and covering it all. Unterminated strings and comments run to the end.
 * @param text Cypher, whole or partial: tokenizing never fails.
 * @returns The tokens, each with its type, its text and its offsets in `text`.
 */
export function tokenizeCypher(text: string): CypherToken[] {
  const out: CypherToken[] = [];
  const n = text.length;
  let i = 0;
  const push = (type: CypherTokenType, start: number) => out.push({ type, text: text.slice(start, i), start, end: i });
  while (i < n) {
    const c = text[i]!;
    const start = i;
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(text[i]!)) i++;
      push('ws', start);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      push('comment', start);
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      push('comment', start);
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i = Math.min(n, i + 1);
      push('string', start);
    } else if (c === '`') {
      i++;
      while (i < n && text[i] !== '`') i++;
      i = Math.min(n, i + 1);
      push('ident', start);
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? '') && !/[\w)\].]/.test(text[i - 1] ?? ''))) {
      while (i < n && /[0-9a-fA-FxXoO_]/.test(text[i]!)) i++;
      // A fraction, but not a range's `..` (`*1..3`).
      if (text[i] === '.' && text[i + 1] !== '.' && /[0-9]/.test(text[i + 1] ?? '')) {
        i++;
        while (i < n && /[0-9_]/.test(text[i]!)) i++;
      }
      if (/[eE]/.test(text[i] ?? '') && /[0-9+-]/.test(text[i + 1] ?? '')) {
        i += 2;
        while (i < n && /[0-9]/.test(text[i]!)) i++;
      }
      push('number', start);
    } else if (c === '$' && /[A-Za-z0-9_]/.test(text[i + 1] ?? '')) {
      i++;
      while (i < n && /[A-Za-z0-9_]/.test(text[i]!)) i++;
      push('param', start);
    } else if (/[A-Za-z_]/.test(c)) {
      while (i < n && /[A-Za-z0-9_]/.test(text[i]!)) i++;
      push('word', start);
    } else {
      i++;
      push('punct', start);
    }
  }
  return out;
}

/**
 * Whether the token at `k` is a label or relationship type: a name right after a `:` inside `(…)` or `[…]`, or after a
 * `|` that follows a type (`[:KNOWS|LIKES]`, not a list comprehension's `[x IN xs | x.name]`).
 */
function isLabelAt(toks: readonly CypherToken[], k: number, depth: readonly string[], labels: ReadonlySet<number>): boolean {
  const before = (i: number) => {
    let j = i - 1;
    while (j >= 0 && toks[j]!.type === 'ws') j--;
    return j;
  };
  const j = before(k);
  const prev = toks[j]?.text;
  if (prev !== ':' && !(prev === '|' && depth[depth.length - 1] === '[' && labels.has(before(j)))) return false;
  // `:` inside a map literal (`{name: …}`) is a key-value separator, not a label.
  return depth.length > 0 && depth[depth.length - 1] !== '{';
}

/**
 * HTML for the editor's highlight layer, ending with a newline: keywords, functions, labels and relationship types,
 * property keys, parameters, strings, numbers and comments.
 * @param text Cypher.
 * @returns The HTML, with the text escaped.
 */
export function highlightCypher(text: string): string {
  const toks = tokenizeCypher(text);
  const depth: string[] = [];
  const labels = new Set<number>();
  let html = '';
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    let cls = '';
    if (t.type === 'comment') cls = 'c';
    else if (t.type === 'string') cls = 's';
    else if (t.type === 'number') cls = 'n';
    else if (t.type === 'param') cls = 'p';
    else if (t.type === 'word' || t.type === 'ident') {
      let j = k + 1;
      while (j < toks.length && toks[j]!.type === 'ws') j++;
      const next = toks[j]?.text;
      let p = k - 1;
      while (p >= 0 && toks[p]!.type === 'ws') p--;
      if (isLabelAt(toks, k, depth, labels)) {
        cls = 'obj';
        labels.add(k);
      }
      else if (toks[p]?.text === '.') cls = 'i';
      else if (t.type === 'word' && next === '(' && FUNCTION_SET.has(t.text.toLowerCase())) cls = 'f';
      else if (t.type === 'word' && KEYWORD_SET.has(t.text.toUpperCase())) cls = 'k';
      else if (t.type === 'word' && next === '(') cls = 'f';
    } else if (t.type === 'punct') {
      if ('([{'.includes(t.text)) depth.push(t.text);
      else if (')]}'.includes(t.text)) depth.pop();
      else if (/[-<>=+*/%^|!]/.test(t.text)) cls = 'o';
    }
    html += cls ? `<span class="sk-tk-${cls}">${esc(t.text)}</span>` : esc(t.text);
  }
  return html + '\n';
}

/** A statement and where it is in the text. (`sql` holds its text, as `Statement` does for SQL.) */
export interface CypherStatement {
  sql: string;
  start: number;
  end: number;
}

/**
 * The statements in the text, split at semicolons outside strings, names and comments.
 * @param text A script.
 * @returns The statements, each with its text (in `sql`, trimmed) and its offsets in `text`.
 */
export function splitCypher(text: string): CypherStatement[] {
  const out: CypherStatement[] = [];
  let start = -1;
  let end = -1;
  for (const t of tokenizeCypher(text)) {
    if (t.type === 'ws' || t.type === 'comment') continue;
    if (t.type === 'punct' && t.text === ';') {
      if (start >= 0) out.push({ sql: text.slice(start, end), start, end });
      start = -1;
      continue;
    }
    if (start < 0) start = t.start;
    end = t.end;
  }
  if (start >= 0) out.push({ sql: text.slice(start, end), start, end });
  return out;
}

/**
 * The statement containing (or just before) offset `pos`: the one to run when the cursor is there.
 * @param text A script.
 * @param pos An offset in `text`, such as the cursor's.
 * @returns The statement, or null for a script with none.
 */
export function cypherStatementAt(text: string, pos: number): CypherStatement | null {
  const stmts = splitCypher(text);
  if (stmts.length === 0) return null;
  for (const s of stmts) if (pos >= s.start && pos <= s.end) return s;
  let best: CypherStatement | null = null;
  for (const s of stmts) if (s.end <= pos) best = s;
  return best ?? stmts[0]!;
}

/**
 * The word being typed at `pos`, and its qualifier: `':'` after a colon (a label or relationship type), the variable's
 * name after a dot (a property key), else null.
 * @param text Cypher.
 * @param pos An offset in `text`, such as the cursor's.
 * @returns The word, where it starts, and its qualifier.
 */
export function cypherWordBefore(text: string, pos: number): { word: string; start: number; qualifier: string | null } {
  let i = pos;
  while (i > 0 && /[A-Za-z0-9_]/.test(text[i - 1]!)) i--;
  const word = text.slice(i, pos);
  let qualifier: string | null = null;
  if (text[i - 1] === ':' && inPattern(text, i - 1)) qualifier = ':';
  else if (text[i - 1] === '.' && /[A-Za-z0-9_`]/.test(text[i - 2] ?? '')) {
    let j = i - 1;
    while (j > 0 && /[A-Za-z0-9_`]/.test(text[j - 1]!)) j--;
    qualifier = text.slice(j, i - 1).replace(/`/g, '');
  }
  return { word, start: i, qualifier };
}

/** Whether offset `pos` is inside a node `(…)` or relationship `[…]` pattern, and not inside a map `{…}`. */
function inPattern(text: string, pos: number): boolean {
  const depth: string[] = [];
  for (const t of tokenizeCypher(text.slice(0, pos))) {
    if (t.type !== 'punct') continue;
    if ('([{'.includes(t.text)) depth.push(t.text);
    else if (')]}'.includes(t.text)) depth.pop();
  }
  const top = depth[depth.length - 1];
  return top === '(' || top === '[';
}

/** What completion knows about a graph: its labels, relationship types and property keys. */
export interface CypherVocabulary {
  labels: readonly string[];
  types: readonly string[];
  properties: readonly string[];
}

export interface CypherCompletion {
  label: string;
  /** 'label', 'type', 'prop', 'fn' or 'kw' (the popup shows it, so `detail` is left empty). */
  kind: string;
  detail: string;
}

/**
 * Completion candidates at `pos`: labels or relationship types after a `:` in a pattern, property keys after a `.`,
 * else keywords, functions and the graph's labels. `explicit` (Ctrl+Space) lists them even with nothing typed.
 * @param text Cypher.
 * @param pos The cursor's offset in `text`.
 * @param vocab The graph's labels, relationship types and property keys, or null for none.
 * @param explicit Whether the user asked for completion, so a list shows with nothing typed.
 * @returns The candidates whose names start with the word typed, and where that word starts (what a pick replaces).
 */
export function completeCypher(text: string, pos: number, vocab: CypherVocabulary | null, explicit: boolean): { items: CypherCompletion[]; start: number } {
  const { word, start, qualifier } = cypherWordBefore(text, pos);
  const lw = word.toLowerCase();
  if (!explicit && !qualifier && word.length < 2) return { items: [], start };
  const items: CypherCompletion[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: string, detail = '') => {
    if (seen.has(kind + label) || (lw && !label.toLowerCase().startsWith(lw))) return;
    seen.add(kind + label);
    items.push({ label, kind, detail });
  };
  if (qualifier === ':') {
    const inRel = relationshipOpen(text, start - 1);
    for (const t of (inRel ? vocab?.types : vocab?.labels) ?? []) add(t, inRel ? 'type' : 'label');
    return { items: items.slice(0, 60), start };
  }
  if (qualifier) {
    for (const p of vocab?.properties ?? []) add(p, 'prop');
    return { items: items.slice(0, 60), start };
  }
  for (const f of CYPHER_FUNCTIONS) add(f, 'fn');
  for (const k of CYPHER_KEYWORDS) add(k, 'kw');
  for (const l of vocab?.labels ?? []) add(l, 'label');
  return { items: items.slice(0, 60), start };
}

/** Whether the innermost open bracket before `pos` is a relationship's `[`. */
function relationshipOpen(text: string, pos: number): boolean {
  const depth: string[] = [];
  for (const t of tokenizeCypher(text.slice(0, pos))) {
    if (t.type !== 'punct') continue;
    if ('([{'.includes(t.text)) depth.push(t.text);
    else if (')]}'.includes(t.text)) depth.pop();
  }
  return depth[depth.length - 1] === '[';
}
