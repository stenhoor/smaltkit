/**
 * A module's instance and the memory it works in, imported as `env.memory` (ModuleBuilder's `memory()`). When a call
 * needs more room, reserve() makes a new, larger memory and a new instance on it: never `memory.grow`, which detaches
 * the memory's old ArrayBuffer. Once any ArrayBuffer is detached, V8 compiles some typed-array loops in the whole
 * process or worker with more checks, for good: a loop of `s += v[i] · c + 0.5` over one Float64Array took 9–10 ms
 * before a grow and 21–37 ms after, measured in Node 22 (a loop over two arrays timed the same). A new memory detaches
 * nothing; the old one is simply dropped.
 */
export class Room<E> {
  readonly #module: WebAssembly.Module;
  #exports!: E;
  #f64!: Float64Array;

  /** @param module A compiled module that imports its memory as `env.memory`. */
  constructor(module: WebAssembly.Module) {
    this.#module = module;
    this.#instantiate(1);
  }

  /** The instance's exports. */
  get exports(): E {
    return this.#exports;
  }

  /** The whole memory, as f64. */
  get f64(): Float64Array {
    return this.#f64;
  }

  /**
   * At least `bytes` of memory. Where there was less, a new memory and instance: it starts at zero, and what the old
   * one held is not copied.
   * @param bytes The bytes the next call needs.
   * @returns A view, as f64, of the whole memory.
   */
  reserve(bytes: number): Float64Array {
    if (this.#f64.byteLength < bytes) this.#instantiate(Math.ceil(bytes / 65536));
    return this.#f64;
  }

  #instantiate(pages: number): void {
    const memory = new WebAssembly.Memory({ initial: pages });
    this.#exports = new WebAssembly.Instance(this.#module, { env: { memory } }).exports as unknown as E;
    this.#f64 = new Float64Array(memory.buffer);
  }
}
