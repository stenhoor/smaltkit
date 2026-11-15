# engineSpec

<!-- api:start -->

```ts noplay
import { engineSpec } from 'smaltkit/engine';
function engineSpec(storageKey?: string, search?: string): string;
```

The engine spec for this page: `?engine=` if present, else the one saved under `storageKey` (see setEngineSpec),
else 'vendor'.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `storageKey?` | `string` | The localStorage key a choice is kept under, or none. |
| `search?` | `string` | The page's query string. Default: the page's own. |

## Returns

`string`: The spec. Storage that can't be read (private mode) counts as nothing saved.

<!-- api:end -->

## Examples

```ts
import { engineSpec } from 'smaltkit/engine';

console.log(engineSpec(undefined, '?engine=npm@0.8.3'));
console.log(engineSpec(undefined, '?view=table'));
```

```text
npm@0.8.3
vendor
```

## Demo

An engine picker: the page's choice, kept for the next visit.

```ts
import { engineSpec, setEngineSpec, loadEngine } from 'smaltkit/engine';

const picker = document.querySelector<HTMLSelectElement>('#engine')!;
picker.value = engineSpec('myapp.engine');
picker.addEventListener('change', () => {
  setEngineSpec('myapp.engine', picker.value);
  location.reload();
});
const engine = await loadEngine(picker.value, { vendorUrl: 'vendor/smaltdb/', appName: 'myapp' });
```


## See also

- [`setEngineSpec`](./setEngineSpec).
- [`loadEngine`](./loadEngine).
