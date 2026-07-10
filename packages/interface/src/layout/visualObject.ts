/**
 * The runtime visual object model — every visible thing in Reality Loom is
 * one of these. Kinds are world-native (Interface Contract rule 2): there is
 * no card, panel, or generic section in this union, by design.
 */

export interface RLVisualObject {
  id: string;

  kind:
    | "field"
    | "surface"
    | "node"
    | "trace"
    | "label"
    | "boundary"
    | "candidate"
    | "commit"
    | "projection";

  layer: number;
  priority: number;

  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  state:
    | "ambient"
    | "projected"
    | "focused"
    | "receded"
    | "committed"
    | "hidden";

  allowOverlap?: boolean;

  overlapReason?:
    | "intentional-orbit"
    | "modal"
    | "active-trace"
    | "depth-layer"
    | "graph-edge-crossing";
}

export type RLVisualKind = RLVisualObject["kind"];
export type RLVisualState = RLVisualObject["state"];
export type RLOverlapReason = NonNullable<RLVisualObject["overlapReason"]>;

export const RL_VISUAL_KINDS: readonly RLVisualKind[] = [
  "field",
  "surface",
  "node",
  "trace",
  "label",
  "boundary",
  "candidate",
  "commit",
  "projection"
] as const;

export const RL_OVERLAP_REASONS: readonly RLOverlapReason[] = [
  "intentional-orbit",
  "modal",
  "active-trace",
  "depth-layer",
  "graph-edge-crossing"
] as const;

/**
 * Structural validation: overlap permission must be declared AND traceable —
 * `allowOverlap` without an `overlapReason` is an undeclared overlap.
 */
export function validateVisualObject(object: RLVisualObject): string[] {
  const problems: string[] = [];
  if (!RL_VISUAL_KINDS.includes(object.kind)) {
    problems.push(`"${object.id}" has non-world-native kind "${object.kind}" (contract rule 2)`);
  }
  if (object.allowOverlap === true && object.overlapReason === undefined) {
    problems.push(`"${object.id}" allows overlap without declaring a reason (contract rule 7)`);
  }
  if (object.overlapReason !== undefined && !RL_OVERLAP_REASONS.includes(object.overlapReason)) {
    problems.push(`"${object.id}" declares unknown overlap reason "${object.overlapReason}"`);
  }
  if (object.bounds.width < 0 || object.bounds.height < 0) {
    problems.push(`"${object.id}" has negative bounds`);
  }
  return problems;
}
