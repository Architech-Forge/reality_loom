/**
 * Projection layout — the bridge from SLI's semantic plan to Reality Loom
 * visual objects. SLI decides WHAT is experienced (roles, regions, density);
 * this engine decides WHERE it stands in the substrate, with the no-overlap
 * invariant enforced on the result.
 */
import type { SLIProjectionOutput } from "@roc/types";
import type { RLBounds } from "./bounds.js";
import { resolveCollisions, type ResolveResult } from "./noOverlap.js";
import type { RLVisualObject, RLVisualState } from "./visualObject.js";
import { depthOf } from "../tokens/depth.js";

/** SLI object role → RL runtime state. */
const ROLE_STATE: Record<string, RLVisualState> = {
  primary: "focused",
  secondary: "projected",
  supporting: "projected",
  peripheral: "ambient",
  ambient: "ambient",
  hidden: "hidden"
};

/** SLI object role → RL visual kind. */
const ROLE_KIND: Record<string, RLVisualObject["kind"]> = {
  primary: "projection",
  secondary: "surface",
  supporting: "surface",
  peripheral: "node",
  ambient: "field",
  hidden: "node"
};

const ROLE_PRIORITY: Record<string, number> = {
  primary: 100,
  secondary: 70,
  supporting: 50,
  peripheral: 30,
  ambient: 10,
  hidden: 0
};

export interface ProjectionLayoutResult extends ResolveResult {
  viewport: RLBounds;
}

/**
 * Converts an SLI projection into placed, non-overlapping visual objects.
 * Deterministic: same projection + viewport → identical layout.
 */
export function layoutProjection(
  projection: SLIProjectionOutput,
  viewport: RLBounds,
  options: { dev?: boolean } = {}
): ProjectionLayoutResult {
  const objects: RLVisualObject[] = projection.rendererInstructions.map((instruction) => {
    const role = instruction.projectionRole;
    const hint = instruction.boundsHint;
    const bounds: RLBounds = hint
      ? {
          x: viewport.x + hint.x * viewport.width,
          y: viewport.y + hint.y * viewport.height,
          width: Math.max(1, hint.width * viewport.width),
          height: Math.max(1, hint.height * viewport.height)
        }
      : { x: viewport.x, y: viewport.y, width: 1, height: 1 };

    const kind = ROLE_KIND[role] ?? "node";
    return {
      id: instruction.entityId,
      kind,
      layer: depthOf(kind === "projection" ? "projection" : kind === "field" ? "field" : "graph"),
      priority: Math.round(ROLE_PRIORITY[role] ?? 0 + instruction.visualWeight * 10),
      bounds,
      state: ROLE_STATE[role] ?? "ambient",
      // Ambient fields form the backdrop other objects stand on — an
      // intentional, declared depth relationship.
      ...(kind === "field" ? { allowOverlap: true, overlapReason: "depth-layer" as const } : {})
    };
  });

  const result = resolveCollisions(objects, viewport, options);
  return { ...result, viewport };
}
