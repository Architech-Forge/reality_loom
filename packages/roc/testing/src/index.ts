/**
 * @roc/testing — Runtime and Projection test harnesses.
 *
 * SDK-1800.017 – SDK-1800.019. Build order position 14 (REF-1900.003).
 * Tests must expose causality, not just final state — and a projected
 * experience must be testable without rendering pixels.
 */
import type {
  ROCDiagnostic,
  SLIProjectionInput,
  SLIProjectionOutput,
  SLIRecompositionInput,
  WGESnapshot,
  WGESourceUnit,
  WILMessage,
  WILTrace,
  WGERuntimeOutput
} from "@roc/types";
import { compileWorld } from "@wge/compiler";
import type { WGEExecutableWorld } from "@wge/executable";
import { WGERuntime } from "@wge/runtime";
import { buildProjection, recompose } from "@sli/runtime";

/** SDK-1800.018 — Runtime Test Harness. */
export class RuntimeTestHarness {
  private constructor(private readonly runtime: WGERuntime) {}

  static fromExecutable(executable: WGEExecutableWorld, now?: () => string): RuntimeTestHarness {
    return new RuntimeTestHarness(new WGERuntime(executable, now ? { now } : {}));
  }

  /** Compiles a structured WDL document and loads it. */
  static async fromWorldDocument(
    document: Record<string, unknown>,
    options: { now?: string } = {}
  ): Promise<RuntimeTestHarness> {
    const source: WGESourceUnit = { id: "harness", format: "wdl", content: document };
    const result = await compileWorld({
      source,
      ...(options.now !== undefined ? { now: options.now } : {})
    });
    if (!result.executableWorld) {
      throw new Error(
        `harness world failed to compile: ${result.diagnostics.map((d) => d.message).join("; ")}`
      );
    }
    return new RuntimeTestHarness(
      new WGERuntime(result.executableWorld, options.now !== undefined ? { now: () => options.now as string } : {})
    );
  }

  get wgeRuntime(): WGERuntime {
    return this.runtime;
  }

  /** Routes by the message's own execution mode. */
  async send(message: WILMessage): Promise<WGERuntimeOutput> {
    switch (message.mode) {
      case "observe":
        return this.runtime.observe(message);
      case "simulate":
        return this.runtime.simulate(message);
      case "commit":
        return this.runtime.commit(message);
      default:
        throw new Error(`harness cannot route mode ${message.mode}`);
    }
  }

  async currentSnapshot(): Promise<WGESnapshot> {
    return this.runtime.currentSnapshot();
  }

  async trace(traceId: string): Promise<WILTrace> {
    const trace = this.runtime.getTrace(traceId);
    if (!trace) throw new Error(`no trace stored for "${traceId}"`);
    return trace;
  }

  /** Asserts the Reality snapshot is identical before and after fn. */
  async expectNoRealityMutation(fn: () => Promise<void>): Promise<void> {
    const before = this.runtime.currentSnapshot();
    await fn();
    const after = this.runtime.currentSnapshot();
    if (before.id !== after.id || before.entityIndexHash !== after.entityIndexHash) {
      throw new Error(
        `Reality mutated: snapshot ${before.id} → ${after.id}. This violates mode isolation (WGE-1300.006).`
      );
    }
  }

  /** Asserts fn advances Reality; returns the new committed snapshot. */
  async expectCommittedSnapshot(fn: () => Promise<void>): Promise<WGESnapshot> {
    const before = this.runtime.currentSnapshot();
    await fn();
    const after = this.runtime.currentSnapshot();
    if (before.id === after.id) {
      throw new Error("expected a committed Snapshot but Reality did not advance");
    }
    if (after.parentSnapshotId !== before.id) {
      throw new Error(
        `snapshot lineage broken: ${after.id} does not descend from ${before.id}`
      );
    }
    return after;
  }
}

/** SDK-1800.019 — Projection Test Harness. */
export class ProjectionTestHarness {
  private readonly outputs = new Map<string, SLIProjectionOutput>();

  async project(input: SLIProjectionInput): Promise<SLIProjectionOutput> {
    const output = buildProjection(input).output;
    this.outputs.set(output.id, output);
    return output;
  }

  async recompose(input: SLIRecompositionInput): Promise<SLIProjectionOutput> {
    const output = recompose(input);
    this.outputs.set(output.id, output);
    return output;
  }

  expectSinglePrimary(output: SLIProjectionOutput): void {
    const primaries = output.composition.entities.filter((e) => e.role === "primary");
    if (primaries.length !== 1) {
      throw new Error(
        `expected exactly one primary entity, found ${primaries.length}: [${primaries
          .map((p) => p.entityId)
          .join(", ")}] (SLI-1500.005 invariant)`
      );
    }
  }

