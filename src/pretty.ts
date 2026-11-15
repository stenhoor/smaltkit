// Pretty printing, with no dependencies: JSON that keeps short values on one line, and a light TypeScript formatter.
//
// formatJson(value) prints a value as JSON the way people lay it out by hand: an array or object stays on one line
// when it fits the width, and breaks one item per line when it doesn't. bigints print as their digits.
//
// formatTypeScript(code) re-indents code by bracket depth, indents a continued method chain or operator one level,
// trims trailing spaces and collapses runs of blank lines. It never changes the text within a line, so it can't change
// what the code does; strings, template literals, comments and regular expressions are left exactly as they are.
//
// inspect(value) and formatLog(values) print values as a console does, the same in Node and in a page, so a printed
// result can be checked in one and shown in the other.

export interface JsonFormatOptions {
  /** The widest line to aim for. Default 100. */
  width?: number;
  /** Spaces per level. Default 2. */
  indent?: number;
}

/**
 * A value as JSON, laid out to fit the width: an object or array stays on one line when it fits, and has one item per
 * line when it doesn't. Bigints are written as numbers.
 * @param value Anything JSON.stringify takes.
 * @param options `width`, the widest line to aim for (default 100), and `indent`, spaces per level (default 2).
 * @returns The JSON text.
 * @throws TypeError when the value is circular.
 */
export function formatJson(value: unknown, options: JsonFormatOptions = {}): string {
  const width = options.width ?? 100;
  const unit = ' '.repeat(options.indent ?? 2);
  const seen = new Set<object>();

  const flat = (v: unknown): string | undefined => {
    v = normalize(v);
    if (v === undefined) return undefined;
    if (v === null || typeof v !== 'object') return scalar(v);
    if (seen.has(v)) throw new TypeError('formatJson: the value is circular');
    seen.add(v);
    try {
      if (Array.isArray(v)) return `[${v.map((x) => flat(x) ?? 'null').join(', ')}]`;
      const parts = Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => [k, flat(x)] as const)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => `${JSON.stringify(k)}: ${x}`);
      return parts.length ? `{ ${parts.join(', ')} }` : '{}';
    } finally {
      seen.delete(v);
    }
  };

  // `prefix` is what comes before the value on its line (a key), `tail` what follows it (a comma).
  const fmt = (v: unknown, pad: string, prefix: string, tail = 0): string | undefined => {
    v = normalize(v);
    const one = flat(v);
    if (one === undefined) return undefined;
    if (v === null || typeof v !== 'object' || pad.length + prefix.length + one.length + tail <= width) return one;
    seen.add(v);
    try {
      const inner = pad + unit;
      if (Array.isArray(v)) {
        if (!v.length) return '[]';
        return `[\n${v.map((x, i) => inner + (fmt(x, inner, '', i < v.length - 1 ? 1 : 0) ?? 'null')).join(',\n')}\n${pad}]`;
      }
      const lines: string[] = [];
      const entries = Object.entries(v as Record<string, unknown>);
      for (const [n, [k, x]] of entries.entries()) {
        const key = `${JSON.stringify(k)}: `;
        const s = fmt(x, inner, key, n < entries.length - 1 ? 1 : 0);
        if (s !== undefined) lines.push(inner + key + s);
      }
      return lines.length ? `{\n${lines.join(',\n')}\n${pad}}` : '{}';
    } finally {
      seen.delete(v);
    }
  };

  return fmt(value, '', '') ?? 'undefined';
}

/** What JSON.stringify would print for a value, before layout: toJSON, typed arrays, Maps and Sets as data. */
function normalize(v: unknown): unknown {
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v && typeof v === 'object') {
    if (typeof (v as { toJSON?: unknown }).toJSON === 'function') return (v as { toJSON(): unknown }).toJSON();
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v as unknown as ArrayLike<number | bigint>);
    if (v instanceof Map) return Object.fromEntries(v);
    if (v instanceof Set) return [...v];
  }
  return v;
}

function scalar(v: unknown): string {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  return JSON.stringify(v) ?? 'null';
}

// ---------------------------------------------------------------- TypeScript

export interface TsFormatOptions {
  /** Spaces per level. Default 2. */
  indent?: number;
}

