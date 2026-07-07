/**
 * Diagnostic types shared across ROC.
 *
 * WGE-1000.012 requires kernel diagnostics to include code, severity,
 * message, affected primitive IDs, reason, and suggested resolution.
 */
import type { ROCID } from "./primitives.js";

export type ROCSeverity = "error" | "warning" | "info" | "suggestion";

export interface ROCDiagnostic {
  code: string;
  severity: ROCSeverity;
  message: string;
  affectedIds?: ROCID[];
  reason?: string;
  suggestedResolution?: string;
}

/** WIL diagnostics share the ROC diagnostic shape (WIL-001.007). */
export type WILDiagnostic = ROCDiagnostic;

/** WGE-1000.012 — Validation Outcomes. */
export type WGEValidationOutcome =
  | "valid"
  | "invalid"
  | "warning"
  | "requires_resolution";

export interface WGEValidationResult {
  outcome: WGEValidationOutcome;
  diagnostics: ROCDiagnostic[];
}

export interface WILValidationResult {
  valid: boolean;
  diagnostics: ROCDiagnostic[];
}
