# smaltkit/charts

Charts drawn as SVG and HTML strings: bar, column, line, area, combo, pie, donut, funnel, treemap, waterfall, gauge, KPI card, scatter and heatmap.

Bar, column, line, area and combo take axis options (a continuous date or number axis, log scale, fixed ends, titles),
reference lines, and small multiples (a `multiples` field: a panel per value, one scale).

A renderer takes a `ChartContext`: the element to draw into, its size, the options, and the data as columns tagged
with a role (`category`, `series`, `values`, `x`, `rows`, …) and a kind (`dimension` or `measure`). It writes the
chart in one `innerHTML` assignment. Marks carry ``data-row``, so the page can add selection, tooltips and drill
on top; they get `sk-dim` or `sk-on` when `ctx.selected(row)` returns false or true. Styles come from
[`smaltkit/ui.css`](./styles).

## Examples

```ts
import { chartData, columnChart, type ChartColumn } from 'smaltkit/charts';

const columns: ChartColumn[] = [
  { key: 'c', role: 'category', label: 'Category', kind: 'dimension', values: ['Tea', 'Coffee'], fmt: String },
  { key: 'v', role: 'values', label: 'Revenue', kind: 'measure', values: [120, 340], fmt: String },
];
columnChart({
  el: document.querySelector('#chart')!, width: 480, height: 280, options: { labels: true },
  data: chartData(columns, 2), extra: {}, palette: 12, selected: () => null,
});
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### areaChart {#areaChart}

```ts
function areaChart(ctx: ChartContext): void;
```

Areas. Roles as barChart. Options: stack, smooth, markers, labels, legend, and the axis options of columnChart.

#### barChart {#barChart}

```ts
function barChart(ctx: ChartContext): void;
```

Horizontal bars. Roles: `category`, optional `series` and `multiples` (small multiples), measures. Options: stack
(none, stacked, percent), labels, legend, and the value axis: yScale (linear, log), yMin, yMax, refLines, xTitle,
yTitle.

#### cellFormatHtml {#cellFormatHtml}

```ts
function cellFormatHtml(f: CellFormat | null | undefined): {
    cls: string;
    icon: string;
};
```

The classes and icon markup for a value's conditional format ('' when there is none).

#### chartData {#chartData}

```ts
function chartData(columns: ChartColumn[], rows: number): ChartData;
```

Build ChartData from columns.

#### columnChart {#columnChart}

```ts
function columnChart(ctx: ChartContext): void;
```

Vertical columns. Same roles and options as barChart, and xAxis: category (default) or continuous (dates, numbers).

#### comboChart {#comboChart}

```ts
function comboChart(ctx: ChartContext): void;
```

Columns and lines: measures in role `columns` are bars, in role `lines` are lines (option secondaryAxis puts them on
a second axis, titled by y2Title). The axis options of columnChart apply.

#### donutChart {#donutChart}

```ts
function donutChart(ctx: ChartContext): void;
```

Donut: as pieChart, with options `hole` (0–1), `center` (show the total) and `total`. Without `total`, the centre
and the label percentages use the sum of the slices. With it (a number the app computed), they use that instead:
for slices that overlap (a sale in two categories), the sum is more than the whole and `total` is the whole.

#### funnelChart {#funnelChart}

```ts
function funnelChart(ctx: ChartContext): void;
```

Funnel: roles `category` (stage) and one measure.

#### gaugeChart {#gaugeChart}

```ts
function gaugeChart(ctx: ChartContext): void;
```

Gauge: roles `values`, optional `target` and `max`; option `maxValue` when there is no max column.

#### heatmapChart {#heatmapChart}

```ts
function heatmapChart(ctx: ChartContext): void;
```

Heatmap: roles `rows`, `columns` and one measure, coloured along the sequential ramp.

#### kpiCard {#kpiCard}

```ts
function kpiCard(ctx: ChartContext): void;
```

KPI card: roles `values`, optional `target` (comparison); `extra.trend` draws a sparkline. Options: `compare` (delta, value, none), `goodWhen` (up, down), `caption`.

#### legendHtml {#legendHtml}

```ts
function legendHtml(names: string[], palette: number, offset?: number): string;
```

A legend (HTML) for series names.

#### lineChart {#lineChart}

```ts
function lineChart(ctx: ChartContext): void;
```

Lines. Roles as barChart. Options: smooth, markers, labels, legend, xAxis and the axis options of columnChart.

#### pieChart {#pieChart}

```ts
function pieChart(ctx: ChartContext): void;
```

Pie. Roles: `category` and one measure. Options: labels, legend.

#### scatterChart {#scatterChart}

```ts
function scatterChart(ctx: ChartContext): void;
```

Scatter / bubble chart: roles `x`, `y`, optional `size` and `legend`; one point per row.

#### squarify {#squarify}

```ts
function squarify(nodes: TreeNode[], rect: Rect): (Rect & {
    i: number;
})[];
```

Squarified treemap layout (Bruls, Huizing, van Wijk).

#### treemapChart {#treemapChart}

```ts
function treemapChart(ctx: ChartContext): void;
```

Treemap (squarified): role `category` and one measure.

#### waterfallChart {#waterfallChart}

```ts
function waterfallChart(ctx: ChartContext): void;
```

Waterfall: role `category` and one measure (the change); option `total` adds a total bar.

### Interfaces

#### CellFormat {#CellFormat}

```ts
interface CellFormat {
    tone?: CellTone;
    fill?: boolean;
    icon?: CellIcon;
}
```

| Member | |
| --- | --- |
| `fill?` | Colour the cell's background with the tone instead of the text. |
| `icon?` | An icon before the value, in the tone's colour. |

#### ChartColumn {#ChartColumn}

```ts
interface ChartColumn {
    key: string;
    role: string;
    label: string;
    kind: 'dimension' | 'measure';
    ref?: string;
    type?: ColumnType;
    format?: Format;
    values: ArrayLike<Value>;
    fmt: (v: Value) => string;
}
```

One column of a result, tagged with the role it plays in a chart (category, series, values, …).

| Member | |
| --- | --- |
| `kind` | Dimensions are grouped by; measures are the numbers drawn. |
| `ref?` | Optional id of the field the column comes from (used to match totals to columns). |
| `fmt` | Formats one value for labels and tooltips. |

#### ChartContext {#ChartContext}

```ts
interface ChartContext {
    el: {
        innerHTML: string;
    } & Partial<Pick<HTMLElement, 'querySelector' | 'addEventListener'>>;
    width: number;
    height: number;
    options: Record<string, unknown>;
    data: ChartData;
    extra: Record<string, ChartData>;
    palette: number;
    selected(row: number): boolean | null;
    limit?: number;
    cellFormat?(column: ChartColumn, row: number): CellFormat | null | undefined;
    setOption?(key: string, value: unknown): void;
}
```

| Member | |
| --- | --- |
| `el` | Where to draw: anything with innerHTML (an element; a plain object in tests). |
| `extra` | Results of additional queries (table totals, a KPI card's trend). |
| `palette` | Number of palette colours (series classes cycle sk-c0 … sk-c{n-1}). |
| `selected` | null when nothing is selected, else whether row `i` is selected. |
| `limit?` | Row limit the data was fetched with (tables say when they hit it). |
| `cellFormat?` | Conditional formatting: how to show one measure value (a table cell, a matrix cell, a KPI card's value) of a column at a data row. The app decides from its own rules; null or undefined leaves the value plain. |
| `setOption?` | The reader changed an option by hand (a table's column widths): the app may keep it (the designer saves it with the visual). Without it the change lasts while the element does. |

#### ChartData {#ChartData}

```ts
interface ChartData {
    rows: number;
    columns: ChartColumn[];
    dims: ChartColumn[];
    measures: ChartColumn[];
    role(name: string): ChartColumn[];
}
```

| Member | |
| --- | --- |
| `role` | Columns of a role, in order. |

#### Rect {#Rect}

```ts
interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
```

#### RefLine {#RefLine}

```ts
interface RefLine {
    value?: number;
    stat?: 'avg' | 'median' | 'min' | 'max';
    label?: string;
    tone?: CellTone;
}
```

A reference line across the plot: a fixed value, or a statistic of the first series.

#### TreeNode {#TreeNode}

```ts
interface TreeNode {
    i: number;
    v: number;
}
```

### Types

#### CellIcon {#CellIcon}

```ts
type CellIcon = 'up' | 'down' | 'flat' | 'check' | 'cross' | 'warn' | 'dot';
```

#### CellTone {#CellTone}

```ts
type CellTone = 'good' | 'bad' | 'warn' | 'accent';
```

A value's tone: its text colour, or its background with `fill`. Status tones always come with the value itself.

<!-- api:end -->
