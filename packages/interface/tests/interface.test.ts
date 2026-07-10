import { describe, expect, it } from "vitest";
import type { WGESourceUnit, WILActor } from "@roc/types";
import { compileWorld } from "@wge/compiler";
import type { WGEExecutableWorld } from "@wge/executable";
import { WGERuntime } from "@wge/runtime";
import { buildProjection, projectionInputFromWorld } from "@sli/runtime";
import { checkRendererBoundaries } from "@sli/renderer-contract";
import { inspectWorld } from "@roc/devtools";
import {
  AuthorityBoundary,
  CandidateLayer,
  CommitSurface,
  createInterfaceRenderer,
  describeMotion,
  detectCollisions,
  flattenObjects,
  flattenPrimitives,
  layoutProjection,
  realityLoomPalette,
  resolveCollisions,
  rlMotion,
  RuntimeField,
  RuntimeNode,
  RL_FORBIDDEN_PRIMITIVES,
  RL_INTERFACE_CONTRACT,
  sceneFromProjection,
  SubstrateField,
  TraceLine,
  TraceViewer,
  validateScene,
  WorldGraphInspector,
  type RLScene,
  type RLVisualObject
} from "@realityloom/interface";
import { familyStyleWorld } from "@examples/family-style-world";

const NOW = "2026-07-06T12:00:00Z";
const VIEWPORT = { x: 0, y: 0, width: 1280, height: 800 };

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view"]
  }
};

async function loadRuntime(): Promise<WGERuntime> {
  const source: WGESourceUnit = {
    id: "family",
    format: "wdl",
    content: familyStyleWorld() as unknown as Record<string, unknown>
  };
  const compiled = await compileWorld({ source, now: NOW });
  if (!compiled.executableWorld) throw new Error("family world failed to compile");
  return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: () => NOW });
}

const object = (id: string, x: number, y: number, priority = 50, extra: Partial<RLVisualObject> = {}): RLVisualObject => ({
  id,
  kind: "node",
  layer: 3,
  priority,
  bounds: { x, y, width: 100, height: 60 },
  state: "projected",
  ...extra
});

describe("no-overlap layout engine (contract rule 7)", () => {
  it("detects same-layer collisions and ignores cross-layer coexistence", () => {
    const colliding = detectCollisions([object("a", 0, 0), object("b", 40, 20)]);
    expect(colliding).toHaveLength(1);
    const crossLayer = detectCollisions([object("a", 0, 0), object("b", 40, 20, 50, { layer: 4 })]);
    expect(crossLayer).toHaveLength(0);
  });

  it("preserves the higher-priority object and moves the lower to a safe slot", () => {
    const high = object("high", 100, 100, 90);
    const low = object("low", 120, 110, 10);
    const result = resolveCollisions([high, low], VIEWPORT);
    const settledHigh = result.objects.find((o) => o.id === "high");
    const settledLow = result.objects.find((o) => o.id === "low");
    expect(settledHigh?.bounds).toEqual(high.bounds); // step 3: preserved
    expect(result.moved).toEqual(["low"]); // step 4: displaced
    expect(settledLow && detectCollisions([settledHigh as RLVisualObject, settledLow])).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "RL_LAYOUT_DISPLACED")).toBe(true); // step 6
  });

  it("permits declared, traceable overlap and records it", () => {
    const trace = object("trace", 100, 100, 60, { kind: "trace", allowOverlap: true, overlapReason: "active-trace" });
    const nodeUnder = object("under", 110, 110, 50);
    const result = resolveCollisions([trace, nodeUnder], VIEWPORT);
    expect(result.moved).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "RL_LAYOUT_INTENTIONAL_OVERLAP")).toBe(true);
  });

  it("rejects allowOverlap without a declared reason (undeclared = invalid)", () => {
    const sneaky = object("sneaky", 0, 0, 50, { allowOverlap: true });
    const result = resolveCollisions([sneaky], VIEWPORT);
    expect(result.diagnostics.some((d) => d.code === "RL_LAYOUT_INVALID_OBJECT")).toBe(true);
  });

  it("collapses to a node marker when no safe slot exists (step 5)", () => {
    // A tiny viewport fully occupied by one high-priority object.
    const tiny = { x: 0, y: 0, width: 120, height: 80 };
    const occupier = object("occupier", 0, 0, 90, { bounds: { x: 0, y: 0, width: 120, height: 80 } });
    const loser = object("loser", 10, 10, 10, { bounds: { x: 10, y: 10, width: 100, height: 60 } });
    const result = resolveCollisions([occupier, loser], tiny);
    expect(result.collapsed).toEqual(["loser"]);
    const collapsed = result.objects.find((o) => o.id === "loser");
    expect(collapsed && collapsed.bounds.width <= 12 && collapsed.bounds.height <= 12).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "RL_LAYOUT_COLLAPSED")).toBe(true);
  });

  it("is deterministic: identical contention resolves identically", () => {
    const objects = [object("a", 0, 0, 50), object("b", 30, 10, 50), object("c", 60, 20, 50)];
    const a = resolveCollisions(objects, VIEWPORT);
    const b = resolveCollisions(objects, VIEWPORT);
    expect(JSON.stringify(a.objects)).toBe(JSON.stringify(b.objects));
  });
});

