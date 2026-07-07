/**
 * WIL trace construction (WIL-001.008, REF-1900.005).
 *
 * Trace is mandatory in WIL: every interaction must be explainable. The
 * privacy rule (protected details may be omitted, but the omission must be
 * indicated) is supported via redactTraceStep.
 */
import type { WILTrace, WILTraceStep } from "@roc/types";
import { WIL_TRACE_PHASES, WIL_TRACE_STEP_STATUSES } from "@roc/types";
import { generateId } from "./ids.js";

export interface WILTraceInput {
  messageId: string;
  actorId: string;
  steps: WILTraceStep[];
  summary: string;

  /** Defaults to a freshly generated trace id. */
  id?: string;
  /** Defaults to now. */
  createdAt?: string;
}

/** REF-1900.005 required function. */
export function createTrace(input: WILTraceInput): WILTrace {
  if (!input.messageId) throw new Error("A trace MUST reference its messageId (WIL-001.008)");
  if (!input.actorId) {
    throw new Error(
      "A trace MUST identify who initiated the interaction (WIL-001.008)"
    );
  }
  if (!input.summary) throw new Error("A trace MUST include a summary (WIL-001.008)");

  input.steps.forEach((step, i) => {
    if (!WIL_TRACE_PHASES.includes(step.phase)) {
      throw new Error(`Trace step ${i} has invalid phase ${JSON.stringify(step.phase)}`);
    }
    if (!WIL_TRACE_STEP_STATUSES.includes(step.status)) {
      throw new Error(`Trace step ${i} has invalid status ${JSON.stringify(step.status)}`);
    }
    if (typeof step.reason !== "string" || step.reason.length === 0) {
      throw new Error(
        `Trace step ${i} must give a reason — every interaction must be explainable (WIL-001.008)`
      );
    }
  });

  // Steps are ordered by their declared order so causality reads top-down.
  const steps = [...input.steps].sort((a, b) => a.order - b.order);

  return {
    id: input.id ?? generateId("trace"),
    messageId: input.messageId,
    actorId: input.actorId,
    steps,
    summary: input.summary,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export const TRACE_REDACTED_REASON =
  "Protected details were omitted: the requesting Actor lacks permission (WIL-001.008 privacy rule)";

/**
 * Returns a copy of the step with protected details removed and the
 * omission indicated, per the WIL-001.008 privacy rule.
 */
export function redactTraceStep(step: WILTraceStep): WILTraceStep {
  return {
    order: step.order,
    phase: step.phase,
    status: step.status,
    reason: TRACE_REDACTED_REASON
  };
}
