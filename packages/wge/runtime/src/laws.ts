/**
 * Law Evaluation Runtime (WGE-1300.008).
 *
 * Evaluation order is Kernel → Physics → World, every blocking law is
 * traced, and a rejection is a correct outcome — not a failure. Laws use
 * unified WDL semantics: appliesTo selects the subjects, condition is the
 * requirement, and the outcome fires for subjects whose requirement fails.
 */
import type {
  WGELawEvaluationOutput,
  WGELaw,
  WGERuntimeDiagnostic,
  WGEWorld,
  WILActor,
  WILContext,
  WILTraceStep
} from "@roc/types";
import { evaluateCondition, resolveSelector } from "@wge/kernel";

export interface LawEvaluationRequest {
  /** Post-application (tentative) world state the requirement checks against. */
  world: WGEWorld;
  /** Entities affected by the interaction; laws evaluate on these subjects. */
  affectedEntityIds: string[];
  actor: WILActor;
  context: WILContext;
  traceId: string;
  startOrder: number;
}

const SCOPE_ORDER: Record<WGELaw["scope"], number> = { kernel: 0, physics: 1, world: 2 };

export function evaluateLaws(request: LawEvaluationRequest): WGELawEvaluationOutput {
  const { world, actor, context, traceId } = request;
  const appliedLawIds: string[] = [];
  const blockedByLawIds: string[] = [];
  const diagnostics: WGERuntimeDiagnostic[] = [];
  const traceSteps: WILTraceStep[] = [];
  let order = request.startOrder;
  let warned = false;
  let deferred = false;
  let clarify = false;

  const laws = Object.values(world.laws).sort(
    (a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] || (a.id < b.id ? -1 : 1)
  );

  for (const law of laws) {
    const subjects = resolveSelector(world, law.appliesTo).entities.filter((entity) =>
      request.affectedEntityIds.includes(entity.id)
    );
    if (subjects.length === 0) continue;

    appliedLawIds.push(law.id);
    const failing = subjects.filter(
      (entity) => !evaluateCondition(law.condition, { world, entity, actor, context })
    );

    if (failing.length === 0) {
      traceSteps.push({
        order: order++,
        phase: "law_checked",
        status: "passed",
        reason: `Law "${law.name}" satisfied for ${subjects.length} subject(s)`,
        relatedEntityIds: subjects.map((s) => s.id).sort(),
        relatedLawIds: [law.id]
      });
      continue;
    }

    const failingIds = failing.map((f) => f.id).sort();
    switch (law.outcome) {
      case "allow":
        break;
      case "reject": {
        blockedByLawIds.push(law.id);
        traceSteps.push({
          order: order++,
          phase: "law_checked",
          status: "blocked",
          reason: `Law "${law.name}" rejected the interaction`,
          relatedEntityIds: failingIds,
          relatedLawIds: [law.id]
        });
        diagnostics.push({
          code: "RUNTIME_LAW_REJECTED",
          severity: "error",
          message: `Law "${law.name}" rejected the interaction`,
          reason: `requirement failed for: ${failingIds.join(", ")}`,
          relatedIds: [law.id, ...failingIds],
          suggestedResolution: "satisfy the law's requirement or target different entities",
          traceId
        });
        break;
      }
      case "warn": {
        warned = true;
        traceSteps.push({
          order: order++,
          phase: "law_checked",
          status: "modified",
          reason: `Law "${law.name}" warned about the interaction`,
          relatedEntityIds: failingIds,
          relatedLawIds: [law.id]
        });
        diagnostics.push({
          code: "RUNTIME_LAW_WARNING",
          severity: "warning",
          message: `Law "${law.name}" warned about the interaction`,
          reason: `requirement failed for: ${failingIds.join(", ")}`,
          relatedIds: [law.id, ...failingIds],
          traceId
        });
        break;
      }
      case "defer":
        deferred = true;
        traceSteps.push({
          order: order++,
          phase: "law_checked",
          status: "skipped",
          reason: `Law "${law.name}" deferred the interaction`,
          relatedEntityIds: failingIds,
          relatedLawIds: [law.id]
        });
        break;
      case "require_clarification":
        clarify = true;
        traceSteps.push({
          order: order++,
          phase: "law_checked",
          status: "blocked",
          reason: `Law "${law.name}" requires clarification before proceeding`,
          relatedEntityIds: failingIds,
          relatedLawIds: [law.id]
        });
        break;
      case "create_candidate_world":
        // Routed by the runtime: the interaction proceeds only as simulation.
        traceSteps.push({
          order: order++,
          phase: "law_checked",
          status: "modified",
          reason: `Law "${law.name}" redirected the interaction to a Candidate World`,
          relatedEntityIds: failingIds,
          relatedLawIds: [law.id]
        });
        break;
    }
  }

  const status: WGELawEvaluationOutput["status"] =
    blockedByLawIds.length > 0
      ? "rejected"
      : clarify
        ? "requires_clarification"
        : deferred
          ? "deferred"
          : warned
            ? "warning"
            : "allowed";

  return {
    status,
    appliedLawIds: appliedLawIds.sort(),
    ...(blockedByLawIds.length > 0 ? { blockedByLawIds: blockedByLawIds.sort() } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    traceSteps
  };
}
