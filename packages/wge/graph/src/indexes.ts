/**
 * Derived canonical indexes (WGE-1100.006, canonical shapes in @roc/types).
 *
 * Indexes are derived acceleration structures. They are not authoritative
 * truth: each builder is a pure function of canonical state, so indexes are
 * always rebuildable and never contain unrecoverable truth. All id lists are
 * sorted for deterministic lookup behavior.
 */
import type {
  WGEAspectIndex,
  WGEDiff,
  WGEEntityIndex,
  WGERelationshipIndex,
  WGESnapshot,
  WGETemporalIndex,
  WGEEvent,
  WGEWorld
} from "@roc/types";

const push = (map: Record<string, string[]>, key: string, id: string): void => {
  (map[key] ??= []).push(id);
};

const sortAll = (map: Record<string, string[]>): void => {
  for (const list of Object.values(map)) list.sort();
};

export function buildEntityIndex(world: WGEWorld): WGEEntityIndex {
  const index: WGEEntityIndex = { byId: {}, byType: {}, byAspectKind: {} };
  for (const id of Object.keys(world.entities).sort()) {
    const entity = world.entities[id];
    if (!entity) continue;
    index.byId[id] = {
      entityId: id,
      type: entity.type,
      aspectKinds: [...new Set(entity.aspects.map((a) => a.kind))].sort(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
    push(index.byType, entity.type, id);
    for (const kind of index.byId[id].aspectKinds) push(index.byAspectKind, kind, id);
  }
  sortAll(index.byType);
  sortAll(index.byAspectKind);
  return index;
}

export function buildAspectIndex(world: WGEWorld): WGEAspectIndex {
  const index: WGEAspectIndex = { byId: {}, byEntityId: {}, byKind: {} };
  for (const entityId of Object.keys(world.entities).sort()) {
    const entity = world.entities[entityId];
    if (!entity) continue;
    for (const aspect of [...entity.aspects].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      index.byId[aspect.id] = {
        aspectId: aspect.id,
        entityId: aspect.entityId,
        kind: aspect.kind,
        ...(aspect.visibility !== undefined ? { visibility: aspect.visibility } : {})
      };
      push(index.byEntityId, aspect.entityId, aspect.id);
      push(index.byKind, aspect.kind, aspect.id);
    }
  }
  sortAll(index.byEntityId);
  sortAll(index.byKind);
  return index;
}

export function buildRelationshipIndex(world: WGEWorld): WGERelationshipIndex {
  const index: WGERelationshipIndex = {
    byId: {},
    byType: {},
    outgoingByEntityId: {},
    incomingByEntityId: {}
  };
  for (const id of Object.keys(world.relationships).sort()) {
    const rel = world.relationships[id];
    if (!rel) continue;
    index.byId[id] = {
      relationshipId: id,
      type: rel.type,
      fromEntityId: rel.fromEntityId,
      toEntityId: rel.toEntityId,
      ...(rel.weight !== undefined ? { weight: rel.weight } : {}),
      ...(rel.confidence !== undefined ? { confidence: rel.confidence } : {})
    };
    push(index.byType, rel.type, id);
    push(index.outgoingByEntityId, rel.fromEntityId, id);
    push(index.incomingByEntityId, rel.toEntityId, id);
  }
  sortAll(index.byType);
  sortAll(index.outgoingByEntityId);
  sortAll(index.incomingByEntityId);
  return index;
}

export interface TemporalIndexInput {
  snapshots?: WGESnapshot[];
  diffs?: WGEDiff[];
  events?: WGEEvent[];
}

export function buildTemporalIndex(input: TemporalIndexInput): WGETemporalIndex {
  const index: WGETemporalIndex = {
    snapshotsByWorldId: {},
    diffsBySnapshotId: {},
    eventsByEntityId: {},
    tracesByEntityId: {}
  };
  for (const snapshot of input.snapshots ?? []) {
    push(index.snapshotsByWorldId, snapshot.worldId, snapshot.id);
  }
  for (const diff of input.diffs ?? []) {
    push(index.diffsBySnapshotId, diff.fromSnapshotId, diff.id);
  }
  for (const event of input.events ?? []) {
    if (event.originEntityId) {
      push(index.eventsByEntityId, event.originEntityId, event.id);
      push(index.tracesByEntityId, event.originEntityId, event.traceId);
    }
  }
  sortAll(index.snapshotsByWorldId);
  sortAll(index.diffsBySnapshotId);
  sortAll(index.eventsByEntityId);
  sortAll(index.tracesByEntityId);
  return index;
}
