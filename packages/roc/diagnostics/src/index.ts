/**
 * @roc/diagnostics — Diagnostic creation and collection.
 *
 * WGE-1000.012 requires diagnostics to carry code, severity, message,
 * affected primitive IDs, reason, and suggested resolution. This package is
 * the single way the reference implementation constructs them, so the shape
 * stays uniform across WIL, Kernel, Compiler, Runtime, Physics, and SLI.
 */
import type {
  ROCDiagnostic,
  ROCID,
  ROCSeverity,
  WGEValidationOutcome,
  WGEValidationResult
} from "@roc/types";

export interface DiagnosticInput {
  code: string;
  severity: ROCSeverity;
  message: string;
  affectedIds?: ROCID[];
  reason?: string;
  suggestedResolution?: string;
}

export function createDiagnostic(input: DiagnosticInput): ROCDiagnostic {
  const diagnostic: ROCDiagnostic = {
    code: input.code,
    severity: input.severity,
    message: input.message
  };
  if (input.affectedIds !== undefined) diagnostic.affectedIds = input.affectedIds;
  if (input.reason !== undefined) diagnostic.reason = input.reason;
  if (input.suggestedResolution !== undefined) {
    diagnostic.suggestedResolution = input.suggestedResolution;
  }
  return diagnostic;
}

const SEVERITY_RANK: Record<ROCSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
  suggestion: 0
};

export function hasErrors(diagnostics: readonly ROCDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

export function hasWarnings(diagnostics: readonly ROCDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "warning");
}

/** Highest severity present, or undefined for an empty list. */
export function worstSeverity(
  diagnostics: readonly ROCDiagnostic[]
): ROCSeverity | undefined {
  let worst: ROCSeverity | undefined;
  for (const d of diagnostics) {
    if (worst === undefined || SEVERITY_RANK[d.severity] > SEVERITY_RANK[worst]) {
      worst = d.severity;
    }
  }
  return worst;
}

/**
 * Fold diagnostics into a WGE validation outcome (WGE-1000.012):
 * errors → invalid, warnings → warning, otherwise valid.
 */
export function toValidationResult(
  diagnostics: ROCDiagnostic[]
): WGEValidationResult {
  let outcome: WGEValidationOutcome = "valid";
  if (hasErrors(diagnostics)) outcome = "invalid";
  else if (hasWarnings(diagnostics)) outcome = "warning";
  return { outcome, diagnostics };
}

/** Human-readable single-line rendering, e.g. for compiler/runtime output. */
export function formatDiagnostic(d: ROCDiagnostic): string {
  const ids = d.affectedIds?.length ? ` [${d.affectedIds.join(", ")}]` : "";
  const reason = d.reason ? ` — ${d.reason}` : "";
  const fix = d.suggestedResolution ? ` (fix: ${d.suggestedResolution})` : "";
  return `${d.severity.toUpperCase()} ${d.code}: ${d.message}${ids}${reason}${fix}`;
}

/** Accumulates diagnostics across validation phases. */
export class DiagnosticCollector {
  private readonly items: ROCDiagnostic[] = [];

  add(input: DiagnosticInput): void {
    this.items.push(createDiagnostic(input));
  }

  addAll(diagnostics: readonly ROCDiagnostic[]): void {
    this.items.push(...diagnostics);
  }

  get diagnostics(): ROCDiagnostic[] {
    return [...this.items];
  }

  get hasErrors(): boolean {
    return hasErrors(this.items);
  }

  toValidationResult(): WGEValidationResult {
    return toValidationResult(this.diagnostics);
  }
}
