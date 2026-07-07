/**
 * Traversal Runtime (WGE-1300.010, REF-1900.014).
 *
 * Executes compiled Traversal definitions against a World state. Traversal
 * is how WGE computes understanding from the World Graph; it never mutates
 * Reality. Deterministic: entries, hops, and collections are stable-sorted.
 */
import type {
  WGESelector,
  WGETraversal,
  WGETraversalRuntimeInput,
  WGETraversalRuntimeOutput,
  WGETraversalBlockedPath,
  WGEWorld,
  WILActor,
  WILTraceStep
} from "@roc/types";
import { evaluateCondition, resolveSelector } from "@wge/kernel";
import { buildGraph } from "@wge/graph";

export interface ExecuteTraversalInput extends WGETraversalRuntimeInput {
  world: WGEWorld;
  traversal: WGETraversal;
  actor: WILActor;
}

/** REF-1900.014 required function. */
export function executeTraversal(input: ExecuteTraversalInput): WGETraversalRuntimeOutput {
  const { world, traversal, actor, context } = input;
  const graph = buildGraph(world);
  const traceSteps: WILTraceStep[] = [];
  const blockedPaths: WGETraversalBlockedPath[] = [];
  const appliedLawIds = new Set<string>();
  let order = 1;

  // Resolve entry (WGE-1300.010 phase 1).
  const entrySelector: WGESelector = input.entryOverride ?? traversal.entry;
  let frontier = resolveSelector(world, entrySelector)
    .entities.filter((e) => e.lifecycle === "active" || e.lifecycle === "created")
    .map((e) => e.id)
    .sort();
  const visitedEntityIds = new Set<string>(frontier);
  const visitedRelationshipIds = new Set<string>();
  const collected = new Set<string>();
  let confidence = 1;

  traceSteps.push({
    order: order++,
    phase: "traversed",
    status: frontier.length > 0 ? "passed" : "failed",
    reason: `Entry selector resolved to ${frontier.length} entit${frontier.length === 1 ? "y" : "ies"}`,
    relatedEntityIds: frontier
  });

  const laws = (traversal.constraints ?? [])
    .map((id) => world.laws[id])
    .filter((law): law is NonNullable<typeof law> => law !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // Follow relationships rule by rule (WDL-001.009: each rule is one hop).
  for (const rule of traversal.rules) {
    if (frontier.length === 0) break;
    const next = new Set<string>();

    for (const entityId of frontier) {
      const outbound = (graph.outboundByEntityId.get(entityId) ?? []).sort();
      for (const relationshipId of outbound) {
        const rel = world.relationships[relationshipId];
        if (!rel) continue;
        if (rule.follow !== undefined && rel.type !== rule.follow) continue;
        if (rel.lifecycle !== "active" && rel.lifecycle !== "created") continue;
        if (rule.minConfidence !== undefined && (rel.confidence ?? 1) < rule.minConfidence) {
          blockedPaths.push({
            entityId: rel.toEntityId,
            relationshipId,
            reason: `relationship confidence ${rel.confidence ?? 1} below rule minimum ${rule.minConfidence}`
          });
          continue;
        }
        const targetId = rel.fromEntityId === entityId ? rel.toEntityId : rel.fromEntityId;
        if (rel.direction === "directed" && rel.fromEntityId !== entityId) continue;
        const target = world.entities[targetId];
        if (!target || (target.lifecycle !== "active" && target.lifecycle !== "created")) continue;

        visitedRelationshipIds.add(relationshipId);
        confidence = Math.min(confidence, rel.confidence ?? 1);
        if (!visitedEntityIds.has(targetId)) {
          visitedEntityIds.add(targetId);
          next.add(targetId);
        }

        // Collect (WGE-1300.010): matching entities enter the result set —
        // unless an applied Law's requirement fails for them.
        const matchesCollect =
          rule.collect === undefined ||
          resolveSelector(world, rule.collect).entities.some((e) => e.id === targetId);
        if (matchesCollect) {
          const blocking = laws.find((law) => {
            const subjects = resolveSelector(world, law.appliesTo).entities;
            if (!subjects.some((s) => s.id === targetId)) return false;
            appliedLawIds.add(law.id);
            return !evaluateCondition(law.condition, { world, entity: target, actor, context });
          });
          if (blocking) {
            blockedPaths.push({
              entityId: targetId,
              relationshipId,
              blockedByLawId: blocking.id,
              reason: `law "${blocking.name}" excluded "${targetId}" from collection`
            });
          } else {
            collected.add(targetId);
          }
        }
      }
    }

    frontier = [...next].sort();
    traceSteps.push({
      order: order++,
      phase: "traversed",
      status: "passed",
      reason: `Followed "${rule.follow ?? "*"}" to ${frontier.length} new entit${frontier.length === 1 ? "y" : "ies"}`,
      relatedEntityIds: frontier
    });

    if (rule.maxDepth !== undefined && order - 2 >= rule.maxDepth) break;
  }

  const collectedEntityIds = [...collected].sort();
  const limit = traversal.output.limit;
  const limited = limit !== undefined ? collectedEntityIds.slice(0, limit) : collectedEntityIds;

  traceSteps.push({
    order: order++,
    phase: "completed",
    status: "passed",
    reason: `Traversal "${traversal.id}" collected ${limited.length} entit${limited.length === 1 ? "y" : "ies"} with confidence ${confidence.toFixed(3)}`,
    relatedEntityIds: limited,
    relatedLawIds: [...appliedLawIds].sort()
  });

  return {
    traversalId: traversal.id,
    visitedEntityIds: [...visitedEntityIds].sort(),
    visitedRelationshipIds: [...visitedRelationshipIds].sort(),
    collectedEntityIds: limited,
    blockedPaths,
    appliedLawIds: [...appliedLawIds].sort(),
    confidence,
    traceSteps
  };
}
