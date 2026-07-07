/**
 * Permission-aware inspection (TOOL-2100.003 – TOOL-2100.014, TOOL-2100.020).
 *
 * Developer visibility is not automatically unlimited: inspectors respect
 * actor authority and show that redaction occurred rather than pretending
 * data does not exist. Candidate Worlds are always labeled as possibility.
 */
import type { WGEEntity, WGEWorld, WILActor } from "@roc/types";

export interface InspectionField {
  name: string;
  value: unknown;
  redacted: boolean;
  redactionReason?: string;
}

export interface EntityInspection {
  entityId: string;
  type: string;
  lifecycle: string;
  version: number;
  aspects: Array<{ kind: string; fields: InspectionField[] }>;
  redactionCount: number;
}

export function inspectEntity(
  world: WGEWorld,
  entityId: string,
  actor: WILActor
): EntityInspection | undefined {
  const entity = world.entities[entityId];
  if (!entity) return undefined;
  let redactionCount = 0;
  const aspects = entity.aspects.map((aspect) => {
    const visibility = aspect.visibility;
    const blocked =
      visibility !== undefined &&
      (visibility.mode === "hidden" ||
        ((visibility.mode === "restricted" || visibility.mode === "redacted") &&
          visibility.requiredCapability !== undefined &&
          !actor.authority.permissions.includes(visibility.requiredCapability)));
    if (blocked) {
      redactionCount += Object.keys(aspect.data).length;
      return {
        kind: aspect.kind,
        fields: Object.keys(aspect.data).map((name) => ({
          name,
          value: "«redacted»",
          redacted: true,
          redactionReason: `permission required: ${visibility?.requiredCapability ?? "protected"} (TOOL-2100.020)`
        }))
      };
    }
    return {
      kind: aspect.kind,
      fields: Object.entries(aspect.data).map(([name, value]) => ({ name, value, redacted: false }))
    };
  });
  return {
    entityId: entity.id,
    type: entity.type,
    lifecycle: entity.lifecycle,
    version: entity.version,
    aspects,
    redactionCount
  };
}

export interface WorldInspection {
  worldId: string;
  branch: "reality" | "candidate";
  /** Candidate Worlds must never masquerade as Reality (TOOL-2100.012). */
  label: string;
  entityCount: number;
  relationshipCount: number;
  lawCount: number;
  traversalCount: number;
  entities: EntityInspection[];
}

export function inspectWorld(
  world: WGEWorld,
  actor: WILActor,
  options: { candidateWorldId?: string } = {}
): WorldInspection {
  const branch = options.candidateWorldId !== undefined ? ("candidate" as const) : ("reality" as const);
  return {
    worldId: world.id,
    branch,
    label:
      branch === "candidate"
        ? `CANDIDATE WORLD ${options.candidateWorldId} — possibility, not Reality`
        : `REALITY — world ${world.id}`,
    entityCount: Object.keys(world.entities).length,
    relationshipCount: Object.keys(world.relationships).length,
    lawCount: Object.keys(world.laws).length,
    traversalCount: Object.keys(world.traversals).length,
    entities: Object.keys(world.entities)
      .sort()
      .map((id) => inspectEntity(world, id, actor))
      .filter((e): e is EntityInspection => e !== undefined)
  };
}

/** Trace completeness check (TOOL-2100.010): every step must carry a reason. */
export function checkTraceCompleteness(trace: {
  steps: Array<{ phase: string; reason: string }>;
  summary: string;
}): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!trace.summary) missing.push("summary");
  trace.steps.forEach((step, i) => {
    if (!step.reason) missing.push(`step[${i}].reason`);
  });
  return { complete: missing.length === 0, missing };
}

/** Entity graph identity check: inspection must never rewrite identity. */
export function preservesIdentity(before: WGEEntity, inspection: EntityInspection): boolean {
  return before.id === inspection.entityId && before.type === inspection.type;
}
