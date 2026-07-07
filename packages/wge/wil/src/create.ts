/**
 * WIL message construction (REF-1900.005).
 *
 * createWILMessage fills envelope defaults (protocol, version, id, traceId,
 * timestamp) and validates the result, so a message it returns is always a
 * compliant envelope.
 */
import type {
  WILActor,
  WILContext,
  WILExecutionMode,
  WILExtension,
  WILIntent,
  WILMessage,
  WILTarget
} from "@roc/types";
import { WIL_PROTOCOL, WIL_PROTOCOL_VERSION } from "@roc/types";
import { formatDiagnostic } from "@roc/diagnostics";
import { generateMessageId, generateTraceId } from "./ids.js";
import { validateWILMessage } from "./validate.js";

export interface WILMessageInput {
  actor: WILActor;
  intent: WILIntent;
  target: WILTarget;
  context: WILContext;
  mode: WILExecutionMode;

  payload?: Record<string, unknown>;
  extensions?: WILExtension[];

  /** Defaults to a freshly generated globally unique id. */
  id?: string;
  /** Defaults to a new causal chain. Pass an existing traceId to join one. */
  traceId?: string;
  /** Defaults to now. */
  timestamp?: string;
  /** Defaults to the implementation's WIL protocol version. */
  version?: string;
}

export class WILMessageError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: ReturnType<typeof validateWILMessage>["diagnostics"]
  ) {
    super(message);
    this.name = "WILMessageError";
  }
}

/** REF-1900.005 required function. Throws WILMessageError on invalid input. */
export function createWILMessage(input: WILMessageInput): WILMessage {
  const message: WILMessage = {
    protocol: WIL_PROTOCOL,
    version: input.version ?? WIL_PROTOCOL_VERSION,
    id: input.id ?? generateMessageId(),
    traceId: input.traceId ?? generateTraceId(),
    actor: input.actor,
    intent: input.intent,
    target: input.target,
    context: input.context,
    mode: input.mode,
    timestamp: input.timestamp ?? new Date().toISOString()
  };
  if (input.payload !== undefined) message.payload = input.payload;
  if (input.extensions !== undefined) message.extensions = input.extensions;

  const result = validateWILMessage(message);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new WILMessageError(
      `Invalid WIL message: ${errors.map(formatDiagnostic).join("; ")}`,
      result.diagnostics
    );
  }
  return message;
}
