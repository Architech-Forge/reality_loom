import { describe, expect, it } from "vitest";
import type { WGEPhysicsEvent, WGEWorld, WILActor, WILContext } from "@roc/types";
import { runPhysics } from "@wge/physics";
import {
  createAspect,
  createEntity,
  createLaw,
  createRelationship,
  createWorld
} from "@wge/kernel";

const NOW = "2026-07-06T12:00:00Z";

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: { authenticated: true, permissions: ["world.observe", "measurements.view"] }
};

const context: WILContext = { worldId: "world_family" };

/**
 * Chain world: root → household → emma → closet → garment, all directed
 * "contains"-style links, so reverse permission is needed to ripple upward.
 */
function chainWorld(): WGEWorld {
  const world = createWorld({ id: "world_family", name: "Family World" });
  const add = (id: string, type: string) => {
    world.entities[id] = createEntity({
      id, worldId: world.id, type, lifecycle: "active", createdAt: NOW
    });
  };
  add("household_primary", "household");
  add("person_emma", "person");
  add("closet_emma", "closet");
  add("garment_blue_jacket", "garment");
  const relate = (id: string, from: string, type: string, to: string, weight?: number, confidence?: number) => {
    world.relationships[id] = createRelationship({
      id, worldId: world.id, fromEntityId: from, toEntityId: to, type,
      ...(weight !== undefined ? { weight } : {}),
      ...(confidence !== undefined ? { confidence } : {})
    });
  };
  relate("rel_1_root_household", world.rootEntityId, "contains", "household_primary", 100);
  relate("rel_2_household_emma", "household_primary", "includes_person", "person_emma", 100);
  relate("rel_3_emma_closet", "person_emma", "owns", "closet_emma", 100);
  relate("rel_4_closet_garment", "closet_emma", "contains", "garment_blue_jacket", 100);
  return world;
}

function event(originEntityId: string, magnitude = 0.8, confidence = 1): WGEPhysicsEvent {
  return {
    id: "pev_test_1",
    worldId: "world_family",
    snapshotId: "snap_test",
    originEntityId,
    type: "weather.rain_detected",
    actorId: emma.id,
    traceId: "trace_physics_test",
    magnitude,
    confidence,
    occurredAt: NOW
  };
}

describe("runPhysics — event validation (WGE-1400.002)", () => {
  it("rejects events without origin/actor/snapshot/trace", () => {
    const bad = { ...event("garment_blue_jacket"), traceId: "" };
    const result = runPhysics({ world: chainWorld(), event: bad, actor: emma, context });
    expect(result.diagnostics?.some((d) => d.code === "PHYSICS_EVENT_INVALID")).toBe(true);
    expect(result.affectedEntities).toEqual([]);
  });

  it("rejects events whose origin does not exist", () => {
    const result = runPhysics({ world: chainWorld(), event: event("entity_ghost"), actor: emma, context });
    expect(result.diagnostics?.some((d) => d.code === "PHYSICS_ORIGIN_MISSING")).toBe(true);
  });
});

describe("Law 1 — Locality (WGE-1400.004)", () => {
  it("propagates depth-limited: default depth 2 does not reach depth 3", () => {
    const result = runPhysics({
      world: chainWorld(),
      event: event("garment_blue_jacket"),
      actor: emma,
      context,
      permitReverse: true
    });
    const ids = result.affectedEntities.map((a) => a.entityId);
    expect(ids).toContain("garment_blue_jacket"); // depth 0
    expect(ids).toContain("closet_emma"); // depth 1
    expect(ids).toContain("person_emma"); // depth 2
    expect(ids).not.toContain("household_primary"); // depth 3 — beyond locality
  });

  it("expands with an explicit locality radius", () => {
    const result = runPhysics({
      world: chainWorld(),
      event: event("garment_blue_jacket", 1, 1),
      actor: emma,
      context,
      permitReverse: true,
      locality: { maxDepth: 4, minimumMagnitude: 0.01 }
    });
    expect(result.affectedEntities.map((a) => a.entityId)).toContain("household_primary");
  });
});

