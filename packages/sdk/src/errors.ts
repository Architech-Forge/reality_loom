/**
 * SDK Error Handling (SDK-1800.021): fail safely and explainably.
 */
import type { ROCDiagnostic } from "@roc/types";

export interface ROCSDKErrorInput {
  code: string;
  message: string;
  reason: string;
  severity?: "error" | "warning" | "info";
  diagnostics?: ROCDiagnostic[];
  traceId?: string;
  recoverable?: boolean;
  suggestedResolution?: string;
}

export class ROCSDKError extends Error {
  readonly code: string;
  readonly reason: string;
  readonly severity: "error" | "warning" | "info";
  readonly diagnostics: ROCDiagnostic[];
  readonly traceId?: string;
  readonly recoverable: boolean;
  readonly suggestedResolution?: string;

  constructor(input: ROCSDKErrorInput) {
    super(`${input.code}: ${input.message} — ${input.reason}`);
    this.name = "ROCSDKError";
    this.code = input.code;
    this.reason = input.reason;
    this.severity = input.severity ?? "error";
    this.diagnostics = input.diagnostics ?? [];
    if (input.traceId !== undefined) this.traceId = input.traceId;
    this.recoverable = input.recoverable ?? false;
    if (input.suggestedResolution !== undefined) {
      this.suggestedResolution = input.suggestedResolution;
    }
  }
}
