/**
 * @wge/wil — Minimal WIL Implementation.
 *
 * REF-1900.005. Build order position 3 (REF-1900.003).
 * Volume 800 (WIL-001.001 – WIL-001.010) is the governing specification.
 */
export { createWILMessage, WILMessageError, type WILMessageInput } from "./create.js";
export { validateWILMessage, isValidWILMessage } from "./validate.js";
export { createOutcome, type WILOutcomeInput } from "./outcome.js";
export {
  createTrace,
  redactTraceStep,
  TRACE_REDACTED_REASON,
  type WILTraceInput
} from "./trace.js";
export {
  serializeCanonicalJson,
  serializeCanonicalValue,
  CanonicalJsonError
} from "./canonical-json.js";
export { generateId, generateMessageId, generateTraceId } from "./ids.js";
