/**
 * Official compliance suite — Developer Tooling (TOOL-2100.024).
 * Debugging convenience must not bypass privacy.
 */
import { readFileSync } from "node:fs";
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import { checkTraceCompleteness, inspectEntity, inspectWorld, preservesIdentity, runCli } from "@roc/devtools";
import { assert, emma, guest, garmentCreate, loadFamilyRuntime } from "./helpers.js";

export const devtoolsSuite: ROCComplianceSuite = {
  id: "suite_devtools",
  area: "devtools",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("TOOL-CT-001", "Inspection is permission-aware with visible redaction", ["TOOL-2100.020"], async () => {
      const runtime = await loadFamilyRuntime();
      const restricted = inspectEntity(runtime.realityWorld(), "person_emma", guest);
      assert(restricted !== undefined && restricted.redactionCount > 0, "guest inspection redacts");
      assert(
        restricted.aspects.some((a) => a.fields.some((f) => f.redacted && f.redactionReason !== undefined)),
        "redaction is visible and explained, never silent"
      );
      const owner = inspectEntity(runtime.realityWorld(), "person_emma", emma);
      assert(owner?.redactionCount === 0, "authorized inspection sees the data");
    }),
    defineTest("TOOL-CT-002", "Candidate Worlds are always distinguished from Reality", ["TOOL-2100.012"], async () => {
      const runtime = await loadFamilyRuntime();
      const simulated = await runtime.simulate(garmentCreate(emma, "garment_dt", "simulate"));
      const candidateWorld = runtime.candidateWorldState(simulated.candidateWorldId ?? "");
      assert(candidateWorld !== undefined, "candidate state available for inspection");
      const reality = inspectWorld(runtime.realityWorld(), emma);
      const candidate = inspectWorld(candidateWorld, emma, { candidateWorldId: simulated.candidateWorldId ?? "" });
      assert(reality.branch === "reality" && reality.label.startsWith("REALITY"), "reality labeled");
      assert(candidate.branch === "candidate" && candidate.label.includes("not Reality"), "candidate labeled as possibility");
    }),
    defineTest("TOOL-CT-003", "Trace completeness is checkable", ["TOOL-2100.010"], async () => {
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(garmentCreate(emma, "garment_tc", "commit", runtime.currentSnapshot().id));
      const complete = checkTraceCompleteness(output.trace);
      assert(complete.complete, `runtime traces are complete (missing: ${complete.missing.join(", ")})`);
      const broken = checkTraceCompleteness({ summary: "", steps: [{ phase: "received", reason: "" }] });
      assert(!broken.complete && broken.missing.length === 2, "incomplete traces are detected");
    }),
    defineTest("TOOL-CT-004", "Inspection preserves graph identity", ["TOOL-2100.003"], async () => {
      const runtime = await loadFamilyRuntime();
      const entity = runtime.realityWorld().entities["garment_blue_jacket"];
      const inspection = inspectEntity(runtime.realityWorld(), "garment_blue_jacket", emma);
      assert(entity !== undefined && inspection !== undefined, "entity inspectable");
      assert(preservesIdentity(entity, inspection), "inspection never rewrites identity");
    }),
    defineTest("TOOL-CT-005", "CLI returns proper exit codes and machine-readable JSON", ["TOOL-2100.018"], async () => {
      const valid = await runCli(["validate", "examples/family-style-world/fixture.wdl.json", "--json"]);
      assert(valid.code === 0, `valid world exits 0 (got ${valid.code}: ${valid.output.join("; ")})`);
      assert(valid.json?.valid === true, "machine-readable JSON emitted");

      const compiled = await runCli(["compile", "examples/family-style-world/fixture.wdl.json"]);
      assert(compiled.code === 0, "compile exits 0");

      const invalid = await runCli(["validate", "compliance/fixtures/invalid-world.wdl.json"]);
      assert(invalid.code === 1, "invalid world exits 1");

      const unknown = await runCli(["teleport"]);
      assert(unknown.code === 2, "unknown command exits 2");
    }),
    defineTest("TOOL-CT-006", "Compliance report is ingestible by tooling", ["TOOL-2100.017"], async () => {
      const report = JSON.parse(readFileSync("compliance/reports/compliance-report.json", "utf8")) as {
        compliant: boolean;
        suites: Array<{ area: string; results: Array<{ status: string }> }>;
      };
      assert(typeof report.compliant === "boolean" && report.suites.length > 0, "report artifact parses");
      assert(
        report.suites.every((s) => s.results.every((r) => typeof r.status === "string")),
        "results are machine-readable"
      );
    })
  ]
};
