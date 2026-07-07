/**
 * WGE Kernel primitive types.
 *
 * Volume 1000 — WGE-1000.001 through WGE-1000.013. Interfaces are transcribed
 * from the Codex verbatim wherever the Codex specifies them. Shapes the Codex
 * names but does not define (index types, WGEVisibility, WGELawCondition,
 * WGETraversalOutput) are given minimal serializable, deterministic forms and
 * are marked below.
 */
import type { Confidence, WGEID, WGETimestamp, Weight } from "./primitives.js";

/**
 * Canonical stores — authoritative World state, keyed by ID so duplicate IDs
 * are structurally impossible; kernel validation still checks key/value ID
 * agreement. Indexes (below) are derived acceleration structures rebuilt
 * from these stores; they are never authoritative truth.
 */
export type WGEEntityStore = Record<WGEID, WGEEntity>;
export type WGERelationshipStore = Record<WGEID, WGERelationship>;
export type WGELawStore = Record<WGEID, WGELaw>;
export type WGETraversalStore = Record<WGEID, WGETraversal>;

/** All JSON-serializable values. No functions, class instances, or non-deterministic predicates. */
export type WGEJSONValue =
  | string
  | number
  | boolean
  | null
  | WGEJSONValue[]
  | { [key: string]: WGEJSONValue };

/**
 * Derived indexes (canonical shapes; built and maintained by @wge/graph,
 * WGE-1100.006). Rebuildable from canonical World state.
 */
export interface WGEEntityIndex {
  byId: Record<string, WGEEntityIndexEntry>;

  byType: Record<string, string[]>;

  byAspectKind: Record<string, string[]>;
}

export interface WGEEntityIndexEntry {
  entityId: string;
  type: string;

  aspectKinds: string[];

  createdAt?: WGETimestamp;
  updatedAt?: WGETimestamp;
}

export interface WGEAspectIndex {
  byId: Record<string, WGEAspectIndexEntry>;

  byEntityId: Record<string, string[]>;

  byKind: Record<string, string[]>;
}

export interface WGEAspectIndexEntry {
  aspectId: string;
  entityId: string;
  kind: string;

  schemaVersion?: string;

  visibility?: WGEVisibility;
}

export interface WGERelationshipIndex {
  byId: Record<string, WGERelationshipIndexEntry>;

  byType: Record<string, string[]>;

  outgoingByEntityId: Record<string, string[]>;

  incomingByEntityId: Record<string, string[]>;
}

export interface WGERelationshipIndexEntry {
  relationshipId: string;

  type: string;

  fromEntityId: string;
  toEntityId: string;

  weight?: Weight;
  confidence?: Confidence;

  visibility?: WGEVisibility;
}

export interface WGETemporalIndex {
  snapshotsByWorldId: Record<string, string[]>;

  diffsBySnapshotId: Record<string, string[]>;

  eventsByEntityId: Record<string, string[]>;

  tracesByEntityId: Record<string, string[]>;
}

/** WGE-1000.002 — World Primitive. A World is also an Entity. */
export interface WGEWorld {
  id: WGEID;
  type: "world";

  name: string;
  version: string;

  rootEntityId: WGEID;

  entities: WGEEntityStore;
  relationships: WGERelationshipStore;
  laws: WGELawStore;
  traversals: WGETraversalStore;

  metadata?: Record<string, unknown>;
}

/** WGE-1000.003 — Entity Primitive. Everything is an Entity. */
export interface WGEEntity {
  id: WGEID;

  worldId: WGEID;

  type: string;

  aspects: WGEAspect[];

  lifecycle: WGEEntityLifecycle;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  version: number;

  metadata?: Record<string, unknown>;
}

export type WGEEntityLifecycle =
  | "created"
  | "active"
  | "suspended"
  | "archived"
  | "deleted";

/** WGE-1000.004 — Aspect Primitive. Entities own identity; Aspects own meaning. */
export interface WGEAspect {
  id: WGEID;

  entityId: WGEID;

  kind: string;

  data: Record<string, unknown>;

  version: number;

  visibility?: WGEVisibility;

  metadata?: Record<string, unknown>;
}

export type WGEVisibilityMode = "visible" | "redacted" | "hidden" | "restricted";

/**
 * Visibility is a policy object, not a plain string: WGE must support
 * projection, redaction, household/app permissions, and AI context
 * filtering. Aligned with the WIL-001.008 privacy rule.
 */
export interface WGEVisibility {
  mode: WGEVisibilityMode;

  /**
   * Optional capability required to observe this resource.
   * Example: "wardrobe.view", "household.measurements.view"
   */
  requiredCapability?: string;

