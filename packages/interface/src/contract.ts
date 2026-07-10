/**
 * The Reality Loom Interface Contract — executable form.
 * See REALITY_LOOM_INTERFACE_CONTRACT.md at the repository root.
 */
import { RL_FORBIDDEN_PRIMITIVES, RL_PRIMITIVES, type RLPrimitive } from "./primitives/index.js";
import { RL_MOTION_VOCABULARY } from "./motion/tokens.js";
import { assertNoUndeclaredOverlap } from "./layout/noOverlap.js";
import { validateVisualObject, type RLVisualObject } from "./layout/visualObject.js";
import type { RLBounds } from "./layout/bounds.js";

export const RL_INTERFACE_CONTRACT: readonly string[] = [
  "Reality Loom does not use cards as its primary visual metaphor.",
  "Every visible element is a field, node, trace, surface, layer, projection, or boundary.",
  "The UI must visually express runtime behavior.",
  "Generic SaaS layouts are invalid.",
  "Light textured card grids are invalid.",
  "MUI visual components may not define primary brand surfaces.",
  "No visual object may overlap another unless explicitly intentional.",
  "Motion must express projection, trace, ripple, commit, recede, or recomposition.",
  "The system must distinguish candidate state from committed reality.",
  "Reality Loom should feel like an operating substrate, not a website template."
] as const;

export interface RLScene {
  id: string;
  viewport: RLBounds;
  primitives: RLPrimitive[];
  /** Runtime linkage of the whole scene. */
  runtimeRef?: {
    worldId?: string;
    snapshotId?: string;
    traceId?: string;
    candidateWorldId?: string;
  };
}

export interface RLContractViolation {
  rule: number;
  objectId: string;
  reason: string;
}

export function flattenPrimitives(primitives: readonly RLPrimitive[]): RLPrimitive[] {
  const out: RLPrimitive[] = [];
  const walk = (list: readonly RLPrimitive[]): void => {
    for (const primitive of list) {
      out.push(primitive);
      walk(primitive.children);
    }
  };
  walk(primitives);
  return out;
}

export const flattenObjects = (scene: RLScene): RLVisualObject[] =>
  flattenPrimitives(scene.primitives).map((p) => p.object);

/**
 * Validates a scene against the contract. Empty result = conforming.
 * This is what makes the contract real rather than aspirational.
 */
export function validateScene(scene: RLScene): RLContractViolation[] {
  const violations: RLContractViolation[] = [];
  const all = flattenPrimitives(scene.primitives);

  for (const primitive of all) {
    // Rules 1, 4, 5 — forbidden primary primitives.
    if ((RL_FORBIDDEN_PRIMITIVES as readonly string[]).includes(primitive.primitive)) {
      violations.push({
        rule: 1,
        objectId: primitive.object.id,
        reason: `"${primitive.primitive}" is a forbidden primary primitive`
      });
    }
    if (!RL_PRIMITIVES.includes(primitive.primitive)) {
      violations.push({
        rule: 2,
        objectId: primitive.object.id,
        reason: `"${primitive.primitive}" is not a world-native primitive`
      });
    }
    // Rule 2 — kinds are world-native.
    for (const reason of validateVisualObject(primitive.object)) {
      violations.push({ rule: 2, objectId: primitive.object.id, reason });
    }
    // Rule 3 — every element expresses runtime behavior.
    if (!primitive.meaning) {
      violations.push({
        rule: 3,
        objectId: primitive.object.id,
        reason: "element declares no runtime meaning"
      });
    }
    // Rule 8 — motion vocabulary only.
    if (primitive.motion && !RL_MOTION_VOCABULARY.includes(primitive.motion.verb)) {
      violations.push({
        rule: 8,
        objectId: primitive.object.id,
        reason: `motion verb "${primitive.motion.verb}" is outside the runtime vocabulary`
      });
    }
    // Rule 9 — candidate state is never committed reality.
    if (primitive.object.kind === "candidate" && primitive.object.state === "committed") {
      violations.push({
        rule: 9,
        objectId: primitive.object.id,
        reason: "candidate object carries committed state — possibility rendered as Reality"
      });
    }
  }

  // Rule 7 — no undeclared overlap.
  for (const overlap of assertNoUndeclaredOverlap(all.map((p) => p.object))) {
    violations.push({
      rule: 7,
      objectId: overlap.objectId,
      reason: `${overlap.reason}${overlap.otherId ? ` (with ${overlap.otherId})` : ""}`
    });
  }

  return violations;
}
