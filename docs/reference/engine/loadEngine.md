# loadEngine

<!-- api:start -->

```ts noplay
import { loadEngine } from 'smaltkit/engine';
function loadEngine(spec: string, options: LoadEngineOptions): Promise<Engine>;
```

Import the smaltdb client for `spec` and prepare its worker.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `spec` | `string` | The engine spec, from engineSpec. |
| `options` | `LoadEngineOptions` | The app's vendor folder, what relative URLs resolve against, the worker's file name, and the app's name for console messages. |

## Returns

`Promise<Engine>`: The engine: its spec, label and version, and `open()` for databases.

## Errors

- Error when the engine can't be imported; for an `npm` spec or a missing vendor copy, saying what to do.

<!-- api:end -->

## Examples

Open a database with the engine the page asks for:

```ts
import { engineSpec, loadEngine } from 'smaltkit/engine';

const engine = await loadEngine(engineSpec('myapp.engine'), { vendorUrl: 'vendor/smaltdb/', appName: 'myapp' });
console.log(engine.label, engine.version?.version);
const db = await engine.open('sales', { storage: 'opfs' });
```


A missing vendor copy is an error that says how to build it:

```ts
import { loadEngine } from 'smaltkit/engine';

try {
  await loadEngine('vendor', { vendorUrl: 'vendor/smaltdb/' });
} catch (e) {
  console.log((e as Error).message); // the vendor copy is missing at …: build it with `npm install`
}
```


## See also

- [`engineSpec`](./engineSpec) and [`resolveEngine`](./resolveEngine).
- [`applySteps`](../manifest/applySteps): load an environment's data.
