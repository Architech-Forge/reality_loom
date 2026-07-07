/**
 * Intent execution — WIL message → proposed Diff operations (WGE-1300.005
 * "Execute Intent", WGE-1300.011).
 *
 * The first runtime supports simple entity/aspect/relationship mutations
 * (REF-1900.012). Delete archives rather than removes: WIL-001.003 defines
 * delete as "remove or archive according to World Laws", and archival
 * preserves identity, history, and relationship integrity.
 */
import type {
  WGEDiffOperation,
  WGERuntimeDiagnostic,
  WGEVisibility,
  WGEWorld,
  WILMessage
} from "@roc/types";
import { createAspect, createEntity, createRelationship } from "@wge/kernel";
import { generateId } from "@wge/wil";
import { aspectIdFor, relationshipIdFor } from "@wge/wdl";

export interface IntentInterpretation {
  operations: WGEDiffOperation[];
  diagnostics: WGERuntimeDiagnostic[];
}

interface AspectInput {
  kind: string;
  data: Record<string, unknown>;
  visibility?: WGEVisibility;
}

const err = (
  code: string,
  message: string,
  reason: string,
  traceId: string
): WGERuntimeDiagnostic => ({ code, severity: "error", message, reason, traceId });

/** Interprets a mutation-intent message into ordered diff operations. */
export function interpretIntent(
  message: WILMessage,
  world: WGEWorld,
  now: string
): IntentInterpretation {
  const operations: WGEDiffOperation[] = [];
  const diagnostics: WGERuntimeDiagnostic[] = [];
  const payload = message.payload ?? {};
  const { intent, target, traceId } = message;

  switch (intent.type) {
    case "create": {
      if (target.kind === "entity") {
        const id = target.id ?? (typeof payload.id === "string" ? payload.id : generateId("entity"));
        const type = typeof payload.type === "string" ? payload.type : undefined;
        if (!type) {
          diagnostics.push(
            err("RUNTIME_INTENT_TYPE_MISSING", "Creating an entity requires payload.type", "an Entity MUST have a type (WGE-1000.003)", traceId)
          );
          break;
        }
        const aspects = Array.isArray(payload.aspects) ? (payload.aspects as AspectInput[]) : [];
        const entity = createEntity({
          id,
          worldId: world.id,
          type,
          lifecycle: "active",
          createdAt: now,
          aspects: aspects.map((a) =>
            createAspect({
              id: aspectIdFor(id, a.kind),
              entityId: id,
              kind: a.kind,
              data: a.data,
              ...(a.visibility !== undefined ? { visibility: a.visibility } : {})
            })
          )
        });
        operations.push({ type: "entity.added", entity });

        // Containment keeps the World orphan-free (WGE-1100.003).
        const containedBy =
          typeof payload.containedBy === "string" ? payload.containedBy : world.rootEntityId;
        const relId = relationshipIdFor(containedBy, "contains", id);
        operations.push({
          type: "relationship.added",
          relationship: createRelationship({
            id: relId,
            worldId: world.id,
            fromEntityId: containedBy,
            toEntityId: id,
            type: "contains"
          })
        });
      } else if (target.kind === "relationship") {
        const from = typeof payload.from === "string" ? payload.from : undefined;
        const to = typeof payload.to === "string" ? payload.to : undefined;
        const type = typeof payload.type === "string" ? payload.type : undefined;
        if (!from || !to || !type) {
          diagnostics.push(
            err("RUNTIME_INTENT_RELATIONSHIP_INCOMPLETE", "Creating a relationship requires payload.from, payload.to, payload.type", "every Relationship MUST define source, target, and type (WGE-1000.005)", traceId)
          );
          break;
        }
        operations.push({
          type: "relationship.added",
          relationship: createRelationship({
            id: target.id ?? relationshipIdFor(from, type, to),
            worldId: world.id,
            fromEntityId: from,
            toEntityId: to,
            type,
            ...(typeof payload.direction === "string"
              ? { direction: payload.direction as "directed" | "bidirectional" }
              : {}),
            ...(typeof payload.weight === "number" ? { weight: payload.weight } : {}),
            ...(typeof payload.confidence === "number" ? { confidence: payload.confidence } : {})
          })
        });
      } else {
        diagnostics.push(
          err("RUNTIME_INTENT_TARGET_UNSUPPORTED", `The first runtime cannot create target kind "${target.kind}"`, "REF-1900.012: simple entity/aspect/relationship mutations only", traceId)
        );
      }
      break;
    }

    case "modify": {
      if (target.kind !== "entity" || !target.id) {
        diagnostics.push(
          err("RUNTIME_INTENT_TARGET_UNSUPPORTED", "Modify requires an entity target with an id", "REF-1900.012: simple entity/aspect/relationship mutations only", traceId)
        );
        break;
      }
      if (payload.changes !== undefined && typeof payload.changes === "object" && payload.changes !== null) {
        operations.push({
          type: "entity.updated",
          entityId: target.id,
          changes: payload.changes as Record<string, unknown>
        });
      }
      if (Array.isArray(payload.aspects)) {
        for (const aspect of payload.aspects as AspectInput[]) {
          operations.push({
            type: "aspect.updated",
            entityId: target.id,
            aspectId: aspectIdFor(target.id, aspect.kind),
            changes: { kind: aspect.kind, data: aspect.data }
          });
        }
      }
      if (operations.length === 0) {
        diagnostics.push(
          err("RUNTIME_INTENT_EMPTY_MODIFY", "Modify carried no changes", "provide payload.changes or payload.aspects", traceId)
        );
      }
      break;
    }

    case "delete": {
      if (target.kind === "entity" && target.id) {
        operations.push({
          type: "entity.updated",
          entityId: target.id,
          changes: { lifecycle: "archived" }
        });
      } else if (target.kind === "relationship" && target.id) {
        operations.push({
          type: "relationship.updated",
          relationshipId: target.id,
          changes: { lifecycle: "archived" }
        });
      } else {
        diagnostics.push(
          err("RUNTIME_INTENT_TARGET_UNSUPPORTED", "Delete requires an entity or relationship target with an id", "REF-1900.012: simple entity/aspect/relationship mutations only", traceId)
        );
      }
      break;
    }

    default:
      diagnostics.push(
        err("RUNTIME_INTENT_NOT_MUTATION", `Intent "${intent.type}" does not produce mutations`, "mutation interpretation handles create, modify, delete", traceId)
      );
  }

  return { operations, diagnostics };
}

/** Entity ids an operation set touches — the law-evaluation subjects. */
export function affectedEntityIds(operations: WGEDiffOperation[]): string[] {
  const ids = new Set<string>();
  for (const op of operations) {
    switch (op.type) {
      case "entity.added":
        ids.add(op.entity.id);
        break;
      case "entity.updated":
      case "entity.removed":
        ids.add(op.entityId);
        break;
      case "aspect.updated":
        ids.add(op.entityId);
        break;
      case "relationship.added":
        ids.add(op.relationship.fromEntityId);
        ids.add(op.relationship.toEntityId);
        break;
      case "relationship.updated":
      case "relationship.removed":
        break;
    }
  }
  return [...ids].sort();
}
