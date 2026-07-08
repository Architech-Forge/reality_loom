/**
 * SLIProjectionSurface — the living canvas (REF-1900.017, SLI-1500.012).
 *
 * One React surface renders an entire SLI Projection Output: placement comes
 * from bounds hints, DOM order comes from the accessibility reading order,
 * keyboard reachability comes from the keyboard order, motion comes from the
 * motion plan, and interaction affordance comes from the interaction map.
 *
 * The surface expresses projection; it does not reinterpret it. It never
 * chooses a new primary, never renders hidden entities (it renders the
 * mandated hidden-count recovery control instead), never bypasses the
 * interaction map, and never touches WGE Runtime — interactions are emitted
 * as SLIInteractionIntents for the host to route through the Interaction
 * Intent Bridge (SLI-1500.016).
 */
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  SLIAccessibilityNode,
  SLIInteractionIntent,
  SLIInteractionMapEntry,
  SLIProjectionOutput,
  SLIRendererInstruction,
  SLIRenderResult,
  WILContext
} from "@roc/types";
import { animateGhostExit, executeMotionPlan, relativeRect, type RelativeRect } from "./motion.js";

/** Everything an application needs to express one projected entity. */
export interface SLIEntityRenderContext {
  instruction: SLIRendererInstruction;
  accessibilityNode?: SLIAccessibilityNode;
  interaction?: SLIInteractionMapEntry;
  /**
   * Emit an interaction on this entity. Refused (and reported) when the
   * interaction map does not allow it — affordance must match consequence
   * (SLI-1600.006).
   */
  emit: (type: SLIInteractionIntent["interactionType"]) => void;
}

export interface SLIProjectionSurfaceProps {
  projection: SLIProjectionOutput;

  /** The interacting actor; preserved on every emitted intent. */
  actorId: string;

  /** WIL evaluation context attached to emitted intents (SLI-1500.016). */
  interactionContext: WILContext;

  /**
   * Application expression for one entity. The renderer owns placement,
   * order, motion, and interaction gating; the application owns paint.
   */
  renderEntity: (context: SLIEntityRenderContext) => ReactNode;

  /** Receives every allowed interaction intent for bridging to WIL. */
  onInteraction?: (intent: SLIInteractionIntent, entry: SLIInteractionMapEntry) => void;

  /** Called when the interaction map refuses an interaction. */
  onRefusedInteraction?: (
    entityId: string,
    type: SLIInteractionIntent["interactionType"],
    reason: string
  ) => void;

  /** The mandated recovery control for hidden entities (REF-1900.017). */
  onRecoverHidden?: () => void;

  /** Render-result hook for the renderer adapter and boundary checks. */
  onRendered?: (result: SLIRenderResult) => void;

  className?: string;
}

export const REACT_RENDERER_ID = "renderer_react";

let intentSequence = 0;
const nextIntentId = (): string => `intent_react_${++intentSequence}`;

interface GhostRecord {
  entityId: string;
  html: string;
  rect: RelativeRect;
  zOrder: number;
}

const pct = (n: number): string => `${(n * 100).toFixed(4)}%`;

/**
 * Landmark mapping for accessibility node roles. The primary entity is the
 * main landmark; everything else is a labelled group so assistive technology
 * can reach it in reading order without landmark noise.
 */
const ariaRoleFor = (node: SLIAccessibilityNode | undefined): string => {
  if (!node) return "group";
  switch (node.role) {
    case "main":
      return "main";
    case "navigation":
      return "navigation";
    case "status":
      return "status";
    case "explanation":
      return "note";
    default:
      return "group";
  }
};

