/**
 * runPhysics — Minimal World Physics (REF-1900.013, Volume 1400).
 *
 * Changes ripple; they do not explode (WGE-1400.001). Execution preserves
 * the semantic order of WGE-1400.003: validate event → load origin →
 * relevance fields → locality → propagation → decay → constraint blocking →
 * objective gravity → confidence transfer → temporal momentum → effects →
 * trace. Deterministic for deterministic inputs: relationships are walked
 * in sorted order and all outputs are stable-sorted.
 */
import type {
  WGEEntity,
  WGELaw,
  WGEPhysicsAffectedEntity,
  WGEPhysicsAffectedRelationship,
  WGEPhysicsBlockedPath,
  WGEPhysicsDiagnostic,
  WGEPhysicsEffect,
  WGEPhysicsEvent,
  WGEPhysicsExecutionResult,
  WGEPhysicsLocalityRadius,
  WGEPhysicsTracePath,
  WGERecompositionTrigger,
  WGERelevanceField,
  WGEWorld,
  WILActor,
  WILContext
} from "@roc/types";
import { WGE_OBJECTIVE_ASPECT_KIND, WGE_OBJECTIVE_ENTITY_TYPE } from "@roc/types";
import { evaluateCondition, resolveSelector } from "@wge/kernel";
import { buildGraph, type InMemoryWorldGraph } from "@wge/graph";

export interface RunPhysicsInput {
  world: WGEWorld;
  event: WGEPhysicsEvent;
  actor: WILActor;
  context: WILContext;

  /** Locality overrides (WGE-1400.004). Defaults: depth 2, magnitude ≥ 0.05, confidence ≥ 0.1. */
  locality?: Partial<WGEPhysicsLocalityRadius>;

  /**
   * Directed relationships propagate in their declared direction; reverse
   * propagation requires explicit permission (WGE-1400.005).
   */
  permitReverse?: boolean;
}

const DEFAULTS = {
  maxDepth: 2,
  minimumMagnitude: 0.05,
  minimumConfidence: 0.1,
  /** Weight scaling: weight/100; relationships without weight carry this factor. */
  defaultWeightFactor: 0.75,
  /** Linear decay per propagation step (WGE-1400.006 default rule). */
  decayPerDepth: 0.25,
  /** Relevance change worth proposing a diff / recomposition (WGE-1400.019). */
  recompositionThreshold: 0.3
};

interface Frontier {
  entityId: string;
  magnitude: number;
  confidence: number;
  depth: number;
  entityPath: string[];
  relationshipPath: string[];
}

