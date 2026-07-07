/**
 * @roc/security — Security & Permissions.
 *
 * Volume 2300 (SEC-2300.001 – SEC-2300.021). Every interaction with Reality
 * must answer: who is acting, what may they see, what may they change, what
 * must be redacted, what must be audited. Authentication proves identity —
 * it does not automatically grant permission. AI may propose; Runtime
 * disposes. Revocation changes future access; it does not rewrite history.
 */
import type { ROCDiagnostic, WGETimestamp, WILAuthority, WILTarget, WILTraceStep } from "@roc/types";

/** SEC-2300.002 — Actor Identity. */
export interface ROCActorIdentity {
  actorId: string;

  actorType:
    | "human"
    | "ai"
    | "runtime"
    | "scheduler"
    | "application"
    | "automation"
    | "external_system"
    | "system";

  displayName?: string;

  applicationId?: string;
  organizationId?: string;
  householdId?: string;
  worldId?: string;

  authenticated: boolean;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** SEC-2300.003 — Authentication Boundary. */
export interface ROCAuthenticationResult {
  authenticated: boolean;

  actorId?: string;

  actorType?: ROCActorIdentity["actorType"];

  provider?: string;

  sessionId?: string;

  expiresAt?: WGETimestamp;

  diagnostics?: ROCDiagnostic[];
}

/** SEC-2300.004 — Authority Model. Authority is not global by default. */
export type ROCPermissionAction =
  | "world.observe"
  | "world.simulate"
  | "world.commit"
  | "world.replay"
  | "entity.view"
  | "entity.create"
  | "entity.modify"
  | "entity.archive"
  | "relationship.view"
  | "relationship.create"
  | "relationship.modify"
  | "aspect.view"
  | "aspect.modify"
  | "trace.view"
  | "candidate.view"
  | "candidate.merge"
  | "projection.view"
  | "admin";

export interface ROCPermissionCondition {
  kind: "target_id" | "target_kind";
  value: string;
}

export interface ROCPermission {
  id: string;

  action: ROCPermissionAction;

  scope: string[];

  conditions?: ROCPermissionCondition[];
}

export interface ROCAuthorityConstraint {
  kind: "expires" | "world_only" | "read_only";
  value?: string;
}

export interface ROCAuthority {
  actorId: string;

  worldScopes: string[];

  permissions: ROCPermission[];

  delegatedFromActorId?: string;

  expiresAt?: WGETimestamp;

  constraints?: ROCAuthorityConstraint[];

  metadata?: Record<string, unknown>;
}

/** SEC-2300.005 — Permission Evaluation. */
export interface ROCPermissionEvaluationInput {
  actorId: string;

  action: ROCPermissionAction;

  target: WILTarget;

  worldId: string;
  snapshotId?: string;

  requestedFields?: string[];

  traceId: string;
}

export interface ROCPermissionEvaluationOutput {
  allowed: boolean;

  partial?: boolean;

  deniedFields?: string[];

  redactedFields?: string[];

  reason: string;

  appliedPermissionIds: string[];

  diagnostics?: ROCSecurityDiagnostic[];

  traceStep: WILTraceStep;
}

/** SEC-2300.006 — Delegation. Acting on behalf of someone is not being them. */
export interface ROCDelegation {
  delegationId: string;

  fromActorId: string;
  toActorId: string;

  permissions: ROCPermission[];

  worldScopes: string[];

  reason: string;

  createdAt: WGETimestamp;
  expiresAt: WGETimestamp;

  revokedAt?: WGETimestamp;

  traceId: string;
}

/** SEC-2300.018 — Revocation. */
export interface ROCRevocation {
  revocationId: string;

  actorId: string;

  revokedPermissionIds?: string[];
  revokedDelegationIds?: string[];

  scope?: string[];

  reason: string;

  revokedByActorId: string;

  createdAt: WGETimestamp;

  traceId: string;
}

/** SEC-2300.017 — Audit Logs. Sensitive actions must leave evidence. */
export interface ROCAuditEvent {
  auditEventId: string;

  actorId: string;

  worldId?: string;
  targetId?: string;

  action: string;

  allowed: boolean;

  reason: string;

