/**
 * First End-To-End Demo (REF-1900.019).
 *
 * The demo is not complete until the system can answer: What changed? Why
 * did it change? Who caused it? What was simulated? What became Reality?
 * Why is this visible now?
 */
import type {
  SLIProjectionOutput,
  SLIRenderResult,
  WGESourceUnit,
  WILActor
} from "@roc/types";
import { createCandidateClient, createCompilerClient, WILBuilder } from "@roc/sdk";
import { familyStyleWorld } from "@examples/family-style-world";
import { WGERuntime } from "@wge/runtime";
import { bridgeInteraction, projectionInputFromWorld, projectExperience, recompose } from "@sli/runtime";
import { checkRendererBoundaries, MINIMAL_RENDERER_CAPABILITIES, type SLIRendererAdapter } from "@sli/renderer-contract";

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  displayName: "Emma",
  authority: {
    authenticated: true,
    permissions: [
      "world.observe",
      "world.simulate",
      "world.commit",
      "household.measurements.view"
    ]
  }
};

/** The minimal renderer (REF-1900.017): text-first, meaning-preserving. */
const textRenderer: SLIRendererAdapter = {
  id: "renderer_text",
  platform: "custom",
  capabilities: MINIMAL_RENDERER_CAPABILITIES,
  async render(projection: SLIProjectionOutput): Promise<SLIRenderResult> {
    const rendered = projection.rendererInstructions
      .filter((i) => i.projectionRole !== "hidden")
      .map((i) => i.entityId);
    return { rendererId: "renderer_text", status: "rendered", renderedEntityIds: rendered };
  }
};

export interface DemoResult {
  success: boolean;
  answers: Record<string, string>;
  failures: string[];
}

