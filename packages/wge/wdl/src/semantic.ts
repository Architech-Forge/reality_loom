/**
 * WDL → Semantic Model normalization (WGE-1200.006) and Export To WIL
 * (WDL-001.012).
 *
 * Semantic operations are emitted in a deterministic order: sections in
 * canonical order, declarations sorted by id. Operation ids derive from the
 * declaration they normalize, so recompiling unchanged source produces
 * identical operations (WGE-1200.007 generated-id stability).
 */
import type {
  WGEObjectiveAspect,
  WGESemanticOperation,
  WILActor,
  WILMessage
} from "@roc/types";
import { WGE_OBJECTIVE_ASPECT_KIND, WGE_OBJECTIVE_ENTITY_TYPE } from "@roc/types";
import { createWILMessage } from "@wge/wil";
import type { WDLDocument } from "./document.js";

const sortById = <T extends { id?: string }>(items: T[], fallback: (item: T) => string): T[] =>
  [...items].sort((a, b) => {
    const ka = a.id ?? fallback(a);
    const kb = b.id ?? fallback(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

/** Deterministic relationship identity when the author omits one (WGE-1200.007). */
export const relationshipIdFor = (from: string, type: string, to: string): string =>
  `rel_${from}__${type}__${to}`;

/** Deterministic aspect identity: one owner, one kind (WGE-1200.009). */
export const aspectIdFor = (ownerId: string, kind: string): string =>
  `aspect_${ownerId}__${kind}`;

export const lawIdFor = (name: string): string =>
  `law_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

export function toSemanticOperations(
  document: WDLDocument,
  sourceUnitId = "wdl"
): WGESemanticOperation[] {
  const operations: WGESemanticOperation[] = [];
  const sourceRef = { sourceUnitId };

  operations.push({
    id: `op_world__${document.world.id}`,
    kind: "world.declare",
    sourceRef,
    payload: { ...document.world }
  });

  for (const entity of sortById(document.entities ?? [], (e) => e.id)) {
    const { aspects, ...entityPayload } = entity;
    operations.push({
      id: `op_entity__${entity.id}`,
      kind: "entity.declare",
      sourceRef,
      payload: { ...entityPayload }
    });
    for (const aspect of [...(aspects ?? [])].sort((a, b) => (a.kind < b.kind ? -1 : 1))) {
      operations.push({
        id: `op_aspect__${aspectIdFor(entity.id, aspect.kind)}`,
        kind: "aspect.attach",
        sourceRef,
        payload: { ownerId: entity.id, ...aspect }
      });
    }
  }

  for (const rel of sortById(document.relationships ?? [], (r) =>
    relationshipIdFor(r.from, r.type, r.to)
  )) {
    const id = rel.id ?? relationshipIdFor(rel.from, rel.type, rel.to);
    operations.push({
      id: `op_relationship__${id}`,
      kind: "relationship.declare",
      sourceRef,
      payload: { id, ...rel }
    });
  }

  for (const law of sortById(document.laws ?? [], (l) => lawIdFor(l.name))) {
    const id = law.id ?? lawIdFor(law.name);
    operations.push({
      id: `op_law__${id}`,
      kind: "law.declare",
      sourceRef,
      payload: { id, ...law }
    });
  }

  for (const traversal of sortById(document.traversals ?? [], (t) => t.id)) {
    operations.push({
      id: `op_traversal__${traversal.id}`,
      kind: "traversal.declare",
      sourceRef,
      payload: { ...traversal }
    });
  }

  // Objective lowering (canonical, approved 2026-07-06): objectives become
  // root-contained Entities of type "wge.objective" with a
  // "wge.objective_state" Aspect — never a kernel primitive (WDL-001.008,
  // WGE-1000.003: everything that exists is an Entity).
  for (const objective of sortById(document.objectives ?? [], (o) => o.id)) {
    operations.push({
      id: `op_objective__${objective.id}`,
      kind: "entity.declare",
      sourceRef,
      payload: {
        id: objective.id,
        type: WGE_OBJECTIVE_ENTITY_TYPE,
        lifecycle: "active",
        metadata: { ...objective.metadata, objective: true }
      }
    });
    const objectiveState: WGEObjectiveAspect = {
      kind: WGE_OBJECTIVE_ASPECT_KIND,
      objectiveKind: objective.kind ?? "general",
      label: objective.label,
      entry: { selector: { kind: "id", value: objective.entry } },
      traversal: { traversalId: objective.traversal, strategy: "declared" },
      ...(objective.priority !== undefined ? { priority: objective.priority } : {}),
      status: "declared",
      source: { language: "wdl", declarationId: objective.id }
    };
    operations.push({
      id: `op_aspect__${aspectIdFor(objective.id, WGE_OBJECTIVE_ASPECT_KIND)}`,
      kind: "aspect.attach",
      sourceRef,
      payload: {
        ownerId: objective.id,
        kind: WGE_OBJECTIVE_ASPECT_KIND,
        data: objectiveState as unknown as Record<string, unknown>
      }
    });
  }

  for (const capability of sortById(document.capabilities ?? [], (c) => c.id)) {
    operations.push({
      id: `op_capability__${capability.id}`,
      kind: "capability.declare",
      sourceRef,
      payload: { ...capability }
    });
  }

  for (const constraint of sortById(document.constraints ?? [], (c) => c.id)) {
    operations.push({
      id: `op_constraint__${constraint.id}`,
      kind: "constraint.declare",
      sourceRef,
      payload: { ...constraint }
    });
  }

  if (document.metadata !== undefined) {
    operations.push({
      id: `op_metadata__${document.world.id}`,
      kind: "metadata.attach",
      sourceRef,
      payload: { ownerId: document.world.id, metadata: document.metadata }
    });
  }

  return operations;
}

/**
 * Export To WIL (WDL-001.012): every WDL definition converts into
 * WIL-compatible create operations so tools, AI agents, and Studio
 * environments author Worlds through the same protocol.
 */
export function documentToWILMessages(
  document: WDLDocument,
  actor: WILActor,
  traceId?: string
): WILMessage[] {
  const context = { worldId: document.world.id };
  const messages: WILMessage[] = [];
  let shared: string | undefined = traceId;

  const push = (targetKind: "world" | "entity" | "relationship" | "law" | "traversal", id: string, payload: Record<string, unknown>): void => {
    const message = createWILMessage({
      actor,
      intent: { type: "create", reason: `WDL export: declare ${targetKind} ${id}` },
      target: { kind: targetKind, id },
      context,
      mode: "commit",
      payload,
      ...(shared !== undefined ? { traceId: shared } : {})
    });
    shared ??= message.traceId; // all export messages share one causal chain
    messages.push(message);
  };

  push("world", document.world.id, { ...document.world });
  for (const entity of document.entities ?? []) push("entity", entity.id, { ...entity });
  for (const rel of document.relationships ?? []) {
    const id = rel.id ?? relationshipIdFor(rel.from, rel.type, rel.to);
    push("relationship", id, { id, ...rel });
  }
  for (const law of document.laws ?? []) {
    const id = law.id ?? lawIdFor(law.name);
    push("law", id, { id, ...law });
  }
  for (const traversal of document.traversals ?? []) push("traversal", traversal.id, { ...traversal });

  return messages;
}
