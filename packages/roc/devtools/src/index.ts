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
