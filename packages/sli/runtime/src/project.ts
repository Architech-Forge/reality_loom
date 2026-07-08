/**
 * projectExperience — the minimal SLI projection pipeline (REF-1900.016,
 * SLI-1500.002 – SLI-1500.011).
 *
 * Composition → Focus → Density → Layout → Motion → Accessibility →
 * Renderer instructions. Projection is derived from World state and Context;
 * it never creates World truth, and it never mutates Reality. Deterministic:
 * ties break on entity id everywhere.
 */
import type {
  SLIAccessibilityNode,
  SLIAccessibilityPlan,
  SLIBoundsHint,
  SLIComposedEntity,
  SLIComposition,
  SLIDensityLevel,
  SLIDensityPlan,
  SLIFocusEntry,
  SLIFocusPlan,
  SLIInteractionLevel,
  SLIInteractionMap,
  SLILayoutPlan,
  SLIMotionPlan,
  SLIObjectRole,
  SLIPlacement,
  SLIProjectedEntity,
  SLIProjection,
  SLIProjectionDiagnostic,
  SLIProjectionInput,
  SLIProjectionOutput,
  SLIRendererInstruction,
  SLITransition,
  SLIViewport
} from "@roc/types";
import {
  DEFAULT_MOTION_TOKENS,
  ROLE_DEFAULT_REGION,
  ROLE_VISUAL_WEIGHT,
  STANDARD_REGIONS
} from "@sli/design-system";

export interface ProjectionResult {
  projection: SLIProjection;
  output: SLIProjectionOutput;
}

/** Density caps: how many secondary/supporting entities each level exposes. */
const DENSITY_CAPS: Record<SLIDensityLevel, { secondary: number; supporting: number }> = {
  ambient: { secondary: 1, supporting: 0 },
  aware: { secondary: 3, supporting: 4 },
  decision: { secondary: 3, supporting: 2 },
  professional: { secondary: 6, supporting: 8 }
};

const DEFAULT_VIEWPORT: SLIViewport = { width: 1280, height: 800 };

const byId = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : 1));

/** REF-1900.016 required function. */
export async function projectExperience(
  input: SLIProjectionInput
): Promise<SLIProjectionOutput> {
  return buildProjection(input).output;
}

export function buildProjection(input: SLIProjectionInput): ProjectionResult {
  const diagnostics: SLIProjectionDiagnostic[] = [];
  try {
    return buildProjectionUnsafe(input, diagnostics);
  } catch (cause) {
    // Failure & degradation (SLI-1500.018): fall back to single-primary,
    // text-first projection. Experience failure never becomes Reality failure.
    diagnostics.push({
      code: "SLI_PROJECTION_DEGRADED",
      severity: "warning",
      message: "Projection degraded to single-primary fallback",
      reason: cause instanceof Error ? cause.message : String(cause),
      traceId: input.traceId
    });
    const fallbackInput: SLIProjectionInput = {
      ...input,
      entities: input.entities.slice(0, 1).map((e) => ({ id: e.id, type: e.type })),
      relationships: [],
      recompositionTriggers: [],
      context: { accessibility: input.context.accessibility ?? {} }
    };
    return buildProjectionUnsafe(fallbackInput, diagnostics);
  }
}

