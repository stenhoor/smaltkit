# createTimeline

<!-- api:start -->

```ts
import { createTimeline } from 'smaltkit/timeline';
function createTimeline(host: HTMLElement, options: TimelineOptions): Timeline;
```

A timeline of versions in `host`: a ruler with a tick per commit, a handle to drag, play, step and zoom.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `host` | `HTMLElement` | The element to draw in; the timeline fills its width. |
| `options` | `TimelineOptions` | The commits, the version shown, the axis, the theme and `onChange`. |

## Returns

`Timeline`: The timeline: set its value, commits, axis and theme, play and pause it, and destroy it.

<!-- api:end -->

## Examples

A timeline over two commits, by time:

```ts
import { createTimeline } from 'smaltkit/timeline';

const timeline = createTimeline(document.querySelector<HTMLElement>('#timeline')!, {
  commits: [
    { version: 1, time: Date.parse('2026-11-01'), author: 'ana', message: 'First load', size: 120 },
    { version: 2, time: Date.parse('2026-11-08'), author: 'ben', message: 'Fix totals', size: 3 },
  ],
  axis: 'time',
  onChange: (version, { final }) => {
    if (final) console.log('show version', version);
  },
});
timeline.play({ speed: 2 });
```


## Demo

New commits as they arrive: a timeline at the last version follows them.

```ts
import { createTimeline, type TimelineCommit } from 'smaltkit/timeline';

const commits: TimelineCommit[] = [];
const timeline = createTimeline(document.querySelector<HTMLElement>('#timeline')!, { commits });
function onCommit(c: TimelineCommit) {
  commits.push(c);
  timeline.setCommits(commits, { follow: true });
}
```


## See also

- [`createGraphView`](../graph/createGraphView): the graph each version shows.
