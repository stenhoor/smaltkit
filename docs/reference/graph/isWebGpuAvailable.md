# isWebGpuAvailable

<!-- api:start -->

```ts noplay
import { isWebGpuAvailable } from 'smaltkit/graph';
function isWebGpuAvailable(): Promise<boolean>;
```

True when the browser exposes WebGPU and an adapter can be obtained: whether createGraphView can work here.

## Returns

`Promise<boolean>`: A promise of whether WebGPU is there.

<!-- api:end -->

## Examples

Offer the graph view only where it can run:

```ts
import { isWebGpuAvailable } from 'smaltkit/graph';

const button = document.querySelector<HTMLButtonElement>('#show-graph')!;
button.hidden = !(await isWebGpuAvailable());
```


## See also

- [`createGraphView`](./createGraphView).