  expectAccessible(output: SLIProjectionOutput): void {
    const a11y = output.accessibilityPlan;
    if (a11y.readingOrder.length === 0) throw new Error("accessibility reading order is empty");
    const primary = output.composition.primaryEntityId;
    if (!a11y.readingOrder.some((n) => n.entityId === primary && n.reachable)) {
      throw new Error(`primary "${primary}" is not reachable in the reading order (SLI-1500.011)`);
    }
    if (a11y.interactionTargets.some((t) => t.minimumSizePx < 44)) {
      throw new Error("interaction targets below minimum size");
    }
  }

  expectEntityVisible(output: SLIProjectionOutput, entityId: string): void {
    const entity = output.composition.entities.find((e) => e.entityId === entityId);
    if (!entity || entity.role === "hidden") {
      throw new Error(`expected "${entityId}" to be visible, got role ${entity?.role ?? "absent"}`);
    }
  }

  expectEntityHidden(output: SLIProjectionOutput, entityId: string): void {
    const entity = output.composition.entities.find((e) => e.entityId === entityId);
    if (entity && entity.role !== "hidden") {
      throw new Error(`expected "${entityId}" to be hidden, got role ${entity.role}`);
    }
  }

  /** Every composed entity's reason, keyed by id — the devtools "why". */
  explain(projectionId: string): Record<string, string> {
    const output = this.outputs.get(projectionId);
    if (!output) throw new Error(`no projection stored for "${projectionId}"`);
    return Object.fromEntries(output.composition.entities.map((e) => [e.entityId, e.reason]));
  }
}

export { SemanticAssertions } from "./assertions.js";

/** SDK-1800.018 — spec-named harness interface (implemented by RuntimeTestHarness). */
export interface WGERuntimeTestHarness {
  send(message: WILMessage): Promise<WGERuntimeOutput>;
  currentSnapshot(): Promise<WGESnapshot>;
  trace(traceId: string): Promise<WILTrace>;
  expectNoRealityMutation(fn: () => Promise<void>): Promise<void>;
  expectCommittedSnapshot(fn: () => Promise<void>): Promise<WGESnapshot>;
}

/** SDK-1800.019 — spec-named harness interface (implemented by ProjectionTestHarness). */
export interface SLIProjectionTestHarness {
  project(input: SLIProjectionInput): Promise<SLIProjectionOutput>;
  recompose(input: SLIRecompositionInput): Promise<SLIProjectionOutput>;
  expectSinglePrimary(output: SLIProjectionOutput): void;
  expectAccessible(output: SLIProjectionOutput): void;
  expectEntityVisible(output: SLIProjectionOutput, entityId: string): void;
  expectEntityHidden(output: SLIProjectionOutput, entityId: string): void;
}

/** TEST-2500.004 — Semantic Assertion record (data form of the assertions above). */
export interface ROCSemanticAssertion {
  id: string;

  description: string;

  target:
    | "wil_message"
    | "world"
    | "graph"
    | "compiler_output"
    | "runtime_output"
    | "snapshot"
    | "diff"
    | "trace"
    | "candidate_world"
    | "projection"
    | "ai_result"
    | "storage_state";

  assertionType:
    | "exists"
    | "equals"
    | "contains"
    | "not_contains"
    | "preserves_identity"
    | "does_not_mutate"
    | "emits_trace"
    | "respects_permission"
    | "is_deterministic"
    | "is_redacted"
    | "has_single_primary";

  expected?: unknown;
}

/** TEST-2500.003 — Golden Fixture record. Executable specification examples. */
export interface ROCGoldenFixture<TInput = unknown, TExpected = unknown> {
  id: string;

  specVersion: string;

  description: string;

  input: TInput;

  expected: TExpected;

  semanticAssertions: ROCSemanticAssertion[];

  metadata?: Record<string, unknown>;
}

/** TEST-2500.002 — Test Matrix entry. A requirement without a test is not enforceable. */
export interface ROCTestMatrixEntry {
  id: string;

  area:
    | "wil"
    | "wdl"
    | "kernel"
    | "graph"
    | "compiler"
    | "runtime"
    | "physics"
    | "sli"
    | "design_system"
    | "application"
    | "sdk"
    | "storage"
    | "security"
    | "ai"
    | "devtools"
    | "reference";

  requirementIds: string[];

  testIds: string[];

  required: boolean;

  status: "covered" | "partial" | "missing" | "blocked";
}

/** TEST-2500.022 — Failure Capture artifact: explain what broke, not merely that it broke. */
export interface ROCTestFailureArtifact {
  testId: string;

  area: string;

  message: string;

  inputRefs: string[];

  outputRefs: string[];

  traceIds: string[];

  snapshotIds?: string[];

  diffIds?: string[];

  projectionIds?: string[];

  diagnostics: ROCDiagnostic[];

  createdAt: string;
}