function buildProjectionUnsafe(
  input: SLIProjectionInput,
  diagnostics: SLIProjectionDiagnostic[]
): ProjectionResult {
  const { traceId } = input;
  const projectionId = `proj_${input.id}`;
  if (!input.worldId || !input.snapshotId || !input.actorId) {
    throw new Error("Projection input must reference a World, a Snapshot, and an Actor (SLI-1500.003)");
  }
  if (input.entities.length === 0) {
    throw new Error("Projection input contains no entities");
  }

  const visible = byId(input.entities.filter((e) => e.permissions?.visible !== false));
  const invisible = byId(input.entities.filter((e) => e.permissions?.visible === false));

  // --- Composition: single primary via REF-1900.016 priority scoring -------
  const primary = selectPrimary(input, visible);
  const density = solveDensity(input, visible, diagnostics);
  const caps = DENSITY_CAPS[density.level];

  const related = new Set<string>(
    input.relationships
      .filter((r) => r.fromEntityId === primary.id || r.toEntityId === primary.id)
      .flatMap((r) => [r.fromEntityId, r.toEntityId])
  );
  related.delete(primary.id);

  const score = (e: SLIProjectedEntity): number =>
    (e.priority ?? 0) * 2 + (e.relevance ?? 0) * 1.5 + (e.confidence ?? 0.5);
  const others = visible
    .filter((e) => e.id !== primary.id)
    .sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1));

  const composed: SLIComposedEntity[] = [
    composeEntity(primary, "primary", "selected as primary attention owner")
  ];
  let secondaryCount = 0;
  let supportingCount = 0;
  for (const entity of others) {
    let role: SLIObjectRole;
    let reason: string;
    if (related.has(entity.id) && secondaryCount < caps.secondary) {
      role = "secondary";
      secondaryCount += 1;
      reason = `directly related to primary "${primary.id}"`;
    } else if (supportingCount < caps.supporting && (entity.relevance ?? 0) > 0.2) {
      role = "supporting";
      supportingCount += 1;
      reason = "clarifying context above relevance threshold";
    } else if ((entity.relevance ?? 0) > 0.05) {
      role = "peripheral";
      reason = "available without demanding attention";
    } else if (entity.type === "wge.objective" || (entity.projectionHints?.ambient === true)) {
      role = "ambient";
      reason = "background awareness";
    } else {
      role = "hidden";
      reason = `density ${density.level} hides low-relevance context (recoverable)`;
    }
    composed.push(composeEntity(entity, role, reason));
  }
  for (const entity of invisible) {
    composed.push(
      composeEntity(entity, "hidden", "actor lacks permission to view this entity")
    );
  }

  const composition: SLIComposition = {
    id: `comp_${projectionId}`,
    worldId: input.worldId,
    snapshotId: input.snapshotId,
    primaryEntityId: primary.id,
    entities: composed,
    relationships: byId(input.relationships.map((r) => ({ ...r, id: r.id }))).map((r) => ({
      relationshipId: r.id,
      fromEntityId: r.fromEntityId,
      toEntityId: r.toEntityId,
      type: r.type,
      emphasis:
        r.fromEntityId === primary.id || r.toEntityId === primary.id
          ? ("strong" as const)
          : (r.weight ?? 0) > 50
            ? ("normal" as const)
            : ("faint" as const)
    })),
    density: density.level,
    reason: `primary "${primary.id}" (${primaryReason(input, primary)}); density ${density.level}`,
    traceId
  };

  // --- Focus: one attention owner (SLI-1500.006) ---------------------------
  const focusRank: Record<SLIObjectRole, number> = {
    primary: 0, secondary: 1, supporting: 2, peripheral: 3, ambient: 4, hidden: 5
  };
  const focusOrder: SLIFocusEntry[] = composed
    .filter((c) => c.role !== "hidden")
    .sort((a, b) => focusRank[a.role] - focusRank[b.role] || (a.entityId < b.entityId ? -1 : 1))
    .map((c, i) => ({
      entityId: c.entityId,
      focusLevel: c.role,
      order: i + 1,
      keyboardReachable: c.role === "primary" || c.role === "secondary" || c.role === "supporting",
      screenReaderReachable: true,
      reason: c.reason
    }));
  const focusPlan: SLIFocusPlan = {
    id: `focus_${projectionId}`,
    primaryFocusEntityId: primary.id,
    focusOrder,
    attentionOwnerId: primary.id,
    reason: "one attention owner; order follows composition roles",
    traceId
  };

  // --- Layout: spatial structure with spatial memory (SLI-1500.008, .010) --
  const viewport = input.context.device?.viewport ?? DEFAULT_VIEWPORT;
  const memory = new Map(
    (input.context.spatialMemory ?? []).map((m) => [m.entityId, m] as const)
  );
  const regionCounts = new Map<string, number>();
  const placements: SLIPlacement[] = composed
    .filter((c) => c.role !== "hidden")
    .map((c) => {
      let regionId: string = ROLE_DEFAULT_REGION[c.role];
      let memoryRef: string | undefined;
      let reason = `role ${c.role} defaults to region ${regionId}`;
      const record = memory.get(c.entityId);
      // Spatial memory: an entity SHOULD move only for the listed causes
      // (SLI-1500.010). The primary must own center; everything else keeps
      // its remembered region when stable enough.
      if (record && record.stabilityScore >= 0.5 && c.role !== "primary" && record.preferredRegionId) {
        regionId = record.preferredRegionId;
        memoryRef = record.id;
        reason = `spatial memory preserved (stability ${record.stabilityScore}) — stable imperfection beats unstable perfection`;
      }
      const slot = regionCounts.get(regionId) ?? 0;
      regionCounts.set(regionId, slot + 1);
      return {
        entityId: c.entityId,
        regionId,
        boundsHint: boundsFor(regionId, slot),
        zOrder: c.role === "primary" ? 10 : 5 - focusRank[c.role],
        ...(memoryRef !== undefined ? { spatialMemoryRef: memoryRef } : {}),
        reason
      };
    });
  distributeWithinRegions(placements);
  const readingOrder = focusOrder.map((f) => f.entityId);
  const layoutPlan: SLILayoutPlan = {
    id: `layout_${projectionId}`,
    viewport,
    regions: [...STANDARD_REGIONS],
    placements,
    readingOrder,
    touchOrder: focusOrder.filter((f) => f.keyboardReachable).map((f) => f.entityId),
    safeAreas: [
      { edge: "top", size: 24 },
      { edge: "bottom", size: 24 }
    ],
    traceId
  };

  // --- Motion (SLI-1500.009) ------------------------------------------------
  const reducedMotion = input.context.accessibility?.reducedMotion === true;
  const enterToken = DEFAULT_MOTION_TOKENS.find((t) => t.role === "enter");
  const transitions: SLITransition[] = reducedMotion
    ? []
    : placements.map((p, i) => ({
        id: `motion_${projectionId}_${i + 1}`,
        entityId: p.entityId,
        type: "appear" as const,
        to: p.boundsHint,
        priority: p.entityId === primary.id ? ("high" as const) : ("normal" as const),
        durationHintMs: enterToken?.durationMs ?? 280,
        reason: "entity enters the projected experience"
      }));
  const motionPlan: SLIMotionPlan = {
    id: `motion_${projectionId}`,
    transitions,
    reducedMotionApplied: reducedMotion,
    reason: reducedMotion
      ? "reduced motion preference honored: static state change"
      : "entities appear with clarifying entrance motion",
    traceId
  };

  // --- Accessibility (SLI-1500.011): part of composition --------------------
  const accessibilityPlan = planAccessibility(input, composed, focusOrder, projectionId, reducedMotion, traceId);

  // --- Renderer instructions + interaction map (SLI-1500.004, .016) --------
  const interactionLevelFor = (c: SLIComposedEntity): SLIInteractionLevel => {
    const entity = input.entities.find((e) => e.id === c.entityId);
    if (entity?.permissions?.interactive === false) return "passive";
    switch (c.role) {
      case "primary":
        return entity?.projectionHints?.decision === true ? "decision" : "interactive";
      case "secondary":
        return "interactive";
      case "supporting":
        return "inspectable";
      case "peripheral":
        return "inspectable";
      case "ambient":
        return "passive";
      case "hidden":
        return "none";
    }
  };
  const placementByEntity = new Map(placements.map((p) => [p.entityId, p] as const));
  const rendererInstructions: SLIRendererInstruction[] = composed.map((c) => {
    const placement = placementByEntity.get(c.entityId);
    const motionRef = transitions.find((t) => t.entityId === c.entityId)?.id;
    return {
      entityId: c.entityId,
      projectionRole: c.role,
      ...(placement !== undefined ? { region: placement.regionId, boundsHint: placement.boundsHint } : {}),
      visualWeight: c.visualWeight,
      interactionLevel: interactionLevelFor(c),
      accessibilityRef: `a11y_${projectionId}_${c.entityId}`,
      ...(motionRef !== undefined ? { motionRef } : {})
    };
  });
  const interactionMap: SLIInteractionMap = {
    projectionId,
    entries: rendererInstructions.map((instruction) => {
      const level = instruction.interactionLevel;
      const local: SLIInteractionMap["entries"][number]["allowedInteractions"] =
        level === "none"
          ? []
          : level === "passive"
            ? ["inspect"]
            : level === "inspectable"
              ? ["select", "inspect", "expand", "collapse"]
              : level === "interactive"
                ? ["select", "inspect", "expand", "collapse", "compare", "modify", "simulate"]
                : ["select", "inspect", "expand", "collapse", "compare", "accept", "reject", "modify", "create", "delete", "commit", "simulate"];
      return {
        entityId: instruction.entityId,
        interactionLevel: level,
        allowedInteractions: local,
        wilEligible: level === "interactive" || level === "decision"
      };
    })
  };

  const projection: SLIProjection = {
    id: projectionId,
    worldId: input.worldId,
    snapshotId: input.snapshotId,
    ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
    primaryEntityId: primary.id,
    composition,
    focusPlan,
    densityPlan: density,
    layoutPlan,
    motionPlan,
    accessibilityPlan,
    traceId,
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  };
  const output: SLIProjectionOutput = {
    id: projectionId,
    worldId: input.worldId,
    snapshotId: input.snapshotId,
    composition,
    rendererInstructions,
    accessibilityPlan,
    motionPlan,
    interactionMap,
    traceId,
    ...(diagnostics.length > 0 ? { diagnostics } : {})
  };
  return { projection, output };
}

