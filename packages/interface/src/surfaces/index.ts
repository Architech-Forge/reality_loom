/**
 * WGE/WIL/WDL integration surfaces — developer/runtime tooling, not website
 * components (TOOL-2100.003 – .014 made native). Each surface is a headless
 * builder: runtime data in, contract-conforming primitive scene out.
 * Permission-aware inputs come from @roc/devtools, so redaction is already
 * visible before anything reaches a renderer.
 */
import type {
  SLIProjectionOutput,
  WGECompilerDiagnostic,
  WGEDiff,
  WGELaw,
  WGERuntimeCandidateWorld,
  WGESnapshot,
  WILMessage,
  WILTrace
} from "@roc/types";
import type { EntityInspection, WorldInspection } from "@roc/devtools";
import {
  AuthorityBoundary,
  CandidateLayer,
  CommitSurface,
  CompilerFlow,
  ProjectionSurface,
  RuntimeField,
  RuntimeNode,
  TraceLine,
  WorldGraphCanvas,
  type RLPrimitive
} from "../primitives/index.js";
import { traceMotion } from "../motion/trace.js";
import { commitMotion } from "../motion/commit.js";
import { forkMotion } from "../motion/ripple.js";

const node = (id: string, meaning: string, content: Record<string, unknown>): RLPrimitive =>
  RuntimeNode({ id, meaning, content });

/** The World Graph itself: entities as nodes, relationships as trace geometry. */
export function WorldGraphInspector(inspection: WorldInspection): RLPrimitive {
  return WorldGraphCanvas({
    id: `wgi_${inspection.worldId}`,
    meaning: `world graph of ${inspection.worldId} (${inspection.branch})`,
    content: { label: inspection.label, entityCount: inspection.entityCount, relationshipCount: inspection.relationshipCount },
    children: inspection.entities.map((entity) =>
      node(`wgi_${inspection.worldId}_${entity.entityId}`, `entity ${entity.entityId} (${entity.type})`, {
        entityId: entity.entityId,
        type: entity.type,
        lifecycle: entity.lifecycle,
        redactionCount: entity.redactionCount
      })
    )
  });
}

/** One entity across aspects — redacted fields become authority boundaries. */
export function EntityInspector(inspection: EntityInspection): RLPrimitive {
  return RuntimeField({
    id: `ei_${inspection.entityId}`,
    meaning: `entity inspection: ${inspection.entityId}`,
    content: { entityId: inspection.entityId, type: inspection.type, version: inspection.version },
    children: inspection.aspects.map((aspect, i) => {
      const redacted = aspect.fields.some((f) => f.redacted);
      const child = node(`ei_${inspection.entityId}_aspect_${i}`, `aspect ${aspect.kind}`, {
        kind: aspect.kind,
        fields: aspect.fields
      });
      return redacted
        ? AuthorityBoundary({
            id: `ei_${inspection.entityId}_boundary_${i}`,
            meaning: `protected aspect ${aspect.kind}: redaction visible, never silent`,
            children: [child],
            content: { redacted: true }
          })
        : child;
    })
  });
}

/** A single aspect's meaning. */
export function AspectInspector(input: { entityId: string; kind: string; data: Record<string, unknown>; redacted?: boolean }): RLPrimitive {
  const field = RuntimeField({
    id: `ai_${input.entityId}_${input.kind}`,
    meaning: `aspect ${input.kind} on ${input.entityId}`,
    content: { kind: input.kind, data: input.data }
  });
  return input.redacted
    ? AuthorityBoundary({
        id: `ai_${input.entityId}_${input.kind}_boundary`,
        meaning: "protected aspect — permission required",
        children: [field]
      })
    : field;
}

/** A Law: selector, requirement, and what happens otherwise. */
export function LawInspector(law: WGELaw): RLPrimitive {
  return RuntimeField({
    id: `li_${law.id}`,
    meaning: `law "${law.name}" (${law.scope}; otherwise ${law.outcome})`,
    content: { law },
    children: [
      node(`li_${law.id}_selector`, "who the law applies to", { appliesTo: law.appliesTo }),
      node(`li_${law.id}_condition`, "the requirement", { condition: law.condition }),
      node(`li_${law.id}_outcome`, "what happens when the requirement fails", {
        outcome: law.outcome,
        severity: law.severity
      })
    ]
  });
}

/** Causality drawn: one node per step, connected by the trace line. */
export function TraceViewer(trace: WILTrace): RLPrimitive {
  return TraceLine({
    id: `tv_${trace.id}`,
    meaning: `trace ${trace.id}: ${trace.summary}`,
    motion: traceMotion(`causality of ${trace.messageId}`, trace.id),
    runtimeRef: { traceId: trace.id },
    content: { summary: trace.summary, actorId: trace.actorId },
    children: trace.steps.map((step) =>
      node(`tv_${trace.id}_step_${step.order}`, `${step.phase}: ${step.reason}`, {
        order: step.order,
        phase: step.phase,
        status: step.status,
        reason: step.reason
      })
    )
  });
}

