/**
 * @wge/kernel — Minimal Kernel Implementation.
 *
 * REF-1900.006. Build order position 4 (REF-1900.003).
 * Volume 1000 (WGE-1000.001 – WGE-1000.013) is the governing specification.
 *
 * The Kernel is intentionally minimal: it knows how Worlds are structured,
 * never application domains, rendering, or UI (WGE-1000.001).
 */
export {
  createWorld,
  createEntity,
  createAspect,
  createRelationship,
  createLaw,
  createEvent,
  createTraversal,
  type WGEWorldInput,
  type WGEEntityInput,
  type WGEAspectInput,
  type WGERelationshipInput,
  type WGELawInput,
  type WGEEventInput,
  type WGETraversalInput
} from "./create.js";
export { createSnapshot, snapshotsEquivalent, type WGESnapshotInput } from "./snapshot.js";
export { createDiff, checkDiffBase, type WGEDiffInput } from "./diff.js";
export { resolveSelector, type SelectorResolution } from "./selector.js";
export {
  evaluateCondition,
  resolveEntityPath,
  resolveValueRef,
  type ConditionScope
} from "./conditions.js";
export { validateWorld } from "./validate.js";
export { hashIndex } from "./hash.js";
