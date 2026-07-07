/**
 * Store record shapes (Volume 2200, STORE-2200.003 – STORE-2200.020).
 * Transcribed from the Codex verbatim wherever specified.
 */
import type {
  ROCDiagnostic,
  SLIBoundsHint,
  SLIDensityLevel,
  WGEDiffOperation,
  WGEEntityLifecycle,
  WGERelationshipLifecycle,
  WGETimestamp,
  WGEVisibility
} from "@roc/types";

/** STORE-2200.003 — World Store. */
export interface WGEWorldStoreRecord {
  worldId: string;

  rootEntityId: string;

  name: string;
  version: string;

  currentSnapshotId: string;

  executableWorldId?: string;

  lifecycle: "created" | "active" | "suspended" | "archived" | "deleted";

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.004 — Entity And Relationship Store. */
export interface WGEEntityStoreRecord {
  entityId: string;
  worldId: string;

  type: string;
  lifecycle: WGEEntityLifecycle;

  version: number;

  aspectRefs: string[];

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

export interface WGERelationshipStoreRecord {
  relationshipId: string;
  worldId: string;

  fromEntityId: string;
  toEntityId: string;

  type: string;
  direction: "directed" | "bidirectional";

  weight?: number;
  confidence?: number;

  lifecycle: WGERelationshipLifecycle;

  aspectRefs?: string[];

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;
}

/** STORE-2200.005 — Aspect Store. */
export interface WGEAspectStoreRecord {
  aspectId: string;

  worldId: string;

  ownerId: string;

  kind: string;

  schemaVersion: string;

  data: Record<string, unknown>;

  visibility?: WGEVisibility;

  version: number;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.006 — Snapshot Store. */
export interface WGESnapshotStoreRecord {
  snapshotId: string;

  worldId: string;

  parentSnapshotId?: string;

  branch: "reality" | "candidate" | "historical" | "migration";

  createdAt: WGETimestamp;

  causedByEventId?: string;
  transactionId?: string;
  diffId?: string;
  traceId: string;

  entityIndexHash: string;
  relationshipIndexHash: string;
  lawIndexHash: string;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.007 — Diff Store. */
export interface WGEDiffStoreRecord {
  diffId: string;

  worldId: string;

  fromSnapshotId: string;
  toSnapshotId?: string;

  operations: WGEDiffOperation[];

  transactionId?: string;
  eventId?: string;
  traceId: string;

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.008 — Event Log. */
export interface WGEEventLogRecord {
  eventId: string;

  worldId: string;

  actorId: string;

  type: string;

  originEntityId?: string;

  timestamp: WGETimestamp;

  magnitude?: number;
  confidence?: number;

  payload?: Record<string, unknown>;

  traceId: string;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.009 — Transaction Store. */
export interface WGETransactionStoreRecord {
  transactionId: string;

  worldId: string;
  actorId: string;

  messageId: string;
  traceId: string;

  baseSnapshotId: string;

  resultingSnapshotId?: string;
  proposedDiffId?: string;
  committedDiffId?: string;

  mode: "commit" | "simulate";

  status:
    | "opened"
    | "validated"
    | "diff_generated"
    | "committed"
    | "rolled_back"
    | "rejected"
    | "failed";

  createdAt: WGETimestamp;
  completedAt?: WGETimestamp;

  diagnostics?: ROCDiagnostic[];
}

/** STORE-2200.010 — Trace Store. */
export interface ROCTraceRedaction {
  stepIndex: number;
  reason: string;
}

export interface ROCTraceStoreRecord {
  traceId: string;

  worldId?: string;
  snapshotId?: string;

  actorId?: string;

  category:
    | "wil"
    | "runtime"
    | "physics"
    | "traversal"
    | "projection"
    | "application"
    | "compiler"
    | "compliance";

  summary: string;

  steps: Record<string, unknown>[];

  redactions?: ROCTraceRedaction[];

  /** Capability required to read unredacted protected steps. */
  protectedCapability?: string;

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.011 — Candidate World Store. */
export interface WGECandidateWorldStoreRecord {
  candidateWorldId: string;

  baseWorldId: string;
  baseSnapshotId: string;

  currentCandidateSnapshotId: string;

  actorId: string;

  objectiveId?: string;

  status: "active" | "expired" | "merged" | "discarded" | "failed";

  createdFromMessageId: string;
  traceId: string;

  createdAt: WGETimestamp;
  expiresAt?: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.012 — Projection State Store. */
export interface SLIProjectionStateStoreRecord {
  projectionStateId: string;

  worldId: string;
  actorId?: string;

  projectionId: string;
  snapshotId: string;

  activeObjectiveId?: string;
  primaryEntityId?: string;

  expandedEntityIds: string[];
  hiddenEntityIds: string[];

  density?: SLIDensityLevel;

  spatialMemoryRefs: string[];

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.013 — Spatial Memory Store. */
export interface SLISpatialMemoryStoreRecord {
  spatialMemoryId: string;

  worldId: string;
  actorId?: string;

  entityId: string;

  preferredRegionId?: string;
  lastKnownBounds?: SLIBoundsHint;

  stabilityScore: number;

  lastSeenAt: WGETimestamp;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.014 — Index Store. Indexes are replaceable; Snapshots are not. */
export interface WGEIndexStoreRecord {
  indexId: string;

  worldId: string;
  snapshotId: string;

  indexType:
    | "entity_id"
    | "entity_type"
    | "relationship_type"
    | "outbound_relationship"
    | "inbound_relationship"
    | "aspect_kind"
    | "law_scope"
    | "traversal_entry"
    | "physics_neighborhood"
    | "permission"
    | "temporal"
    | "custom";

  version: string;

  hash: string;

  dataRef: string;

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.015 — Executable World Artifact Store. */
export interface WGEExecutableArtifactRecord {
  executableWorldId: string;

  worldId: string;

  compilerVersion: string;
  kernelVersion: string;
  wilVersion: string;

  sourceHash: string;

  artifactHash: string;

  artifactRef: string;

  profile: "development" | "production" | "ai_authoring" | "embedded";

  createdAt: WGETimestamp;

  diagnosticsRef?: string;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.016 — Application Identity Mapping Store. */
export interface ROCIdentityMappingStoreRecord {
  mappingId: string;

  applicationId: string;

  domainObjectType: string;
  domainObjectId: string;

  worldId: string;
  entityId: string;

  active: boolean;

  version: number;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** STORE-2200.020 — Migration System. */
export interface ROCMigrationRecord {
  migrationId: string;

  name: string;

  fromVersion: string;
  toVersion: string;

  scope:
    | "storage_schema"
    | "world_schema"
    | "aspect_schema"
    | "compiler_artifact"
    | "index"
    | "projection_state"
    | "application_mapping";

  status: "pending" | "running" | "completed" | "rolled_back" | "failed";

  startedAt?: WGETimestamp;
  completedAt?: WGETimestamp;

  traceId: string;

  diagnostics?: ROCDiagnostic[];
}

/** STORE-2200.017 — Storage Adapter capabilities. */
export interface ROCStorageCapabilities {
  transactions: boolean;
  appendOnlyLogs: boolean;
  snapshots: boolean;
  encryption: boolean;
  pointInTimeRestore: boolean;
  fullTextSearch: boolean;
  vectorSearch: boolean;
  graphQueries: boolean;
  objectStorage: boolean;
}
