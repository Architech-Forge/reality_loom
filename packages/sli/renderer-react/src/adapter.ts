/**
 * React Renderer Adapter (SLI-1500.012, REF-1900.017).
 *
 * Wraps a mounted SLIProjectionSurface behind the SLIRendererAdapter
 * contract. Every render is boundary-checked with the shared contract
 * checker: a renderer may degrade, but it may not reinterpret projection
 * meaning — and when it degrades it says so through diagnostics
 * (SLI-1500.018).
 */
import type { SLIProjectionOutput, SLIRendererCapabilities, SLIRenderResult } from "@roc/types";
import { checkRendererBoundaries, type SLIRendererAdapter } from "@sli/renderer-contract";
import { REACT_RENDERER_ID } from "./surface.js";

/** Capabilities of the web surface (SLI-1500.012). */
export const REACT_RENDERER_CAPABILITIES: SLIRendererCapabilities = {
  supportsMotion: true,
  supports3D: false,
  supportsTouch: true,
  supportsKeyboard: true,
  supportsScreenReader: true,
  supportsVoice: false,
  supportsReducedMotion: true
};

/**
 * The presenter is the seam between the adapter contract and React: it hands
 * a projection to the mounted surface and resolves with the surface's render
 * result once React has committed it (via the surface's onRendered hook).
 */
export type SurfacePresenter = (projection: SLIProjectionOutput) => Promise<SLIRenderResult>;

/**
 * Presenter wiring for a host application. The app renders
 * `<SLIProjectionSurface projection={presenter.projection} onRendered={presenter.notifyRendered} …/>`
 * from its own state and calls `presenter.connect` with its state setter.
 */
export interface DeferredSurfacePresenter {
  present: SurfacePresenter;
  /** Connect the React state setter that swaps the surface's projection. */
  connect(setProjection: (projection: SLIProjectionOutput) => void): void;
  /** Wire to SLIProjectionSurface's onRendered. */
  notifyRendered(result: SLIRenderResult): void;
}

export function createDeferredSurfacePresenter(): DeferredSurfacePresenter {
  let setProjection: ((projection: SLIProjectionOutput) => void) | undefined;
  let pending: ((result: SLIRenderResult) => void) | undefined;

  return {
    present(projection: SLIProjectionOutput): Promise<SLIRenderResult> {
      if (!setProjection) {
        return Promise.resolve({
          rendererId: REACT_RENDERER_ID,
          status: "failed",
          renderedEntityIds: [],
          diagnostics: [
            {
              code: "SLI_RENDERER_NOT_MOUNTED",
              severity: "error",
              message: "No projection surface is mounted",
              reason:
                "renderer failure must not become Reality failure; the previous valid projection should be preserved (SLI-1500.018)",
              traceId: projection.traceId
            }
          ]
        });
      }
      return new Promise<SLIRenderResult>((resolve) => {
        pending = resolve;
        setProjection?.(projection);
      });
    },
    connect(setter): void {
      setProjection = setter;
    },
    notifyRendered(result): void {
      const resolve = pending;
      pending = undefined;
      resolve?.(result);
    }
  };
}

/** SLI-1500.012 — the conforming web renderer adapter. */
export function createReactRendererAdapter(present: SurfacePresenter): SLIRendererAdapter {
  return {
    id: REACT_RENDERER_ID,
    platform: "web",
    capabilities: REACT_RENDERER_CAPABILITIES,

    async render(projection: SLIProjectionOutput): Promise<SLIRenderResult> {
      let result: SLIRenderResult;
      try {
        result = await present(projection);
      } catch (cause) {
        return {
          rendererId: REACT_RENDERER_ID,
          status: "failed",
          renderedEntityIds: [],
          diagnostics: [
            {
              code: "SLI_RENDERER_FAILED",
              severity: "error",
              message: "The React surface failed to present the projection",
              reason: cause instanceof Error ? cause.message : String(cause),
              traceId: projection.traceId
            }
          ]
        };
      }

      // Self-verification against the renderer contract: dropping the
      // primary or inventing entities downgrades the result — loudly.
      const violations = checkRendererBoundaries(projection, result);
      if (violations.length > 0) {
        return {
          ...result,
          status: "degraded",
          diagnostics: [...(result.diagnostics ?? []), ...violations]
        };
      }
      return result;
    }
  };
}
