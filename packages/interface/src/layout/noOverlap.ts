/**
 * The no-overlap engine.
 *
 * INVARIANT: No Reality Architecture visual object may overlap another object unless
 * overlap is explicitly intentional, declared, and traceable.
 *
 * Resolution algorithm (Interface Contract rule 7):
 *   1. Detect collision.
 *   2. Check intentional overlap.
 *   3. Preserve higher-priority object.
 *   4. Move lower-priority object to nearest safe slot.
 *   5. Collapse to node marker if no safe slot exists.
 *   6. Log diagnostic in development mode.
 */
import { intersects, type RABounds } from "./bounds.js";
import { comparePriority } from "./spatialPriority.js";
import { collapseToMarker, nearestSafeSlot } from "./safeSlots.js";
import { validateVisualObject, type RAVisualObject } from "./visualObject.js";
import type { RALayoutDiagnostic, RALayoutDiagnosticsSink } from "./diagnostics.js";
import { RA_MIN_GAP } from "../tokens/spacing.js";

export interface CollisionPair {
  a: RAVisualObject;
  b: RAVisualObject;
}

/** Step 1 — detect collisions among same-layer, placeable objects. */
export function detectCollisions(objects: readonly RAVisualObject[]): CollisionPair[] {
  const pairs: CollisionPair[] = [];
  const placeable = objects.filter((o) => o.state !== "hidden");
  for (let i = 0; i < placeable.length; i += 1) {
    for (let j = i + 1; j < placeable.length; j += 1) {
      const a = placeable[i] as RAVisualObject;
      const b = placeable[j] as RAVisualObject;
      // Different depth layers coexist by construction (depth is meaning);
      // contention is a same-layer phenomenon.
      if (a.layer !== b.layer) continue;
      if (intersects(a.bounds, b.bounds, RA_MIN_GAP / 2)) pairs.push({ a, b });
    }
  }
  return pairs;
}

/** Step 2 — overlap is permitted only when declared AND traceable. */
export const isIntentionalOverlap = (a: RAVisualObject, b: RAVisualObject): boolean =>
  (a.allowOverlap === true && a.overlapReason !== undefined) ||
  (b.allowOverlap === true && b.overlapReason !== undefined);

export interface ResolveResult {
  objects: RAVisualObject[];
  moved: string[];
  collapsed: string[];
  diagnostics: RALayoutDiagnostic[];
}

export function resolveCollisions(
  input: readonly RAVisualObject[],
  viewport: RABounds,
  options: { dev?: boolean; sink?: RALayoutDiagnosticsSink } = {}
): ResolveResult {
  const diagnostics: RALayoutDiagnostic[] = [];
  const emit = (diagnostic: RALayoutDiagnostic): void => {
    diagnostics.push(diagnostic);
    // Step 6 — log diagnostic in development mode.
    if (options.dev) (options.sink ?? (() => undefined))(diagnostic);
  };

  // Structural validation before spatial work.
  const objects: RAVisualObject[] = [];
  for (const object of input) {
    const problems = validateVisualObject(object);
    if (problems.length > 0) {
      for (const reason of problems) {
        emit({ code: "RA_LAYOUT_INVALID_OBJECT", objectId: object.id, reason });
      }
    }
    objects.push({ ...object, bounds: { ...object.bounds } });
  }

  const moved: string[] = [];
  const collapsed: string[] = [];

  // Deterministic processing order: strongest first, so weaker objects
  // always yield to a stable set of already-settled obstacles.
  const settled: RAVisualObject[] = [];
  const ordered = [...objects.filter((o) => o.state !== "hidden")].sort((a, b) => -comparePriority(a, b));

  for (const object of ordered) {
    // Step 1 — detect collision against everything already settled on this layer.
    const contested = settled.filter(
      (other) => other.layer === object.layer && intersects(object.bounds, other.bounds, RA_MIN_GAP / 2)
    );

    if (contested.length === 0) {
      settled.push(object);
      continue;
    }

    // Step 2 — check intentional overlap (declared and traceable).
    const allIntentional = contested.every((other) => isIntentionalOverlap(object, other));
    if (allIntentional) {
      for (const other of contested) {
        emit({
          code: "RA_LAYOUT_INTENTIONAL_OVERLAP",
          objectId: object.id,
          otherId: other.id,
          reason: `declared: ${object.overlapReason ?? other.overlapReason}`
        });
      }
      settled.push(object);
      continue;
    }

    // Step 3 — the settled (higher-priority) objects keep their place.
    // Step 4 — move this lower-priority object to the nearest safe slot.
    const obstacles = settled.filter((o) => o.layer === object.layer && !isIntentionalOverlap(object, o)).map((o) => o.bounds);
    const slot = nearestSafeSlot(object.bounds, obstacles, viewport);

    if (slot) {
      emit({
        code: "RA_LAYOUT_DISPLACED",
        objectId: object.id,
        otherId: contested[0]?.id ?? "",
        reason: `undeclared overlap with higher-priority object; moved to nearest safe slot (${Math.round(slot.x)},${Math.round(slot.y)})`
      });
      object.bounds = slot;
      moved.push(object.id);
      settled.push(object);
      continue;
    }

    // Step 5 — no safe slot: collapse to a node marker.
    emit({
      code: "RA_LAYOUT_COLLAPSED",
      objectId: object.id,
      reason: "no safe slot in viewport; collapsed to node marker (recoverable)"
    });
    object.bounds = collapseToMarker(object.bounds, viewport);
    object.state = object.state === "focused" ? "focused" : "receded";
    collapsed.push(object.id);
    settled.push(object);
  }

  const hidden = objects.filter((o) => o.state === "hidden");
  return { objects: [...settled, ...hidden], moved, collapsed, diagnostics };
}

/** Post-condition check: true when no undeclared overlap remains. */
export function assertNoUndeclaredOverlap(objects: readonly RAVisualObject[]): RALayoutDiagnostic[] {
  return detectCollisions(objects)
    .filter((pair) => !isIntentionalOverlap(pair.a, pair.b))
    .map((pair) => ({
      code: "RA_LAYOUT_UNDECLARED_OVERLAP" as const,
      objectId: pair.a.id,
      otherId: pair.b.id,
      reason: "objects overlap without a declared, traceable reason (contract rule 7)"
    }));
}