describe("motion semantics (contract rule 8)", () => {
  it("carries the exact rlMotion tokens", () => {
    expect(rlMotion.ripple).toEqual({ duration: 0.7, ease: [0.16, 1, 0.3, 1] });
    expect(rlMotion.project).toEqual({ duration: 0.55, ease: [0.22, 1, 0.36, 1] });
    expect(rlMotion.commit).toEqual({ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] });
    expect(rlMotion.trace).toEqual({ duration: 0.9, ease: [0.12, 0.7, 0.18, 1] });
    expect(rlMotion.recede).toEqual({ duration: 0.42, ease: [0.4, 0, 0.2, 1] });
  });

  it("rejects motion outside the runtime vocabulary and motion without meaning", () => {
    expect(() => describeMotion("bounce" as never, "fun")).toThrow(/vocabulary/);
    expect(() => describeMotion("ripple", "")).toThrow(/clarify/);
    const ripple = describeMotion("ripple", "physics propagation from weather event");
    expect(ripple.reducedMotionAlternative).toBe("static_state_change");
  });
});

describe("visual tokens", () => {
  it("carries the exact Reality Loom palette", () => {
    expect(realityLoomPalette.void).toBe("#050607");
    expect(realityLoomPalette.tealCore).toBe("#62E6D8");
    expect(realityLoomPalette.oldGold).toBe("#C89B4A");
    expect(realityLoomPalette.signalLine).toBe("rgba(98, 230, 216, 0.28)");
  });
});

