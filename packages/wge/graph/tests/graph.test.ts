import { describe, expect, it } from "vitest";
import {
  addSnapshot,
  aspectsOf,
  buildAspectIndex,
  buildEntityIndex,
  buildGraph,
  buildRelationshipIndex,
  buildTemporalIndex,
  deserializeWorld,
  findOrphanedEntities,
  getEntity,
  inbound,
  outbound,
  serializeWorld,
  worldsEquivalent
} from "@wge/graph";
import {
  createAspect,
  createEntity,
  createRelationship,
  createSnapshot,
  createWorld
} from "@wge/kernel";
import type { WGEWorld } from "@roc/types";

function familyWorld(): WGEWorld {
  const world = createWorld({ id: "world_family", name: "Family World" });
  const add = (id: string, type: string) => {
    world.entities[id] = createEntity({
      id,
      worldId: world.id,
      type,
      lifecycle: "active",
      createdAt: "2026-07-06T00:00:00Z"
    });
  };
  add("household_primary", "household");
  add("person_emma", "person");
  add("closet_emma", "closet");
  const relate = (id: string, from: string, type: string, to: string) => {
    world.relationships[id] = createRelationship({
      id,
      worldId: world.id,
      fromEntityId: from,
      toEntityId: to,
      type
    });
  };
  relate("rel_a_root_household", world.rootEntityId, "contains", "household_primary");
  relate("rel_b_household_emma", "household_primary", "includes_person", "person_emma");
  relate("rel_c_emma_closet", "person_emma", "owns", "closet_emma");
  world.entities["person_emma"]?.aspects.push(
    createAspect({
      id: "aspect_person_emma__identity",
      entityId: "person_emma",
      kind: "identity",
      data: { display_name: "Emma" }
    })
  );
  return world;
}

describe("buildGraph (REF-1900.007)", () => {
  it("supports entity, relationship, aspect lookups", () => {
    const graph = buildGraph(familyWorld());
    expect(getEntity(graph, "person_emma")?.type).toBe("person");
    expect(outbound(graph, "person_emma")).toEqual(["rel_c_emma_closet"]);
    expect(inbound(graph, "person_emma")).toEqual(["rel_b_household_emma"]);
    expect(aspectsOf(graph, "person_emma")[0]?.kind).toBe("identity");
  });

  it("orders traversal neighbors deterministically", () => {
    const a = buildGraph(familyWorld());
    const b = buildGraph(familyWorld());
    expect([...a.entitiesById.keys()]).toEqual([...b.entitiesById.keys()]);
    expect(a.outboundByEntityId.get("household_primary")).toEqual(
      b.outboundByEntityId.get("household_primary")
    );
  });

  it("indexes bidirectional relationships in both directions (WGE-1100.004)", () => {
    const world = familyWorld();
    world.relationships["rel_d_bidi"] = createRelationship({
      id: "rel_d_bidi",
      worldId: world.id,
      fromEntityId: "person_emma",
      toEntityId: "household_primary",
      type: "references",
      direction: "bidirectional"
    });
    const graph = buildGraph(world);
    expect(outbound(graph, "household_primary")).toContain("rel_d_bidi");
    expect(outbound(graph, "person_emma")).toContain("rel_d_bidi");
  });

  it("rejects re-adding an existing snapshot id (WGE-1100.008 immutability)", () => {
    const world = familyWorld();
    const graph = buildGraph(world);
    const snapshot = createSnapshot({ world, id: "snap_1" });
    addSnapshot(graph, snapshot);
    expect(() => addSnapshot(graph, snapshot)).toThrow(/immutable/);
  });
});

describe("findOrphanedEntities (WGE-1100.003 containment)", () => {
  it("returns no orphans for a fully contained world", () => {
    expect(findOrphanedEntities(buildGraph(familyWorld()))).toEqual([]);
  });

  it("finds active entities with no path to the root", () => {
    const world = familyWorld();
    world.entities["island_a"] = createEntity({
      id: "island_a",
      worldId: world.id,
      type: "person",
      lifecycle: "active"
    });
    world.entities["island_b"] = createEntity({
      id: "island_b",
      worldId: world.id,
      type: "closet",
      lifecycle: "active"
    });
    // Connected to each other but not to the root — still orphaned.
    world.relationships["rel_island"] = createRelationship({
      id: "rel_island",
      worldId: world.id,
      fromEntityId: "island_a",
      toEntityId: "island_b",
      type: "owns"
    });
    expect(findOrphanedEntities(buildGraph(world))).toEqual(["island_a", "island_b"]);
  });

  it("permits detached archived entities (WGE-1100.003)", () => {
    const world = familyWorld();
    world.entities["old_closet"] = createEntity({
      id: "old_closet",
      worldId: world.id,
      type: "closet",
      lifecycle: "archived"
    });
    expect(findOrphanedEntities(buildGraph(world))).toEqual([]);
  });
});

describe("derived indexes (WGE-1100.006, canonical shapes)", () => {
  it("builds the entity index with byId, byType, byAspectKind", () => {
    const index = buildEntityIndex(familyWorld());
    expect(index.byId["person_emma"]?.aspectKinds).toEqual(["identity"]);
    expect(index.byType["person"]).toEqual(["person_emma"]);
    expect(index.byAspectKind["identity"]).toEqual(["person_emma"]);
  });

  it("builds the relationship index with directional lookups", () => {
    const index = buildRelationshipIndex(familyWorld());
    expect(index.outgoingByEntityId["person_emma"]).toEqual(["rel_c_emma_closet"]);
    expect(index.incomingByEntityId["closet_emma"]).toEqual(["rel_c_emma_closet"]);
    expect(index.byType["owns"]).toEqual(["rel_c_emma_closet"]);
  });

  it("indexes are rebuildable and deterministic — never authoritative", () => {
    const world = familyWorld();
    expect(buildEntityIndex(world)).toEqual(buildEntityIndex(world));
    expect(buildAspectIndex(world)).toEqual(buildAspectIndex(world));
    expect(buildRelationshipIndex(world)).toEqual(buildRelationshipIndex(world));
  });

  it("builds the temporal index from snapshots and diffs", () => {
    const world = familyWorld();
    const snap = createSnapshot({ world, id: "snap_1" });
    const index = buildTemporalIndex({ snapshots: [snap] });
    expect(index.snapshotsByWorldId["world_family"]).toEqual(["snap_1"]);
  });
});

describe("graph serialization (WGE-1100.012)", () => {
  it("round-trips a world with semantic equivalence", () => {
    const world = familyWorld();
    const decoded = deserializeWorld(serializeWorld(world));
    expect(worldsEquivalent(world, decoded)).toBe(true);
    expect(decoded.entities["person_emma"]?.aspects[0]?.data).toEqual({
      display_name: "Emma"
    });
  });
});
