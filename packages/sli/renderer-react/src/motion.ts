/**
 * Motion execution (SLI-1500.009, SLI-1600.010).
 *
 * The renderer executes the SLI Motion Plan — it never invents motion of its
 * own. Every animation here is driven by an SLITransition: identity is
 * preserved through movement, durations come from the plan's duration hints,
 * and when the plan says reduced motion was applied there is nothing to run
 * (the plan carries no transitions). Environments without the Web Animations
 * API degrade to instant state change, which is the sanctioned reduced-motion
 * alternative for every default motion token.
 */
import type { SLIMotionPlan, SLITransition } from "@roc/types";

/** Standard deceleration curve: clarifying, never bouncy. */
const MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export interface MotionTarget {
  /** The positioned surface container all placements are relative to. */
  container: HTMLElement;
  /** Live element lookup by entity id; null when the entity is not mounted. */
  elementFor(entityId: string): HTMLElement | null;
}

export interface MotionRunResult {
  /** Transition ids that ran to completion (or were degraded to instant). */
  ran: string[];
  /** Transition ids skipped because their entity had no mounted element. */
  skipped: string[];
  /** Resolves when every started animation has finished or been canceled. */
  finished: Promise<void>;
}

/** Pixel rect relative to the surface container. */
export interface RelativeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function relativeRect(container: HTMLElement, element: Element): RelativeRect {
  const c = container.getBoundingClientRect();
  const r = element.getBoundingClientRect();
  return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
}

const supportsWAAPI = (element: HTMLElement): boolean =>
  typeof element.animate === "function";

function animate(
  element: HTMLElement,
  keyframes: Keyframe[],
  durationMs: number
): Promise<void> {
  if (!supportsWAAPI(element) || durationMs <= 0) return Promise.resolve();
  const animation = element.animate(keyframes, {
    duration: durationMs,
    easing: MOTION_EASING,
    fill: "none"
  });
  return animation.finished.then(
    () => undefined,
    () => undefined // canceled animations are not failures
  );
}

/**
 * Runs one transition against a mounted element. `previous` is the entity's
 * rect (container-relative) captured before the projection changed; move and
 * resize transitions animate from it to the element's natural new position so
 * the motion is pixel-accurate regardless of how bounds hints were mapped.
 */
function runTransition(
  transition: SLITransition,
  element: HTMLElement,
  container: HTMLElement,
  previous: RelativeRect | undefined
): Promise<void> {
  const duration = transition.durationHintMs;
  switch (transition.type) {
    case "appear":
      return animate(
        element,
        [
          { opacity: 0, transform: "scale(0.96) translateY(6px)" },
          { opacity: 1, transform: "none" }
        ],
        duration
      );
    case "move":
    case "resize":
    case "reorder": {
      if (!previous) {
        // No prior place to move from — arriving counts as appearing.
        return animate(element, [{ opacity: 0 }, { opacity: 1 }], duration);
      }
      const now = relativeRect(container, element);
      const unchanged =
        Math.abs(previous.left - now.left) < 0.5 &&
        Math.abs(previous.top - now.top) < 0.5 &&
        Math.abs(previous.width - now.width) < 0.5 &&
        Math.abs(previous.height - now.height) < 0.5;
      if (unchanged) return Promise.resolve();
      // Animate the box itself (left/top/width/height) rather than a scale
      // transform: containers hold live text and controls, and scaling would
      // distort them mid-flight.
      return animate(
        element,
        [
          {
            left: `${previous.left}px`,
            top: `${previous.top}px`,
            width: `${previous.width}px`,
            height: `${previous.height}px`
          },
          {
            left: `${now.left}px`,
            top: `${now.top}px`,
            width: `${now.width}px`,
            height: `${now.height}px`
          }
        ],
        duration
      );
    }
    case "expand":
    case "emphasize":
      return animate(
        element,
        [{ transform: "scale(0.985)" }, { transform: "scale(1.01)" }, { transform: "none" }],
        duration
      );
    case "collapse":
    case "deemphasize":
      return animate(element, [{ opacity: 0.55 }, { opacity: 1 }], duration);
    case "ambient":
      return animate(element, [{ opacity: 0.85 }, { opacity: 1 }], duration);
    case "disappear":
      // Disappearance is handled by the surface's ghost layer (the element is
      // already unmounted by the time the plan runs). Nothing to do here.
      return Promise.resolve();
  }
}

/**
 * Executes a full motion plan. Transitions whose entity is not mounted are
 * recorded as skipped rather than failing the run: a renderer may degrade,
 * but it must say so (SLI-1500.018).
 */
export function executeMotionPlan(
  plan: SLIMotionPlan,
  target: MotionTarget,
  previousRects: ReadonlyMap<string, RelativeRect>
): MotionRunResult {
  const ran: string[] = [];
  const skipped: string[] = [];
  const running: Promise<void>[] = [];

  if (plan.reducedMotionApplied) {
    return { ran, skipped, finished: Promise.resolve() };
  }

  for (const transition of plan.transitions) {
    if (transition.type === "disappear") {
      // Ghost exits run in the surface; count them as handled.
      ran.push(transition.id);
      continue;
    }
    const element = target.elementFor(transition.entityId);
    if (!element) {
      skipped.push(transition.id);
      continue;
    }
    ran.push(transition.id);
    running.push(
      runTransition(transition, element, target.container, previousRects.get(transition.entityId))
    );
  }

  return { ran, skipped, finished: Promise.all(running).then(() => undefined) };
}

/**
 * Animates a ghost clone out of the surface for a "disappear" transition,
 * removing it when done. Ghosts are presentation-only: hidden from the
 * accessibility tree and inert to input.
 */
export function animateGhostExit(
  ghost: HTMLElement,
  transition: SLITransition,
  onDone: () => void
): void {
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.pointerEvents = "none";
  if (!supportsWAAPI(ghost) || transition.durationHintMs <= 0) {
    onDone();
    return;
  }
  const animation = ghost.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "scale(0.97) translateY(4px)" }
    ],
    { duration: transition.durationHintMs, easing: MOTION_EASING, fill: "forwards" }
  );
  animation.finished.then(onDone, onDone);
}
