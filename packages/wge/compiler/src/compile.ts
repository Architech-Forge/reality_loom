/**
 * compileWorld — the minimal compiler pipeline (REF-1900.009, WGE-1200.002).
 *
 * Source Intake → Parse → Semantic Normalization → Identity/Relationship/
 * Aspect Resolution → Law Verification → Traversal Planning → Physics
 * Preparation → Kernel Validation → WIR → Executable World → Diagnostics.
 *
 * Deterministic by construction: given the same input, configuration, and
 * clock, output is equivalent (WGE-1200.002 pipeline invariant). The
 * compiler never mutates live Reality and never renders UI (WGE-1200.001).
 */
import type {
  WGECompilerDiagnostic,
  WGECompilerProfile,
  WGESemanticOperation,
  WGESourceUnit,
  WGEWorld,
  WGEPhysicsPlan,
  WGETraversalPlan,
  WILMessage
} from "@roc/types";
import { validateWorld } from "@wge/kernel";
import { parseWDLDocument, toSemanticOperations } from "@wge/wdl";
import { createExecutableWorld, type WGEExecutableWorld } from "@wge/executable";
import { materializeWorld } from "./materialize.js";
import { importWILMessages } from "./wil-import.js";

export interface WGECompileInput {
  source: WGESourceUnit;
  profile?: WGECompilerProfile;
  /** Injectable clock for deterministic output. Defaults to now. */
  now?: string;
  compilerVersion?: string;
}

/** REF-1900.009 — Compile Result. */
export interface WGECompileResult {
  executableWorld?: WGEExecutableWorld;
  diagnostics: WGECompilerDiagnostic[];
  success: boolean;
}

/**
 * WIR — World Intermediate Representation (WGE-1200.013). Compiler-internal;
 * runtimes consume Executable Worlds, not WIR.
 */
export interface WGEWIR {
  worldId: string;
  world: WGEWorld;
  semanticOperations: WGESemanticOperation[];
  traversalPlans: WGETraversalPlan[];
  physicsPlan: WGEPhysicsPlan;
  diagnostics: WGECompilerDiagnostic[];
}

const hasErrors = (diagnostics: WGECompilerDiagnostic[]): boolean =>
  diagnostics.some((d) => d.severity === "error");

/** REF-1900.009 required function. */
export async function compileWorld(input: WGECompileInput): Promise<WGECompileResult> {
  const diagnostics: WGECompilerDiagnostic[] = [];
  const now = input.now ?? new Date().toISOString();

  // Stage: Source Intake (WGE-1200.003) — no meaning interpretation here.
  const { source } = input;
  const supported = ["wdl", "wil_json", "studio_json", "application"];
  if (!supported.includes(source.format)) {
    return failure(diagnostics, {
      code: "WGE1200-SRC-001",
      severity: "error",
      message: `Unsupported source format ${JSON.stringify(source.format)}`,
      reason: `source intake accepts: ${supported.join(", ")} (WGE-1200.003)`
    });
  }
  let content: unknown = source.content;
  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch (cause) {
      // Fatal: source cannot parse (WGE-1200.002 fatal stage failures).
      return failure(diagnostics, {
        code: "WGE1200-SRC-002",
        severity: "error",
        message: "Source content could not be parsed as JSON",
        reason: cause instanceof Error ? cause.message : String(cause),
        sourceRef: { sourceUnitId: source.id }
      });
    }
  }

  // Stage: Parse + Semantic Normalization (WGE-1200.004 – WGE-1200.006).
  let operations: WGESemanticOperation[];
  if (source.format === "wil_json") {
    const imported = importWILMessages({
      messages: (content as { messages?: WILMessage[] }).messages ?? [],
      mode: "definition"
    });
    diagnostics.push(...imported.diagnostics);
    operations = imported.operations;
  } else {
    const parsed = parseWDLDocument(content, source.id);
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.document) return { diagnostics, success: false };
    operations = toSemanticOperations(parsed.document, source.id);
  }
  if (hasErrors(diagnostics)) return { diagnostics, success: false };

  // Stages: Identity → Relationship → Aspect Resolution, Law Verification,
  // Traversal Planning, Physics Preparation (WGE-1200.007 – WGE-1200.012).
  const materialized = materializeWorld(operations, now);
  diagnostics.push(...materialized.diagnostics);
  if (!materialized.world || hasErrors(diagnostics)) {
    return { diagnostics, success: false };
  }
  const world = materialized.world;

  // Stage: Kernel Validation — a World that fails MUST NOT compile into an
  // Executable World (WGE-1000.012).
  const kernelResult = validateWorld(world);
  for (const d of kernelResult.diagnostics) {
    diagnostics.push({
      code: d.code,
      severity: d.severity === "error" ? "error" : "warning",
      message: d.message,
      reason: d.reason ?? "kernel validation",
      ...(d.affectedIds !== undefined ? { affectedIds: d.affectedIds } : {}),
      ...(d.suggestedResolution !== undefined ? { suggestedFix: d.suggestedResolution } : {})
    });
  }
  if (kernelResult.outcome === "invalid") return { diagnostics, success: false };

  // Stage: WIR Generation (WGE-1200.013) — compiler-internal normalization.
  const wir: WGEWIR = {
    worldId: world.id,
    world,
    semanticOperations: operations,
    traversalPlans: materialized.traversalPlans,
    physicsPlan: materialized.physicsPlan ?? {
      worldId: world.id,
      propagationIndexes: [],
      constraintMaps: [],
      relevanceFieldSeeds: [],
      confidencePaths: [],
      temporalDecaySets: []
    },
    diagnostics
  };

  // Stage: Executable World Generation (WGE-1200.015).
  const executableWorld = createExecutableWorld({
    world: wir.world,
    traversalPlans: wir.traversalPlans,
    physicsPlan: wir.physicsPlan,
    diagnostics,
    now,
    ...(input.compilerVersion !== undefined ? { compilerVersion: input.compilerVersion } : {})
  });

  return { executableWorld, diagnostics, success: true };
}

function failure(
  diagnostics: WGECompilerDiagnostic[],
  diagnostic: WGECompilerDiagnostic
): WGECompileResult {
  diagnostics.push(diagnostic);
  return { diagnostics, success: false };
}
