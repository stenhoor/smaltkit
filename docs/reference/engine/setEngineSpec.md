# setEngineSpec

<!-- api:start -->

```ts noplay
import { setEngineSpec } from 'smaltkit/engine';
function setEngineSpec(storageKey: string, spec: string): void;
```

Remember an engine spec for later page loads ('vendor' or '' clears it). Where storage is blocked, nothing is kept.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `storageKey` | `string` | The localStorage key, as engineSpec reads it. |
| `spec` | `string` | The spec to keep. |

## Returns

`void`

<!-- api:end -->

## Examples

```ts
import { setEngineSpec, engineSpec } from 'smaltkit/engine';

setEngineSpec('myapp.engine', 'npm@0.8.3');
console.log(engineSpec('myapp.engine', ''));
setEngineSpec('myapp.engine', 'vendor');
console.log(engineSpec('myapp.engine', ''));
```


## See also

- [`engineSpec`](./engineSpec).
