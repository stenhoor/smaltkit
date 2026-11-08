// TypeScript for the apps' TypeScript tabs and cells, with smaltty (stenhoor/smaltty): types are replaced by spaces,
// so the JavaScript keeps every line and column of what was written, and an error points where the user typed.
// TypeScript's rules: an import of something that is only a type says `type`, and code that would make code of its own
// (enums, namespaces with values, parameter properties, `<T>x`) is refused with a SyntaxError that says what to write
// instead. Type checking against smaltdf comes later, here too.
//
// smaltty is ours and has no dependencies. The build copies it into dist/smaltty/, so this module loads it with a
// relative import, in a page, without a bundler.
import smaltty, { ParseError, strip, type Transpiler, type TranspileOptions } from 'smaltty';

export type { Transpiler, TranspileOptions };

/** A SyntaxError in TypeScript, or code that can't be stripped: `line` and `column` (1-based) say where. */
export const TypeScriptSyntaxError = ParseError;

/** JavaScript for TypeScript `code`: its types replaced by spaces. Throws a TypeScriptSyntaxError. */
export function stripTypes(code: string, options: { filename?: string } = {}): string {
  return strip(code, options.filename === undefined ? {} : { fileName: options.filename });
}

/** The same, as a Transpiler (`{ name, version, transpile }`), the shape an app takes when it offers more than one. */
export const typescriptTranspiler: Transpiler = smaltty;
