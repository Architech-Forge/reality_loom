/**
 * trace — causality drawing itself. A trace line propagates from cause to
 * effect at readable speed; the eye follows the reasoning, never chases it.
 */
import { describeMotion, type RLMotionDescriptor } from "./tokens.js";

export const traceMotion = (reason: string, traceId?: string): RLMotionDescriptor =>
  describeMotion("trace", reason, traceId !== undefined ? { traceId } : {});
