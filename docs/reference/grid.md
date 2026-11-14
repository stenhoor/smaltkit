# smaltkit/grid

A virtualized data grid: it draws only the visible rows, with resizable, sortable columns, keyboard selection, copy and in-place editing.

Rows come from an array or from a source that fetches blocks as they scroll into view, so a page never holds a whole
result. `exportRows` writes CSV, TSV, JSON, NDJSON or SQL, and runs anywhere.

## Examples

```ts
import { exportRows } from 'smaltkit/grid';

const columns = ['region', 'revenue'];
const data = [['North', 120], ['South, East', 340]];
console.log(exportRows('csv', columns, data));
console.log(exportRows('sql', columns, data, 'sales'));
```

```text
region,revenue
North,120
"South, East",340

INSERT INTO sales (region, revenue) VALUES ('North', 120);
INSERT INTO sales (region, revenue) VALUES ('South, East', 340);

```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### exportRows {#exportRows}

```ts
function exportRows(format: ExportFormat, columns: (string | GridColumn)[], rows: GridRow[], tableName?: string): string;
```

CSV / TSV / JSON / NDJSON / SQL INSERT text for rows.

#### formatValue {#formatValue}

```ts
function formatValue(v: GridValue): string | null;
```

A value as the grid shows it; null for NULL.

#### plainValue {#plainValue}

```ts
function plainValue(v: GridValue): string;
```

A value as text for copying and export.

#### sortOrder {#sortOrder}

```ts
function sortOrder(rows: GridRow[], col: number, dir: SortDir): number[] | null;
```

The view order for sorting rows by a column: nulls first, then numbers, then strings, then everything else; equal
values keep their order. Null when `dir` is null (unsorted).

### Classes

#### Grid {#Grid}

```ts
class Grid {
    #private;
    opts: GridOptions;
    host: HTMLElement;
    columns: GridColumn[];
    rows: GridRow[];
    order: number[] | null;
    sort: {
        col: number;
        dir: SortDir;
    };
    widths: number[];
    sel: {
        row: number;
        col: number;
    };
    range: [
        number,
        number
    ];
    scroller: HTMLDivElement;
    table: HTMLTableElement;
    colgroup: HTMLTableColElement;
    headRow: HTMLTableRowElement;
    body: HTMLTableSectionElement;
    empty: HTMLDivElement;
    editing: boolean;
    justResized: boolean;
    constructor(host: HTMLElement, opts?: GridOptions);
    setData(columns: (string | GridColumn)[], rows: GridRow[], { serverSort, keepScroll }?: {
        serverSort?: {
            col: number;
            dir: SortDir;
        } | null;
        keepScroll?: boolean;
    }): void;
    setSource(source: RowSource, { serverSort }?: {
        serverSort?: {
            col: number;
            dir: SortDir;
        } | null;
    }): void;
    append(rows: GridRow[]): void;
    refresh(): void;
    destroy(): void;
    get rowCount(): number;
    rowAt(viewIndex: number): GridRow | undefined;
    sourceIndex(viewIndex: number): number;
    computeWidths(): void;
    renderHead(): void;
    renderRows(force?: boolean): void;
    cellFromEvent(e: Event): {
        row: number;
        col: number;
        td: HTMLTableCellElement;
    } | null;
    onCellDown(e: MouseEvent): void;
    onCellDbl(e: MouseEvent): void;
    select(row: number, col: number, scroll?: boolean): void;
    selectedValue(): GridValue;
    selectedSourceRow(): number;
    onKey(e: KeyboardEvent): void;
    flash(): void;
    beginEdit(viewRow: number, col: number): void;
    onHeadClick(e: MouseEvent): void;
    applyClientSort(): void;
    onResizeStart(e: MouseEvent): void;
    viewRows(): GridRow[];
}
```

### Interfaces

#### GridColumn {#GridColumn}

```ts
interface GridColumn {
    name: string;
    type?: string | null;
    pk?: boolean;
}
```

A grid column: a name, plus an optional type and primary-key flag for the header.

#### GridOptions {#GridOptions}

```ts
interface GridOptions {
    onSort?: (col: number, dir: SortDir) => void;
    editable?: (row: number, col: number) => boolean;
    onEdit?: (row: number, col: number, value: string | null) => Promise<void>;
    onSelect?: (row: number, col: number) => void;
    onOpenValue?: (row: number, col: number) => void;
    emptyText?: string;
    blockSize?: number;
}
```

| Member | |
| --- | --- |
| `onSort?` | Sorting done by the caller (a query, a source). Without it, `setData` grids sort on the client and source grids don't sort. |
| `blockSize?` | Rows per fetch from a source. Default 200. |

#### RowSource {#RowSource}

```ts
interface RowSource {
    columns: (string | GridColumn)[];
    rowCount: number;
    fetch(offset: number, limit: number): Promise<GridRow[]>;
    initial?: GridRow[];
}
```

Rows fetched on demand: the grid asks for blocks of rows as they scroll into view.

| Member | |
| --- | --- |
| `fetch` | Rows `offset` to `offset + limit - 1`, in the source's order. |
| `initial?` | Rows already known, from row 0 (for example a preview sent with the result). |

### Types

#### ExportFormat {#ExportFormat}

```ts
type ExportFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'sql';
```

#### GridRow {#GridRow}

```ts
type GridRow = GridValue[];
```

#### GridValue {#GridValue}

```ts
type GridValue = string | number | bigint | boolean | Uint8Array | null | undefined;
```

#### SortDir {#SortDir}

```ts
type SortDir = 'asc' | 'desc' | null;
```

<!-- api:end -->
