/**
 * End-to-end tests (REF-1900.019, REF-1900.020).
 *
 * The Reference Implementation is not valid because it runs. It is valid
 * because it proves the invariants.
 */
import { describe, expect, it } from "vitest";
import type { WILActor } from "@roc/types";
import { runDemo } from "@apps/reference-demo";
import { familyStyleWorld } from "@examples/family-style-world";
import { createCompilerClient, WILBuilder } from "@roc/sdk";
import { ProjectionTestHarness, RuntimeTestHarness } from "@roc/testing";
import { validateWILMessage } from "@wge/wil";
import { projectionInputFromWorld } from "@sli/runtime";

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view"]
  }
};

const doc = () => familyStyleWorld() as unknown as Record<string, unknown>;

describe("REF-1900.020 — the first five critical tests", () => {
  it("1. A WIL message without an Actor is rejected", () => {
    const message = WILBuilder.message()
      .actor(emma)
      .intent({ type: "observe" })
      .target({ kind: "world" })
      .context({ worldId: "world_family" })
      .mode("observe")
      .build();
    const stripped = { ...message } as Record<string, unknown>;
    delete stripped.actor;
    const result = validateWILMessage(stripped);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WIL_ACTOR_MISSING")).toBe(true);
  });

  it("2. A Relationship to a missing Entity fails compilation", async () => {
    const world = familyStyleWorld();
    world.relationships?.push({ from: "person_ghost", type: "owns", to: "closet_emma" });
    const compiler = createCompilerClient();
    const result = await compiler.compile({
      sources: [{ id: "bad", format: "wdl", content: world as unknown as Record<string, unknown> }]
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WGE1200-REL-001")).toBe(true);
  });

  it("3. Simulate mode does not mutate the Reality Snapshot", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc());
    await harness.expectNoRealityMutation(async () => {
      await harness.send(
        WILBuilder.message()
          .actor(emma)
          .intent({ type: "create", reason: "simulated plan" })
          .target({ kind: "entity", id: "plan_sim" })
          .context({ worldId: "world_family" })
          .mode("simulate")
          .payload({
            id: "plan_sim",
            type: "outfit_plan",
            containedBy: "household_primary",
            aspects: [{ kind: "state", data: { status: "draft" } }]
          })
          .build()
      );
    });
  });

  it("4. Commit mode creates a new Snapshot and Diff", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc());
    const before = await harness.currentSnapshot();
    const snapshot = await harness.expectCommittedSnapshot(async () => {
      const output = await harness.send(
        WILBuilder.message()
          .actor(emma)
          .intent({ type: "create", reason: "new scarf" })
          .target({ kind: "entity", id: "garment_scarf" })
          .context({ worldId: "world_family", snapshotId: before.id })
          .mode("commit")
          .payload({
            id: "garment_scarf",
            type: "garment",
            containedBy: "closet_emma",
            aspects: [{ kind: "application", data: { "availability.status": "available" } }]
          })
          .build()
      );
      expect(output.diff?.operations.length).toBeGreaterThan(0);
      expect(output.diff?.fromSnapshotId).toBe(before.id);
    });
    expect(snapshot.parentSnapshotId).toBe(before.id);
  });

  it("5. SLI Projection produces exactly one primary Entity", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc());
    const projections = new ProjectionTestHarness();
    const output = await projections.project(
      projectionInputFromWorld({
        world: harness.wgeRuntime.realityWorld(),
        snapshotId: (await harness.currentSnapshot()).id,
        actor: emma,
        traceId: "trace_e2e",
        objectiveId: "objective_plan_family_look"
      })
    );
    projections.expectSinglePrimary(output);
    projections.expectAccessible(output);
    projections.expectEntityVisible(output, "household_primary");
  });
});

describe("REF-1900.019 — the First End-To-End Demo", () => {
  it("completes every success criterion and answers every demo question", async () => {
    const lines: string[] = [];
    const result = await runDemo((line) => lines.push(line));
    if (!result.success) {
      throw new Error(`demo failed: ${result.failures.join("; ")}\n${lines.join("\n")}`);
    }
    expect(result.success).toBe(true);
    expect(Object.keys(result.answers)).toEqual([
      "What changed?",
      "Why did it change?",
      "Who caused it?",
      "What was simulated?",
      "What became Reality?",
      "Why is this visible now?"
    ]);
    for (const answer of Object.values(result.answers)) {
      expect(answer).toBeTruthy();
      expect(answer).not.toContain("undefined");
    }
  });
});
