/**
 * @roc/devtools — Developer Tooling.
 *
 * Volume 2100 (TOOL-2100.001 – TOOL-2100.024). If the system made a
 * decision, the developer must be able to inspect why — without debugging
 * convenience ever bypassing privacy. The graphical World Studio and
 * inspector surfaces (TOOL-2100.002 – .017) build on these APIs in the
 * Studio phase.
 */
export {
  inspectEntity,
  inspectWorld,
  checkTraceCompleteness,
  preservesIdentity,
  type EntityInspection,
  type WorldInspection,
  type InspectionField
} from "./inspect.js";
export { runCli, type CliResult } from "./cli.js";

// TOOL-2100.021 / TOOL-2100.022 — tooling event + extension contracts
// (consumed by the Studio phase; extensions may improve understanding,
// never alter truth).
export interface ROCToolingEvent {
  id: string;

  actorId: string;

  type:
    | "world.opened"
    | "entity.inspected"
    | "relationship.inspected"
    | "compiler.ran"
    | "runtime.trace.viewed"
    | "physics.trace.viewed"
    | "candidate.compared"
    | "projection.inspected"
    | "compliance.ran"
    | "replay.started";

  targetId?: string;

  traceId?: string;

  createdAt: string;

  metadata?: Record<string, unknown>;
}

export interface ROCDevtoolsPanel {
  id: string;
  title: string;
}

export interface ROCDevtoolsInspector {
  id: string;
  targetKind: string;
}

export interface ROCDiagnosticRenderer {
  id: string;
  diagnosticCodes: string[];
}

export interface ROCComplianceView {
  id: string;
  areas: string[];
}

export interface ROCDevtoolsExtension {
  id: string;
  version: string;

  applicationId?: string;

  panels?: ROCDevtoolsPanel[];
  inspectors?: ROCDevtoolsInspector[];
  diagnosticsRenderers?: ROCDiagnosticRenderer[];
  complianceViews?: ROCComplianceView[];

  metadata?: Record<string, unknown>;
}
