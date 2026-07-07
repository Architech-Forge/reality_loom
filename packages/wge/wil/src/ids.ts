/**
 * ID generation for WIL messages and traces.
 *
 * WIL-001.001: message ids MUST be globally unique; ids are strings
 * (WIL-001.009). The Codex uses prefixed ids (msg_, trace_) in its examples;
 * this follows that convention.
 */
import { randomBytes } from "node:crypto";

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

export const generateMessageId = (): string => generateId("msg");
export const generateTraceId = (): string => generateId("trace");
export const generateOutcomeId = (): string => generateId("outcome");