/** A possibility, permanently labeled as such. */
export function CandidateWorldViewer(
  record: WGERuntimeCandidateWorld,
  comparison?: { equivalent: boolean; operationCount: number }
): RLPrimitive {
  return CandidateLayer({
    id: `cwv_${record.id}`,
    meaning: `candidate world ${record.id} — possibility, not Reality (status: ${record.status})`,
    motion: forkMotion(`branched from ${record.baseSnapshotId}`, record.traceId),
    runtimeRef: { candidateWorldId: record.id, snapshotId: record.baseSnapshotId, traceId: record.traceId },
    content: {
      label: "CANDIDATE — possibility, not Reality",
      status: record.status,
      baseSnapshotId: record.baseSnapshotId,
      ...(comparison !== undefined ? { divergence: comparison } : {})
    }
  });
}

/** Ordered change: one node per operation, order preserved. */
export function DiffViewer(diff: WGEDiff): RLPrimitive {
  return RuntimeField({
    id: `dv_${diff.id}`,
    meaning: `diff ${diff.id}: ${diff.operations.length} ordered operation(s) from ${diff.fromSnapshotId}`,
    runtimeRef: { traceId: diff.traceId, snapshotId: diff.fromSnapshotId },
    content: { fromSnapshotId: diff.fromSnapshotId, toSnapshotId: diff.toSnapshotId },
    children: diff.operations.map((operation, i) =>
      node(`dv_${diff.id}_op_${i}`, `operation ${i + 1}: ${operation.type}`, { operation })
    )
  });
}

/** Committed Reality at a moment, with its lineage. */
export function SnapshotViewer(snapshot: WGESnapshot): RLPrimitive {
  return CommitSurface({
    id: `sv_${snapshot.id}`,
    meaning: `snapshot ${snapshot.id} — committed Reality${snapshot.parentSnapshotId ? ` descending from ${snapshot.parentSnapshotId}` : " (initial)"}`,
    state: "committed",
    motion: commitMotion(`Reality advanced to ${snapshot.id}`),
    runtimeRef: { worldId: snapshot.worldId, snapshotId: snapshot.id },
    content: {
      snapshotId: snapshot.id,
      parentSnapshotId: snapshot.parentSnapshotId,
      entityIndexHash: snapshot.entityIndexHash
    }
  });
}

/** A WIL message: actor, intent, target, mode — the protocol made visible. */
export function WILMessageViewer(message: WILMessage): RLPrimitive {
  return RuntimeField({
    id: `wmv_${message.id}`,
    meaning: `WIL ${message.intent.type}/${message.mode} from ${message.actor.id}`,
    runtimeRef: { traceId: message.traceId, worldId: message.context.worldId },
    content: { messageId: message.id, mode: message.mode },
    children: [
      node(`wmv_${message.id}_actor`, "who is acting", { actor: message.actor.id, type: message.actor.type }),
      node(`wmv_${message.id}_intent`, "why", { intent: message.intent }),
      node(`wmv_${message.id}_target`, "what part of the World", { target: message.target }),
      node(`wmv_${message.id}_mode`, "how it affects Reality", { mode: message.mode })
    ]
  });
}

/** The compile pipeline as living geometry, diagnostics attached to stages. */
export function WDLCompilerFlow(input: {
  sourceId: string;
  success: boolean;
  diagnostics: WGECompilerDiagnostic[];
}): RLPrimitive {
  const stages = ["intake", "parse", "semantics", "resolution", "laws", "traversals", "kernel", "executable"];
  return CompilerFlow({
    id: `cf_${input.sourceId}`,
    meaning: `compilation of ${input.sourceId}: ${input.success ? "executable world produced" : "rejected with diagnostics"}`,
    content: { success: input.success, diagnosticCount: input.diagnostics.length },
    children: [
      ...stages.map((stage, i) =>
        node(`cf_${input.sourceId}_${stage}`, `compiler stage: ${stage}`, { stage, order: i + 1 })
      ),
      ...input.diagnostics.map((diagnostic, i) =>
        node(`cf_${input.sourceId}_diag_${i}`, `${diagnostic.severity}: ${diagnostic.message}`, {
          diagnostic
        })
      )
    ]
  });
}

/** Why the experience looks the way it does. */
export function ProjectionInspector(projection: SLIProjectionOutput): RLPrimitive {
  return ProjectionSurface({
    id: `pi_${projection.id}`,
    meaning: `projection ${projection.id}: primary ${projection.composition.primaryEntityId} at ${projection.composition.density} density`,
    runtimeRef: { worldId: projection.worldId, snapshotId: projection.snapshotId, traceId: projection.traceId },
    content: { density: projection.composition.density, primary: projection.composition.primaryEntityId },
    children: projection.composition.entities
      .filter((entity) => entity.role !== "hidden")
      .map((entity) =>
        node(`pi_${projection.id}_${entity.entityId}`, entity.reason, {
          entityId: entity.entityId,
          role: entity.role,
          relevance: entity.relevance,
          relevanceSource: entity.relevanceSource
        })
      )
  });
}

/** Permission truth: allowed or blocked, explained either way. */
export function AuthorityBoundaryViewer(input: {
  actorId: string;
  action: string;
  allowed: boolean;
  reason: string;
  traceId?: string;
}): RLPrimitive {
  return AuthorityBoundary({
    id: `abv_${input.actorId}_${input.action.replace(/[^a-z0-9]+/gi, "_")}`,
    meaning: `${input.actorId} → ${input.action}: ${input.allowed ? "permitted" : "blocked"} — ${input.reason}`,
    ...(input.traceId !== undefined ? { runtimeRef: { traceId: input.traceId } } : {}),
    content: { actorId: input.actorId, action: input.action, allowed: input.allowed, reason: input.reason }
  });
}
