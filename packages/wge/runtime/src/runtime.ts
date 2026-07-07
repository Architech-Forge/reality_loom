/**
 * WGERuntime — the causality engine for Worlds (REF-1900.011, Volume 1300).
 *
 * Consumes an Executable World, receives WIL messages, evaluates Laws,
 * produces Diffs, commits Snapshots, manages Candidate Worlds, and emits
 * traceable Outcomes. Execution follows the semantic order of WGE-1300.005;
 * every execution — including early termination — produces an Outcome and a
 * Trace. Internally synchronous, publicly async (REF-1900.011 first rule).
 */
import type {
  WGEDiff,
  WGERuntimeCandidateWorld,
  WGERuntimeDiagnostic,
  WGERuntimeLifecycleState,
  WGERuntimeOutput,
  WGESnapshot,
  WGETransaction,
  WGEWorld,
  WILMessage,
  WILOutcomeStatus,
  WILTrace,
  WILTraceStep
} from "@roc/types";
import { WIL_PROTOCOL_VERSION } from "@roc/types";
import { createOutcome, createTrace, validateWILMessage } from "@wge/wil";
import { createDiff, createSnapshot, validateWorld } from "@wge/kernel";
import type { WGEExecutableWorld } from "@wge/executable";
import { runPhysics } from "@wge/physics";
import type { WGEPhysicsExecutionResult, WGERecompositionTrigger } from "@roc/types";
import { applyDiffOperations } from "./apply-diff.js";
import { affectedEntityIds, interpretIntent } from "./intent.js";
import { evaluateLaws } from "./laws.js";
import { executeTraversal } from "./traversal.js";

interface CandidateState {
  record: WGERuntimeCandidateWorld;
  world: WGEWorld;
  diffs: WGEDiff[];
}

interface FinishExtras {
  diff?: WGEDiff;
  snapshot?: WGESnapshot;
  candidateWorldId?: string;
  snapshotId?: string;
  worldDiffId?: string;
  metadata?: Record<string, unknown>;
}

type FinishFn = (
  status: WILOutcomeStatus,
  summary: string,
  extras?: FinishExtras
) => WGERuntimeOutput;

export interface WGERuntimeOptions {
  /** Injectable clock for deterministic execution (WGE-1300.005 invariant). */
  now?: () => string;
}

export class WGERuntime {
  private lifecycle: WGERuntimeLifecycleState = "created";
  private world: WGEWorld;
  private snapshot: WGESnapshot;
  private readonly snapshots = new Map<string, WGESnapshot>();
  private readonly committedDiffs = new Map<string, WGEDiff>();
  private readonly transactions = new Map<string, WGETransaction>();
  private readonly traces = new Map<string, WILTrace>();
  private readonly candidates = new Map<string, CandidateState>();
  private readonly pendingTriggers: WGERecompositionTrigger[] = [];
  private readonly now: () => string;
  private sequence = 0;

  constructor(
    private readonly executable: WGEExecutableWorld,
    options: WGERuntimeOptions = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.lifecycle = "loading";

    // Initialization (WGE-1300.002): validate executable metadata and
    // version compatibility, hydrate the initial snapshot.
    if (executable.wilVersion.split(".")[0] !== WIL_PROTOCOL_VERSION.split(".")[0]) {
      this.lifecycle = "failed";
      throw new Error(
        `Executable World WIL version ${executable.wilVersion} is incompatible with runtime ${WIL_PROTOCOL_VERSION}`
      );
    }
    const kernelCheck = validateWorld(executable.world);
    if (kernelCheck.outcome === "invalid") {
      this.lifecycle = "failed";
      throw new Error("Executable World failed kernel validation; the runtime cannot load it");
    }

    this.world = structuredClone(executable.world);
    this.snapshot = executable.initialSnapshot;
    this.snapshots.set(this.snapshot.id, this.snapshot);
    this.lifecycle = "ready";
  }

  get lifecycleState(): WGERuntimeLifecycleState {
    return this.lifecycle;
  }

