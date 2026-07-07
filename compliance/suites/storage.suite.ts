/**
 * Official compliance suite — Storage (COMP-2000 pattern, STORE-2200.024).
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import { ReferenceStorageAdapter, StorageViolation } from "@roc/storage";
import type { WGESnapshotStoreRecord, WGETransactionStoreRecord } from "@roc/storage";
import { assert, emma, guest, FIXED_NOW } from "./helpers.js";

const snapshot = (id: string, extra: Partial<WGESnapshotStoreRecord> = {}): WGESnapshotStoreRecord => ({
  snapshotId: id,
  worldId: "world_s",
  branch: "reality",
  createdAt: FIXED_NOW,
  traceId: "trace_s",
  entityIndexHash: "h1",
  relationshipIndexHash: "h2",
  lawIndexHash: "h3",
  ...extra
});

const committedTxn = (id: string, snapshotId: string, diffId: string): WGETransactionStoreRecord => ({
  transactionId: id,
  worldId: "world_s",
  actorId: emma.id,
  messageId: "msg_s",
  traceId: "trace_s",
  baseSnapshotId: "snap_base",
  resultingSnapshotId: snapshotId,
  committedDiffId: diffId,
  mode: "commit",
  status: "committed",
  createdAt: FIXED_NOW
});

function seededAdapter(): ReferenceStorageAdapter {
  const adapter = new ReferenceStorageAdapter();
  adapter.putWorld({
    worldId: "world_s", rootEntityId: "root", name: "Store World", version: "1.0.0",
    currentSnapshotId: "snap_base", lifecycle: "active", createdAt: FIXED_NOW, updatedAt: FIXED_NOW
  });
  adapter.putSnapshot(snapshot("snap_base"));
  return adapter;
}

export const storageSuite: ROCComplianceSuite = {
  id: "suite_storage",
  area: "storage",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("STORE-CT-001", "Snapshot immutability is enforced by the store", ["STORE-2200.006"], async () => {
      const adapter = seededAdapter();
      adapter.putSnapshot(snapshot("snap_base")); // identical re-put is fine
      let threw = false;
      try {
        adapter.putSnapshot(snapshot("snap_base", { entityIndexHash: "tampered" }));
      } catch (e) {
        threw = e instanceof StorageViolation && e.code === "STORAGE_SNAPSHOT_MUTATION";
      }
      assert(threw, "mutated re-put rejected");
    }),
    defineTest("STORE-CT-002", "Event log is append-only with deterministic ordering", ["STORE-2200.008"], async () => {
      const adapter = seededAdapter();
      const base = { worldId: "world_s", actorId: emma.id, type: "t", traceId: "tr" };
      adapter.appendEvent({ ...base, eventId: "e1", timestamp: "2026-07-06T12:00:01Z" });
      adapter.appendEvent({ ...base, eventId: "e2", timestamp: "2026-07-06T12:00:00Z" });
      adapter.appendEvent({ ...base, eventId: "e3", timestamp: "2026-07-06T12:00:00Z" }); // collision
      const order = adapter.eventsForWorld("world_s").map((e) => e.eventId);
      assert(JSON.stringify(order) === JSON.stringify(["e2", "e3", "e1"]), "timestamp then stable sequence");
      let threw = false;
      try {
        adapter.appendEvent({ ...base, eventId: "e1", timestamp: FIXED_NOW });
      } catch (e) {
        threw = e instanceof StorageViolation;
      }
      assert(threw, "rewriting an event is refused");
    }),
    defineTest("STORE-CT-003", "Reality pointer advances only through committed Transaction + Diff", ["STORE-2200.003", "STORE-2200.009"], async () => {
      const adapter = seededAdapter();
      adapter.putSnapshot(snapshot("snap_next", { parentSnapshotId: "snap_base", transactionId: "txn_1", diffId: "diff_1" }));
      let refused = false;
      try {
        adapter.advanceCurrentSnapshot({ worldId: "world_s", snapshotId: "snap_next", transactionId: "txn_missing", now: FIXED_NOW });
      } catch (e) {
        refused = e instanceof StorageViolation && e.code === "STORAGE_POINTER_WITHOUT_COMMIT";
      }
      assert(refused, "no committed transaction → no pointer advance");

      adapter.putDiff({ diffId: "diff_1", worldId: "world_s", fromSnapshotId: "snap_base", toSnapshotId: "snap_next", operations: [], traceId: "trace_s", createdAt: FIXED_NOW });
      adapter.putTransaction(committedTxn("txn_1", "snap_next", "diff_1"));
      adapter.advanceCurrentSnapshot({ worldId: "world_s", snapshotId: "snap_next", transactionId: "txn_1", now: FIXED_NOW });
      assert(adapter.getWorld("world_s")?.currentSnapshotId === "snap_next", "valid commit advances the pointer");
    }),
    defineTest("STORE-CT-004", "Candidate records cannot advance the Reality pointer", ["STORE-2200.011"], async () => {
      const adapter = seededAdapter();
      adapter.putSnapshot(snapshot("snap_cand", { branch: "candidate", parentSnapshotId: "snap_base" }));
      adapter.putDiff({ diffId: "diff_c", worldId: "world_s", fromSnapshotId: "snap_base", operations: [], traceId: "trace_s", createdAt: FIXED_NOW });
      adapter.putTransaction(committedTxn("txn_c", "snap_cand", "diff_c"));
      let refused = false;
      try {
        adapter.advanceCurrentSnapshot({ worldId: "world_s", snapshotId: "snap_cand", transactionId: "txn_c", now: FIXED_NOW });
      } catch (e) {
        refused = e instanceof StorageViolation && e.code === "STORAGE_CANDIDATE_AS_REALITY";
      }
      assert(refused, "candidate branch refused as Reality");
    }),
    defineTest("STORE-CT-005", "Committed transaction must reference Diff and Snapshot", ["STORE-2200.009"], async () => {
      const adapter = seededAdapter();
      let threw = false;
      try {
        adapter.putTransaction({ ...committedTxn("txn_bad", "snap_x", "diff_x"), committedDiffId: undefined as never });
      } catch (e) {
        threw = e instanceof StorageViolation && e.code === "STORAGE_COMMIT_INCOMPLETE";
      }
      assert(threw, "incomplete committed transaction rejected");
    }),
    defineTest("STORE-CT-006", "Trace retrieval is permission-aware with visible redaction", ["STORE-2200.010"], async () => {
      const adapter = seededAdapter();
      adapter.putTrace({
        traceId: "trace_private", category: "runtime", summary: "measurement change",
        steps: [{ detail: "chest 92cm" }], protectedCapability: "household.measurements.view",
        createdAt: FIXED_NOW
      });
      const full = adapter.getTrace("trace_private", emma);
      assert((full?.steps[0] as { detail?: string }).detail === "chest 92cm", "authorized actor sees details");
      const redacted = adapter.getTrace("trace_private", guest);
      assert((redacted?.steps[0] as { redacted?: boolean }).redacted === true, "unauthorized steps redacted");
      assert((redacted?.redactions?.length ?? 0) > 0, "redaction itself is visible");
    }),
    defineTest("STORE-CT-007", "Indexes are discardable; snapshots are not", ["STORE-2200.014"], async () => {
      const adapter = seededAdapter();
      adapter.putIndex({
        indexId: "idx_1", worldId: "world_s", snapshotId: "snap_base", indexType: "entity_type",
        version: "1", hash: "h", dataRef: "ref", createdAt: FIXED_NOW
      });
      assert(adapter.discardIndexes() === 1, "indexes discarded without violation");
      assert(adapter.getSnapshot("snap_base") !== undefined, "snapshots survive");
    }),
    defineTest("STORE-CT-008", "Backup restores with verified causality", ["STORE-2200.019"], async () => {
      const adapter = seededAdapter();
      adapter.putSnapshot(snapshot("snap_next", { parentSnapshotId: "snap_base" }));
      adapter.putDiff({ diffId: "diff_1", worldId: "world_s", fromSnapshotId: "snap_base", toSnapshotId: "snap_next", operations: [], traceId: "trace_s", createdAt: FIXED_NOW });
      adapter.appendEvent({ eventId: "e1", worldId: "world_s", actorId: emma.id, type: "t", timestamp: FIXED_NOW, traceId: "tr" });
      const restored = ReferenceStorageAdapter.restore(adapter.backup());
      assert(restored.getSnapshot("snap_next")?.parentSnapshotId === "snap_base", "lineage restored");
      assert(restored.eventsForWorld("world_s").length === 1, "events restored in order");
    }),
    defineTest("STORE-CT-009", "Restore refuses broken lineage", ["STORE-2200.019"], async () => {
      const adapter = seededAdapter();
      const bundle = adapter.backup();
      bundle.snapshots.push(snapshot("snap_orphan", { parentSnapshotId: "snap_missing" }));
      let refused = false;
      try {
        ReferenceStorageAdapter.restore(bundle);
      } catch (e) {
        refused = e instanceof StorageViolation && e.code === "STORAGE_RESTORE_LINEAGE_BROKEN";
      }
      assert(refused, "a backup that cannot replay causality is not a valid ROC backup");
    }),
    defineTest("STORE-CT-010", "Migration records are preserved", ["STORE-2200.020"], async () => {
      const adapter = seededAdapter();
      adapter.putMigration({
        migrationId: "mig_1", name: "aspect schema v2", fromVersion: "1.0.0", toVersion: "2.0.0",
        scope: "aspect_schema", status: "completed", traceId: "trace_mig"
      });
      const restored = ReferenceStorageAdapter.restore(adapter.backup());
      assert(restored.getMigration("mig_1")?.status === "completed", "migration survives backup/restore");
    }),
    defineTest("STORE-CT-011", "Identity mappings refuse active splits", ["STORE-2200.016"], async () => {
      const adapter = seededAdapter();
      adapter.putIdentityMapping({
        mappingId: "m1", applicationId: "lilbirdi", domainObjectType: "garment", domainObjectId: "G-1",
        worldId: "world_s", entityId: "e1", active: true, version: 1, createdAt: FIXED_NOW, updatedAt: FIXED_NOW
      });
      let refused = false;
      try {
        adapter.putIdentityMapping({
          mappingId: "m2", applicationId: "lilbirdi", domainObjectType: "garment", domainObjectId: "G-1",
          worldId: "world_s", entityId: "e2", active: true, version: 1, createdAt: FIXED_NOW, updatedAt: FIXED_NOW
        });
      } catch (e) {
        refused = e instanceof StorageViolation && e.code === "STORAGE_IDENTITY_SPLIT";
      }
      assert(refused, "one active domain object, one active Entity");
    }),
    defineTest("STORE-CT-012", "Diffs without trace causality are refused", ["STORE-2200.007", "STORE-2200.010"], async () => {
      const adapter = seededAdapter();
      let refused = false;
      try {
        adapter.putDiff({ diffId: "d", worldId: "world_s", fromSnapshotId: "snap_base", operations: [], traceId: "", createdAt: FIXED_NOW });
      } catch (e) {
        refused = e instanceof StorageViolation;
      }
      assert(refused, "an unexplained change is a storage failure");
    })
  ]
};
