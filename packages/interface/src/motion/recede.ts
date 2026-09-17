/**
 * recede — context stepping back without leaving the World. Receded objects
 * dim and settle toward the substrate; they remain recoverable, so recede
 * never reads as deletion.
 */
import { describeMotion, type RAMotionDescriptor } from "./tokens.js";

export const recedeMotion = (reason: string, traceId?: string): RAMotionDescriptor =>
  describeMotion("recede", reason, traceId !== undefined ? { traceId } : {});

/** collapse — an emphatic recede down to a node marker (layout fallback). */
export const collapseMotion = (reason: string, traceId?: string): RAMotionDescriptor =>
  describeMotion("collapse", reason, traceId !== undefined ? { traceId } : {});
