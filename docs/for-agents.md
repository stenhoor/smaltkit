# smaltkit for agents

smaltkit is reusable components for the smaltworks applications, UI and more: one ES module per job, imported by its subpath
(`smaltkit/format`), or everything from `smaltkit`. It has no dependencies and loads in a page without a bundler.

- **Install:** smaltkit is not on npm yet. Depend on a full commit: `"smaltkit": "github:stenhoor/smaltkit#<commit>"`.
  npm builds `dist/` when it installs.
- **What runs where:** the text modules (`format`, `sql`, `cypher`, `markdown`, `pretty`, `svg`, `urls`, `typescript`,
  `typechecker`, `git`'s diff and ids, `grid`'s `exportRows`, `manifest`'s SQL helpers) are plain functions and run in
  Node or a page. The modules that draw (`charts`, `maps`, `table`, `grid`, `editor`, `controls`, `dom`, `graph`,
  `timeline`) need a DOM; `graph` needs WebGPU.
- **Drawing:** a chart, map or table renderer takes a `ChartContext` (the element, its size, options, and columns
  tagged with a role and a kind) and writes the element's `innerHTML` once. Load `smaltkit/ui.css` for styles, and
  restyle with `--sk-*` custom properties, never by overriding its classes.
- **smaltdb:** `smaltkit/engine` loads the engine at run time and uses smaltdb's types only; `smaltdb` is an optional
  peer dependency.
- **TypeScript:** `stripTypes` from `smaltkit/typescript` refuses code that would make code of its own (enums,
  namespaces with values, parameter properties, `<T>x`): write an object, a module, a field and `as T` instead. Type
  errors from `smaltkit/typecheck` are warnings, and code runs anyway.

Every example below that shows its output is a test: it runs against the built package in CI and prints what it shows.
