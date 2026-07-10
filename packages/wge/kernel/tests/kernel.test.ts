import { describe, expect, it } from "vitest";
import {
  createAspect,
  createDiff,
  createEntity,
  createLaw,
  createRelationship,
  createSnapshot,
  createTraversal,
  createWorld,
  checkDiffBase,
  resolveSelector,
  snapshotsEquivalent,
  validateWorld
} from "@wge/kernel";
import type { WGEWorld } from "@roc/types";

const FIXED_NOW = "2026-07-06T12:00:00.000Z";

/**
 * A minimal valid world: root + one person related to the root. Fully
 * deterministic — every timestamp is pinned, because two constructions that
 * straddle a millisecond boundary would otherwise hash differently and make
 * the determinism assertions flaky.
 */
function familyWorld(): WGEWorld {
  const world = createWorld({ id: "world_family", name: "Family World" });
  const root = world.entities[world.rootEntityId];
  if (root) {
    root.createdAt = FIXED_NOW;
    root.updatedAt = FIXED_NOW;
  }
  const emma = createEntity({
    id: "person_emma",
    worldId: world.id,
    type: "person",
    lifecycle: "active",
    createdAt: FIXED_NOW
  });
  world.entities[emma.id] = emma;
  const rel = createRelationship({
    id: "rel_root_emma",
    worldId: world.id,
    fromEntityId: world.rootEntityId,
    toEntityId: emma.id,
    type: "contains"
  });
  world.relationships[rel.id] = rel;
  return world;
}

describe("createWorld (WGE-1000.002)", () => {
  it("creates a world with exactly one root entity", () => {
    const world = familyWorld();
    expect(world.type).toBe("world");
    expect(world.entities[world.rootEntityId]).toBeDefined();
    expect(validateWorld(world).outcome).toBe("valid");
  });

  it("requires a name", () => {
    expect(() => createWorld({ name: "" })).toThrow(/name/);
  });
});

describe("validateWorld — kernel rejections (REF-1900.006)", () => {
  it("rejects a missing root entity", () => {
    const world = familyWorld();
    delete world.entities[world.rootEntityId];
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(result.diagnostics.some((d) => d.code === "KERNEL_ROOT_MISSING")).toBe(true);
  });

  it("rejects duplicate entity ids (index key/id disagreement)", () => {
    const world = familyWorld();
    const impostor = createEntity({
      id: "person_impostor",
      worldId: world.id,
      type: "person"
    });
    world.entities["person_emma"] = impostor; // collides with existing key
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(result.diagnostics.some((d) => d.code === "KERNEL_DUPLICATE_ID")).toBe(true);
  });

  it("rejects orphan active entities", () => {
    const world = familyWorld();
    const orphan = createEntity({
      id: "person_orphan",
      worldId: world.id,
      type: "person",
      lifecycle: "active"
    });
    world.entities[orphan.id] = orphan; // no relationship connects it
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(result.diagnostics.some((d) => d.code === "KERNEL_ORPHAN_ENTITY")).toBe(true);
  });

  it("accepts archived entities without relationships (only active orphans are invalid)", () => {
    const world = familyWorld();
    const archived = createEntity({
      id: "person_archived",
      worldId: world.id,
      type: "person",
      lifecycle: "archived"
    });
    world.entities[archived.id] = archived;
    expect(validateWorld(world).outcome).toBe("valid");
  });

  it("rejects relationships to missing entities", () => {
    const world = familyWorld();
    const dangling = createRelationship({
      id: "rel_dangling",
      worldId: world.id,
      fromEntityId: world.rootEntityId,
      toEntityId: "person_ghost",
      type: "contains"
    });
    world.relationships[dangling.id] = dangling;
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(
      result.diagnostics.some((d) => d.code === "KERNEL_RELATIONSHIP_MISSING_ENTITY")
    ).toBe(true);
  });

  it("rejects laws referencing missing targets", () => {
    const world = familyWorld();
    const law = createLaw({
      id: "law_ghost",
      worldId: world.id,
      name: "Ghost law",
      scope: "world",
      appliesTo: { kind: "id", value: "entity_ghost" },
      condition: { op: "exists", selector: { kind: "id", value: "entity_ghost" } },
      outcome: "reject"
    });
    world.laws[law.id] = law;
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(result.diagnostics.some((d) => d.code === "KERNEL_LAW_MISSING_TARGET")).toBe(true);
  });

  it("rejects traversals with missing entry points", () => {
    const world = familyWorld();
    const traversal = createTraversal({
      id: "traversal_ghost",
      worldId: world.id,
      name: "Ghost traversal",
      entry: { kind: "id", value: "entity_ghost" }
    });
    world.traversals[traversal.id] = traversal;
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(
      result.diagnostics.some((d) => d.code === "KERNEL_TRAVERSAL_MISSING_ENTRY")
    ).toBe(true);
  });

  it("rejects renderer-specific references in kernel primitives", () => {
    const world = familyWorld();
    const emma = world.entities["person_emma"];
    emma?.aspects.push(
      createAspect({
        entityId: "person_emma",
        kind: "css",
        data: { className: "pretty" }
      })
    );
    const result = validateWorld(world);
    expect(result.outcome).toBe("invalid");
    expect(result.diagnostics.some((d) => d.code === "KERNEL_RENDERER_REFERENCE")).toBe(true);
  });

  it("allows projection_hint aspects (rendering intent without renderer coupling)", () => {
    const world = familyWorld();
    const emma = world.entities["person_emma"];
    emma?.aspects.push(
      createAspect({
        entityId: "person_emma",
        kind: "projection_hint",
        data: { emphasis: "primary" }
      })
    );
    expect(validateWorld(world).outcome).toBe("valid");
  });

  it("provides required diagnostic fields (WGE-1000.012)", () => {
    const world = familyWorld();
    delete world.entities[world.rootEntityId];
    const [diagnostic] = validateWorld(world).diagnostics;
    expect(diagnostic?.code).toBeTruthy();
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.message).toBeTruthy();
    expect(diagnostic?.affectedIds?.length).toBeGreaterThan(0);
    expect(diagnostic?.suggestedResolution).toBeTruthy();
  });
});

