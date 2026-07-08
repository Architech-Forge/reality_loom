/**
 * @sli/renderer-react — Minimal Renderer Adapter for the web.
 *
 * REF-1900.017 + SLI-1500.012. Converts SLI Projection Output into a living
 * React surface: placement from the layout plan, DOM order from the
 * accessibility plan, motion from the motion plan, affordance from the
 * interaction map. The renderer expresses projection; it never reinterprets
 * Reality, never chooses a new primary, and never commits — interactions
 * leave as SLIInteractionIntents for the Interaction Intent Bridge.
 */
export {
  SLIProjectionSurface,
  REACT_RENDERER_ID,
  type SLIProjectionSurfaceProps,
  type SLIEntityRenderContext
} from "./surface.js";
export {
  createReactRendererAdapter,
  createDeferredSurfacePresenter,
  REACT_RENDERER_CAPABILITIES,
  type SurfacePresenter,
  type DeferredSurfacePresenter
} from "./adapter.js";
export {
  executeMotionPlan,
  animateGhostExit,
  relativeRect,
  type MotionTarget,
  type MotionRunResult,
  type RelativeRect
} from "./motion.js";
