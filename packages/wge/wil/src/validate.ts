/**
 * WIL message validation (WIL-001.010 minimum compliance).
 *
 * Validates: message envelope, actor, intent, target, context, execution
 * mode, and version negotiation. Structural — no World state is consulted;
 * World-aware enforcement belongs to the Runtime (WGE-1300).
 */
import type { WILMessage, WILValidationResult } from "@roc/types";
import {
  isWGETimestamp,
  isConfidence,
  WIL_ACTOR_TYPES,
  WIL_EXECUTION_MODES,
  WIL_INTENT_TYPES,
  WIL_PROTOCOL,
  WIL_PROTOCOL_VERSION,
  WIL_SELECTOR_TYPES,
  WIL_TARGET_KINDS
} from "@roc/types";
import { DiagnosticCollector, hasErrors } from "@roc/diagnostics";

const SUPPORTED_MAJOR = Number(WIL_PROTOCOL_VERSION.split(".")[0]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function inSet(set: readonly string[], value: unknown): boolean {
  return typeof value === "string" && set.includes(value);
}

/** REF-1900.005 required function. Accepts unknown input; never throws. */
export function validateWILMessage(message: unknown): WILValidationResult {
  const c = new DiagnosticCollector();

  if (!isRecord(message)) {
    c.add({
      code: "WIL_ENVELOPE_NOT_OBJECT",
      severity: "error",
      message: "A WIL message must be a JSON object",
      reason: `received ${Array.isArray(message) ? "array" : typeof message}`
    });
    return { valid: false, diagnostics: c.diagnostics };
  }

  validateEnvelope(message, c);
  if (isRecord(message.actor)) validateActor(message.actor, c);
  if (isRecord(message.intent)) validateIntent(message.intent, c);
  if (isRecord(message.target)) validateTarget(message.target, c);
  if (isRecord(message.context)) validateContext(message.context, c);
  validateModeAuthority(message, c);

  return { valid: !hasErrors(c.diagnostics), diagnostics: c.diagnostics };
}

function validateEnvelope(m: Record<string, unknown>, c: DiagnosticCollector): void {
  if (m.protocol !== WIL_PROTOCOL) {
    c.add({
      code: "WIL_PROTOCOL_INVALID",
      severity: "error",
      message: `protocol MUST equal "${WIL_PROTOCOL}" (WIL-001.001)`,
      reason: `received ${JSON.stringify(m.protocol)}`
    });
  }

  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+$/.test(m.version)) {
    c.add({
      code: "WIL_VERSION_INVALID",
      severity: "error",
      message: "version MUST identify the WIL protocol version, e.g. 1.0.0",
      reason: `received ${JSON.stringify(m.version)}`
    });
  } else if (Number(m.version.split(".")[0]) !== SUPPORTED_MAJOR) {
    // Version negotiation (WIL-001.010): incompatible majors are rejected.
    c.add({
      code: "WIL_VERSION_UNSUPPORTED",
      severity: "error",
      message: `WIL protocol major version ${m.version} is not supported`,
      reason: `this implementation supports ${WIL_PROTOCOL_VERSION} (major ${SUPPORTED_MAJOR})`,
      suggestedResolution: `send a ${SUPPORTED_MAJOR}.x.x message`
    });
  }

  for (const field of ["id", "traceId"] as const) {
    if (typeof m[field] !== "string" || m[field].length === 0) {
      c.add({
        code: `WIL_${field.toUpperCase()}_INVALID`,
        severity: "error",
        message: `${field} MUST be a non-empty string (WIL-001.001)`
      });
    }
  }

  for (const field of ["actor", "intent", "target", "context"] as const) {
    if (!isRecord(m[field])) {
      const diagnostic = {
        code: `WIL_${field.toUpperCase()}_MISSING`,
        severity: "error" as const,
        message: `${field} is a required envelope field (WIL-001.001)`
      };
      if (field === "actor") {
        c.add({
          ...diagnostic,
          reason:
            "A WIL message without an Actor is invalid. Reality cannot change without causality."
        });
      } else {
        c.add(diagnostic);
      }
    }
  }

  if (!inSet(WIL_EXECUTION_MODES, m.mode)) {
    c.add({
      code: "WIL_MODE_INVALID",
      severity: "error",
      message: "mode MUST be one of observe | simulate | commit | replay (WIL-001.005)",
      reason: `received ${JSON.stringify(m.mode)}`
    });
  }

  if (!isWGETimestamp(m.timestamp)) {
    c.add({
      code: "WIL_TIMESTAMP_INVALID",
      severity: "error",
      message: "timestamp MUST be an ISO 8601 string (WIL-001.009)",
      reason: `received ${JSON.stringify(m.timestamp)}`
    });
  }

  if (m.payload !== undefined && !isRecord(m.payload)) {
    c.add({
      code: "WIL_PAYLOAD_INVALID",
      severity: "error",
      message: "payload, when present, MUST be an object (WIL-001.001)"
    });
  }

  if (m.extensions !== undefined) {
    const ok =
      Array.isArray(m.extensions) &&
      m.extensions.every(
        (e) =>
          isRecord(e) &&
          typeof e.extensionId === "string" &&
          typeof e.namespace === "string" &&
          typeof e.version === "string" &&
          e.deterministic === true
      );
    if (!ok) {
      c.add({
        code: "WIL_EXTENSIONS_INVALID",
        severity: "error",
        message:
          "extensions, when present, MUST be identified, namespaced, versioned, and declared deterministic (WIL-001.001)",
        reason:
          "an extension may declare new protocol vocabulary but may not bypass authority, determinism, trace, or commit rules"
      });
    }
  }
}