export async function runDemo(log: (line: string) => void = console.log): Promise<DemoResult> {
  const failures: string[] = [];
  const check = (condition: boolean, criterion: string): void => {
    if (condition) log(`  ✓ ${criterion}`);
    else {
      failures.push(criterion);
      log(`  ✗ ${criterion}`);
    }
  };
  const section = (title: string): void => log(`\n━━ ${title}`);

  // 1–2. Define + compile the Family Style World.
  section("1–2. Define and compile the Family Style World");
  const compiler = createCompilerClient();
  const source: WGESourceUnit = {
    id: "family_style_world",
    format: "wdl",
    content: familyStyleWorld() as unknown as Record<string, unknown>
  };
  const compiled = await compiler.compile({ sources: [source], now: new Date().toISOString() });
  if (!compiled.executableWorld) {
    for (const d of compiled.diagnostics) log(`  compiler: ${d.severity} ${d.code} ${d.message}`);
    return { success: false, answers: {}, failures: ["world failed to compile"] };
  }
  log(`  compiled world "${compiled.executableWorld.worldId}" (${compiled.executableWorld.graph.entitiesById.size} entities)`);

  // 3. Load Executable World into Runtime.
  section("3. Load Executable World into Runtime");
  const runtime = new WGERuntime(compiled.executableWorld);
  const realityBefore = runtime.currentSnapshot();
  check(runtime.lifecycleState === "ready", `Reality Snapshot before simulation: ${realityBefore.id}`);

  // 4–5. WIL simulate message → Candidate World.
  section("4–5. Simulate: draft an outfit plan in a Candidate World");
  const candidates = createCandidateClient(runtime);
  const simulateMessage = WILBuilder.message()
    .actor(emma)
    .intent({ type: "create", reason: "Plan a coordinated family look", objectiveId: "objective_plan_family_look", confidence: 0.9 })
    .target({ kind: "entity", id: "outfit_plan_wedding" })
    .context({ worldId: "world_family", snapshotId: realityBefore.id })
    .mode("simulate")
    .payload({
      id: "outfit_plan_wedding",
      type: "outfit_plan",
      containedBy: "household_primary",
      physicsMagnitude: 0.85,
      aspects: [
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
  const simulated = await candidates.createCandidateWorld(simulateMessage);
  const candidateWorldId = simulated.candidateWorldId ?? "";
  check(simulated.outcome.status === "simulation", `Candidate World branch: ${candidateWorldId}`);
  check(runtime.currentSnapshot().id === realityBefore.id, "Reality untouched by simulation");

  // 6. Traversal collects people, closets, garments.
  section("6. Traversal explores the World");
  const traverseOutput = await runtime.observe(
    WILBuilder.message()
      .actor(emma)
      .intent({ type: "traverse", reason: "collect the family wardrobe graph" })
      .target({ kind: "traversal", id: "traversal_coordinate_group_style" })
      .context({ worldId: "world_family" })
      .mode("observe")
      .build()
  );
  const traversal = traverseOutput.metadata?.traversal as { collectedEntityIds: string[] };
  check(
    traversal.collectedEntityIds.includes("garment_cream_dress") &&
      traversal.collectedEntityIds.includes("person_emma"),
    `Traversal collected ${traversal.collectedEntityIds.length} entities (people, closets, garments)`
  );

  // 7–8. Physics + Outcome + Trace.
  section("7–8. Physics ripple, Outcome, and Trace");
  const physics = simulated.metadata?.physics as
    | { trace: { summary: string }; affectedEntities: { entityId: string }[] }
    | undefined;
  check(physics !== undefined && physics.affectedEntities.length > 1, `Physics Trace: ${physics?.trace.summary ?? "missing"}`);
  const runtimeTrace = runtime.getTrace(simulateMessage.traceId);
  check(runtimeTrace !== undefined, `Runtime Trace: ${runtimeTrace?.summary ?? "missing"}`);

  // 9–10. SLI projects the Candidate World planning workspace; renderer displays it.
  section("9–10. SLI projects the Candidate World; renderer displays it");
  const candidateWorld = runtime.candidateWorldState(candidateWorldId);
  if (!candidateWorld) throw new Error("candidate world state unavailable");
  const candidateRecord = runtime.getCandidateWorld(candidateWorldId);
  const planningInput = projectionInputFromWorld({
    world: candidateWorld,
    snapshotId: candidateRecord?.currentCandidateSnapshotId ?? realityBefore.id,
    actor: emma,
    traceId: simulateMessage.traceId,
    objectiveId: "objective_plan_family_look"
  });
  const planningProjection = await projectExperience(planningInput);
  const primaries = planningProjection.composition.entities.filter((e) => e.role === "primary");
  check(primaries.length === 1, `SLI Projection: primary "${planningProjection.composition.primaryEntityId}" at ${planningProjection.composition.density} density`);
  check(
    planningProjection.accessibilityPlan.readingOrder.length > 0,
    `Accessible Projection Output: ${planningProjection.accessibilityPlan.summary}`
  );
  const renderResult = await textRenderer.render(planningProjection);
  check(
    checkRendererBoundaries(planningProjection, renderResult).length === 0,
    `Renderer displayed ${renderResult.renderedEntityIds.length} entities without reinterpreting projection`
  );

  // 13 (early). Laws protect Reality: merging an unaccepted draft is rejected.
  section("13a. Runtime validates Laws: unaccepted drafts cannot become Reality");
  const prematureMerge = candidates.prepareMerge(candidateWorldId, emma, {
    worldId: "world_family",
    snapshotId: runtime.currentSnapshot().id
  });
  const rejected = await runtime.commit(prematureMerge);
  check(
    rejected.outcome.status === "rejected",
    `Law "law_candidate_acceptance" rejected the premature merge (rejected is a correct outcome)`
  );

  // 11–12. User accepts the plan; the Interaction Bridge creates the Commit message.
  section("11–12. Acceptance: interaction becomes WIL through the Bridge");
  const acceptInCandidate = WILBuilder.message()
    .actor(emma)
    .intent({ type: "modify", reason: "family accepts the outfit plan" })
    .target({ kind: "entity", id: "outfit_plan_wedding" })
    .context({ worldId: "world_family", candidateWorldId })
    .mode("simulate")
    .payload({ aspects: [{ kind: "state", data: { status: "accepted" } }] })
    .build();
  const accepted = await candidates.modifyCandidateWorld(acceptInCandidate);
  check(accepted.outcome.status === "simulation", "Plan accepted inside the Candidate World");

  const comparison = candidates.compareCandidateToReality(candidateWorldId);
  check(
    comparison !== undefined && comparison.equivalent === false,
    `Candidate World comparison: ${comparison?.operationCount ?? 0} operations diverge from Reality`
  );

  const bridged = bridgeInteraction(
    {
      id: "interaction_accept_plan",
      actorId: emma.id,
      projectionId: planningProjection.id,
      interactionType: "accept",
      target: { kind: "candidate_world", id: candidateWorldId },
      context: { worldId: "world_family", snapshotId: runtime.currentSnapshot().id },
      traceId: simulateMessage.traceId
    },
    emma
  );
  check(
    bridged.message !== undefined && bridged.message.mode === "commit",
    `Commit message: bridge produced WIL ${bridged.message?.intent.type}/${bridged.message?.mode}`
  );

  // 13–14. Runtime validates Laws and commits the Snapshot.
  section("13b–14. Commit: the Candidate World becomes Reality");
  if (!bridged.message) throw new Error("bridge produced no message");
  const committed = await runtime.commit(bridged.message);
  check(committed.outcome.status === "success", `New Reality Snapshot: ${committed.snapshot?.id}`);
  check(
    committed.diff !== undefined && committed.diff.fromSnapshotId === realityBefore.id,
    `Diff between Snapshots: ${committed.diff?.operations.length} operations from ${realityBefore.id}`
  );
  check(
    runtime.realityWorld().entities["outfit_plan_wedding"]?.aspects[0]?.data.status === "accepted",
    "The accepted outfit plan now exists in Reality"
  );

  // 15. SLI recomposes from the new Snapshot.
  section("15. SLI recomposes from the new Snapshot");
  const triggers = runtime.drainRecompositionTriggers();
  const recomposed = recompose({
    previousProjection: planningProjection,
    projectionInput: projectionInputFromWorld({
      world: runtime.realityWorld(),
      snapshotId: runtime.currentSnapshot().id,
      actor: emma,
      traceId: committed.outcome.traceId,
      objectiveId: "objective_plan_family_look",
      recompositionTriggers: triggers
    }),
    triggers,
    reason: "outfit plan committed to Reality",
    traceId: committed.outcome.traceId
  });
  check(
    recomposed.composition.entities.some((e) => e.entityId === "outfit_plan_wedding" && e.role !== "hidden"),
    "Recomposed experience includes the committed plan"
  );

  // 16. The trace explains what happened.
  section("16. The system answers the demo questions");
  const answers: Record<string, string> = {
    "What changed?": `${committed.diff?.operations.length} diff operations created "${"outfit_plan_wedding"}" and advanced Reality ${realityBefore.id} → ${committed.snapshot?.id}`,
    "Why did it change?": `Law "law_candidate_acceptance" passed once state.status became "accepted"; trace: ${committed.trace.summary}`,
    "Who caused it?": `${emma.displayName} (${emma.id}), authenticated, holding world.commit`,
    "What was simulated?": `Candidate World ${candidateWorldId}: draft plan, physics ripple, acceptance — all isolated from Reality`,
    "What became Reality?": `Snapshot ${committed.snapshot?.id} with the accepted outfit plan (cream dress, gray suit, rain boots)`,
    "Why is this visible now?": recomposed.composition.entities.find((e) => e.entityId === "outfit_plan_wedding")?.reason ?? "composed into the recomposed experience"
  };
  for (const [question, answer] of Object.entries(answers)) log(`  ${question} ${answer}`);

  const success = failures.length === 0;
  log(success ? "\n✅ First End-To-End Demo complete: the platform loop is proven." : `\n❌ Demo failed ${failures.length} criteria.`);
  return { success, answers, failures };
}
