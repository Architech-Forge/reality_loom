/**
 * World Studio OS core (TOOL-2100.002).
 *
 * One in-browser instance of the entire ROC reference stack: the Family
 * Style World compiles through the real compiler, executes in the real
 * WGERuntime, ripples through the real physics, and projects through the
 * real SLI runtime. The studio never mutates Reality directly — every
 * Reality-changing action flows through WIL (WIL-001.005), interactions
 * cross the Interaction Intent Bridge (SLI-1500.016), and physics effects
 * become Reality only when committed as diffs (WGE-1400.013).
 *
 * Framework-free: React subscribes via subscribe/getSnapshot.
 */
import type {
  SLIInteractionIntent,
  SLIProjectionContext,
  SLIProjectionOutput,
  SLIRenderResult,
  WGEPhysicsExecutionResult,
  WGERecompositionTrigger,
  WGERuntimeOutput,
  WGESourceUnit,
  WGEDiff,
  WGEWorld,
  WILActor,
  WILMessage,
  WILTrace
} from "@roc/types";
import {
  createCandidateClient,
  createCompilerClient,
  WILBuilder,
  type WGECandidateWorldClient
} from "@roc/sdk";
import type {
  SLIComparisonSurface,
  SLIConfirmationSurface,
  SLIExplanationSurface
} from "@sli/design-system";
import { inspectWorld, type WorldInspection } from "@roc/devtools";
import { familyStyleWorld } from "@examples/family-style-world";
import { WGERuntime } from "@wge/runtime";
import { bridgeInteraction, buildProjection, projectionInputFromWorld, recompose } from "@sli/runtime";
import { REACT_RENDERER_CAPABILITIES } from "@sli/renderer-react";
import { ACTOR_STUDIO_RUNTIME, ACTOR_VISITOR, SELECTABLE_ACTORS, OBJECTIVE_ID, WORLD_ID } from "./actors";
import { ACTS, type Act } from "./scenario";

// --- State ------------------------------------------------------------------

export type StudioBranch =
  | { kind: "reality" }
  | { kind: "candidate"; candidateWorldId: string };

export interface JournalEntry {
  id: string;
  at: string;
  kind: "system" | "outcome" | "interaction" | "projection" | "law";
  title: string;
  detail?: string;
  traceId?: string;
  status?: string;
}

export interface LawRejectionSurface {
  lawName: string;
  explanation: string;
  summary: string;
  traceId: string;
}

export interface ComparisonState {
  surface: SLIComparisonSurface;
  operationCount: number;
  candidateSnapshotId: string;
  realitySnapshotId: string;
}

export interface StudioSurfaces {
  inspection?: { entityId: string };
  explanation?: SLIExplanationSurface;
  comparison?: ComparisonState;
  confirmation?: SLIConfirmationSurface;
  decision?: { actId: string };
  lawRejection?: LawRejectionSurface;
  traceViewer?: WILTrace;
  physicsViewer?: WGEPhysicsExecutionResult;
}

/** Artifacts the six demo questions are answered from (REF-1900.019). */
export interface ScenarioRecord {
  realitySnapshotBefore?: string;
  candidateWorldId?: string;
  rejectionSummary?: string;
  commitDiff?: WGEDiff;
  commitSnapshotId?: string;
  commitTraceSummary?: string;
  commitActor?: string;
}

export interface StudioState {
  phase: "booting" | "ready" | "failed";
  bootError?: string;
  actorId: string;
  branch: StudioBranch;
  realitySnapshotId: string;
  candidateSnapshotId?: string;
  snapshotLineage: string[];
  projection?: SLIProjectionOutput;
  projectionReason: string;
  projectionSequence: number;
  worldInspection?: WorldInspection;
  journal: JournalEntry[];
  surfaces: StudioSurfaces;
  actIndex: number;
  actRunning: boolean;
  answers?: Record<string, string>;
  selectedEntityId?: string;
  expandedEntityIds: string[];
  densityOverride?: "professional";
  lastPhysics?: WGEPhysicsExecutionResult;
  lastDiff?: WGEDiff;
  lastOutcomeStatus?: string;
  renderVerification?: { status: SLIRenderResult["status"]; diagnostics: number };
  reducedMotion: boolean;
  commitFlash: number;
}

type Present = (projection: SLIProjectionOutput) => Promise<SLIRenderResult>;

export interface ExecuteOptions {
  /** Runs between the runtime outcome and the recomposition that follows. */
  beforeReproject?: (output: WGERuntimeOutput) => void;
}

