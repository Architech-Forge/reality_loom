/**
 * Line system — thin luminous geometry. Lines ARE the Reality Loom
 * aesthetic: structure is drawn, not boxed.
 */

export type RLLineRole =
  | "rest" // resting structure
  | "signal" // energized/live structure
  | "trace" // causality path
  | "candidate" // possibility — always dashed: provisional geometry
  | "boundary" // authority edge
  | "commit"; // consequential edge

export interface RLLineToken {
  role: RLLineRole;
  width: number;
  dash?: readonly number[];
  colorRole: "line" | "signalLine" | "trace" | "candidate" | "boundary" | "reality";
}

export const rlLines: Record<RLLineRole, RLLineToken> = {
  rest: { role: "rest", width: 1, colorRole: "line" },
  signal: { role: "signal", width: 1, colorRole: "signalLine" },
  trace: { role: "trace", width: 1.5, colorRole: "trace" },
  // Dashed by contract: candidate geometry must never read as committed.
  candidate: { role: "candidate", width: 1, dash: [6, 4], colorRole: "candidate" },
  boundary: { role: "boundary", width: 1.5, dash: [2, 3], colorRole: "boundary" },
  commit: { role: "commit", width: 2, colorRole: "reality" }
} as const;
