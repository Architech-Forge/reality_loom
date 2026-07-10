/**
 * Motion semantics. Reality Loom motion is not generic animation — it
 * expresses runtime concepts. If motion does not express projection, trace,
 * ripple, commit, recede, or recomposition, it does not exist
 * (Interface Contract rule 8; SLI-1500.009: motion must clarify).
 */

/** The complete motion vocabulary. Nothing outside it is valid. */
export type RLMotionVerb =
  | "project"
  | "recede"
  | "ripple"
  | "trace"
  | "commit"
  | "simulate"
  | "fork"
  | "merge"
  | "collapse"
  | "recompose";

export const RL_MOTION_VOCABULARY: readonly RLMotionVerb[] = [
  "project",
  "recede",
  "ripple",
  "trace",
  "commit",
  "simulate",
  "fork",
  "merge",
  "collapse",
  "recompose"
] as const;

export const rlMotion = {
  ripple: {
    duration: 0.7,
    ease: [0.16, 1, 0.3, 1]
  },

  project: {
    duration: 0.55,
    ease: [0.22, 1, 0.36, 1]
  },

  commit: {
    duration: 0.38,
    ease: [0.2, 0.8, 0.2, 1]
  },

  trace: {
    duration: 0.9,
    ease: [0.12, 0.7, 0.18, 1]
  },

  recede: {
    duration: 0.42,
    ease: [0.4, 0, 0.2, 1]
  }
} as const;

/** Verbs that share timing with a base token. */
const TIMING_ALIAS: Record<RLMotionVerb, keyof typeof rlMotion> = {
  project: "project",
  recede: "recede",
  ripple: "ripple",
  trace: "trace",
  commit: "commit",
  simulate: "project", // simulation projects into a candidate layer
  fork: "ripple", // branching radiates from its origin
  merge: "commit", // merging is a commit landing
  collapse: "recede", // collapse is an emphatic recede
  recompose: "project" // recomposition is re-projection with continuity
};

export interface RLMotionDescriptor {
  verb: RLMotionVerb;
  duration: number;
  ease: readonly number[];
  /** What runtime event this motion expresses — required and traceable. */
  reason: string;
  /** Trace causality where the motion was caused by an interaction. */
  traceId?: string;
  /** Reduced-motion alternative is mandatory (SLI-1600.010). */
  reducedMotionAlternative: "fade" | "instant" | "static_state_change";
}

export function describeMotion(
  verb: RLMotionVerb,
  reason: string,
  options: { traceId?: string; reducedMotionAlternative?: RLMotionDescriptor["reducedMotionAlternative"] } = {}
): RLMotionDescriptor {
  if (!RL_MOTION_VOCABULARY.includes(verb)) {
    throw new Error(`"${verb}" is not in the Reality Loom motion vocabulary (Interface Contract rule 8)`);
  }
  if (!reason) {
    throw new Error("motion must declare the runtime behavior it expresses — motion must clarify");
  }
  const timing = rlMotion[TIMING_ALIAS[verb]];
  return {
    verb,
    duration: timing.duration,
    ease: timing.ease,
    reason,
    ...(options.traceId !== undefined ? { traceId: options.traceId } : {}),
    reducedMotionAlternative: options.reducedMotionAlternative ?? "static_state_change"
  };
}
