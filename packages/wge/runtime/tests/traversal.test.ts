import { beforeEach, describe, expect, it } from "vitest";
import type { WGESourceUnit, WGEPhysicsExecutionResult, WILActor } from "@roc/types";
import { compileWorld } from "@wge/compiler";
import type { WGEExecutableWorld } from "@wge/executable";
import { createWILMessage } from "@wge/wil";
import { WGERuntime } from "@wge/runtime";
import { familyStyleWorldDocument } from "../../wdl/tests/fixtures.js";

const NOW = "2026-07-06T12:00:00Z";

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "measurements.view"]
  }
};

async function loadRuntime(
  mutate?: (doc: ReturnType<typeof familyStyleWorldDocument>) => void
): Promise<WGERuntime> {
  const doc = familyStyleWorldDocument();
  mutate?.(doc);
  const source: WGESourceUnit = {
    id: "family",
    format: "wdl",
    content: doc as unknown as Record<string, unknown>
  };
  const compiled = await compileWorld({ source, now: NOW });
  if (!compiled.executableWorld) throw new Error("family world failed to compile");
  return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: () => NOW });
}

function traverseMessage(traversalId: string) {
  return createWILMessage({
    actor: emma,
    intent: { type: "traverse", reason: "explore the closet graph" },
    target: { kind: "traversal", id: traversalId },
    context: { worldId: "world_family" },
    mode: "observe"
  });
}

describe("traversal runtime (WGE-1300.010, REF-1900.014)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  it("executes the coordinate-group-style traversal and collects the chain", async () => {
    const output = await runtime.observe(traverseMessage("traversal_coordinate_group_style"));
    expect(output.outcome.status).toBe("success");
    const result = output.metadata?.traversal as {
      collectedEntityIds: string[];
      visitedEntityIds: string[];
      confidence: number;
    };
    expect(result.collectedEntityIds).toEqual([
      "closet_emma",
      "garment_blue_jacket",
      "person_emma"
    ]);
    expect(result.visitedEntityIds).toContain("household_primary");
    expect(result.confidence).toBeGreaterThan(0);
    expect(runtime.currentSnapshot().id).toBe("snap_world_family__initial"); // no mutation
  });

  it("laws exclude failing entities from collection with blocked paths recorded", async () => {
    const withSoldOut = await loadRuntime((doc) => {
      doc.entities?.push({
        id: "garment_sold_out",
        type: "garment",
        aspects: [{ kind: "application", data: { "availability.status": "sold_out" } }]
      });
      doc.relationships?.push({ from: "closet_emma", type: "contains", to: "garment_sold_out" });
    });
    const output = await withSoldOut.observe(traverseMessage("traversal_coordinate_group_style"));
    const result = output.metadata?.traversal as {
      collectedEntityIds: string[];
      blockedPaths: { entityId: string; blockedByLawId?: string }[];
      appliedLawIds: string[];
    };
    expect(result.collectedEntityIds).not.toContain("garment_sold_out");
    expect(result.collectedEntityIds).toContain("garment_blue_jacket");
    expect(
      result.blockedPaths.some(
        (b) =>
          b.entityId === "garment_sold_out" &&
          b.blockedByLawId === "law_garments_must_be_available_before_recommendation"
      )
    ).toBe(true);
  });

  it("is deterministic across repeated execution", async () => {
    const first = await runtime.observe(traverseMessage("traversal_coordinate_group_style"));
    const second = await runtime.observe(traverseMessage("traversal_coordinate_group_style"));
    expect(JSON.stringify(first.metadata?.traversal)).toBe(
      JSON.stringify(second.metadata?.traversal)
    );
  });

  it("rejects traversals that do not exist", async () => {
    const output = await runtime.observe(traverseMessage("traversal_ghost"));
    expect(output.outcome.status).toBe("rejected");
  });
});

describe("physics integration (WGE-1300.005, WGE-1400.016, WGE-1400.019)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  const newGarment = (id: string) => ({
    id,
    type: "garment",
    containedBy: "closet_emma",
    physicsMagnitude: 0.9,
    aspects: [{ kind: "application", data: { "availability.status": "available" } }]
  });

  it("commits ripple through the graph and queue recomposition triggers", async () => {
    const output = await runtime.commit(
      createWILMessage({
        actor: emma,
        intent: { type: "create", reason: "new jacket arrived" },
        target: { kind: "entity", id: "garment_new_arrival" },
        context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
        mode: "commit",
        payload: newGarment("garment_new_arrival")
      })
    );
    expect(output.outcome.status).toBe("success");
    const physics = output.metadata?.physics as WGEPhysicsExecutionResult;
    expect(physics.affectedEntities.length).toBeGreaterThan(1); // rippled beyond origin
    expect(physics.recompositionTriggers.length).toBeGreaterThan(0);
    expect(output.trace.steps.some((s) => s.phase === "physics_applied")).toBe(true);

    const triggers = runtime.drainRecompositionTriggers();
    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0]?.source).toBe("physics");
    expect(runtime.drainRecompositionTriggers()).toEqual([]); // drained
  });

  it("candidate-world physics stays isolated from Reality (WGE-1400.016)", async () => {
    const output = await runtime.simulate(
      createWILMessage({
        actor: emma,
        intent: { type: "create", reason: "what if a new jacket" },
        target: { kind: "entity", id: "garment_hypothetical" },
        context: { worldId: "world_family" },
        mode: "simulate",
        payload: newGarment("garment_hypothetical")
      })
    );
    expect(output.outcome.status).toBe("simulation");
    const physics = output.metadata?.physics as WGEPhysicsExecutionResult;
    expect(physics.affectedEntities.length).toBeGreaterThan(1); // physics ran in the candidate
    // Isolation: Reality's recomposition queue stays empty.
    expect(runtime.drainRecompositionTriggers()).toEqual([]);
    expect(runtime.realityWorld().entities["garment_hypothetical"]).toBeUndefined();
  });
});