describe("Law 2 — Propagation (WGE-1400.005)", () => {
  it("does not travel against direction without explicit reverse permission", () => {
    const result = runPhysics({
      world: chainWorld(),
      event: event("garment_blue_jacket"),
      actor: emma,
      context
      // permitReverse omitted
    });
    expect(result.affectedEntities.map((a) => a.entityId)).toEqual(["garment_blue_jacket"]);
  });

  it("zero weight does not propagate; negative weight suppresses", () => {
    const world = chainWorld();
    const rel4 = world.relationships["rel_4_closet_garment"];
    if (rel4) rel4.weight = 0;
    const zero = runPhysics({ world, event: event("closet_emma"), actor: emma, context });
    expect(zero.affectedEntities.map((a) => a.entityId)).toEqual(["closet_emma"]);
    expect(zero.blockedPaths.some((b) => b.reason.includes("zero-weight"))).toBe(true);

    if (rel4) rel4.weight = -50;
    const negative = runPhysics({ world, event: event("closet_emma"), actor: emma, context });
    expect(negative.blockedPaths.some((b) => b.reason.includes("negative weight"))).toBe(true);
  });

  it("influence never travels without a relationship", () => {
    const world = chainWorld();
    world.entities["floating"] = createEntity({
      id: "floating", worldId: world.id, type: "island", lifecycle: "archived", createdAt: NOW
    });
    const result = runPhysics({
      world, event: event("garment_blue_jacket"), actor: emma, context, permitReverse: true
    });
    expect(result.affectedEntities.map((a) => a.entityId)).not.toContain("floating");
  });
});

describe("Law 3 — Decay (WGE-1400.006)", () => {
  it("magnitude attenuates with depth and weak events stop early", () => {
    const strong = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.9), actor: emma, context, permitReverse: true
    });
    const closet = strong.affectedEntities.find((a) => a.entityId === "closet_emma");
    const person = strong.affectedEntities.find((a) => a.entityId === "person_emma");
    expect(closet && person && closet.magnitude > person.magnitude).toBe(true);

    // 0.06 × 0.75 = 0.045 < the 0.05 threshold: the very first hop stops.
    const weak = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.06), actor: emma, context, permitReverse: true
    });
    expect(weak.affectedEntities.map((a) => a.entityId)).toEqual(["garment_blue_jacket"]);
    expect(weak.blockedPaths.some((b) => b.reason.includes("decayed below threshold"))).toBe(true);
  });

  it("cycles terminate: bidirectional relationships do not loop forever", () => {
    const world = chainWorld();
    world.relationships["rel_5_cycle"] = createRelationship({
      id: "rel_5_cycle", worldId: world.id,
      fromEntityId: "closet_emma", toEntityId: "garment_blue_jacket",
      type: "references", direction: "bidirectional", weight: 100
    });
    const result = runPhysics({
      world, event: event("garment_blue_jacket"), actor: emma, context, permitReverse: true
    });
    expect(result.affectedEntities.length).toBeLessThanOrEqual(4);
  });
});

describe("Law 4 — Constraint Blocking (WGE-1400.007)", () => {
  function withPrivacyConstraint(world: WGEWorld): WGEWorld {
    world.laws["constraint_privacy"] = createLaw({
      id: "constraint_privacy",
      worldId: world.id,
      name: "Measurements are private.",
      scope: "world",
      appliesTo: { kind: "type", value: "person" },
      condition: {
        op: "not",
        condition: {
          op: "not",
          condition: {
            op: "has_authority",
            actorRef: { kind: "actor", field: "id" },
            capability: "measurements.view"
          }
        }
      },
      outcome: "reject",
      severity: "error",
      metadata: { constraint: true, source: "wdl", compiledFrom: "constraint" }
    });
    return world;
  }

  it("blocks propagation into protected entities for unauthorized actors — traced", () => {
    const noAuthority: WILActor = {
      id: "actor_guest", type: "human",
      authority: { authenticated: true, permissions: [] }
    };
    const result = runPhysics({
      world: withPrivacyConstraint(chainWorld()),
      event: event("garment_blue_jacket"),
      actor: noAuthority,
      context,
      permitReverse: true
    });
    expect(result.affectedEntities.map((a) => a.entityId)).not.toContain("person_emma");
    const blocked = result.blockedPaths.find((b) => b.blockedByConstraintIds?.includes("constraint_privacy"));
    expect(blocked?.reason).toContain("preservation of World truth");
    expect(result.trace.paths.some((p) => p.blocked && p.appliedConstraints.includes("constraint_privacy"))).toBe(true);
  });

  it("permits propagation for authorized actors", () => {
    const result = runPhysics({
      world: withPrivacyConstraint(chainWorld()),
      event: event("garment_blue_jacket"),
      actor: emma, // has measurements.view
      context,
      permitReverse: true
    });
    expect(result.affectedEntities.map((a) => a.entityId)).toContain("person_emma");
  });
});

