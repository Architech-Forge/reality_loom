/**
 * @wge/compiler — Minimal World Compiler.
 *
 * REF-1900.009. Volume 1200 (WGE-1200.001 – WGE-1200.020) is the governing
 * specification. Developers describe reality; the compiler verifies reality;
 * the runtime evolves reality; SLI projects reality (WGE-1200.001).
 */
export { compileWorld, type WGECompileInput, type WGECompileResult, type WGEWIR } from "./compile.js";
export { materializeWorld, type MaterializeResult } from "./materialize.js";
export {
  importWILMessages,
  type WILImportInput,
  type WILSemanticImportResult
} from "./wil-import.js";