  currentSnapshot(): WGESnapshot {
    return this.snapshot;
  }

  getTrace(traceId: string): WILTrace | undefined {
    return this.traces.get(traceId);
  }

  getTransaction(transactionId: string): WGETransaction | undefined {
    return this.transactions.get(transactionId);
  }

  getCandidateWorld(candidateWorldId: string): WGERuntimeCandidateWorld | undefined {
    return this.candidates.get(candidateWorldId)?.record;
  }

  /**
   * Read-only clone of a Candidate World's state so SLI can project the
   * planning workspace and comparison surfaces (WGE-1300.013 operations).
   * A clone is returned: mutating it cannot touch the candidate, let alone
   * Reality.
   */
  candidateWorldState(candidateWorldId: string): WGEWorld | undefined {
    const candidate = this.candidates.get(candidateWorldId);
    return candidate ? structuredClone(candidate.world) : undefined;
  }

  /** Reality world state — exposed for projection/diagnostics, read-only by convention. */
  realityWorld(): WGEWorld {
    return this.world;
  }

  /** Recomposition triggers awaiting SLI (WGE-1400.019). Draining hands them off. */
  drainRecompositionTriggers(): WGERecompositionTrigger[] {
    return this.pendingTriggers.splice(0, this.pendingTriggers.length);
  }

  /** Physics ripple for a committed change (WGE-1300.005 "Apply Physics if required"). */
  private ripple(
    world: WGEWorld,
    snapshotId: string,
    originEntityId: string,
    message: WILMessage,
    isolated: boolean
  ): WGEPhysicsExecutionResult {
    const payload = message.payload ?? {};
    const result = runPhysics({
      world,
      event: {
        id: `pev_${this.world.id}_${++this.sequence}`,
        worldId: this.world.id,
        snapshotId,
        originEntityId,
        type: `${message.intent.type}.applied`,
        actorId: message.actor.id,
        messageId: message.id,
        traceId: message.traceId,
        magnitude: typeof payload.physicsMagnitude === "number" ? payload.physicsMagnitude : 0.5,
        confidence: message.intent.confidence ?? 1,
        occurredAt: this.now()
      },
      actor: message.actor,
      context: message.context,
      // Runtime-initiated ripples are explicitly permitted to travel against
      // relationship direction (WGE-1400.005 reverse permission).
      permitReverse: true
    });
    // Candidate-world physics stays isolated (WGE-1400.016): its triggers
    // never enter the Reality recomposition queue.
    if (!isolated) this.pendingTriggers.push(...result.recompositionTriggers);
    return result;
  }

  async observe(message: WILMessage): Promise<WGERuntimeOutput> {
    return this.execute(message, "observe");
  }

  async simulate(message: WILMessage): Promise<WGERuntimeOutput> {
    return this.execute(message, "simulate");
  }

  async commit(message: WILMessage): Promise<WGERuntimeOutput> {
    return this.execute(message, "commit");
  }

  // --- Execution cycle (WGE-1300.005) --------------------------------------

