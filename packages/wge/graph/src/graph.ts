/**
 * In-memory World Graph (REF-1900.007, WGE-1100.001 – WGE-1100.007).
 *
 * The World Graph is the canonical computational structure — the source of
 * experiential truth. This first implementation is simple; it must be
 * deterministic: every stored list is kept id-sorted so lookups and
 * traversals produce identical results for identical inputs.
 */
import type {
  WGEAspect,
  WGEDiff,
  WGEEntity,
  WGERelationship,
  WGESnapshot,
  WGEWorld
} from "@roc/types";

/** REF-1900.007 storage model. */
export interface InMemoryWorldGraph {
  worldId: string;
  rootEntityId: string;

  entitiesById: Map<string, WGEEntity>;
  relationshipsById: Map<string, WGERelationship>;

  outboundByEntityId: Map<string, string[]>;
  inboundByEntityId: Map<string, string[]>;

  aspectsByOwnerId: Map<string, WGEAspect[]>;

  snapshotsById: Map<string, WGESnapshot>;
  diffsById: Map<string, WGEDiff>;
}

const sorted = (values: string[]): string[] => [...values].sort();

/**
 * Builds the graph from canonical World state. Indexes are derived
 * acceleration structures (WGE-1100.006): they never contain unrecoverable
 * truth, and rebuilding from the same World always yields equivalent lookup
 * behavior.
 */
export function buildGraph(world: WGEWorld): InMemoryWorldGraph {
  const graph: InMemoryWorldGraph = {
    worldId: world.id,
    rootEntityId: world.rootEntityId,
    entitiesById: new Map(),
    relationshipsById: new Map(),
    outboundByEntityId: new Map(),
    inboundByEntityId: new Map(),
    aspectsByOwnerId: new Map(),
    snapshotsById: new Map(),
    diffsById: new Map()
  };

  for (const id of sorted(Object.keys(world.entities))) {
    const entity = world.entities[id];
    if (!entity) continue;
    graph.entitiesById.set(id, entity);
    if (entity.aspects.length > 0) {
      graph.aspectsByOwnerId.set(
        id,
        [...entity.aspects].sort((a, b) => (a.id < b.id ? -1 : 1))
      );
    }
  }

  for (const id of sorted(Object.keys(world.relationships))) {
    const relationship = world.relationships[id];
    if (!relationship) continue;
    graph.relationshipsById.set(id, relationship);
    appendSorted(graph.outboundByEntityId, relationship.fromEntityId, id);
    appendSorted(graph.inboundByEntityId, relationship.toEntityId, id);
    if (relationship.direction === "bidirectional") {
      appendSorted(graph.outboundByEntityId, relationship.toEntityId, id);
      appendSorted(graph.inboundByEntityId, relationship.fromEntityId, id);
    }
    if (relationship.aspects && relationship.aspects.length > 0) {
      graph.aspectsByOwnerId.set(
        id,
        [...relationship.aspects].sort((a, b) => (a.id < b.id ? -1 : 1))
      );
    }
  }

  return graph;
}

function appendSorted(map: Map<string, string[]>, key: string, id: string): void {
  const existing = map.get(key);
  if (existing) {
    if (!existing.includes(id)) {
      existing.push(id);
      existing.sort();
    }
  } else {
    map.set(key, [id]);
  }
}

export const getEntity = (g: InMemoryWorldGraph, id: string): WGEEntity | undefined =>
  g.entitiesById.get(id);

export const getRelationship = (
  g: InMemoryWorldGraph,
  id: string
): WGERelationship | undefined => g.relationshipsById.get(id);

/** Outbound relationship ids, deterministically ordered. */
export const outbound = (g: InMemoryWorldGraph, entityId: string): string[] =>
  g.outboundByEntityId.get(entityId) ?? [];

/** Inbound relationship ids, deterministically ordered. */
export const inbound = (g: InMemoryWorldGraph, entityId: string): string[] =>
  g.inboundByEntityId.get(entityId) ?? [];

export const aspectsOf = (g: InMemoryWorldGraph, ownerId: string): WGEAspect[] =>
  g.aspectsByOwnerId.get(ownerId) ?? [];

export const getSnapshot = (g: InMemoryWorldGraph, id: string): WGESnapshot | undefined =>
  g.snapshotsById.get(id);

export const getDiff = (g: InMemoryWorldGraph, id: string): WGEDiff | undefined =>
  g.diffsById.get(id);

export function addSnapshot(g: InMemoryWorldGraph, snapshot: WGESnapshot): void {
  if (g.snapshotsById.has(snapshot.id)) {
    // Snapshots are immutable (WGE-1100.008); re-adding the same id is a
    // mutation attempt in disguise.
    throw new Error(`Snapshot "${snapshot.id}" already exists and is immutable`);
  }
  g.snapshotsById.set(snapshot.id, snapshot);
}

export function addDiff(g: InMemoryWorldGraph, diff: WGEDiff): void {
  g.diffsById.set(diff.id, diff);
}

const ACTIVE_ENTITY_LIFECYCLES = new Set(["created", "active"]);
const TRAVERSABLE_RELATIONSHIP_LIFECYCLES = new Set([
  "created",
  "active",
  "weakened",
  "suspended"
]);

/**
 * Root containment validation (WGE-1100.003): every active Entity must have
 * a path to the World root. Reachability walks active relationships in
 * either structural direction — containment is about connection to the
 * World, not edge orientation. Returns unreachable active entity ids,
 * deterministically ordered.
 */
export function findOrphanedEntities(g: InMemoryWorldGraph): string[] {
  const reachable = new Set<string>([g.rootEntityId]);
  const queue = [g.rootEntityId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const relationshipIds = sorted([
      ...(g.outboundByEntityId.get(current) ?? []),
      ...(g.inboundByEntityId.get(current) ?? [])
    ]);
    for (const relId of relationshipIds) {
      const rel = g.relationshipsById.get(relId);
      if (!rel || !TRAVERSABLE_RELATIONSHIP_LIFECYCLES.has(rel.lifecycle)) continue;
      for (const next of [rel.fromEntityId, rel.toEntityId]) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }

  const orphans: string[] = [];
  for (const [id, entity] of g.entitiesById) {
    if (ACTIVE_ENTITY_LIFECYCLES.has(entity.lifecycle) && !reachable.has(id)) {
      orphans.push(id);
    }
  }
  return orphans.sort();
}
