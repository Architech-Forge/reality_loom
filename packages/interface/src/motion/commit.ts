/**
 * commit — possibility becoming Reality. The shortest motion in the system:
 * decisive, settling, final. Candidate dashes solidify into committed line.
 */
import { describeMotion, type RAMotionDescriptor } from "./tokens.js";

export const commitMotion = (reason: string, traceId?: string): RAMotionDescriptor =>
  describeMotion("commit", reason, traceId !== undefined ? { traceId } : {});

/** merge — a candidate world landing in Reality through explicit commit. */
export const mergeMotion = (reason: string, traceId?: string): RAMotionDescriptor =>
  describeMotion("merge", reason, traceId !== undefined ? { traceId } : {});