export function SLIProjectionSurface(props: SLIProjectionSurfaceProps): ReactNode {
  const {
    projection,
    actorId,
    interactionContext,
    renderEntity,
    onInteraction,
    onRefusedInteraction,
    onRecoverHidden,
    onRendered,
    className
  } = props;

  // The surface renders from internal state so that, when a new projection
  // arrives, the outgoing DOM can be captured for ghost exits before React
  // unmounts it (SLI-1500.009: motion explains what changed).
  const [current, setCurrent] = useState(projection);
  const [ghosts, setGhosts] = useState<GhostRecord[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const entityRefs = useRef(new Map<string, HTMLElement>());
  const previousRects = useRef(new Map<string, RelativeRect>());
  const ghostRefs = useRef(new Map<string, HTMLElement>());

  const registerEntity = useCallback((entityId: string, element: HTMLElement | null) => {
    if (element) entityRefs.current.set(entityId, element);
    else entityRefs.current.delete(entityId);
  }, []);

  // Incoming projection: capture the outgoing state, then swap.
  useEffect(() => {
    if (projection === current) return;
    const container = containerRef.current;
    const captured = new Map<string, RelativeRect>();
    const exitGhosts: GhostRecord[] = [];
    if (container) {
      const disappearing = new Set(
        projection.motionPlan.transitions
          .filter((t) => t.type === "disappear")
          .map((t) => t.entityId)
      );
      for (const [entityId, element] of entityRefs.current) {
        const rect = relativeRect(container, element);
        captured.set(entityId, rect);
        if (disappearing.has(entityId) && !projection.motionPlan.reducedMotionApplied) {
          const zOrder = Number.parseInt(element.style.zIndex || "0", 10);
          exitGhosts.push({ entityId, html: element.innerHTML, rect, zOrder });
        }
      }
    }
    previousRects.current = captured;
    setGhosts(exitGhosts);
    setCurrent(projection);
  }, [projection, current]);

  // After the new projection is committed to the DOM: run the motion plan,
  // animate ghost exits, and report the render result.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    executeMotionPlan(
      current.motionPlan,
      {
        container,
        elementFor: (entityId) => entityRefs.current.get(entityId) ?? null
      },
      previousRects.current
    );

    for (const ghost of ghosts) {
      const element = ghostRefs.current.get(ghost.entityId);
      const transition = current.motionPlan.transitions.find(
        (t) => t.type === "disappear" && t.entityId === ghost.entityId
      );
      if (element && transition) {
        animateGhostExit(element, transition, () => {
          ghostRefs.current.delete(ghost.entityId);
          setGhosts((existing) => existing.filter((g) => g.entityId !== ghost.entityId));
        });
      }
    }

    onRendered?.({
      rendererId: REACT_RENDERER_ID,
      status: "rendered",
      renderedEntityIds: current.rendererInstructions
        .filter((i) => i.projectionRole !== "hidden")
        .map((i) => i.entityId)
    });
    // Deps are [current] only: ghost-cleanup re-renders must not re-run the
    // plan or re-report the render result.
  }, [current]);

  const interactionByEntity = useMemo(
    () => new Map(current.interactionMap.entries.map((e) => [e.entityId, e] as const)),
    [current]
  );
  const accessibilityByEntity = useMemo(
    () => new Map(current.accessibilityPlan.readingOrder.map((n) => [n.entityId, n] as const)),
    [current]
  );
  const keyboardReachable = useMemo(
    () => new Set(current.accessibilityPlan.keyboardOrder.map((n) => n.entityId)),
    [current]
  );
  const readingIndex = useMemo(
    () =>
      new Map(current.accessibilityPlan.readingOrder.map((n, i) => [n.entityId, i] as const)),
    [current]
  );

  const emitFor = useCallback(
    (entityId: string) =>
      (type: SLIInteractionIntent["interactionType"]): void => {
        const entry = interactionByEntity.get(entityId);
        if (!entry || !entry.allowedInteractions.includes(type)) {
          onRefusedInteraction?.(
            entityId,
            type,
            entry
              ? `interaction "${type}" is not allowed at level "${entry.interactionLevel}" (SLI-1600.006)`
              : "entity has no interaction map entry"
          );
          return;
        }
        const intent: SLIInteractionIntent = {
          id: nextIntentId(),
          actorId,
          projectionId: current.id,
          entityId,
          interactionType: type,
          context: interactionContext,
          traceId: current.traceId
        };
        onInteraction?.(intent, entry);
      },
    [interactionByEntity, actorId, current, interactionContext, onInteraction, onRefusedInteraction]
  );

  // Visible instructions in reading order: the accessibility plan is the DOM
  // order, so screen readers and the visual canvas agree (SLI-1500.011).
  const visible = useMemo(
    () =>
      current.rendererInstructions
        .filter((i) => i.projectionRole !== "hidden")
        .sort(
          (a, b) =>
            (readingIndex.get(a.entityId) ?? Number.MAX_SAFE_INTEGER) -
            (readingIndex.get(b.entityId) ?? Number.MAX_SAFE_INTEGER)
        ),
    [current, readingIndex]
  );
  const hiddenCount = current.rendererInstructions.length - visible.length;

  return (
    <div
      ref={containerRef}
      className={className ? `sli-surface ${className}` : "sli-surface"}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      data-projection-id={current.id}
      data-snapshot-id={current.snapshotId}
      data-density={current.composition.density}
      aria-label={current.accessibilityPlan.summary}
    >
      {visible.map((instruction) => {
        const bounds = instruction.boundsHint ?? { x: 0, y: 0, width: 1, height: 1 };
        const node = accessibilityByEntity.get(instruction.entityId);
        const entry = interactionByEntity.get(instruction.entityId);
        const emit = emitFor(instruction.entityId);
        const focusable =
          keyboardReachable.has(instruction.entityId) &&
          instruction.interactionLevel !== "none" &&
          instruction.interactionLevel !== "passive";
        const composed = current.composition.entities.find(
          (e) => e.entityId === instruction.entityId
        );
        return (
          <section
            key={instruction.entityId}
            ref={(element) => registerEntity(instruction.entityId, element)}
            role={ariaRoleFor(node)}
            aria-label={node?.label ?? instruction.entityId}
            aria-roledescription={`${instruction.projectionRole} entity`}
            tabIndex={focusable ? 0 : -1}
            data-entity-id={instruction.entityId}
            data-role={instruction.projectionRole}
            data-region={instruction.region ?? ""}
            data-interaction-level={instruction.interactionLevel}
            style={{
              position: "absolute",
              left: pct(bounds.x),
              top: pct(bounds.y),
              width: pct(bounds.width),
              height: pct(bounds.height),
              zIndex: instruction.projectionRole === "primary" ? 10 : 5,
              // Roles MUST influence visual weight (SLI-1600.003); the value
              // is exposed for application styling rather than painted here.
              ["--sli-visual-weight" as string]: String(instruction.visualWeight),
              ["--sli-relevance" as string]: String(composed?.relevance ?? 0),
              ["--sli-confidence" as string]: String(composed?.confidence ?? 1)
            }}
            onClick={() => emit("select")}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                emit("select");
              }
            }}
          >
            {renderEntity({
              instruction,
              ...(node !== undefined ? { accessibilityNode: node } : {}),
              ...(entry !== undefined ? { interaction: entry } : {}),
              emit
            })}
          </section>
        );
      })}

      {ghosts.map((ghost) => (
        <div
          key={`ghost_${ghost.entityId}`}
          ref={(element) => {
            if (element) {
              ghostRefs.current.set(ghost.entityId, element);
              if (element.innerHTML !== ghost.html) element.innerHTML = ghost.html;
            }
          }}
          aria-hidden="true"
          data-ghost-for={ghost.entityId}
          style={{
            position: "absolute",
            left: `${ghost.rect.left}px`,
            top: `${ghost.rect.top}px`,
            width: `${ghost.rect.width}px`,
            height: `${ghost.rect.height}px`,
            zIndex: ghost.zOrder,
            pointerEvents: "none"
          }}
        />
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          className="sli-hidden-recovery"
          aria-label={`${hiddenCount} ${hiddenCount === 1 ? "entity is" : "entities are"} not currently projected — recover hidden context`}
          data-hidden-count={hiddenCount}
          style={{ position: "absolute", right: 8, bottom: 8, zIndex: 20 }}
          onClick={() => onRecoverHidden?.()}
        >
          {hiddenCount} hidden
        </button>
      )}
    </div>
  );
}
