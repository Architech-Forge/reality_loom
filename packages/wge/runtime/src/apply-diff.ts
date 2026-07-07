/**
 * Diff application (WGE-1300.011, WGE-1300.012).
 *
 * Applies ordered Diff operations to a World, producing a NEW World value —
 * the input World is never mutated, which is what lets observe/simulate
 * modes stay provably isolated from Reality. Validation happens before
 * application: base snapshot binding, ID collisions, missing references.
 */
import type {
  WGEDiffOperation,
  WGEEntity,
  WGERuntimeDiagnostic,
  WGEWorld
} from "@roc/types";

export interface ApplyDiffResult {
  world?: WGEWorld;
  diagnostics: WGERuntimeDiagnostic[];
}

const err = (
  code: string,
  message: string,
  reason: string,
  traceId: string,
  relatedIds: string[]
): WGERuntimeDiagnostic => ({ code, severity: "error", message, reason, relatedIds, traceId });

export function applyDiffOperations(
  base: WGEWorld,
  operations: WGEDiffOperation[],
  traceId: string,
  now: string
): ApplyDiffResult {
  const diagnostics: WGERuntimeDiagnostic[] = [];
  const world = structuredClone(base);

  for (const op of operations) {
    switch (op.type) {
      case "entity.added": {
        if (world.entities[op.entity.id]) {
          diagnostics.push(
            err(
              "RUNTIME_DIFF_ID_COLLISION",
              `Entity "${op.entity.id}" already exists`,
              "new IDs must not collide (WGE-1300.011)",
              traceId,
              [op.entity.id]
            )
          );
          break;
        }
        world.entities[op.entity.id] = structuredClone(op.entity);
        break;
      }
      case "entity.updated": {
        const entity = world.entities[op.entityId];
        if (!entity) {
          diagnostics.push(
            err(
              "RUNTIME_DIFF_MISSING_ENTITY",
              `Entity "${op.entityId}" does not exist`,
              "referenced IDs must exist (WGE-1300.011)",
              traceId,
              [op.entityId]
            )
          );
          break;
        }
        applyChanges(entity, op.changes, now);
        break;
      }
      case "entity.removed": {
        if (!world.entities[op.entityId]) {
          diagnostics.push(
            err("RUNTIME_DIFF_MISSING_ENTITY", `Entity "${op.entityId}" does not exist`, "referenced IDs must exist (WGE-1300.011)", traceId, [op.entityId])
          );
          break;
        }
        const stillReferenced = Object.values(world.relationships).some(
          (rel) => rel.fromEntityId === op.entityId || rel.toEntityId === op.entityId
        );
        if (stillReferenced) {
          diagnostics.push(
            err(
              "RUNTIME_DIFF_ENTITY_REFERENCED",
              `Entity "${op.entityId}" still has relationships`,
              "removing it would create dangling relationships (WGE-1000.005); archive instead or remove relationships first",
              traceId,
              [op.entityId]
            )
          );
          break;
        }
        delete world.entities[op.entityId];
        break;
      }
      case "relationship.added": {
        if (world.relationships[op.relationship.id]) {
          diagnostics.push(
            err("RUNTIME_DIFF_ID_COLLISION", `Relationship "${op.relationship.id}" already exists`, "new IDs must not collide (WGE-1300.011)", traceId, [op.relationship.id])
          );
          break;
        }
        for (const end of [op.relationship.fromEntityId, op.relationship.toEntityId]) {
          if (!world.entities[end]) {
            diagnostics.push(
              err("RUNTIME_DIFF_MISSING_ENTITY", `Relationship endpoint "${end}" does not exist`, "referenced IDs must exist (WGE-1300.011)", traceId, [op.relationship.id, end])
            );
          }
        }
        world.relationships[op.relationship.id] = structuredClone(op.relationship);
        break;
      }
      case "relationship.updated": {
        const rel = world.relationships[op.relationshipId];
        if (!rel) {
          diagnostics.push(
            err("RUNTIME_DIFF_MISSING_RELATIONSHIP", `Relationship "${op.relationshipId}" does not exist`, "referenced IDs must exist (WGE-1300.011)", traceId, [op.relationshipId])
          );
          break;
        }
        Object.assign(rel, op.changes);
        break;
      }
      case "relationship.removed": {
        if (!world.relationships[op.relationshipId]) {
          diagnostics.push(
            err("RUNTIME_DIFF_MISSING_RELATIONSHIP", `Relationship "${op.relationshipId}" does not exist`, "referenced IDs must exist (WGE-1300.011)", traceId, [op.relationshipId])
          );
          break;
        }
        delete world.relationships[op.relationshipId];
        break;
      }
      case "aspect.updated": {
        const entity = world.entities[op.entityId];
        if (!entity) {
          diagnostics.push(
            err("RUNTIME_DIFF_MISSING_ENTITY", `Entity "${op.entityId}" does not exist`, "referenced IDs must exist (WGE-1300.011)", traceId, [op.entityId])
          );
          break;
        }
        const existing = entity.aspects.find((a) => a.id === op.aspectId);
        if (existing) {
          // Update: merge changes into aspect data, bump version.
          existing.data = { ...existing.data, ...(op.changes.data as Record<string, unknown> ?? op.changes) };
          existing.version += 1;
        } else {
          // Creation: WGE-1000.010 defines aspect.updated as the only aspect
          // operation, while WGE-1300.011 requires diffs for aspect creation —
          // so aspect.updated has upsert semantics when kind is provided.
          const kind = op.changes.kind;
          if (typeof kind !== "string") {
            diagnostics.push(
              err(
                "RUNTIME_DIFF_MISSING_ASPECT",
                `Aspect "${op.aspectId}" does not exist on "${op.entityId}" and no kind was provided to create it`,
                "aspect.updated upserts only when changes.kind identifies the new aspect (WGE-1300.011)",
                traceId,
                [op.entityId, op.aspectId]
              )
            );
            break;
          }
          entity.aspects.push({
            id: op.aspectId,
            entityId: op.entityId,
            kind,
            data: (op.changes.data as Record<string, unknown>) ?? {},
            version: 1
          });
        }
        entity.updatedAt = now;
        entity.version += 1;
        break;
      }
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics };
  return { world, diagnostics };
}

function applyChanges(entity: WGEEntity, changes: Record<string, unknown>, now: string): void {
  // Identity is intrinsic (WGE-1100.003): id/worldId are never patchable.
  const { id: _id, worldId: _worldId, aspects: _aspects, ...safe } = changes;
  Object.assign(entity, safe);
  entity.updatedAt = now;
  entity.version += 1;
}
