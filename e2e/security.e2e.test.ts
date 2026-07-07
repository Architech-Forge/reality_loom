/**
 * Security e2e surface (TEST-2500.015): pnpm test:security.
 */
import { describe, expect, it } from "vitest";
import type { WILActor } from "@roc/types";
import { SecurityKernel } from "@roc/security";
import { RuntimeTestHarness, SemanticAssertions } from "@roc/testing";
import { inspectEntity } from "@roc/devtools";
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

describe("security e2e (SEC-2300, TEST-2500.015)", () => {
  it("anonymous actors cannot commit; unauthorized actors are rejected with traces", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc(), { now: NOW });
    const message = createWILMessage({
      actor: emma,
      intent: { type: "create", reason: "attempt" },
      target: { kind: "entity", id: "garment_x" },
      context: { worldId: "world_family", snapshotId: (await harness.currentSnapshot()).id },
      mode: "commit",
      payload: { id: "garment_x", type: "garment", containedBy: "closet_emma", aspects: [{ kind: "application", data: { "availability.status": "available" } }] }
    });
    SemanticAssertions.actorRequired(message);

    const anonymous = { ...message, actor: { ...emma, authority: { authenticated: false, permissions: [] } } };
    const output = await harness.send(anonymous);
    expect(output.outcome.status).toBe("rejected");
    SemanticAssertions.traceExplainsCausality(output.trace);
  });

  it("revocation ends future access; audit preserves history", () => {
    const kernel = new SecurityKernel(() => NOW);
    kernel.registerActor({ actorId: "actor_emma", actorType: "human", authenticated: true, createdAt: NOW, updatedAt: NOW });
    kernel.grantAuthority({
      actorId: "actor_emma", worldScopes: ["world_family"],
      permissions: [{ id: "p1", action: "world.commit", scope: [] }, { id: "p2", action: "admin", scope: [] }]
    });
    const probe = () =>
      kernel.evaluate({ actorId: "actor_emma", action: "world.commit", target: { kind: "world" }, worldId: "world_family", traceId: "t" });
    expect(probe().allowed).toBe(true);
    kernel.revoke({
      revocationId: "r1", actorId: "actor_emma", revokedPermissionIds: ["p1"],
      reason: "policy", revokedByActorId: "actor_emma", createdAt: NOW, traceId: "t"
    });
    expect(probe().allowed).toBe(false);
    expect(kernel.auditLog("actor_emma", "world_family").some((e) => e.action === "revocation")).toBe(true);
  });

  it("protected data is redacted end-to-end: runtime world → devtools inspection", async () => {
    const harness = await RuntimeTestHarness.fromWorldDocument(doc(), { now: NOW });
    const guest: WILActor = { id: "actor_guest", type: "human", authority: { authenticated: true, permissions: [] } };
    const inspection = inspectEntity(harness.wgeRuntime.realityWorld(), "person_emma", guest);
    expect(inspection).toBeDefined();
    if (!inspection) return;
    SemanticAssertions.permissionRedacts(inspection);
    const redactedField = inspection.aspects.flatMap((a) => a.fields).find((f) => f.redacted);
    expect(redactedField?.value).toBe("«redacted»");
    expect(redactedField?.redactionReason).toContain("household.measurements.view");

    const owner = inspectEntity(harness.wgeRuntime.realityWorld(), "person_emma", emma);
    expect(owner?.redactionCount).toBe(0);
  });
});
