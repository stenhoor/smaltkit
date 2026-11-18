# smaltkit/simd

WebAssembly SIMD modules written from TypeScript at run time: instructions, modules, f64x2 math, and a memory that
never grows.

A module is written instruction by instruction with `Code`, assembled with `ModuleBuilder`, and compiled with the
engine's own `WebAssembly.compile` where it is used. There is no compiler toolchain and no `.wasm` file: the same
source writes the same bytes. `simdSupport` says whether the engine has WebAssembly SIMD, and relaxed SIMD's fused
multiply-add, before anything is compiled.

WebAssembly has no SIMD exp or log, so `simdMath` writes its own, on two f64 lanes at once: exp within 1 unit in the
last place of `Math.exp`, log1p and log within 3 of `Math.log1p` and `Math.log` (measured over a million inputs per
range; the tests check it).

A module's memory comes from `Room`, which never calls `memory.grow`. Growing a memory detaches its old buffer, and
once any buffer is detached V8 compiles some typed-array loops in the whole page or worker with extra checks, for
good: in Node 22, a loop over one Float64Array took 9–10 ms before a grow and 21–37 ms after. Where a call needs more,
`Room` makes a new, larger memory and a new instance instead.

## Examples

Two pairs of numbers added lane by lane, through the module's memory:

```ts
import { Code, ModuleBuilder, Room, I32 } from 'smaltkit/simd';

// add(a, b): the two f64 at address b added to the two at address a, in place.
const c = new Code(2);
c.get(0).get(0).v128Load().get(1).v128Load().f64x2Add().v128Store();
const bytes = new ModuleBuilder().memory(1).func('add', [I32, I32], [], c).encode();

const room = new Room<{ add(a: number, b: number): void }>(await WebAssembly.compile(bytes));
const mem = room.reserve(32);
mem.set([1.5, 2, 10, 20]);
room.exports.add(0, 16);
console.log(mem[0], mem[1]);
```

```text
11.5 22
```

`simdSupport` validates a module of a few bytes for each feature, and compiles and runs nothing:

```ts
import { simdSupport } from 'smaltkit/simd';

console.log(JSON.stringify(simdSupport()));
```

```text
{"simd":true,"relaxed":true}
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### simdSupport {#simdSupport}

```ts noplay
function simdSupport(): SimdSupport;
```

Whether this engine has WebAssembly SIMD, and relaxed SIMD. Doesn't compile or run anything.

### Classes

#### Code {#Code}

```ts noplay
class Code {
    #private;
    readonly bytes: number[];
    constructor(params: number);
    local(type: ValueType): Local;
    encode(): number[];
    block(): this;
    loop(): this;
    end(): this;
    br(depth: number): this;
    brIf(depth: number): this;
    get(l: Local): this;
    set(l: Local): this;
    tee(l: Local): this;
    i32(n: number): this;
    i32Add(): this;
    i32Sub(): this;
    i32Mul(): this;
    i32Ne(): this;
    i32LtU(): this;
    i32GeU(): this;
    f64Load(offset?: number): this;
    f64Store(offset?: number): this;
    f64Add(): this;
    v128Load(offset?: number): this;
    v128Store(offset?: number): this;
    v128Zero(): this;
    f64x2Splat(): this;
    f64x2ExtractLane(lane: 0 | 1): this;
    f64x2Add(): this;
    f64x2Mul(): this;
    f64x2RelaxedMadd(): this;
    f64x2Const(a: number, b?: number): this;
    i64x2Const(a: bigint, b?: bigint): this;
    f64x2Sub(): this;
    f64x2Div(): this;
    f64x2Max(): this;
    f64x2Abs(): this;
    f64x2Neg(): this;
    f64x2Nearest(): this;
    f64x2Eq(): this;
    f64x2Lt(): this;
    f64x2Ge(): this;
    v128And(): this;
    v128Or(): this;
    v128Bitselect(): this;
    i64x2Shl(): this;
    i64x2ShrU(): this;
    i64x2Sub(): this;
}
```

#### ModuleBuilder {#ModuleBuilder}

```ts noplay
class ModuleBuilder {
    #private;
    memory(pages: number): this;
    func(name: string, params: ValueType[], results: ValueType[], code: Code): this;
    encode(): Uint8Array<ArrayBuffer>;
}
```

#### Room {#Room}

```ts noplay
class Room<E> {
    #private;
    constructor(module: WebAssembly.Module);
    get exports(): E;
    get f64(): Float64Array;
    reserve(bytes: number): Float64Array;
}
```

A module's instance and the memory it works in, imported as `env.memory` (ModuleBuilder's `memory()`). When a call
needs more room, reserve() makes a new, larger memory and a new instance on it: never `memory.grow`, which detaches
the memory's old ArrayBuffer. Once any ArrayBuffer is detached, V8 compiles some typed-array loops in the whole
process or worker with more checks, for good: a loop of `s += v[i] · c + 0.5` over one Float64Array took 9–10 ms
before a grow and 21–37 ms after, measured in Node 22 (a loop over two arrays timed the same). A new memory detaches
nothing; the old one is simply dropped.

### Constants

#### F64 {#F64}

```ts noplay
const F64 = 124;
```

#### I32 {#I32}

```ts noplay
const I32 = 127;
```

Value types.

#### V128 {#V128}

```ts noplay
const V128 = 123;
```

### Namespaces

#### encode {#encode}

`smaltkit/simd` exports `encode` as a namespace.

#### simdMath {#simdMath}

`smaltkit/simd` exports `simdMath` as a namespace.

### Interfaces

#### SimdSupport {#SimdSupport}

```ts noplay
interface SimdSupport {
    simd: boolean;
    relaxed: boolean;
}
```

What this engine's WebAssembly supports.

| Member | |
| --- | --- |
| `simd` | 128-bit SIMD: modules using `v128` instructions validate and run. |
| `relaxed` | Relaxed SIMD: `f64x2.relaxed_madd` and the other relaxed instructions are available. |

### Types

#### Local {#Local}

```ts noplay
type Local = number;
```

A local variable: its index in the function.

#### ValueType {#ValueType}

```ts noplay
type ValueType = typeof I32 | typeof F64 | typeof V128;
```

<!-- api:end -->
