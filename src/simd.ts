/**
 * WebAssembly SIMD modules written from TypeScript at run time: an instruction writer (`Code`), a module builder
 * (`ModuleBuilder`), f64x2 exp, log1p and log (`simdMath`), the binary format's encodings (`encode`), a memory that
 * never grows (`Room`), and what the engine supports (`simdSupport`). No compiler toolchain and no `.wasm` file: the
 * same source writes the same bytes, which `WebAssembly.compile` compiles where they are used.
 */
export { Code, type Local } from './simd/code.js';
export { ModuleBuilder } from './simd/module.js';
export { Room } from './simd/room.js';
export { I32, F64, V128, type ValueType } from './simd/encode.js';
export { simdSupport, type SimdSupport } from './simd/support.js';
export * as encode from './simd/encode.js';
export * as simdMath from './simd/math.js';