describe("interface contract enforcement", () => {
  const sceneWith = (primitives: RLScene["primitives"]): RLScene => ({
    id: "scene_test",
    viewport: VIEWPORT,
    primitives
  });

  it("declares all ten rules", () => {
    expect(RL_INTERFACE_CONTRACT).toHaveLength(10);
    expect(RL_FORBIDDEN_PRIMITIVES).toContain("Card");
    expect(RL_FORBIDDEN_PRIMITIVES).toContain("DashboardShell");
  });

  it("rejects forbidden primary primitives (rule 1)", () => {
    const smuggled = RuntimeField({ id: "f1", meaning: "field" });
    (smuggled as { primitive: string }).primitive = "Card";
    const violations = validateScene(sceneWith([smuggled]));
    expect(violations.some((v) => v.rule === 1)).toBe(true);
  });

  it("rejects candidate objects carrying committed state (rule 9)", () => {
    expect(() => CandidateLayer({ id: "c1", meaning: "candidate", state: "committed" })).toThrow(/possibility/);
    const candidate = CandidateLayer({ id: "c2", meaning: "candidate" });
    (candidate.object as { state: string }).state = "committed"; // post-hoc mutation
    const violations = validateScene(sceneWith([candidate]));
    expect(violations.some((v) => v.rule === 9)).toBe(true);
  });

  it("requires every primitive to declare runtime meaning (rule 3)", () => {
    expect(() => RuntimeNode({ id: "n1", meaning: "" })).toThrow(/runtime meaning/);
  });

  it("flags undeclared overlap in assembled scenes (rule 7)", () => {
    const a = RuntimeNode({ id: "na", meaning: "node a", bounds: { x: 0, y: 0, width: 100, height: 60 } });
    const b = RuntimeNode({ id: "nb", meaning: "node b", bounds: { x: 20, y: 10, width: 100, height: 60 } });
    const violations = validateScene(sceneWith([a, b]));
    expect(violations.some((v) => v.rule === 7)).toBe(true);
  });

  it("accepts a conforming scene", () => {
    const scene = sceneWith([
      SubstrateField({
        id: "sub",
        meaning: "the substrate",
        bounds: VIEWPORT,
        children: [
          RuntimeNode({ id: "n1", meaning: "entity node", bounds: { x: 0, y: 0, width: 100, height: 60 } }),
          RuntimeNode({ id: "n2", meaning: "entity node", bounds: { x: 200, y: 0, width: 100, height: 60 } }),
          TraceLine({ id: "t1", meaning: "causality between nodes", bounds: { x: 0, y: 0, width: 300, height: 60 } })
        ]
      })
    ]);
    expect(validateScene(scene)).toEqual([]);
  });
});

describe("SLI projection bridge (build order step 13)", () => {
  it("turns a projection into a conforming scene with no undeclared overlap", async () => {
    const runtime = await loadRuntime();
    const { output } = buildProjection(
      projectionInputFromWorld({
        world: runtime.realityWorld(),
        snapshotId: runtime.currentSnapshot().id,
        actor: emma,
        traceId: "trace_iface",
        objectiveId: "objective_plan_family_look"
      })
    );
    const result = sceneFromProjection(output, { viewport: VIEWPORT });
    expect(validateScene(result.scene)).toEqual([]);
    const objects = flattenObjects(result.scene);
    // The SLI primary is the focused projection surface.
    const primary = flattenPrimitives(result.scene.primitives).find(
      (p) => p.primitive === "ProjectionSurface"
    );
    expect(primary?.object.id).toBe(output.composition.primaryEntityId);
    expect(primary?.object.state).toBe("focused");
    expect(objects.length).toBeGreaterThan(3);
    // Hidden entities recede recoverably rather than vanish.
    if (result.hiddenCount > 0) {
      expect(flattenPrimitives(result.scene.primitives).some((p) => p.primitive === "RecedeLayer")).toBe(true);
    }
  });

  it("wraps candidate projections in a CandidateLayer — possibility never renders as Reality", async () => {
    const runtime = await loadRuntime();
    const { createWILMessage } = await import("@wge/wil");
    const simulated = await runtime.simulate(
      createWILMessage({
        actor: emma,
        intent: { type: "create", reason: "what-if" },
        target: { kind: "entity", id: "garment_dream" },
        context: { worldId: "world_family" },
        mode: "simulate",
        payload: {
          id: "garment_dream", type: "garment", containedBy: "closet_emma",
          aspects: [{ kind: "application", data: { "availability.status": "available" } }]
        }
      })
    );
    const candidateWorld = runtime.candidateWorldState(simulated.candidateWorldId ?? "");
    if (!candidateWorld) throw new Error("candidate world unavailable");
    const { output } = buildProjection(
      projectionInputFromWorld({
        world: candidateWorld,
        snapshotId: runtime.getCandidateWorld(simulated.candidateWorldId ?? "")?.currentCandidateSnapshotId ?? "",
        actor: emma,
        traceId: "trace_candidate_scene"
      })
    );
    const result = sceneFromProjection(output, {
      viewport: VIEWPORT,
      candidateWorldId: simulated.candidateWorldId ?? ""
    });
    const candidateLayer = flattenPrimitives(result.scene.primitives).find(
      (p) => p.primitive === "CandidateLayer"
    );
    expect(candidateLayer).toBeDefined();
    expect(String(candidateLayer?.content?.label)).toContain("not Reality");
    expect(validateScene(result.scene)).toEqual([]);
    // Every entity inside carries the candidate motion verb, not commit.
    const entityMotion = flattenPrimitives(result.scene.primitives)
      .filter((p) => p.motion)
      .map((p) => p.motion?.verb);
    expect(entityMotion).toContain("simulate");
    expect(entityMotion).not.toContain("commit");
  });

  it("registers as a conforming SLI renderer adapter", async () => {
    const runtime = await loadRuntime();
    const { output } = buildProjection(
      projectionInputFromWorld({
        world: runtime.realityWorld(),
        snapshotId: runtime.currentSnapshot().id,
        actor: emma,
        traceId: "trace_adapter"
      })
    );
    const renderer = createInterfaceRenderer({ viewport: VIEWPORT });
    const renderResult = await renderer.render(output);
    expect(renderResult.status).toBe("rendered");
    expect(checkRendererBoundaries(output, renderResult)).toEqual([]);
    expect(renderer.lastScene()).toBeDefined();
  });

  it("is deterministic: identical projection yields identical scene", async () => {
    const runtime = await loadRuntime();
    const input = projectionInputFromWorld({
      world: runtime.realityWorld(),
      snapshotId: runtime.currentSnapshot().id,
      actor: emma,
      traceId: "trace_det"
    });
    const a = sceneFromProjection(buildProjection(input).output, { viewport: VIEWPORT });
    const b = sceneFromProjection(buildProjection(input).output, { viewport: VIEWPORT });
    expect(JSON.stringify(a.scene)).toBe(JSON.stringify(b.scene));
  });

  it("layoutProjection output carries no undeclared overlap", async () => {
    const runtime = await loadRuntime();
    const { output } = buildProjection(
      projectionInputFromWorld({
        world: runtime.realityWorld(),
        snapshotId: runtime.currentSnapshot().id,
        actor: emma,
        traceId: "trace_layout"
      })
    );
    const layout = layoutProjection(output, VIEWPORT);
    const undeclared = detectCollisions(layout.objects).filter(
      (pair) => !(pair.a.allowOverlap && pair.a.overlapReason) && !(pair.b.allowOverlap && pair.b.overlapReason)
    );
    expect(undeclared).toEqual([]);
  });
});

