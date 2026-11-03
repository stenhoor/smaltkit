# smaltkit

Shared browser code for the smalt apps: [smaltui](https://github.com/stenhoor/smaltui) (the SQL workbench) and
[smaltbi](https://github.com/stenhoor/smaltbi). Both run [smaltdb](https://github.com/stenhoor/smaltdb) in the browser
and need the same pieces around it; smaltkit holds those pieces once, in strict TypeScript, with type definitions.

## Modules

| Import | What it does |
| --- | --- |
| `smaltkit/urls` | Rewrites pasted data URLs (GitHub, Hugging Face file pages) to raw-file URLs a page can fetch, and explains CORS errors. |

Everything is also exported from `smaltkit`. Planned next: the smaltdb engine loader, the environment manifest format,
the dev server and vendor scripts, then the SQL editor and the virtualized grid
([smaltbi ADR 0005](https://github.com/stenhoor/smaltbi/blob/main/docs/adr/0005-smaltkit-and-smalt-brand.md)).

## Use it

smaltkit is not on npm yet. Depend on a commit of this repository:

```json
"dependencies": { "smaltkit": "github:stenhoor/smaltkit#<commit>" }
```

npm clones that commit and runs `prepare`, which builds `dist/`. Pin a full commit, not a branch, so installs are
repeatable, and update it deliberately. Once smaltkit is published, change the line to a version range
(`"smaltkit": "^0.1.0"`); imports stay the same.

```ts
import { normalizeDataUrl, corsHint } from 'smaltkit/urls';
```

The output is plain ES2022 modules with no dependencies, one file per module (`dist/urls.js`), so a page can load them
without a bundler: copy `node_modules/smaltkit/dist/` next to the app, or use a bundler that resolves the package.

## Develop

```bash
npm install          # builds dist/ (prepare)
```

```bash
npm run typecheck    # tsc, strict, over src/ and test/
```

```bash
npm test             # builds, then node --test against the built package
```

Sources are in `src/`; `dist/` is generated and not committed. Tests import the package by name (`smaltkit/urls`), so
they check what the apps get. Node 22.18 or later runs the `.ts` tests directly.

## License

MIT
