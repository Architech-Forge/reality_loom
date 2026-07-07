/**
 * Reference Storage Adapter (STORE-2200.017): in-memory stores with a JSON
 * file backend (local filesystem is a supported backend, STORE-2200.018).
 *
 * The adapter ENFORCES semantics rather than trusting callers:
 * - Snapshots are immutable once stored (STORE-2200.006)
 * - The Event Log is append-only with stable sequence ordering (STORE-2200.008)
 * - The Reality pointer advances only through a committed Transaction that
 *   references its Diff (STORE-2200.003, STORE-2200.009)
 * - Candidate records can never advance the Reality pointer (STORE-2200.011)
 * - Trace retrieval is permission-aware with visible redaction (STORE-2200.010)
 * - Backup restore verifies causality or refuses (STORE-2200.019)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serializeCanonicalValue } from "@wge/wil";
import type { WILActor } from "@roc/types";
import type {
  ROCIdentityMappingStoreRecord,
  ROCMigrationRecord,
  ROCStorageCapabilities,
  ROCTraceStoreRecord,
  SLIProjectionStateStoreRecord,
  SLISpatialMemoryStoreRecord,
  WGECandidateWorldStoreRecord,
  WGEDiffStoreRecord,
  WGEEventLogRecord,
  WGEExecutableArtifactRecord,
  WGEIndexStoreRecord,
  WGESnapshotStoreRecord,
  WGETransactionStoreRecord,
  WGEWorldStoreRecord
} from "./records.js";

export class StorageViolation extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "StorageViolation";
  }
}

interface StorageBundle {
  formatVersion: string;
  worlds: WGEWorldStoreRecord[];
  snapshots: WGESnapshotStoreRecord[];
  diffs: WGEDiffStoreRecord[];
  events: Array<WGEEventLogRecord & { sequence: number }>;
  transactions: WGETransactionStoreRecord[];
  traces: ROCTraceStoreRecord[];
  candidates: WGECandidateWorldStoreRecord[];
  projectionStates: SLIProjectionStateStoreRecord[];
  spatialMemories: SLISpatialMemoryStoreRecord[];
  artifacts: WGEExecutableArtifactRecord[];
  identityMappings: ROCIdentityMappingStoreRecord[];
  migrations: ROCMigrationRecord[];
  // Indexes are intentionally NOT part of a backup: they are rebuildable
  // (STORE-2200.019 restore rule).
}

export class ReferenceStorageAdapter {
  readonly id = "roc-reference-storage";
  readonly version = "1.0.0";
  readonly capabilities: ROCStorageCapabilities = {
    transactions: true,
    appendOnlyLogs: true,
    snapshots: true,
    encryption: false,
    pointInTimeRestore: true,
    fullTextSearch: false,
    vectorSearch: false,
    graphQueries: false,
    objectStorage: false
  };

  private readonly worlds = new Map<string, WGEWorldStoreRecord>();
  private readonly snapshots = new Map<string, WGESnapshotStoreRecord>();
  private readonly snapshotHashes = new Map<string, string>();
  private readonly diffs = new Map<string, WGEDiffStoreRecord>();
  private readonly events: Array<WGEEventLogRecord & { sequence: number }> = [];
  private readonly transactions = new Map<string, WGETransactionStoreRecord>();
  private readonly traces = new Map<string, ROCTraceStoreRecord>();
  private readonly candidates = new Map<string, WGECandidateWorldStoreRecord>();
  private readonly projectionStates = new Map<string, SLIProjectionStateStoreRecord>();
  private readonly spatialMemories = new Map<string, SLISpatialMemoryStoreRecord>();
  private readonly indexes = new Map<string, WGEIndexStoreRecord>();
  private readonly artifacts = new Map<string, WGEExecutableArtifactRecord>();
  private readonly identityMappings = new Map<string, ROCIdentityMappingStoreRecord>();
  private readonly migrations = new Map<string, ROCMigrationRecord>();
  private sequence = 0;

  // --- World Store (STORE-2200.003) ----------------------------------------

  putWorld(record: WGEWorldStoreRecord): void {
    this.worlds.set(record.worldId, structuredClone(record));
  }

  getWorld(worldId: string): WGEWorldStoreRecord | undefined {
    return this.worlds.get(worldId);
  }

  /**
   * The current Snapshot pointer advances only through a valid committed
   * Transaction whose Diff is persisted (STORE-2200.003, STORE-2200.007).
   */
  advanceCurrentSnapshot(input: {
    worldId: string;
    snapshotId: string;
    transactionId: string;
    now: string;
  }): void {
    const world = this.worlds.get(input.worldId);
    if (!world) throw new StorageViolation("STORAGE_WORLD_MISSING", `world "${input.worldId}" is not stored`);
    const transaction = this.transactions.get(input.transactionId);
    if (!transaction || transaction.status !== "committed") {
      throw new StorageViolation(
        "STORAGE_POINTER_WITHOUT_COMMIT",
        "the Reality pointer advances only through a committed Transaction (STORE-2200.003)"
      );
    }
    if (transaction.resultingSnapshotId !== input.snapshotId) {
      throw new StorageViolation(
        "STORAGE_POINTER_MISMATCH",
        `transaction "${input.transactionId}" committed "${transaction.resultingSnapshotId}", not "${input.snapshotId}"`
      );
    }
    if (!transaction.committedDiffId || !this.diffs.has(transaction.committedDiffId)) {
      throw new StorageViolation(
        "STORAGE_COMMIT_WITHOUT_DIFF",
        "a committed Transaction MUST reference its persisted Diff (STORE-2200.009)"
      );
    }
    const snapshot = this.snapshots.get(input.snapshotId);
    if (!snapshot || snapshot.branch === "candidate") {
      throw new StorageViolation(
        "STORAGE_CANDIDATE_AS_REALITY",
        "Candidate records MUST NOT advance the Reality pointer (STORE-2200.011)"
      );
    }
    world.currentSnapshotId = input.snapshotId;
    world.updatedAt = input.now;
  }

  // --- Snapshot Store (STORE-2200.006) --------------------------------------

  putSnapshot(record: WGESnapshotStoreRecord): void {
    const hash = serializeCanonicalValue(record);
    const existing = this.snapshotHashes.get(record.snapshotId);
    if (existing !== undefined && existing !== hash) {
      throw new StorageViolation(
        "STORAGE_SNAPSHOT_MUTATION",
        `snapshot "${record.snapshotId}" is immutable and already stored with different content (STORE-2200.006)`
      );
    }
    this.snapshots.set(record.snapshotId, Object.freeze(structuredClone(record)));
    this.snapshotHashes.set(record.snapshotId, hash);
  }

  getSnapshot(snapshotId: string): WGESnapshotStoreRecord | undefined {
    return this.snapshots.get(snapshotId);
  }

  snapshotLineage(snapshotId: string): WGESnapshotStoreRecord[] {
    const lineage: WGESnapshotStoreRecord[] = [];
    let current = this.snapshots.get(snapshotId);
    while (current) {
      lineage.push(current);
      current = current.parentSnapshotId ? this.snapshots.get(current.parentSnapshotId) : undefined;
    }
    return lineage;
  }

  // --- Diff Store (STORE-2200.007) -------------------------------------------

  putDiff(record: WGEDiffStoreRecord): void {
    if (!record.traceId) {
      throw new StorageViolation("STORAGE_DIFF_WITHOUT_TRACE", "a Diff without trace causality is invalid");
    }
    this.diffs.set(record.diffId, structuredClone(record));
  }

  getDiff(diffId: string): WGEDiffStoreRecord | undefined {
    return this.diffs.get(diffId);
  }

  // --- Event Log (STORE-2200.008): append-only, stable ordering --------------

  appendEvent(record: WGEEventLogRecord): number {
    if (this.events.some((e) => e.eventId === record.eventId)) {
      throw new StorageViolation(
        "STORAGE_EVENT_REWRITE",
        `event "${record.eventId}" already appended; the Event Log is append-only (STORE-2200.008)`
      );
    }
    const sequence = ++this.sequence;
    this.events.push({ ...structuredClone(record), sequence });
    return sequence;
  }

  /** Deterministic order: timestamp, then stable sequence on collision. */
  eventsForWorld(worldId: string): WGEEventLogRecord[] {
    return this.events
      .filter((e) => e.worldId === worldId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sequence - b.sequence);
  }

  // --- Transaction Store (STORE-2200.009) ------------------------------------

  putTransaction(record: WGETransactionStoreRecord): void {
    if (record.status === "committed" && (!record.committedDiffId || !record.resultingSnapshotId)) {
      throw new StorageViolation(
        "STORAGE_COMMIT_INCOMPLETE",
        "a committed Transaction MUST reference the committed Diff and resulting Snapshot (STORE-2200.009)"
      );
    }
    this.transactions.set(record.transactionId, structuredClone(record));
  }

  getTransaction(transactionId: string): WGETransactionStoreRecord | undefined {
    return this.transactions.get(transactionId);
  }

  // --- Trace Store (STORE-2200.010): permission-aware, redaction visible -----

  putTrace(record: ROCTraceStoreRecord): void {
    this.traces.set(record.traceId, structuredClone(record));
  }

  /** Protected steps are redacted for actors lacking the declared capability. */
  getTrace(traceId: string, actor: WILActor): ROCTraceStoreRecord | undefined {
    const record = this.traces.get(traceId);
    if (!record) return undefined;
    if (
      record.protectedCapability === undefined ||
      actor.authority.permissions.includes(record.protectedCapability)
    ) {
      return structuredClone(record);
    }
    const redacted = structuredClone(record);
    redacted.redactions = redacted.steps.map((_, stepIndex) => ({
      stepIndex,
      reason: `protected details omitted: capability "${record.protectedCapability}" required (STORE-2200.010)`
    }));
    redacted.steps = redacted.steps.map(() => ({ redacted: true }));
    return redacted;
  }

  // --- Candidate World Store (STORE-2200.011) --------------------------------

  putCandidate(record: WGECandidateWorldStoreRecord): void {
    this.candidates.set(record.candidateWorldId, structuredClone(record));
  }

  getCandidate(candidateWorldId: string): WGECandidateWorldStoreRecord | undefined {
    return this.candidates.get(candidateWorldId);
  }

  // --- Projection / Spatial Memory Stores (STORE-2200.012 / .013) ------------

  putProjectionState(record: SLIProjectionStateStoreRecord): void {
    this.projectionStates.set(record.projectionStateId, structuredClone(record));
  }

  putSpatialMemory(record: SLISpatialMemoryStoreRecord): void {
    this.spatialMemories.set(record.spatialMemoryId, structuredClone(record));
  }

  spatialMemoriesFor(worldId: string, actorId?: string): SLISpatialMemoryStoreRecord[] {
    return [...this.spatialMemories.values()]
      .filter((m) => m.worldId === worldId && (actorId === undefined || m.actorId === actorId))
      .sort((a, b) => a.spatialMemoryId.localeCompare(b.spatialMemoryId));
  }

  // --- Index Store (STORE-2200.014): derived, discardable --------------------

  putIndex(record: WGEIndexStoreRecord): void {
    this.indexes.set(record.indexId, structuredClone(record));
  }

  getIndex(indexId: string): WGEIndexStoreRecord | undefined {
    return this.indexes.get(indexId);
  }

  discardIndexes(): number {
    const count = this.indexes.size;
    this.indexes.clear();
    return count;
  }

  // --- Artifact / Identity Mapping / Migration stores ------------------------

  putArtifact(record: WGEExecutableArtifactRecord): void {
    this.artifacts.set(record.executableWorldId, structuredClone(record));
  }

  getArtifact(executableWorldId: string): WGEExecutableArtifactRecord | undefined {
    return this.artifacts.get(executableWorldId);
  }

  putIdentityMapping(record: ROCIdentityMappingStoreRecord): void {
    const duplicate = [...this.identityMappings.values()].find(
      (m) =>
        m.active &&
        record.active &&
        m.applicationId === record.applicationId &&
        m.domainObjectType === record.domainObjectType &&
        m.domainObjectId === record.domainObjectId &&
        m.entityId !== record.entityId
    );
    if (duplicate) {
      throw new StorageViolation(
        "STORAGE_IDENTITY_SPLIT",
        "the same active domain object MUST NOT map to multiple active Entities (STORE-2200.016)"
      );
    }
    this.identityMappings.set(record.mappingId, structuredClone(record));
  }

  putMigration(record: ROCMigrationRecord): void {
    this.migrations.set(record.migrationId, structuredClone(record));
  }

  getMigration(migrationId: string): ROCMigrationRecord | undefined {
    return this.migrations.get(migrationId);
  }

  // --- Backup And Restore (STORE-2200.019) -----------------------------------

  backup(): StorageBundle {
    return structuredClone({
      formatVersion: "1.0.0",
      worlds: [...this.worlds.values()],
      snapshots: [...this.snapshots.values()],
      diffs: [...this.diffs.values()],
      events: [...this.events],
      transactions: [...this.transactions.values()],
      traces: [...this.traces.values()],
      candidates: [...this.candidates.values()],
      projectionStates: [...this.projectionStates.values()],
      spatialMemories: [...this.spatialMemories.values()],
      artifacts: [...this.artifacts.values()],
      identityMappings: [...this.identityMappings.values()],
      migrations: [...this.migrations.values()]
    });
  }

  backupToFile(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.backup(), null, 2));
  }

  /** Restore verifies causality or refuses: a backup that cannot replay is invalid. */
  static restore(bundle: StorageBundle): ReferenceStorageAdapter {
    const snapshotIds = new Set(bundle.snapshots.map((s) => s.snapshotId));
    for (const world of bundle.worlds) {
      if (!snapshotIds.has(world.currentSnapshotId)) {
        throw new StorageViolation(
          "STORAGE_RESTORE_POINTER_BROKEN",
          `world "${world.worldId}" points at missing snapshot "${world.currentSnapshotId}" (STORE-2200.019)`
        );
      }
    }
    for (const snapshot of bundle.snapshots) {
      if (snapshot.parentSnapshotId !== undefined && !snapshotIds.has(snapshot.parentSnapshotId)) {
        throw new StorageViolation(
          "STORAGE_RESTORE_LINEAGE_BROKEN",
          `snapshot "${snapshot.snapshotId}" lineage references missing parent "${snapshot.parentSnapshotId}"`
        );
      }
    }
    for (const diff of bundle.diffs) {
      if (!snapshotIds.has(diff.fromSnapshotId)) {
        throw new StorageViolation(
          "STORAGE_RESTORE_DIFF_BROKEN",
          `diff "${diff.diffId}" references missing base snapshot "${diff.fromSnapshotId}"`
        );
      }
    }
    const adapter = new ReferenceStorageAdapter();
    for (const w of bundle.worlds) adapter.worlds.set(w.worldId, w);
    for (const s of bundle.snapshots) adapter.putSnapshot(s);
    for (const d of bundle.diffs) adapter.diffs.set(d.diffId, d);
    for (const e of [...bundle.events].sort((a, b) => a.sequence - b.sequence)) {
      adapter.events.push(e);
      adapter.sequence = Math.max(adapter.sequence, e.sequence);
    }
    for (const t of bundle.transactions) adapter.transactions.set(t.transactionId, t);
    for (const t of bundle.traces) adapter.traces.set(t.traceId, t);
    for (const c of bundle.candidates) adapter.candidates.set(c.candidateWorldId, c);
    for (const p of bundle.projectionStates) adapter.projectionStates.set(p.projectionStateId, p);
    for (const m of bundle.spatialMemories) adapter.spatialMemories.set(m.spatialMemoryId, m);
    for (const a of bundle.artifacts) adapter.artifacts.set(a.executableWorldId, a);
    for (const i of bundle.identityMappings) adapter.identityMappings.set(i.mappingId, i);
    for (const m of bundle.migrations) adapter.migrations.set(m.migrationId, m);
    return adapter;
  }

  static restoreFromFile(path: string): ReferenceStorageAdapter {
    return ReferenceStorageAdapter.restore(JSON.parse(readFileSync(path, "utf8")) as StorageBundle);
  }
}

export type { StorageBundle };