describe("runtime surfaces (build order step 12)", () => {
  it("WorldGraphInspector and TraceViewer produce conforming, meaningful scenes", async () => {
    const runtime = await loadRuntime();
    const graph = WorldGraphInspector(inspectWorld(runtime.realityWorld(), emma));
    expect(graph.primitive).toBe("WorldGraphCanvas");
    expect(graph.children.length).toBeGreaterThan(10);
    expect(graph.children.every((c) => c.meaning.length > 0)).toBe(true);

    const message = (await import("@wge/wil")).createWILMessage({
      actor: emma,
      intent: { type: "observe" },
      target: { kind: "world" },
      context: { worldId: "world_family" },
      mode: "observe"
    });
    const observed = await runtime.observe(message);
    const traceScene = TraceViewer(observed.trace);
    expect(traceScene.primitive).toBe("TraceLine");
    expect(traceScene.children.length).toBe(observed.trace.steps.length);
    expect(traceScene.motion?.verb).toBe("trace");
  });

  it("commit surfaces are committed; authority boundaries explain", async () => {
    const runtime = await loadRuntime();
    const snapshotScene = CommitSurface({
      id: "cs",
      meaning: `snapshot ${runtime.currentSnapshot().id}`,
      state: "committed"
    });
    expect(snapshotScene.object.kind).toBe("commit");
    const boundary = AuthorityBoundary({ id: "ab", meaning: "guest blocked from measurements: permission required" });
    expect(boundary.object.kind).toBe("boundary");
    expect(boundary.meaning).toContain("permission");
  });
});
