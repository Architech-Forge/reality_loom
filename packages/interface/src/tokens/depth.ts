/**
 * Depth — consequence hierarchy, not decoration (SLI-1600.012).
 * Layers are runtime meanings; z.ts maps them to stacking numbers.
 */

export type RLDepthLayer =
  | "substrate" // the void the World floats in
  | "recede" // receded context, still recoverable
  | "field" // resting runtime fields
  | "graph" // world graph structure
  | "trace" // causality lines over structure
  | "projection" // active projection surfaces
  | "candidate" // possibility layers — above reality, visibly provisional
  | "authority" // boundaries and permission edges
  | "commit"; // consequential commit surfaces — topmost

export const RL_DEPTH_ORDER: readonly RLDepthLayer[] = [
  "substrate",
  "recede",
  "field",
  "graph",
  "trace",
  "projection",
  "candidate",
  "authority",
  "commit"
] as const;

export const depthOf = (layer: RLDepthLayer): number => RL_DEPTH_ORDER.indexOf(layer);
