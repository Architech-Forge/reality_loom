/**
 * World Interaction Language types.
 *
 * Volume 800 — WIL-001.001 through WIL-001.010. Interfaces are transcribed
 * from the Codex verbatim wherever the Codex specifies them.
 */
import type { Confidence, WGETimestamp } from "./primitives.js";
import type { WILDiagnostic } from "./diagnostics.js";

/** WIL-001.001 — Message Envelope. */
export interface WILMessage {
  protocol: "wil";
  version: string;

  id: string;
  traceId: string;

  actor: WILActor;
  intent: WILIntent;
  target: WILTarget;
  context: WILContext;

  mode: WILExecutionMode;

  payload?: Record<string, unknown>;

  timestamp: WGETimestamp;

  extensions?: WILExtension[];
}

/** WIL-001.002 — Actor Model. */
export interface WILActor {
  id: string;

  type:
    | "human"
    | "ai"
    | "runtime"
    | "scheduler"
    | "application"
    | "automation"
    | "external_system"
    | "system";

  displayName?: string;

  authority: WILAuthority;

  metadata?: Record<string, unknown>;
}

export type WILActorType = WILActor["type"];

/** WIL-001.002 — Authority. */
export interface WILAuthority {
  authenticated: boolean;
  permissions: string[];
  scope?: string[];
}

/** WIL-001.003 — Intent Model. Intent is semantic, not an implementation command. */
export interface WILIntent {
  type:
    | "observe"
    | "create"
    | "modify"
    | "delete"
    | "traverse"
    | "project"
    | "simulate"
    | "validate"
    | "commit"
    | "rollback"
    | "compare"
    | "explain";

  reason?: string;

  objectiveId?: string;

  confidence?: Confidence;

  metadata?: Record<string, unknown>;
}

export type WILIntentType = WILIntent["type"];

/** WIL-001.004 — Target Model. WIL targets Worlds; it never targets UI. */
export interface WILTarget {
  kind:
    | "world"
    | "entity"
    | "relationship"
    | "aspect"
    | "law"
    | "capability"
    | "objective"
    | "traversal"
    | "snapshot"
    | "candidate_world"
    | "projection"
    | "transaction";

  id?: string;

  selector?: WILSelector;

  metadata?: Record<string, unknown>;
}

export type WILTargetKind = WILTarget["kind"];

/** WIL-001.004 — Selector. A selector MAY identify multiple targets. */
export interface WILSelector {
  type: "id" | "type" | "relationship" | "aspect" | "query" | "traversal";

  value: unknown;
}

/** WIL-001.005 — Execution Modes. */
export type WILExecutionMode = "observe" | "simulate" | "commit" | "replay";

/** WIL-001.006 — Context Model. A scoped evaluation frame, not global state. */
export interface WILContext {
  worldId: string;

  snapshotId?: string;

  candidateWorldId?: string;

  transactionId?: string;

  temporal?: {
    timestamp: WGETimestamp;
    timezone?: string;
  };

  permissions?: {
    scope: string[];
  };

  execution?: {
    deterministic: boolean;
    allowPartial: boolean;
    allowDeferred: boolean;
  };

  application?: Record<string, unknown>;
}

/** WIL-001.007 — Outcome Model. Rejected is not an error. */
export interface WILOutcome {
  status:
    | "success"
    | "rejected"
    | "deferred"
    | "partial"
    | "simulation"
    | "conflict"
    | "error";

  messageId: string;

  worldDiffId?: string;

  snapshotId?: string;

  candidateWorldId?: string;

  traceId: string;

  diagnostics?: WILDiagnostic[];

  metadata?: Record<string, unknown>;
}

export type WILOutcomeStatus = WILOutcome["status"];

/** WIL-001.008 — Trace Model. Trace is mandatory in WIL. */
export interface WILTrace {
  id: string;

  messageId: string;

  actorId: string;

  steps: WILTraceStep[];

  summary: string;

  createdAt: WGETimestamp;
}

export interface WILTraceStep {
  order: number;

  phase:
    | "received"
    | "authorized"
    | "validated"
    | "law_checked"
    | "physics_applied"
    | "traversed"
    | "diff_generated"
    | "committed"
    | "projected"
    | "completed";

  status: "passed" | "blocked" | "modified" | "skipped" | "failed";

  reason: string;

  relatedEntityIds?: string[];
  relatedLawIds?: string[];
  relatedPhysicsIds?: string[];
}

export type WILTracePhase = WILTraceStep["phase"];
export type WILTraceStepStatus = WILTraceStep["status"];

/**
 * WIL-001.001 — extensions field.
 *
 * A WIL extension may declare new protocol vocabulary. It may not bypass
 * authority, determinism, trace, or commit rules — hence the literal
 * `deterministic: true` requirement.
 */
export interface WILExtension {
  extensionId: string;

  namespace: string;

  version: string;

  description?: string;

  declares?: {
    intents?: string[];
    modes?: string[];
    targetKinds?: string[];
    contextKeys?: string[];
    outcomeKinds?: string[];
  };

  schemas?: {
    messagePayloadSchemas?: Record<string, WILJSONSchemaRef>;
    contextSchemas?: Record<string, WILJSONSchemaRef>;
    outcomeSchemas?: Record<string, WILJSONSchemaRef>;
  };

  compatibility?: {
    minWILVersion?: string;
    maxWILVersion?: string;
  };

  deterministic: true;
}

export interface WILJSONSchemaRef {
  schemaId: string;
  version: string;
  uri?: string;
}

/**
 * Runtime constant mirrors of the WIL unions, used by validators
 * (WIL-001.010 requires actor/intent/target/context/mode validation).
 */
export const WIL_ACTOR_TYPES: readonly WILActorType[] = [
  "human",
  "ai",
  "runtime",
  "scheduler",
  "application",
  "automation",
  "external_system",
  "system"
] as const;

export const WIL_INTENT_TYPES: readonly WILIntentType[] = [
  "observe",
  "create",
  "modify",
  "delete",
  "traverse",
  "project",
  "simulate",
  "validate",
  "commit",
  "rollback",
  "compare",
  "explain"
] as const;

export const WIL_TARGET_KINDS: readonly WILTargetKind[] = [
  "world",
  "entity",
  "relationship",
  "aspect",
  "law",
  "capability",
  "objective",
  "traversal",
  "snapshot",
  "candidate_world",
  "projection",
  "transaction"
] as const;

export const WIL_EXECUTION_MODES: readonly WILExecutionMode[] = [
  "observe",
  "simulate",
  "commit",
  "replay"
] as const;

export const WIL_OUTCOME_STATUSES: readonly WILOutcomeStatus[] = [
  "success",
  "rejected",
  "deferred",
  "partial",
  "simulation",
  "conflict",
  "error"
] as const;

export const WIL_TRACE_PHASES: readonly WILTracePhase[] = [
  "received",
  "authorized",
  "validated",
  "law_checked",
  "physics_applied",
  "traversed",
  "diff_generated",
  "committed",
  "projected",
  "completed"
] as const;

export const WIL_TRACE_STEP_STATUSES: readonly WILTraceStepStatus[] = [
  "passed",
  "blocked",
  "modified",
  "skipped",
  "failed"
] as const;

export const WIL_SELECTOR_TYPES: readonly WILSelector["type"][] = [
  "id",
  "type",
  "relationship",
  "aspect",
  "query",
  "traversal"
] as const;
