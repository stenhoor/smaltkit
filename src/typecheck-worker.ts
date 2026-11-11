// The type checker's worker (typeCheckWorker in typecheck.ts): a setup, then checks, answered in order.
import { typeCheckHandler, type TypeCheckRequest } from './typecheck.js';

/** The worker's global scope, as much of it as this uses (the DOM's types describe a window's). */
const scope = self as unknown as { onmessage: (e: MessageEvent<TypeCheckRequest>) => void; postMessage(message: unknown): void };
const handle = typeCheckHandler();
scope.onmessage = (e) => {
  const reply = handle(e.data);
  if (reply) scope.postMessage(reply);
};
