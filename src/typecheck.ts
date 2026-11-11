// Type checking for the apps' TypeScript tabs and cells, with smaltty's checker: calls into the libraries the code
// uses (smaltdf, smaltts), read from their declarations (.d.ts). Its errors are warnings: the code still runs. Every
// error it reports, tsc reports too; anything it doesn't model is quiet.
//
// typeChecker() checks in this thread; typeCheckWorker() in a worker (typecheck-worker.js), so typing stays smooth.
// Both keep the libraries parsed between checks, so a re-check after an edit parses only the code.
import { check, checkCache } from 'smaltty';

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

/** The path checked code is given: a tab or cell is one file, beside the libraries. */
const CODE_PATH = '/__code__.ts';

/** A checker for `setup`, in this thread: call it with the code, get its warnings. */
export function typeChecker(setup: TypeCheckSetup): (code: string) => TypeWarning[] {
  const files = new Map(Object.entries(setup.files));
  const cache = checkCache();
  const options = { roots: [CODE_PATH], packages: setup.packages ?? {}, globals: setup.globals ?? [], cache };
  return (code) => {
    files.set(CODE_PATH, code);
    return check(files, options).map((d) => {
      const before = code.slice(0, d.start).split('\n');
      return { start: d.start, end: d.start + d.length, line: before.length, column: before[before.length - 1]!.length + 1, code: d.code, message: d.message };
    });
  };
}

/** What the page sends the worker. */
export type TypeCheckRequest = { kind: 'setup'; setup: TypeCheckSetup } | { kind: 'check'; id: number; code: string };
/** What the worker sends back: a check's warnings, or why it couldn't check. */
export type TypeCheckReply = { id: number; warnings: TypeWarning[] } | { id: number; error: string };

/** The worker's side: answers requests in order. Exported for typecheck-worker.ts and for tests. */
export function typeCheckHandler(): (request: TypeCheckRequest) => TypeCheckReply | undefined {
  let checker: ((code: string) => TypeWarning[]) | undefined;
  return (request) => {
    if (request.kind === 'setup') {
      checker = typeChecker(request.setup);
      return undefined;
    }
    if (!checker) return { id: request.id, error: 'the type checker has no setup' };
    try {
      return { id: request.id, warnings: checker(request.code) };
    } catch (e) {
      return { id: request.id, error: e instanceof Error ? e.message : String(e) };
    }
  };
}

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
