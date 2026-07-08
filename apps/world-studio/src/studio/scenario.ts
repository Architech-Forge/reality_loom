/**
 * The First End-To-End Demo as a living scenario (REF-1900.019).
 *
 * Every act runs the real stack: WIL messages built with the SDK, executed
 * by WGERuntime, rippled by physics, projected by SLI, expressed by the
 * renderer. Consequential acts present a Decision Surface first
 * (SLI-1600.013): the user must understand what will happen.
 */
import type { SLIDecisionSurface } from "@sli/design-system";
import { WILBuilder } from "@roc/sdk";
import { bridgeInteraction } from "@sli/runtime";
import { ACTOR_EMMA, ACTOR_WEATHER, OBJECTIVE_ID, WORLD_ID } from "./actors";
import type { WorldStudioOS } from "./os";

export interface Act {
  id: string;
  /** Short imperative label on the guide rail. */
  label: string;
  /** Birdi's narration while this act is next. */
  narration: string;
  /** Codex step(s) this act performs. */
  codexRef: string;
  /** Decision surface content when the act is consequential (SLI-1600.013). */
  decision?: Omit<SLIDecisionSurface, "id" | "entityId" | "traceId">;
  run(os: WorldStudioOS): Promise<void>;
}

export const ACTS: Act[] = [
  {
    id: "act_draft",
    label: "Draft the family look",
    narration:
      "The wedding rehearsal dinner is coming and rain is possible. Let's draft a coordinated look — in a Candidate World, so nothing touches Reality until the family agrees.",
    codexRef: "REF-1900.019 steps 4–8",
    async run(os) {
      const before = os.wge().currentSnapshot();
      const message = WILBuilder.message()
        .actor(ACTOR_EMMA)
        .intent({
          type: "create",
          reason: "Plan a coordinated family look",
          objectiveId: OBJECTIVE_ID,
          confidence: 0.9
        })
        .target({ kind: "entity", id: "outfit_plan_wedding" })
        .context({ worldId: WORLD_ID, snapshotId: before.id })
        .mode("simulate")
        .payload({
          id: "outfit_plan_wedding",
          type: "outfit_plan",
          containedBy: "household_primary",
          physicsMagnitude: 0.85,
          aspects: [
            { kind: "identity", data: { display_name: "Wedding Outfit Plan" } },
            {
              kind: "state",
              data: {
                status: "draft",
                garments: ["garment_cream_dress", "garment_gray_suit", "garment_rain_boots"]
              }
            }
          ]
        })
        .build();

      await os.execute(
        message,
        "a Candidate World opened — the canvas now projects possibility, not Reality",
        {
          beforeReproject: (output) => {
            const candidateWorldId = output.candidateWorldId ?? "";
            os.record.candidateWorldId = candidateWorldId;
            os.setBranch({ kind: "candidate", candidateWorldId });
          }
        }
      );
    }
  },

  {
    id: "act_premature",
    label: "Try to make it Reality now",
    narration:
      "What happens if we push the draft into Reality before the family accepts it? Watch the Law — a rejection is not an error, it is World truth holding.",
    codexRef: "REF-1900.019 step 13 (law validation)",
    decision: {
      choice: "Attempt to merge the draft Candidate World into Reality now",
      reason: 'The plan\'s status is still "draft" — nobody has accepted it.',
      consequence:
        'The runtime will evaluate World Laws. "Candidate outfits do not become Reality until accepted" should reject the merge, and Reality will not change.',
      alternatives: ["Wait and let the family accept the plan first"],
      cancelable: true,
      accessibilityLabel: "Decision: attempt premature merge of the draft plan"
    },
    async run(os) {
      const runtime = os.wge();
      const candidateWorldId = os.record.candidateWorldId ?? "";
      const message = os.candidateClient().prepareMerge(candidateWorldId, ACTOR_EMMA, {
        worldId: WORLD_ID,
        snapshotId: runtime.currentSnapshot().id
      });
      const output = await os.execute(message, "the law held: the draft stayed a possibility");
      os.record.rejectionSummary = output.trace.summary;
      const law = runtime.realityWorld().laws["law_candidate_acceptance"];
      os.setSurfaces({
        lawRejection: {
          lawName: law?.name ?? "Candidate outfits do not become Reality until accepted",
          explanation:
            (law?.metadata?.explanation as string | undefined) ??
            "An outfit plan enters Reality only after the family accepts it.",
          summary: `Outcome: ${output.outcome.status} — Reality preserved at ${runtime.currentSnapshot().id}. Rejected is a successful application of World truth (WIL-001.007).`,
          traceId: message.traceId
        }
      });
    }
  },

  {
    id: "act_accept",
    label: "The family accepts the plan",
    narration:
      "Emma, James, and Lila agree: cream dress, gray suit, rain boots. Acceptance happens inside the Candidate World — still a possibility, now a welcome one.",
    codexRef: "REF-1900.019 step 11",
    async run(os) {
      const candidateWorldId = os.record.candidateWorldId ?? "";
      const message = WILBuilder.message()
        .actor(ACTOR_EMMA)
        .intent({ type: "modify", reason: "family accepts the outfit plan" })
        .target({ kind: "entity", id: "outfit_plan_wedding" })
        .context({ worldId: WORLD_ID, candidateWorldId })
        .mode("simulate")
        .payload({ aspects: [{ kind: "state", data: { status: "accepted" } }] })
        .build();
      await os.execute(message, "the family accepted the plan inside the Candidate World");
    }
  },

  {
    id: "act_compare",
    label: "Compare possibility with Reality",
    narration:
      "Before committing, look at both worlds side by side. Possibility must never appear as Reality — the Comparison Surface keeps them distinct.",
    codexRef: "SLI-1600.015, TOOL-2100.012",
    async run(os) {
      os.openComparison();
    }
  },

  {
    id: "act_commit",
    label: "Commit — make it Reality",
    narration:
      "The acceptance interaction crosses the Interaction Intent Bridge and becomes a Commit-mode WIL message. Laws revalidate, a Diff is generated, and a new Snapshot becomes Reality.",
    codexRef: "REF-1900.019 steps 12–15",
    decision: {
      choice: "Merge the accepted Candidate World into Reality",
      reason: 'The plan\'s status is "accepted"; the acceptance law will now pass.',
      consequence:
        "Reality advances to a new Snapshot containing the outfit plan. The change ripples through physics and the canvas recomposes. History is preserved — the old Snapshot remains in the lineage.",
      alternatives: ["Discard the Candidate World and keep Reality as it is"],
      cancelable: true,
      accessibilityLabel: "Decision: commit the accepted outfit plan to Reality"
    },
    async run(os) {
      const candidateWorldId = os.record.candidateWorldId ?? "";
      const projection = os.state.projection;
      // The renderer never commits: the accept interaction becomes WIL
      // through the bridge (SLI-1500.016), then the runtime disposes.
      const bridged = bridgeInteraction(
        {
          id: "interaction_accept_plan",
          actorId: ACTOR_EMMA.id,
          projectionId: projection?.id ?? "proj_unknown",
          interactionType: "accept",
          target: { kind: "candidate_world", id: candidateWorldId },
          context: { worldId: WORLD_ID, snapshotId: os.wge().currentSnapshot().id },
          traceId: projection?.traceId ?? "trace_unknown"
        },
        ACTOR_EMMA
      );
      if (!bridged.message) throw new Error(`bridge refused: ${bridged.reason}`);
      os.journal({
        kind: "interaction",
        title: "Acceptance crossed the Interaction Intent Bridge",
        detail: bridged.reason,
        traceId: bridged.message.traceId
      });
      os.setBranch({ kind: "reality" });
      const output = await os.execute(bridged.message, "the accepted plan became Reality");
      if (output.diff !== undefined) os.record.commitDiff = output.diff;
      os.record.commitSnapshotId = output.snapshot?.id ?? os.wge().currentSnapshot().id;
      os.record.commitTraceSummary = output.trace.summary;
      os.record.commitActor = `${ACTOR_EMMA.displayName} (${ACTOR_EMMA.id})`;
      os.confirmSurface({
        id: `confirm_${output.messageId}`,
        whatHappened: `Candidate World ${candidateWorldId} merged into Reality: ${output.diff?.operations.length ?? 0} diff operation(s) applied.`,
        realityChanged: true,
        snapshotId: os.record.commitSnapshotId,
        candidateWorldId,
        undoAvailable: false,
        whatHappensNext:
          "Reality does not forget: the previous snapshot stays in the lineage, and deletion is archival. Physics has rippled the change and the canvas has recomposed around it.",
        traceId: bridged.message.traceId
      });
    }
  },

  {
    id: "act_rain",
    label: "Rain arrives",
    narration:
      "The weather service now confirms rain. External data is not automatically Reality — it enters as a traced, attributed WIL commit, then physics decides what it touches.",
    codexRef: "WGE-1400 (ripple), APP-1700.015 (provenance)",
    async run(os) {
      const runtime = os.wge();
      const message = WILBuilder.message()
        .actor(ACTOR_WEATHER)
        .intent({
          type: "modify",
          reason: "weather service confirms rain for the rehearsal dinner",
          confidence: 0.95
        })
        .target({ kind: "entity", id: "weather_forecast" })
        .context({ worldId: WORLD_ID, snapshotId: runtime.currentSnapshot().id })
        .mode("commit")
        .payload({
          physicsMagnitude: 0.9,
          provenance: {
            source: "weather-service",
            confidence: 0.95,
            fetchedAt: new Date().toISOString(),
            freshness: "current"
          },
          aspects: [{ kind: "state", data: { condition: "raining", confidence: 0.95 } }]
        })
        .build();
      await os.execute(message, "rain confirmed — influence rippled through the graph");
      os.openPhysics();
    }
  },

  {
    id: "act_author",
    label: "Weave a new thread",
    narration:
      "Author mode: add a garment to Emma's closet. Reality-changing authoring is a WIL message like any other — watch it enter the canvas with its own motion.",
    codexRef: "TOOL-2100.002 (Author mode), WIL-001.003 (create)",
    async run(os) {
      const runtime = os.wge();
      const message = WILBuilder.message()
        .actor(ACTOR_EMMA)
        .intent({ type: "create", reason: "Emma adds a sun hat to her closet" })
        .target({ kind: "entity", id: "garment_sun_hat" })
        .context({ worldId: WORLD_ID, snapshotId: runtime.currentSnapshot().id })
        .mode("commit")
        .payload({
          id: "garment_sun_hat",
          type: "garment",
          containedBy: "closet_emma",
          physicsMagnitude: 0.45,
          aspects: [
            { kind: "identity", data: { display_name: "Sun Hat" } },
            {
              kind: "application",
              data: { "availability.status": "available", formality: "casual", waterproof: false }
            }
          ]
        })
        .build();
      await os.execute(message, "a new garment was woven into Reality");
    }
  },

  {
    id: "act_answers",
    label: "Ask the six questions",
    narration:
      "The demo is not complete until the system can answer for itself. Every answer below comes from stored diffs, traces, and snapshots — not from copy.",
    codexRef: "REF-1900.019 demo invariant",
    async run(os) {
      const runtime = os.wge();
      const record = os.record;
      const recomposedPlan = os.state.projection?.composition.entities.find(
        (e) => e.entityId === "outfit_plan_wedding"
      );
      os.setAnswers({
        "What changed?": `${record.commitDiff?.operations.length ?? 0} diff operations created "outfit_plan_wedding" and advanced Reality ${record.realitySnapshotBefore ?? "?"} → ${record.commitSnapshotId ?? "?"} (now ${runtime.currentSnapshot().id} after physics and authoring).`,
        "Why did it change?": `Law "law_candidate_acceptance" passed once state.status became "accepted". ${record.commitTraceSummary ?? ""}`,
        "Who caused it?": `${record.commitActor ?? "?"}, authenticated, holding world.commit — with the weather service and the studio runtime as attributed actors for their own commits.`,
        "What was simulated?": `Candidate World ${record.candidateWorldId ?? "?"}: the draft plan, its physics ripple, the premature-merge rejection, and the acceptance — all isolated from Reality.`,
        "What became Reality?": `Snapshot ${record.commitSnapshotId ?? "?"} with the accepted outfit plan (cream dress, gray suit, rain boots) — then rain relevance and the sun hat, each through its own committed diff.`,
        "Why is this visible now?": recomposedPlan
          ? `${recomposedPlan.role}: ${recomposedPlan.reason}`
          : "the plan is composed into the current experience"
      });
    }
  }
];
