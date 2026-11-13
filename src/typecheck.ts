// Type checking for the apps' TypeScript tabs and cells, with smaltty's checker: calls into the libraries the code
// uses (smaltdf, smaltts), read from their declarations (.d.ts). Its errors are warnings: the code still runs. Every
// error it reports, tsc reports too; anything it doesn't model is quiet.
//
// typeCheckWorker() checks in a worker (typecheck-worker.js), so typing stays smooth; typeChecker() (in typechecker.ts,
// smaltkit/typechecker) checks in this thread. Both keep the libraries parsed between checks, so a re-check after an
// edit parses only the code. This module loads nothing of the checker: a page that checks in a worker loads the
// checker's code (smaltty/check) in the worker only.

/** What the checked code can use. */
export interface TypeCheckSetup {
  /** The libraries' files, path to text (`/df/index.d.ts` → its declarations). */
  files: Record<string, string>;
  /** Import names to paths: `{ '@smaltdb/df': '/df/index.d.ts' }`. */
  packages?: Record<string, string>;
  /**
   * Modules (paths or `packages` names) whose exports are in scope without an import, as the page gives them: a tab
   * that runs smaltdf has `table` and `col`.
   */
  globals?: string[];
}

/** An error in the checked code, as a warning: where (offsets, and a 1-based line and column) and what. */
export interface TypeWarning {
  start: number;
  end: number;
  line: number;
  column: number;
  /** tsc's code for the same error (2339: no such property, 2345: an argument's type, …). */
  code: number;
  message: string;
}

/** What the page sends the worker. */
export type TypeCheckRequest = { kind: 'setup'; setup: TypeCheckSetup } | { kind: 'check'; id: number; code: string };
/** What the worker sends back: a check's warnings, or why it couldn't check. */
export type TypeCheckReply = { id: number; warnings: TypeWarning[] } | { id: number; error: string };

/** A type checker in a worker. */
export interface TypeCheckWorker {
  /**
   * The code's warnings. A check that a newer one replaces before it starts resolves to null, so an app can check on
   * every edit and show only the latest.
   */
  check(code: string): Promise<TypeWarning[] | null>;
  /** Stops the worker. */
  close(): void;
}

/**
 * A type checker for `setup` in a worker (`typecheck-worker.js`, beside this module, unless `workerUrl` names
 * another). Throws where workers can't start; an app then does without warnings.
 */
export function typeCheckWorker(setup: TypeCheckSetup, options: { workerUrl?: string | URL } = {}): TypeCheckWorker {
  const worker = new Worker(options.workerUrl ?? new URL('./typecheck-worker.js', import.meta.url), { type: 'module' });
  let next = 0;
  let pending: { id: number; resolve: (w: TypeWarning[] | null) => void; reject: (e: Error) => void } | undefined;
  let waiting: { code: string; resolve: (w: TypeWarning[] | null) => void; reject: (e: Error) => void } | undefined;
  const send = () => {
    if (pending || !waiting) return;
    const { code, resolve, reject } = waiting;
    waiting = undefined;
    pending = { id: ++next, resolve, reject };
    worker.postMessage({ kind: 'check', id: pending.id, code } satisfies TypeCheckRequest);
  };
  worker.onmessage = (e: MessageEvent<TypeCheckReply>) => {
    const done = pending;
    if (!done || e.data.id !== done.id) return;
    pending = undefined;
    if ('error' in e.data) done.reject(new Error(e.data.error));
    else done.resolve(e.data.warnings);
    send();
  };
  worker.onerror = (e) => {
    const error = new Error(`the type checker's worker failed: ${e.message}`);
    pending?.reject(error);
    waiting?.reject(error);
    pending = waiting = undefined;
  };
  worker.postMessage({ kind: 'setup', setup } satisfies TypeCheckRequest);
  return {
    check(code) {
      return new Promise((resolve, reject) => {
        waiting?.resolve(null); // replaced before it started
        waiting = { code, resolve, reject };
        send();
      });
    },
    close() {
      worker.terminate();
      pending?.resolve(null);
      waiting?.resolve(null);
      pending = waiting = undefined;
    },
  };
}
