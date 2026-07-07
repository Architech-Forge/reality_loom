/**
 * Semantic operations → canonical World materialization with the resolution
 * stages of the compiler pipeline (WGE-1200.006 – WGE-1200.012).
 *
 * Every stage is deterministic: operations arrive in deterministic order
 * from @wge/wdl, generated ids are pure functions of source structure
 * (WGE-1200.007), and the injected clock keeps timestamps reproducible.
 */
import type {
  WGECompiledConstraintLawMetadata,
  WGECompilerDiagnostic,
  WGELawCondition,
  WGELawOutcome,
  WGEPhysicsPlan,
  WGESelector,
  WGESemanticOperation,
  WGETraversalOutputSpec,
  WGETraversalPlan,
  WGETraversalRule,
  WGEVisibility,
  WGEWorld
} from "@roc/types";
import {
  WGE_OBJECTIVE_ENTITY_TYPE,
  WGE_SELECTOR_KINDS,
  isConfidence,
  isWeight
} from "@roc/types";
import {
  createAspect,
  createEntity,
  createLaw,
  createRelationship,
  createTraversal,
  createWorld
} from "@wge/kernel";
import { serializeCanonicalValue } from "@wge/wil";
import { aspectIdFor, relationshipIdFor } from "@wge/wdl";

export interface MaterializeResult {
  world?: WGEWorld;
  traversalPlans: WGETraversalPlan[];
  physicsPlan?: WGEPhysicsPlan;
  diagnostics: WGECompilerDiagnostic[];
}

const err = (
  code: string,
  message: string,
  reason: string,
  affectedIds: string[],
  suggestedFix?: string
): WGECompilerDiagnostic => ({
  code,
  severity: "error",
  message,
  reason,
  affectedIds,
  ...(suggestedFix !== undefined ? { suggestedFix } : {})
});

