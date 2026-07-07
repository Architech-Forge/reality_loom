/**
 * Kernel Validation (WGE-1000.012, REF-1900.006).
 *
 * Runs the validation phases in Codex order: identity, world root, entity,
 * aspect, relationship, law, traversal — and folds diagnostics into a
 * WGEValidationResult. A World that fails Kernel Validation MUST NOT compile
 * into an Executable World; the compiler (WGE-1200.010) calls this as a gate.
 *
 * Snapshot and Diff validation phases live with their primitives
 * (snapshot.ts enforces immutability structurally; diff.ts checks base
 * binding); constraint validation deepens with the graph layer (WGE-1100).
 */
import type { WGEEntity, WGEValidationResult, WGEWorld } from "@roc/types";
import { WGE_ENTITY_LIFECYCLES, WGE_RELATIONSHIP_LIFECYCLES, WGE_SELECTOR_KINDS } from "@roc/types";
import { DiagnosticCollector } from "@roc/diagnostics";

/**
 * Renderer-specific references are forbidden inside Kernel primitives
 * (WGE-1000.001 non-goals; noncompliance list in WGE-1000.013). The check
 * targets aspect kinds — the place meaning lives — and uses exact matches so
 * legitimate domain vocabulary (e.g. a garment "button") is untouched.
 */
const RENDERER_ASPECT_KINDS = new Set([
  "react",
  "dom",
  "css",
  "html",
  "route",
  "renderer",
  "component",
  "animation_timeline"
]);

/** REF-1900.006 required function. */
export function validateWorld(world: WGEWorld): WGEValidationResult {
  const c = new DiagnosticCollector();

  validateIdentity(world, c);
  validateRoot(world, c);
  validateEntities(world, c);
  validateAspects(world, c);
  validateRelationships(world, c);
  validateLaws(world, c);
  validateTraversals(world, c);

  return c.toValidationResult();
}

/** Phase 1 — Identity validation: index keys must agree with element ids. */
function validateIdentity(world: WGEWorld, c: DiagnosticCollector): void {
  if (!world.id || world.type !== "world") {
    c.add({
      code: "KERNEL_WORLD_IDENTITY_INVALID",
      severity: "error",
      message: 'A World MUST have a stable id and type "world" (WGE-1000.002)',
      affectedIds: world.id ? [world.id] : []
    });
  }
  if (!world.version) {
    c.add({
      code: "KERNEL_WORLD_VERSION_MISSING",
      severity: "error",
      message: "A World MUST have version metadata (WGE-1000.002)",
      affectedIds: [world.id]
    });
  }

  const indexes: [string, Record<string, { id: string }>][] = [
    ["entities", world.entities],
    ["relationships", world.relationships],
    ["laws", world.laws],
    ["traversals", world.traversals]
  ];
  for (const [name, index] of indexes) {
    for (const [key, element] of Object.entries(index)) {
      if (element.id !== key) {
        // A key/value id mismatch is how a duplicate-id collision manifests
        // in a keyed index — one element has overwritten or shadowed another.
        c.add({
          code: "KERNEL_DUPLICATE_ID",
          severity: "error",
          message: `World ${name} index key "${key}" disagrees with element id "${element.id}" (WGE-1000.002: no duplicate ids)`,
          affectedIds: [key, element.id],
          suggestedResolution: "Re-key the index by each element's id"
        });
      }
    }
  }
}

/** Phase 2 — World root validation: exactly one root entity exists. */
function validateRoot(world: WGEWorld, c: DiagnosticCollector): void {
  if (!world.rootEntityId) {
    c.add({
      code: "KERNEL_ROOT_MISSING",
      severity: "error",
      message: "A World MUST have exactly one root entity (WGE-1000.002)",
      affectedIds: [world.id],
      suggestedResolution: "Set rootEntityId and add the root entity to the entity index"
    });
    return;
  }
  if (!world.entities[world.rootEntityId]) {
    c.add({
      code: "KERNEL_ROOT_MISSING",
      severity: "error",
      message: `Root entity "${world.rootEntityId}" is not in the entity index (WGE-1000.002)`,
      affectedIds: [world.id, world.rootEntityId],
      suggestedResolution: "Add the root entity to the entity index"
    });
  }
}

function isConnected(world: WGEWorld, entity: WGEEntity): boolean {
  return Object.values(world.relationships).some(
    (r) =>
      r.lifecycle !== "deleted" &&
      r.lifecycle !== "archived" &&
      (r.fromEntityId === entity.id || r.toEntityId === entity.id)
  );
}

/** Phase 3 — Entity validation, including orphaned active entities. */
function validateEntities(world: WGEWorld, c: DiagnosticCollector): void {
  for (const entity of Object.values(world.entities)) {
    if (entity.worldId !== world.id) {
      c.add({
        code: "KERNEL_ENTITY_WORLD_MISMATCH",
        severity: "error",
        message: `Entity "${entity.id}" claims world "${entity.worldId}" but lives in "${world.id}" (WGE-1000.003)`,
        affectedIds: [entity.id, world.id]
      });
    }
    if (!entity.type) {
      c.add({
        code: "KERNEL_ENTITY_TYPE_MISSING",
        severity: "error",
        message: `Entity "${entity.id}" has no type (WGE-1000.003)`,
        affectedIds: [entity.id]
      });
    }
    if (!WGE_ENTITY_LIFECYCLES.includes(entity.lifecycle)) {
      c.add({
        code: "KERNEL_ENTITY_LIFECYCLE_INVALID",
        severity: "error",
        message: `Entity "${entity.id}" has invalid lifecycle ${JSON.stringify(entity.lifecycle)} (WGE-1000.003)`,
        affectedIds: [entity.id]
      });
    }

    // WGE-1000.002: no orphaned active entities. The root is exempt — it
    // represents the World as a whole.
    const activeStates: WGEEntity["lifecycle"][] = ["created", "active"];
    if (
      activeStates.includes(entity.lifecycle) &&
      entity.id !== world.rootEntityId &&
      !isConnected(world, entity)
    ) {
      c.add({
        code: "KERNEL_ORPHAN_ENTITY",
        severity: "error",
        message: `Active entity "${entity.id}" has no relationship connecting it to the World (WGE-1000.002: no orphaned active entities)`,
        affectedIds: [entity.id],
        suggestedResolution:
          "Relate the entity to the World (e.g. root contains entity) or archive it"
      });
    }
  }
}

