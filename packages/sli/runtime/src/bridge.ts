/**
 * Interaction Intent Bridge (SLI-1500.016).
 *
 * User interaction is not automatically Reality mutation. Local experience
 * actions (expand, collapse, inspect, select, local density/focus) stay
 * inside SLI; Reality-changing actions become WIL messages.
 */
import type { SLIInteractionIntent, WILActor, WILMessage } from "@roc/types";
import { createWILMessage } from "@wge/wil";

const LOCAL_INTERACTIONS = new Set<SLIInteractionIntent["interactionType"]>([
  "select",
  "inspect",
  "expand",
  "collapse",
  "compare"
]);

const INTERACTION_TO_INTENT: Partial<
  Record<SLIInteractionIntent["interactionType"], WILMessage["intent"]["type"]>
> = {
  accept: "commit",
  reject: "rollback",
  modify: "modify",
  create: "create",
  delete: "delete",
  commit: "commit",
  simulate: "simulate"
};

const INTENT_TO_MODE: Record<string, WILMessage["mode"]> = {
  commit: "commit",
  rollback: "commit",
  modify: "commit",
  create: "commit",
  delete: "commit",
  simulate: "simulate"
};

export interface BridgeResult {
  /** WIL message when the interaction intends to affect Reality. */
  message?: WILMessage;
  /** True when the action remains a local experience action inside SLI. */
  localOnly: boolean;
  reason: string;
}

export function bridgeInteraction(
  interaction: SLIInteractionIntent,
  actor: WILActor
): BridgeResult {
  if (actor.id !== interaction.actorId) {
    // Actor identity must be preserved through the bridge.
    return {
      localOnly: true,
      reason: `actor mismatch: interaction claims "${interaction.actorId}" but bridge received "${actor.id}" — refused`
    };
  }

  if (LOCAL_INTERACTIONS.has(interaction.interactionType)) {
    return {
      localOnly: true,
      reason: `"${interaction.interactionType}" is a local experience action; it stays inside SLI (SLI-1500.016)`
    };
  }

  const intentType = interaction.semanticIntent?.type ?? INTERACTION_TO_INTENT[interaction.interactionType];
  if (!intentType) {
    return {
      localOnly: true,
      reason: `"${interaction.interactionType}" has no Reality-changing mapping`
    };
  }

  const message = createWILMessage({
    actor,
    intent: interaction.semanticIntent ?? {
      type: intentType,
      reason: `SLI interaction "${interaction.interactionType}" on projection ${interaction.projectionId}`
    },
    target:
      interaction.target ??
      (interaction.entityId !== undefined
        ? { kind: "entity", id: interaction.entityId }
        : { kind: "world" }),
    context: interaction.context,
    mode: INTENT_TO_MODE[intentType] ?? "observe",
    traceId: interaction.traceId,
    payload: { sliInteractionId: interaction.id, projectionId: interaction.projectionId }
  });

  return {
    message,
    localOnly: false,
    reason: `"${interaction.interactionType}" intends to affect Reality; converted to WIL ${intentType}/${message.mode}`
  };
}