function validateActor(actor: Record<string, unknown>, c: DiagnosticCollector): void {
  if (typeof actor.id !== "string" || actor.id.length === 0) {
    c.add({
      code: "WIL_ACTOR_ID_INVALID",
      severity: "error",
      message: "actor.id MUST be a non-empty string (WIL-001.002)"
    });
  }
  if (!inSet(WIL_ACTOR_TYPES, actor.type)) {
    c.add({
      code: "WIL_ACTOR_TYPE_INVALID",
      severity: "error",
      message: `actor.type MUST be one of: ${WIL_ACTOR_TYPES.join(" | ")} (WIL-001.002)`,
      reason: `received ${JSON.stringify(actor.type)}`
    });
  }
  const authority = actor.authority;
  if (
    !isRecord(authority) ||
    typeof authority.authenticated !== "boolean" ||
    !isStringArray(authority.permissions) ||
    (authority.scope !== undefined && !isStringArray(authority.scope))
  ) {
    c.add({
      code: "WIL_ACTOR_AUTHORITY_INVALID",
      severity: "error",
      message:
        "actor.authority MUST include authenticated: boolean and permissions: string[] (WIL-001.002)"
    });
  }
}

function validateIntent(intent: Record<string, unknown>, c: DiagnosticCollector): void {
  if (!inSet(WIL_INTENT_TYPES, intent.type)) {
    c.add({
      code: "WIL_INTENT_TYPE_INVALID",
      severity: "error",
      message: `intent.type MUST be one of: ${WIL_INTENT_TYPES.join(" | ")} (WIL-001.003)`,
      reason: `received ${JSON.stringify(intent.type)}`
    });
  }
  if (intent.confidence !== undefined && !isConfidence(intent.confidence)) {
    c.add({
      code: "WIL_INTENT_CONFIDENCE_INVALID",
      severity: "error",
      message: "intent.confidence MUST be a number from 0.0 to 1.0 (WIL-001.003)"
    });
  }
  if (intent.reason !== undefined && typeof intent.reason !== "string") {
    c.add({
      code: "WIL_INTENT_REASON_INVALID",
      severity: "error",
      message: "intent.reason, when present, MUST be a string (WIL-001.003)"
    });
  }
}

function validateTarget(target: Record<string, unknown>, c: DiagnosticCollector): void {
  if (!inSet(WIL_TARGET_KINDS, target.kind)) {
    c.add({
      code: "WIL_TARGET_KIND_INVALID",
      severity: "error",
      message: `target.kind MUST be one of: ${WIL_TARGET_KINDS.join(" | ")} (WIL-001.004)`,
      reason: `received ${JSON.stringify(target.kind)}`
    });
  }
  if (target.selector !== undefined) {
    const s = target.selector;
    if (!isRecord(s) || !inSet(WIL_SELECTOR_TYPES, s.type)) {
      c.add({
        code: "WIL_TARGET_SELECTOR_INVALID",
        severity: "error",
        message: `target.selector.type MUST be one of: ${WIL_SELECTOR_TYPES.join(" | ")} (WIL-001.004)`
      });
    }
  }
}

function validateContext(context: Record<string, unknown>, c: DiagnosticCollector): void {
  if (typeof context.worldId !== "string" || context.worldId.length === 0) {
    c.add({
      code: "WIL_CONTEXT_WORLD_MISSING",
      severity: "error",
      message: "A Context MUST identify a World (WIL-001.006)"
    });
  }
  const temporal = context.temporal;
  if (temporal !== undefined) {
    if (!isRecord(temporal) || !isWGETimestamp(temporal.timestamp)) {
      c.add({
        code: "WIL_CONTEXT_TEMPORAL_INVALID",
        severity: "error",
        message: "context.temporal.timestamp MUST be an ISO 8601 string (WIL-001.006)"
      });
    }
  }
  const execution = context.execution;
  if (execution !== undefined) {
    const ok =
      isRecord(execution) &&
      typeof execution.deterministic === "boolean" &&
      typeof execution.allowPartial === "boolean" &&
      typeof execution.allowDeferred === "boolean";
    if (!ok) {
      c.add({
        code: "WIL_CONTEXT_EXECUTION_INVALID",
        severity: "error",
        message:
          "context.execution MUST include deterministic, allowPartial, allowDeferred booleans (WIL-001.006)"
      });
    }
  }
}

/**
 * Cross-field authority rules:
 * - WIL-001.002 / WIL-001.010: an Actor MUST be authenticated before
 *   committing to Reality; anonymous commits are noncompliant → error.
 * - WIL-001.006: a Commit SHOULD identify the snapshot it expects to
 *   modify → warning when absent.
 */
function validateModeAuthority(m: Record<string, unknown>, c: DiagnosticCollector): void {
  if (m.mode !== "commit") return;

  const actor = m.actor;
  const authority = isRecord(actor) ? actor.authority : undefined;
  const authenticated = isRecord(authority) && authority.authenticated === true;
  if (!authenticated) {
    c.add({
      code: "WIL_ANONYMOUS_COMMIT",
      severity: "error",
      message: "An Actor MUST be authenticated before committing changes to Reality (WIL-001.002)",
      reason: "allowing anonymous commits is noncompliant (WIL-001.010)"
    });
  }

  const context = m.context;
  if (isRecord(context) && context.snapshotId === undefined) {
    c.add({
      code: "WIL_COMMIT_WITHOUT_SNAPSHOT",
      severity: "warning",
      message: "A Commit interaction SHOULD identify the snapshot it expects to modify (WIL-001.006)",
      suggestedResolution: "set context.snapshotId to the expected snapshot"
    });
  }
}

/** Type guard flavor of validateWILMessage for internal use. */
export function isValidWILMessage(message: unknown): message is WILMessage {
  return validateWILMessage(message).valid;
}
