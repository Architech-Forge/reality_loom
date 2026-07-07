/**
 * @wge/runtime — Minimal WGE Runtime.
 *
 * REF-1900.011. Build order position 10 (REF-1900.003).
 * Volume 1300 (WGE-1300.001 – WGE-1300.020) is the governing specification.
 *
 * The Runtime is not an application server. It is a causality engine for
 * Worlds (WGE-1300.001). Physics and traversal runtimes join in Milestone 4;
 * scheduler and full replay join with their volumes.
 */
export { WGERuntime, type WGERuntimeOptions } from "./runtime.js";
export { evaluateLaws, type LawEvaluationRequest } from "./laws.js";
// Condition evaluation lives in @wge/kernel (law primitives are kernel-owned;
// physics and runtime both consume it). Re-exported here for convenience.
export {
  evaluateCondition,
  resolveEntityPath,
  resolveValueRef,
  type ConditionScope
} from "@wge/kernel";
export { applyDiffOperations, type ApplyDiffResult } from "./apply-diff.js";
export { executeTraversal, type ExecuteTraversalInput } from "./traversal.js";
export { interpretIntent, affectedEntityIds, type IntentInterpretation } from "./intent.js";

// REF-1900.012 — Minimal Transaction Function. The transaction pipeline
// (open → validate → laws → diff → snapshot → outcome) lives inside
// WGERuntime.commit; this spec-named form executes one commit transaction.
import type { WILMessage as _WILMessage, WGERuntimeOutput as _WGERuntimeOutput } from "@roc/types";
import type { WGERuntime as _WGERuntime } from "./runtime.js";

export interface WGETransactionInput {
  runtime: _WGERuntime;
  message: _WILMessage;
}

export async function executeCommitTransaction(
  input: WGETransactionInput
): Promise<_WGERuntimeOutput> {
  return input.runtime.commit(input.message);
}
