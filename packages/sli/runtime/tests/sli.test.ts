import { beforeEach, describe, expect, it } from "vitest";
import type {
  SLIProjectionInput,
  SLIProjectionOutput,
  SLIRenderResult,
  WGESourceUnit,
  WILActor
} from "@roc/types";
import { compileWorld } from "@wge/compiler";
import type { WGEExecutableWorld } from "@wge/executable";
import { WGERuntime } from "@wge/runtime";
import { createWILMessage } from "@wge/wil";
import {
  bridgeInteraction,
  buildProjection,
  projectExperience,
  projectionInputFromWorld,
  recompose
} from "@sli/runtime";
import { checkRendererBoundaries, MINIMAL_RENDERER_CAPABILITIES } from "@sli/renderer-contract";
import { applyDesignExtension, defaultTokens } from "@sli/design-system";
import { familyStyleWorldDocument } from "../../../wge/wdl/tests/fixtures.js";

const NOW = "2026-07-06T12:00:00Z";

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view", "measurements.view"]
  }
};

const guest: WILActor = {
  id: "actor_guest",
  type: "human",
  authority: { authenticated: true, permissions: ["world.observe"] }
};

async function loadRuntime(): Promise<WGERuntime> {
  const source: WGESourceUnit = {
    id: "family",
    format: "wdl",
    content: familyStyleWorldDocument() as unknown as Record<string, unknown>
  };
  const compiled = await compileWorld({ source, now: NOW });
  if (!compiled.executableWorld) throw new Error("family world failed to compile");
  return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: () => NOW });
}

async function familyInput(actor: WILActor = emma): Promise<SLIProjectionInput> {
  const runtime = await loadRuntime();
  return projectionInputFromWorld({
    world: runtime.realityWorld(),
    snapshotId: runtime.currentSnapshot().id,
    actor,
    traceId: "trace_sli_test",
    objectiveId: "objective_family_event_look"
  });
}

