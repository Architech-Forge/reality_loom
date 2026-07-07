/**
 * @wge/executable — Minimal Executable World.
 *
 * REF-1900.010, WGE-1200.015. The runtime-ready representation produced by
 * the compiler. The Runtime never needs source WDL to execute a compiled
 * World, and an Executable World excludes source-only syntax and
 * renderer-specific constructs.
 *
 * Build note: REF-1900.003 lists compiler (7) before executable (8), but
 * REF-1900.009 requires @wge/compiler's compileWorld to return an
 * Executable World — so this package builds before the compiler and the
 * compiler imports it. Resolution disclosed and approved in-session.
 */
import type {
  WGECompilerDiagnostic,
  WGELaw,
  WGEPhysicsPlan,
  WGESnapshot,
  WGETraversal,
  WGETraversalPlan,
  WGEWorld
} from "@roc/types";
import { ROC_REFERENCE_VERSION, WIL_PROTOCOL_VERSION } from "@roc/types";
import { createSnapshot } from "@wge/kernel";
import { buildGraph, type InMemoryWorldGraph } from "@wge/graph";

/** REF-1900.010 — Minimum Executable Structure. */
export interface MinimalExecutableWorld {
  id: string;
  worldId: string;

  compilerVersion: string;
  kernelVersion: string;
  wilVersion: string;

  rootEntityId: string;

  /** Canonical World state the graph and snapshot derive from. */
  world: WGEWorld;

  graph: InMemoryWorldGraph;

  lawIndex: Map<string, WGELaw>;
  traversalIndex: Map<string, WGETraversal>;

  /** Prepared plans (WGE-1200.011 / WGE-1200.012) — preparation, not execution. */
  traversalPlans: Map<string, WGETraversalPlan>;
  physicsPlan: WGEPhysicsPlan;

  initialSnapshotId: string;
  initialSnapshot: WGESnapshot;

  diagnostics: WGECompilerDiagnostic[];

  metadata?: Record<string, unknown>;
}

/** Volume 1200 name for the same structure (WGE-1200.015). */
export type WGEExecutableWorld = MinimalExecutableWorld;

export interface ExecutableWorldInput {
  world: WGEWorld;
  traversalPlans?: WGETraversalPlan[];
  physicsPlan?: WGEPhysicsPlan;
  diagnostics?: WGECompilerDiagnostic[];
  compilerVersion?: string;
  /** Injectable clock so compilation is deterministic (WGE-1200.002). */
  now?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Assembles the Executable World: graph, law/traversal indexes, plans, and
 * the initial Snapshot. Ids are deterministic functions of the World so
 * identical input produces identical executable output.
 */
export function createExecutableWorld(input: ExecutableWorldInput): MinimalExecutableWorld {
  const { world } = input;
  const graph = buildGraph(world);

  const lawIndex = new Map<string, WGELaw>();
  for (const id of Object.keys(world.laws).sort()) {
    const law = world.laws[id];
    if (law) lawIndex.set(id, law);
  }

  const traversalIndex = new Map<string, WGETraversal>();
  for (const id of Object.keys(world.traversals).sort()) {
    const traversal = world.traversals[id];
    if (traversal) traversalIndex.set(id, traversal);
  }

  const traversalPlans = new Map<string, WGETraversalPlan>();
  for (const plan of [...(input.traversalPlans ?? [])].sort((a, b) =>
    a.traversalId < b.traversalId ? -1 : 1
  )) {
    traversalPlans.set(plan.traversalId, plan);
  }

  const initialSnapshot = createSnapshot({
    world,
    id: `snap_${world.id}__initial`,
    createdAt: input.now ?? new Date().toISOString(),
    metadata: { initial: true }
  });

  const executable: MinimalExecutableWorld = {
    id: `exec_${world.id}__v${world.version}`,
    worldId: world.id,
    compilerVersion: input.compilerVersion ?? ROC_REFERENCE_VERSION,
    kernelVersion: ROC_REFERENCE_VERSION,
    wilVersion: WIL_PROTOCOL_VERSION,
    rootEntityId: world.rootEntityId,
    world,
    graph,
    lawIndex,
    traversalIndex,
    traversalPlans,
    physicsPlan:
      input.physicsPlan ??
      ({
        worldId: world.id,
        propagationIndexes: [],
        constraintMaps: [],
        relevanceFieldSeeds: [],
        confidencePaths: [],
        temporalDecaySets: []
      } satisfies WGEPhysicsPlan),
    initialSnapshotId: initialSnapshot.id,
    initialSnapshot,
    diagnostics: input.diagnostics ?? []
  };
  if (input.metadata !== undefined) executable.metadata = input.metadata;

  graph.snapshotsById.set(initialSnapshot.id, initialSnapshot);
  return executable;
}
