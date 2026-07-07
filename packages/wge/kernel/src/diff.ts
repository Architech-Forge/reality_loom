/**
 * Diff primitive (WGE-1000.010, REF-1900.006).
 *
 * Diffs are ordered, traceable, snapshot-bound. The invariant: a Diff MUST
 * NOT be applied if its fromSnapshotId does not match the current execution
 * snapshot, unless conflict resolution is explicitly invoked (that
 * resolution runtime is WGE-1300.017, Milestone 3).
 */
import type { ROCDiagnostic, WGEDiff, WGEDiffOperation, WGESnapshot } from "@roc/types";
import { createDiagnostic } from "@roc/diagnostics";
import { generateId } from "@wge/wil";

export interface WGEDiffInput {
  worldId: string;
  fromSnapshotId: string;
  operations: WGEDiffOperation[];
  traceId: string;

  id?: string;
  toSnapshotId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/** REF-1900.006 required function. */
export function createDiff(input: WGEDiffInput): WGEDiff {
  for (const field of ["worldId", "fromSnapshotId", "traceId"] as const) {
    if (!input[field]) {
      throw new Error(`A Diff MUST be ${field === "traceId" ? "traceable" : "snapshot-bound"}: ${field} is required (WGE-1000.010)`);
    }
  }
  const diff: WGEDiff = {
    id: input.id ?? generateId("diff"),
    worldId: input.worldId,
    fromSnapshotId: input.fromSnapshotId,
    operations: [...input.operations],
    createdAt: input.createdAt ?? new Date().toISOString(),
    traceId: input.traceId
  };
  if (input.toSnapshotId !== undefined) diff.toSnapshotId = input.toSnapshotId;
  if (input.metadata !== undefined) diff.metadata = input.metadata;
  return diff;
}

/**
 * Snapshot-binding check (WGE-1000.010 invariant, kernel rejection
 * "Invalid Diff base Snapshot" in REF-1900.006). Returns a diagnostic
 * instead of throwing so the runtime can route it to conflict resolution.
 */
export function checkDiffBase(
  diff: WGEDiff,
  currentSnapshot: WGESnapshot
): ROCDiagnostic | undefined {
  if (diff.fromSnapshotId === currentSnapshot.id) return undefined;
  return createDiagnostic({
    code: "KERNEL_DIFF_BASE_MISMATCH",
    severity: "error",
    message: "Diff base snapshot does not match the current execution snapshot",
    affectedIds: [diff.id, diff.fromSnapshotId, currentSnapshot.id],
    reason: `diff is based on ${diff.fromSnapshotId} but the current snapshot is ${currentSnapshot.id}`,
    suggestedResolution:
      "Rebase the diff onto the current snapshot or explicitly invoke conflict resolution (WGE-1300.017)"
  });
}