/** REF-1900.016 first composition rule, in order. */
function selectPrimary(
  input: SLIProjectionInput,
  visible: SLIProjectedEntity[]
): SLIProjectedEntity {
  // 1. Explicit objective target.
  if (input.objectiveId) {
    const objective = input.entities.find((e) => e.id === input.objectiveId);
    const entryId = (objective?.projectionHints?.entryEntityId ??
      objective?.metadata?.entryEntityId) as string | undefined;
    const entry = visible.find((e) => e.id === entryId);
    if (entry) return entry;
  }
  // 2. Highest recomposition trigger priority.
  const priorityRank = { critical: 0, high: 1, normal: 2, idle: 3 } as const;
  const triggers = [...(input.recompositionTriggers ?? [])].sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority]
  );
  for (const trigger of triggers) {
    const target = visible.find((e) => trigger.affectedEntityIds.includes(e.id));
    if (target) return target;
  }
  // 3. Highest entity priority; 4. highest relevance; 5. fallback first (root).
  const scored = [...visible].sort(
    (a, b) =>
      (b.priority ?? 0) - (a.priority ?? 0) ||
      (b.relevance ?? 0) - (a.relevance ?? 0) ||
      (a.id < b.id ? -1 : 1)
  );
  const chosen = scored[0];
  if (!chosen) throw new Error("no visible entity can own attention");
  return chosen;
}

