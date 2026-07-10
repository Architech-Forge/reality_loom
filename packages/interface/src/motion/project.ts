/**
 * project — world truth entering experience. A surface projects up from the
 * substrate: opacity and presence rise together; nothing "slides in from
 * offscreen" because Worlds are not offscreen, they are unprojected.
 */
import { describeMotion, type RLMotionDescriptor } from "./tokens.js";

export const projectMotion = (reason: string, traceId?: string): RLMotionDescriptor =>
  describeMotion("project", reason, traceId !== undefined ? { traceId } : {});

/** Simulation projects the same way — but into a candidate layer. */
export const simulateMotion = (reason: string, traceId?: string): RLMotionDescriptor =>
  describeMotion("simulate", reason, traceId !== undefined ? { traceId } : {});
