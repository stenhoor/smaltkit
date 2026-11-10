// A small code editor: a transparent <textarea> over a highlighted <pre>, with line numbers, auto-indent, comment
// toggling, bracket and quote pairing, and a completion popup. Styled by ui.css (.sk-editor).
//
// The language decides highlighting, comments, statement shading and completion: `sqlLanguage` (the default) or
// `typescriptLanguage`, which highlights SQL inside sql`…` and exec`…` templates as SQL.

import { aliasesIn, FUNCTIONS, highlight as highlightSql, KEYWORDS, statementAt, unquote, wordBefore, type Statement } from './sql.js';
import { esc } from './svg.js';

/** A column as completion knows it. */
export interface SchemaColumn {
  name: string;
  type?: string | null;
  nullable?: boolean;
  pk?: boolean;
  generated?: boolean;
}

/** A table's columns, tagged with its kind ('table', 'view', 'matview', 'external', 'temp') and catalog type. */
export type SchemaTable = SchemaColumn[] & { kind?: string; type?: string };

/** What the editor needs from the schema: lower-cased object names (for highlighting) and columns per table. */
export interface EditorSchema {
  names: Set<string>;
  tables: Map<string, SchemaTable>;
}

export interface CompletionItem {
  label: string;
  /** 'col', 'table', 'view', 'fn', 'kw', … */
  kind: string;
  detail: string;
}

/** What the editor needs to know about a language. */
export interface EditorLanguage {
  name: string;
  /** HTML for the highlight layer, ending with a newline. `names` are lower-cased object names from the schema. */
  highlight(text: string, names?: Set<string>): string;
  /** The line comment marker, e.g. `--` or `//`. */
  lineComment: string;
  /** The statement under the cursor, shaded as what a run key runs; omit for none. */
  statementAt?(text: string, pos: number): Statement | null;
  /** Completion candidates at `pos`; omit to turn completion off. */
  complete?(text: string, pos: number, schema: EditorSchema, explicit: boolean): { items: CompletionItem[]; start: number };
  /** Whether typing a character at `pos` should open completion (default: after a dot or two word characters). */
  wordBefore?(text: string, pos: number): { word: string; start: number; qualifier: string | null };
}

export interface EditorOptions {
  value?: string;
  onChange?: (value: string) => void;
  schema?: () => EditorSchema;
  /** Shortcuts such as "Mod+Enter", "Shift+Mod+Enter", "F5", "Mod+E". */
  keys?: Record<string, (e: KeyboardEvent) => void>;
  /** Default `sqlLanguage`. */
  language?: EditorLanguage;
  /** The textarea's accessible name. Default: "<language> editor". */
  label?: string;
}

export class Editor {
  opts: EditorOptions;
  language: EditorLanguage;
  host: HTMLElement;
  ta: HTMLTextAreaElement;
  hl: HTMLPreElement;
  lines: HTMLDivElement;
  gutter: HTMLDivElement;
  stmtMark: HTMLDivElement;
  popup: HTMLDivElement;
  errorRange: { start: number; end: number; cls: string } | null = null;
  lineCount = 0;
  compItems: CompletionItem[] = [];
  compStart = 0;
  compIndex = 0;
  private _lh = 0;
  private _cw = 0;

