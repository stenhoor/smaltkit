# smaltkit/editor

A small code editor (a textarea over a highlighted layer, no dependencies) with line numbers, auto-indent, comment toggling, bracket pairing, a completion popup and warnings.

`setWarnings` underlines warnings and marks their lines in the gutter, with the messages on hover. Languages:
`sqlLanguage` (statement shading, completion from the schema), `typescriptLanguage`, which highlights SQL inside
`` sql`…` `` and `` exec`…` `` templates as SQL, and `cypherLanguage` (completion of a graph's labels, types and
property keys from the schema's `graph`).

## Examples

```ts
import { Editor, sqlLanguage } from 'smaltkit/editor';

const editor = new Editor(document.querySelector('#editor')!, { language: sqlLanguage, value: 'SELECT 1' });
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### completeSql {#completeSql}

```ts
function completeSql(text: string, pos: number, schema: EditorSchema, explicit: boolean): {
    items: CompletionItem[];
    start: number;
};
```

SQL completion: columns of the tables in the statement (or of a qualifier's table), tables, functions, keywords.

#### gutterHtml {#gutterHtml}

```ts
function gutterHtml(text: string, lines: number, warnings: readonly EditorWarning[]): string;
```

The gutter's HTML for `lines` lines, the lines with warnings marked and titled with their messages.

#### highlightTypeScript {#highlightTypeScript}

```ts
function highlightTypeScript(text: string): string;
```

HTML for the editor's highlight layer: TypeScript, with SQL in sql`…` and exec`…` templates highlighted as SQL.

#### markedHtml {#markedHtml}

```ts
function markedHtml(text: string, marks: readonly Mark[], hl: (s: string) => string): string;
```

The highlight layer's HTML for `text` with `marks` wrapped in `<mark>`s, each part highlighted by `hl` (which ends
its HTML with a newline, as the languages' do). Marks are taken in order; one that overlaps an earlier one is left out.

### Classes

#### Editor {#Editor}

```ts
class Editor {
    opts: EditorOptions;
    language: EditorLanguage;
    host: HTMLElement;
    ta: HTMLTextAreaElement;
    hl: HTMLPreElement;
    lines: HTMLDivElement;
    gutter: HTMLDivElement;
    stmtMark: HTMLDivElement;
    popup: HTMLDivElement;
    errorRange: {
        start: number;
        end: number;
        cls: string;
    } | null;
    warnings: EditorWarning[];
    lineCount: number;
    private gutterKey;
    compItems: CompletionItem[];
    compStart: number;
    compIndex: number;
    private _lh;
    private _cw;
    constructor(host: HTMLElement, opts?: EditorOptions);
    get value(): string;
    set value(v: string);
    focus(): void;
    selection(): string;
    selectionRange(): {
        start: number;
        end: number;
    };
    currentStatement(): Statement | null;
    insert(text: string): void;
    replaceAll(text: string): void;
    highlightRange(start: number | null, end?: number, cls?: string): void;
    setWarnings(warnings: readonly EditorWarning[]): void;
    changed(): void;
    render(): void;
    fitScrollbar(): void;
    syncScroll(): void;
    markStatement(): void;
    lineHeight(): number;
    onKey(e: KeyboardEvent): void;
    indent(outdent: boolean): void;
    toggleComment(): void;
    showComplete(explicit: boolean): void;
    charWidth(): number;
    renderComplete(): void;
    acceptComplete(): void;
    hideComplete(): void;
}
```

### Constants

#### cypherLanguage {#cypherLanguage}

```ts
const cypherLanguage: EditorLanguage;
```

Cypher (smaltcy's dialect): highlighting, `//` comments, statement shading, and completion of keywords, functions,
and the schema's graph vocabulary (labels after `:` in a node, types in a relationship, property keys after `.`).

#### sqlLanguage {#sqlLanguage}

```ts
const sqlLanguage: EditorLanguage;
```

SQL (smaltql's dialect): highlighting, `--` comments, statement shading and completion from the schema.

#### typescriptLanguage {#typescriptLanguage}

```ts
const typescriptLanguage: EditorLanguage;
```

TypeScript: highlighting (SQL inside sql`…` and exec`…`), `//` comments. Completion comes from a language service.

### Interfaces

#### CompletionItem {#CompletionItem}

```ts
interface CompletionItem {
    label: string;
    kind: string;
    detail: string;
}
```

| Member | |
| --- | --- |
| `kind` | 'col', 'table', 'view', 'fn', 'kw', … |

#### EditorLanguage {#EditorLanguage}

```ts
interface EditorLanguage {
    name: string;
    highlight(text: string, names?: Set<string>): string;
    lineComment: string;
    statementAt?(text: string, pos: number): Statement | null;
    complete?(text: string, pos: number, schema: EditorSchema, explicit: boolean): {
        items: CompletionItem[];
        start: number;
    };
    wordBefore?(text: string, pos: number): {
        word: string;
        start: number;
        qualifier: string | null;
    };
}
```

What the editor needs to know about a language.

| Member | |
| --- | --- |
| `highlight` | HTML for the highlight layer, ending with a newline. `names` are lower-cased object names from the schema. |
| `lineComment` | The line comment marker, e.g. `--` or `//`. |
| `statementAt?` | The statement under the cursor, shaded as what a run key runs; omit for none. |
| `complete?` | Completion candidates at `pos`; omit to turn completion off. |
| `wordBefore?` | Whether typing a character at `pos` should open completion (default: after a dot or two word characters). |

#### EditorOptions {#EditorOptions}

```ts
interface EditorOptions {
    value?: string;
    onChange?: (value: string) => void;
    schema?: () => EditorSchema;
    keys?: Record<string, (e: KeyboardEvent) => void>;
    language?: EditorLanguage;
    label?: string;
}
```

| Member | |
| --- | --- |
| `keys?` | Shortcuts such as "Mod+Enter", "Shift+Mod+Enter", "F5", "Mod+E". |
| `language?` | Default `sqlLanguage`. |
| `label?` | The textarea's accessible name. Default: "&lt;language> editor". |

#### EditorSchema {#EditorSchema}

```ts
interface EditorSchema {
    names: Set<string>;
    tables: Map<string, SchemaTable>;
    graph?: CypherVocabulary;
}
```

What the editor needs from the schema: lower-cased object names (for highlighting) and columns per table.

| Member | |
| --- | --- |
| `graph?` | A graph's labels, relationship types and property keys, for Cypher completion. |

#### EditorWarning {#EditorWarning}

```ts
interface EditorWarning {
    start: number;
    end: number;
    message: string;
}
```

A warning the editor marks: a range of the text, and what is wrong there (a type checker's error, say).

#### SchemaColumn {#SchemaColumn}

```ts
interface SchemaColumn {
    name: string;
    type?: string | null;
    nullable?: boolean;
    pk?: boolean;
    generated?: boolean;
}
```

A column as completion knows it.

### Types

#### SchemaTable {#SchemaTable}

```ts
type SchemaTable = SchemaColumn[] & {
    kind?: string;
    type?: string;
};
```

A table's columns, tagged with its kind ('table', 'view', 'matview', 'external', 'temp') and catalog type.

<!-- api:end -->