describe("createSnapshot (WGE-1000.009)", () => {
  it("snapshots are immutable — mutation attempts throw", () => {
    const snapshot = createSnapshot({ world: familyWorld() });
    expect(() => {
      (snapshot as { id: string }).id = "snap_hacked";
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(snapshot, { metadata: {} });
    }).toThrow(TypeError);
  });

  it("hashes are deterministic for identical world content", () => {
    const a = createSnapshot({ world: familyWorld(), id: "snap_a", createdAt: "2026-07-06T00:00:00Z" });
    const b = createSnapshot({ world: familyWorld(), id: "snap_b", createdAt: "2026-07-06T00:00:01Z" });
    expect(a.entityIndexHash).toBe(b.entityIndexHash);
    expect(a.relationshipIndexHash).toBe(b.relationshipIndexHash);
    expect(a.lawIndexHash).toBe(b.lawIndexHash);
    expect(snapshotsEquivalent(a, b)).toBe(true);
  });

  it("hashes change when world content changes", () => {
    const world = familyWorld();
    const before = createSnapshot({ world });
    const lila = createEntity({ id: "person_lila", worldId: world.id, type: "person", lifecycle: "active", createdAt: FIXED_NOW });
    world.entities[lila.id] = lila;
    const after = createSnapshot({ world, parentSnapshotId: before.id });
    expect(after.entityIndexHash).not.toBe(before.entityIndexHash);
    expect(after.parentSnapshotId).toBe(before.id);
    expect(snapshotsEquivalent(before, after)).toBe(false);
  });
});

describe("createDiff (WGE-1000.010)", () => {
  it("requires snapshot binding and traceability", () => {
    expect(() =>
      createDiff({ worldId: "w", fromSnapshotId: "", operations: [], traceId: "t" })
    ).toThrow();
    expect(() =>
      createDiff({ worldId: "w", fromSnapshotId: "s", operations: [], traceId: "" })
    ).toThrow();
  });

  it("flags diffs whose base does not match the current snapshot", () => {
    const world = familyWorld();
    const current = createSnapshot({ world, id: "snap_current" });
    const stale = createDiff({
      worldId: world.id,
      fromSnapshotId: "snap_old",
      operations: [],
      traceId: "trace_1"
    });
    const diagnostic = checkDiffBase(stale, current);
    expect(diagnostic?.code).toBe("KERNEL_DIFF_BASE_MISMATCH");
    expect(diagnostic?.suggestedResolution).toContain("conflict resolution");

    const fresh = createDiff({
      worldId: world.id,
      fromSnapshotId: "snap_current",
      operations: [],
      traceId: "trace_1"
    });
    expect(checkDiffBase(fresh, current)).toBeUndefined();
  });
});

describe("resolveSelector (WGE-1000.011)", () => {
  it("resolves root, id, type, and aspect selectors deterministically", () => {
    const world = familyWorld();
    const emma = world.entities["person_emma"];
    emma?.aspects.push(
      createAspect({ entityId: "person_emma", kind: "identity", data: { name: "Emma" } })
    );

    expect(resolveSelector(world, { kind: "root" }).entities[0]?.id).toBe(world.rootEntityId);
    expect(resolveSelector(world, { kind: "id", value: "person_emma" }).entities[0]?.id).toBe("person_emma");
    expect(resolveSelector(world, { kind: "type", value: "person" }).entities.map((e) => e.id)).toEqual(["person_emma"]);
    expect(resolveSelector(world, { kind: "aspect", value: "identity" }).entities[0]?.id).toBe("person_emma");
    expect(resolveSelector(world, { kind: "relationship", value: "contains" }).relationships[0]?.id).toBe("rel_root_emma");
  });

  it("returns identical results across repeated resolution (determinism)", () => {
    const world = familyWorld();
    const first = resolveSelector(world, { kind: "type", value: "person" });
    const second = resolveSelector(world, { kind: "type", value: "person" });
    expect(first).toEqual(second);
  });
});
