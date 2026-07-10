/**
 * Spatial rhythm. Space is active design material (SLI-1600.011): the
 * substrate breathes, structure clusters, boundaries separate.
 */

export const rlSpacing = {
  /** Hairline offsets inside nodes. */
  quantum: 2,
  /** Intra-node padding. */
  node: 8,
  /** Between related nodes in a constellation. */
  cluster: 16,
  /** Between fields/surfaces. */
  field: 32,
  /** Breathing room around focused projection. */
  focus: 48,
  /** Substrate margin — the void beyond the World. */
  substrate: 72
} as const;

export type RLSpacingToken = keyof typeof rlSpacing;

/** Minimum gap the no-overlap engine preserves between visual objects. */
export const RL_MIN_GAP = rlSpacing.node;
