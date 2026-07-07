/**
 * @roc/sdk — ROC Developer SDK.
 *
 * Volume 1800 (SDK-1800.001 – SDK-1800.024). Build order position 16.
 * Make the correct architecture the easiest path: builders emit canonical
 * definitions, clients talk to Reality through WIL, and nothing here can
 * bypass laws, authority, traces, or candidate isolation.
 */
export {
  WorldBuilder,
  EntityBuilder,
  RelationshipBuilder,
  LawBuilder,
  TraversalBuilder,
  WILBuilder,
  type WorldBuilderResult
} from "./builders.js";
export { Cond } from "./conditions.js";
export {
  createCompilerClient,
  createRuntimeClient,
  createProjectionClient,
  createCandidateClient,
  type CompilerClientInput,
  type WGECompilerClient,
  type WGERuntimeClient,
  type SLIProjectionClient,
  type WGECandidateWorldClient,
  type WGECandidateComparison
} from "./clients.js";
export { ROCSDKError, type ROCSDKErrorInput } from "./errors.js";

// Diagnostics SDK (SDK-1800.016) — the shared formatter lives in
// @roc/diagnostics; re-exported so the SDK is one-stop.
export {
  createDiagnostic,
  formatDiagnostic,
  hasErrors,
  hasWarnings,
  worstSeverity,
  toValidationResult,
  DiagnosticCollector
} from "@roc/diagnostics";
