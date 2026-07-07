/**
 * WIL outcome construction (WIL-001.007, REF-1900.005).
 *
 * Every WIL message MUST produce an outcome. Rejected is not an error —
 * a rejection is a successful application of World Truth.
 */
import type { WILDiagnostic, WILOutcome, WILOutcomeStatus } from "@roc/types";
import { WIL_OUTCOME_STATUSES } from "@roc/types";

export interface WILOutcomeInput {
  status: WILOutcomeStatus;
  messageId: string;
  traceId: string;

  worldDiffId?: string;
  snapshotId?: string;
  candidateWorldId?: string;
  diagnostics?: WILDiagnostic[];
  metadata?: Record<string, unknown>;
}

/** REF-1900.005 required function. */
export function createOutcome(input: WILOutcomeInput): WILOutcome {
  if (!WIL_OUTCOME_STATUSES.includes(input.status)) {
    throw new Error(
      `Invalid outcome status ${JSON.stringify(input.status)}; must be one of: ${WIL_OUTCOME_STATUSES.join(" | ")}`
    );
  }
  if (!input.messageId) throw new Error("An outcome MUST reference its messageId (WIL-001.007)");
  if (!input.traceId) throw new Error("An outcome MUST reference its traceId (WIL-001.007)");

  const outcome: WILOutcome = {
    status: input.status,
    messageId: input.messageId,
    traceId: input.traceId
  };
  if (input.worldDiffId !== undefined) outcome.worldDiffId = input.worldDiffId;
  if (input.snapshotId !== undefined) outcome.snapshotId = input.snapshotId;
  if (input.candidateWorldId !== undefined) outcome.candidateWorldId = input.candidateWorldId;
  if (input.diagnostics !== undefined) outcome.diagnostics = input.diagnostics;
  if (input.metadata !== undefined) outcome.metadata = input.metadata;
  return outcome;
}
