# resolveEngine

<!-- api:start -->

```ts noplay
import { resolveEngine } from 'smaltkit/engine';
function resolveEngine(spec: string, vendorUrl: string | URL, baseUrl: string | URL): EngineLocation;
```

Where an engine spec loads from. Pure: no network, no globals beyond URL.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `spec` | `string` | `vendor` (or `''`), or a folder's URL. |
| `vendorUrl` | `string \| URL` | The app's vendor copy, for `vendor`. |
| `baseUrl` | `string \| URL` | What relative URLs resolve against. |

## Returns

`EngineLocation`: The folder the client and worker load from (ending in `/`), and a label for the UI.

## Errors

- Error for `npm` and `npm@<version>`: engines are not loaded from a CDN.

<!-- api:end -->

## Examples

```ts
import { resolveEngine } from 'smaltkit/engine';

const page = 'https://example.com/app/';
for (const spec of ['vendor', 'https://cdn.example.com/smaltdb/dist', '../builds/smaltdb']) {
  console.log(resolveEngine(spec, 'vendor/smaltdb/', page));
}
try {
  resolveEngine('npm@0.8.3', 'vendor/smaltdb/', page);
} catch (e) {
  console.log((e as Error).message);
}
```

```text
{ base: 'https://example.com/app/vendor/smaltdb/', label: 'bundled smaltdb' }
{
  base: 'https://cdn.example.com/smaltdb/dist/',
  label: 'https://cdn.example.com/smaltdb/dist/'
}
{
  base: 'https://example.com/builds/smaltdb/',
  label: 'https://example.com/builds/smaltdb/'
}
the engine "npm@0.8.3" is not available: engines are not loaded from a CDN; use the app's bundled engine or an engine folder's URL
```

## See also

- [`loadEngine`](./loadEngine): loads from there.
- [`engineSpec`](./engineSpec).