describe("Law 5 — Objective Gravity (WGE-1400.008)", () => {
  function withObjective(world: WGEWorld): WGEWorld {
    world.entities["objective_look"] = createEntity({
      id: "objective_look", worldId: world.id, type: "wge.objective",
      lifecycle: "active", createdAt: NOW,
      aspects: [
        createAspect({
          id: "aspect_objective_look__wge.objective_state",
          entityId: "objective_look",
          kind: "wge.objective_state",
          data: {
            objectiveKind: "general", label: "Plan look",
            entry: { selector: { kind: "id", value: "closet_emma" } },
            priority: 90, status: "active",
            source: { language: "wdl", declarationId: "objective_look" }
          }
        })
      ]
    });
    world.relationships["rel_6_root_obj"] = createRelationship({
      id: "rel_6_root_obj", worldId: world.id,
      fromEntityId: world.rootEntityId, toEntityId: "objective_look", type: "contains"
    });
    return world;
  }

  it("active objectives strengthen influence near their entry", () => {
    const plain = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.6), actor: emma, context, permitReverse: true
    });
    const boosted = runPhysics({
      world: withObjective(chainWorld()), event: event("garment_blue_jacket", 0.6), actor: emma, context, permitReverse: true
    });
    const plainCloset = plain.affectedEntities.find((a) => a.entityId === "closet_emma");
    const boostedCloset = boosted.affectedEntities.find((a) => a.entityId === "closet_emma");
    expect(boostedCloset && plainCloset && boostedCloset.magnitude > plainCloset.magnitude).toBe(true);
  });
});

describe("Law 6 — Confidence Transfer (WGE-1400.009)", () => {
  it("confidence attenuates across low-confidence relationships and stays visible", () => {
    const world = chainWorld();
    const rel = world.relationships["rel_4_closet_garment"];
    if (rel) rel.confidence = 0.5;
    const result = runPhysics({
      world, event: event("garment_blue_jacket", 0.9, 0.8), actor: emma, context, permitReverse: true
    });
    const closet = result.affectedEntities.find((a) => a.entityId === "closet_emma");
    expect(closet?.confidence).toBeCloseTo(0.4, 5); // 0.8 × 0.5 — never silently 1.0
  });
});

describe("Law 7 — Temporal Momentum (WGE-1400.010)", () => {
  it("stable patterns damp abrupt influence", () => {
    const world = chainWorld();
    world.entities["closet_emma"]?.aspects.push(
      createAspect({
        id: "aspect_closet_emma__physics",
        entityId: "closet_emma",
        kind: "physics",
        data: { momentum: { patternId: "earth_tones", strength: 0.6 } }
      })
    );
    const damped = runPhysics({
      world, event: event("garment_blue_jacket", 0.8), actor: emma, context, permitReverse: true
    });
    const plain = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.8), actor: emma, context, permitReverse: true
    });
    const dampedCloset = damped.affectedEntities.find((a) => a.entityId === "closet_emma");
    const plainCloset = plain.affectedEntities.find((a) => a.entityId === "closet_emma");
    expect(dampedCloset && plainCloset && dampedCloset.magnitude < plainCloset.magnitude).toBe(true);
  });
});

describe("Law 8 — Reversibility & Trace (WGE-1400.011, WGE-1400.014)", () => {
  it("the trace preserves origin, paths, magnitudes, confidences, and effects", () => {
    const result = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket"), actor: emma, context, permitReverse: true
    });
    expect(result.trace.originEntityId).toBe("garment_blue_jacket");
    expect(result.trace.paths.length).toBeGreaterThan(0);
    for (const path of result.trace.paths.filter((p) => !p.blocked)) {
      expect(path.entityPath[0]).toBe("garment_blue_jacket");
      expect(path.finalMagnitude).toBeLessThan(path.initialMagnitude);
      expect(path.effects.length).toBeGreaterThan(0);
    }
    expect(result.trace.summary).toContain("weather.rain_detected");
  });
});

describe("effects, triggers, determinism (WGE-1400.013, .019, .020)", () => {
  it("effects are proposals: diff operations are emitted, not applied", () => {
    const world = chainWorld();
    const result = runPhysics({
      world, event: event("garment_blue_jacket"), actor: emma, context, permitReverse: true
    });
    expect(result.generatedDiffOperations.length).toBeGreaterThan(0);
    // The source world is untouched — no physics aspects were written.
    expect(world.entities["closet_emma"]?.aspects.some((a) => a.kind === "physics")).toBe(false);
  });

  it("meaningful events request recomposition; weak ones do not", () => {
    const strong = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.95), actor: emma, context, permitReverse: true
    });
    expect(strong.recompositionTriggers[0]?.priority).toBe("critical");
    expect(strong.recompositionTriggers[0]?.affectedEntityIds.length).toBeGreaterThan(0);

    const weak = runPhysics({
      world: chainWorld(), event: event("garment_blue_jacket", 0.1), actor: emma, context, permitReverse: true
    });
    expect(weak.recompositionTriggers).toEqual([]);
  });

  it("produces identical results for identical inputs (determinism)", () => {
    const run = () =>
      runPhysics({
        world: chainWorld(), event: event("garment_blue_jacket"), actor: emma, context, permitReverse: true
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
