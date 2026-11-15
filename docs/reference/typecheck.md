# smaltkit/typecheck

Type checking for TypeScript tabs and cells, with smaltty's checker, in a worker: calls into the libraries the code uses, read from their declarations (`.d.ts`), with the names a page gives the code as `globals`.

Errors are warnings (`TypeWarning`: offsets, line, column, tsc's code and message), and every one is an error tsc
reports too. `typeCheckWorker(setup)` checks in a worker (`typecheck-worker.js`); a check replaced by a newer one before
it starts resolves to `null`. This module loads none of the checker: its code is loaded in the worker only. A re-check
after an edit takes about a millisecond, since the libraries stay parsed between checks.

The libraries can come prepared (`setup.prepared`: smaltty's `prepare()` buffer, written by the app's build), read in
place of parsing their text, so the first check is quicker. `{ warm: true }` gets the worker ready as soon as it
starts: start it while the page is idle. `setup.syntax: 'tolerant'` checks through a syntax error.

## Examples

```ts
import { typeCheckWorker } from 'smaltkit/typecheck';

const checker = typeCheckWorker(
  { files: { '/df/index.d.ts': dfTypes }, packages: { '@smaltdb/df': '/df/index.d.ts' }, globals: ['@smaltdb/df'] },
  { warm: true },
);
const warnings = await checker.check(code); // null if a newer check replaced it
```

For the same checks in the page's thread, see [`smaltkit/typechecker`](./typechecker).

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`typeCheckWorker`](./typecheck/typeCheckWorker) | A type checker for `setup` in a worker (`typecheck-worker.js`, beside this module, unless `workerUrl` names another). |

### Interfaces

#### TypeCheckSetup {#TypeCheckSetup}

```ts noplay
interface TypeCheckSetup {
    files: Record<string, string>;
    packages?: Record<string, string>;
    globals?: string[];
    prepared?: ArrayBuffer | Uint8Array;
    fallback?: string;
    syntax?: 'strict' | 'tolerant';
    checks?: readonly ('this' | 'overloads' | 'variables')[];
}
```

What the checked code can use.

| Member | |
| --- | --- |
| `files` | The libraries' files, path to text (`/df/index.d.ts` → its declarations). With `prepared`, the files it holds needn't be here (`{}`): their text is read only if the buffer can't be. |
| `packages?` | Import names to paths: `{ '@smaltdb/df': '/df/index.d.ts' }`. |
| `globals?` | Modules (paths or `packages` names) whose exports are in scope without an import, as the page gives them: a tab that runs smaltdf has `table` and `col`. |
| `prepared?` | The libraries prepared: smaltty's `prepare()` buffer for them, as an app's build writes it beside their text. The checker reads it in place of parsing their text, so the first check is quicker. A buffer this smaltty can't read (a build by another smaltty, kept by the browser from an earlier deploy) is ignored: the text in `files` is read instead, or, in typeCheckWorker's worker, the text fetched from `fallback`. |
| `fallback?` | An absolute URL of the libraries' text as a TypeCheckSetup (JSON: the app's `types.json`), which typeCheckWorker's worker fetches only if `prepared` can't be read; its files, packages and globals fill in what this setup lacks. typeChecker(), in the page's thread, fetches nothing: it reads `files`. |
| `syntax?` | How a syntax error in the checked code is taken (smaltty 0.14.0's `syntax` option). `'strict'`, the default: code with a syntax error gets no warnings, as before. `'tolerant'`: the statement the error is in is set aside and the error is a warning (a code under 2000, as tsc's syntax errors), and the rest of the code is checked. An app turns it on when it stops reporting syntax errors its own way, so none is shown twice. |
| `checks?` | More checks, each off unless named (smaltty 0.15.0's `checks` option): `'this'`, a method's `this` type is the value it is called on, so a model awaited from `fit(): Promise<this>` has its members checked; `'overloads'`, an argument count no overload of a function takes; `'variables'`, an annotated variable whose value can't be assigned to it. An app turns each on once the code it checks has none of the errors it finds. |

#### TypeCheckWorker {#TypeCheckWorker}

```ts noplay
interface TypeCheckWorker {
    check(code: string): Promise<TypeWarning[] | null>;
    close(): void;
}
```

A type checker in a worker.

| Member | |
| --- | --- |
| `check` | The code's warnings. A check that a newer one replaces before it starts resolves to null, so an app can check on every edit and show only the latest. |
| `close` | Stops the worker. |

#### TypeWarning {#TypeWarning}

```ts noplay
interface TypeWarning {
    start: number;
    end: number;
    line: number;
    column: number;
    code: number;
    message: string;
}
```

An error in the checked code, as a warning: where (offsets, and a 1-based line and column) and what.

| Member | |
| --- | --- |
| `code` | tsc's code for the same error (2339: no such property, 2345: an argument's type, …). |

### Types

#### TypeCheckReply {#TypeCheckReply}

```ts noplay
type TypeCheckReply = {
    id: number;
    warnings: TypeWarning[];
} | {
    id: number;
    error: string;
};
```

What the worker sends back: a check's warnings, or why it couldn't check.

#### TypeCheckRequest {#TypeCheckRequest}

```ts noplay
type TypeCheckRequest = {
    kind: 'setup';
    setup: TypeCheckSetup;
} | {
    kind: 'check';
    id: number;
    code: string;
} | {
    kind: 'warm';
};
```

What the page sends the worker. `warm`: get ready while the page is idle (read the prepared libraries, and check
nothing), so the first check is quick; it has no reply.

<!-- api:end -->
