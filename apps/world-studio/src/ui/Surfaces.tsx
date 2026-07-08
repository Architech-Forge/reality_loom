/**
 * Studio surfaces (SLI-1600.013 – SLI-1600.017, TOOL-2100.010 – .014).
 *
 * Decision, explanation, comparison, inspection, confirmation, law, trace,
 * and physics surfaces — all layered on the same canvas (foreground/overlay
 * regions), all dismissible, none of them a page. Possibility is always
 * labeled; consequences are always spelled out; redaction is always visible.
 */
import type { ReactNode } from "react";
import type { StudioState, StudioSurfaces as SurfaceMap, WorldStudioOS } from "../studio/os";

function Shell(props: {
  title: string;
  realm?: "reality" | "candidate" | "law" | "projection";
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): ReactNode {
  return (
    <section
      className={`surface realm-${props.realm ?? "projection"}${props.wide ? " surface-wide" : ""}`}
      role="dialog"
      aria-label={props.title}
    >
      <header className="surface-head">
        <h2>{props.title}</h2>
        <button type="button" className="surface-close" aria-label="Dismiss" onClick={props.onClose}>
          ✕
        </button>
      </header>
      <div className="surface-body">{props.children}</div>
    </section>
  );
}

export function StudioSurfaces(props: { os: WorldStudioOS; state: StudioState }): ReactNode {
  const { os, state } = props;
  const surfaces: SurfaceMap = state.surfaces;
  const close = (key: keyof SurfaceMap) => () => os.closeSurface(key);

  const decisionAct = surfaces.decision
    ? os.acts.find((act) => act.id === surfaces.decision?.actId)
    : undefined;

  return (
    <div className="surface-layer" aria-live="polite">
      {decisionAct?.decision && (
        <Shell title="Decision" realm="reality" onClose={close("decision")}>
          <p className="decision-choice">{decisionAct.decision.choice}</p>
          <dl className="surface-fields">
            <dt>Why now</dt>
            <dd>{decisionAct.decision.reason}</dd>
            <dt>What will happen</dt>
            <dd>{decisionAct.decision.consequence}</dd>
            <dt>Alternative</dt>
            <dd>{decisionAct.decision.alternatives.join("; ")}</dd>
          </dl>
          <div className="surface-actions">
            <button
              type="button"
              className="button-primary"
              disabled={state.actRunning}
              onClick={() => void os.runAct(decisionAct)}
            >
              {decisionAct.label}
            </button>
            {decisionAct.decision.cancelable && (
              <button type="button" className="button-quiet" onClick={close("decision")}>
                Not now
              </button>
            )}
          </div>
        </Shell>
      )}

      {surfaces.lawRejection && (
        <Shell title={`Law held: ${surfaces.lawRejection.lawName}`} realm="law" onClose={close("lawRejection")}>
          <p className="law-explanation">“{surfaces.lawRejection.explanation}”</p>
          <p>{surfaces.lawRejection.summary}</p>
          <div className="surface-actions">
            <button type="button" className="button-quiet" onClick={() => os.openTrace(surfaces.lawRejection?.traceId ?? "")}>
              View the trace
            </button>
          </div>
        </Shell>
      )}

      {surfaces.comparison && (
        <Shell title="Comparison — Reality vs. possibility" realm="candidate" onClose={close("comparison")} wide>
          <div className="comparison-grid">
            {surfaces.comparison.surface.items.map((item: { id: string; kind: string; label: string }) => (
              <div key={item.id} className={`comparison-item kind-${item.kind}`}>
                <span className="comparison-kind">{item.kind === "reality" ? "REALITY" : "CANDIDATE"}</span>
                <span className="comparison-label">{item.label}</span>
              </div>
            ))}
          </div>
          <p>
            {surfaces.comparison.operationCount} operation(s) diverge from Reality.
            {state.lastDiff && state.branch.kind === "candidate"
              ? " Latest candidate diff:"
              : ""}
          </p>
          {state.lastDiff && state.branch.kind === "candidate" && (
            <ul className="diff-ops">
              {state.lastDiff.operations.map((op, i) => (
                <li key={i}>
                  <code>{op.type}</code>{" "}
                  {"entityId" in op ? op.entityId : "entity" in op ? op.entity.id : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="surface-note">Criteria: {surfaces.comparison.surface.criteria.join(" · ")}</p>
        </Shell>
      )}

      {surfaces.confirmation && (
        <Shell title="Confirmed" realm="reality" onClose={close("confirmation")}>
          <dl className="surface-fields">
            <dt>What happened</dt>
            <dd>{surfaces.confirmation.whatHappened}</dd>
            <dt>Did Reality change?</dt>
            <dd>
              {surfaces.confirmation.realityChanged
                ? `Yes — Reality is at snapshot ${surfaces.confirmation.snapshotId ?? "?"}.`
                : "No."}
            </dd>
            <dt>Undo</dt>
            <dd>
              {surfaces.confirmation.undoAvailable
                ? "Available."
                : "No undo — but nothing is lost: every prior snapshot remains in the lineage."}
            </dd>
            <dt>What happens next</dt>
            <dd>{surfaces.confirmation.whatHappensNext}</dd>
          </dl>
          <div className="surface-actions">
            <button type="button" className="button-quiet" onClick={() => os.openTrace(surfaces.confirmation?.traceId ?? "")}>
              View the trace
            </button>
          </div>
        </Shell>
      )}

      {surfaces.explanation && (
        <Shell title="Why is this here?" realm="projection" onClose={close("explanation")}>
          <p className="explain-summary">{surfaces.explanation.summary}</p>
          {surfaces.explanation.detail && <p>{surfaces.explanation.detail}</p>}
          {surfaces.explanation.uncertainty && (
            <p className="explain-uncertainty">Uncertainty: {surfaces.explanation.uncertainty}</p>
          )}
          <p className="surface-note">Sources: {surfaces.explanation.sources.join(", ")}</p>
        </Shell>
      )}

      {surfaces.inspection && (
        <InspectionSurface os={os} state={state} entityId={surfaces.inspection.entityId} onClose={close("inspection")} />
      )}

      {surfaces.traceViewer && (
        <Shell title={`Runtime trace — ${surfaces.traceViewer.summary}`} realm="projection" onClose={close("traceViewer")} wide>
          <ol className="trace-steps">
            {surfaces.traceViewer.steps.map((step) => (
              <li key={step.order} className={`trace-step status-${step.status}`}>
                <span className="trace-phase">{step.phase}</span>
                <span className={`trace-status trace-${step.status}`}>{step.status}</span>
                <span className="trace-reason">{step.reason}</span>
              </li>
            ))}
          </ol>
        </Shell>
      )}

      {surfaces.physicsViewer && (
        <Shell title="Physics trace — how influence moved" realm="law" onClose={close("physicsViewer")} wide>
          <p>{surfaces.physicsViewer.trace.summary}</p>
          <h3>Affected entities</h3>
          <ul className="physics-affected">
            {surfaces.physicsViewer.affectedEntities.map((affected) => (
              <li key={affected.entityId}>
                <span className="physics-entity">{affected.entityId}</span>
                <span className="meter relevance">
                  <span style={{ width: `${Math.min(1, affected.magnitude) * 100}%` }} />
                </span>
                <span className="physics-numbers">
                  m {affected.magnitude.toFixed(2)} · c {affected.confidence.toFixed(2)} · depth {affected.depth}
                </span>
              </li>
            ))}
          </ul>
          <h3>Paths</h3>
          <ul className="physics-paths">
            {surfaces.physicsViewer.trace.paths.map((path) => (
              <li key={path.id} className={path.blocked ? "blocked" : ""}>
                {path.entityPath.join(" → ")}{" "}
                <span className="physics-numbers">
                  ({path.initialMagnitude.toFixed(2)} → {path.finalMagnitude.toFixed(2)}
                  {path.blocked ? ` · blocked: ${path.blockedReason ?? "constraint"}` : ""})
                </span>
              </li>
            ))}
          </ul>
          {surfaces.physicsViewer.recompositionTriggers.length > 0 && (
            <>
              <h3>Recomposition triggers</h3>
              <ul className="physics-triggers">
                {surfaces.physicsViewer.recompositionTriggers.map((trigger) => (
                  <li key={trigger.id}>
                    <span className={`trigger-priority priority-${trigger.priority}`}>{trigger.priority}</span>{" "}
                    {trigger.reason} — {trigger.affectedEntityIds.join(", ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Shell>
      )}
    </div>
  );
}

function InspectionSurface(props: {
  os: WorldStudioOS;
  state: StudioState;
  entityId: string;
  onClose: () => void;
}): ReactNode {
  const { os, state, entityId, onClose } = props;
  const inspection = state.worldInspection?.entities.find((e) => e.entityId === entityId);
  if (!inspection) {
    return (
      <Shell title={`Inspect — ${entityId}`} realm="projection" onClose={onClose}>
        <p>This entity is not part of the currently projected world.</p>
      </Shell>
    );
  }
  return (
    <Shell title={`Inspect — ${entityId}`} realm="projection" onClose={onClose} wide>
      <p className="surface-note">
        {state.worldInspection?.label} · type {inspection.type} · lifecycle {inspection.lifecycle} · v
        {inspection.version}
        {inspection.redactionCount > 0
          ? ` · ${inspection.redactionCount} field(s) redacted for this actor`
          : ""}
      </p>
      {inspection.aspects.map((aspect) => (
        <div key={aspect.kind} className="inspect-aspect">
          <h3>{aspect.kind}</h3>
          <dl className="surface-fields">
            {aspect.fields.map((field) => (
              <div key={field.name} className={field.redacted ? "redacted" : ""}>
                <dt>{field.name}</dt>
                <dd>
                  {field.redacted ? (
                    <>
                      <span aria-hidden="true">🔒</span> «redacted» — {field.redactionReason}
                    </>
                  ) : (
                    JSON.stringify(field.value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div className="surface-actions">
        <button
          type="button"
          className="button-quiet"
          onClick={() => os.setSurfaces({ explanation: os.explain(entityId) })}
        >
          Why is this visible?
        </button>
      </div>
    </Shell>
  );
}
