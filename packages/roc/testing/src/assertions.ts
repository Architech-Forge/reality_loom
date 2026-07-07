/**
 * Semantic Assertions (TEST-2500.004): verify platform meaning before
 * implementation shape. Each assertion throws with the violated requirement
 * when meaning is broken.
 */
import type {
  SLIProjectionOutput,
  WGEDiff,
  WGESnapshot,
  WILMessage,
  WILTrace,
  WGERuntimeOutput
} from "@roc/types";
import { validateWILMessage } from "@wge/wil";
import type { WGERuntime } from "@wge/runtime";

const fail = (assertion: string, detail: string): never => {
  throw new Error(`semantic assertion "${assertion}" failed: ${detail}`);
};

export const SemanticAssertions = {
  /** No Actor, no interaction. */
  actorRequired(message: Record<string, unknown> | WILMessage): void {
    const stripped = { ...message } as Record<string, unknown>;
    delete stripped.actor;
    if (validateWILMessage(stripped).valid) {
      fail("actor_required", "a message without an Actor was accepted");
    }
  },

  /** Snapshots are immutable. */
  snapshotImmutable(snapshot: WGESnapshot): void {
    const originalId = snapshot.id;
    try {
      (snapshot as { id: string }).id = "semantic_tamper";
    } catch {
      /* expected */
    }
    if (snapshot.id !== originalId) fail("snapshot_immutable", "a snapshot accepted mutation");
  },

  /** Simulation is isolated from Reality. */
  async simulationIsolated(runtime: WGERuntime, simulate: () => Promise<unknown>): Promise<void> {
    const before = runtime.currentSnapshot();
    await simulate();
    const after = runtime.currentSnapshot();
    if (before.id !== after.id || before.entityIndexHash !== after.entityIndexHash) {
      fail("simulation_isolated", `Reality moved ${before.id} → ${after.id} during simulation`);
    }
  },

  /** Commit creates a lineage-linked Snapshot. */
  commitCreatesSnapshot(output: WGERuntimeOutput, baseSnapshotId: string): void {
    if (output.outcome.status !== "success") {
      fail("commit_creates_snapshot", `commit outcome was ${output.outcome.status}`);
    }
    if (!output.snapshot || output.snapshot.parentSnapshotId !== baseSnapshotId) {
      fail("commit_creates_snapshot", "no lineage-linked snapshot was produced");
    }
  },

  /** A Diff explains the change: ordered operations, snapshot-bound, traceable. */
  diffExplainsChange(diff: WGEDiff | undefined): void {
    if (!diff) fail("diff_explains_change", "no diff was produced");
    if (diff && (diff.operations.length === 0 || !diff.fromSnapshotId || !diff.traceId)) {
      fail("diff_explains_change", "diff lacks operations, base snapshot, or trace causality");
    }
  },

  /** A Trace explains causality: every step carries a reason. */
  traceExplainsCausality(trace: WILTrace): void {
    if (trace.steps.length === 0) fail("trace_explains_causality", "trace has no steps");
    const unexplained = trace.steps.filter((s) => !s.reason);
    if (unexplained.length > 0) {
      fail("trace_explains_causality", `${unexplained.length} step(s) have no reason`);
    }
    if (!trace.actorId) fail("trace_explains_causality", "trace does not identify who initiated");
  },

  /** Exactly one primary in an active projection. */
  projectionHasSinglePrimary(output: SLIProjectionOutput): void {
    const primaries = output.composition.entities.filter((e) => e.role === "primary");
    if (primaries.length !== 1) {
      fail("has_single_primary", `found ${primaries.length} primary entities`);
    }
  },

  /** Possibility must never appear as Reality. */
  candidateIsNotReality(runtime: WGERuntime, candidateWorldId: string, entityId: string): void {
    const record = runtime.getCandidateWorld(candidateWorldId);
    if (!record) fail("candidate_is_not_reality", "candidate record missing");
    if (record?.status === "active" && runtime.realityWorld().entities[entityId]) {
      fail("candidate_is_not_reality", `entity "${entityId}" from an active candidate exists in Reality`);
    }
  },

  /** Protected data is redacted, and the redaction is visible. */
  permissionRedacts(inspection: { redactionCount: number } | { redacted: boolean }): void {
    const redacted =
      "redactionCount" in inspection ? inspection.redactionCount > 0 : inspection.redacted;
    if (!redacted) {
      fail("respects_permission", "expected protected data to be redacted, but nothing was");
    }
  },

  /** An AI proposal is not a committed action. */
  aiProposalNotCommitted(
    runtime: WGERuntime,
    proposal: { proposedMessages: WILMessage[] }
  ): void {
    for (const message of proposal.proposedMessages) {
      const targetId = message.target.id;
      if (targetId && message.intent.type === "create" && runtime.realityWorld().entities[targetId]) {
        fail("ai_proposal_not_committed", `proposed entity "${targetId}" already exists in Reality`);
      }
    }
  }
};
