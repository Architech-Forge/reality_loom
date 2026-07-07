/**
 * Official compliance suite — AI & Reasoning (AI-2400.020).
 * AI may propose. Runtime disposes.
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import {
  buildPromptContext,
  createAIActor,
  createMemory,
  createWILProposal,
  observeWorld,
  refuse,
  releaseProposal,
  traceReasoning,
  validateReasoningResult,
  type ROCAIPromptContext,
  type ROCAIReasoningRequest
} from "@roc/ai";
import { createWILMessage } from "@wge/wil";
import { assert, emma, guest, FIXED_NOW, garmentCreate, loadFamilyRuntime } from "./helpers.js";

const birdi = () =>
  createAIActor({
    actorId: "actor_birdi",
    name: "Birdi",
    model: "reference-model",
    delegatedFromActorId: "actor_emma",
    authority: { actorId: "actor_birdi", worldScopes: ["world_family"], permissions: [] },
    capabilities: ["observe_world", "propose_wil", "generate_candidate_world"],
    createdAt: FIXED_NOW
  });

async function familyContext(actorPermissions: string[] = ["world.observe"]): Promise<ROCAIPromptContext> {
  const runtime = await loadFamilyRuntime();
  return buildPromptContext({
    contextId: "ctx_1",
    aiActor: birdi(),
    actor: { id: "actor_birdi", type: "ai", authority: { authenticated: true, permissions: actorPermissions } },
    world: runtime.realityWorld(),
    snapshotId: runtime.currentSnapshot().id,
    traceId: "trace_ai",
    now: FIXED_NOW
  });
}

const reasoningRequest = (context: ROCAIPromptContext): ROCAIReasoningRequest => ({
  requestId: "req_1",
  aiActorId: "actor_birdi",
  worldId: "world_family",
  snapshotId: context.snapshotId,
  task: "recommend",
  context,
  allowedOutputs: ["text_explanation", "wil_message_proposal"],
  constraints: [],
  traceId: "trace_ai"
});

export const aiSuite: ROCComplianceSuite = {
  id: "suite_ai",
  area: "ai",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("AI-CT-001", "AI Actor is never authority-free", ["AI-2400.002"], async () => {
      let threw = false;
      try {
        createAIActor({
          actorId: "actor_rogue", name: "Rogue",
          authority: { actorId: "actor_rogue", worldScopes: [], permissions: [] },
          capabilities: ["observe_world"], createdAt: FIXED_NOW
        });
      } catch {
        threw = true;
      }
      assert(threw, "no authority and no delegation is rejected");
      assert(birdi().delegatedFromActorId === "actor_emma", "delegation is explicit");
    }),
    defineTest("AI-CT-002", "AI observation is permission-aware with visible redaction", ["AI-2400.004"], async () => {
      const runtime = await loadFamilyRuntime();
      const world = runtime.realityWorld();
      const request = {
        requestId: "r", aiActorId: "actor_birdi", worldId: "world_family",
        snapshotId: runtime.currentSnapshot().id, selectors: [{ kind: "root" as const }],
        purpose: "test", traceId: "t"
      };
      const restricted = observeWorld(request, world, {
        id: "actor_birdi", type: "ai", authority: { authenticated: true, permissions: ["world.observe"] }
      });
      assert(restricted.redacted && restricted.redactionCount > 0, "protected measurements redacted for AI");
      assert(!restricted.observedEntityIds.includes("person_emma"), "restricted entity excluded");
      const authorized = observeWorld(request, world, emma);
      assert(authorized.observedEntityIds.includes("person_emma"), "authorized observation sees more");
    }),
    defineTest("AI-CT-003", "Prompt context separates Reality from Candidate and preserves uncertainty", ["AI-2400.005"], async () => {
      const runtime = await loadFamilyRuntime();
      const simulated = await runtime.simulate(garmentCreate(emma, "garment_dream", "simulate"));
      const candidateWorld = runtime.candidateWorldState(simulated.candidateWorldId ?? "");
      const context = buildPromptContext({
        contextId: "ctx_2", aiActor: birdi(),
        actor: { id: "actor_birdi", type: "ai", authority: { authenticated: true, permissions: ["world.observe"] } },
        world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id,
        ...(candidateWorld !== undefined ? { candidateWorld } : {}),
        candidateWorldId: simulated.candidateWorldId ?? "",
        traceId: "trace_ai", now: FIXED_NOW
      });
      assert((context.realityContext.label as string) === "REALITY", "reality labeled");
      assert(String(context.candidateContext?.label).includes("NOT REALITY"), "candidate labeled as possibility");
      assert(context.uncertainty.some((u) => u.reason === "permission_redaction"), "redaction became uncertainty");
    }),
    defineTest("AI-CT-004", "Uncertainty suppression is noncompliant", ["AI-2400.008"], async () => {
      const context = await familyContext();
      const request = reasoningRequest(context);
      const suppressed = validateReasoningResult(request, {
        requestId: "req_1", aiActorId: "actor_birdi", outputType: "text_explanation",
        status: "completed", confidence: 0.99, result: {}, assumptions: [], uncertainty: [],
        traceId: "trace_ai"
      });
      assert(suppressed.some((d) => d.code === "AI_UNCERTAINTY_SUPPRESSED"), "redacted context requires declared uncertainty");
      const disallowed = validateReasoningResult(request, {
        requestId: "req_1", aiActorId: "actor_birdi", outputType: "projection_hint",
        status: "completed", confidence: 0.5, result: {}, assumptions: [],
        uncertainty: context.uncertainty, traceId: "trace_ai"
      });
      assert(disallowed.some((d) => d.code === "AI_OUTPUT_NOT_ALLOWED"), "unrequested output types rejected");
    }),
    defineTest("AI-CT-005", "Consequential proposals force human confirmation", ["AI-2400.010", "AI-2400.011"], async () => {
      const runtime = await loadFamilyRuntime();
      const commitMessage = garmentCreate(emma, "garment_ai_proposed", "commit", runtime.currentSnapshot().id);
      const proposal = createWILProposal({
        proposalId: "prop_1", aiActorId: "actor_birdi",
        worldId: "world_family", snapshotId: runtime.currentSnapshot().id,
        proposedMessages: [commitMessage],
        intendedOutcome: "add the proposed garment to Reality",
        requiresHumanConfirmation: false, // AI tries to skip confirmation…
        assumptions: [], risks: [{ id: "r1", description: "wardrobe change", severity: "low" }],
        confidence: 0.8, traceId: "trace_ai"
      });
      assert(proposal.requiresHumanConfirmation === true, "…but commit-mode forces confirmation");

      const withheld = releaseProposal(proposal);
      assert(withheld.messages.length === 0, "unconfirmed proposal releases nothing");
      assert(!runtime.realityWorld().entities["garment_ai_proposed"], "Reality untouched by proposal");

      const released = releaseProposal(proposal, {
        confirmationId: "conf_1", actorId: emma.id, aiActorId: "actor_birdi",
        proposalId: "prop_1", worldId: "world_family", snapshotId: runtime.currentSnapshot().id,
        confirmed: true, confirmedAt: FIXED_NOW, traceId: "trace_ai"
      });
      assert(released.messages.length === 1, "confirmation releases the messages");
      const output = await runtime.commit(released.messages[0] as never);
      assert(output.outcome.status === "success", "released proposal executes through Runtime — AI proposes, Runtime disposes");
    }),
    defineTest("AI-CT-006", "AI reasoning is traceable", ["AI-2400.018"], async () => {
      const context = await familyContext();
      const request = reasoningRequest(context);
      const trace = traceReasoning(request, {
        requestId: "req_1", aiActorId: "actor_birdi", outputType: "text_explanation",
        status: "completed", confidence: 0.7, result: { text: "coordinated but not matching" },
        assumptions: [{ id: "a1", statement: "the wedding is formal", source: "world_state", confidence: 0.9, requiresConfirmation: false }],
        uncertainty: context.uncertainty, traceId: "trace_ai"
      }, FIXED_NOW);
      assert(trace.aiActorId === "actor_birdi" && trace.reasoningTask === "recommend", "actor + task preserved");
      assert(trace.assumptions.length === 1 && trace.redactionCount === context.redactionCount, "assumptions and redactions preserved");
    }),
    defineTest("AI-CT-007", "Memory declares source, confidence, sensitivity — inference is never fact", ["AI-2400.014"], async () => {
      const memory = createMemory({
        memoryId: "mem_1", aiActorId: "actor_birdi", source: "user_confirmed",
        content: { prefersEarthTones: true }, confidence: 0.95, sensitivity: "private",
        createdAt: FIXED_NOW, updatedAt: FIXED_NOW, traceId: "trace_ai"
      });
      assert(memory.source === "user_confirmed", "source labeled");
      let threw = false;
      try {
        createMemory({
          memoryId: "mem_2", aiActorId: "actor_birdi", source: "model_inferred",
          content: { secretlyLovesNeon: true }, confidence: 1, sensitivity: "private",
          createdAt: FIXED_NOW, updatedAt: FIXED_NOW, traceId: "trace_ai"
        });
      } catch {
        threw = true;
      }
      assert(threw, "certain inference rejected: remembered does not mean true");
    }),
    defineTest("AI-CT-008", "Refusal preserves trace and offers a safe alternative", ["AI-2400.019"], async () => {
      const context = await familyContext();
      const request = reasoningRequest(context);
      const failure = refuse(
        request,
        "the request would require protected measurement data the AI cannot observe",
        "ask Emma to delegate household.measurements.view, or proceed without fit precision"
      );
      assert(failure.status === "refused" && failure.traceId === "trace_ai", "refusal is traceable");
      assert((failure.safeAlternative ?? "").length > 0, "safe alternative offered");
      assert(!failure.reason.includes("92cm"), "refusal explains without leaking protected values");
    }),
    defineTest("AI-CT-009", "AI cannot commit through the runtime without delegated authority", ["AI-2400.001", "SEC-2300.007"], async () => {
      const runtime = await loadFamilyRuntime();
      const undelegated = await runtime.commit(
        createWILMessage({
          actor: { id: "actor_birdi", type: "ai", authority: { authenticated: true, permissions: ["world.observe"] } },
          intent: { type: "create", reason: "ai tries directly" },
          target: { kind: "entity", id: "garment_sneaky" },
          context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
          mode: "commit",
          payload: { id: "garment_sneaky", type: "garment", containedBy: "closet_emma", aspects: [{ kind: "application", data: { "availability.status": "available" } }] }
        })
      );
      assert(undelegated.outcome.status === "rejected", "runtime rejects undelegated AI commit");
      assert(!runtime.realityWorld().entities["garment_sneaky"], "Reality preserved");
      void guest;
    })
  ]
};
