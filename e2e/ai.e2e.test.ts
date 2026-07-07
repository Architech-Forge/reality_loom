/**
 * AI boundary e2e surface (TEST-2500.016): pnpm test:ai.
 */
import { describe, expect, it } from "vitest";
import type { WILActor } from "@roc/types";
import { createAIActor, createWILProposal, releaseProposal, buildPromptContext } from "@roc/ai";
import { RuntimeTestHarness, SemanticAssertions } from "@roc/testing";
import { familyStyleWorld } from "@examples/family-style-world";
import { createWILMessage } from "@wge/wil";

const NOW = "2026-07-06T12:00:00Z";
const doc = () => familyStyleWorld() as unknown as Record<string, unknown>;

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view"]
  }
};

describe("AI boundary e2e (AI-2400, TEST-2500.016)", () => {
  it("full proposal loop: AI proposes → Reality untouched → human confirms → Runtime commits", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc(), { now: NOW });
    const runtime = harness.wgeRuntime;
    const snapshot = await harness.currentSnapshot();

    const proposal = createWILProposal({
      proposalId: "prop_e2e",
      aiActorId: "actor_birdi",
      worldId: "world_family",
      snapshotId: snapshot.id,
      proposedMessages: [
        createWILMessage({
          actor: emma, // delegated execution happens as the confirming human
          intent: { type: "create", reason: "Birdi proposes a scarf for the cold evening" },
          target: { kind: "entity", id: "garment_proposed_scarf" },
          context: { worldId: "world_family", snapshotId: snapshot.id },
          mode: "commit",
          payload: {
            id: "garment_proposed_scarf", type: "garment", containedBy: "closet_emma",
            aspects: [{ kind: "application", data: { "availability.status": "available" } }]
          }
        })
      ],
      intendedOutcome: "add a scarf to Emma's closet",
      assumptions: [{ id: "a1", statement: "evenings will be cold", source: "external_data", confidence: 0.7, requiresConfirmation: false }],
      risks: [{ id: "r1", description: "minor wardrobe change", severity: "low" }],
      confidence: 0.8,
      traceId: "trace_ai_e2e"
    });

    expect(proposal.requiresHumanConfirmation).toBe(true); // commit-mode forces it
    SemanticAssertions.aiProposalNotCommitted(runtime, proposal);

    const withheld = releaseProposal(proposal);
    expect(withheld.messages).toHaveLength(0);

    const released = releaseProposal(proposal, {
      confirmationId: "c1", actorId: emma.id, proposalId: "prop_e2e",
      worldId: "world_family", snapshotId: snapshot.id, confirmed: true,
      confirmedAt: NOW, traceId: "trace_ai_e2e"
    });
    const output = await harness.send(released.messages[0] as never);
    SemanticAssertions.commitCreatesSnapshot(output, snapshot.id);
    SemanticAssertions.diffExplainsChange(output.diff);
    expect(runtime.realityWorld().entities["garment_proposed_scarf"]).toBeDefined();
  });

  it("AI simulation stays isolated and prompt context separates candidate from Reality", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc(), { now: NOW });
    const runtime = harness.wgeRuntime;

    await SemanticAssertions.simulationIsolated(runtime, async () => {
      await runtime.simulate(
        createWILMessage({
          actor: emma,
          intent: { type: "create", reason: "what-if" },
          target: { kind: "entity", id: "garment_whatif" },
          context: { worldId: "world_family" },
          mode: "simulate",
          payload: {
            id: "garment_whatif", type: "garment", containedBy: "closet_emma",
            aspects: [{ kind: "application", data: { "availability.status": "available" } }]
          }
        })
      );
    });

    const aiActor = createAIActor({
      actorId: "actor_birdi", name: "Birdi", delegatedFromActorId: emma.id,
      authority: { actorId: "actor_birdi", worldScopes: ["world_family"], permissions: [] },
      capabilities: ["observe_world"], createdAt: NOW
    });
    const context = buildPromptContext({
      contextId: "ctx_e2e", aiActor,
      actor: { id: "actor_birdi", type: "ai", authority: { authenticated: true, permissions: ["world.observe"] } },
      world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id,
      traceId: "trace_ai_e2e", now: NOW
    });
    expect(context.redactionCount).toBeGreaterThan(0); // measurements protected from AI
    expect(context.uncertainty.some((u) => u.reason === "permission_redaction")).toBe(true);
  });
});