  private execute(message: WILMessage, expectedMode: string): WGERuntimeOutput {
    const steps: WILTraceStep[] = [];
    const diagnostics: WGERuntimeDiagnostic[] = [];
    let order = 1;
    const traceId = typeof message?.traceId === "string" ? message.traceId : `trace_invalid_${++this.sequence}`;
    const messageId = typeof message?.id === "string" ? message.id : `msg_invalid_${this.sequence}`;
    const actorId = message?.actor?.id ?? "actor_unknown";

    steps.push({
      order: order++,
      phase: "received",
      status: "passed",
      reason: `Runtime received ${expectedMode}-mode request`
    });

    const finish: FinishFn = (status, summary, extras = {}) => {
      steps.push({ order: order++, phase: "completed", status: status === "error" ? "failed" : "passed", reason: summary });
      const trace = createTrace({ id: `${traceId}_rt_${++this.sequence}`, messageId, actorId, steps, summary, createdAt: this.now() });
      this.traces.set(traceId, trace);
      const outcome = createOutcome({
        status,
        messageId,
        traceId,
        ...(extras.worldDiffId !== undefined ? { worldDiffId: extras.worldDiffId } : {}),
        ...(extras.snapshotId !== undefined ? { snapshotId: extras.snapshotId } : {}),
        ...(extras.candidateWorldId !== undefined ? { candidateWorldId: extras.candidateWorldId } : {}),
        ...(diagnostics.length > 0
          ? { diagnostics: diagnostics.map(({ traceId: _t, ...d }) => ({ code: d.code, severity: d.severity === "optimization" ? ("info" as const) : d.severity, message: d.message, reason: d.reason })) }
          : {})
      });
      const output: WGERuntimeOutput = { messageId, outcome, trace };
      if (extras.diff !== undefined) output.diff = extras.diff;
      if (extras.snapshot !== undefined) output.snapshot = extras.snapshot;
      if (extras.candidateWorldId !== undefined) output.candidateWorldId = extras.candidateWorldId;
      if (extras.metadata !== undefined) output.metadata = extras.metadata;
      if (diagnostics.length > 0) output.diagnostics = diagnostics;
      return output;
    };

    // Lifecycle gate (WGE-1300.002): no commits before ready.
    if (this.lifecycle !== "ready") {
      return finish("error", `Runtime is ${this.lifecycle}, not ready`);
    }
    this.lifecycle = "executing";
    try {
      // Validate envelope (WGE-1300.003 input rejection).
      const validation = validateWILMessage(message);
      if (!validation.valid) {
        for (const d of validation.diagnostics.filter((x) => x.severity === "error")) {
          diagnostics.push({ code: d.code, severity: "error", message: d.message, reason: d.reason ?? "envelope validation", traceId });
        }
        steps.push({ order: order++, phase: "validated", status: "failed", reason: "WIL envelope validation failed" });
        return finish("rejected", "Message rejected: invalid WIL envelope");
      }
      steps.push({ order: order++, phase: "validated", status: "passed", reason: "WIL envelope valid" });

      // Mode agreement between API entry point and message.
      if (message.mode !== expectedMode) {
        diagnostics.push({
          code: "RUNTIME_MODE_MISMATCH",
          severity: "error",
          message: `Message mode "${message.mode}" does not match the ${expectedMode}() entry point`,
          reason: "execution mode defines how a message affects Reality (WIL-001.005)",
          traceId
        });
        return finish("rejected", "Message rejected: execution mode mismatch");
      }

      // Resolve context: world identity must match.
      if (message.context.worldId !== this.world.id) {
        diagnostics.push({
          code: "RUNTIME_WORLD_MISMATCH",
          severity: "error",
          message: `Message targets world "${message.context.worldId}" but this runtime executes "${this.world.id}"`,
          reason: "a Context MUST identify the executing World (WIL-001.006)",
          traceId
        });
        return finish("rejected", "Message rejected: wrong World");
      }

      // Authorize (WGE-1300.005). Permission vocabulary follows the Codex
      // example set: world.observe is open on the reference World;
      // world.simulate and world.commit are enforced.
      const permissions = message.actor.authority.permissions;
      if (expectedMode === "simulate" && !permissions.includes("world.simulate")) {
        steps.push({ order: order++, phase: "authorized", status: "blocked", reason: `Actor lacks world.simulate` });
        diagnostics.push({
          code: "RUNTIME_UNAUTHORIZED",
          severity: "error",
          message: "Actor is not authorized to simulate this World",
          reason: 'authority.permissions must include "world.simulate"',
          traceId
        });
        return finish("rejected", "Simulation rejected: actor unauthorized");
      }
      if (expectedMode === "commit" && (!message.actor.authority.authenticated || !permissions.includes("world.commit"))) {
        steps.push({ order: order++, phase: "authorized", status: "blocked", reason: "Actor may not commit to Reality" });
        diagnostics.push({
          code: "RUNTIME_UNAUTHORIZED_COMMIT",
          severity: "error",
          message: "Actor is not authorized to commit changes to Reality",
          reason: 'an Actor MUST be authenticated and hold "world.commit" (WIL-001.002, WGE-1300.006)',
          traceId
        });
        return finish("rejected", "Commit rejected: actor unauthorized");
      }
      steps.push({ order: order++, phase: "authorized", status: "passed", reason: `Actor "${actorId}" authorized for ${expectedMode}` });

      switch (expectedMode) {
        case "observe":
          return this.executeObserve(message, steps, order, finish);
        case "simulate":
          return this.executeSimulate(message, diagnostics, steps, order, finish);
        case "commit":
          return this.executeCommit(message, diagnostics, steps, order, finish);
        default:
          return finish("rejected", `Unsupported execution mode ${expectedMode}`);
      }
    } catch (cause) {
      // Failure handling (WGE-1300.019): Reality is preserved because all
      // mutation happens on cloned state committed atomically at the end.
      diagnostics.push({
        code: "RUNTIME_UNEXPECTED_FAILURE",
        severity: "error",
        message: "Unexpected runtime failure",
        reason: cause instanceof Error ? cause.message : String(cause),
        traceId
      });
      return finish("error", "Runtime failure: Reality preserved, execution aborted");
    } finally {
      if (this.lifecycle === "executing") this.lifecycle = "ready";
    }
  }