  constructor(host: HTMLElement, opts: EditorOptions = {}) {
    this.opts = opts;
    this.language = opts.language ?? sqlLanguage;
    host.classList.add('sk-editor');
    host.innerHTML = `<div class="sk-ed-gutter"><div class="sk-ed-lines"></div></div><div class="sk-ed-body"><pre class="sk-ed-hl" aria-hidden="true"></pre><div class="sk-ed-stmt"></div><textarea class="sk-ed-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea></div><div class="sk-ed-complete" role="listbox" hidden></div>`;
    this.host = host;
    this.ta = host.querySelector('textarea')!;
    this.ta.setAttribute('aria-label', opts.label ?? `${this.language.name} editor`);
    this.hl = host.querySelector<HTMLPreElement>('.sk-ed-hl')!;
    this.lines = host.querySelector<HTMLDivElement>('.sk-ed-lines')!;
    this.gutter = host.querySelector<HTMLDivElement>('.sk-ed-gutter')!;
    this.stmtMark = host.querySelector<HTMLDivElement>('.sk-ed-stmt')!;
    this.popup = host.querySelector<HTMLDivElement>('.sk-ed-complete')!;
    this.ta.value = opts.value ?? '';
    this.ta.addEventListener('input', () => this.changed());
    this.ta.addEventListener('scroll', () => this.syncScroll());
    // The width decides whether the text overflows sideways, so a resize can add or remove the scrollbar.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.fitScrollbar()).observe(this.ta);
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
    this.ta.addEventListener('click', () => {
      this.hideComplete();
      this.markStatement();
    });
    this.ta.addEventListener('keyup', (e) => {
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key) || this.popup.hidden) this.markStatement();
    });
    this.ta.addEventListener('blur', () => setTimeout(() => this.hideComplete(), 150));
    this.popup.addEventListener('mousedown', (e) => {
      const li = (e.target as Element | null)?.closest<HTMLElement>('[data-i]');
      if (!li) return;
      e.preventDefault();
      this.compIndex = Number(li.dataset.i);
      this.acceptComplete();
    });
    this.render();
  }

  get value(): string {
    return this.ta.value;
  }

  set value(v: string) {
    this.ta.value = v;
    this.render();
  }

  focus(): void {
    this.ta.focus();
  }

  /** Selected text, or ''. */
  selection(): string {
    return this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
  }

  selectionRange(): { start: number; end: number } {
    return { start: this.ta.selectionStart, end: this.ta.selectionEnd };
  }

  /** The statement under the cursor, when the language has statements. */
  currentStatement(): Statement | null {
    return this.language.statementAt?.(this.ta.value, this.ta.selectionStart) ?? null;
  }

  insert(text: string): void {
    this.ta.focus();
    const { selectionStart: s, selectionEnd: e } = this.ta;
    this.ta.setRangeText(text, s, e, 'end');
    this.changed();
  }

  /** Replaces the whole text through the undo stack where supported. */
  replaceAll(text: string): void {
    this.ta.focus();
    this.ta.select();
    if (!document.execCommand?.('insertText', false, text)) this.ta.value = text;
    this.changed();
  }

  /** Marks a range (an error) until the next edit; null clears it. */
  highlightRange(start: number | null, end = 0, cls = 'sk-ed-err'): void {
    this.errorRange = start === null ? null : { start, end, cls };
    this.render();
  }

  changed(): void {
    this.errorRange = null;
    this.render();
    this.opts.onChange?.(this.ta.value);
    this.markStatement();
  }

  render(): void {
    const text = this.ta.value;
    const names = this.opts.schema?.().names;
    const hl = (s: string) => this.language.highlight(s, names);
    let html = hl(text);
    if (this.errorRange) {
      const { start, end, cls } = this.errorRange;
      html = hl(text.slice(0, start)).slice(0, -1) + `<mark class="${esc(cls)}">` + hl(text.slice(start, end)).slice(0, -1) + '</mark>' + hl(text.slice(end));
    }
    this.hl.innerHTML = html;
    const n = text.split('\n').length;
    if (n !== this.lineCount) {
      this.lineCount = n;
      let s = '';
      for (let i = 1; i <= n; i++) s += i + '\n';
      this.lines.textContent = s;
    }
    this.fitScrollbar();
    this.syncScroll();
  }

  /**
   * Room below the last line for the textarea's horizontal scrollbar. The gutter's lines set the editor's height when
   * nothing else does (an editor sized to its text), and a scrollbar that takes space would otherwise cover the last
   * line and add a vertical scrollbar. Overlay scrollbars take no space, so this adds nothing for them.
   */
  fitScrollbar(): void {
    const bar = Math.max(0, this.ta.offsetHeight - this.ta.clientHeight);
    const pad = bar ? `${8 + bar}px` : '';
    if (this.lines.style.paddingBottom !== pad) this.lines.style.paddingBottom = pad;
  }

  syncScroll(): void {
    this.hl.style.transform = `translate(${-this.ta.scrollLeft}px, ${-this.ta.scrollTop}px)`;
    this.stmtMark.style.transform = `translateY(${-this.ta.scrollTop}px)`;
    this.lines.style.transform = `translateY(${-this.ta.scrollTop}px)`;
  }

  /** Shades the lines of the statement under the cursor (what a run key runs). */
  markStatement(): void {
    const text = this.ta.value;
    const st = this.ta.selectionStart === this.ta.selectionEnd && text.trim() ? this.currentStatement() : null;
    if (!st) {
      this.stmtMark.style.display = 'none';
      return;
    }
    const lh = this.lineHeight();
    const l0 = text.slice(0, st.start).split('\n').length - 1;
    const l1 = text.slice(0, st.end).split('\n').length - 1;
    this.stmtMark.style.display = '';
    this.stmtMark.style.top = 8 + l0 * lh + 'px';
    this.stmtMark.style.height = (l1 - l0 + 1) * lh + 'px';
  }

  lineHeight(): number {
    if (!this._lh) this._lh = parseFloat(getComputedStyle(this.ta).lineHeight) || 20;
    return this._lh;
  }

  onKey(e: KeyboardEvent): void {
    const ta = this.ta;
    const mod = e.ctrlKey || e.metaKey;
    if (!this.popup.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = this.compItems.length;
        this.compIndex = (this.compIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        this.renderComplete();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.acceptComplete();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hideComplete();
        return;
      }
    }
    for (const [combo, fn] of Object.entries(this.opts.keys ?? {})) {
      if (matchCombo(e, combo)) {
        e.preventDefault();
        this.hideComplete();
        fn(e);
        return;
      }
    }
    if (mod && e.key === ' ') {
      e.preventDefault();
      this.showComplete(true);
      return;
    }
    if (mod && e.key === '/') {
      e.preventDefault();
      this.toggleComment();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      this.indent(e.shiftKey);
      return;
    }
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const indent = /^[ \t]*/.exec(ta.value.slice(lineStart, s))?.[0] ?? '';
      const before = ta.value.slice(lineStart, s).trimEnd();
      const extra = /[({[]$/.test(before) ? '  ' : '';
      document.execCommand?.('insertText', false, '\n' + indent + extra) || this.insert('\n' + indent + extra);
      return;
    }
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', "'": "'", '"': '"', '`': '`' };
    if (pairs[e.key] && !mod) {
      const { selectionStart: s, selectionEnd: en } = ta;
      if (s !== en) {
        e.preventDefault();
        const inner = ta.value.slice(s, en);
        document.execCommand?.('insertText', false, e.key + inner + pairs[e.key]) || this.insert(e.key + inner + pairs[e.key]);
        return;
      }
    }
    if (!this.language.complete) return;
    // After the key's character is in the text: a microtask here would run before the browser inserts it.
    if (!mod && e.key.length === 1) {
      setTimeout(() => {
        const { word, qualifier } = (this.language.wordBefore ?? wordBefore)(ta.value, ta.selectionStart);
        if (qualifier !== null || word.length >= 2) this.showComplete(false);
        else this.hideComplete();
      }, 0);
    } else if (e.key === 'Backspace') {
      setTimeout(() => (this.popup.hidden ? null : this.showComplete(false)), 0);
    }
  }

  indent(outdent: boolean): void {
    const ta = this.ta;
    const v = ta.value;
    const { selectionStart: s, selectionEnd: e } = ta;
    if (s === e && !outdent) {
      document.execCommand?.('insertText', false, '  ') || this.insert('  ');
      return;
    }
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(ls, e);
    const out = outdent ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
    ta.setSelectionRange(ls, e);
    document.execCommand?.('insertText', false, out) || ta.setRangeText(out, ls, e, 'select');
    ta.setSelectionRange(ls, ls + out.length);
    this.changed();
  }

  toggleComment(): void {
    const ta = this.ta;
    const v = ta.value;
    const marker = this.language.lineComment;
    const { selectionStart: s, selectionEnd: e } = ta;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', Math.max(e - (e > s && v[e - 1] === '\n' ? 1 : 0), s));
    if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    const m = marker.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const all = lines.filter((l) => l.trim()).every((l) => new RegExp(`^\\s*${m}`).test(l));
    const out = lines.map((l) => (all ? l.replace(new RegExp(`^(\\s*)${m} ?`), '$1') : l.trim() ? `${marker} ` + l : l)).join('\n');
    ta.setSelectionRange(ls, le);
    document.execCommand?.('insertText', false, out) || ta.setRangeText(out, ls, le, 'select');
    ta.setSelectionRange(ls, ls + out.length);
    this.changed();
  }

  showComplete(explicit: boolean): void {
    const complete = this.language.complete;
    if (!complete) return;
    const schema: EditorSchema = this.opts.schema?.() ?? { names: new Set(), tables: new Map() };
    const { items, start } = complete(this.ta.value, this.ta.selectionStart, schema, explicit);
    if (!items.length) {
      this.hideComplete();
      return;
    }
    this.compItems = items;
    this.compStart = start;
    this.compIndex = 0;
    this.renderComplete();
    const v = this.ta.value.slice(0, this.ta.selectionStart);
    const line = v.split('\n').length - 1;
    const col = v.length - v.lastIndexOf('\n') - 1;
    const lh = this.lineHeight();
    const cw = this.charWidth();
    const body = this.ta.getBoundingClientRect();
    const hostR = this.host.getBoundingClientRect();
    let x = body.left - hostR.left + 12 + col * cw - this.ta.scrollLeft;
    let y = body.top - hostR.top + 8 + (line + 1) * lh - this.ta.scrollTop + 2;
    x = Math.min(x, hostR.width - 260);
    if (y + 220 > hostR.height) y = Math.max(0, y - 220 - lh - 4);
    this.popup.style.left = Math.max(0, x) + 'px';
    this.popup.style.top = y + 'px';
    this.popup.hidden = false;
  }

  charWidth(): number {
    if (!this._cw) {
      const s = document.createElement('span');
      s.textContent = 'MMMMMMMMMM';
      s.style.visibility = 'hidden';
      this.hl.appendChild(s);
      this._cw = s.getBoundingClientRect().width / 10 || 8;
      s.remove();
    }
    return this._cw;
  }

  renderComplete(): void {
    this.popup.innerHTML = this.compItems
      .map((it, i) => `<div class="sk-ac-item${i === this.compIndex ? ' sk-active' : ''}" data-i="${i}" role="option"><span class="sk-ac-kind sk-ac-${esc(it.kind)}">${esc(it.kind)}</span><span class="sk-ac-label">${esc(it.label)}</span><span class="sk-ac-detail">${esc(it.detail || '')}</span></div>`)
      .join('');
    this.popup.querySelector('.sk-active')?.scrollIntoView({ block: 'nearest' });
  }

  acceptComplete(): void {
    const it = this.compItems[this.compIndex];
    if (!it) return;
    const ta = this.ta;
    let text = it.label;
    if (it.kind === 'fn') text += '(';
    ta.setSelectionRange(this.compStart, ta.selectionStart);
    document.execCommand?.('insertText', false, text) || ta.setRangeText(text, this.compStart, ta.selectionEnd, 'end');
    this.hideComplete();
    this.changed();
  }

  hideComplete(): void {
    this.popup.hidden = true;
  }
}

function findTable(tables: Map<string, SchemaTable>, name: string): SchemaTable | null {
  const n = unquote(name).toLowerCase();
  for (const [t, cols] of tables) if (t.toLowerCase() === n) return cols;
  return null;
}

/** SQL completion: columns of the tables in the statement (or of a qualifier's table), tables, functions, keywords. */
export function completeSql(text: string, pos: number, schema: EditorSchema, explicit: boolean): { items: CompletionItem[]; start: number } {
  const { word, start, qualifier } = wordBefore(text, pos);
  const w = word.toLowerCase();
  const items: CompletionItem[] = [];
  const seen = new Set<string>();
  const add = (label: string, kind: string, detail: string | null | undefined = '') => {
    const key = kind + ':' + label.toLowerCase();
    if (seen.has(key) || !label.toLowerCase().startsWith(w)) return;
    if (!explicit && label.toLowerCase() === w) return;
    seen.add(key);
    items.push({ label, kind, detail: detail ?? '' });
  };
  const st = statementAt(text, pos);
  const tableNames = new Set([...schema.tables.keys()].map((k) => k.toLowerCase()));
  if (qualifier !== null) {
    const aliases = aliasesIn(st?.sql ?? text, tableNames);
    const cols = findTable(schema.tables, aliases.get(qualifier.toLowerCase()) ?? qualifier);
    if (cols) for (const c of cols) add(c.name, 'col', c.type);
    return { items, start };
  }
  if (st) for (const t of new Set(aliasesIn(st.sql, tableNames).values())) for (const c of findTable(schema.tables, t) ?? []) add(c.name, 'col', `${t}.${c.type ?? ''}`);
  for (const [t, cols] of schema.tables) add(t, cols.kind ?? 'table', cols.kind === 'view' ? 'view' : '');
  for (const f of FUNCTIONS) add(f, 'fn');
  for (const k of KEYWORDS) add(k, 'kw');
  return { items: items.slice(0, 60), start };
}

/** SQL (smaltql's dialect): highlighting, `--` comments, statement shading and completion from the schema. */
export const sqlLanguage: EditorLanguage = {
  name: 'SQL',
  highlight: highlightSql,
  lineComment: '--',
  statementAt,
  complete: completeSql,
};

// ---------------------------------------------------------------------------------------------------- TypeScript

const TS_KEYWORDS = new Set(
  `abstract as asserts async await break case catch class const continue debugger declare default delete do else enum
  export extends false finally for from function get if implements import in infer instanceof interface is keyof let
  namespace never new null of private protected public readonly return satisfies set static super switch this throw
  true try type typeof undefined unique var void while with yield`.split(/\s+/),
);

/** Tags whose templates hold SQL: their text is highlighted as SQL, their `${}` as TypeScript. */
const SQL_TAGS = new Set(['sql', 'exec']);

/** Whether the template starting at `tick` is tagged as SQL: `sql`…``, `sql<Row>`…``, `db.sql`…``. */
function sqlTagged(text: string, tick: number): boolean {
  let i = tick - 1;
  while (i >= 0 && /\s/.test(text[i]!)) i--;
  if (text[i] === '>') {
    let depth = 0;
    for (; i >= 0; i--) {
      if (text[i] === '>') depth++;
      else if (text[i] === '<' && --depth === 0) break;
    }
    i--;
    while (i >= 0 && /\s/.test(text[i]!)) i--;
  }
  let j = i;
  while (j >= 0 && /[A-Za-z0-9_$]/.test(text[j]!)) j--;
  return SQL_TAGS.has(text.slice(j + 1, i + 1));
}

const span = (cls: string, s: string) => `<span class="sk-tk-${cls}">${esc(s)}</span>`;

/**
 * Highlights TypeScript from `i` until an unmatched `}` (inside a template's `${…}`) or the end. Returns the HTML and
 * where it stopped.
 */
function tsHtml(text: string, i: number, inInterpolation: boolean): { html: string; end: number } {
  let html = '';
  let depth = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    const start = i;
    if (c === '}' && inInterpolation && depth === 0) return { html, end: i };
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (/\s/.test(c)) {
      while (i < n && /\s/.test(text[i]!)) i++;
      html += esc(text.slice(start, i));
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      html += span('c', text.slice(start, i));
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      html += span('c', text.slice(start, i));
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i = Math.min(n, i + 1);
      html += span('s', text.slice(start, i));
    } else if (c === '`') {
      const t = templateHtml(text, i, sqlTagged(text, i));
      html += t.html;
      i = t.end;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      while (i < n && /[0-9a-fA-FxXoObBn_.eE]/.test(text[i]!)) i++;
      html += span('n', text.slice(start, i));
    } else if (/[A-Za-z_$]/.test(c)) {
      while (i < n && /[A-Za-z0-9_$]/.test(text[i]!)) i++;
      const word = text.slice(start, i);
      let k = i;
      while (k < n && text[k] === ' ') k++;
      const prev = text.slice(0, start).trimEnd();
      if (TS_KEYWORDS.has(word) && !prev.endsWith('.')) html += span('k', word);
      else if (text[k] === '(' || text[k] === '`' || text[k] === '<' && /^(sql|exec)$/.test(word)) html += span('f', word);
      else if (/^[A-Z]/.test(word)) html += span('t', word);
      else html += esc(word);
    } else {
      i++;
      html += /[=<>!+\-*/%&|^~?:]/.test(c) ? span('o', c) : esc(c);
    }
  }
  return { html, end: i };
}

