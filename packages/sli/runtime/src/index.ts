/**
 * @sli/runtime — Minimal SLI Runtime.
 *
 * REF-1900.016. Build order position 13 (REF-1900.003).
 * Volume 1500 (SLI-1500.001 – SLI-1500.020) is the governing specification.
 *
 * WGE computes what is true. SLI computes what should be experienced.
 * Renderers compute how it appears. SLI never mutates Reality; the
 * Interaction Intent Bridge is the only path from experience to WIL.
 */
export { projectExperience, buildProjection, type ProjectionResult } from "./project.js";
export { recompose } from "./recompose.js";
export { bridgeInteraction, type BridgeResult } from "./bridge.js";
export { projectionInputFromWorld, type ProjectionInputOptions } from "./input-from-world.js";