  private executeObserve(
    message: WILMessage,
    steps: WILTraceStep[],
    order: number,
    finish: FinishFn
  ): WGERuntimeOutput {
    // Traversal execution (WGE-1300.010): observe-mode traverse intents run
    // compiled traversals; results inform without mutating.
    if (message.intent.type === "traverse" && message.target.kind === "traversal") {
      const traversalId = message.target.id ?? "";
      const candidateId = message.context.candidateWorldId;
      const world =
        candidateId !== undefined
          ? this.candidates.get(candidateId)?.world
          : this.world;
      const traversal = world?.traversals[traversalId];
      if (!world || !traversal) {
        steps.push({ order: order++, phase: "traversed", status: "failed", reason: `Traversal "${traversalId}" not found` });
        return finish("rejected", `Traversal rejected: "${traversalId}" does not exist`);
      }
      const result = executeTraversal({
        traversalId,
        worldId: world.id,
        snapshotId: candidateId !== undefined
          ? this.candidates.get(candidateId)?.record.currentCandidateSnapshotId ?? this.snapshot.id
          : this.snapshot.id,
        actorId: message.actor.id,
        context: message.context,
        executionMode: "observe",
        world,
        traversal,
        actor: message.actor
      });
      for (const step of result.traceSteps) steps.push({ ...step, order: order++ });
      return finish("success", `Traversal complete: collected ${result.collectedEntityIds.length} entit${result.collectedEntityIds.length === 1 ? "y" : "ies"}`, {
        snapshotId: this.snapshot.id,
        metadata: { traversal: result }
      });
    }

    // Observe never mutates: it reads the current snapshot-bound state.
    const targetId = message.target.id;
    if (targetId && message.target.kind === "entity" && !this.world.entities[targetId]) {
      steps.push({ order: order++, phase: "traversed", status: "failed", reason: `Entity "${targetId}" not found` });
      return finish("rejected", `Observation rejected: entity "${targetId}" does not exist`);
    }
    steps.push({
      order: order++,
      phase: "traversed",
      status: "passed",
      reason: targetId
        ? `Observed "${targetId}" at snapshot ${this.snapshot.id}`
        : `Observed world "${this.world.id}" at snapshot ${this.snapshot.id}`
    });
    return finish("success", "Observation complete: Reality unchanged", {
      snapshotId: this.snapshot.id
    });
  }

