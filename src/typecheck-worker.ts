// The type checker's worker (typeCheckWorker in typecheck.ts): a setup, then checks, answered in order. A setup whose
// prepared libraries this smaltty can't read is completed first from its `fallback` (the libraries' text, fetched), so
// requests wait for it.
import type { TypeCheckRequest, TypeCheckSetup } from './typecheck.js';
import { preparedReadable, typeCheckHandler } from './typechecker.js';

/** The worker's global scope, as much of it as this uses (the DOM's types describe a window's). */
const scope = self as unknown as { onmessage: (e: MessageEvent<TypeCheckRequest>) => void; postMessage(message: unknown): void };
const handle = typeCheckHandler();

/** The setup, with the fallback's text where the prepared libraries can't be read (a fetch that fails adds nothing). */
async function complete(setup: TypeCheckSetup): Promise<TypeCheckSetup> {
  if (setup.fallback === undefined || preparedReadable(setup)) return setup;
  try {
    const response = await fetch(setup.fallback);
    if (!response.ok) return setup;
    const text = (await response.json()) as Partial<TypeCheckSetup>;
    const { prepared: _, ...rest } = setup;
    return { ...rest, files: { ...text.files, ...setup.files }, packages: setup.packages ?? text.packages ?? {}, globals: setup.globals ?? text.globals ?? [] };
  } catch {
    return setup;
  }
}

let queue: Promise<void> = Promise.resolve();
scope.onmessage = (e) => {
  const request = e.data;
  if (request.kind === 'setup' && request.setup.fallback !== undefined) {
    const setup = complete(request.setup);
    queue = queue.then(async () => void handle({ kind: 'setup', setup: await setup }));
    return;
  }
  queue = queue.then(() => {
    const reply = handle(request);
    if (reply) scope.postMessage(reply);
  });
};
