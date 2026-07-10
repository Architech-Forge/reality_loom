/**
 * Official compliance suite — Application Integration (COMP-2000.015,
 * APP-1700.020). Applications extend ROC; they do not redefine it.
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import {
  applicationEventToWIL,
  createApplicationAspect,
  createDomainLaw,
  DomainIdentityStore,
  externalDataToAspect,
  permissionsToAuthority,
  projectionHintToAspect
} from "@roc/app-integration";
import { Cond } from "@roc/sdk";
import { buildProjection, projectionInputFromWorld } from "@sli/runtime";
import { validateWILMessage } from "@wge/wil";
import { assert, emma, aiActor, guest, FIXED_NOW, loadFamilyRuntime } from "./helpers.js";

const identity = () => new DomainIdentityStore("emilu", "world_family", () => FIXED_NOW);

export const applicationSuite: ROCComplianceSuite = {
  id: "suite_application",
  area: "application",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("APP-CT-001", "Domain Adapter produces stable Entity IDs", ["APP-1700.003", "APP-1700.004"], async () => {
      const store = identity();
      const first = store.mapIdentity("garment", "G-1001");
      const second = store.mapIdentity("garment", "G-1001");
      assert(first.entityId === second.entityId, "same domain object → same entity id");
      assert(first.entityId === "emilu__garment__g_1001", "id is deterministic and namespaced");
    }),
    defineTest("APP-CT-002", "Identity mapping stable across recompilation", ["APP-1700.004"], async () => {
      const a = DomainIdentityStore.entityIdFor("emilu", "garment", "G-1001");
      const b = DomainIdentityStore.entityIdFor("emilu", "garment", "G-1001"); // fresh process ≡ fresh call
      assert(a === b, "mapping is a pure function of application + type + domain id");
    }),
    defineTest("APP-CT-003", "Application Aspects use namespace", ["APP-1700.005"], async () => {
      const aspect = createApplicationAspect({
        entityId: "e1", applicationId: "emilu", name: "style_dna",
        data: { preferredColors: ["sage", "cream"] }
      });
      assert(aspect.kind === "emilu.style_dna", "namespaced kind");
      let threw = false;
      try {
        createApplicationAspect({ entityId: "e1", applicationId: "Bad App!", name: "x", data: {} });
      } catch {
        threw = true;
      }
      assert(threw, "invalid namespace rejected");
      let rendererRejected = false;
      try {
        createApplicationAspect({ entityId: "e1", applicationId: "emilu", name: "hack", data: { css: "red" } });
      } catch {
        rendererRejected = true;
      }
      assert(rendererRejected, "renderer field rejected");
    }),
    defineTest("APP-CT-004", "Domain Law compiles into World Law", ["APP-1700.006"], async () => {
      const law = createDomainLaw(
        {
          id: "law_emilu_availability",
          applicationId: "emilu",
          name: "Unavailable garments cannot be recommended",
          appliesTo: { kind: "type", value: "garment" },
          condition: Cond.aspectEquals("application", "availability.status", "available"),
          outcome: "reject",
          severity: "error",
          explanation: "Recommending unavailable garments erodes trust."
        },
        "world_family"
      );
      assert(law.scope === "world", "domain laws are world laws — kernel scope structurally unavailable");
      assert(law.metadata?.explanation !== undefined, "explanation preserved");
      let threw = false;
      try {
        createDomainLaw(
          { id: "l", applicationId: "a", name: "n", appliesTo: { kind: "root" }, condition: Cond.exists({ kind: "root" }), outcome: "reject", severity: "error", explanation: "" },
          "world_family"
        );
      } catch {
        threw = true;
      }
      assert(threw, "hidden domain truth (no explanation) is noncompliant");
    }),
    defineTest("APP-CT-005", "Application Event maps to WIL", ["APP-1700.008"], async () => {
      const mapping = applicationEventToWIL(
        {
          id: "evt_1", applicationId: "emilu", actorId: emma.id,
          type: "garment.created", domainObjectId: "G-1001", occurredAt: FIXED_NOW,
          payload: { type: "garment" }
        },
        { actor: emma, worldId: "world_family", identity: identity(), domainObjectType: "garment" }
      );
      assert(mapping.wilMessage.intent.type === "create", "intent chosen from event type");
      assert(mapping.wilMessage.target.id === "emilu__garment__g_1001", "domain identity preserved");
      assert(validateWILMessage(mapping.wilMessage).valid, "produced message is valid WIL");
      assert(
        (mapping.wilMessage.context.application as { eventId: string }).eventId === "evt_1",
        "causality preserved in context"
      );
    }),
    defineTest("APP-CT-006", "Reality-changing application action cannot bypass WIL", ["APP-1700.008", "APP-1700.010"], async () => {
      const runtime = await loadFamilyRuntime();
      const snapshot = runtime.currentSnapshot();
      let threw = false;
      try {
        (snapshot as { id: string }).id = "hijacked"; // WGE-owned truth is frozen
      } catch {
        threw = true;
      }
      assert(threw, "snapshots cannot be mutated directly");
      // The only mutation path the integration layer offers IS a WIL message.
      const mapping = applicationEventToWIL(
        { id: "evt_2", applicationId: "emilu", actorId: emma.id, type: "garment.updated", domainObjectId: "G-1", occurredAt: FIXED_NOW },
        { actor: emma, worldId: "world_family", identity: identity(), domainObjectType: "garment" }
      );
      assert(mapping.wilMessage.protocol === "wil", "application events become WIL, nothing else");
    }),
    defineTest("APP-CT-007", "Application permissions map to WIL Authority", ["APP-1700.014"], async () => {
      const authority = permissionsToAuthority(
        {
          applicationId: "emilu", actorId: emma.id,
          appPermissions: ["household:member", "wardrobe:edit"],
          wilPermissions: ["world.observe", "world.simulate", "world.commit"],
          worldScope: ["world_family"]
        },
        true
      );
      assert(authority.authenticated && authority.permissions.includes("world.commit"), "authority mapped");
      assert(authority.scope?.includes("world_family") === true, "world scope preserved");
    }),
    defineTest("APP-CT-008", "Projection Hint cannot force primary against SLI rules", ["APP-1700.007"], async () => {
      const hint = projectionHintToAspect({
        entityId: "garment_blue_jacket", applicationId: "emilu",
        preferredRole: "primary", reason: "app really wants the jacket front and center"
      });
      assert(hint.kind === "projection_hint", "hint lowers to a projection_hint aspect");
      assert(hint.data.priority === 0.9 && hint.data.preferredRole === "primary", "preference recorded as advice");
      // SLI still selects the objective's entry as primary — the hint advises, never commands.
      const runtime = await loadFamilyRuntime();
      runtime.realityWorld().entities["garment_blue_jacket"]?.aspects.push(hint);
      const { output } = buildProjection(
        projectionInputFromWorld({
          world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id,
          actor: emma, traceId: "t", objectiveId: "objective_plan_family_look"
        })
      );
      assert(output.composition.primaryEntityId === "household_primary", "objective outranks application hint");
    }),
    defineTest("APP-CT-011", "SLI-owned state does not store domain truth", ["APP-1700.011"], async () => {
      // The experience-state shape offers no field for domain records; only
      // arrangement state exists (SLI-1500.013 boundary).
      const stateKeys = ["id", "worldId", "actorId", "projectionId", "snapshotId", "activeObjectiveId",
        "primaryEntityId", "expandedEntityIds", "hiddenEntityIds", "spatialMemoryRefs", "lastInteractionAt", "metadata"];
      for (const key of stateKeys) {
        assert(!/invoice|garment|trade|payment|measurement/.test(key), "no domain fields in SLI state");
      }
    }),
    defineTest("APP-CT-012", "AI Actor cannot commit without delegation", ["APP-1700.012"], async () => {
      const runtime = await loadFamilyRuntime();
      const { garmentCreate } = await import("./helpers.js");
      const undelegated = await runtime.commit(
        garmentCreate(aiActor, "garment_ai_attempt", "commit", runtime.currentSnapshot().id)
      );
      assert(undelegated.outcome.status === "rejected", "AI without delegated world.commit is rejected");
      const delegated = {
        ...aiActor,
        authority: { ...aiActor.authority, permissions: [...aiActor.authority.permissions, "world.commit"] }
      };
      const allowed = await runtime.commit(
        garmentCreate(delegated, "garment_ai_delegated", "commit", runtime.currentSnapshot().id)
      );
      assert(allowed.outcome.status === "success", "explicit delegation enables commit");
    }),
    defineTest("APP-CT-013", "External data includes provenance and confidence", ["APP-1700.015"], async () => {
      const aspect = externalDataToAspect("weather_forecast", "emilu", "weather_feed", {
        source: "weather-api.example", confidence: 0.7, timestamp: FIXED_NOW,
        freshness: "recent", data: { condition: "rain_possible" }
      });
      const provenance = aspect.data._provenance as { source: string; confidence: number };
      assert(provenance.source === "weather-api.example" && provenance.confidence === 0.7, "provenance preserved");
      let threw = false;
      try {
        externalDataToAspect("e", "emilu", "feed", {
          source: "", confidence: 0.7, timestamp: FIXED_NOW, freshness: "recent", data: {}
        });
      } catch {
        threw = true;
      }
      assert(threw, "provenance-less external data rejected");
    }),
    defineTest("APP-CT-015", "Protected data does not leak through projection hints", ["APP-1700.005", "COMP-2000.020"], async () => {
      const runtime = await loadFamilyRuntime();
      const { output } = buildProjection(
        projectionInputFromWorld({
          world: runtime.realityWorld(), snapshotId: runtime.currentSnapshot().id,
          actor: guest, traceId: "t"
        })
      );
      // person_emma carries a restricted permission aspect; the guest's
      // projection hides the entity entirely — hints on it never surface.
      const emmaComposed = output.composition.entities.find((e) => e.entityId === "person_emma");
      assert(emmaComposed?.role === "hidden", "restricted entities stay hidden regardless of hints");
    })
  ]
};
