/**
 * ripple — physics propagation made visible. Influence radiates outward
 * through relationship geometry, attenuating with distance, exactly like
 * the runtime it expresses (WGE-1400: changes ripple, they do not explode).
 */
import { describeMotion, type RLMotionDescriptor } from "./tokens.js";

export const rippleMotion = (reason: string, traceId?: string): RLMotionDescriptor =>
  describeMotion("ripple", reason, traceId !== undefined ? { traceId } : {});

/** fork — a candidate world branching: a ripple that leaves a new layer behind. */
export const forkMotion = (reason: string, traceId?: string): RLMotionDescriptor =>
  describeMotion("fork", reason, traceId !== undefined ? { traceId } : {});
