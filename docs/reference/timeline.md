# smaltkit/timeline

A timeline for versions: a ruler of commits by time or by number, dragged, zoomed or stepped with the keyboard, with play, a tooltip per commit (time, author, message) and `onChange`.

It knows nothing of what the versions are, only commits, and reports the version to show through `onChange`. Styled
through `--sk-tl-*`, then `--sk-*`.

## Examples

```ts
import { createTimeline } from 'smaltkit/timeline';

const timeline = createTimeline(document.querySelector('#timeline')!, {
  commits: [
    { version: 1, time: Date.parse('2026-11-01'), author: 'ana', message: 'First load', size: 120 },
    { version: 2, time: Date.parse('2026-11-08'), author: 'ben', message: 'Fix totals', size: 3 },
  ],
  axis: 'time',
  onChange: (version, { final }) => { if (final) show(version); },
});
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`createTimeline`](./timeline/createTimeline) | A timeline of versions in `host`: a ruler with a tick per commit, a handle to drag, play, step and zoom. |

### Interfaces

#### Timeline {#Timeline}

```ts
interface Timeline {
    readonly value: number;
    setValue(version: number): void;
    setCommits(commits: readonly TimelineCommit[], options?: {
        follow?: boolean;
    }): void;
    setAxis(axis: Axis): void;
    setTheme(theme: 'light' | 'dark'): void;
    play(options?: {
        speed?: number;
    }): void;
    pause(): void;
    readonly playing: boolean;
    destroy(): void;
}
```

| Member | |
| --- | --- |
| `setValue` | Show a version (snapped to the last commit at or before it); does not call onChange. |
| `setCommits` | Replace the commits. With `follow`, a timeline that was at the last version moves to the new last one. |
| `play` | Step through the versions at `speed` commits per second (default 8), from the start when at the end. |

#### TimelineCommit {#TimelineCommit}

```ts
interface TimelineCommit {
    version: number;
    time: number;
    author?: string;
    message?: string;
    size: number;
}
```

| Member | |
| --- | --- |
| `time` | Epoch milliseconds. |
| `size` | Number of changes in the commit. |

#### TimelineOptions {#TimelineOptions}

```ts
interface TimelineOptions {
    commits: readonly TimelineCommit[];
    value?: number;
    axis?: Axis;
    theme?: 'light' | 'dark';
    onChange?: (version: number, info: {
        final: boolean;
    }) => void;
}
```

| Member | |
| --- | --- |
| `commits` | Ascending by version; may be empty. |
| `value?` | The version shown; defaults to the last (or 0). |
| `axis?` | 'commit' (default): even spacing per commit. 'time': by real time, so gaps show quiet periods. |
| `theme?` | Without one, the timeline follows the system's colour scheme. |
| `onChange?` | Called as the value changes. `final` is false while dragging or playing, true on release, click, key, or play stop. |

### Types

#### Axis {#Axis}

```ts
type Axis = 'commit' | 'time';
```

The timeline's maths, free of the DOM: where each version sits on the ruler (by commit or by
time), the visible window and its zoom and pan limits, the nearest commit to a point, ticks
coalesced per pixel, and the spacing of date labels.

Positions are in "domain units" u: the point index on the commit axis (version 0 at u = 0, the
k-th commit at u = k + 1), epoch milliseconds on the time axis (version 0 just before the first
commit). A window [a, b] of u maps onto the ruler's inner width.

<!-- api:end -->
