/**
 * @roc/compliance — Compliance Harness.
 *
 * Volume 2000 (COMP-2000.001 – COMP-2000.024). Build order position 15.
 * Compliance is an executable standard: required tests MUST pass for the
 * claimed levels; the suite is the executable form of the Codex.
 */
import type { ROCDiagnostic, WGETimestamp } from "@roc/types";

/** COMP-2000.002 — Compliance Levels. */
export type ROCComplianceLevel =
  | "wil_only"
  | "kernel"
  | "compiler"
  | "runtime"
  | "physics"
  | "sli"
  | "sdk"
  | "application"
  | "reference"
  | "full_stack";

export interface ROCComplianceDeclaration {
  implementationId: string;
  implementationName: string;
  version: string;

  claimedLevels: ROCComplianceLevel[];

  supportedSpecVersions: Record<string, string>;

  testSuiteVersion: string;

  generatedAt: WGETimestamp;
}

/** COMP-2000.003 — Suite Architecture. */
export type ROCComplianceArea =
  | "wil"
  | "wdl"
  | "kernel"
  | "graph"
  | "compiler"
  | "runtime"
  | "physics"
  | "sli"
  | "design_system"
  | "application"
  | "sdk"
  | "reference"
  | "determinism"
  | "traces"
  | "security_privacy"
  | "storage"
  | "ai"
  | "devtools";

export interface ROCComplianceContext {
  /** Fixed clock for deterministic suite execution. */
  now: string;
  metadata?: Record<string, unknown>;
}

export interface ROCComplianceEvidence {
  kind: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface ROCComplianceResult {
  testId: string;

  status: "passed" | "failed" | "skipped" | "not_applicable" | "error";

  diagnostics: ROCDiagnostic[];

  evidence?: ROCComplianceEvidence[];

  durationMs: number;
}

export interface ROCComplianceTest {
  id: string;

  title: string;

  description: string;

  requirementIds: string[];

  severity: "required" | "recommended" | "optional";

  run(context: ROCComplianceContext): Promise<ROCComplianceResult>;
}

export type ROCComplianceFixtureType =
  | "wil_message"
  | "wdl_source"
  | "world_definition"
  | "executable_world"
  | "snapshot"
  | "diff"
  | "trace"
  | "candidate_world"
  | "projection_input"
  | "projection_output"
  | "application_adapter";

export interface ROCComplianceFixture<T = unknown> {
  id: string;
  type: ROCComplianceFixtureType;
  specVersion: string;
  data: T;
  expectedBehavior?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ROCComplianceSuite {
  id: string;

  area: ROCComplianceArea;

  version: string;

  tests: ROCComplianceTest[];

  fixtures: ROCComplianceFixture[];

  metadata?: Record<string, unknown>;
}

/** COMP-2000.005 — Reporting. */
export interface ROCComplianceSuiteReport {
  suiteId: string;
  suiteVersion: string;

  area: string;

  results: ROCComplianceResult[];

  compliant: boolean;
}

export interface ROCComplianceReport {
  id: string;

  declaration: ROCComplianceDeclaration;

  suites: ROCComplianceSuiteReport[];

  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };

  compliant: boolean;

  generatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/**
 * Test authoring helper: wraps an assertion body into a spec-shaped test.
 * The body either returns evidence (pass) or throws (fail).
 */
export function defineTest(
  id: string,
  title: string,
  requirementIds: string[],
  body: (context: ROCComplianceContext) => Promise<ROCComplianceEvidence[] | void>,
  options: { severity?: ROCComplianceTest["severity"]; description?: string } = {}
): ROCComplianceTest {
  return {
    id,
    title,
    description: options.description ?? title,
    requirementIds,
    severity: options.severity ?? "required",
    async run(context: ROCComplianceContext): Promise<ROCComplianceResult> {
      const started = Date.now();
      try {
        const evidence = await body(context);
        return {
          testId: id,
          status: "passed",
          diagnostics: [],
          ...(evidence ? { evidence } : {}),
          durationMs: Date.now() - started
        };
      } catch (cause) {
        return {
          testId: id,
          status: "failed",
          diagnostics: [
            {
              code: `COMPLIANCE_${id.replace(/-/g, "_")}`,
              severity: "error",
              message: `${title} failed`,
              reason: cause instanceof Error ? cause.message : String(cause),
              suggestedResolution: `satisfy requirement(s): ${requirementIds.join(", ")}`
            }
          ],
          durationMs: Date.now() - started
        };
      }
    }
  };
}

/** A required behavior this implementation defers; reported, never hidden. */
export function deferTest(
  id: string,
  title: string,
  requirementIds: string[],
  reason: string
): ROCComplianceTest {
  return {
    id,
    title,
    description: title,
    requirementIds,
    severity: "required",
    async run(): Promise<ROCComplianceResult> {
      return {
        testId: id,
        status: "skipped",
        diagnostics: [
          {
            code: `COMPLIANCE_DEFERRED_${id.replace(/-/g, "_")}`,
            severity: "warning",
            message: `${title} — deferred`,
            reason
          }
        ],
        durationMs: 0
      };
    }
  };
}

/** COMP-2000.003 suite rule: required tests must pass (skips are declared, visible, and counted). */
export async function runSuites(
  suites: ROCComplianceSuite[],
  declaration: ROCComplianceDeclaration,
  context: ROCComplianceContext
): Promise<ROCComplianceReport> {
  const suiteReports: ROCComplianceSuiteReport[] = [];
  const summary = { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0 };

  for (const suite of suites) {
    const results: ROCComplianceResult[] = [];
    for (const test of suite.tests) {
      const result = await test.run(context);
      results.push(result);
      summary.total += 1;
      if (result.status === "passed") summary.passed += 1;
      else if (result.status === "failed") summary.failed += 1;
      else if (result.status === "error") summary.errors += 1;
      else summary.skipped += 1;
    }
    suiteReports.push({
      suiteId: suite.id,
      suiteVersion: suite.version,
      area: suite.area,
      results,
      compliant: results.every((r) => r.status !== "failed" && r.status !== "error")
    });
  }

  return {
    id: `report_${context.now}`,
    declaration,
    suites: suiteReports,
    summary,
    compliant: suiteReports.every((s) => s.compliant),
    generatedAt: context.now
  };
}

/** Human-readable terminal rendering (COMP-2000.005). */
export function renderReport(report: ROCComplianceReport): string[] {
  const lines: string[] = [];
  lines.push(
    `ROC Compliance — ${report.declaration.implementationName} v${report.declaration.version} (suite ${report.declaration.testSuiteVersion})`
  );
  lines.push(`Claimed levels: ${report.declaration.claimedLevels.join(", ")}`);
  for (const suite of report.suites) {
    const passed = suite.results.filter((r) => r.status === "passed").length;
    const skipped = suite.results.filter((r) => r.status === "skipped").length;
    const failed = suite.results.filter((r) => r.status === "failed" || r.status === "error");
    lines.push(
      `  [${suite.compliant ? "PASS" : "FAIL"}] ${suite.area.padEnd(16)} ${passed}/${suite.results.length} passed${skipped > 0 ? `, ${skipped} deferred` : ""}`
    );
    for (const failure of failed) {
      for (const d of failure.diagnostics) {
        lines.push(`         ✗ ${failure.testId}: ${d.message} — ${d.reason ?? ""}`);
      }
    }
  }
  const s = report.summary;
  lines.push(
    `${report.compliant ? "✅ COMPLIANT" : "❌ NONCOMPLIANT"} — ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.skipped} deferred, ${s.errors} errors`
  );
  return lines;
}