/** Phase 4 — Aspect validation, including the renderer-reference ban. */
function validateAspects(world: WGEWorld, c: DiagnosticCollector): void {
  for (const entity of Object.values(world.entities)) {
    for (const aspect of entity.aspects) {
      if (aspect.entityId !== entity.id) {
        c.add({
          code: "KERNEL_ASPECT_ENTITY_MISMATCH",
          severity: "error",
          message: `Aspect "${aspect.id}" claims entity "${aspect.entityId}" but is owned by "${entity.id}" (WGE-1000.004)`,
          affectedIds: [aspect.id, entity.id]
        });
      }
      if (RENDERER_ASPECT_KINDS.has(aspect.kind.toLowerCase())) {
        c.add({
          code: "KERNEL_RENDERER_REFERENCE",
          severity: "error",
          message: `Aspect "${aspect.id}" has renderer-specific kind "${aspect.kind}" — Kernel primitives are domain- and renderer-neutral (WGE-1000.004, WGE-1000.013)`,
          affectedIds: [aspect.id, entity.id],
          suggestedResolution: "Express rendering intent as a projection_hint aspect; rendering belongs to SLI"
        });
      }
    }
  }
}

/** Phase 5 — Relationship validation: no references to missing entities. */
function validateRelationships(world: WGEWorld, c: DiagnosticCollector): void {
  for (const relationship of Object.values(world.relationships)) {
    for (const [end, entityId] of [
      ["fromEntityId", relationship.fromEntityId],
      ["toEntityId", relationship.toEntityId]
    ] as const) {
      if (!world.entities[entityId]) {
        c.add({
          code: "KERNEL_RELATIONSHIP_MISSING_ENTITY",
          severity: "error",
          message: `Relationship "${relationship.id}" ${end} references missing entity "${entityId}" (WGE-1000.005)`,
          affectedIds: [relationship.id, entityId]
        });
      }
    }
    if (!WGE_RELATIONSHIP_LIFECYCLES.includes(relationship.lifecycle)) {
      c.add({
        code: "KERNEL_RELATIONSHIP_LIFECYCLE_INVALID",
        severity: "error",
        message: `Relationship "${relationship.id}" has invalid lifecycle ${JSON.stringify(relationship.lifecycle)} (WGE-1000.005)`,
        affectedIds: [relationship.id]
      });
    }
  }
}

/** Phase 6 — Law validation: no law may reference a missing target. */
function validateLaws(world: WGEWorld, c: DiagnosticCollector): void {
  for (const law of Object.values(world.laws)) {
    if (!WGE_SELECTOR_KINDS.includes(law.appliesTo.kind)) {
      c.add({
        code: "KERNEL_LAW_SELECTOR_INVALID",
        severity: "error",
        message: `Law "${law.id}" appliesTo has invalid selector kind ${JSON.stringify(law.appliesTo.kind)} (WGE-1000.011)`,
        affectedIds: [law.id]
      });
      continue;
    }
    if (law.appliesTo.kind === "id") {
      const targetId = String(law.appliesTo.value);
      const exists =
        targetId in world.entities ||
        targetId in world.relationships ||
        targetId in world.laws ||
        targetId in world.traversals;
      if (!exists) {
        c.add({
          code: "KERNEL_LAW_MISSING_TARGET",
          severity: "error",
          message: `Law "${law.id}" references missing target "${targetId}" (WGE-1000.002: no law may reference a missing target)`,
          affectedIds: [law.id, targetId]
        });
      }
    }
  }
}

/** Phase 7 — Traversal validation: no missing entry points. */
function validateTraversals(world: WGEWorld, c: DiagnosticCollector): void {
  for (const traversal of Object.values(world.traversals)) {
    if (!WGE_SELECTOR_KINDS.includes(traversal.entry.kind)) {
      c.add({
        code: "KERNEL_TRAVERSAL_ENTRY_INVALID",
        severity: "error",
        message: `Traversal "${traversal.id}" entry has invalid selector kind ${JSON.stringify(traversal.entry.kind)} (WGE-1000.011)`,
        affectedIds: [traversal.id]
      });
      continue;
    }
    if (traversal.entry.kind === "id") {
      const entryId = String(traversal.entry.value);
      if (!world.entities[entryId] && !world.relationships[entryId]) {
        c.add({
          code: "KERNEL_TRAVERSAL_MISSING_ENTRY",
          severity: "error",
          message: `Traversal "${traversal.id}" entry references missing element "${entryId}" (WGE-1000.002: no traversal may reference a missing entry point)`,
          affectedIds: [traversal.id, entryId]
        });
      }
    }
  }
}