export function materializeWorld(
  operations: WGESemanticOperation[],
  now: string
): MaterializeResult {
  const diagnostics: WGECompilerDiagnostic[] = [];
  const plans: WGETraversalPlan[] = [];

  // --- World identity (fatal when absent or duplicated) -------------------
  const worldOps = operations.filter((op) => op.kind === "world.declare");
  if (worldOps.length !== 1) {
    diagnostics.push(
      err(
        "WGE1200-WORLD-001",
        "Compilation requires exactly one world declaration (WDL-001.002)",
        `found ${worldOps.length} world declarations`,
        worldOps.map((op) => String(op.payload.id))
      )
    );
    return { traversalPlans: plans, diagnostics };
  }
  const worldPayload = worldOps[0]?.payload as {
    id: string;
    name: string;
    version: string;
    metadata?: Record<string, unknown>;
  };

  const world = createWorld({
    id: worldPayload.id,
    name: worldPayload.name,
    version: worldPayload.version,
    ...(worldPayload.metadata !== undefined ? { metadata: worldPayload.metadata } : {})
  });
  const rootId = world.rootEntityId;
  // Pin the auto-created root entity to the injected clock so identical
  // input compiles to identical output (WGE-1200.002 pipeline invariant).
  const rootEntity = world.entities[rootId];
  if (rootEntity) {
    rootEntity.createdAt = now;
    rootEntity.updatedAt = now;
  }

  // --- Identity resolution (WGE-1200.007): duplicates are fatal -----------
  const declaredEntityIds = new Set<string>();
  for (const op of operations) {
    if (op.kind !== "entity.declare" && op.kind !== "capability.declare") continue;
    const id = String(op.payload.id);
    if (declaredEntityIds.has(id)) {
      diagnostics.push(
        err(
          "WGE1200-ID-001",
          `Duplicate Entity ID "${id}"`,
          `Entity IDs must be unique within World "${world.id}" (WGE-1200.007)`,
          [id],
          "rename one of the duplicate declarations"
        )
      );
    }
    declaredEntityIds.add(id);
  }

  // --- Entity materialization ----------------------------------------------
  for (const op of operations) {
    if (op.kind === "entity.declare") {
      const p = op.payload as {
        id: string;
        type: string;
        lifecycle?: "created" | "active" | "suspended" | "archived" | "deleted";
        metadata?: Record<string, unknown>;
      };
      if (world.entities[p.id]) continue; // duplicate already diagnosed
      world.entities[p.id] = createEntity({
        id: p.id,
        worldId: world.id,
        type: p.type,
        lifecycle: p.lifecycle ?? "active",
        createdAt: now,
        ...(p.metadata !== undefined ? { metadata: p.metadata } : {})
      });
      // Compiler-declared entities (objectives) are contained by the root so
      // the World satisfies containment (WGE-1100.003).
      if (p.metadata?.objective === true) {
        const relId = relationshipIdFor(rootId, "contains", p.id);
        world.relationships[relId] = createRelationship({
          id: relId,
          worldId: world.id,
          fromEntityId: rootId,
          toEntityId: p.id,
          type: "contains"
        });
      }
    }
    if (op.kind === "capability.declare") {
      // Capabilities are expressed as Entities (WDL-001.010).
      const p = op.payload as {
        id: string;
        target: WGESelector;
        requires: string[];
        executes: string;
        public?: boolean;
      };
      if (world.entities[p.id]) continue;
      world.entities[p.id] = createEntity({
        id: p.id,
        worldId: world.id,
        type: "capability",
        lifecycle: "active",
        createdAt: now,
        aspects: [
          createAspect({
            id: aspectIdFor(p.id, "capability"),
            entityId: p.id,
            kind: "capability",
            data: {
              target: p.target,
              requires: p.requires ?? [],
              executes: p.executes,
              public: p.public === true
            } as unknown as Record<string, unknown>
          })
        ]
      });
      const relId = relationshipIdFor(rootId, "contains", p.id);
      world.relationships[relId] = createRelationship({
        id: relId,
        worldId: world.id,
        fromEntityId: rootId,
        toEntityId: p.id,
        type: "contains"
      });
    }
  }

  // --- Aspect resolution (WGE-1200.009) ------------------------------------
  for (const op of operations) {
    if (op.kind !== "aspect.attach" && op.kind !== "metadata.attach") continue;
    const ownerId = String(op.payload.ownerId);
    const owner = world.entities[ownerId] ?? (ownerId === world.id ? world : undefined);

    if (op.kind === "metadata.attach") {
      if (owner === world) world.metadata = { ...world.metadata, ...(op.payload.metadata as Record<string, unknown>) };
      continue;
    }

    const entityOwner = world.entities[ownerId];
    if (!entityOwner) {
      diagnostics.push(
        err(
          "WGE1200-ASPECT-001",
          `Aspect owner "${ownerId}" does not exist`,
          "An Aspect MUST have exactly one existing owner (WGE-1200.009)",
          [ownerId]
        )
      );
      continue;
    }
    const p = op.payload as unknown as {
      ownerId: string;
      kind: string;
      data: Record<string, unknown>;
      visibility?: WGEVisibility;
    };
    try {
      serializeCanonicalValue(p.data); // aspect data must be serializable
    } catch (cause) {
      diagnostics.push(
        err(
          "WGE1200-ASPECT-002",
          `Aspect "${p.kind}" on "${ownerId}" has non-serializable data`,
          cause instanceof Error ? cause.message : String(cause),
          [ownerId]
        )
      );
      continue;
    }
    entityOwner.aspects.push(
      createAspect({
        id: aspectIdFor(ownerId, p.kind),
        entityId: ownerId,
        kind: p.kind,
        data: p.data,
        ...(p.visibility !== undefined ? { visibility: p.visibility } : {})
      })
    );
  }

  // --- Relationship resolution (WGE-1200.008): missing endpoints fatal -----
  for (const op of operations) {
    if (op.kind !== "relationship.declare") continue;
    const p = op.payload as {
      id: string;
      from: string;
      to: string;
      type: string;
      direction?: "directed" | "bidirectional";
      weight?: number;
      confidence?: number;
      metadata?: Record<string, unknown>;
    };
    for (const [end, entityId] of [
      ["source", p.from],
      ["target", p.to]
    ] as const) {
      if (!world.entities[entityId]) {
        diagnostics.push(
          err(
            "WGE1200-REL-001",
            `Relationship "${p.id}" references missing ${end} entity "${entityId}"`,
            "A Relationship referencing a missing active Entity is a fatal compiler error (WGE-1200.008)",
            [p.id, entityId],
            "declare the entity or fix the reference"
          )
        );
      }
    }
    if (p.weight !== undefined && !isWeight(p.weight)) {
      diagnostics.push(
        err("WGE1200-REL-002", `Relationship "${p.id}" weight out of range`, "weight must be -100 to 100 (WGE-1000.005)", [p.id])
      );
      continue;
    }
    if (p.confidence !== undefined && !isConfidence(p.confidence)) {
      diagnostics.push(
        err("WGE1200-REL-003", `Relationship "${p.id}" confidence out of range`, "confidence must be 0.0 to 1.0 (WGE-1000.005)", [p.id])
      );
      continue;
    }
    if (world.entities[p.from] && world.entities[p.to]) {
      world.relationships[p.id] = createRelationship({
        id: p.id,
        worldId: world.id,
        fromEntityId: p.from,
        toEntityId: p.to,
        type: p.type,
        ...(p.direction !== undefined ? { direction: p.direction } : {}),
        ...(p.weight !== undefined ? { weight: p.weight } : {}),
        ...(p.confidence !== undefined ? { confidence: p.confidence } : {}),
        ...(p.metadata !== undefined ? { metadata: p.metadata } : {})
      });
    }
  }

  // --- Law verification (WGE-1200.010) -------------------------------------
  for (const op of operations) {
    if (op.kind !== "law.declare" && op.kind !== "constraint.declare") continue;

    if (op.kind === "constraint.declare") {
      // Constraint lowering (canonical, approved 2026-07-06): a constraint
      // is a Law whose normal successful behavior is to reject — never a
      // kernel primitive (WDL-001.011). The typed metadata keeps compiled
      // constraints distinguishable with full WDL source traceability.
      const p = op.payload as unknown as {
        id: string;
        applies_to: WGESelector;
        block_when: WGELawCondition;
        reason: string;
        metadata?: Record<string, unknown>;
      };
      const constraintMetadata: WGECompiledConstraintLawMetadata = {
        source: "wdl",
        constraint: true,
        wdlDeclarationId: p.id,
        severity: "error",
        compiledFrom: "constraint"
      };
      world.laws[p.id] = createLaw({
        id: p.id,
        worldId: world.id,
        name: p.reason,
        scope: "world",
        appliesTo: p.applies_to,
        // Unified law semantics (WDL-001.007): a law's condition is its
        // requirement — the outcome fires when the requirement fails. A
        // constraint blocks when block_when holds, so its requirement is
        // the negation.
        condition: { op: "not", condition: p.block_when },
        outcome: "reject",
        severity: "error",
        metadata: { ...p.metadata, ...constraintMetadata, reason: p.reason }
      });
      continue;
    }

    const p = op.payload as unknown as {
      id: string;
      name: string;
      scope?: "kernel" | "physics" | "world";
      appliesTo: WGESelector;
      condition: WGELawCondition;
      outcome: WGELawOutcome;
      severity?: "error" | "warning" | "suggestion";
      metadata?: Record<string, unknown>;
    };
    const scope = p.scope ?? "world";
    if (scope === "kernel") {
      diagnostics.push(
        err(
          "WGE1200-LAW-001",
          `Law "${p.id}" declares kernel scope`,
          "World Laws MUST NOT override Kernel Laws (WGE-1200.010); kernel laws are defined by the Kernel, not by WDL",
          [p.id],
          'use scope "world" or "physics"'
        )
      );
      continue;
    }
    const conditionIssue = validateCondition(p.condition);
    if (conditionIssue) {
      diagnostics.push(
        err("WGE1200-LAW-002", `Law "${p.id}" has an invalid condition`, conditionIssue, [p.id])
      );
      continue;
    }
    world.laws[p.id] = createLaw({
      id: p.id,
      worldId: world.id,
      name: p.name,
      scope,
      appliesTo: p.appliesTo,
      condition: p.condition,
      outcome: p.outcome,
      ...(p.severity !== undefined ? { severity: p.severity } : {}),
      ...(p.metadata !== undefined ? { metadata: p.metadata } : {})
    });
  }

  // Law selectors must resolve (WGE-1200.010: law selector resolves).
  for (const law of Object.values(world.laws)) {
    if (law.appliesTo.kind === "id" && !world.entities[String(law.appliesTo.value)]) {
      diagnostics.push(
        err(
          "WGE1200-LAW-003",
          `Law "${law.id}" appliesTo references missing entity "${String(law.appliesTo.value)}"`,
          "Law selector must resolve (WGE-1200.010)",
          [law.id]
        )
      );
    }
  }

  // --- Traversal planning (WGE-1200.011) -----------------------------------
  const relationshipTypes = new Set(Object.values(world.relationships).map((r) => r.type));
  for (const op of operations) {
    if (op.kind !== "traversal.declare") continue;
    const p = op.payload as unknown as {
      id: string;
      name?: string;
      from: string | WGESelector;
      rules: WGETraversalRule[];
      apply?: string[];
      output: WGETraversalOutputSpec;
      metadata?: Record<string, unknown>;
    };
    const entry: WGESelector =
      typeof p.from === "string" ? { kind: "id", value: p.from } : p.from;

    if (!WGE_SELECTOR_KINDS.includes(entry.kind)) {
      diagnostics.push(
        err("WGE1200-TRAV-001", `Traversal "${p.id}" has invalid entry selector`, `kind ${JSON.stringify(entry.kind)}`, [p.id])
      );
      continue;
    }
    if (entry.kind === "id" && !world.entities[String(entry.value)]) {
      diagnostics.push(
        err(
          "WGE1200-TRAV-002",
          `Traversal "${p.id}" entry references missing entity "${String(entry.value)}"`,
          "Traversal entry selectors must resolve (WGE-1200.011)",
          [p.id]
        )
      );
      continue;
    }
    for (const lawId of p.apply ?? []) {
      if (!world.laws[lawId]) {
        diagnostics.push(
          err("WGE1200-TRAV-003", `Traversal "${p.id}" applies missing law "${lawId}"`, "Traversal Laws must exist (WGE-1200.011)", [p.id, lawId])
        );
      }
    }
    for (const rule of p.rules) {
      if (rule.follow !== undefined && !relationshipTypes.has(rule.follow)) {
        diagnostics.push({
          code: "WGE1200-TRAV-004",
          severity: "warning",
          message: `Traversal "${p.id}" follows relationship type "${rule.follow}" which no declared relationship uses`,
          reason: "no valid path may exist from the entry point (WGE-1200.011 reachability)",
          affectedIds: [p.id],
          suggestedFix: "declare a relationship of this type or remove the rule"
        });
      }
    }

    world.traversals[p.id] = createTraversal({
      id: p.id,
      worldId: world.id,
      name: p.name ?? p.id,
      entry,
      rules: p.rules,
      output: p.output,
      ...(p.apply !== undefined ? { constraints: p.apply } : {}),
      ...(p.metadata !== undefined ? { metadata: p.metadata } : {})
    });

    plans.push({
      traversalId: p.id,
      entrySelector: entry,
      orderedRules: p.rules,
      requiredLawIds: (p.apply ?? []).filter((id) => world.laws[id]).sort(),
      requiredConstraintIds: (p.apply ?? [])
        .filter((id) => world.laws[id]?.metadata?.constraint === true)
        .sort(),
      expectedOutputKind: p.output.kind,
      indexesRequired: ["entity_id", "relationship_type", "outbound_relationship"]
    });
  }

  // --- Physics preparation (WGE-1200.012): prepares, never applies ---------
  const physicsPlan: WGEPhysicsPlan = {
    worldId: world.id,
    propagationIndexes: [...relationshipTypes].sort(),
    constraintMaps: Object.values(world.laws)
      .filter((law) => law.metadata?.constraint === true)
      .map((law) => law.id)
      .sort(),
    relevanceFieldSeeds: Object.values(world.entities)
      .filter((e) => e.type === WGE_OBJECTIVE_ENTITY_TYPE)
      .map((e) => e.id)
      .sort(),
    confidencePaths: Object.values(world.relationships)
      .filter((r) => r.confidence !== undefined)
      .map((r) => r.id)
      .sort(),
    temporalDecaySets: []
  };

  return { world, traversalPlans: plans, physicsPlan, diagnostics };
}

/** Recursive structural validation of the deterministic law condition AST. */
function validateCondition(condition: WGELawCondition): string | undefined {
  if (typeof condition !== "object" || condition === null) return "condition must be an object";
  switch (condition.op) {
    case "all":
    case "any":
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        return `${condition.op} requires a non-empty conditions array`;
      }
      for (const sub of condition.conditions) {
        const issue = validateCondition(sub);
        if (issue) return issue;
      }
      return undefined;
    case "not":
      return validateCondition(condition.condition);
    case "exists":
      return WGE_SELECTOR_KINDS.includes(condition.selector?.kind)
        ? undefined
        : "exists requires a valid selector";
    case "equals":
    case "not_equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return condition.left?.kind && condition.right?.kind
        ? undefined
        : `${condition.op} requires left and right value refs`;
    case "has_relationship":
      return typeof condition.relationshipType === "string"
        ? undefined
        : "has_relationship requires relationshipType";
    case "has_authority":
      return typeof condition.capability === "string"
        ? undefined
        : "has_authority requires capability";
    default:
      return `unknown condition op ${JSON.stringify((condition as { op?: unknown }).op)}`;
  }
}