  traceId?: string;
  messageId?: string;
  transactionId?: string;

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** SEC-2300.019 — Security Diagnostics. Explain denial without leaking. */
export interface ROCSecurityDiagnostic {
  code: string;

  severity: "error" | "warning" | "info";

  category:
    | "authentication"
    | "authorization"
    | "delegation"
    | "redaction"
    | "privacy"
    | "federation"
    | "storage"
    | "projection"
    | "audit";

  message: string;

  reason: string;

  actorId?: string;
  targetId?: string;
  worldId?: string;

  traceId?: string;

  suggestedResolution?: string;
}

/** SEC-2300.008 — Entity Visibility levels. */
export type ROCEntityVisibility = "public" | "world" | "shared" | "private" | "restricted" | "hidden";

/**
 * The Security Kernel: registers actors, grants and delegates authority,
 * evaluates permissions in the SEC-2300.005 order, revokes future access
 * without rewriting history, and audits everything sensitive.
 */
export class SecurityKernel {
  private readonly actors = new Map<string, ROCActorIdentity>();
  private readonly authorities = new Map<string, ROCAuthority[]>();
  private readonly delegations = new Map<string, ROCDelegation>();
  private readonly revokedPermissionIds = new Set<string>();
  private readonly audit: ROCAuditEvent[] = [];
  private sequence = 0;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  registerActor(identity: ROCActorIdentity): void {
    this.actors.set(identity.actorId, structuredClone(identity));
  }

  getActor(actorId: string): ROCActorIdentity | undefined {
    return this.actors.get(actorId);
  }

  grantAuthority(authority: ROCAuthority): void {
    const list = this.authorities.get(authority.actorId) ?? [];
    list.push(structuredClone(authority));
    this.authorities.set(authority.actorId, list);
    this.record(authority.actorId, "authority.granted", true, `granted ${authority.permissions.map((p) => p.id).join(", ")}`);
  }

  /** SEC-2300.006: AI (or anyone) gains borrowed authority only explicitly, time-bound. */
  delegate(delegation: ROCDelegation): void {
    if (!delegation.expiresAt) {
      throw new Error("Delegation MUST be time-bound (SEC-2300.006)");
    }
    this.delegations.set(delegation.delegationId, structuredClone(delegation));
    this.record(delegation.toActorId, "delegation.created", true, `from ${delegation.fromActorId}: ${delegation.reason}`, delegation.traceId);
  }

  /** SEC-2300.018: future access removed; history and audit preserved. */
  revoke(revocation: ROCRevocation): void {
    for (const id of revocation.revokedPermissionIds ?? []) this.revokedPermissionIds.add(id);
    for (const id of revocation.revokedDelegationIds ?? []) {
      const delegation = this.delegations.get(id);
      if (delegation) delegation.revokedAt = revocation.createdAt;
    }
    this.record(revocation.actorId, "revocation", true, revocation.reason, revocation.traceId);
  }