  /** Optional redaction policy used when mode === "redacted". */
  redactionPolicyId?: string;

  /** Stable explanation/debug reason. */
  reason?: string;
}

/** WGE-1000.004 — Standard Aspect Kinds a compliant Kernel SHOULD recognize. */
export const WGE_STANDARD_ASPECT_KINDS: readonly string[] = [
  "identity",
  "state",
  "temporal",
  "permission",
  "capability",
  "constraint",
  "behavior",
  "metadata",
  "relationship",
  "physics",
  "projection_hint",
  "application"
] as const;

/** WGE-1000.005 — Relationship Primitive. */
export interface WGERelationship {
  id: WGEID;

  worldId: WGEID;

  fromEntityId: WGEID;
  toEntityId: WGEID;

  type: string;

  direction: "directed" | "bidirectional";

  weight?: Weight; // -100 to 100
  confidence?: Confidence; // 0.0 to 1.0

  lifecycle: WGERelationshipLifecycle;

  aspects?: WGEAspect[];

  metadata?: Record<string, unknown>;
}

export type WGERelationshipLifecycle =
  | "created"
  | "active"
  | "weakened"
  | "suspended"
  | "archived"
  | "deleted";

/** WGE-1000.006 — Law Primitive. A Law defines truth within a World. */
export interface WGELaw {
  id: WGEID;

  worldId: WGEID;

  name: string;

  scope: WGELawScope;

  appliesTo: WGESelector;

  condition: WGELawCondition;

  outcome: WGELawOutcome;

  severity: "error" | "warning" | "suggestion";

  metadata?: Record<string, unknown>;
}

export type WGELawScope = "kernel" | "physics" | "world";

export type WGELawOutcome =
  | "allow"
  | "reject"
  | "defer"
  | "warn"
  | "require_clarification"
  | "create_candidate_world";

/**
 * Deterministic expression AST — laws are data, never callbacks. No
 * functions, class instances, or non-deterministic predicates. Evaluated by
 * the Law runtime (WGE-1300.008).
 */
export type WGELawCondition =
  | {
      op: "all";
      conditions: WGELawCondition[];
    }
  | {
      op: "any";
      conditions: WGELawCondition[];
    }
  | {
      op: "not";
      condition: WGELawCondition;
    }
  | {
      op: "exists";
      selector: WGESelector;
    }
  | {
      op: "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "contains";
      left: WGEValueRef;
      right: WGEValueRef;
    }
  | {
      op: "has_relationship";
      from: WGESelector;
      relationshipType: string;
      to?: WGESelector;
    }
  | {
      op: "has_authority";
      actorRef: WGEValueRef;
      capability: string;
      target?: WGESelector;
    };

/** Deterministic value reference used inside law conditions. */
export type WGEValueRef =
  | {
      kind: "literal";
      value: WGEJSONValue;
    }
  | {
      kind: "path";
      path: string;
    }
  | {
      kind: "context";
      key: string;
    }
  | {
      kind: "actor";
      field: string;
    };

/** WGE-1000.007 — Event Primitive. Execution is truth-driven, not frame-driven. */
export interface WGEEvent {
  id: WGEID;

  worldId: WGEID;

  actorId: WGEID;

  type: string;

  originEntityId?: WGEID;

  timestamp: WGETimestamp;

  magnitude?: number;
  confidence?: Confidence;

  payload?: Record<string, unknown>;

  traceId: WGEID;
}

/** WGE-1000.008 — Traversal Primitive. The primary computational primitive of WGE. */
export interface WGETraversal {
  id: WGEID;

  worldId: WGEID;

  name: string;

  entry: WGESelector;

  rules: WGETraversalRule[];

  constraints?: WGEID[];

  output: WGETraversalOutputSpec;

  metadata?: Record<string, unknown>;
}

export interface WGETraversalRule {
  follow?: string;
  collect?: WGESelector;
  applyLawIds?: WGEID[];
  maxDepth?: number;
  minConfidence?: Confidence;
}

/**
 * Output contract on a Traversal definition: what the traversal emits and in
 * which deterministic order (default "id"). The runtime result it produces
 * is WGETraversalOutput below.
 */
export interface WGETraversalOutputSpec {
  kind: "entities" | "relationships" | "paths" | "aspects";
  limit?: number;
  orderBy?: "id" | "createdAt" | "confidence" | "weight";
}

/**
 * Canonical traversal result — consumed by AI, projection, trace,
 * diagnostics, and indexes. Output MUST be ordered deterministically: IDs
 * are stable-sorted unless the traversal explicitly defines another order.
 */
