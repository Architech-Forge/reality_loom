/**
 * recompose — the experience adapting to World change while preserving
 * identity and place (SLI-1500.014). Objects move to new positions; they
 * never blink out and reappear, because identity is continuous.
 */
import { describeMotion, type RAMotionDescriptor } from "./tokens.js";

export const recomposeMotion = (reason: string, traceId?: string): RAMotionDescriptor =>
  describeMotion("recompose", reason, traceId !== undefined ? { traceId } : {});
