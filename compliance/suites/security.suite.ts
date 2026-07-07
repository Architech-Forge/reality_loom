/**
 * Official compliance suite — Security & Permissions (COMP-2000.020,
 * SEC-2300.021). Visibility is not authorization.
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest, deferTest } from "@roc/compliance";
import { SecurityKernel, type ROCDelegation, type ROCPermission } from "@roc/security";
import { assert, FIXED_NOW } from "./helpers.js";

const LATER = "2026-07-07T00:00:00Z";
const EARLIER = "2026-07-06T00:00:00Z";

const perm = (id: string, action: ROCPermission["action"]): ROCPermission => ({
  id,
  action,
  scope: []
});

function kernelWithEmma(now = FIXED_NOW): SecurityKernel {
  const kernel = new SecurityKernel(() => now);
  kernel.registerActor({
    actorId: "actor_emma", actorType: "human", authenticated: true,
    createdAt: FIXED_NOW, updatedAt: FIXED_NOW
  });
  kernel.registerActor({
    actorId: "actor_birdi", actorType: "ai", authenticated: true,
    createdAt: FIXED_NOW, updatedAt: FIXED_NOW
  });
  kernel.grantAuthority({
    actorId: "actor_emma",
    worldScopes: ["world_family"],
    permissions: [perm("p_observe", "world.observe"), perm("p_commit", "world.commit"), perm("p_admin", "admin")]
  });
  return kernel;
}

const commitProbe = (kernel: SecurityKernel, actorId: string, traceId: string) =>
  kernel.evaluate({
    actorId, action: "world.commit", target: { kind: "world" },
    worldId: "world_family", traceId
  });

export const securitySuite: ROCComplianceSuite = {
  id: "suite_security_privacy",
  area: "security_privacy",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("SEC-CT-002", "AI Actor cannot inherit human authority automatically", ["SEC-2300.006", "SEC-2300.007"], async () => {
      const kernel = kernelWithEmma();
      const denied = commitProbe(kernel, "actor_birdi", "t1");
      assert(!denied.allowed, "AI without delegation is denied");
      assert(denied.diagnostics?.[0]?.code === "SEC_AI_NO_DELEGATION", "denial explains the delegation requirement");

      const delegation: ROCDelegation = {
        delegationId: "del_1", fromActorId: "actor_emma", toActorId: "actor_birdi",
        permissions: [perm("p_del_commit", "world.commit")], worldScopes: ["world_family"],
        reason: "Emma delegates outfit commits to Birdi", createdAt: FIXED_NOW, expiresAt: LATER, traceId: "t_del"
      };
      kernel.delegate(delegation);
      assert(commitProbe(kernel, "actor_birdi", "t2").allowed, "explicit delegation grants authority");
    }),
    defineTest("SEC-CT-002b", "Expired delegations grant nothing", ["SEC-2300.006"], async () => {
      const kernel = kernelWithEmma();
      kernel.delegate({
        delegationId: "del_expired", fromActorId: "actor_emma", toActorId: "actor_birdi",
        permissions: [perm("p_exp", "world.commit")], worldScopes: ["world_family"],
        reason: "old delegation", createdAt: EARLIER, expiresAt: EARLIER, traceId: "t"
      });
      assert(!commitProbe(kernel, "actor_birdi", "t3").allowed, "expired delegation is dead");
    }),
    defineTest("SEC-CT-003", "Permission revocation prevents later Commit", ["SEC-2300.018"], async () => {
      const kernel = kernelWithEmma();
      assert(commitProbe(kernel, "actor_emma", "t4").allowed, "commit allowed before revocation");
      kernel.revoke({
        revocationId: "rev_1", actorId: "actor_emma", revokedPermissionIds: ["p_commit"],
        reason: "household policy change", revokedByActorId: "actor_emma", createdAt: FIXED_NOW, traceId: "t_rev"
      });
      assert(!commitProbe(kernel, "actor_emma", "t5").allowed, "revocation removes future access");
      const audit = kernel.auditLog("actor_emma", "world_family");
      assert(audit.some((e) => e.action === "world.commit" && e.allowed), "history preserved: past allow audited");
      assert(audit.some((e) => e.action === "revocation"), "revocation itself audited");
    }),
    defineTest("SEC-CT-009", "Candidate creation permission is not merge permission", ["SEC-2300.013"], async () => {
      const kernel = kernelWithEmma();
      kernel.grantAuthority({
        actorId: "actor_birdi", worldScopes: ["world_family"],
        permissions: [perm("p_sim", "world.simulate"), perm("p_cv", "candidate.view")]
      });
      const simulate = kernel.evaluate({
        actorId: "actor_birdi", action: "world.simulate", target: { kind: "candidate_world" },
        worldId: "world_family", traceId: "t6"
      });
      const merge = kernel.evaluate({
        actorId: "actor_birdi", action: "candidate.merge", target: { kind: "candidate_world" },
        worldId: "world_family", traceId: "t7"
      });
      assert(simulate.allowed && !merge.allowed, "simulation permission ≠ commit/merge permission");
    }),
    defineTest("SEC-CT-011", "Unauthenticated is distinguished from unauthorized", ["SEC-2300.019"], async () => {
      const kernel = kernelWithEmma();
      kernel.registerActor({
        actorId: "actor_ghost", actorType: "human", authenticated: false,
        createdAt: FIXED_NOW, updatedAt: FIXED_NOW
      });
      const unauthenticated = commitProbe(kernel, "actor_ghost", "t8");
      assert(unauthenticated.diagnostics?.[0]?.category === "authentication", "unauthenticated is an authentication failure");
      kernel.registerActor({
        actorId: "actor_stranger", actorType: "human", authenticated: true,
        createdAt: FIXED_NOW, updatedAt: FIXED_NOW
      });
      const unauthorized = commitProbe(kernel, "actor_stranger", "t9");
      assert(unauthorized.diagnostics?.[0]?.category === "authorization", "unauthorized is an authorization failure");
      assert(
        !unauthorized.reason.includes("measurement") && unauthorized.reason.length > 0,
        "denial explains without exposing the protected thing"
      );
    }),
    defineTest("SEC-CT-012", "Authority is scope-bound: one World grants nothing elsewhere", ["SEC-2300.004", "SEC-2300.016"], async () => {
      const kernel = kernelWithEmma();
      const elsewhere = kernel.evaluate({
        actorId: "actor_emma", action: "world.commit", target: { kind: "world" },
        worldId: "world_sentii_company", traceId: "t10"
      });
      assert(!elsewhere.allowed, "authority in world_family does not reach other worlds");
    }),
    defineTest("SEC-CT-013", "Audit logs are permission-protected and evidence-complete", ["SEC-2300.017"], async () => {
      const kernel = kernelWithEmma();
      commitProbe(kernel, "actor_birdi", "t11"); // a denial to audit
      let refused = false;
      try {
        kernel.auditLog("actor_birdi", "world_family"); // no admin
      } catch {
        refused = true;
      }
      assert(refused, "non-admin cannot read audit logs");
      const audit = kernel.auditLog("actor_emma", "world_family");
      assert(audit.some((e) => !e.allowed && e.actorId === "actor_birdi"), "denials leave evidence");
    }),
    defineTest("SEC-CT-014", "Security bridges into WIL authority for the runtime", ["SEC-2300.004", "APP-1700.014"], async () => {
      const kernel = kernelWithEmma();
      const authority = kernel.authorityAsWIL("actor_emma", "world_family");
      assert(authority.authenticated && authority.permissions.includes("world.commit"), "WIL authority derived from evaluation");
      assert(!kernel.authorityAsWIL("actor_birdi", "world_family").permissions.includes("world.commit"), "AI stays bounded in WIL too");
    }),
    deferTest("SEC-CT-010", "Replay respects historical authority and current access rules", ["SEC-2300.018"],
      "replay runtime arrives with the tooling phase; audit history already preserves historical authority context"),
    deferTest("SEC-CT-016", "Federated access preserves World boundaries", ["SEC-2300.016"],
      "federation arrives with the federation phase; scope-bound authority already refuses cross-World access (SEC-CT-012)")
  ]
};