  private executeSimulate(
    message: WILMessage,
    diagnostics: WGERuntimeDiagnostic[],
    steps: WILTraceStep[],
    order: number,
    finish: FinishFn
  ): WGERuntimeOutput {
    const now = this.now();
    const traceId = message.traceId;

    // Locate or create the Candidate World (WGE-1300.013).
    let candidate: CandidateState;
    const requestedId = message.context.candidateWorldId;
    if (requestedId !== undefined) {
      const existing = this.candidates.get(requestedId);
      if (!existing || existing.record.status !== "active") {
        diagnostics.push({
          code: "RUNTIME_CANDIDATE_UNAVAILABLE",
          severity: "error",
          message: `Candidate World "${requestedId}" does not exist or is not active`,
          reason: "simulation requires an active Candidate World",
          traceId
        });
        return finish("rejected", "Simulation rejected: candidate world unavailable");
      }
      candidate = existing;
    } else {
      const id = `cw_${this.world.id}_${++this.sequence}`;
      candidate = {
        record: {
          id,
          baseWorldId: this.world.id,
          baseSnapshotId: this.snapshot.id,
          currentCandidateSnapshotId: this.snapshot.id,
          actorId: message.actor.id,
          ...(message.intent.objectiveId !== undefined ? { objectiveId: message.intent.objectiveId } : {}),
          createdFromMessageId: message.id,
          traceId,
          status: "active",
          createdAt: now
        },
        world: structuredClone(this.world), // isolation: a full branch of Reality
        diffs: []
      };
      this.candidates.set(id, candidate);
      steps.push({
        order: order++,
        phase: "traversed",
        status: "passed",
        reason: `Candidate World "${id}" branched from Reality snapshot ${this.snapshot.id}`
      });
    }

    // Apply proposed mutations to the candidate only.
    const interpretation = interpretIntent(message, candidate.world, now);
    if (interpretation.operations.length > 0) {
      const applied = applyDiffOperations(candidate.world, interpretation.operations, traceId, now);
      diagnostics.push(...applied.diagnostics);
      if (!applied.world) {
        return finish("rejected", "Simulation rejected: proposed changes are invalid", {
          candidateWorldId: candidate.record.id
        });
      }

      // Laws still apply inside Candidate Worlds. The evaluation context
      // carries the candidate's identity so laws can distinguish simulation
      // space from Reality (WGE-1300.006 mode separation).
      const lawResult = evaluateLaws({
        world: applied.world,
        affectedEntityIds: affectedEntityIds(interpretation.operations),
        actor: message.actor,
        context: { ...message.context, candidateWorldId: candidate.record.id },
        traceId,
        startOrder: order
      });
      steps.push(...lawResult.traceSteps);
      order += lawResult.traceSteps.length;
      if (lawResult.diagnostics) diagnostics.push(...lawResult.diagnostics);
      if (lawResult.status === "rejected") {
        return finish("rejected", "Simulation rejected by World Laws", {
          candidateWorldId: candidate.record.id
        });
      }

      candidate.world = applied.world;
      const candidateSnapshot = createSnapshot({
        world: candidate.world,
        id: `snap_${candidate.record.id}_${++this.sequence}`,
        parentSnapshotId: candidate.record.currentCandidateSnapshotId,
        createdAt: now,
        metadata: { candidate: true }
      });
      const diff = createDiff({
        id: `diff_${candidate.record.id}_${this.sequence}`,
        worldId: this.world.id,
        fromSnapshotId: candidate.record.currentCandidateSnapshotId,
        toSnapshotId: candidateSnapshot.id,
        operations: interpretation.operations,
        traceId,
        createdAt: now,
        metadata: { candidateWorldId: candidate.record.id }
      });
      candidate.diffs.push(diff);
      candidate.record.currentCandidateSnapshotId = candidateSnapshot.id;
      steps.push({
        order: order++,
        phase: "diff_generated",
        status: "passed",
        reason: `Candidate diff ${diff.id} applied; candidate snapshot advanced to ${candidateSnapshot.id}`
      });

      // Candidate World Physics (WGE-1400.016): simulated changes ripple
      // inside the candidate only.
      const originId = affectedEntityIds(interpretation.operations)[0];
      const physics = originId
        ? this.ripple(candidate.world, candidateSnapshot.id, originId, message, true)
        : undefined;
      if (physics) {
        steps.push({
          order: order++,
          phase: "physics_applied",
          status: "passed",
          reason: `Candidate physics affected ${physics.affectedEntities.length} entit${physics.affectedEntities.length === 1 ? "y" : "ies"} in isolation`
        });
      }

      return finish("simulation", "Simulation complete: Candidate World advanced, Reality untouched", {
        candidateWorldId: candidate.record.id,
        worldDiffId: diff.id,
        diff,
        snapshotId: candidateSnapshot.id,
        ...(physics ? { metadata: { physics } } : {})
      });
    }

    return finish("simulation", "Simulation complete: Candidate World ready", {
      candidateWorldId: candidate.record.id
    });
  }