/** A template literal from its opening backtick: text as a string (or as SQL), `${…}` as TypeScript. */
function templateHtml(text: string, tick: number, asSql: boolean): { html: string; end: number } {
  let html = span(asSql ? 'tpl-sql' : 's', '`');
  let i = tick + 1;
  let chunk = i;
  const n = text.length;
  const flush = (to: number) => {
    const s = text.slice(chunk, to);
    if (s) html += asSql ? highlightSql(s).slice(0, -1) : span('s', s);
  };
  while (i < n) {
    const c = text[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') {
      flush(i);
      return { html: html + span(asSql ? 'tpl-sql' : 's', '`'), end: i + 1 };
    }
    if (c === '$' && text[i + 1] === '{') {
      flush(i);
      const inner = tsHtml(text, i + 2, true);
      html += `<span class="sk-tk-interp">${esc('${')}${inner.html}${inner.end < n ? esc('}') : ''}</span>`;
      i = Math.min(n, inner.end + 1);
      chunk = i;
      continue;
    }
    i++;
  }
  flush(n);
  return { html, end: n };
}

/** HTML for the editor's highlight layer: TypeScript, with SQL in sql`…` and exec`…` templates highlighted as SQL. */
export function highlightTypeScript(text: string): string {
  return tsHtml(text, 0, false).html + '\n';
}

/** TypeScript: highlighting (SQL inside sql`…` and exec`…`), `//` comments. Completion comes from a language service. */
export const typescriptLanguage: EditorLanguage = {
  name: 'TypeScript',
  highlight: highlightTypeScript,
  lineComment: '//',
};

/** "Mod+Enter", "Shift+Mod+Enter", "F5", "Mod+E" */
function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+');
  const key = parts.pop() ?? '';
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const mod = e.ctrlKey || e.metaKey;
  if (want.has('mod') !== mod) return false;
  if (want.has('shift') !== e.shiftKey) return false;
  if (want.has('alt') !== e.altKey) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}