function primaryReason(input: SLIProjectionInput, primary: SLIProjectedEntity): string {
  if (input.objectiveId) return `objective ${input.objectiveId} targets it`;
  if (input.recompositionTriggers?.some((t) => t.affectedEntityIds.includes(primary.id))) {
    return "highest-priority recomposition trigger affects it";
  }
  return "highest priority/relevance among visible entities";
}

function composeEntity(
  entity: SLIProjectedEntity,
  role: SLIObjectRole,
  reason: string
): SLIComposedEntity {
  const baseline = entity.relevanceSource === "projection_baseline";
  return {
    entityId: entity.id,
    role,
    priority: entity.priority ?? 0,
    relevance: entity.relevance ?? 0,
    ...(entity.relevanceSource !== undefined ? { relevanceSource: entity.relevanceSource } : {}),
    confidence: entity.confidence ?? 0.5,
    visualWeight: ROLE_VISUAL_WEIGHT[role],
    // Baseline presence must stay distinguishable from real relevance in
    // every trace (approved 2026-07-06 guardrail).
    reason: baseline ? `${reason} (projection baseline presence, not physics evidence)` : reason
  };
}

/** Density Engine (SLI-1500.007): more information is not better by default. */
function solveDensity(
  input: SLIProjectionInput,
  visible: SLIProjectedEntity[],
  _diagnostics: SLIProjectionDiagnostic[]
): SLIDensityPlan {
  let level: SLIDensityLevel = "aware";
  let reason = "default orientation density";

  const application = input.context.application;
  if (application?.density === "professional") {
    level = "professional";
    reason = "application explicitly requested professional density";
  }
  if (input.recompositionTriggers?.some((t) => t.priority === "critical" || t.priority === "high")) {
    level = "decision";
    reason = "high-priority trigger demands an actionable, low-noise experience";
  }
  const confidences = visible.map((e) => e.confidence).filter((c): c is number => c !== undefined);
  const avgConfidence =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 1;
  if (avgConfidence < 0.4) {
    level = level === "professional" ? "aware" : "ambient";
    reason = `low average confidence (${avgConfidence.toFixed(2)}) reduces density (SLI-1500.007)`;
  }
  if (input.context.accessibility?.dynamicTypeScale !== undefined && input.context.accessibility.dynamicTypeScale > 1.4) {
    level = level === "professional" || level === "decision" ? "decision" : "ambient";
    reason = "accessibility type scale reduces simultaneous information (SLI-1500.007)";
  }

  const caps = DENSITY_CAPS[level];
  return {
    id: `density_${input.id}`,
    level,
    maxSecondary: caps.secondary,
    maxSupporting: caps.supporting,
    reason,
    traceId: input.traceId
  };
}