  private executeCommit(
    message: WILMessage,
    diagnostics: WGERuntimeDiagnostic[],
    steps: WILTraceStep[],
    order: number,
    finish: FinishFn
  ): WGERuntimeOutput {
    const now = this.now();
    const traceId = message.traceId;

    // Conflict detection (WGE-1300.017): never silently overwrite Reality.
    const expected = message.context.snapshotId;
    if (expected !== undefined && expected !== this.snapshot.id) {
      diagnostics.push({
        code: "RUNTIME_SNAPSHOT_CONFLICT",
        severity: "error",
        message: `Expected snapshot "${expected}" but Reality is at "${this.snapshot.id}"`,
        reason: "the base snapshot is stale (WGE-1300.017)",
        suggestedResolution: "re-read Reality and rebase the proposal onto the current snapshot",
        traceId
      });
      return finish("conflict", "Commit refused: Reality moved since the proposal was made");
    }

    // Transaction (WGE-1300.007): open → validate → laws → diff → commit/rollback.
    const transaction: WGETransaction = {
      id: `txn_${this.world.id}_${++this.sequence}`,
      worldId: this.world.id,
      actorId: message.actor.id,
      messageId: message.id,
      traceId,
      baseSnapshotId: this.snapshot.id,
      mode: "commit",
      status: "opened",
      createdAt: now
    };
    this.transactions.set(transaction.id, transaction);

    const fail = (status: WGETransaction["status"], outcome: WILOutcomeStatus, summary: string): WGERuntimeOutput => {
      transaction.status = status;
      transaction.completedAt = this.now();
      return finish(outcome, summary);
    };

    // Candidate World merge path (WGE-1300.014).
    if (message.target.kind === "candidate_world" && message.target.id) {
      return this.mergeCandidate(message, transaction, diagnostics, steps, order, finish);
    }

    const interpretation = interpretIntent(message, this.world, now);
    diagnostics.push(...interpretation.diagnostics);
    if (interpretation.operations.length === 0) {
      return fail("rejected", "rejected", "Commit rejected: intent produced no valid mutations");
    }
    transaction.status = "validated";

    // Tentative application on a clone — Reality is untouched until commit.
    const applied = applyDiffOperations(this.world, interpretation.operations, traceId, now);
    diagnostics.push(...applied.diagnostics);
    if (!applied.world) {
      return fail("rejected", "rejected", "Commit rejected: diff validation failed");
    }

    // Law evaluation on the tentative state (WGE-1300.008).
    const lawResult = evaluateLaws({
      world: applied.world,
      affectedEntityIds: affectedEntityIds(interpretation.operations),
      actor: message.actor,
      context: message.context,
      traceId,
      startOrder: order
    });
    steps.push(...lawResult.traceSteps);
    order += lawResult.traceSteps.length;
    if (lawResult.diagnostics) diagnostics.push(...lawResult.diagnostics);
    if (lawResult.status === "rejected") {
      return fail("rejected", "rejected", "Commit rejected by World Laws — Reality preserved");
    }
    if (lawResult.status === "deferred") {
      return fail("rejected", "deferred", "Commit deferred by World Laws");
    }
    if (lawResult.status === "requires_clarification") {
      return fail("rejected", "rejected", "Commit requires clarification before proceeding");
    }

    // Kernel validation gate: an invalid World never becomes Reality.
    const kernelResult = validateWorld(applied.world);
    if (kernelResult.outcome === "invalid") {
      for (const d of kernelResult.diagnostics) {
        diagnostics.push({ code: d.code, severity: "error", message: d.message, reason: d.reason ?? "kernel validation", traceId });
      }
      return fail("rolled_back", "rejected", "Commit rolled back: resulting World fails kernel validation");
    }

    // Diff + Snapshot commit (WGE-1300.011, WGE-1300.012) — atomic.
    const newSnapshot = createSnapshot({
      world: applied.world,
      id: `snap_${this.world.id}_${++this.sequence}`,
      parentSnapshotId: this.snapshot.id,
      createdAt: now
    });
    const diff = createDiff({
      id: `diff_${this.world.id}_${this.sequence}`,
      worldId: this.world.id,
      fromSnapshotId: this.snapshot.id,
      toSnapshotId: newSnapshot.id,
      operations: interpretation.operations,
      traceId,
      createdAt: now
    });
    transaction.status = "diff_generated";
    transaction.proposedDiff = diff;
    steps.push({ order: order++, phase: "diff_generated", status: "passed", reason: `Diff ${diff.id} generated from ${this.snapshot.id}` });

    this.world = applied.world;
    this.snapshot = newSnapshot;
    this.snapshots.set(newSnapshot.id, newSnapshot);
    this.committedDiffs.set(diff.id, diff);
    transaction.status = "committed";
    transaction.resultingSnapshotId = newSnapshot.id;
    transaction.completedAt = this.now();
    steps.push({ order: order++, phase: "committed", status: "passed", reason: `Reality advanced to snapshot ${newSnapshot.id} via transaction ${transaction.id}` });

    // Apply Physics (WGE-1300.005): the committed change ripples through
    // the graph and may request recomposition (WGE-1400.019).
    const originId = affectedEntityIds(interpretation.operations)[0];
    const physics = originId
      ? this.ripple(this.world, newSnapshot.id, originId, message, false)
      : undefined;
    if (physics) {
      steps.push({
        order: order++,
        phase: "physics_applied",
        status: "passed",
        reason: `Physics affected ${physics.affectedEntities.length} entit${physics.affectedEntities.length === 1 ? "y" : "ies"}, ${physics.recompositionTriggers.length} recomposition trigger(s)`
      });
    }

    return finish("success", "Commit complete: Reality advanced", {
      worldDiffId: diff.id,
      snapshotId: newSnapshot.id,
      diff,
      snapshot: newSnapshot,
      ...(physics ? { metadata: { physics } } : {})
    });
  }

