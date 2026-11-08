// Pretty printing, with no dependencies: JSON that keeps short values on one line, and a light TypeScript formatter.
//
// formatJson(value) prints a value as JSON the way people lay it out by hand: an array or object stays on one line
// when it fits the width, and breaks one item per line when it doesn't. bigints print as their digits.
//
// formatTypeScript(code) re-indents code by bracket depth, indents a continued method chain or operator one level,
// trims trailing spaces and collapses runs of blank lines. It never changes the text within a line, so it can't change
// what the code does; strings, template literals, comments and regular expressions are left exactly as they are.

export interface JsonFormatOptions {
  /** The widest line to aim for. Default 100. */
  width?: number;
  /** Spaces per level. Default 2. */
  indent?: number;
}

/** A value as JSON, laid out to fit the width. */
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
 * literal or a block comment keep their text exactly.
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
