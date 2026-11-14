# resolveEngine

<!-- api:start -->

```ts
import { resolveEngine } from 'smaltkit/engine';
function resolveEngine(spec: string, vendorUrl: string | URL, baseUrl: string | URL): EngineLocation;
```

Where an engine spec loads from. Pure: no network, no globals beyond URL.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `spec` | `string` | `vendor` (or `''`), `npm`, `npm@<version>`, or a folder's URL. |
| `vendorUrl` | `string \| URL` | The app's vendor copy, for `vendor`. |
| `baseUrl` | `string \| URL` | What relative URLs resolve against. |

## Returns

`EngineLocation`: The folder the client and worker load from (ending in `/`), and a label for the UI.

<!-- api:end -->

## Examples

```ts
import { resolveEngine } from 'smaltkit/engine';

const page = 'https://example.com/app/';
for (const spec of ['vendor', 'npm', 'npm@0.8.3', 'https://cdn.example.com/smaltdb/dist', '../builds/smaltdb']) {
  console.log(resolveEngine(spec, 'vendor/smaltdb/', page));
}
```

```text
{
  base: 'https://example.com/app/vendor/smaltdb/',
  label: 'bundled smaltdb'
}
{
  base: 'https://cdn.jsdelivr.net/npm/smaltdb@latest/dist/',
  label: 'smaltdb@latest (npm)'
}
{
  base: 'https://cdn.jsdelivr.net/npm/smaltdb@0.8.3/dist/',
  label: 'smaltdb@0.8.3 (npm)'
}
{
  base: 'https://cdn.example.com/smaltdb/dist/',
  label: 'https://cdn.example.com/smaltdb/dist/'
}
{
  base: 'https://example.com/builds/smaltdb/',
  label: 'https://example.com/builds/smaltdb/'
}
```

## See also

- [`loadEngine`](./loadEngine): loads from there.
- [`engineSpec`](./engineSpec).