export function runPhysics(input: RunPhysicsInput): WGEPhysicsExecutionResult {
  const { world, event, actor, context } = input;
  const diagnostics: WGEPhysicsDiagnostic[] = [];
  const paths: WGEPhysicsTracePath[] = [];
  const blockedPaths: WGEPhysicsBlockedPath[] = [];
  const effects: WGEPhysicsEffect[] = [];
  let pathSequence = 0;
  let effectSequence = 0;

  const emptyResult = (summary: string): WGEPhysicsExecutionResult => ({
    eventId: event.id,
    worldId: event.worldId,
    snapshotId: event.snapshotId,
    affectedEntities: [],
    affectedRelationships: [],
    blockedPaths,
    generatedDiffOperations: [],
    recompositionTriggers: [],
    trace: {
      id: `phys_trace_${event.id}`,
      eventId: event.id,
      worldId: event.worldId,
      snapshotId: event.snapshotId,
      originEntityId: event.originEntityId,
      paths,
      summary,
      createdAt: event.occurredAt
    },
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  });

  // --- Validate Event (WGE-1400.002 invariant) -----------------------------
  for (const [field, value] of [
    ["originEntityId", event.originEntityId],
    ["actorId", event.actorId],
    ["snapshotId", event.snapshotId],
    ["traceId", event.traceId]
  ] as const) {
    if (!value) {
      diagnostics.push({
        code: "PHYSICS_EVENT_INVALID",
        severity: "error",
        message: `Physics Event is missing ${field}`,
        reason: "a Physics Event without origin, actor, snapshot, and trace is invalid (WGE-1400.002)",
        eventId: event.id,
        traceId: event.traceId || "trace_unknown"
      });
    }
  }
  if (diagnostics.some((d) => d.severity === "error")) {
    return emptyResult("Physics event rejected: invalid event");
  }

  // --- Load Origin Entity ---------------------------------------------------
  const origin = world.entities[event.originEntityId];
  if (!origin) {
    diagnostics.push({
      code: "PHYSICS_ORIGIN_MISSING",
      severity: "error",
      message: `Origin entity "${event.originEntityId}" does not exist`,
      reason: "physics must begin at its origin (WGE-1400.004)",
      eventId: event.id,
      traceId: event.traceId
    });
    return emptyResult("Physics event rejected: missing origin");
  }

  const graph = buildGraph(world);
  const locality: WGEPhysicsLocalityRadius = {
    originEntityId: event.originEntityId,
    maxDepth: input.locality?.maxDepth ?? DEFAULTS.maxDepth,
    minimumMagnitude: input.locality?.minimumMagnitude ?? DEFAULTS.minimumMagnitude,
    minimumConfidence: input.locality?.minimumConfidence ?? DEFAULTS.minimumConfidence,
    ...(input.locality?.objectiveExpansion !== undefined
      ? { objectiveExpansion: input.locality.objectiveExpansion }
      : {})
  };

  // --- Resolve Relevance Fields (WGE-1400.008, WGE-1400.012) ---------------
  // Active objectives create relevance fields seeded at their entry entities.
  const relevanceFields = resolveObjectiveFields(world, event);
  const inField = (entityId: string): WGERelevanceField | undefined =>
    relevanceFields.find((field) => field.originEntityIds.includes(entityId));

  const constraintLaws = Object.values(world.laws)
    .filter((law) => law.metadata?.constraint === true)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // --- Propagation (BFS, deterministic order) -------------------------------
  const affected = new Map<string, WGEPhysicsAffectedEntity>();
  const affectedRelationships = new Map<string, WGEPhysicsAffectedRelationship>();
  const visited = new Set<string>([origin.id]); // cycle detection (WGE-1400.006)

  affected.set(origin.id, {
    entityId: origin.id,
    magnitude: event.magnitude,
    confidence: event.confidence,
    depth: 0
  });
  const queue: Frontier[] = [
    {
      entityId: origin.id,
      magnitude: event.magnitude,
      confidence: event.confidence,
      depth: 0,
      entityPath: [origin.id],
      relationshipPath: []
    }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.depth >= locality.maxDepth) continue; // Law 1: Locality

    for (const relationshipId of neighborsOf(graph, current.entityId, input.permitReverse === true)) {
      const rel = world.relationships[relationshipId];
      if (!rel) continue;
      const targetId = rel.fromEntityId === current.entityId ? rel.toEntityId : rel.fromEntityId;
      if (visited.has(targetId)) continue;

      const target = world.entities[targetId];
      if (!target) continue;

      // Law 2: Propagation preconditions.
      if (rel.lifecycle !== "active" && rel.lifecycle !== "created") {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          reason: `relationship "${relationshipId}" is ${rel.lifecycle}; inactive relationships do not propagate (WGE-1400.005)`
        });
        continue;
      }
      if (target.lifecycle === "archived" || target.lifecycle === "deleted") {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          reason: `entity "${targetId}" lifecycle ${target.lifecycle} prevents influence (WGE-1400.007)`
        });
        continue;
      }
      const isForward = rel.fromEntityId === current.entityId;
      if (!isForward && rel.direction === "directed" && input.permitReverse !== true) {
        // Reverse traversal of a directed relationship needs explicit permission.
        continue;
      }

      // Law 2: weight behavior. Zero weight does not propagate; negative suppresses.
      const weight = rel.weight ?? DEFAULTS.defaultWeightFactor * 100;
      if (weight === 0) {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          reason: "zero-weight relationships do not propagate (WGE-1400.005)"
        });
        continue;
      }
      if (weight < 0) {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          reason: `negative weight ${weight} suppresses influence (WGE-1400.005)`
        });
        continue;
      }

      // Law 3: Decay — weight scaling plus per-depth linear decay.
      let magnitude = current.magnitude * (weight / 100) * (1 - DEFAULTS.decayPerDepth);
      // Law 6: Confidence Transfer — certainty attenuates across the relationship.
      const confidence = current.confidence * (rel.confidence ?? 1);

      // Law 5: Objective Gravity — active objective fields reduce decay.
      const field = inField(targetId) ?? inField(current.entityId);
      if (field) {
        magnitude = Math.min(1, magnitude * (1 + field.magnitude * 0.5));
      }

      // Law 7: Temporal Momentum — stable patterns damp abrupt influence.
      const momentum = momentumOf(target);
      if (momentum > 0) {
        magnitude = magnitude * (1 - momentum);
      }

      // Law 3: stop conditions.
      if (magnitude < locality.minimumMagnitude || confidence < locality.minimumConfidence) {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          reason: `influence decayed below threshold (magnitude ${magnitude.toFixed(3)}, confidence ${confidence.toFixed(3)}) — no influence propagates forever (WGE-1400.006)`
        });
        continue;
      }

      // Law 4: Constraint Blocking — compiled constraints guard their subjects.
      const blockingLaw = blockingConstraint(constraintLaws, world, target, actor, context);
      if (blockingLaw) {
        blockedPaths.push({
          path: [...current.entityPath, targetId],
          relationshipId,
          blockedByConstraintIds: [blockingLaw.id],
          blockedByLawIds: [blockingLaw.id],
          reason: `constraint "${blockingLaw.name}" blocked propagation — blocked propagation is correct preservation of World truth (WGE-1400.007)`
        });
        paths.push({
          id: `phys_path_${event.id}_${++pathSequence}`,
          entityPath: [...current.entityPath, targetId],
          relationshipPath: [...current.relationshipPath, relationshipId],
          initialMagnitude: event.magnitude,
          finalMagnitude: magnitude,
          initialConfidence: event.confidence,
          finalConfidence: confidence,
          appliedLaws: [],
          appliedConstraints: [blockingLaw.id],
          blocked: true,
          blockedReason: `constraint "${blockingLaw.name}"`,
          effects: []
        });
        continue;
      }

      // Influence lands.
      visited.add(targetId);
      const depth = current.depth + 1;
      affected.set(targetId, { entityId: targetId, magnitude, confidence, depth });
      affectedRelationships.set(relationshipId, { relationshipId, magnitude, confidence });

      const effectId = `phys_effect_${event.id}_${++effectSequence}`;
      const entityPath = [...current.entityPath, targetId];
      const relationshipPath = [...current.relationshipPath, relationshipId];
      paths.push({
        id: `phys_path_${event.id}_${++pathSequence}`,
        entityPath,
        relationshipPath,
        initialMagnitude: event.magnitude,
        finalMagnitude: magnitude,
        initialConfidence: event.confidence,
        finalConfidence: confidence,
        appliedLaws: [],
        appliedConstraints: [],
        blocked: false,
        effects: [effectId]
      });
      effects.push({
        id: effectId,
        eventId: event.id,
        worldId: event.worldId,
        snapshotId: event.snapshotId,
        targetEntityId: targetId,
        type: "relevance.changed",
        magnitude,
        confidence,
        proposedDiffOperation: {
          type: "aspect.updated",
          entityId: targetId,
          aspectId: `aspect_${targetId}__physics`,
          changes: {
            kind: "physics",
            data: {
              relevance: Number(magnitude.toFixed(6)),
              confidence: Number(confidence.toFixed(6)),
              sourceEventId: event.id
            }
          }
        },
        reason: `influence from "${event.type}" reached "${targetId}" via ${relationshipPath.join(" → ")}`,
        traceStepId: `phys_path_${event.id}_${pathSequence}`
      });

      queue.push({ entityId: targetId, magnitude, confidence, depth, entityPath, relationshipPath });
    }
  }

  // --- Recomposition Triggers (WGE-1400.019) --------------------------------
  const meaningful = [...affected.values()].filter(
    (a) => a.magnitude >= DEFAULTS.recompositionThreshold
  );
  const recompositionTriggers: WGERecompositionTrigger[] =
    meaningful.length > 0
      ? [
          {
            id: `recomp_${event.id}`,
            worldId: event.worldId,
            snapshotId: event.snapshotId,
            source: "physics",
            affectedEntityIds: meaningful.map((a) => a.entityId).sort(),
            reason: `"${event.type}" meaningfully changed relevance for ${meaningful.length} entit${meaningful.length === 1 ? "y" : "ies"}`,
            priority:
              event.magnitude >= 0.9 ? "critical" : event.magnitude >= 0.7 ? "high" : "normal",
            traceId: event.traceId
          }
        ]
      : [];

  const sortedAffected = [...affected.values()].sort((a, b) =>
    a.entityId < b.entityId ? -1 : 1
  );

  return {
    eventId: event.id,
    worldId: event.worldId,
    snapshotId: event.snapshotId,
    affectedEntities: sortedAffected,
    affectedRelationships: [...affectedRelationships.values()].sort((a, b) =>
      a.relationshipId < b.relationshipId ? -1 : 1
    ),
    blockedPaths,
    // Effects are proposals until committed (WGE-1400.013).
    generatedDiffOperations: effects
      .filter((e) => e.proposedDiffOperation && e.magnitude >= DEFAULTS.recompositionThreshold)
      .map((e) => e.proposedDiffOperation)
      .filter((op): op is NonNullable<typeof op> => op !== undefined),
    recompositionTriggers,
    trace: {
      id: `phys_trace_${event.id}`,
      eventId: event.id,
      worldId: event.worldId,
      snapshotId: event.snapshotId,
      originEntityId: event.originEntityId,
      paths,
      summary: `"${event.type}" (magnitude ${event.magnitude}) affected ${sortedAffected.length} entit${sortedAffected.length === 1 ? "y" : "ies"}, blocked ${blockedPaths.length} path(s)`,
      createdAt: event.occurredAt
    },
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  };
}

