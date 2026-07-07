/**
 * SDK clients (SDK-1800.011 – SDK-1800.015).
 *
 * The client talks to Reality through WIL. Clients never mutate runtime
 * stores directly, never commit without WIL, and never treat simulation as
 * Reality.
 */
import type {
  SLIProjectionInput,
  SLIProjectionOutput,
  SLIRecompositionInput,
  WGECompilerProfile,
  WGESnapshot,
  WGESourceUnit,
  WILActor,
  WILContext,
  WILMessage,
  WILTrace,
  WGERuntimeOutput,
  WGEValidationResult
} from "@roc/types";
import { compileWorld, type WGECompileResult } from "@wge/compiler";
import type { WGERuntime } from "@wge/runtime";
import { buildProjection, recompose } from "@sli/runtime";
import { createWILMessage } from "@wge/wil";
import { ROCSDKError } from "./errors.js";

/** SDK-1800.011 — Compiler SDK. Compilation prepares execution. */
export interface CompilerClientInput {
  sources: WGESourceUnit[];
  profile?: WGECompilerProfile;
  now?: string;
}

/** SDK-1800.011 — spec-named client interface. */
export interface WGECompilerClient {
  compile(input: CompilerClientInput): Promise<WGECompileResult>;
  compileIncremental(input: CompilerClientInput): Promise<WGECompileResult>;
  validate(input: CompilerClientInput): Promise<WGEValidationResult>;
}

/** SDK-1800.012 — spec-named client interface. */
export interface WGERuntimeClient {
  observe(message: WILMessage): Promise<WGERuntimeOutput>;
  simulate(message: WILMessage): Promise<WGERuntimeOutput>;
  commit(message: WILMessage): Promise<WGERuntimeOutput>;
  getSnapshot(worldId: string): Promise<WGESnapshot>;
  getTrace(traceId: string): Promise<WILTrace>;
  replay(): Promise<never>;
}

/** SDK-1800.013 — spec-named client interface. */
export interface SLIProjectionClient {
  project(input: SLIProjectionInput): Promise<SLIProjectionOutput>;
  recompose(input: SLIRecompositionInput): Promise<SLIProjectionOutput>;
  explainProjection(projectionId: string): Promise<Record<string, string>>;
}

/** SDK-1800.015 — Candidate comparison output (spec: WGECandidateComparison). */
export interface WGECandidateComparison {
  equivalent: boolean;
  candidateSnapshotId: string;
  realitySnapshotId: string;
  operationCount: number;
}

/** SDK-1800.015 — spec-named client interface. */
export interface WGECandidateWorldClient {
  createCandidateWorld(message: WILMessage): Promise<WGERuntimeOutput>;
  modifyCandidateWorld(message: WILMessage): Promise<WGERuntimeOutput>;
  compareCandidateToReality(candidateWorldId: string): WGECandidateComparison | undefined;
  prepareMerge(candidateWorldId: string, actor: WILActor, context: WILContext): WILMessage;
  discard(candidateWorldId: string): boolean;
}

export function createCompilerClient(): WGECompilerClient {
  const compileOne = async (input: CompilerClientInput): Promise<WGECompileResult> => {
    const source = input.sources[0];
    if (!source) {
      throw new ROCSDKError({
        code: "SDK_COMPILE_NO_SOURCE",
        message: "compile requires at least one source unit",
        reason: "source intake is the first compiler stage (WGE-1200.003)"
      });
    }
    return compileWorld({
      source,
      ...(input.profile !== undefined ? { profile: input.profile } : {}),
      ...(input.now !== undefined ? { now: input.now } : {})
    });
  };

  return {
    compile: compileOne,

    /**
     * Incremental compilation falls back to full compilation: if affected
     * regions cannot be determined safely, correctness beats speed
     * (WGE-1200.016 safety rule).
     */
    compileIncremental: compileOne,

    async validate(input: CompilerClientInput): Promise<WGEValidationResult> {
      const result = await compileOne(input);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      return {
        outcome: errors.length > 0 ? "invalid" : result.diagnostics.length > 0 ? "warning" : "valid",
        diagnostics: result.diagnostics.map((d) => ({
          code: d.code,
          severity: d.severity === "optimization" || d.severity === "suggestion" ? "suggestion" : d.severity,
          message: d.message,
          reason: d.reason,
          ...(d.affectedIds !== undefined ? { affectedIds: d.affectedIds } : {}),
          ...(d.suggestedFix !== undefined ? { suggestedResolution: d.suggestedFix } : {})
        }))
      };
    }
  };
}

