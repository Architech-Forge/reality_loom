/**
 * Compiler-shared types.
 *
 * Volume 1200 — WGE-1200.003 (Source Intake), WGE-1200.006 (Semantic Model),
 * WGE-1200.011 (Traversal Planning), WGE-1200.012 (Physics Preparation),
 * WGE-1200.017 (Compiler Diagnostics). These live in @roc/types so WDL,
 * compiler, executable, and runtime packages can share them without
 * violating the build-order import rule (REF-1900.003).
 */
import type { WGESelector, WGETraversalRule } from "./wge.js";

/** WGE-1200.003 — Source Intake. */
export interface WGESourceUnit {
  id: string;
  format: "wdl" | "wil_json" | "studio_json" | "application";
  content: string | Record<string, unknown>;
  uri?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

/** Source location reference for diagnostics and semantic operations. */
export interface WGESourceRef {
  sourceUnitId: string;
  path?: string;
  line?: number;
  column?: number;
}

/** Source span for compiled-artifact traceability. */
export interface WGESourceRange {
  sourceUnitId: string;
  path?: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Constraint lowering (canonical, approved 2026-07-06): a WDL constraint
 * compiles into an ordinary Law whose normal successful behavior is to
 * reject — never a kernel primitive. This metadata shape lets tools
 * distinguish compiled constraints while the kernel stays pure.
 */
export interface WGECompiledConstraintLawMetadata {
  source: "wdl";
  constraint: true;

  wdlDeclarationId: string;
  wdlSourceRange?: WGESourceRange;

  severity: "error" | "warning";

  compiledFrom: "constraint";
}

export type WGEObjectiveStatus =
  | "declared"
  | "active"
  | "satisfied"
  | "blocked"
  | "expired";

/**
 * Objective lowering (canonical, approved 2026-07-06): a WDL objective
 * compiles into an Entity of type "wge.objective", contained by the root,
 * carrying this state/config Aspect (kind "wge.objective_state"). An
 * objective is not a kernel primitive — it exerts relevance, traversal,
 * selection, or planning pressure through Aspects, Relationships, and Laws.
 */
export interface WGEObjectiveAspect {
  kind: "wge.objective_state";

  objectiveKind: string;

  /** Human readable label (required by WDL-001.008). */
  label: string;

  entry: {
    selector: WGESelector;
  };

  traversal?: {
    traversalId?: string;
    strategy: string;
    maxDepth?: number;
  };

  priority?: number;

  status: WGEObjectiveStatus;

  source: {
    language: "wdl";
    declarationId: string;
    sourceRange?: WGESourceRange;
  };
}

/** Canonical entity type for lowered objectives. */
export const WGE_OBJECTIVE_ENTITY_TYPE = "wge.objective";

/** Canonical aspect kind for lowered objective state. */
export const WGE_OBJECTIVE_ASPECT_KIND = "wge.objective_state";

/** WGE-1200.006 — Semantic Model. */
export interface WGESemanticOperation {
  id: string;

  kind:
    | "world.declare"
    | "entity.declare"
    | "aspect.attach"
    | "relationship.declare"
    | "law.declare"
    | "traversal.declare"
    | "capability.declare"
    | "constraint.declare"
    | "metadata.attach";

  sourceRef?: WGESourceRef;
  payload: Record<string, unknown>;
}

/** WGE-1200.017 — Compiler Diagnostics. Diagnostics should teach, not merely reject. */
export interface WGECompilerDiagnostic {
  code: string;

  severity: "error" | "warning" | "suggestion" | "optimization";

  message: string;

  reason: string;

  sourceRef?: WGESourceRef;

  affectedIds?: string[];

  suggestedFix?: string;

  documentationUrl?: string;
}

/** WGE-1200.011 — Traversal Planning. Prepares execution; never executes. */
export interface WGETraversalPlan {
  traversalId: string;
  entrySelector: WGESelector;
  orderedRules: WGETraversalRule[];
  requiredLawIds: string[];
  requiredConstraintIds: string[];
  expectedOutputKind: string;
  indexesRequired: string[];
}

/** WGE-1200.012 — Physics Preparation. Prepares physics; never applies it. */
export interface WGEPhysicsPlan {
  worldId: string;
  propagationIndexes: string[];
  constraintMaps: string[];
  relevanceFieldSeeds: string[];
  confidencePaths: string[];
  temporalDecaySets: string[];
}

/** WGE-1200.019 — Compiler Profiles. Profiles never change World meaning. */
export type WGECompilerProfile = "development" | "production" | "ai_authoring" | "embedded";

/**
 * WGE-1200.018 — Compiler Plugins (contract; plugin execution arrives with
 * the tooling phase). Plugins MUST NOT override Kernel invariants, suppress
 * fatal errors, or produce nondeterministic output.
 */
export type WGECompilerHook = (context: Record<string, unknown>) => Promise<void> | void;

export interface WGECompilerPlugin {
  id: string;
  version: string;

  hooks: {
    beforeValidation?: WGECompilerHook;
    afterValidation?: WGECompilerHook;
    beforeWirGeneration?: WGECompilerHook;
    afterWirGeneration?: WGECompilerHook;
    beforeExecutableGeneration?: WGECompilerHook;
  };

  metadata?: Record<string, unknown>;
}

/**
 * WGE-1200.016 — Incremental Compilation input (contract; the reference
 * compiler falls back to full compilation per the safety rule).
 */
export interface WGEIncrementalCompileInput {
  previousExecutableWorldId: string;
  previousSnapshotId?: string;
  changedSourceUnits: WGESourceUnit[];
  changedSemanticOperations?: WGESemanticOperation[];
}