/** Deterministically ordered relationship ids touching an entity. */
function neighborsOf(
  graph: InMemoryWorldGraph,
  entityId: string,
  permitReverse: boolean
): string[] {
  const ids = new Set<string>(graph.outboundByEntityId.get(entityId) ?? []);
  if (permitReverse) {
    for (const id of graph.inboundByEntityId.get(entityId) ?? []) ids.add(id);
  } else {
    // Bidirectional relationships are traversable either way without
    // explicit reverse permission; buildGraph indexes them both ways.
  }
  return [...ids].sort();
}

/** Objective Gravity fields from active wge.objective entities (WGE-1400.008). */
function resolveObjectiveFields(world: WGEWorld, event: WGEPhysicsEvent): WGERelevanceField[] {
  const fields: WGERelevanceField[] = [];
  for (const entity of Object.values(world.entities).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (entity.type !== WGE_OBJECTIVE_ENTITY_TYPE) continue;
    if (entity.lifecycle !== "active" && entity.lifecycle !== "created") continue;
    const state = entity.aspects.find((a) => a.kind === WGE_OBJECTIVE_ASPECT_KIND);
    if (!state) continue;
    const status = state.data.status;
    if (status !== "declared" && status !== "active") continue;
    const entry = (state.data.entry as { selector?: { kind: string; value?: unknown } } | undefined)
      ?.selector;
    const entryEntityId = entry?.kind === "id" ? String(entry.value) : undefined;
    if (!entryEntityId || !world.entities[entryEntityId]) continue;
    const priority = typeof state.data.priority === "number" ? state.data.priority : 50;
    fields.push({
      id: `field_${entity.id}`,
      worldId: world.id,
      snapshotId: event.snapshotId,
      source: "objective",
      originEntityIds: [entryEntityId],
      magnitude: priority / 100,
      confidence: 1,
      radius: 2,
      decay: { type: "linear", baseRate: 0.25, minimumMagnitude: 0.05, minimumConfidence: 0.1 },
      startedAt: event.occurredAt,
      metadata: { objectiveId: entity.id }
    });
  }
  return fields;
}

/** Law 7 — Temporal Momentum strength stored on a physics aspect. */
function momentumOf(entity: WGEEntity): number {
  const physicsAspect = entity.aspects.find((a) => a.kind === "physics");
  const momentum = physicsAspect?.data.momentum as { strength?: number } | undefined;
  const strength = momentum?.strength;
  return typeof strength === "number" && strength >= 0 && strength <= 1 ? strength : 0;
}

/** Law 4 — the first compiled constraint whose requirement fails for the target. */
function blockingConstraint(
  constraintLaws: WGELaw[],
  world: WGEWorld,
  target: WGEEntity,
  actor: WILActor,
  context: WILContext
): WGELaw | undefined {
  for (const law of constraintLaws) {
    const subjects = resolveSelector(world, law.appliesTo).entities;
    if (!subjects.some((s) => s.id === target.id)) continue;
    if (!evaluateCondition(law.condition, { world, entity: target, actor, context })) {
      return law;
    }
  }
  return undefined;
}
