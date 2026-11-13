// What smaltkit/typescript gives as `smaltty`: smaltty's stripping path and its binder, without its checker (the
// checker's code is loaded by smaltkit/typecheck's worker only). Not a module of its own: import `smaltty` from
// smaltkit/typescript.
export * from 'smaltty/strip';
export { default } from 'smaltty/strip';
export * from 'smaltty/bind';
export type { CheckCache, CheckOptions, Diagnostic, Expectation } from 'smaltty/check';
