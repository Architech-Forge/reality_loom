/**
 * Projection input construction from WGE World state (SLI-1500.003).
 *
 * SLI receives projected World data — it never queries private World data
 * directly. This helper is the sanctioned handoff: it reads entity aspects
 * (physics relevance, projection hints, identity labels, visibility
 * policies) and produces the normalized SLIProjectionInput.
 */
import type {
  SLIProjectedEntity,
  SLIProjectedRelationship,
  SLIProjectionContext,
  SLIProjectionInput,
  WGERecompositionTrigger,
  WGEWorld,
  WILActor
} from "@roc/types";
import { WGE_OBJECTIVE_ASPECT_KIND, WGE_OBJECTIVE_ENTITY_TYPE } from "@roc/types";

/**
 * Freshly compiled worlds may contain valid entities with no physics history yet.
 * Without a small projection floor, the initial SLI projection can appear empty
 * even though the world is structurally valid.
 *
 * This baseline is projection presence only.
 * It is not physics evidence, objective gravity, activity, priority, or truth.
 * Any real physics relevance produced by events/laws/ripples/objectives overrides it.
 */
const BASELINE_PROJECTION_RELEVANCE = 0.1;

export interface ProjectionInputOptions {
  world: WGEWorld;
  snapshotId: string;
  actor: WILActor;
  traceId: string;
  objectiveId?: string;
  recompositionTriggers?: WGERecompositionTrigger[];
  context?: SLIProjectionContext;
  id?: string;
}

export function projectionInputFromWorld(options: ProjectionInputOptions): SLIProjectionInput {
  const { world, actor } = options;

  const entities: SLIProjectedEntity[] = Object.keys(world.entities)
    .sort()
    .map((id) => world.entities[id])
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
    .filter((e) => e.lifecycle === "active" || e.lifecycle === "created")
    .map((entity) => {
      const identity = entity.aspects.find((a) => a.kind === "identity");
      const physics = entity.aspects.find((a) => a.kind === "physics");
      const hint = entity.aspects.find((a) => a.kind === "projection_hint");
      const objectiveState = entity.aspects.find((a) => a.kind === WGE_OBJECTIVE_ASPECT_KIND);

      // Visibility policy (WGEVisibility): restricted aspects require the
      // actor to hold the named capability.
      const restricted = entity.aspects.some((a) => {
        const visibility = a.visibility;
        if (!visibility) return false;
        if (visibility.mode === "hidden") return true;
        if (visibility.mode === "restricted" || visibility.mode === "redacted") {
          return (
            visibility.requiredCapability !== undefined &&
            !actor.authority.permissions.includes(visibility.requiredCapability)
          );
        }
        return false;
      });

      const label =
        (identity?.data.display_name as string | undefined) ??
        (identity?.data.name as string | undefined) ??
        (objectiveState?.data.label as string | undefined);

      const hasPhysicsHistory = typeof physics?.data.relevance === "number";
      const projected: SLIProjectedEntity = {
        id: entity.id,
        type: entity.type,
        ...(label !== undefined ? { label } : {}),
        relevance: hasPhysicsHistory
          ? (physics.data.relevance as number)
          : BASELINE_PROJECTION_RELEVANCE,
        relevanceSource: hasPhysicsHistory ? "physics" : "projection_baseline",
        confidence: typeof physics?.data.confidence === "number" ? physics.data.confidence : 1,
        priority:
          typeof objectiveState?.data.priority === "number"
            ? objectiveState.data.priority / 100
            : typeof hint?.data.priority === "number"
              ? hint.data.priority
              : 0,
        permissions: {
          visible: !restricted,
          interactive: !restricted && entity.type !== WGE_OBJECTIVE_ENTITY_TYPE,
          explainable: true
        }
      };
      if (hint) projected.projectionHints = hint.data;
      if (objectiveState) {
        const entry = objectiveState.data.entry as { selector?: { kind: string; value?: unknown } };
        projected.projectionHints = {
          ...projected.projectionHints,
          ambient: true,
          entryEntityId: entry?.selector?.kind === "id" ? String(entry.selector.value) : undefined
        };
      }
      return projected;
    });

  const relationships: SLIProjectedRelationship[] = Object.keys(world.relationships)
    .sort()
    .map((id) => world.relationships[id])
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .filter((r) => r.lifecycle === "active" || r.lifecycle === "created")
    .map((r) => ({
      id: r.id,
      fromEntityId: r.fromEntityId,
      toEntityId: r.toEntityId,
      type: r.type,
      ...(r.weight !== undefined ? { weight: r.weight } : {}),
      ...(r.confidence !== undefined ? { confidence: r.confidence } : {})
    }));

  return {
    id: options.id ?? `pin_${options.snapshotId}`,
    worldId: world.id,
    snapshotId: options.snapshotId,
    actorId: actor.id,
    ...(options.objectiveId !== undefined ? { objectiveId: options.objectiveId } : {}),
    entities,
    relationships,
    ...(options.recompositionTriggers !== undefined
      ? { recompositionTriggers: options.recompositionTriggers }
      : {}),
    context: options.context ?? {},
    traceId: options.traceId
  };
}