  /** Candidate World merge (WGE-1300.014) — explicit Commit-mode only. */
  private mergeCandidate(
    message: WILMessage,
    transaction: WGETransaction,
    diagnostics: WGERuntimeDiagnostic[],
    steps: WILTraceStep[],
    order: number,
    finish: FinishFn
  ): WGERuntimeOutput {
    const now = this.now();
    const traceId = message.traceId;
    const candidateId = message.target.id ?? "";
    const candidate = this.candidates.get(candidateId);

    if (!candidate || candidate.record.status !== "active") {
      transaction.status = "rejected";
      diagnostics.push({
        code: "RUNTIME_MERGE_CANDIDATE_UNAVAILABLE",
        severity: "error",
        message: `Candidate World "${candidateId}" does not exist or is not active`,
        reason: "merge requires an existing, active Candidate World (WGE-1300.014)",
        traceId
      });
      return finish("rejected", "Merge rejected: candidate world unavailable");
    }
    if (candidate.record.baseSnapshotId !== this.snapshot.id) {
      transaction.status = "rejected";
      diagnostics.push({
        code: "RUNTIME_MERGE_CONFLICT",
        severity: "error",
        message: `Candidate World "${candidateId}" branched from "${candidate.record.baseSnapshotId}" but Reality is at "${this.snapshot.id}"`,
        reason: "Reality diverged since the candidate branched (WGE-1300.017); rebase is not yet supported in the reference runtime",
        suggestedResolution: "re-simulate against the current snapshot",
        traceId
      });
      return finish("conflict", "Merge refused: Reality diverged since the candidate branched");
    }

    // The candidate's cumulative operations replay onto Reality.
    const operations = candidate.diffs.flatMap((d) => d.operations);
    const applied = applyDiffOperations(this.world, operations, traceId, now);
    diagnostics.push(...applied.diagnostics);
    if (!applied.world) {
      transaction.status = "rejected";
      return finish("rejected", "Merge rejected: candidate diff no longer applies");
    }
    const lawResult = evaluateLaws({
      world: applied.world,
      affectedEntityIds: affectedEntityIds(operations),
      actor: message.actor,
      context: message.context,
      traceId,
      startOrder: order
    });
    steps.push(...lawResult.traceSteps);
    order += lawResult.traceSteps.length;
    if (lawResult.diagnostics) diagnostics.push(...lawResult.diagnostics);
    if (lawResult.status === "rejected") {
      transaction.status = "rejected";
      return finish("rejected", "Merge rejected by World Laws");
    }
    const kernelResult = validateWorld(applied.world);
    if (kernelResult.outcome === "invalid") {
      transaction.status = "rolled_back";
      return finish("rejected", "Merge rolled back: resulting World fails kernel validation");
    }

    const newSnapshot = createSnapshot({
      world: applied.world,
      id: `snap_${this.world.id}_${++this.sequence}`,
      parentSnapshotId: this.snapshot.id,
      createdAt: now,
      metadata: { mergedFromCandidate: candidateId }
    });
    const diff = createDiff({
      id: `diff_${this.world.id}_${this.sequence}`,
      worldId: this.world.id,
      fromSnapshotId: this.snapshot.id,
      toSnapshotId: newSnapshot.id,
      operations,
      traceId,
      createdAt: now,
      metadata: { mergedFromCandidate: candidateId }
    });
    this.world = applied.world;
    this.snapshot = newSnapshot;
    this.snapshots.set(newSnapshot.id, newSnapshot);
    this.committedDiffs.set(diff.id, diff);
    candidate.record.status = "merged";
    transaction.status = "committed";
    transaction.proposedDiff = diff;
    transaction.resultingSnapshotId = newSnapshot.id;
    transaction.completedAt = this.now();
    steps.push({ order: order++, phase: "committed", status: "passed", reason: `Candidate World ${candidateId} merged into Reality as snapshot ${newSnapshot.id}` });

    return finish("success", "Merge complete: Candidate World became Reality through explicit Commit", {
      worldDiffId: diff.id,
      snapshotId: newSnapshot.id,
      diff,
      snapshot: newSnapshot,
      candidateWorldId: candidateId
    });
  }

