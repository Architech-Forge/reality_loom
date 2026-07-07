/**
 * World Physics types.
 *
 * Volume 1400 — WGE-1400.002 (Events), WGE-1400.003 (Pipeline), WGE-1400.004
 * – WGE-1400.011 (the eight laws), WGE-1400.012 (Relevance Fields),
 * WGE-1400.013 (Effects), WGE-1400.014 (Trace), WGE-1400.015 (Diagnostics),
 * WGE-1400.017 (Federation), WGE-1400.019 (Recomposition Triggers).
 * Interfaces are transcribed from the Codex verbatim wherever specified.
 */
import type { Confidence, WGETimestamp } from "./primitives.js";
import type { WGEDiffOperation } from "./wge.js";
import type { WILContext, WILTraceStep } from "./wil.js";

/** WGE-1400.002 — Physics Event Model. Invalid without origin, actor, snapshot, trace. */
export interface WGEPhysicsEvent {
  id: string;

  worldId: string;
  snapshotId: string;

  originEntityId: string;

  type: string;

  actorId: string;
  messageId?: string;
  traceId: string;

  magnitude: number; // 0.0 to 1.0
  confidence: Confidence; // 0.0 to 1.0

  occurredAt: WGETimestamp;

  payload?: Record<string, unknown>;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.004 — Law 1, Locality. */
export interface WGEPhysicsLocalityRadius {
  originEntityId: string;
  maxDepth: number;
  minimumMagnitude: number;
  minimumConfidence: number;
  objectiveExpansion?: number;
}

/** WGE-1400.005 — Law 2, Propagation. */
export interface WGEPropagationInput {
  event: WGEPhysicsEvent;
  currentEntityId: string;
  relationshipId: string;
  targetEntityId: string;

  incomingMagnitude: number;
  incomingConfidence: number;

  depth: number;
  context: WILContext;
}

export interface WGEPropagationOutput {
  targetEntityId: string;

  outgoingMagnitude: number;
  outgoingConfidence: number;

  relationshipWeight: number;
  relationshipConfidence: number;

  reason: string;

  blocked: boolean;
  blockedBy?: string[];
}

/** WGE-1400.006 — Law 3, Decay. No influence may propagate forever. */
export interface WGEDecayFunction {
  type: "linear" | "exponential" | "step" | "custom";

  baseRate: number;

  minimumMagnitude: number;
  minimumConfidence: number;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.007 — Law 4, Constraint Blocking. */
export interface WGEConstraintBlockingInput {
  eventId: string;
  path: string[];
  currentEntityId: string;
  targetEntityId: string;
  relationshipId: string;
  actorId: string;
  context: WILContext;
}

export interface WGEConstraintBlockingOutput {
  allowed: boolean;

  blockedByConstraintIds?: string[];
  blockedByLawIds?: string[];

  reason: string;

  traceStep: WILTraceStep;
}

/** WGE-1400.008 — Law 5, Objective Gravity. Objectives change what matters, not what exists. */
export interface WGEObjectiveGravity {
  objectiveId: string;

  originEntityIds: string[];

  magnitude: number;
  radius: number;
  decayRate: number;

  startedAt: WGETimestamp;
  expiresAt?: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.009 — Law 6, Confidence Transfer. Low confidence is never silently truth. */
export interface WGEConfidenceTransferInput {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipId: string;

  sourceConfidence: number;
  relationshipConfidence: number;
  eventConfidence: number;

  context: WILContext;
}

export interface WGEConfidenceTransferOutput {
  targetConfidence: number;
  reason: string;
  traceStep: WILTraceStep;
}

/** WGE-1400.010 — Law 7, Temporal Momentum. Worlds learn gradually. */
export interface WGETemporalMomentum {
  entityId: string;

  patternId: string;

  strength: number; // 0.0 to 1.0

  observedSince?: WGETimestamp;
  lastConfirmedAt?: WGETimestamp;

  decayRate: number;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.012 — Relevance Fields. Change relevance, never truth. */
export interface WGERelevanceField {
  id: string;

  worldId: string;
  snapshotId: string;