/** Words after which a `/` starts a regular expression rather than dividing. */
const REGEX_AFTER = /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|await|yield)\s*$/;

/** Operators that, starting a line, continue the statement above it. */
const CONTINUES = /^(?:\?\.|\.(?!\.\.)|\?\?|\|\||&&|=>|\+(?!\+)|-(?!-)|\/(?![/*])|[?:*%|&^])/;

/**
 * TypeScript (or JavaScript) re-indented by bracket depth, with continued lines one level in. Lines inside a template
 * literal or a block comment keep their text exactly. Only whitespace at the start and end of lines changes, so what the
 * code does can't change; runs of blank lines become one.
 * @param code The code.
 * @param options `indent`: spaces per level (default 2).
 * @returns The code, re-indented.
 */
export function formatTypeScript(code: string, options: TsFormatOptions = {}): string {
  const unit = ' '.repeat(options.indent ?? 2);
  const lines = code.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let depth = 0;
  // Inside something that spans lines: a block comment, or a template literal (with its ${…} nesting).
  let inComment = false;
  const templates: number[] = []; // brace depth inside each open ${…}; -1 while in the template's text
  let blank = 0;

  for (const raw of lines) {
    const startsInside = inComment || (templates.length > 0 && templates[templates.length - 1] === -1);
    const text = startsInside ? raw : raw.trim();
    if (!startsInside && !text) {
      blank++;
      continue;
    }

    // Scan the line: brackets outside strings, comments, templates and regexes.
    const depthStart = depth;
    let leadingClosers = 0;
    let seenCode = false;
    let i = 0;
    let quote: string | null = null;
    while (i < text.length) {
      const c = text[i]!;
      const inTemplateText = templates.length > 0 && templates[templates.length - 1] === -1;
      if (inComment) {
        const e = text.indexOf('*/', i);
        if (e < 0) {
          i = text.length;
          break;
        }
        inComment = false;
        i = e + 2;
        continue;
      }
      if (inTemplateText) {
        if (c === '\\') i += 2;
        else if (c === '`') (templates.pop(), i++);
        else if (c === '$' && text[i + 1] === '{') (templates[templates.length - 1] = 0, (i += 2));
        else i++;
        continue;
      }
      if (quote) {
        if (c === '\\') i += 2;
        else if (c === quote) (quote = null, i++);
        else i++;
        continue;
      }
      if (c === ' ' || c === '\t') {
        i++;
        continue;
      }
      if (c === '/' && text[i + 1] === '/') break;
      if (c === '/' && text[i + 1] === '*') {
        inComment = true;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        seenCode = true;
        i++;
        continue;
      }
      if (c === '`') {
        templates.push(-1);
        seenCode = true;
        i++;
        continue;
      }
      if (c === '/') {
        const before = text.slice(0, i).trimEnd();
        const prev = before[before.length - 1];
        if (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || REGEX_AFTER.test(before)) {
          // A regular expression literal: skip to its closing slash.
          let cls = false;
          i++;
          while (i < text.length) {
            const d = text[i]!;
            if (d === '\\') i += 2;
            else if (d === '[') (cls = true, i++);
            else if (d === ']') (cls = false, i++);
            else if (d === '/' && !cls) {
              i++;
              break;
            } else i++;
          }
          seenCode = true;
          continue;
        }
      }
      if ('([{'.includes(c)) {
        depth++;
        if (templates.length && templates[templates.length - 1]! >= 0 && c === '{') templates[templates.length - 1]!++;
      } else if (')]}'.includes(c)) {
        if (templates.length && templates[templates.length - 1]! >= 0 && c === '}') {
          if (templates[templates.length - 1] === 0) {
            templates[templates.length - 1] = -1; // back in the template's text
            i++;
            continue;
          }
          templates[templates.length - 1]!--;
        }
        depth = Math.max(0, depth - 1);
        if (!seenCode) leadingClosers++;
      }
      if (!')]}'.includes(c)) seenCode = true;
      i++;
    }

    if (blank && out.length) out.push('');
    blank = 0;
    if (startsInside) {
      out.push(raw.replace(/\s+$/, ''));
      continue;
    }
    // The depth this line opened at, less the closers it starts with; a continued line goes one level in.
    const lineDepth = Math.max(0, depthStart - leadingClosers) + (CONTINUES.test(text) ? 1 : 0);
    out.push(unit.repeat(lineDepth) + text);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out.length ? out.join('\n') + '\n' : '';
}

export interface InspectOptions {
  /** The widest line to aim for: a value that doesn't fit has one item per line. Default 80. */
  width?: number;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A string in quotes, as a console shows it: single quotes, or double or back quotes when the text holds single ones. */
function quote(s: string): string {
  const q = !s.includes("'") ? "'" : !s.includes('"') ? '"' : !s.includes('`') ? '`' : "'";
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

/**
 * A value as a console shows it, the same in every runtime: `'text'`, `12n`, `[ 1, 2 ]`, `{ a: 1 }`,
 * `Map(1) { 'a' => 1 }`, `Uint8Array(2) [ 1, 2 ]`. A value that fits the width stays on one line; one that doesn't
 * has an item per line, indented two spaces. Circular references are `[Circular]`.
 * @param value Anything.
 * @param options `width`: the widest line to aim for (default 80).
 * @returns The text.
 */
export function inspect(value: unknown, options: InspectOptions = {}): string {
  const width = options.width ?? 80;
  const seen = new Set<object>();

  /** The value's parts: a scalar's text, or an opening, items and a closing for something with items. */
  type Shape = string | { open: string; items: Shape[]; close: string };

  const shape = (v: unknown): Shape => {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return quote(v);
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (typeof v === 'bigint') return `${v}n`;
    if (typeof v === 'boolean' || typeof v === 'symbol') return String(v);
    if (typeof v === 'function') return `[Function: ${v.name || '(anonymous)'}]`;
    const o = v as object;
    if (seen.has(o)) return '[Circular]';
    if (o instanceof Date) return isNaN(o.getTime()) ? 'Invalid Date' : o.toISOString();
    if (o instanceof RegExp) return String(o);
    if (o instanceof Error) return `${o.name}: ${o.message}`;
    seen.add(o);
    try {
      if (Array.isArray(o)) return { open: '[', items: o.map(shape), close: ']' };
      if (ArrayBuffer.isView(o) && !(o instanceof DataView)) {
        const a = o as unknown as ArrayLike<number | bigint>;
        return { open: `${o.constructor.name}(${a.length}) [`, items: Array.from(a, shape), close: ']' };
      }
      if (o instanceof Map) {
        const items = [...o].map(([k, val]) => join(flat(shape(k)), ' => ', shape(val)));
        return { open: `Map(${o.size}) {`, items, close: '}' };
      }
      if (o instanceof Set) return { open: `Set(${o.size}) {`, items: [...o].map(shape), close: '}' };
      const name = o.constructor && o.constructor !== Object ? `${o.constructor.name} ` : '';
      const items = Object.entries(o).map(([k, val]) => join(IDENT.test(k) ? k : quote(k), ': ', shape(val)));
      return { open: `${name}{`, items, close: '}' };
    } finally {
      seen.delete(o);
    }
  };

  /** A key and a value: one line when the value is, else the key before the value's opening. */
  const join = (key: string, sep: string, val: Shape): Shape =>
    typeof val === 'string' ? key + sep + val : { open: key + sep + val.open, items: val.items, close: val.close };

  const flat = (s: Shape): string =>
    typeof s === 'string' ? s : s.items.length ? `${s.open} ${s.items.map(flat).join(', ')} ${s.close}` : `${s.open}${s.close}`;

  const lay = (s: Shape, indent: string): string => {
    const one = flat(s);
    if (typeof s === 'string' || indent.length + one.length <= width || !s.items.length) return one;
    const inner = indent + '  ';
    return `${s.open}\n${s.items.map((i) => inner + lay(i, inner)).join(',\n')}\n${indent}${s.close}`;
  };

  return lay(shape(value), '');
}

/**
 * What `console.log(...values)` prints, the same in every runtime: strings as they are, everything else as inspect
 * shows it, joined by spaces.
 * @param values The values logged.
 * @param options As for inspect.
 * @returns The line (or lines, for a value laid out over several).
 */
export function formatLog(values: readonly unknown[], options: InspectOptions = {}): string {
  return values.map((v) => (typeof v === 'string' ? v : inspect(v, options))).join(' ');
}
