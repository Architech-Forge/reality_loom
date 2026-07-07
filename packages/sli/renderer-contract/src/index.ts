/**
 * @sli/renderer-contract — Renderer Adapter Contract.
 *
 * SLI-1500.012. Build order position 11 (REF-1900.003).
 * Renderer Adapters convert SLI Projection Output into platform-specific UI.
 * They may choose components and styling; they MUST NOT change World truth,
 * change Projection meaning, ignore accessibility, invent a new primary
 * focus, bypass interaction mapping, or commit World mutations directly.
 */
import type {
  SLIProjectionDiagnostic,
  SLIProjectionOutput,
  SLIRendererCapabilities,
  SLIRenderResult
} from "@roc/types";

/** SLI-1500.012 — Renderer Adapter. */
export interface SLIRendererAdapter {
  id: string;

  platform:
    | "web"
    | "ios"
    | "android"
    | "desktop"
    | "three"
    | "vision"
    | "voice"
    | "embedded"
    | "custom";

  capabilities: SLIRendererCapabilities;

  render(projection: SLIProjectionOutput): Promise<SLIRenderResult>;
}

/**
 * Boundary check a conforming render result must pass: the renderer may
 * degrade, but it may not reinterpret projection meaning. Returns
 * diagnostics for every violation (empty = conforming).
 */
export function checkRendererBoundaries(
  projection: SLIProjectionOutput,
  result: SLIRenderResult
): SLIProjectionDiagnostic[] {
  const diagnostics: SLIProjectionDiagnostic[] = [];
  const primary = projection.composition.primaryEntityId;

  if (result.status !== "failed" && !result.renderedEntityIds.includes(primary)) {
    diagnostics.push({
      code: "SLI_RENDERER_DROPPED_PRIMARY",
      severity: "error",
      message: `Renderer "${result.rendererId}" did not render the primary entity "${primary}"`,
      reason:
        "renderers MUST NOT invent a new primary focus or drop the attention owner (SLI-1500.012)",
      entityIds: [primary],
      traceId: projection.traceId
    });
  }

  const projectable = new Set(
    projection.rendererInstructions
      .filter((i) => i.projectionRole !== "hidden")
      .map((i) => i.entityId)
  );
  for (const renderedId of result.renderedEntityIds) {
    if (!projectable.has(renderedId)) {
      diagnostics.push({
        code: "SLI_RENDERER_INVENTED_ENTITY",
        severity: "error",
        message: `Renderer "${result.rendererId}" rendered "${renderedId}" which the projection did not expose`,
        reason: "renderers express Projection; they do not reinterpret Reality (SLI-1500.012)",
        entityIds: [renderedId],
        traceId: projection.traceId
      });
    }
  }

  return diagnostics;
}

/** Capability declaration for the simplest conforming renderer. */
export const MINIMAL_RENDERER_CAPABILITIES: SLIRendererCapabilities = {
  supportsMotion: false,
  supports3D: false,
  supportsTouch: false,
  supportsKeyboard: true,
  supportsScreenReader: true,
  supportsVoice: false,
  supportsReducedMotion: true
};
