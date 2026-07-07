import { describe, expect, it } from "vitest";
import {
  createDiagnostic,
  DiagnosticCollector,
  formatDiagnostic,
  hasErrors,
  toValidationResult,
  worstSeverity
} from "@roc/diagnostics";

describe("@roc/diagnostics (WGE-1000.012 required diagnostics)", () => {
  it("creates diagnostics with all required fields", () => {
    const d = createDiagnostic({
      code: "KERNEL_ROOT_MISSING",
      severity: "error",
      message: "World has no root entity",
      affectedIds: ["world_test"],
      reason: "rootEntityId does not resolve to an entity",
      suggestedResolution: "Add the root entity to the entity index"
    });
    expect(d.code).toBe("KERNEL_ROOT_MISSING");
    expect(d.severity).toBe("error");
    expect(d.affectedIds).toEqual(["world_test"]);
    expect(d.reason).toContain("rootEntityId");
    expect(d.suggestedResolution).toContain("root entity");
  });

  it("ranks severities: error > warning > info > suggestion", () => {
    const warn = createDiagnostic({ code: "W", severity: "warning", message: "w" });
    const err = createDiagnostic({ code: "E", severity: "error", message: "e" });
    const info = createDiagnostic({ code: "I", severity: "info", message: "i" });
    expect(worstSeverity([info, warn, err])).toBe("error");
    expect(worstSeverity([info, warn])).toBe("warning");
    expect(worstSeverity([])).toBeUndefined();
    expect(hasErrors([warn])).toBe(false);
    expect(hasErrors([err])).toBe(true);
  });

  it("folds diagnostics into WGE validation outcomes", () => {
    expect(toValidationResult([]).outcome).toBe("valid");
    expect(
      toValidationResult([
        createDiagnostic({ code: "W", severity: "warning", message: "w" })
      ]).outcome
    ).toBe("warning");
    expect(
      toValidationResult([
        createDiagnostic({ code: "E", severity: "error", message: "e" })
      ]).outcome
    ).toBe("invalid");
  });

  it("formats diagnostics as a single line", () => {
    const line = formatDiagnostic(
      createDiagnostic({
        code: "X",
        severity: "error",
        message: "boom",
        affectedIds: ["a", "b"],
        reason: "because",
        suggestedResolution: "do the thing"
      })
    );
    expect(line).toBe("ERROR X: boom [a, b] — because (fix: do the thing)");
  });

  it("collects diagnostics across phases", () => {
    const collector = new DiagnosticCollector();
    collector.add({ code: "A", severity: "warning", message: "a" });
    collector.add({ code: "B", severity: "error", message: "b" });
    expect(collector.hasErrors).toBe(true);
    expect(collector.diagnostics).toHaveLength(2);
    expect(collector.toValidationResult().outcome).toBe("invalid");
  });
});
