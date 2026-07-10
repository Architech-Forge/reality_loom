/**
 * Official compliance runner (COMP-2000.003, COMP-2000.005, REF-1900.021).
 *
 * Runs the compliance suites, prints human-readable results, writes the
 * machine-readable report artifact, and exits non-zero unless every claimed
 * level is compliant. Compatibility must be proven, not claimed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderReport, runSuites, type ROCComplianceDeclaration } from "@roc/compliance";
import { ROC_REFERENCE_VERSION, WIL_PROTOCOL_VERSION } from "@roc/types";
import { wilSuite, wdlSuite } from "../compliance/suites/protocol.suites.js";
import { kernelSuite, graphSuite, compilerSuite, runtimeSuite, physicsSuite } from "../compliance/suites/engine.suites.js";
import { sliSuite, designSuite, sdkSuite, referenceSuite } from "../compliance/suites/experience.suites.js";
import { applicationSuite } from "../compliance/suites/application.suite.js";
import { storageSuite } from "../compliance/suites/storage.suite.js";
import { securitySuite } from "../compliance/suites/security.suite.js";
import { aiSuite } from "../compliance/suites/ai.suite.js";
import { devtoolsSuite } from "../compliance/suites/devtools.suite.js";
import { interfaceSuite } from "../compliance/suites/interface.suite.js";

const declaration: ROCComplianceDeclaration = {
  implementationId: "the-reality-loom",
  implementationName: "The Reality Loom Reference Implementation",
  version: ROC_REFERENCE_VERSION,
  claimedLevels: ["wil_only", "kernel", "compiler", "runtime", "physics", "sli", "sdk", "application", "reference"],
  supportedSpecVersions: {
    wil: WIL_PROTOCOL_VERSION,
    wdl: "1.0.0",
    kernel: ROC_REFERENCE_VERSION,
    runtime: ROC_REFERENCE_VERSION,
    physics: ROC_REFERENCE_VERSION,
    sli: ROC_REFERENCE_VERSION,
    sdk: ROC_REFERENCE_VERSION
  },
  testSuiteVersion: "1.0.0",
  generatedAt: new Date().toISOString()
};

const report = await runSuites(
  [wilSuite, wdlSuite, kernelSuite, graphSuite, compilerSuite, runtimeSuite, physicsSuite, sliSuite, designSuite, sdkSuite, applicationSuite, storageSuite, securitySuite, aiSuite, devtoolsSuite, interfaceSuite, referenceSuite],
  declaration,
  { now: declaration.generatedAt }
);

for (const line of renderReport(report)) console.log(line);

mkdirSync("compliance/reports", { recursive: true });
const artifact = "compliance/reports/compliance-report.json";
writeFileSync(artifact, JSON.stringify(report, null, 2));
console.log(`report artifact: ${artifact}`);

process.exit(report.compliant ? 0 : 1);