  /** SEC-2300.005 — evaluation order: authenticate → authority → scopes → target → trace. */
  evaluate(input: ROCPermissionEvaluationInput): ROCPermissionEvaluationOutput {
    const actor = this.actors.get(input.actorId);
    const deny = (
      reason: string,
      category: ROCSecurityDiagnostic["category"],
      code: string
    ): ROCPermissionEvaluationOutput => {
      this.record(input.actorId, input.action, false, reason, input.traceId, input.target.id);
      return {
        allowed: false,
        reason,
        appliedPermissionIds: [],
        diagnostics: [
          {
            code,
            severity: "error",
            category,
            message: `${input.action} denied`,
            reason,
            actorId: input.actorId,
            worldId: input.worldId,
            traceId: input.traceId,
            suggestedResolution:
              category === "authentication"
                ? "authenticate the actor before requesting authority"
                : `obtain a permission granting ${input.action} scoped to ${input.worldId}`
          }
        ],
        traceStep: {
          order: 1,
          phase: "authorized",
          status: "blocked",
          reason
        }
      };
    };

    // 1. Authenticate — unauthenticated is distinguished from unauthorized.
    if (!actor) return deny("actor is not registered", "authentication", "SEC_UNKNOWN_ACTOR");
    if (!actor.authenticated && input.action !== "world.observe") {
      return deny("actor is not authenticated", "authentication", "SEC_UNAUTHENTICATED");
    }

    // 2. Load authority: direct grants + active, unrevoked, unexpired delegations.
    const now = this.now();
    const direct = (this.authorities.get(input.actorId) ?? []).filter(
      (a) => a.expiresAt === undefined || a.expiresAt > now
    );
    const delegated = [...this.delegations.values()].filter(
      (d) => d.toActorId === input.actorId && d.revokedAt === undefined && d.expiresAt > now
    );

    // 3–4. World scope + action + revocation + conditions.
    const candidates: Array<{
      id: string;
      scope: string[];
      conditions?: ROCPermissionCondition[] | undefined;
    }> = [
      ...direct.flatMap((a) =>
        a.permissions
          .filter((p) => p.action === input.action)
          .map((p) => ({ id: p.id, scope: [...a.worldScopes, ...p.scope], conditions: p.conditions }))
      ),
      ...delegated.flatMap((d) =>
        d.permissions
          .filter((p) => p.action === input.action)
          .map((p) => ({ id: p.id, scope: [...d.worldScopes, ...p.scope], conditions: p.conditions }))
      )
    ];
    const applicable = candidates.filter(
      (c) =>
        !this.revokedPermissionIds.has(c.id) &&
        (c.scope.includes(input.worldId) || c.scope.includes("*")) &&
        (c.conditions ?? []).every((condition) =>
          condition.kind === "target_id"
            ? input.target.id === condition.value
            : input.target.kind === condition.value
        )
    );

    if (applicable.length === 0) {
      const hadDelegationPath = actor.actorType === "ai" && delegated.length === 0;
      return deny(
        hadDelegationPath
          ? "AI actors do not inherit human authority; an explicit delegation is required (SEC-2300.007)"
          : `no unrevoked permission grants ${input.action} in world ${input.worldId}`,
        hadDelegationPath ? "delegation" : "authorization",
        hadDelegationPath ? "SEC_AI_NO_DELEGATION" : "SEC_UNAUTHORIZED"
      );
    }

    const appliedPermissionIds = applicable.map((c) => c.id).sort();
    this.record(input.actorId, input.action, true, `permitted by ${appliedPermissionIds.join(", ")}`, input.traceId, input.target.id);
    return {
      allowed: true,
      reason: `permitted by ${appliedPermissionIds.join(", ")}`,
      appliedPermissionIds,
      traceStep: {
        order: 1,
        phase: "authorized",
        status: "passed",
        reason: `${input.action} permitted in ${input.worldId}`
      }
    };
  }

  /** Bridge to WIL: current effective authority as a message-ready WILAuthority. */
  authorityAsWIL(actorId: string, worldId: string): WILAuthority {
    const actions: ROCPermissionAction[] = ["world.observe", "world.simulate", "world.commit", "candidate.merge", "trace.view"];
    const actor = this.actors.get(actorId);
    const permissions = actions.filter(
      (action) =>
        this.evaluate({
          actorId,
          action,
          target: { kind: "world" },
          worldId,
          traceId: `trace_authority_probe_${++this.sequence}`
        }).allowed
    );
    return { authenticated: actor?.authenticated === true, permissions, scope: [worldId] };
  }

  /** SEC-2300.017 — audit access itself requires admin authority. */
  auditLog(requestingActorId: string, worldId: string): ROCAuditEvent[] {
    const check = this.evaluate({
      actorId: requestingActorId,
      action: "admin",
      target: { kind: "world" },
      worldId,
      traceId: `trace_audit_access_${++this.sequence}`
    });
    if (!check.allowed) {
      throw new Error("audit logs are permission-protected (SEC-2300.017)");
    }
    return structuredClone(this.audit);
  }

  /** Internal: append-only audit record. */
  private record(
    actorId: string,
    action: string,
    allowed: boolean,
    reason: string,
    traceId?: string,
    targetId?: string
  ): void {
    this.audit.push({
      auditEventId: `audit_${++this.sequence}`,
      actorId,
      action,
      allowed,
      reason,
      ...(traceId !== undefined ? { traceId } : {}),
      ...(targetId !== undefined ? { targetId } : {}),
      createdAt: this.now()
    });
  }
}