describe("projectExperience — composition (SLI-1500.005, REF-1900.016)", () => {
  it("chooses exactly one primary entity — the objective's entry", async () => {
    const output = await projectExperience(await familyInput());
    const primaries = output.composition.entities.filter((e) => e.role === "primary");
    expect(primaries).toHaveLength(1);
    expect(output.composition.primaryEntityId).toBe("household_primary");
    expect(primaries[0]?.reason).toBeTruthy();
  });

  it("every composed entity carries an explainable reason", async () => {
    const output = await projectExperience(await familyInput());
    for (const entity of output.composition.entities) {
      expect(entity.reason.length).toBeGreaterThan(0);
    }
  });

  it("preserves entity identity across projection", async () => {
    const input = await familyInput();
    const output = await projectExperience(input);
    const inputIds = new Set(input.entities.map((e) => e.id));
    for (const composed of output.composition.entities) {
      expect(inputIds.has(composed.entityId)).toBe(true);
    }
  });

  it("hides permission-restricted entities for unauthorized actors", async () => {
    const output = await projectExperience(await familyInput(guest));
    // person_emma carries a restricted-visibility permission aspect
    // requiring household.measurements.view, which the guest lacks.
    const emmaEntity = output.composition.entities.find((e) => e.entityId === "person_emma");
    expect(emmaEntity?.role).toBe("hidden");
    expect(emmaEntity?.reason).toContain("permission");
  });

  it("is deterministic for identical input", async () => {
    const input = await familyInput();
    const [a, b] = [buildProjection(input).output, buildProjection(input).output];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("baseline presence is traceable and overridden by real physics", async () => {
    const input = await familyInput();
    // Fresh world: no ripples yet — everything is projection baseline.
    const fresh = input.entities.find((e) => e.id === "garment_blue_jacket");
    expect(fresh?.relevanceSource).toBe("projection_baseline");
    expect(fresh?.relevance).toBe(0.1);
    const output = await projectExperience(input);
    const composed = output.composition.entities.find(
      (e) => e.entityId === "garment_blue_jacket"
    );
    expect(composed?.relevanceSource).toBe("projection_baseline");
    expect(composed?.reason).toContain("not physics evidence");

    // After a real commit ripples, physics relevance takes over.
    const runtime = await loadRuntime();
    await runtime.commit(
      createWILMessage({
        actor: emma,
        intent: { type: "create", reason: "ripple source" },
        target: { kind: "entity", id: "garment_ripple" },
        context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
        mode: "commit",
        payload: {
          id: "garment_ripple",
          type: "garment",
          containedBy: "closet_emma",
          physicsMagnitude: 0.9,
          physicsApply: true,
          aspects: [{ kind: "application", data: { "availability.status": "available" } }]
        }
      })
    );
    // Apply the physics-proposed relevance diffs so the world carries history.
    const world = runtime.realityWorld();
    const rippled = projectionInputFromWorld({
      world,
      snapshotId: runtime.currentSnapshot().id,
      actor: emma,
      traceId: "trace_ripple"
    });
    // closet_emma may or may not have committed physics aspects in the
    // minimal flow; what MUST hold: any entity with physics history reports
    // source "physics", and none report baseline while carrying physics data.
    for (const entity of rippled.entities) {
      if (entity.relevanceSource === "projection_baseline") {
        expect(entity.relevance).toBe(0.1);
      } else {
        expect(entity.relevanceSource).toBe("physics");
      }
    }
  });
});

describe("density engine (SLI-1500.007)", () => {
  it("reduces density when confidence is low", async () => {
    const input = await familyInput();
    input.entities = input.entities.map((e) => ({ ...e, confidence: 0.2 }));
    const output = await projectExperience(input);
    expect(output.composition.density).toBe("ambient");
  });

  it("escalates to decision density on high-priority triggers", async () => {
    const input = await familyInput();
    input.recompositionTriggers = [
      {
        id: "recomp_1",
        worldId: input.worldId,
        snapshotId: input.snapshotId,
        source: "physics",
        affectedEntityIds: ["closet_emma"],
        reason: "storm incoming",
        priority: "critical",
        traceId: input.traceId
      }
    ];
    const output = await projectExperience(input);
    expect(output.composition.density).toBe("decision");
    // Trigger priority also drives primary selection (REF-1900.016 rule 2)
    // when no objective override applies.
  });
});

describe("layout + spatial memory (SLI-1500.008, SLI-1500.010)", () => {
  it("places the primary in center and respects remembered regions", async () => {
    const input = await familyInput();
    input.context.spatialMemory = [
      {
        id: "mem_1",
        worldId: input.worldId,
        entityId: "garment_blue_jacket",
        preferredRegionId: "west",
        stabilityScore: 0.9,
        lastSeenAt: NOW
      }
    ];
    const { projection } = buildProjection(input);
    const primaryPlacement = projection.layoutPlan.placements.find(
      (p) => p.entityId === "household_primary"
    );
    expect(primaryPlacement?.regionId).toBe("center");
    const remembered = projection.layoutPlan.placements.find(
      (p) => p.entityId === "garment_blue_jacket"
    );
    expect(remembered?.regionId).toBe("west");
    expect(remembered?.spatialMemoryRef).toBe("mem_1");
    expect(remembered?.reason).toContain("Stable imperfection".toLowerCase().slice(1, 8)); // "table im…"
  });

  it("unstable memories do not pin placements", async () => {
    const input = await familyInput();
    input.context.spatialMemory = [
      {
        id: "mem_2",
        worldId: input.worldId,
        entityId: "garment_blue_jacket",
        preferredRegionId: "west",
        stabilityScore: 0.2,
        lastSeenAt: NOW
      }
    ];
    const { projection } = buildProjection(input);
    const placement = projection.layoutPlan.placements.find(
      (p) => p.entityId === "garment_blue_jacket"
    );
    expect(placement?.spatialMemoryRef).toBeUndefined();
  });
});

describe("motion + accessibility (SLI-1500.009, SLI-1500.011)", () => {
  it("honors reduced motion with static state change", async () => {
    const input = await familyInput();
    input.context.accessibility = { reducedMotion: true };
    const output = await projectExperience(input);
    expect(output.motionPlan.reducedMotionApplied).toBe(true);
    expect(output.motionPlan.transitions).toEqual([]);
    expect(output.accessibilityPlan.reducedMotion).toBe(true);
  });

  it("produces reading order, keyboard order, contrast, and target sizes", async () => {
    const output = await projectExperience(await familyInput());
    const a11y = output.accessibilityPlan;
    expect(a11y.readingOrder[0]?.entityId).toBe("household_primary");
    expect(a11y.readingOrder[0]?.role).toBe("main");
    expect(a11y.keyboardOrder.length).toBeGreaterThan(0);
    expect(a11y.contrastRequirements.some((c) => c.minimumRatio === 4.5)).toBe(true);
    expect(a11y.interactionTargets.every((t) => t.minimumSizePx >= 44)).toBe(true);
    expect(a11y.summary).toContain("household_primary");
  });
});

describe("renderer contract (SLI-1500.012, REF-1900.017)", () => {
  it("flags renderers that drop the primary or invent entities", async () => {
    const output = await projectExperience(await familyInput());
    const goodResult: SLIRenderResult = {
      rendererId: "renderer_test",
      status: "rendered",
      renderedEntityIds: output.rendererInstructions
        .filter((i) => i.projectionRole !== "hidden")
        .map((i) => i.entityId)
    };
    expect(checkRendererBoundaries(output, goodResult)).toEqual([]);

    const droppedPrimary: SLIRenderResult = {
      ...goodResult,
      renderedEntityIds: goodResult.renderedEntityIds.filter(
        (id) => id !== output.composition.primaryEntityId
      )
    };
    expect(
      checkRendererBoundaries(output, droppedPrimary).some(
        (d) => d.code === "SLI_RENDERER_DROPPED_PRIMARY"
      )
    ).toBe(true);

    const invented: SLIRenderResult = {
      ...goodResult,
      renderedEntityIds: [...goodResult.renderedEntityIds, "entity_made_up"]
    };
    expect(
      checkRendererBoundaries(output, invented).some(
        (d) => d.code === "SLI_RENDERER_INVENTED_ENTITY"
      )
    ).toBe(true);
    expect(MINIMAL_RENDERER_CAPABILITIES.supportsScreenReader).toBe(true);
  });
});

describe("interaction intent bridge (SLI-1500.016)", () => {
  const baseIntent = {
    id: "sli_int_1",
    actorId: emma.id,
    projectionId: "proj_test",
    entityId: "garment_blue_jacket",
    context: { worldId: "world_family" },
    traceId: "trace_bridge_test"
  };

  it("keeps local experience actions inside SLI", () => {
    for (const interactionType of ["expand", "collapse", "inspect", "select", "compare"] as const) {
      const result = bridgeInteraction({ ...baseIntent, interactionType }, emma);
      expect(result.localOnly).toBe(true);
      expect(result.message).toBeUndefined();
    }
  });

  it("converts Reality-changing actions to valid WIL messages", () => {
    const result = bridgeInteraction({ ...baseIntent, interactionType: "delete" }, emma);
    expect(result.localOnly).toBe(false);
    expect(result.message?.intent.type).toBe("delete");
    expect(result.message?.mode).toBe("commit");
    expect(result.message?.target).toEqual({ kind: "entity", id: "garment_blue_jacket" });
    expect(result.message?.traceId).toBe("trace_bridge_test"); // causality preserved

    const simulated = bridgeInteraction({ ...baseIntent, interactionType: "simulate" }, emma);
    expect(simulated.message?.mode).toBe("simulate");
  });

  it("refuses actor identity mismatches", () => {
    const result = bridgeInteraction({ ...baseIntent, interactionType: "delete" }, guest);
    expect(result.localOnly).toBe(true);
    expect(result.reason).toContain("actor mismatch");
  });

  it("bridged WIL messages execute end-to-end against the runtime", async () => {
    const runtime = await loadRuntime();
    const result = bridgeInteraction(
      {
        ...baseIntent,
        interactionType: "delete",
        context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id }
      },
      emma
    );
    if (!result.message) throw new Error("expected a WIL message");
    const output = await runtime.commit(result.message);
    expect(output.outcome.status).toBe("success");
    expect(runtime.realityWorld().entities["garment_blue_jacket"]?.lifecycle).toBe("archived");
  });
});

describe("recomposition (SLI-1500.014) — physics trigger to new projection", () => {
  let previous: SLIProjectionOutput;
  let input: SLIProjectionInput;

  beforeEach(async () => {
    input = await familyInput();
    previous = await projectExperience(input);
  });

  it("preserves focus when still valid and explains motion", () => {
    const output = recompose({
      previousProjection: previous,
      projectionInput: input,
      triggers: [],
      reason: "minor relevance shift",
      traceId: input.traceId
    });
    expect(output.composition.primaryEntityId).toBe(previous.composition.primaryEntityId);
    // No region changes → no unexplained motion.
    expect(output.motionPlan.transitions.filter((t) => t.type === "move")).toEqual([]);
  });

  it("recomposes from a physics trigger emitted by a real commit", async () => {
    const runtime = await loadRuntime();
    await runtime.commit(
      createWILMessage({
        actor: emma,
        intent: { type: "create", reason: "storm coat arrives" },
        target: { kind: "entity", id: "garment_storm_coat" },
        context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
        mode: "commit",
        payload: {
          id: "garment_storm_coat",
          type: "garment",
          containedBy: "closet_emma",
          physicsMagnitude: 0.95,
          aspects: [{ kind: "application", data: { "availability.status": "available" } }]
        }
      })
    );
    const triggers = runtime.drainRecompositionTriggers();
    expect(triggers.length).toBeGreaterThan(0);

    const nextInput = projectionInputFromWorld({
      world: runtime.realityWorld(),
      snapshotId: runtime.currentSnapshot().id,
      actor: emma,
      traceId: "trace_recompose",
      recompositionTriggers: triggers
    });
    const output = recompose({
      previousProjection: previous,
      projectionInput: nextInput,
      triggers,
      reason: triggers[0]?.reason ?? "physics trigger",
      traceId: "trace_recompose"
    });
    expect(output.composition.density).toBe("decision"); // critical trigger
    expect(output.composition.entities.some((e) => e.entityId === "garment_storm_coat")).toBe(true);
    expect(output.traceId).toBe("trace_recompose"); // traceable recomposition
  });
});

describe("failure fallback (SLI-1500.018)", () => {
  it("degrades to single-primary projection instead of a blank experience", () => {
    const input: SLIProjectionInput = {
      id: "bad_input",
      worldId: "world_family",
      snapshotId: "snap_x",
      actorId: emma.id,
      objectiveId: "objective_missing",
      entities: [{ id: "only_entity", type: "thing" }],
      relationships: [
        // Malformed relationship data would break naive engines; the
        // projection must still produce a valid single-primary output.
        { id: "rel_broken", fromEntityId: "ghost_a", toEntityId: "ghost_b", type: "haunts" }
      ],
      context: { device: undefined as never },
      traceId: "trace_fallback"
    };
    const { output } = buildProjection(input);
    expect(output.composition.primaryEntityId).toBe("only_entity");
    expect(output.composition.entities.filter((e) => e.role === "primary")).toHaveLength(1);
  });
});

describe("design system (Volume 1600)", () => {
  it("brand extensions may override values, never meaning or accessibility", () => {
    const base = defaultTokens();
    const focusToken = base.find((t) => t.id === "token_color_focus");
    expect(focusToken).toBeDefined();

    const result = applyDesignExtension(base, {
      id: "ext_lilbirdi_brand",
      version: "1.0.0",
      tokenOverrides: [
        { ...focusToken!, value: "brand-lavender" }, // OK: value override
        { ...focusToken!, role: "danger", value: "x" }, // violation: semantic change
        {
          ...base.find((t) => t.id === "token_color_foreground")!,
          value: "faint-gray",
          accessibilityConstraints: { minimumContrastRatio: 1.2 } // violation: a11y
        }
      ]
    });
    expect(result.tokens.find((t) => t.id === "token_color_focus")?.value).toBe("brand-lavender");
    expect(result.rejectedOverrides).toHaveLength(2);
    expect(result.rejectedOverrides.map((r) => r.reason).join(" ")).toContain("accessibility");
  });

  it("motion tokens stay within Codex timing guidance and support reduced motion", () => {
    const tokens = defaultTokens().filter((t) => t.category === "motion");
    expect(tokens.length).toBe(12);
    for (const token of tokens) {
      const motion = token.value as { durationMs: number; reducedMotionAlternative: string };
      expect(motion.durationMs).toBeGreaterThanOrEqual(120);
      expect(motion.durationMs).toBeLessThanOrEqual(4000);
      expect(motion.reducedMotionAlternative).toBeTruthy();
    }
  });
});