function planAccessibility(
  input: SLIProjectionInput,
  composed: SLIComposedEntity[],
  focusOrder: SLIFocusEntry[],
  projectionId: string,
  reducedMotion: boolean,
  traceId: string
): SLIAccessibilityPlan {
  const labelFor = (entityId: string): string => {
    const entity = input.entities.find((e) => e.id === entityId);
    return entity?.label ?? entity?.id ?? entityId;
  };
  const a11yRole = (role: SLIObjectRole): SLIAccessibilityNode["role"] =>
    role === "primary" ? "main" : role === "ambient" ? "ambient" : "context";

  const readingOrder: SLIAccessibilityNode[] = focusOrder.map((f, i) => ({
    entityId: f.entityId,
    role: a11yRole(f.focusLevel),
    label: labelFor(f.entityId),
    order: i + 1,
    reachable: f.screenReaderReachable
  }));
  const keyboardOrder = readingOrder.filter((node) =>
    focusOrder.find((f) => f.entityId === node.entityId)?.keyboardReachable
  );

  return {
    id: `a11y_${projectionId}`,
    readingOrder,
    keyboardOrder,
    reducedMotion,
    ...(input.context.accessibility?.dynamicTypeScale !== undefined
      ? { dynamicTypeScale: input.context.accessibility.dynamicTypeScale }
      : {}),
    contrastRequirements: composed
      .filter((c) => c.role === "primary" || c.role === "secondary")
      .map((c) => ({
        entityId: c.entityId,
        minimumRatio: 4.5,
        reason: `${c.role} content must remain readable`
      })),
    interactionTargets: composed
      .filter((c) => c.role === "primary" || c.role === "secondary" || c.role === "supporting")
      .map((c) => ({
        entityId: c.entityId,
        minimumSizePx: 44,
        interactionLevel: c.role === "supporting" ? ("inspectable" as const) : ("interactive" as const)
      })),
    summary: `Primary focus "${focusOrder[0]?.entityId}"; ${readingOrder.length} readable, ${keyboardOrder.length} keyboard-reachable`,
    traceId
  };
}

/** Normalized base bounds per semantic region (SLI-1600.002). */
const REGION_BASE_BOUNDS: Record<string, SLIBoundsHint> = {
  center: { x: 0.25, y: 0.15, width: 0.5, height: 0.6 },
  north: { x: 0.25, y: 0.0, width: 0.5, height: 0.1 },
  east: { x: 0.78, y: 0.15, width: 0.2, height: 0.6 },
  south: { x: 0.25, y: 0.78, width: 0.5, height: 0.18 },
  west: { x: 0.02, y: 0.15, width: 0.2, height: 0.6 },
  periphery: { x: 0.02, y: 0.78, width: 0.2, height: 0.18 },
  background: { x: 0, y: 0, width: 1, height: 1 },
  foreground: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
  overlay: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
  ambient: { x: 0.78, y: 0.02, width: 0.2, height: 0.1 }
};

/** Deterministic normalized bounds per semantic region and slot index. */
function boundsFor(regionId: string, slot: number): SLIBoundsHint {
  const bounds = REGION_BASE_BOUNDS[regionId] ?? REGION_BASE_BOUNDS["center"];
  if (!bounds) return { x: 0, y: 0, width: 1, height: 1 };
  // Stack subsequent entities within a region deterministically.
  const offset = slot * 0.02;
  return { ...bounds, y: Math.min(0.9, bounds.y + offset) };
}

/**
 * Distributes co-located placements within each region into a deterministic
 * grid so interactive targets never overlap (SLI-1500.008). Grid shape
 * follows the region's aspect: wide regions grow columns, tall regions grow
 * rows. Placement order is the composition order, which is already
 * deterministic, so identical inputs yield identical grids.
 */
function distributeWithinRegions(placements: SLIPlacement[]): void {
  const byRegion = new Map<string, SLIPlacement[]>();
  for (const placement of placements) {
    const group = byRegion.get(placement.regionId) ?? [];
    group.push(placement);
    byRegion.set(placement.regionId, group);
  }
  const GAP = 0.012;
  for (const [regionId, group] of byRegion) {
    if (group.length <= 1 || regionId === "background" || regionId === "overlay") continue;
    const base = REGION_BASE_BOUNDS[regionId];
    if (!base) continue;
    const aspect = base.width / Math.max(base.height, 0.01);
    const columns = Math.max(
      1,
      Math.min(group.length, Math.round(Math.sqrt(group.length * aspect)) || 1)
    );
    const rows = Math.ceil(group.length / columns);
    group.forEach((placement, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      placement.boundsHint = {
        x: base.x + (column * base.width) / columns + GAP / 2,
        y: base.y + (row * base.height) / rows + GAP / 2,
        width: Math.max(0.02, base.width / columns - GAP),
        height: Math.max(0.02, base.height / rows - GAP)
      };
    });
  }
}