  source:
    | "objective"
    | "event"
    | "context"
    | "candidate_world"
    | "application"
    | "scheduler"
    | "ai";

  originEntityIds: string[];

  magnitude: number;
  confidence: Confidence;

  radius: number;
  decay: WGEDecayFunction;

  startedAt: WGETimestamp;
  expiresAt?: WGETimestamp;

  tags?: string[];

  metadata?: Record<string, unknown>;
}

/** WGE-1400.013 — Physics Effects. Proposals until committed. */
export interface WGEPhysicsEffect {
  id: string;

  eventId: string;
  worldId: string;
  snapshotId: string;

  targetEntityId?: string;
  targetRelationshipId?: string;

  type:
    | "relevance.changed"
    | "confidence.changed"
    | "priority.changed"
    | "relationship.strengthened"
    | "relationship.weakened"
    | "constraint.blocked"
    | "candidate.generated"
    | "recomposition.requested"
    | "diagnostic.generated";

  magnitude: number;
  confidence: Confidence;

  proposedDiffOperation?: WGEDiffOperation;

  reason: string;

  traceStepId: string;
}

/** WGE-1400.014 — Physics Trace Model. */
export interface WGEPhysicsTracePath {
  id: string;

  entityPath: string[];
  relationshipPath: string[];

  initialMagnitude: number;
  finalMagnitude: number;

  initialConfidence: number;
  finalConfidence: number;

  appliedLaws: string[];
  appliedConstraints: string[];

  blocked: boolean;
  blockedReason?: string;

  effects: string[];
}

export interface WGEPhysicsTrace {
  id: string;

  eventId: string;
  worldId: string;
  snapshotId: string;

  originEntityId: string;

  paths: WGEPhysicsTracePath[];

  summary: string;

  createdAt: WGETimestamp;
}

/** WGE-1400.015 — Physics Diagnostics. */
export interface WGEPhysicsDiagnostic {
  code: string;

  severity: "error" | "warning" | "info" | "optimization";

  message: string;

  reason: string;

  eventId?: string;
  entityIds?: string[];
  relationshipIds?: string[];
  lawIds?: string[];

  suggestedResolution?: string;

  traceId: string;
}

/** WGE-1400.019 — Recomposition Triggers. Physics says what matters; SLI decides how. */
export interface WGERecompositionTrigger {
  id: string;

  worldId: string;
  snapshotId: string;

  source: "physics" | "objective" | "law" | "traversal" | "candidate_world" | "application";

  affectedEntityIds: string[];

  reason: string;

  priority: "critical" | "high" | "normal" | "idle";

  traceId: string;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.017 — Federated World Physics (implementation deferred with federation). */
export interface WGEFederatedPhysicsEvent {
  id: string;

  sourceWorldId: string;
  targetWorldId: string;

  sourceEntityId: string;
  targetEntityId: string;

  relationshipId: string;

  originalEventId: string;
  traceId: string;

  magnitude: number;
  confidence: Confidence;

  metadata?: Record<string, unknown>;
}

/** WGE-1400.007 blocked path record (referenced by WGE-1300.009). */
export interface WGEPhysicsBlockedPath {
  path: string[];
  relationshipId?: string;
  blockedByConstraintIds?: string[];
  blockedByLawIds?: string[];
  reason: string;
}

export interface WGEPhysicsAffectedEntity {
  entityId: string;
  magnitude: number;
  confidence: Confidence;
  depth: number;
}

export interface WGEPhysicsAffectedRelationship {
  relationshipId: string;
  magnitude: number;
  confidence: Confidence;
}

/** WGE-1400.003 — Physics Output. */
export interface WGEPhysicsExecutionResult {
  eventId: string;
  worldId: string;
  snapshotId: string;

  affectedEntities: WGEPhysicsAffectedEntity[];
  affectedRelationships: WGEPhysicsAffectedRelationship[];

  blockedPaths: WGEPhysicsBlockedPath[];

  generatedDiffOperations: WGEDiffOperation[];

  recompositionTriggers: WGERecompositionTrigger[];

  trace: WGEPhysicsTrace;

  diagnostics?: WGEPhysicsDiagnostic[];
}
