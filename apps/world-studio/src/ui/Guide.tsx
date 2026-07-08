/**
 * The guide rail (west region, SLI-1600.002: "guide, companion, assistant").
 *
 * Birdi narrates the scenario and offers exactly one next act; consequential
 * acts open a Decision Surface instead of firing (SLI-1600.013). The rail
 * also carries the studio's inspection controls — comparison, physics trace,
 * and mode context (TOOL-2100.002 modes).
 */
import type { ReactNode } from "react";
import type { StudioState, WorldStudioOS } from "../studio/os";

const MODE_FOR_ACT: Record<string, string> = {
  act_draft: "Simulate",
  act_premature: "Validate",
  act_accept: "Simulate",
  act_compare: "Compare",
  act_commit: "Commit",
  act_rain: "Project",
  act_author: "Author",
  act_answers: "Debug"
};

export function GuideRail(props: { os: WorldStudioOS; state: StudioState }): ReactNode {
  const { os, state } = props;
  const nextAct = os.acts[state.actIndex];
  const done = state.actIndex >= os.acts.length;

  return (
    <aside className="chrome chrome-west" aria-label="Guide">
      <div className="guide-bird" aria-hidden="true">
        🐦
      </div>
      <div className="guide-mode">
        mode: <strong>{done ? "Inspect" : (MODE_FOR_ACT[nextAct?.id ?? ""] ?? "Inspect")}</strong>
      </div>

      <div className="guide-narration" role="status">
        {state.phase === "booting"
          ? "Compiling the Family Style World…"
          : done
            ? "The loop is proven. Keep exploring: select anything and ask why, inspect entities as the Guest to see redaction, or reopen the physics trace."
            : (nextAct?.narration ?? "")}
      </div>

      {!done && nextAct && state.phase === "ready" && (
        <button
          type="button"
          className="button-primary guide-next"
          disabled={state.actRunning}
          onClick={() => os.requestAct(nextAct)}
        >
          {state.actRunning ? "…" : nextAct.label}
        </button>
      )}
      {!done && nextAct && <div className="guide-codex">{nextAct.codexRef}</div>}

      <ol className="guide-acts" aria-label="Scenario progress">
        {os.acts.map((act, index) => (
          <li
            key={act.id}
            className={
              index < state.actIndex ? "done" : index === state.actIndex ? "current" : "pending"
            }
          >
            {act.label}
          </li>
        ))}
      </ol>

      <div className="guide-tools">
        {state.branch.kind === "candidate" && (
          <button type="button" className="button-quiet" onClick={() => os.openComparison()}>
            Compare worlds
          </button>
        )}
        {state.lastPhysics && (
          <button type="button" className="button-quiet" onClick={() => os.openPhysics()}>
            Physics trace
          </button>
        )}
        <button type="button" className="button-quiet" onClick={() => void os.toggleHiddenRecovery()}>
          {state.densityOverride === "professional" ? "Adaptive density" : "Reveal hidden context"}
        </button>
      </div>
    </aside>
  );
}