let sequence = 0;
const nextId = (prefix: string): string => `${prefix}_${++sequence}`;

export class WorldStudioOS {
  private runtime?: WGERuntime;
  private candidates?: WGECandidateWorldClient;
  private listeners = new Set<() => void>();
  private present: Present = async (projection) => ({
    rendererId: "renderer_react",
    status: "failed",
    renderedEntityIds: [],
    diagnostics: [
      {
        code: "SLI_RENDERER_NOT_MOUNTED",
        severity: "error",
        message: "No surface connected yet",
        reason: "the canvas mounts before the first projection presents",
        traceId: projection.traceId
      }
    ]
  });

  readonly acts: readonly Act[] = ACTS;
  readonly record: ScenarioRecord = {};

  state: StudioState = {
    phase: "booting",
    actorId: "actor_emma",
    branch: { kind: "reality" },
    realitySnapshotId: "",
    snapshotLineage: [],
    projectionReason: "",
    projectionSequence: 0,
    journal: [],
    surfaces: {},
    actIndex: 0,
    actRunning: false,
    expandedEntityIds: [],
    reducedMotion:
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    commitFlash: 0
  };

  // --- Store plumbing -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioState => this.state;

  private patch(partial: Partial<StudioState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  connectPresenter(present: Present): void {
    this.present = present;
  }

  actor(): WILActor {
    return SELECTABLE_ACTORS[this.state.actorId] ?? ACTOR_VISITOR;
  }

  wge(): WGERuntime {
    if (!this.runtime) throw new Error("runtime not booted");
    return this.runtime;
  }

  candidateClient(): WGECandidateWorldClient {
    if (!this.candidates) throw new Error("runtime not booted");
    return this.candidates;
  }

  journal(entry: Omit<JournalEntry, "id" | "at">): void {
    this.patch({
      journal: [
        ...this.state.journal,
        { id: nextId("journal"), at: new Date().toISOString(), ...entry }
      ]
    });
  }

  // --- Boot: define → compile → load (REF-1900.019 steps 1–3) ---------------

  async boot(): Promise<void> {
    try {
      const compiler = createCompilerClient();
      const source: WGESourceUnit = {
        id: "family_style_world",
        format: "wdl",
        content: familyStyleWorld() as unknown as Record<string, unknown>
      };
      const compiled = await compiler.compile({ sources: [source], now: new Date().toISOString() });
      if (!compiled.executableWorld) {
        const detail = compiled.diagnostics.map((d) => `${d.code}: ${d.message}`).join("; ");
        this.patch({ phase: "failed", bootError: `world failed to compile — ${detail}` });
        return;
      }
      this.runtime = new WGERuntime(compiled.executableWorld);
      this.candidates = createCandidateClient(this.runtime);
      const snapshot = this.runtime.currentSnapshot();
      this.record.realitySnapshotBefore = snapshot.id;
      this.patch({
        phase: "ready",
        realitySnapshotId: snapshot.id,
        snapshotLineage: [snapshot.id]
      });
      this.journal({
        kind: "system",
        title: "World compiled and loaded",
        detail: `"${WORLD_ID}" is executable; Reality is at snapshot ${snapshot.id}. This canvas is a projection of the world graph — there are no pages to load.`
      });
      await this.reproject("the world awakened", []);
    } catch (cause) {
      this.patch({
        phase: "failed",
        bootError: cause instanceof Error ? cause.message : String(cause)
      });
    }
  }

  // --- Projection loop (SLI-1500.002/.014) -----------------------------------

  private projectionContext(): SLIProjectionContext {
    return {
      device: {
        deviceId: "studio_web",
        formFactor: "desktop",
        viewport: { width: window.innerWidth, height: window.innerHeight },
        inputModes: ["mouse", "keyboard", "touch"],
        capabilities: REACT_RENDERER_CAPABILITIES
      },
      accessibility: { reducedMotion: this.state.reducedMotion },
      ...(this.state.densityOverride !== undefined
        ? { application: { density: this.state.densityOverride } }
        : {})
    };
  }

  /** The projected world for the active branch: Reality, or a Candidate clone. */
  private branchWorldAndSnapshot(): { world: WGEWorld; snapshotId: string } {
    const runtime = this.wge();
    if (this.state.branch.kind === "candidate") {
      const id = this.state.branch.candidateWorldId;
      const world = runtime.candidateWorldState(id);
      const record = runtime.getCandidateWorld(id);
      if (world && record) return { world, snapshotId: record.currentCandidateSnapshotId };
    }
    return { world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id };
  }

  async reproject(reason: string, triggers: WGERecompositionTrigger[]): Promise<void> {
    const { world, snapshotId } = this.branchWorldAndSnapshot();
    const actor = this.actor();
    const traceId = nextId("trace_projection");
    const input = projectionInputFromWorld({
      world,
      snapshotId,
      actor,
      traceId,
      objectiveId: OBJECTIVE_ID,
      recompositionTriggers: triggers,
      context: this.projectionContext(),
      id: nextId("pin")
    });
    const previous = this.state.projection;
    const output = previous
      ? recompose({ previousProjection: previous, projectionInput: input, triggers, reason, traceId })
      : buildProjection(input).output;

    const inspection = inspectWorld(world, actor, {
      ...(this.state.branch.kind === "candidate"
        ? { candidateWorldId: this.state.branch.candidateWorldId }
        : {})
    });

    const patch: Partial<StudioState> = {
      projection: output,
      projectionReason: reason,
      projectionSequence: this.state.projectionSequence + 1,
      worldInspection: inspection,
      realitySnapshotId: this.wge().currentSnapshot().id
    };
    if (this.state.branch.kind === "candidate") patch.candidateSnapshotId = snapshotId;
    else delete this.state.candidateSnapshotId;
    this.patch(patch);
    this.journal({
      kind: "projection",
      title: `Experience recomposed — ${reason}`,
      detail: `primary "${output.composition.primaryEntityId}" · density ${output.composition.density} · ${output.motionPlan.transitions.length} transition(s)`,
      traceId
    });

    // Renderer handoff through the adapter (REF-1900.017): the surface
    // renders, then the contract boundary check verifies it changed nothing.
    const result = await this.present(output);
    this.patch({
      renderVerification: { status: result.status, diagnostics: result.diagnostics?.length ?? 0 }
    });
  }

  // --- WIL execution ----------------------------------------------------------

  /** Routes a WIL message through the runtime and recomposes from its wake. */
  async execute(message: WILMessage, reason: string, options: ExecuteOptions = {}): Promise<WGERuntimeOutput> {
    const runtime = this.wge();
    const output =
      message.mode === "commit"
        ? await runtime.commit(message)
        : message.mode === "simulate"
          ? await runtime.simulate(message)
          : await runtime.observe(message);

    const physics = output.metadata?.physics as WGEPhysicsExecutionResult | undefined;
    this.patch({
      lastOutcomeStatus: output.outcome.status,
      ...(physics !== undefined ? { lastPhysics: physics } : {}),
      ...(output.diff !== undefined ? { lastDiff: output.diff } : {})
    });
    this.journal({
      kind: "outcome",
      title: `${message.intent.type}/${message.mode} → ${output.outcome.status}`,
      detail: output.trace.summary,
      traceId: message.traceId,
      status: output.outcome.status
    });

    options.beforeReproject?.(output);

    if (message.mode === "commit" && output.outcome.status === "success") {
      const snapshot = runtime.currentSnapshot();
      this.patch({
        snapshotLineage: [...this.state.snapshotLineage, snapshot.id],
        realitySnapshotId: snapshot.id,
        commitFlash: this.state.commitFlash + 1
      });
      // Physics effects become Reality only through committed diffs
      // (WGE-1400.013): the studio runtime actor commits each proposal.
      if (physics && physics.generatedDiffOperations.length > 0) {
        await this.commitPhysicsProposals(physics);
      }
      const triggers = runtime.drainRecompositionTriggers();
      await this.reproject(reason, triggers);
    } else if (message.mode === "simulate" && output.outcome.status === "simulation") {
      // Candidate physics stays isolated in the runtime; its triggers shape
      // only this candidate projection (WGE-1400.016).
      await this.reproject(reason, physics?.recompositionTriggers ?? []);
    }
    return output;
  }

  private async commitPhysicsProposals(physics: WGEPhysicsExecutionResult): Promise<void> {
    const runtime = this.wge();
    const byEntity = new Map<string, { kind: string; data: Record<string, unknown> }[]>();
    for (const op of physics.generatedDiffOperations) {
      if (op.type !== "aspect.updated") continue;
      const changes = op.changes as { kind?: string; data?: Record<string, unknown> };
      if (typeof changes.kind !== "string" || changes.data === undefined) continue;
      const list = byEntity.get(op.entityId) ?? [];
      list.push({ kind: changes.kind, data: changes.data });
      byEntity.set(op.entityId, list);
    }
    let applied = 0;
    for (const [entityId, aspects] of byEntity) {
      const message = WILBuilder.message()
        .actor(ACTOR_STUDIO_RUNTIME)
        .intent({
          type: "modify",
          reason: `apply physics effect of event ${physics.eventId} (relevance/confidence transfer)`
        })
        .target({ kind: "entity", id: entityId })
        .context({ worldId: WORLD_ID, snapshotId: runtime.currentSnapshot().id })
        .mode("commit")
        // Magnitude 0: bookkeeping commits must not ripple a second storm.
        .payload({ aspects, physicsMagnitude: 0 })
        .build();
      const output = await runtime.commit(message);
      if (output.outcome.status === "success") applied += 1;
    }
    if (applied > 0) {
      const snapshot = runtime.currentSnapshot();
      this.patch({
        snapshotLineage: [...this.state.snapshotLineage, snapshot.id],
        realitySnapshotId: snapshot.id
      });
      this.journal({
        kind: "system",
        title: `Physics became Reality: ${applied} relevance diff(s) committed`,
        detail: `Effects of event ${physics.eventId} entered Reality through committed diffs (WGE-1400.013); Reality is at ${snapshot.id}.`,
        traceId: physics.trace.id
      });
    }
  }

  // --- Interactions from the renderer (SLI-1500.016) --------------------------

  handleInteraction = (intent: SLIInteractionIntent): void => {
    const bridged = bridgeInteraction(intent, this.actor());
    if (bridged.localOnly) {
      this.handleLocalInteraction(intent, bridged.reason);
      return;
    }
    if (bridged.message) {
      this.journal({
        kind: "interaction",
        title: `Interaction "${intent.interactionType}" became WIL`,
        detail: bridged.reason,
        traceId: bridged.message.traceId
      });
      void this.execute(bridged.message, `interaction "${intent.interactionType}" changed the world`);
    }
  };

  private handleLocalInteraction(intent: SLIInteractionIntent, reason: string): void {
    const entityId = intent.entityId;
    switch (intent.interactionType) {
      case "select":
        if (entityId) {
          const deselecting = this.state.selectedEntityId === entityId;
          const surfaces = { ...this.state.surfaces };
          if (deselecting) delete surfaces.explanation;
          else surfaces.explanation = this.explain(entityId);
          const patch: Partial<StudioState> = { surfaces };
          if (deselecting) delete this.state.selectedEntityId;
          else patch.selectedEntityId = entityId;
          this.patch(patch);
        }
        break;
      case "inspect":
        if (entityId) {
          this.patch({ surfaces: { ...this.state.surfaces, inspection: { entityId } } });
        }
        break;
      case "expand":
        if (entityId && !this.state.expandedEntityIds.includes(entityId)) {
          this.patch({ expandedEntityIds: [...this.state.expandedEntityIds, entityId] });
        }
        break;
      case "collapse":
        if (entityId) {
          this.patch({
            expandedEntityIds: this.state.expandedEntityIds.filter((id) => id !== entityId)
          });
        }
        break;
      case "compare":
        this.openComparison();
        break;
      default:
        break;
    }
    this.journal({ kind: "interaction", title: `Local experience action "${intent.interactionType}"`, detail: reason });
  }

  // --- Surfaces (SLI-1600.013 – .017) -----------------------------------------

  /** SLI-1600.014 — why is this visible right now? */
  explain(entityId: string): SLIExplanationSurface {
    const projection = this.state.projection;
    const composed = projection?.composition.entities.find((e) => e.entityId === entityId);
    const path = this.state.lastPhysics?.trace.paths.find(
      (p) => !p.blocked && p.entityPath.includes(entityId)
    );
    const sources: SLIExplanationSurface["sources"] = ["composition_trace"];
    if (path) sources.push("physics_trace");
    const baseline = composed?.relevanceSource === "projection_baseline";
    return {
      id: nextId("explain"),
      entityId,
      summary: composed
        ? `${composed.role} — ${composed.reason}`
        : "not part of the current composition",
      ...(path !== undefined
        ? {
            detail: `Influence path ${path.entityPath.join(" → ")}: magnitude ${path.initialMagnitude.toFixed(2)} → ${path.finalMagnitude.toFixed(2)}, confidence ${path.initialConfidence.toFixed(2)} → ${path.finalConfidence.toFixed(2)}.`
          }
        : {}),
      ...(baseline
        ? { uncertainty: "baseline projection presence — not physics evidence, not truth" }
        : composed && composed.confidence < 0.5
          ? { uncertainty: `confidence is low (${composed.confidence.toFixed(2)})` }
          : {}),
      sources,
      traceId: projection?.traceId ?? "trace_unknown"
    };
  }

  /** SLI-1600.015 — possibility must never appear as Reality. */
  openComparison(): void {
    if (this.state.branch.kind !== "candidate") return;
    const candidateWorldId = this.state.branch.candidateWorldId;
    const comparison = this.candidateClient().compareCandidateToReality(candidateWorldId);
    if (!comparison) return;
    const surface: SLIComparisonSurface = {
      id: nextId("compare"),
      criteria: ["snapshot", "diverging operations", "law readiness"],
      items: [
        {
          id: comparison.realitySnapshotId,
          kind: "reality",
          label: `Reality — ${comparison.realitySnapshotId}`
        },
        {
          id: comparison.candidateSnapshotId,
          kind: "candidate_world",
          label: `Candidate ${candidateWorldId} — ${comparison.candidateSnapshotId} (possibility, not Reality)`
        }
      ],
      traceId: nextId("trace_compare")
    };
    this.patch({
      surfaces: {
        ...this.state.surfaces,
        comparison: {
          surface,
          operationCount: comparison.operationCount,
          candidateSnapshotId: comparison.candidateSnapshotId,
          realitySnapshotId: comparison.realitySnapshotId
        }
      }
    });
  }

  openTrace(traceId: string): void {
    const trace = this.wge().getTrace(traceId);
    if (trace) this.patch({ surfaces: { ...this.state.surfaces, traceViewer: trace } });
  }

  openPhysics(): void {
    if (this.state.lastPhysics) {
      this.patch({ surfaces: { ...this.state.surfaces, physicsViewer: this.state.lastPhysics } });
    }
  }

  closeSurface(key: keyof StudioSurfaces): void {
    const surfaces = { ...this.state.surfaces };
    delete surfaces[key];
    this.patch({ surfaces });
  }

  setSurfaces(surfaces: Partial<StudioSurfaces>): void {
    this.patch({ surfaces: { ...this.state.surfaces, ...surfaces } });
  }

  setBranch(branch: StudioBranch): void {
    this.patch({ branch });
  }

  setAnswers(answers: Record<string, string>): void {
    this.patch({ answers });
  }

  confirmSurface(confirmation: SLIConfirmationSurface): void {
    this.setSurfaces({ confirmation });
  }

  // --- Studio controls ----------------------------------------------------------

  /** Density earns its place; hidden context is recoverable (SLI-1500.007). */
  async toggleHiddenRecovery(): Promise<void> {
    const recovering = this.state.densityOverride !== "professional";
    if (recovering) this.patch({ densityOverride: "professional" });
    else {
      delete this.state.densityOverride;
      this.patch({});
    }
    await this.reproject(
      recovering
        ? "hidden context recovered — professional density requested"
        : "density returned to adaptive",
      []
    );
  }

  async switchActor(actorId: string): Promise<void> {
    if (!(actorId in SELECTABLE_ACTORS) || actorId === this.state.actorId) return;
    this.patch({ actorId });
    const actor = SELECTABLE_ACTORS[actorId];
    this.journal({
      kind: "system",
      title: `Actor is now ${actor?.displayName ?? actorId}`,
      detail:
        actorId === ACTOR_VISITOR.id
          ? "Unauthenticated guest: private aspects are redacted and commits will be rejected — permission is evaluated before projection (APP-1700.014)."
          : "Emma holds world.commit and household.measurements.view."
    });
    await this.reproject(`projection re-evaluated for ${actor?.displayName ?? actorId}`, []);
  }

  /** Opens the decision surface for a consequential act (SLI-1600.013). */
  requestAct(act: Act): void {
    if (this.state.actRunning) return;
    if (act.decision) {
      this.setSurfaces({ decision: { actId: act.id } });
      return;
    }
    void this.runAct(act);
  }

  /** Runs a scenario act (guarded so one runs at a time). */
  async runAct(act: Act): Promise<void> {
    if (this.state.actRunning) return;
    this.closeSurface("decision");
    this.patch({ actRunning: true });
    try {
      await act.run(this);
      const index = this.acts.findIndex((a) => a.id === act.id);
      if (index >= 0 && index === this.state.actIndex) {
        this.patch({ actIndex: this.state.actIndex + 1 });
      }
    } finally {
      this.patch({ actRunning: false });
    }
  }
}
