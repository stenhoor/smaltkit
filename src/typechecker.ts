// smaltty's checker in this thread: typeChecker() for a page that checks where it runs, and typeCheckHandler() for the
// worker (typecheck-worker.ts). It loads the checker (smaltty/check); typecheck.ts, which a page loads to check in a
// worker, doesn't.
import { check, checkCache } from 'smaltty/check';
import type { TypeCheckReply, TypeCheckRequest, TypeCheckSetup, TypeWarning } from './typecheck.js';

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