/** SDK-1800.012 — Runtime Client. */
export function createRuntimeClient(runtime: WGERuntime): WGERuntimeClient {
  return {
    observe: (message: WILMessage): Promise<WGERuntimeOutput> => runtime.observe(message),
    simulate: (message: WILMessage): Promise<WGERuntimeOutput> => runtime.simulate(message),
    commit: (message: WILMessage): Promise<WGERuntimeOutput> => runtime.commit(message),

    async getSnapshot(worldId: string): Promise<WGESnapshot> {
      const snapshot = runtime.currentSnapshot();
      if (snapshot.worldId !== worldId) {
        throw new ROCSDKError({
          code: "SDK_WORLD_MISMATCH",
          message: `runtime executes "${snapshot.worldId}", not "${worldId}"`,
          reason: "a runtime client is bound to one World"
        });
      }
      return snapshot;
    },

    async getTrace(traceId: string): Promise<WILTrace> {
      const trace = runtime.getTrace(traceId);
      if (!trace) {
        throw new ROCSDKError({
          code: "SDK_TRACE_NOT_FOUND",
          message: `no trace stored for "${traceId}"`,
          reason: "traces exist only for executed interactions",
          recoverable: true
        });
      }
      return trace;
    },

    async replay(): Promise<never> {
      throw new ROCSDKError({
        code: "SDK_REPLAY_PENDING",
        message: "replay arrives with the compliance/tooling phase (WGE-1300.016)",
        reason: "the minimal runtime implements observe/simulate/commit (REF-1900.011)",
        recoverable: true,
        suggestedResolution: "reconstruct state by reading committed diffs until replay lands"
      });
    }
  };
}

/** SDK-1800.013 — Projection Client. Projection is experience, not Reality. */
export function createProjectionClient(): SLIProjectionClient {
  const outputs = new Map<string, SLIProjectionOutput>();
  return {
    async project(input: SLIProjectionInput): Promise<SLIProjectionOutput> {
      const output = buildProjection(input).output;
      outputs.set(output.id, output);
      return output;
    },
    async recompose(input: SLIRecompositionInput): Promise<SLIProjectionOutput> {
      const output = recompose(input);
      outputs.set(output.id, output);
      return output;
    },
    /** The devtools "why": every composition reason, keyed by entity. */
    async explainProjection(projectionId: string): Promise<Record<string, string>> {
      const output = outputs.get(projectionId);
      if (!output) {
        throw new ROCSDKError({
          code: "SDK_PROJECTION_NOT_FOUND",
          message: `no projection stored for "${projectionId}"`,
          reason: "explanations exist only for projections this client produced",
          recoverable: true
        });
      }
      return Object.fromEntries(output.composition.entities.map((e) => [e.entityId, e.reason]));
    }
  };
}

/** SDK-1800.015 — Candidate World SDK. Possible Worlds remain possible until committed. */
export function createCandidateClient(runtime: WGERuntime): WGECandidateWorldClient {
  return {
    createCandidateWorld: (message: WILMessage): Promise<WGERuntimeOutput> =>
      runtime.simulate(message),

    modifyCandidateWorld: (message: WILMessage): Promise<WGERuntimeOutput> => {
      if (!message.context.candidateWorldId) {
        throw new ROCSDKError({
          code: "SDK_CANDIDATE_ID_REQUIRED",
          message: "modifying a candidate requires context.candidateWorldId",
          reason: "candidate isolation depends on explicit targeting (WGE-1300.013)"
        });
      }
      return runtime.simulate(message);
    },

    compareCandidateToReality: (candidateWorldId: string) =>
      runtime.compareCandidateToReality(candidateWorldId),

    /** Prepares the explicit Commit-mode merge message (never auto-merges). */
    prepareMerge(candidateWorldId: string, actor: WILActor, context: WILContext): WILMessage {
      return createWILMessage({
        actor,
        intent: {
          type: "commit",
          reason: `merge Candidate World ${candidateWorldId} into Reality`
        },
        target: { kind: "candidate_world", id: candidateWorldId },
        context,
        mode: "commit"
      });
    },

    discard: (candidateWorldId: string): boolean => runtime.discardCandidateWorld(candidateWorldId)
  };
}
