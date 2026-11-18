/**
 * A WebAssembly module: functions, a memory it imports, and exports (the WebAssembly Core Specification, section
 * 5.5, "Modules"), written from TypeScript at run time.
 */
import type { Code } from './code.js';
import { name, section, u32, vec, type ValueType } from './encode.js';

interface Func {
  name: string;
  params: ValueType[];
  results: ValueType[];
  code: Code;
}

export class ModuleBuilder {
  readonly #funcs: Func[] = [];
  #memoryPages = 0;

  /**
   * A memory of at least `pages` 64 KiB pages, imported as `env.memory`: JavaScript gives the instance one, and a
   * larger one with a new instance where it needs more (Room), never growing it.
   */
  memory(pages: number): this {
    this.#memoryPages = pages;
    return this;
  }

  /** A function, exported under `name`. */
  func(name: string, params: ValueType[], results: ValueType[], code: Code): this {
    this.#funcs.push({ name, params, results, code });
    return this;
  }

  /** The module's bytes: header, then the type, import, function, export and code sections, in the order required. */
  encode(): Uint8Array<ArrayBuffer> {
    const types = vec(this.#funcs.map((f) => [0x60, ...vec(f.params.map((t) => [t])), ...vec(f.results.map((t) => [t]))]));
    const funcs = vec(this.#funcs.map((_, i) => u32(i)));
    const exports = vec([
      ...this.#funcs.map((f, i) => [...name(f.name), 0x00, ...u32(i)]),
    ]);
    // The memory, imported: env.memory, kind 2 (memory), limits with a minimum only.
    const imports = vec(this.#memoryPages ? [[...name('env'), ...name('memory'), 0x02, 0x00, ...u32(this.#memoryPages)]] : []);
    const bytes = [
      0x00, 0x61, 0x73, 0x6d, // "\0asm"
      0x01, 0x00, 0x00, 0x00, // version 1
      ...section(1, types),
      ...(this.#memoryPages ? section(2, imports) : []),
      ...section(3, funcs),
      ...section(7, exports),
      ...section(10, vec(this.#funcs.map((f) => f.code.encode()))),
    ];
    return Uint8Array.from(bytes);
  }
}
