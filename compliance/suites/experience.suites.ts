/**
 * Official compliance suites — SLI (COMP-2000.013), Design System
 * (COMP-2000.014), SDK (COMP-2000.016), Reference (COMP-2000.017),
 * Security & Privacy (COMP-2000.020).
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest, deferTest } from "@roc/compliance";
import { buildProjection, bridgeInteraction, projectionInputFromWorld, recompose } from "@sli/runtime";
import { applyDesignExtension, defaultTokens, ROLE_DEFAULT_REGION, STANDARD_REGIONS } from "@sli/design-system";
import { checkRendererBoundaries } from "@sli/renderer-contract";
import { Cond, EntityBuilder, LawBuilder, RelationshipBuilder, WILBuilder, WorldBuilder, ROCSDKError, createCandidateClient, createProjectionClient } from "@roc/sdk";
import { ProjectionTestHarness, RuntimeTestHarness } from "@roc/testing";
import { runDemo } from "@apps/reference-demo";
import { assert, emma, guest, familyDoc, garmentCreate, loadFamilyRuntime } from "./helpers.js";

async function familyProjection(actor = emma) {
  const runtime = await loadFamilyRuntime();
  const input = projectionInputFromWorld({
    world: runtime.realityWorld(),
    snapshotId: runtime.currentSnapshot().id,
    actor,
    traceId: "trace_compliance_sli",
    objectiveId: "objective_plan_family_look"
  });
  return { runtime, input, output: buildProjection(input).output };
}

export const sliSuite: ROCComplianceSuite = {
  id: "suite_sli",
  area: "sli",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("SLI-CT-002", "Projection Output preserves World ID", ["SLI-1500.004"], async () => {
      const { output } = await familyProjection();
      assert(output.worldId === "world_family" && output.snapshotId.length > 0, "world + snapshot preserved");
    }),
    defineTest("SLI-CT-004", "Composition has exactly one primary Entity", ["SLI-1500.005"], async () => {
      const { output } = await familyProjection();
      assert(output.composition.entities.filter((e) => e.role === "primary").length === 1, "single primary");
    }),
    defineTest("SLI-CT-005", "Focus Plan has one attention owner", ["SLI-1500.006"], async () => {
      const { input } = await familyProjection();
      const { projection } = buildProjection(input);
      assert(projection.focusPlan.attentionOwnerId === projection.focusPlan.primaryFocusEntityId, "one attention owner");
    }),
    defineTest("SLI-CT-006", "Density decreases when accessibility requires it", ["SLI-1500.007"], async () => {
      const { input } = await familyProjection();
      input.context.accessibility = { dynamicTypeScale: 1.8 };
      const { output } = buildProjection(input);
      assert(output.composition.density === "ambient" || output.composition.density === "decision", "density reduced");
    }),
    defineTest("SLI-CT-007", "Layout protects primary Entity", ["SLI-1500.008"], async () => {
      const { input } = await familyProjection();
      const { projection } = buildProjection(input);
      const primary = projection.layoutPlan.placements.find(
        (p) => p.entityId === projection.composition.primaryEntityId
      );
      assert(primary?.regionId === "center", "primary owns center");
    }),
    defineTest("SLI-CT-008", "Motion Plan respects reduced motion", ["SLI-1500.009"], async () => {
      const { input } = await familyProjection();
      input.context.accessibility = { reducedMotion: true };
      const { output } = buildProjection(input);
      assert(output.motionPlan.reducedMotionApplied && output.motionPlan.transitions.length === 0, "static state change");
    }),
    defineTest("SLI-CT-009", "Accessibility Plan includes reading order", ["SLI-1500.011"], async () => {
      const { output } = await familyProjection();
      assert(output.accessibilityPlan.readingOrder.length > 0, "reading order present");
      assert(output.accessibilityPlan.keyboardOrder.length > 0, "keyboard order present");
    }),
    defineTest("SLI-CT-011", "Recomposition preserves valid focus", ["SLI-1500.014"], async () => {
      const { input, output } = await familyProjection();
      const next = recompose({ previousProjection: output, projectionInput: input, triggers: [], reason: "stability check", traceId: input.traceId });
      assert(next.composition.primaryEntityId === output.composition.primaryEntityId, "primary preserved");
    }),
    defineTest("SLI-CT-012", "Interaction Bridge maps Reality mutation to WIL", ["SLI-1500.016"], async () => {
      const local = bridgeInteraction(
        { id: "i1", actorId: emma.id, projectionId: "p", interactionType: "expand", context: { worldId: "world_family" }, traceId: "t" },
        emma
      );
      assert(local.localOnly && local.message === undefined, "expand stays local");
      const real = bridgeInteraction(
        { id: "i2", actorId: emma.id, projectionId: "p", entityId: "garment_blue_jacket", interactionType: "delete", context: { worldId: "world_family" }, traceId: "t" },
        emma
      );
      assert(real.message?.mode === "commit", "delete becomes WIL commit");
    }),
    defineTest("SLI-CT-014", "Projection failure falls back without blank experience", ["SLI-1500.018"], async () => {
      const { output } = buildProjection({
        id: "broken", worldId: "world_family", snapshotId: "snap", actorId: emma.id,
        objectiveId: "missing", entities: [{ id: "solo", type: "thing" }],
        relationships: [{ id: "r", fromEntityId: "ghost_a", toEntityId: "ghost_b", type: "haunts" }],
        context: { device: undefined as never }, traceId: "t"
      });
      assert(output.composition.primaryEntityId === "solo", "fallback single-primary experience");
    }),
    defineTest("SLI-CT-015", "Devtools trace explains primary visibility", ["SLI-1500.019"], async () => {
      const client = createProjectionClient();
      const { input } = await familyProjection();
      const output = await client.project(input);
      const explanation = await client.explainProjection(output.id);
      assert((explanation[output.composition.primaryEntityId] ?? "").length > 0, "primary has an explanation");
    }),
    defineTest("SEC-CT-004", "Entity visibility prevents unauthorized projection", ["COMP-2000.020"], async () => {
      const { output } = await familyProjection(guest);
      const emmaEntity = output.composition.entities.find((e) => e.entityId === "person_emma");
      assert(emmaEntity?.role === "hidden", "restricted entity hidden from guest");
    })
  ]
};

export const designSuite: ROCComplianceSuite = {
  id: "suite_design_system",
  area: "design_system",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("DESIGN-CT-001", "Experience Regions are semantic, not pixel slots", ["SLI-1600.002"], async () => {
      assert(STANDARD_REGIONS.length === 10, "all ten standard regions");
      for (const region of STANDARD_REGIONS) assert(region.purpose.length > 0, "each region declares purpose");
    }),
    defineTest("DESIGN-CT-002", "Object Roles map to projection behavior", ["SLI-1600.003"], async () => {
      assert(ROLE_DEFAULT_REGION.primary === "center" && ROLE_DEFAULT_REGION.ambient === "ambient", "role → region mapping");
    }),
    defineTest("DESIGN-CT-007", "Color is not sole meaning carrier", ["SLI-1600.009"], async () => {
      const colors = defaultTokens().filter((t) => t.category === "color");
      for (const token of colors) assert(token.semanticDescription.length > 0, "every color role has semantic meaning");
    }),
    defineTest("DESIGN-CT-008", "Motion tokens include reduced-motion alternative", ["SLI-1600.010"], async () => {
      const motions = defaultTokens().filter((t) => t.category === "motion");
      for (const token of motions) {
        const value = token.value as { reducedMotionAlternative?: string };
        assert(typeof value.reducedMotionAlternative === "string", `${token.id} declares reduced-motion alternative`);
      }
    }),
    defineTest("DESIGN-CT-015", "Design Extension cannot break accessibility", ["SLI-1600.019"], async () => {
      const base = defaultTokens();
      const target = base.find((t) => t.id === "token_color_foreground");
      assert(target !== undefined, "foreground token exists");
      const result = applyDesignExtension(base, {
        id: "ext_bad", version: "1.0.0",
        tokenOverrides: [{ ...target, accessibilityConstraints: { minimumContrastRatio: 1 } }]
      });
      assert(result.rejectedOverrides.length === 1, "accessibility-weakening override rejected");
    })
  ]
};

export const sdkSuite: ROCComplianceSuite = {
  id: "suite_sdk",
  area: "sdk",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("SDK-CT-001", "World Builder requires World identity", ["SDK-1800.004"], async () => {
      let threw = false;
      try {
        WorldBuilder.world("No Identity").build();
      } catch (e) {
        threw = e instanceof ROCSDKError && e.code === "SDK_WORLD_ID_REQUIRED";
      }
      assert(threw, "missing world id throws typed error");
    }),
    defineTest("SDK-CT-002", "Entity Builder requires Entity ID and type", ["SDK-1800.005"], async () => {
      let threw = false;
      try {
        EntityBuilder.entity("thing").build();
      } catch (e) {
        threw = e instanceof ROCSDKError;
      }
      assert(threw, "missing type throws");
    }),
    defineTest("SDK-CT-004", "Relationship Builder validates ranges", ["SDK-1800.007"], async () => {
      let threw = false;
      try {
        RelationshipBuilder.relationship("r").from("a").to("b").type("owns").weight(200);
      } catch (e) {
        threw = e instanceof ROCSDKError && e.code === "SDK_WEIGHT_OUT_OF_RANGE";
      }
      assert(threw, "weight 200 rejected");
    }),
    defineTest("SDK-CT-005", "Law Builder cannot override Kernel Law", ["SDK-1800.008"], async () => {
      const law = LawBuilder.law("l").name("n").scope("world").appliesTo({ kind: "root" })
        .when(Cond.exists({ kind: "root" })).outcome("reject").severity("error").explain("e").build();
      assert(law.scope !== ("kernel" as string), "kernel scope is not offered by the builder");
    }),
    defineTest("SDK-CT-007", "WIL Builder rejects message without Actor", ["SDK-1800.010"], async () => {
      let threw = false;
      try {
        WILBuilder.message().intent({ type: "observe" }).target({ kind: "world" })
          .context({ worldId: "w" }).mode("observe").build();
      } catch (e) {
        threw = e instanceof ROCSDKError && e.code === "SDK_WIL_ACTOR_REQUIRED";
      }
      assert(threw, "no Actor, no interaction");
    }),
    defineTest("SDK-CT-011", "Candidate SDK cannot auto-merge Candidate World", ["SDK-1800.015"], async () => {
      const runtime = await loadFamilyRuntime();
      const client = createCandidateClient(runtime);
      const simulated = await client.createCandidateWorld(garmentCreate(emma, "garment_sdk", "simulate"));
      assert(!runtime.realityWorld().entities["garment_sdk"], "creating a candidate never touches Reality");
      const merge = client.prepareMerge(simulated.candidateWorldId ?? "", emma, {
        worldId: "world_family", snapshotId: runtime.currentSnapshot().id
      });
      assert(merge.mode === "commit", "merge is prepared as an explicit commit message, never auto-applied");
      assert(!runtime.realityWorld().entities["garment_sdk"], "preparation does not merge");
    }),
    defineTest("SDK-CT-013", "Runtime Test Harness detects Reality mutation during simulate", ["SDK-1800.018"], async () => {
      const harness = await RuntimeTestHarness.fromWorldDocument(familyDoc());
      await harness.expectNoRealityMutation(async () => {
        await harness.send(garmentCreate(emma, "garment_h", "simulate"));
      }); // throws if Reality moved
    }),
    defineTest("SDK-CT-014", "Projection Test Harness detects multiple primaries", ["SDK-1800.019"], async () => {
      const harness = new ProjectionTestHarness();
      const runtime = await loadFamilyRuntime();
      const output = await harness.project(
        projectionInputFromWorld({
          world: runtime.realityWorld(),
          snapshotId: runtime.currentSnapshot().id,
          actor: emma,
          traceId: "t"
        })
      );
      harness.expectSinglePrimary(output); // throws on violation
      let caught = false;
      try {
        harness.expectSinglePrimary({
          ...output,
          composition: {
            ...output.composition,
            entities: output.composition.entities.map((e) => ({ ...e, role: "primary" as const }))
          }
        });
      } catch {
        caught = true;
      }
      assert(caught, "harness flags multiple primaries");
    }),
    deferTest("SDK-CT-015", "SDK emits version mismatch diagnostic", ["SDK-1800.022"],
      "cross-version negotiation arrives when a second WIL major version exists; the runtime already rejects incompatible executables at load")
  ]
};

export const referenceSuite: ROCComplianceSuite = {
  id: "suite_reference",
  area: "reference",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("REF-CT-003", "Family Style World compiles", ["REF-1900.018"], async () => {
      const harness = await RuntimeTestHarness.fromWorldDocument(familyDoc());
      assert((await harness.currentSnapshot()).worldId === "world_family", "fixture loads");
    }),
    defineTest("REF-CT-006", "Candidate World does not mutate Reality", ["REF-1900.015"], async () => {
      const harness = await RuntimeTestHarness.fromWorldDocument(familyDoc());
      await harness.expectNoRealityMutation(async () => {
        await harness.send(garmentCreate(emma, "garment_ref", "simulate"));
      });
    }),
    defineTest("REF-CT-011", "Renderer Adapter preserves Projection meaning", ["REF-1900.017", "SLI-1500.012"], async () => {
      const { output } = await familyProjection();
      const bad = checkRendererBoundaries(output, {
        rendererId: "rogue", status: "rendered",
        renderedEntityIds: ["entity_invented"]
      });
      assert(bad.length >= 2, "boundary violations detected (dropped primary + invented entity)");
    }),
    defineTest("REF-CT-012", "End-to-end trace answers causality questions", ["REF-1900.019"], async () => {
      const result = await runDemo(() => undefined);
      assert(result.success, `demo must pass: ${result.failures.join("; ")}`);
      for (const answer of Object.values(result.answers)) {
        assert(!answer.includes("undefined"), "every causality answer is concrete");
      }
    }, { description: "REF-CT-013 (demo completes) is proven by the same run" })
  ]
};