  /** Discard a Candidate World (WGE-1300.013 operations). */
  discardCandidateWorld(candidateWorldId: string): boolean {
    const candidate = this.candidates.get(candidateWorldId);
    if (!candidate || candidate.record.status !== "active") return false;
    candidate.record.status = "discarded";
    return true;
  }

  /** Compare a Candidate World to Reality (REF-1900.015). */
  compareCandidateToReality(candidateWorldId: string):
    | { equivalent: boolean; candidateSnapshotId: string; realitySnapshotId: string; operationCount: number }
    | undefined {
    const candidate = this.candidates.get(candidateWorldId);
    if (!candidate) return undefined;
    const candidateSnapshot = createSnapshot({
      world: candidate.world,
      id: `snap_compare_${++this.sequence}`,
      createdAt: this.now()
    });
    return {
      equivalent:
        candidateSnapshot.entityIndexHash === this.snapshot.entityIndexHash &&
        candidateSnapshot.relationshipIndexHash === this.snapshot.relationshipIndexHash &&
        candidateSnapshot.lawIndexHash === this.snapshot.lawIndexHash,
      candidateSnapshotId: candidate.record.currentCandidateSnapshotId,
      realitySnapshotId: this.snapshot.id,
      operationCount: candidate.diffs.reduce((n, d) => n + d.operations.length, 0)
    };
  }
}