export interface WGETraversalOutput {
  traversalId: string;

  worldId: string;
  snapshotId: string;

  rootEntityIds: string[];

  entityIds: string[];
  relationshipIds: string[];

  paths?: WGETraversalPath[];

  depthReached: number;

  truncated: boolean;
  cursor?: string;

  diagnostics?: WGETraversalDiagnostic[];

  traceId: string;
}

export interface WGETraversalPath {
  entityIds: string[];
  relationshipIds: string[];

  weight?: Weight;
  confidence?: Confidence;
}

export interface WGETraversalDiagnostic {
  code: string;
  message: string;

  severity: "info" | "warning" | "error";

  entityId?: string;
  relationshipId?: string;
}

/** WGE-1000.009 — Snapshot Primitive. Immutable view of a World at one moment. */
export interface WGESnapshot {
  id: WGEID;

  worldId: WGEID;

  parentSnapshotId?: WGEID;

  createdAt: WGETimestamp;

  entityIndexHash: string;
  relationshipIndexHash: string;
  lawIndexHash: string;

  eventId?: WGEID;

  metadata?: Record<string, unknown>;
}

/** WGE-1000.010 — Diff Primitive. WGE operates on Diffs whenever possible. */
export interface WGEDiff {
  id: WGEID;

  worldId: WGEID;

  fromSnapshotId: WGEID;
  toSnapshotId?: WGEID;

  operations: WGEDiffOperation[];

  createdAt: WGETimestamp;

  traceId: WGEID;

  metadata?: Record<string, unknown>;
}

export type WGEDiffOperation =
  | {
      type: "entity.added";
      entity: WGEEntity;
    }
  | {
      type: "entity.updated";
      entityId: WGEID;
      changes: Record<string, unknown>;
    }
  | {
      type: "entity.removed";
      entityId: WGEID;
    }
  | {
      type: "relationship.added";
      relationship: WGERelationship;
    }
  | {
      type: "relationship.updated";
      relationshipId: WGEID;
      changes: Record<string, unknown>;
    }
  | {
      type: "relationship.removed";
      relationshipId: WGEID;
    }
  | {
      type: "aspect.updated";
      entityId: WGEID;
      aspectId: WGEID;
      changes: Record<string, unknown>;
    };

/** WGE-1000.011 — Selector Primitive. Selectors never reference UI. */
export interface WGESelector {
  kind:
    | "id"
    | "type"
    | "aspect"
    | "relationship"
    | "law"
    | "traversal"
    | "query"
    | "root";

  value?: unknown;
}

export type WGESelectorKind = WGESelector["kind"];

export const WGE_SELECTOR_KINDS: readonly WGESelectorKind[] = [
  "id",
  "type",
  "aspect",
  "relationship",
  "law",
  "traversal",
  "query",
  "root"
] as const;

export const WGE_ENTITY_LIFECYCLES: readonly WGEEntityLifecycle[] = [
  "created",
  "active",
  "suspended",
  "archived",
  "deleted"
] as const;

export const WGE_RELATIONSHIP_LIFECYCLES: readonly WGERelationshipLifecycle[] = [
  "created",
  "active",
  "weakened",
  "suspended",
  "archived",
  "deleted"
] as const;

export const WGE_LAW_SCOPES: readonly WGELawScope[] = [
  "kernel",
  "physics",
  "world"
] as const;

export const WGE_LAW_OUTCOMES: readonly WGELawOutcome[] = [
  "allow",
  "reject",
  "defer",
  "warn",
  "require_clarification",
  "create_candidate_world"
] as const;

/** WGE-1100.003 — Entity Graph node form. */
export interface WGEEntityNode {
  id: WGEID;
  worldId: WGEID;
  type: string;
  lifecycle: WGEEntityLifecycle;
  aspectIds: WGEID[];
  version: number;
  metadata?: Record<string, unknown>;
}

/** WGE-1100.004 — Relationship Graph edge form. */
export interface WGERelationshipEdge {
  id: WGEID;
  worldId: WGEID;

  fromEntityId: WGEID;
  toEntityId: WGEID;

  type: string;
  direction: "directed" | "bidirectional";

  weight?: Weight;
  confidence?: Confidence;

  lifecycle: WGERelationshipLifecycle;

  aspectIds?: WGEID[];
  metadata?: Record<string, unknown>;
}

/** WGE-1100.005 — Aspect Graph node form. */
export interface WGEAspectNode {
  id: WGEID;
  worldId: WGEID;
  ownerId: WGEID;
  kind: string;
  data: Record<string, unknown>;
  version: number;
  metadata?: Record<string, unknown>;
}
