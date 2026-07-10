/**
 * Official compliance suite — Reality Loom Interface System.
 * The Interface Contract is executable; this suite proves it stays enforced.
 * See REALITY_LOOM_INTERFACE_CONTRACT.md.
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import { buildProjection, projectionInputFromWorld } from "@sli/runtime";
import { checkRendererBoundaries } from "@sli/renderer-contract";
import {
  CandidateLayer,
  createInterfaceRenderer,
  describeMotion,
  detectCollisions,
  flattenPrimitives,
  realityLoomPalette,
  resolveCollisions,
  rlMotion,
  RuntimeField,
  RuntimeNode,
  RL_FORBIDDEN_PRIMITIVES,
  RL_MOTION_VOCABULARY,
  sceneFromProjection,
  validateScene,
  type RLScene,
  type RLVisualObject
} from "@realityloom/interface";
import { assert, emma, garmentCreate, loadFamilyRuntime } from "./helpers.js";

const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };

async function familyScene(): Promise<ReturnType<typeof sceneFromProjection>> {
  const runtime = await loadFamilyRuntime();
  const { output } = buildProjection(
    projectionInputFromWorld({
      world: runtime.realityWorld(),
      snapshotId: runtime.currentSnapshot().id,
      actor: emma,
      traceId: "trace_rli",
      objectiveId: "objective_plan_family_look"
    })
  );
  return sceneFromProjection(output, { viewport: VIEWPORT });
}

export const interfaceSuite: ROCComplianceSuite = {
  id: "suite_interface",
  area: "interface",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("RLI-CT-001", "Forbidden primary primitives are rejected", ["RL-INTERFACE-CONTRACT rule 1"], async () => {
      assert(RL_FORBIDDEN_PRIMITIVES.length === 9, "the forbidden list is complete");
      const smuggled = RuntimeField({ id: "f", meaning: "field" });
      (smuggled as { primitive: string }).primitive = "Card";
      const scene: RLScene = { id: "s", viewport: VIEWPORT, primitives: [smuggled] };
      assert(validateScene(scene).some((v) => v.rule === 1), "Card rejected as primary primitive");
    }),
    defineTest("RLI-CT-002", "Every visible element is world-native", ["RL-INTERFACE-CONTRACT rule 2"], async () => {
      const result = await familyScene();
      const kinds = new Set(flattenPrimitives(result.scene.primitives).map((p) => p.object.kind));
      const allowed = new Set(["field", "surface", "node", "trace", "label", "boundary", "candidate", "commit", "projection"]);
      for (const kind of kinds) assert(allowed.has(kind), `kind "${kind}" is world-native`);
    }),
    defineTest("RLI-CT-003", "The UI expresses runtime behavior", ["RL-INTERFACE-CONTRACT rule 3"], async () => {
      const result = await familyScene();
      const all = flattenPrimitives(result.scene.primitives);
      assert(all.every((p) => p.meaning.length > 0), "every element declares runtime meaning");
      assert(
        all.some((p) => p.runtimeRef?.snapshotId !== undefined),
        "elements link to runtime truth (snapshots/traces)"
      );
    }),
    defineTest("RLI-CT-007", "No undeclared overlap survives layout", ["RL-INTERFACE-CONTRACT rule 7"], async () => {
      const contested: RLVisualObject[] = [0, 1, 2, 3].map((i) => ({
        id: `n${i}`, kind: "node", layer: 3, priority: 50 - i,
        bounds: { x: 100 + i * 10, y: 100 + i * 5, width: 120, height: 80 }, state: "projected"
      }));
      const resolved = resolveCollisions(contested, VIEWPORT);
      const undeclared = detectCollisions(resolved.objects).filter(
        (pair) => !(pair.a.allowOverlap && pair.a.overlapReason) && !(pair.b.allowOverlap && pair.b.overlapReason)
      );
      assert(undeclared.length === 0, "resolution leaves no undeclared overlap");
      assert(resolved.diagnostics.length > 0, "every displacement is recorded");
    }),
    defineTest("RLI-CT-008", "Motion is restricted to the runtime vocabulary", ["RL-INTERFACE-CONTRACT rule 8"], async () => {
      assert(RL_MOTION_VOCABULARY.length === 10, "vocabulary complete");
      assert(rlMotion.ripple.duration === 0.7 && rlMotion.commit.duration === 0.38, "canonical timings");
      let threw = false;
      try {
        describeMotion("wiggle" as never, "decoration");
      } catch {
        threw = true;
      }
      assert(threw, "non-vocabulary motion rejected");
    }),
    defineTest("RLI-CT-009", "Candidate state is distinguished from committed reality", ["RL-INTERFACE-CONTRACT rule 9"], async () => {
      let threw = false;
      try {
        CandidateLayer({ id: "c", meaning: "candidate", state: "committed" });
      } catch {
        threw = true;
      }
      assert(threw, "candidate cannot be constructed as committed");

      const runtime = await loadFamilyRuntime();
      const simulated = await runtime.simulate(garmentCreate(emma, "garment_rli", "simulate"));
      const candidateWorld = runtime.candidateWorldState(simulated.candidateWorldId ?? "");
      assert(candidateWorld !== undefined, "candidate world available");
      const { output } = buildProjection(
        projectionInputFromWorld({
          world: candidateWorld, snapshotId: "snap_candidate", actor: emma, traceId: "t"
        })
      );
      const result = sceneFromProjection(output, { viewport: VIEWPORT, candidateWorldId: simulated.candidateWorldId ?? "" });
      const layer = flattenPrimitives(result.scene.primitives).find((p) => p.primitive === "CandidateLayer");
      assert(layer !== undefined && String(layer.content?.label).includes("not Reality"), "candidate scenes are labeled possibility");
    }),
    defineTest("RLI-CT-010", "The system is a dark, precise operating substrate", ["RL-INTERFACE-CONTRACT rule 10"], async () => {
      assert(realityLoomPalette.void === "#050607" && realityLoomPalette.tealCore === "#62E6D8", "canonical palette");
      const result = await familyScene();
      const substrate = flattenPrimitives(result.scene.primitives).find((p) => p.primitive === "SubstrateField");
      assert(substrate !== undefined, "every scene stands on the substrate");
    }),
    defineTest("RLI-CT-011", "The bridge is a conforming SLI renderer", ["SLI-1500.012"], async () => {
      const runtime = await loadFamilyRuntime();
      const { output } = buildProjection(
        projectionInputFromWorld({
          world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id,
          actor: emma, traceId: "trace_rli_adapter"
        })
      );
      const renderer = createInterfaceRenderer({ viewport: VIEWPORT });
      const renderResult = await renderer.render(output);
      assert(renderResult.status === "rendered", "renders");
      assert(checkRendererBoundaries(output, renderResult).length === 0, "never reinterprets projection");
    }),
    defineTest("RLI-CT-012", "Scenes are deterministic", ["TEST-2500.005"], async () => {
      const [a, b] = [await familyScene(), await familyScene()];
      assert(JSON.stringify(a.scene) === JSON.stringify(b.scene), "identical projection → identical scene");
      void RuntimeNode; // referenced to keep the import meaningful for readers
    })
  ]
};
