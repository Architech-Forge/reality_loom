/**
 * Official compliance suites — Kernel (COMP-2000.008), Graph (COMP-2000.009),
 * Compiler (COMP-2000.010), Runtime (COMP-2000.011), Physics (COMP-2000.012).
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest, deferTest } from "@roc/compliance";
import {
  createEntity,
  createRelationship,
  createSnapshot,
  createWorld,
  resolveSelector,
  validateWorld
} from "@wge/kernel";
import { buildGraph, buildEntityIndex, findOrphanedEntities, serializeWorld, deserializeWorld, worldsEquivalent, inbound, outbound } from "@wge/graph";
import { runPhysics } from "@wge/physics";
import { serializeCanonicalValue } from "@wge/wil";
import type { WGEPhysicsEvent, WGEWorld } from "@roc/types";
import { assert, compileFamily, emma, guest, FIXED_NOW, garmentCreate, loadFamilyRuntime } from "./helpers.js";

function chainWorld(): WGEWorld {
  const world = createWorld({ id: "world_chain", name: "Chain" });
  const add = (id: string, type: string) => {
    world.entities[id] = createEntity({ id, worldId: world.id, type, lifecycle: "active", createdAt: FIXED_NOW });
  };
  add("a", "node");
  add("b", "node");
  const rel = (id: string, from: string, to: string) => {
    world.relationships[id] = createRelationship({ id, worldId: world.id, fromEntityId: from, toEntityId: to, type: "contains", weight: 100 });
  };
  rel("rel_root_a", world.rootEntityId, "a");
  rel("rel_a_b", "a", "b");
  return world;
}

const physicsEvent = (origin: string): WGEPhysicsEvent => ({
  id: "pev_c",
  worldId: "world_chain",
  snapshotId: "snap_c",
  originEntityId: origin,
  type: "compliance.event",
  actorId: emma.id,
  traceId: "trace_c",
  magnitude: 0.8,
  confidence: 1,
  occurredAt: FIXED_NOW
});

export const kernelSuite: ROCComplianceSuite = {
  id: "suite_kernel",
  area: "kernel",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("KERNEL-CT-001", "World requires exactly one root Entity", ["WGE-1000.002"], async () => {
      const world = chainWorld();
      delete world.entities[world.rootEntityId];
      assert(validateWorld(world).outcome === "invalid", "missing root invalidates the world");
    }),
    defineTest("KERNEL-CT-002", "Duplicate active Entity IDs are rejected", ["WGE-1000.002"], async () => {
      const world = chainWorld();
      world.entities["a"] = createEntity({ id: "impostor", worldId: world.id, type: "node" });
      const result = validateWorld(world);
      assert(result.diagnostics.some((d) => d.code === "KERNEL_DUPLICATE_ID"), "duplicate id detected");
    }),
    defineTest("KERNEL-CT-003", "Orphan active Entities are rejected", ["WGE-1000.002"], async () => {
      const world = chainWorld();
      world.entities["orphan"] = createEntity({ id: "orphan", worldId: world.id, type: "node", lifecycle: "active" });
      assert(validateWorld(world).outcome === "invalid", "orphan invalidates world");
    }),
    defineTest("KERNEL-CT-004", "Relationship to missing Entity is rejected", ["WGE-1000.005"], async () => {
      const world = chainWorld();
      world.relationships["rel_ghost"] = createRelationship({
        id: "rel_ghost", worldId: world.id, fromEntityId: "a", toEntityId: "ghost", type: "owns"
      });
      assert(validateWorld(world).outcome === "invalid", "dangling relationship invalidates world");
    }),
    defineTest("KERNEL-CT-005", "Entity identity survives Snapshot creation", ["WGE-1000.003"], async () => {
      const world = chainWorld();
      createSnapshot({ world, id: "snap_1", createdAt: FIXED_NOW });
      assert(world.entities["a"]?.id === "a", "identity intact after snapshotting");
    }),
    defineTest("KERNEL-CT-007", "Snapshot is immutable", ["WGE-1000.009"], async () => {
      const snapshot = createSnapshot({ world: chainWorld(), id: "snap_frozen", createdAt: FIXED_NOW });
      let threw = false;
      try {
        (snapshot as { id: string }).id = "hacked";
      } catch {
        threw = true;
      }
      assert(threw && snapshot.id === "snap_frozen", "mutation attempt throws");
    }),
    defineTest("KERNEL-CT-008", "Diff references valid base Snapshot", ["WGE-1000.010"], async () => {
      const { createDiff, checkDiffBase } = await import("@wge/kernel");
      const world = chainWorld();
      const current = createSnapshot({ world, id: "snap_current", createdAt: FIXED_NOW });
      const stale = createDiff({ worldId: world.id, fromSnapshotId: "snap_old", operations: [], traceId: "t" });
      assert(checkDiffBase(stale, current)?.code === "KERNEL_DIFF_BASE_MISMATCH", "stale base flagged");
    }),
    defineTest("KERNEL-CT-009", "Kernel Laws cannot be overridden by World Laws", ["WGE-1000.006", "WGE-1200.010"], async () => {
      const result = await compileFamily((doc) => {
        doc.laws?.push({
          name: "Sneaky", scope: "kernel", appliesTo: { kind: "root" },
          condition: { op: "exists", selector: { kind: "root" } }, outcome: "allow"
        });
      });
      assert(!result.success && result.diagnostics.some((d) => d.code === "WGE1200-LAW-001"), "kernel-scope law rejected");
    }),
    defineTest("KERNEL-CT-010", "Selector resolves deterministically", ["WGE-1000.011"], async () => {
      const world = chainWorld();
      const a = resolveSelector(world, { kind: "type", value: "node" });
      const b = resolveSelector(world, { kind: "type", value: "node" });
      assert(JSON.stringify(a) === JSON.stringify(b), "identical resolution");
    }),
    defineTest("KERNEL-CT-013", "Renderer-specific Kernel fields are rejected", ["WGE-1000.004", "WGE-1000.013"], async () => {
      const { createAspect } = await import("@wge/kernel");
      const world = chainWorld();
      world.entities["a"]?.aspects.push(createAspect({ entityId: "a", kind: "css", data: {} }));
      const result = validateWorld(world);
      assert(result.diagnostics.some((d) => d.code === "KERNEL_RENDERER_REFERENCE"), "renderer aspect rejected");
    })
  ]
};

export const graphSuite: ROCComplianceSuite = {
  id: "suite_graph",
  area: "graph",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("GRAPH-CT-003", "Active Entities have root containment path", ["WGE-1100.003"], async () => {
      const world = chainWorld();
      assert(findOrphanedEntities(buildGraph(world)).length === 0, "chain world fully contained");
      world.entities["island"] = createEntity({ id: "island", worldId: world.id, type: "node", lifecycle: "active" });
      assert(findOrphanedEntities(buildGraph(world)).includes("island"), "unreachable active entity detected");
    }),
    defineTest("GRAPH-CT-005", "Relationship direction is respected", ["WGE-1100.004"], async () => {
      const graph = buildGraph(chainWorld());
      assert(outbound(graph, "a").includes("rel_a_b"), "outbound indexed");
      assert(!outbound(graph, "b").includes("rel_a_b"), "directed edge not reversed");
      assert(inbound(graph, "b").includes("rel_a_b"), "inbound indexed");
    }),
    defineTest("GRAPH-CT-006", "Bidirectional Relationship traverses both directions", ["WGE-1100.004"], async () => {
      const world = chainWorld();
      world.relationships["rel_bidi"] = createRelationship({
        id: "rel_bidi", worldId: world.id, fromEntityId: "a", toEntityId: "b",
        type: "references", direction: "bidirectional"
      });
      const graph = buildGraph(world);
      assert(outbound(graph, "a").includes("rel_bidi") && outbound(graph, "b").includes("rel_bidi"), "both directions traversable");
    }),
    defineTest("GRAPH-CT-010", "Index rebuild produces equivalent lookup behavior", ["WGE-1100.006"], async () => {
      const world = chainWorld();
      assert(
        JSON.stringify(buildEntityIndex(world)) === JSON.stringify(buildEntityIndex(world)),
        "derived indexes are rebuildable and deterministic"
      );
    }),
    defineTest("GRAPH-CT-012", "Candidate World branch preserves base Snapshot", ["WGE-1100.011"], async () => {
      const runtime = await loadFamilyRuntime();
      const base = runtime.currentSnapshot();
      const output = await runtime.simulate(garmentCreate(emma, "garment_branch", "simulate"));
      const record = runtime.getCandidateWorld(output.candidateWorldId ?? "");
      assert(record?.baseSnapshotId === base.id, "candidate remembers its base Reality snapshot");
    }),
    defineTest("GRAPH-CT-014", "Serialized graph decodes to semantic equivalence", ["WGE-1100.012"], async () => {
      const world = chainWorld();
      assert(worldsEquivalent(world, deserializeWorld(serializeWorld(world))), "round-trip equivalence");
    }),
    deferTest("GRAPH-CT-013", "Federated World boundary is preserved", ["WGE-1100.010"],
      "graph federation arrives with the federation phase (WGE-1100.010, WGE-1400.017)")
  ]
};

export const compilerSuite: ROCComplianceSuite = {
  id: "suite_compiler",
  area: "compiler",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("COMPILER-CT-001", "Valid minimal World compiles", ["REF-1900.009"], async () => {
      const result = await compileFamily();
      assert(result.success && result.executableWorld !== undefined, "family fixture compiles");
    }),
    defineTest("COMPILER-CT-003", "Duplicate Entity IDs fail identity resolution", ["WGE-1200.007"], async () => {
      const result = await compileFamily((doc) => {
        doc.entities?.push({ id: "person_emma", type: "person" });
      });
      assert(!result.success && result.diagnostics.some((d) => d.code === "WGE1200-ID-001"), "duplicate rejected");
    }),
    defineTest("COMPILER-CT-004", "Missing Relationship endpoint fails", ["WGE-1200.008"], async () => {
      const result = await compileFamily((doc) => {
        doc.relationships?.push({ from: "ghost", type: "owns", to: "closet_emma" });
      });
      assert(!result.success, "missing endpoint is fatal");
    }),
    defineTest("COMPILER-CT-009", "WIL semantic import preserves Actor and Intent", ["WGE-1200.005"], async () => {
      const { importWILMessages } = await import("@wge/compiler");
      const message = garmentCreate(emma, "garment_import", "commit", "snap_x");
      const result = importWILMessages({ messages: [message], mode: "definition" });
      const op = result.operations[0];
      assert(op !== undefined, "operation produced");
      const wil = op.payload._wil as { actorId: string; intent: string };
      assert(wil.actorId === emma.id && wil.intent === "create", "actor and intent preserved");
    }),
    defineTest("COMPILER-CT-010", "Compiler output is deterministic", ["WGE-1200.002"], async () => {
      const [a, b] = await Promise.all([compileFamily(), compileFamily()]);
      assert(
        a.executableWorld?.initialSnapshot.entityIndexHash === b.executableWorld?.initialSnapshot.entityIndexHash,
        "identical input yields identical hashes"
      );
    }),
    defineTest("COMPILER-CT-014", "Executable World contains required indexes", ["WGE-1200.015", "REF-1900.010"], async () => {
      const result = await compileFamily();
      const exec = result.executableWorld;
      assert(exec !== undefined, "compiles");
      assert(exec.graph.entitiesById.size > 0 && exec.lawIndex.size > 0 && exec.traversalIndex.size > 0, "indexes present");
      assert(exec.initialSnapshotId.length > 0 && exec.wilVersion.length > 0, "snapshot + version metadata present");
    }),
    deferTest("COMPILER-CT-012", "Incremental compile matches full compile", ["WGE-1200.016"],
      "incremental compilation currently falls back to full compilation by design (WGE-1200.016 safety rule); dedicated incremental support is deferred"),
    deferTest("COMPILER-CT-013", "Plugin cannot suppress fatal Kernel error", ["WGE-1200.018"],
      "compiler plugins arrive with the tooling phase (WGE-1200.018)")
  ]
};

export const runtimeSuite: ROCComplianceSuite = {
  id: "suite_runtime",
  area: "runtime",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("RUNTIME-CT-002", "Invalid WIL produces rejected Outcome and Trace", ["WGE-1300.003"], async () => {
      const runtime = await loadFamilyRuntime();
      const output = await runtime.observe({ protocol: "wil" } as never);
      assert(output.outcome.status === "rejected", "rejected outcome");
      assert(output.trace.steps.length > 0, "trace emitted even for invalid input");
    }),
    defineTest("RUNTIME-CT-003", "Unauthorized Commit is rejected", ["WGE-1300.006"], async () => {
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(garmentCreate(guest, "garment_hack", "commit", runtime.currentSnapshot().id));
      assert(output.outcome.status === "rejected", "guest without world.commit rejected");
    }),
    defineTest("RUNTIME-CT-004", "Observe mode does not mutate Reality", ["WGE-1300.006"], async () => {
      const runtime = await loadFamilyRuntime();
      const before = runtime.currentSnapshot();
      await runtime.observe(garmentCreate(emma, "garment_o", "simulate"));
      assert(runtime.currentSnapshot() === before, "snapshot unchanged");
    }),
    defineTest("RUNTIME-CT-005", "Simulate mode does not mutate Reality", ["WGE-1300.006"], async () => {
      const runtime = await loadFamilyRuntime();
      const before = runtime.currentSnapshot();
      await runtime.simulate(garmentCreate(emma, "garment_s", "simulate"));
      assert(runtime.currentSnapshot() === before && !runtime.realityWorld().entities["garment_s"], "Reality isolated");
    }),
    defineTest("RUNTIME-CT-007", "Commit mode creates new Snapshot", ["WGE-1300.012"], async () => {
      const runtime = await loadFamilyRuntime();
      const before = runtime.currentSnapshot();
      const output = await runtime.commit(garmentCreate(emma, "garment_c", "commit", before.id));
      assert(output.snapshot !== undefined && output.snapshot.parentSnapshotId === before.id, "lineage-linked snapshot");
    }),
    defineTest("RUNTIME-CT-008", "Commit mode creates Diff", ["WGE-1300.011"], async () => {
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(garmentCreate(emma, "garment_d", "commit", runtime.currentSnapshot().id));
      assert(output.diff !== undefined && output.diff.operations.length > 0 && output.diff.traceId.length > 0, "causal diff");
    }),
    defineTest("RUNTIME-CT-010", "Rejected Law produces rejected Outcome, not runtime error", ["WGE-1300.008"], async () => {
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(
        garmentCreate(emma, "garment_bad", "commit", runtime.currentSnapshot().id, "sold_out")
      );
      assert(output.outcome.status === "rejected", "rejected is a correct outcome");
    }),
    defineTest("RUNTIME-CT-011", "Diff base Snapshot mismatch triggers conflict", ["WGE-1300.017"], async () => {
      const runtime = await loadFamilyRuntime();
      const stale = runtime.currentSnapshot().id;
      await runtime.commit(garmentCreate(emma, "garment_1", "commit", stale));
      const output = await runtime.commit(garmentCreate(emma, "garment_2", "commit", stale));
      assert(output.outcome.status === "conflict", "stale base yields conflict, never silent overwrite");
    }),
    defineTest("RUNTIME-CT-013", "Candidate World merge requires explicit Commit", ["WGE-1300.014"], async () => {
      const runtime = await loadFamilyRuntime();
      const simulated = await runtime.simulate(garmentCreate(emma, "garment_m", "simulate"));
      assert(!runtime.realityWorld().entities["garment_m"], "simulation stays possible, not real");
      const { createWILMessage } = await import("@wge/wil");
      const merge = createWILMessage({
        actor: emma,
        intent: { type: "commit", reason: "merge" },
        target: { kind: "candidate_world", id: simulated.candidateWorldId ?? "" },
        context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
        mode: "commit"
      });
      const merged = await runtime.commit(merge);
      assert(merged.outcome.status === "success" && runtime.realityWorld().entities["garment_m"] !== undefined, "explicit merge commits");
    }),
    defineTest("RUNTIME-CT-016", "Every execution emits Outcome and Trace", ["WGE-1300.004"], async () => {
      const runtime = await loadFamilyRuntime();
      const outputs = [
        await runtime.observe(garmentCreate(emma, "x", "commit", "snap")), // mode mismatch → rejected
        await runtime.simulate(garmentCreate(emma, "garment_t", "simulate")),
        await runtime.commit(garmentCreate(emma, "garment_u", "commit", runtime.currentSnapshot().id))
      ];
      for (const output of outputs) {
        assert(output.outcome !== undefined && output.trace !== undefined, "outcome + trace always present");
      }
    }),
    deferTest("RUNTIME-CT-014", "Replay reconstructs expected Snapshot", ["WGE-1300.016"],
      "replay runtime arrives with the tooling phase (WGE-1300.016); committed diffs and snapshot lineage are already persisted for it")
  ]
};

export const physicsSuite: ROCComplianceSuite = {
  id: "suite_physics",
  area: "physics",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("PHYSICS-CT-001", "Physics Event without origin is rejected", ["WGE-1400.002"], async () => {
      const result = runPhysics({
        world: chainWorld(),
        event: { ...physicsEvent("a"), originEntityId: "" },
        actor: emma,
        context: { worldId: "world_chain" }
      });
      assert(result.diagnostics?.some((d) => d.code === "PHYSICS_EVENT_INVALID") === true, "invalid event rejected");
    }),
    defineTest("PHYSICS-CT-003", "Propagation follows active Relationships only", ["WGE-1400.005"], async () => {
      const world = chainWorld();
      const relAB = world.relationships["rel_a_b"];
      if (relAB) relAB.lifecycle = "archived";
      const result = runPhysics({ world, event: physicsEvent("a"), actor: emma, context: { worldId: "world_chain" } });
      assert(!result.affectedEntities.some((e) => e.entityId === "b"), "archived relationship does not propagate");
    }),
    defineTest("PHYSICS-CT-004", "Direction is respected during propagation", ["WGE-1400.005"], async () => {
      const result = runPhysics({
        world: chainWorld(), event: physicsEvent("b"), actor: emma, context: { worldId: "world_chain" }
      });
      assert(result.affectedEntities.length === 1, "no reverse propagation without explicit permission");
    }),
    defineTest("PHYSICS-CT-005", "Decay reduces magnitude across depth", ["WGE-1400.006"], async () => {
      const result = runPhysics({
        world: chainWorld(), event: physicsEvent("a"), actor: emma, context: { worldId: "world_chain" }
      });
      const b = result.affectedEntities.find((e) => e.entityId === "b");
      assert(b !== undefined && b.magnitude < 0.8, "influence attenuates");
    }),
    defineTest("PHYSICS-CT-006", "Propagation stops below threshold", ["WGE-1400.006"], async () => {
      const result = runPhysics({
        world: chainWorld(),
        event: { ...physicsEvent("a"), magnitude: 0.06 },
        actor: emma,
        context: { worldId: "world_chain" }
      });
      assert(result.affectedEntities.length === 1, "weak influence dies at the first hop");
    }),
    defineTest("PHYSICS-CT-012", "Candidate World Physics cannot mutate Reality", ["WGE-1400.016"], async () => {
      const runtime = await loadFamilyRuntime();
      await runtime.simulate(garmentCreate(emma, "garment_p", "simulate"));
      assert(runtime.drainRecompositionTriggers().length === 0, "candidate ripples never reach Reality's queue");
    }),
    defineTest("PHYSICS-CT-014", "Physics can emit recomposition trigger", ["WGE-1400.019"], async () => {
      const runtime = await loadFamilyRuntime();
      await runtime.commit(garmentCreate(emma, "garment_r", "commit", runtime.currentSnapshot().id));
      assert(runtime.drainRecompositionTriggers().length > 0, "committed ripple requests recomposition");
    }),
    defineTest("PHYSICS-CT-015", "Deterministic inputs produce deterministic effects", ["WGE-1400.020"], async () => {
      const run = () =>
        runPhysics({ world: chainWorld(), event: physicsEvent("a"), actor: emma, context: { worldId: "world_chain" } });
      assert(serializeCanonicalValue(run()) === serializeCanonicalValue(run()), "identical effects");
    }),
    deferTest("PHYSICS-CT-013", "Federated propagation preserves World boundary", ["WGE-1400.017"],
      "federated physics arrives with the federation phase (WGE-1400.017)")
  ]
};
