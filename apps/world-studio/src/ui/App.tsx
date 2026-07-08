/**
 * World Studio shell — one living canvas, no pages, no reloads.
 *
 * The shell is chrome around a single projected surface: orientation to the
 * north, the guide to the west, history to the south (the semantic regions
 * of SLI-1600.002), with decision/overlay surfaces layered above. Everything
 * the canvas shows flows from the real stack booted in WorldStudioOS.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createDeferredSurfacePresenter, createReactRendererAdapter } from "@sli/renderer-react";
import { WorldStudioOS } from "../studio/os";
import { Canvas } from "./Canvas";
import { GuideRail } from "./Guide";
import { Journal } from "./Journal";
import { StudioSurfaces } from "./Surfaces";
import { SELECTABLE_ACTORS } from "../studio/actors";

const os = new WorldStudioOS();
const presenter = createDeferredSurfacePresenter();
const adapter = createReactRendererAdapter(presenter.present);
os.connectPresenter((projection) => adapter.render(projection));
let bootStarted = false;

export function App(): React.ReactNode {
  const state = useSyncExternalStore(os.subscribe, os.getSnapshot);

  // Boot after mount so the canvas has connected the presenter — the very
  // first projection must reach a live surface (child effects run first).
  useEffect(() => {
    if (!bootStarted) {
      bootStarted = true;
      void os.boot();
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => {
      // Accessibility changes are respected immediately (SLI-1500.014).
      os.state = { ...os.state, reducedMotion: media.matches };
      void os.reproject("reduced motion preference changed", []);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const branchLabel = useMemo(
    () =>
      state.branch.kind === "candidate"
        ? `CANDIDATE ${state.branch.candidateWorldId}`
        : "REALITY",
    [state.branch]
  );

  if (state.phase === "failed") {
    return (
      <div className="boot-screen" role="alert">
        <h1>World Studio</h1>
        <p className="boot-error">The world failed to compile: {state.bootError}</p>
      </div>
    );
  }

  return (
    <div className="studio" data-branch={state.branch.kind}>
      <header className="chrome chrome-north" aria-label="World status">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◈
          </span>
          <span className="brand-name">World Studio</span>
          <span className="brand-sub">Reality Loom OS</span>
        </div>
        <div className="status-center">
          <span className={`branch-badge branch-${state.branch.kind}`}>{branchLabel}</span>
          <span className="lineage" title="Snapshot lineage — Reality does not forget">
            {state.snapshotLineage.slice(-4).map((id, i, shown) => (
              <span key={id} className="lineage-item">
                {state.snapshotLineage.length > 4 && i === 0 ? "… " : ""}
                <span className={i === shown.length - 1 ? "lineage-current" : "lineage-past"}>{id}</span>
                {i < shown.length - 1 ? " → " : ""}
              </span>
            ))}
          </span>
        </div>
        <div className="status-right">
          {state.projection && (
            <span className="density-chip" title="SLI density plan">
              density: {state.projection.composition.density}
            </span>
          )}
          {state.renderVerification && (
            <span
              className={`verify-chip verify-${state.renderVerification.status}`}
              title="Renderer contract boundary check (SLI-1500.012)"
            >
              renderer: {state.renderVerification.status}
            </span>
          )}
          <label className="actor-switch">
            <span className="visually-hidden">Acting as</span>
            <select
              value={state.actorId}
              onChange={(event) => void os.switchActor(event.target.value)}
              aria-label="Switch actor — permission is evaluated before projection"
            >
              {Object.values(SELECTABLE_ACTORS).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.displayName} {actor.authority.authenticated ? "" : "(unauthenticated)"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <GuideRail os={os} state={state} />

      <main className="canvas-region" aria-label="Projected world canvas">
        <Canvas os={os} state={state} presenter={presenter} />
      </main>

      <Journal os={os} state={state} />

      <StudioSurfaces os={os} state={state} />
    </div>
  );
}
