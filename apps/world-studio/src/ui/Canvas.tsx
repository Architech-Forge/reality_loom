/**
 * The living canvas: one SLIProjectionSurface plus the loom threads.
 *
 * Threads are drawn from the composition's relationships (SLI-1500.005) —
 * they are projection meaning made visible, not decoration: emphasis comes
 * from the composition (strong for primary-adjacent, faint for weak edges).
 * A requestAnimationFrame loop tracks entity elements while the motion plan
 * animates them, so threads stay attached mid-flight, pixel for pixel.
 */
import { useEffect, useRef, useState } from "react";
import type { SLIProjectionOutput } from "@roc/types";
import { SLIProjectionSurface, type DeferredSurfacePresenter } from "@sli/renderer-react";
import type { StudioState, WorldStudioOS } from "../studio/os";
import { WORLD_ID } from "../studio/actors";
import { EntityContent } from "./EntityContent";

interface ThreadLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  emphasis: "strong" | "normal" | "faint";
  type: string;
}

function ThreadsOverlay(props: {
  projection: SLIProjectionOutput | null;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactNode {
  const { projection, wrapRef } = props;
  const [lines, setLines] = useState<ThreadLine[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !projection) {
      setLines([]);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const longest = projection.motionPlan.transitions.reduce(
      (max, t) => Math.max(max, t.durationHintMs),
      0
    );

    const measure = (): ThreadLine[] => {
      const wrapRect = wrap.getBoundingClientRect();
      const centers = new Map<string, { x: number; y: number }>();
      for (const element of wrap.querySelectorAll<HTMLElement>("[data-entity-id]")) {
        const rect = element.getBoundingClientRect();
        const id = element.dataset.entityId;
        if (id) {
          centers.set(id, {
            x: rect.left - wrapRect.left + rect.width / 2,
            y: rect.top - wrapRect.top + rect.height / 2
          });
        }
      }
      const next: ThreadLine[] = [];
      for (const rel of projection.composition.relationships) {
        const from = centers.get(rel.fromEntityId);
        const to = centers.get(rel.toEntityId);
        if (from && to) {
          next.push({
            id: rel.relationshipId,
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            emphasis: rel.emphasis,
            type: rel.type
          });
        }
      }
      return next;
    };

    const tick = (): void => {
      setLines(measure());
      // Keep tracking while the motion plan is in flight, then settle.
      if (performance.now() - started < longest + 150) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);

    const onResize = (): void => setLines(measure());
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [projection, wrapRef]);

  return (
    <svg className="threads" aria-hidden="true">
      {lines.map((line) => (
        <line
          key={line.id}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          className={`thread thread-${line.emphasis}`}
        >
          <title>{line.type}</title>
        </line>
      ))}
    </svg>
  );
}

export function Canvas(props: {
  os: WorldStudioOS;
  state: StudioState;
  presenter: DeferredSurfacePresenter;
}): React.ReactNode {
  const { os, state, presenter } = props;
  const [projection, setProjection] = useState<SLIProjectionOutput | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    presenter.connect(setProjection);
  }, [presenter]);

  // Commit flash: Reality advanced — a moment of gold, then calm.
  useEffect(() => {
    if (state.commitFlash === 0) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 950);
    return () => window.clearTimeout(timer);
  }, [state.commitFlash]);

  const interactionContext =
    state.branch.kind === "candidate"
      ? { worldId: WORLD_ID, candidateWorldId: state.branch.candidateWorldId }
      : { worldId: WORLD_ID, snapshotId: state.realitySnapshotId };

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap${flash ? " canvas-flash" : ""}`}
      data-branch={state.branch.kind}
    >
      {state.branch.kind === "candidate" && (
        <div className="candidate-banner" role="status">
          <span className="candidate-dot" aria-hidden="true" />
          Candidate World {state.branch.candidateWorldId} — possibility, not Reality
          {state.candidateSnapshotId ? ` · ${state.candidateSnapshotId}` : ""}
        </div>
      )}

      <ThreadsOverlay projection={projection} wrapRef={wrapRef} />

      {projection ? (
        <SLIProjectionSurface
          projection={projection}
          actorId={state.actorId}
          interactionContext={interactionContext}
          renderEntity={(context) => <EntityContent os={os} state={state} context={context} />}
          onInteraction={(intent) => os.handleInteraction(intent)}
          onRefusedInteraction={(entityId, type, reason) =>
            os.journal({
              kind: "interaction",
              title: `Refused "${type}" on ${entityId}`,
              detail: reason
            })
          }
          onRecoverHidden={() => void os.toggleHiddenRecovery()}
          onRendered={presenter.notifyRendered}
          className="studio-surface"
        />
      ) : (
        <div className="boot-screen" role="status" aria-live="polite">
          <span className="boot-mark" aria-hidden="true">
            ◈
          </span>
          <p>Compiling the world…</p>
        </div>
      )}

      <div className="projection-reason" role="status" aria-live="polite">
        {state.projectionReason}
      </div>
    </div>
  );
}
