# smaltkit/svg

SVG helpers for charts: nice ticks, linear, log and band scales, calendar ticks, arcs, line paths, text measuring and colour ramps.

## Examples

```ts
import { niceTicks, linear, band, linePath, esc } from 'smaltkit/svg';

console.log(niceTicks(0, 97));
const y = linear(0, 100, 200, 0);
console.log(y(25), y(100));
const x = band(3, 0, 300, 0.2);
console.log(x.step, x.bandwidth);
console.log(linePath([[0, 0], [10, 20], [20, 5]]));
console.log(esc('<b>&</b>'));
```

```text
{ ticks: [ 0, 20, 40, 60, 80, 100 ], min: 0, max: 100 }
150 0
100 80
M0,0L10,20L20,5
&lt;b&gt;&amp;&lt;/b&gt;
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`arc`](./svg/arc) | SVG path for an annular sector (angles in radians, 0 = 12 o'clock, clockwise), for pies, donuts and gauges. |
| [`band`](./svg/band) | A band scale over `n` slots in [r0, r1], for bars. |
| [`divColor`](./svg/divColor) | A diverging color: from `--sk-div-mid` at 0 towards `--sk-div-lo` (below 0) or `--sk-div-hi` (above). |
| [`esc`](./svg/esc) | Text escaped for HTML and SVG, in text and in attributes. |
| [`linear`](./svg/linear) | A linear scale from values in [lo, hi] to positions in [r0, r1]. |
| [`linePath`](./svg/linePath) | Monotone-ish smooth path through points (Catmull-Rom with tension), or straight segments. |
| [`logScale`](./svg/logScale) | A log-10 scale over [lo, hi] (both > 0): ticks at 1, 10, 100… (with 2 and 5 between when there are few decades). |
| [`niceTicks`](./svg/niceTicks) | "Nice" tick values covering [lo, hi]: steps of 1, 2 or 5 times a power of ten. |
| [`rescale`](./svg/rescale) | The same kind of scale over a new range (for laying out once the margins are known). |
| [`seqColor`](./svg/seqColor) | A color between the theme's sequential ramp ends (`--sk-seq-lo` and `--sk-seq-hi`), as a CSS `color-mix()`. |
| [`textWidth`](./svg/textWidth) | Rough text width for layout (avoids measuring the DOM on every render), from per-character widths of a sans serif. |
| [`timeTicks`](./svg/timeTicks) | Calendar ticks between two times (ms, UTC): whole days, weeks, months, quarters or years, about `count` of them, with the date pattern that suits the step ("YYYY", "MMM YYYY", "D MMM"). |
| [`timeValue`](./svg/timeValue) | A date or time value as milliseconds (UTC), or NaN: ISO strings ("2025-03-01", "2025-03"), epoch numbers. |
| [`toNum`](./svg/toNum) | A value as a number, for plotting. |
| [`truncate`](./svg/truncate) | Text cut to fit a width, with `…`, by textWidth's measure. |
| [`valueScale`](./svg/valueScale) | A value axis: linear (from zero unless `min` is given) or, with `log` and positive values, log 10. |

### Constants

#### r2 {#r2}

```ts
const r2: (n: number) => number;
```

### Interfaces

#### Band {#Band}

```ts
interface Band {
    (i: number): number;
    bandwidth: number;
    step: number;
}
```

#### Linear {#Linear}

```ts
interface Linear {
    (v: number): number;
    domain: [
        number,
        number
    ];
    range: [
        number,
        number
    ];
    ticks: number[];
    log?: boolean;
}
```

| Member | |
| --- | --- |
| `log?` | A log scale (from logScale). |

<!-- api:end -->
