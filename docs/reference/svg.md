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

#### arc {#arc}

```ts
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string;
```

SVG path for an annular sector (angles in radians, 0 = 12 o'clock, clockwise).

#### band {#band}

```ts
function band(n: number, r0: number, r1: number, pad?: number, outer?: number): Band;
```

A band scale over `n` slots in [r0, r1]. `pad` is the inner gap as a fraction of the step.

#### divColor {#divColor}

```ts
function divColor(t: number): string;
```

A diverging color: t in [-1, 1].

#### esc {#esc}

```ts
function esc(s: unknown): string;
```

#### linear {#linear}

```ts
function linear(lo: number, hi: number, r0: number, r1: number, opts?: {
    zero?: boolean;
    nice?: boolean;
    count?: number;
}): Linear;
```

#### linePath {#linePath}

```ts
function linePath(pts: [
    number,
    number
][], smooth?: boolean): string;
```

Monotone-ish smooth path through points (Catmull-Rom with tension), or straight segments.

#### logScale {#logScale}

```ts
function logScale(lo: number, hi: number, r0: number, r1: number): Linear;
```

A log-10 scale over [lo, hi] (both > 0): ticks at 1, 10, 100… (with 2 and 5 between when there are few decades).

#### niceTicks {#niceTicks}

```ts
function niceTicks(lo: number, hi: number, count?: number): {
    ticks: number[];
    min: number;
    max: number;
};
```

"Nice" tick values covering [lo, hi].

#### rescale {#rescale}

```ts
function rescale(s: Linear, r0: number, r1: number): Linear;
```

The same kind of scale over a new range (for laying out once the margins are known).

#### seqColor {#seqColor}

```ts
function seqColor(t: number): string;
```

A color between the theme's sequential ramp ends, as a CSS `color-mix()`. t in [0, 1].

#### textWidth {#textWidth}

```ts
function textWidth(s: string, fontPx: number): number;
```

Rough text width for layout (avoids measuring the DOM on every render).

#### timeTicks {#timeTicks}

```ts
function timeTicks(lo: number, hi: number, count?: number): {
    ticks: number[];
    pattern: string;
};
```

Calendar ticks between two times (ms, UTC): whole days, weeks, months, quarters or years, about `count` of them,
with the date pattern that suits the step ("YYYY", "MMM YYYY", "D MMM").

#### timeValue {#timeValue}

```ts
function timeValue(v: unknown): number;
```

A date or time value as milliseconds (UTC), or NaN: ISO strings ("2025-03-01", "2025-03"), epoch numbers.

#### toNum {#toNum}

```ts
function toNum(v: unknown): number;
```

#### truncate {#truncate}

```ts
function truncate(s: string, maxPx: number, fontPx: number): string;
```

#### valueScale {#valueScale}

```ts
function valueScale(lo: number, hi: number, r0: number, r1: number, opts?: {
    count?: number;
    log?: boolean;
    min?: number;
    max?: number;
}): Linear;
```

A value axis: linear (from zero unless `min` is given) or, with `log` and positive values, log 10. `min` and `max`
fix the ends; the nice ticks inside them are kept.

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
