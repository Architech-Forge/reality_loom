/**
 * Recomposition Runtime (SLI-1500.014).
 *
 * Updates an active Projection when World relevance changes. Recomposition
 * feels continuous: focus is preserved when still valid, spatial placements
 * are inherited as spatial memory, and motion explains what moved.
 */
import type {
  SLIProjectionOutput,
  SLIRecompositionInput,
  SLISpatialMemoryRecord,
  SLITransition
} from "@roc/types";
import { DEFAULT_MOTION_TOKENS } from "@sli/design-system";
import { buildProjection } from "./project.js";

export function recompose(input: SLIRecompositionInput): SLIProjectionOutput {
  const previous = input.previousProjection;

  // Preserve valid experience state: prior placements become spatial memory
  // so entities keep their sense of place (SLI-1500.010).
  const inheritedMemory: SLISpatialMemoryRecord[] = previous.rendererInstructions
    .filter((i) => i.projectionRole !== "hidden" && i.region !== undefined)
    .map((i) => ({
      id: `mem_${previous.id}_${i.entityId}`,
      worldId: previous.worldId,
      entityId: i.entityId,
      preferredRegionId: i.region as string,
      ...(i.boundsHint !== undefined ? { lastKnownBounds: i.boundsHint } : {}),
      stabilityScore: 0.8,
      lastSeenAt: new Date(0).toISOString()
    }));

  const projectionInput = {
    ...input.projectionInput,
    recompositionTriggers: input.triggers,
    previousProjectionId: previous.id,
    context: {
      ...input.projectionInput.context,
      spatialMemory: [
        ...(input.projectionInput.context.spatialMemory ?? []),
        ...inheritedMemory
      ]
    }
  };

  const { output } = buildProjection(projectionInput);

  // Motion explains recomposition: entities that moved regions get "move"
  // transitions; the rest keep continuity (SLI-1500.009, SLI-1500.014).
  const reducedMotion = output.motionPlan.reducedMotionApplied;
  if (!reducedMotion) {
    const previousRegions = new Map(
      previous.rendererInstructions.map((i) => [i.entityId, i.region] as const)
    );
    const previousBounds = new Map(
      previous.rendererInstructions.map((i) => [i.entityId, i.boundsHint] as const)
    );
    const recomposeToken = DEFAULT_MOTION_TOKENS.find((t) => t.role === "recompose");
    const transitions: SLITransition[] = [];
    let n = 0;
    for (const instruction of output.rendererInstructions) {
      if (instruction.projectionRole === "hidden") continue;
      const before = previousRegions.get(instruction.entityId);
      if (before === undefined) {
        transitions.push({
          id: `motion_${output.id}_r${++n}`,
          entityId: instruction.entityId,
          type: "appear",
          ...(instruction.boundsHint !== undefined ? { to: instruction.boundsHint } : {}),
          priority: "normal",
          durationHintMs: 280,
          reason: `entered the experience: ${input.reason}`
        });
      } else if (before !== instruction.region) {
        const from = previousBounds.get(instruction.entityId);
        transitions.push({
          id: `motion_${output.id}_r${++n}`,
          entityId: instruction.entityId,
          type: "move",
          ...(from !== undefined ? { from } : {}),
          ...(instruction.boundsHint !== undefined ? { to: instruction.boundsHint } : {}),
          priority: instruction.projectionRole === "primary" ? "high" : "normal",
          durationHintMs: recomposeToken?.durationMs ?? 550,
          reason: `moved ${before} → ${instruction.region}: ${input.reason}`
        });
      }
    }
    for (const previousInstruction of previous.rendererInstructions) {
      if (previousInstruction.projectionRole === "hidden") continue;
      const still = output.rendererInstructions.find(
        (i) => i.entityId === previousInstruction.entityId && i.projectionRole !== "hidden"
      );
      if (!still) {
        transitions.push({
          id: `motion_${output.id}_r${++n}`,
          entityId: previousInstruction.entityId,
          type: "disappear",
          priority: "normal",
          durationHintMs: 220,
          reason: `left the experience: ${input.reason}`
        });
      }
    }
    output.motionPlan.transitions = transitions;
    output.motionPlan.reason = `recomposition: ${input.reason}`;
  }

  return output;
}
