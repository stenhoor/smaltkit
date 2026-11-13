/**
 * The tile worker: fetches vector tiles, decodes them and builds their geometry off the main thread. Several run side
 * by side (basemap.ts). Messages: { id, url, z } in; { id, geometry } or { id, error } out; { cancel: id } aborts.
 */
import { buildTile, transferables } from './build.js';

const inflight = new Map<number, AbortController>();

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { id: number; url: string; z: number } | { cancel: number };
  if ('cancel' in msg) {
    inflight.get(msg.cancel)?.abort();
    return;
  }
  const ctl = new AbortController();
  inflight.set(msg.id, ctl);
  try {
    const res = await fetch(msg.url, { signal: ctl.signal });
    if (res.status === 204 || res.status === 404) {
      // No data here (open ocean in some tile sets): an empty tile.
      const geometry = buildTile(new Uint8Array(0), msg.z);
      (self as unknown as Worker).postMessage({ id: msg.id, geometry }, transferables(geometry));
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const geometry = buildTile(bytes, msg.z);
    (self as unknown as Worker).postMessage({ id: msg.id, geometry }, transferables(geometry));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, error: ctl.signal.aborted ? 'aborted' : String(err) });
  } finally {
    inflight.delete(msg.id);
  }
};
