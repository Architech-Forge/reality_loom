/**
 * Runtime types.
 *
 * Volume 1300 — WGE-1300.002 (Lifecycle), WGE-1300.003/.004 (Input/Output),
 * WGE-1300.007 (Transactions), WGE-1300.008 (Law Evaluation), WGE-1300.013
 * (Candidate Worlds), WGE-1300.015 (Scheduler), WGE-1300.016 (Replay),
 * WGE-1300.017 (Conflicts), WGE-1300.018 (Diagnostics). Interfaces are
 * transcribed from the Codex verbatim wherever the Codex specifies them.
 */
import type { WGETimestamp } from "./primitives.js";
import type {
  WGEDiff,
  WGEEvent,
  WGESelector,
  WGESnapshot
} from "./wge.js";
import type {
  WILContext,
  WILExecutionMode,
  WILIntent,
  WILMessage,
  WILOutcome,
  WILTarget,
  WILTrace,
  WILTraceStep
} from "./wil.js";

/** WGE-1300.002 — Lifecycle States. */
export type WGERuntimeLifecycleState =
  | "created"
  | "loading"
  | "ready"
  | "executing"
  | "suspended"
  | "recovering"
  | "shutting_down"
  | "stopped"
  | "failed";

/** WGE-1300.018 — Runtime Diagnostics. */
export interface WGERuntimeDiagnostic {
  code: string;

  severity: "error" | "warning" | "info" | "optimization";

  message: string;

  reason: string;

  relatedIds?: string[];

  suggestedResolution?: string;

  traceId: string;
}

/** WGE-1300.003 — Runtime Input Model. The primary input is a WIL message. */
export interface WGERuntimeInput {
  message: WILMessage;
  receivedAt: WGETimestamp;
  source?: string;
  metadata?: Record<string, unknown>;
}

/** WGE-1300.004 — Runtime Output Model. No Outcome or no Trace ⇒ invalid execution. */
export interface WGERuntimeOutput {
  messageId: string;
  outcome: WILOutcome;
  trace: WILTrace;

  diff?: WGEDiff;
  snapshot?: WGESnapshot;

  candidateWorldId?: string;

  emittedEvents?: WGEEvent[];

  diagnostics?: WGERuntimeDiagnostic[];

  metadata?: Record<string, unknown>;
}

/** WGE-1300.007 — Transaction Model. Every committed mutation occurs inside one. */
export interface WGETransaction {
  id: string;

  worldId: string;

  actorId: string;

  messageId: string;
  traceId: string;

  baseSnapshotId: string;

  mode: "commit" | "simulate";

  status:
    | "opened"
    | "validated"
    | "diff_generated"
    | "committed"
    | "rolled_back"
    | "rejected"
    | "failed";

  proposedDiff?: WGEDiff;

  resultingSnapshotId?: string;

  diagnostics?: WGERuntimeDiagnostic[];

  createdAt: WGETimestamp;
  completedAt?: WGETimestamp;
}

/** WGE-1300.008 — Law Evaluation Runtime. */
export interface WGELawEvaluationInput {
  worldId: string;
  snapshotId: string;
  actorId: string;
  messageId: string;
  target: WILTarget;
  intent: WILIntent;
  context: WILContext;
  proposedDiff?: WGEDiff;
}

export interface WGELawEvaluationOutput {
  status: "allowed" | "rejected" | "deferred" | "warning" | "requires_clarification";

  appliedLawIds: string[];

  blockedByLawIds?: string[];

  diagnostics?: WGERuntimeDiagnostic[];

  traceSteps: WILTraceStep[];
}

/** WGE-1300.013 — Candidate World Runtime. A branch of Reality; not Reality. */
export interface WGERuntimeCandidateWorld {
  id: string;

  baseWorldId: string;
  baseSnapshotId: string;

  currentCandidateSnapshotId: string;

  actorId: string;
  objectiveId?: string;

  createdFromMessageId: string;
  traceId: string;

  status: "active" | "expired" | "merged" | "discarded" | "failed";

  createdAt: WGETimestamp;
  expiresAt?: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** WGE-1300.017 — Conflict Resolution. The Runtime never silently overwrites Reality. */
export type WGEConflictOutcome =
  | "auto_resolved"
  | "requires_actor_resolution"
  | "rejected"
  | "rebased"
  | "deferred";

export interface WGEConflictInput {
  worldId: string;
  expectedSnapshotId: string;
  currentSnapshotId: string;
  proposedDiff: WGEDiff;
  actorId: string;
  traceId: string;
}

/** WGE-1300.015 — Scheduler Runtime. Time does not bypass causality. */
export interface WGEScheduledEvent {
  id: string;

  worldId: string;

  actorId: string;

  scheduleType: "time" | "interval" | "condition" | "external_event" | "background";

  intent: WILIntent;
  target: WILTarget;
  context: WILContext;

  nextRunAt?: WGETimestamp;

  status: "scheduled" | "running" | "completed" | "deferred" | "cancelled" | "failed";

  metadata?: Record<string, unknown>;
}

/** WGE-1300.016 — Replay Runtime. */
export interface WGEReplayInput {
  worldId: string;

  fromSnapshotId?: string;
  toSnapshotId?: string;

  eventIds?: string[];
  diffIds?: string[];

  mode: "inspect" | "verify" | "reconstruct" | "simulate_from_history";
}

/** WGE-1300.010 — Traversal Runtime (executed in Milestone 4). */
export interface WGETraversalRuntimeInput {
  traversalId: string;
  worldId: string;
  snapshotId: string;
  actorId: string;
  context: WILContext;
  entryOverride?: WGESelector;
  executionMode: WILExecutionMode;
}

export interface WGETraversalBlockedPath {
  entityId: string;
  relationshipId?: string;
  blockedByLawId?: string;
  reason: string;
}

export interface WGETraversalRuntimeOutput {
  traversalId: string;

  visitedEntityIds: string[];
  visitedRelationshipIds: string[];

  collectedEntityIds: string[];

  blockedPaths: WGETraversalBlockedPath[];

  appliedLawIds: string[];

  confidence: number;

  traceSteps: WILTraceStep[];

  diagnostics?: WGERuntimeDiagnostic[];
}

/** Trace bundle every runtime execution persists (WGE-1300.004). */
export interface WGERuntimeTraceStore {
  byTraceId: Record<string, WILTrace>;
}
