/**
 * Spatial priority — who keeps their place when space is contested.
 * Deterministic: layer, then state weight, then declared priority, then id.
 */
import type { RLVisualObject, RLVisualState } from "./visualObject.js";

/** Runtime state outranks declared priority: focus is protected attention. */
const STATE_WEIGHT: Record<RLVisualState, number> = {
  focused: 5,
  committed: 4,
  projected: 3,
  ambient: 2,
  receded: 1,
  hidden: 0
};

export const stateWeight = (state: RLVisualState): number => STATE_WEIGHT[state];

/** Higher wins. Total order — no ties, so resolution is deterministic. */
export function comparePriority(a: RLVisualObject, b: RLVisualObject): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  const stateDelta = STATE_WEIGHT[a.state] - STATE_WEIGHT[b.state];
  if (stateDelta !== 0) return stateDelta;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.id < b.id ? 1 : -1; // stable, arbitrary-but-fixed tiebreak
}

export const higherPriority = (a: RLVisualObject, b: RLVisualObject): RLVisualObject =>
  comparePriority(a, b) >= 0 ? a : b;
