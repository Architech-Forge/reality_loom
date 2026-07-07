/**
 * @roc/app-integration — Application Integration contracts.
 *
 * Volume 1700 (APP-1700.001 – APP-1700.020) and SDK-1800.014.
 * Applications extend ROC; they do not redefine it. Every Reality-changing
 * application action becomes WIL; domain adapters describe Reality, never
 * project experience.
 */
import type {
  ROCDiagnostic,
  SLIDensityLevel,
  SLIInteractionLevel,
  WGEAspect,
  WGELaw,
  WGELawCondition,
  WGELawOutcome,
  WGESelector,
  WGETimestamp,
  WGEVisibility,
  WILActor,
  WILAuthority,
  WILIntentType,
  WILMessage
} from "@roc/types";
import { createAspect, createLaw } from "@wge/kernel";
import { createWILMessage } from "@wge/wil";

export type ROCIntegrationDiagnostic = ROCDiagnostic;

/** APP-1700.004 — Domain Identity Mapping. */
export interface ROCDomainIdentityMap {
  applicationId: string;

  domainObjectType: string;
  domainObjectId: string;

  worldId: string;
  entityId: string;

  version: number;

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;
}

/**
 * Stable, deterministic identity mapping: the same domain object always maps
 * to the same Entity id — across processes and recompilations. The same
 * domain object never produces multiple active Entities.
 */
export class DomainIdentityStore {
  private readonly maps = new Map<string, ROCDomainIdentityMap>();

  constructor(
    private readonly applicationId: string,
    private readonly worldId: string,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  /** Deterministic entity id: pure function of application + type + domain id. */
  static entityIdFor(applicationId: string, domainObjectType: string, domainObjectId: string): string {
    const slug = (value: string): string =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return `${slug(applicationId)}__${slug(domainObjectType)}__${slug(domainObjectId)}`;
  }

  mapIdentity(domainObjectType: string, domainObjectId: string): ROCDomainIdentityMap {
    const key = `${domainObjectType}:${domainObjectId}`;
    const existing = this.maps.get(key);
    if (existing) {
      existing.version += 1;
      existing.updatedAt = this.now();
      return existing;
    }
    const created: ROCDomainIdentityMap = {
      applicationId: this.applicationId,
      domainObjectType,
      domainObjectId,
      worldId: this.worldId,
      entityId: DomainIdentityStore.entityIdFor(this.applicationId, domainObjectType, domainObjectId),
      version: 1,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.maps.set(key, created);
    return created;
  }

  all(): ROCDomainIdentityMap[] {
    return [...this.maps.values()];
  }
}

/** APP-1700.005 — Application Aspect Namespace: <application_id>.<aspect_name>. */
const NAMESPACE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*$/;
const RENDERER_FIELDS = new Set(["react", "dom", "css", "html", "component", "route"]);

export interface ApplicationAspectInput {
  entityId: string;
  applicationId: string;
  name: string;
  data: Record<string, unknown>;
  schemaVersion?: string;
  visibility?: WGEVisibility;
}

export function createApplicationAspect(input: ApplicationAspectInput): WGEAspect {
  const kind = `${input.applicationId}.${input.name}`;
  if (!NAMESPACE_PATTERN.test(kind)) {
    throw new Error(
      `Application aspect kind "${kind}" must use the <application_id>.<aspect_name> namespace (APP-1700.005)`
    );
  }
  for (const key of Object.keys(input.data)) {
    if (RENDERER_FIELDS.has(key.toLowerCase())) {
      throw new Error(
        `Application aspect "${kind}" carries renderer-specific field "${key}" (APP-1700.005: no renderer fields)`
      );
    }
  }
  JSON.stringify(input.data); // must be serializable
  return createAspect({
    id: `aspect_${input.entityId}__${kind}`,
    entityId: input.entityId,
    kind,
    data: input.data,
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    metadata: { schemaVersion: input.schemaVersion ?? "1.0.0", applicationId: input.applicationId }
  });
}

/** APP-1700.006 — Domain Law Contract. Hidden domain truth is noncompliant. */
export interface ROCDomainLaw {
  id: string;

  applicationId: string;

  name: string;

  appliesTo: WGESelector;

  condition: WGELawCondition;

  outcome: WGELawOutcome;

  severity: "error" | "warning" | "suggestion";

  explanation: string;

  metadata?: Record<string, unknown>;
}

export function createDomainLaw(input: ROCDomainLaw, worldId: string): WGELaw {
  if (!input.explanation) {
    throw new Error(`Domain law "${input.id}" requires an explanation (APP-1700.006)`);
  }
  return createLaw({
    id: input.id,
    worldId,
    name: input.name,
    // Domain Laws are World Laws; kernel scope is structurally unavailable.
    scope: "world",
    appliesTo: input.appliesTo,
    condition: input.condition,
    outcome: input.outcome,
    severity: input.severity,
    metadata: {
      ...input.metadata,
      applicationId: input.applicationId,
      explanation: input.explanation,
      source: "domain_law"
    }
  });
}

/** APP-1700.007 — Projection Hint Contract. Hints advise SLI; they never command it. */
export interface ROCProjectionHint {
  entityId: string;

  applicationId: string;

  preferredRole?: "primary" | "secondary" | "supporting" | "peripheral" | "ambient";

  preferredRegion?: "center" | "north" | "east" | "south" | "west" | "periphery" | "background";

  visualWeightHint?: number;

  interactionLevelHint?: SLIInteractionLevel;

  densityHint?: SLIDensityLevel;

  reason: string;

  metadata?: Record<string, unknown>;
}

/**
 * Hints become projection_hint aspects. "primary" preference is advisory —
 * it lowers to a priority nudge, never a role command, so an application can
 * never force SLI's attention owner (APP-1700.007).
 */
export function projectionHintToAspect(hint: ROCProjectionHint): WGEAspect {
  if (!hint.reason) throw new Error("A projection hint must carry a reason (APP-1700.007)");
  const weight = hint.visualWeightHint;
  return createAspect({
    id: `aspect_${hint.entityId}__projection_hint`,
    entityId: hint.entityId,
    kind: "projection_hint",
    data: {
      applicationId: hint.applicationId,
      ...(hint.preferredRole !== undefined
        ? { priority: hint.preferredRole === "primary" ? 0.9 : 0.5, preferredRole: hint.preferredRole }
        : {}),
      ...(hint.preferredRegion !== undefined ? { preferredRegion: hint.preferredRegion } : {}),
      ...(weight !== undefined ? { visualWeightHint: Math.max(0, Math.min(1, weight)) } : {}),
      ...(hint.interactionLevelHint !== undefined ? { interactionLevelHint: hint.interactionLevelHint } : {}),
      ...(hint.densityHint !== undefined ? { densityHint: hint.densityHint } : {}),
      reason: hint.reason
    }
  });
}

/** APP-1700.008 — Application Event To WIL Mapping. */
export interface ROCApplicationEvent {
  id: string;

  applicationId: string;

  actorId: string;

  type: string;

  domainObjectId?: string;

  occurredAt: WGETimestamp;

  payload?: Record<string, unknown>;

  metadata?: Record<string, unknown>;
}

export interface ROCApplicationEventMapping {
  eventId: string;

  wilMessage: WILMessage;

  explanation: string;

  diagnostics?: ROCIntegrationDiagnostic[];
}

export interface EventMappingOptions {
  actor: WILActor;
  worldId: string;
  identity: DomainIdentityStore;
  domainObjectType: string;
  /** Event type suffix → WIL intent. Defaults: created→create, updated→modify, archived/deleted→delete. */
  intent?: WILIntentType;
  mode?: "simulate" | "commit";
  snapshotId?: string;
}

export function applicationEventToWIL(
  event: ROCApplicationEvent,
  options: EventMappingOptions
): ROCApplicationEventMapping {
  if (options.actor.id !== event.actorId) {
    throw new Error(
      `Actor identity must be preserved: event actor "${event.actorId}" vs provided "${options.actor.id}" (APP-1700.008)`
    );
  }
  const intent: WILIntentType =
    options.intent ??
    (event.type.endsWith("created")
      ? "create"
      : event.type.endsWith("deleted") || event.type.endsWith("archived")
        ? "delete"
        : "modify");
  const entityId =
    event.domainObjectId !== undefined
      ? options.identity.mapIdentity(options.domainObjectType, event.domainObjectId).entityId
      : undefined;

  const wilMessage = createWILMessage({
    actor: options.actor,
    intent: { type: intent, reason: `application event ${event.type} (${event.id})` },
    target: entityId !== undefined ? { kind: "entity", id: entityId } : { kind: "world" },
    context: {
      worldId: options.worldId,
      ...(options.snapshotId !== undefined ? { snapshotId: options.snapshotId } : {}),
      application: { applicationId: event.applicationId, eventId: event.id, eventType: event.type }
    },
    mode: options.mode ?? "commit",
    payload: { ...event.payload, ...(entityId !== undefined ? { id: entityId } : {}) }
  });

  return {
    eventId: event.id,
    wilMessage,
    explanation: `Application event "${event.type}" became WIL ${intent}/${wilMessage.mode} targeting ${entityId ?? options.worldId}; causality preserved via trace ${wilMessage.traceId}`
  };
}

/** APP-1700.014 — Permission Integration. */
export interface ROCPermissionMapping {
  applicationId: string;

  actorId: string;

  appPermissions: string[];

  wilPermissions: string[];

  worldScope?: string[];

  expiresAt?: WGETimestamp;

  metadata?: Record<string, unknown>;
}

export function permissionsToAuthority(
  mapping: ROCPermissionMapping,
  authenticated: boolean
): WILAuthority {
  return {
    authenticated,
    permissions: [...mapping.wilPermissions].sort(),
    ...(mapping.worldScope !== undefined ? { scope: mapping.worldScope } : {})
  };
}

/** APP-1700.015 — External Integration Boundary. External data is not automatically Reality. */
export interface ROCExternalData {
  source: string;
  confidence: number;
  timestamp: WGETimestamp;
  freshness: "live" | "recent" | "stale" | "unknown";
  permissionScope?: string[];
  data: Record<string, unknown>;
}

export function externalDataToAspect(
  entityId: string,
  applicationId: string,
  name: string,
  external: ROCExternalData
): WGEAspect {
  for (const field of ["source", "timestamp", "freshness"] as const) {
    if (!external[field]) {
      throw new Error(`External data must declare ${field} (APP-1700.015: provenance is mandatory)`);
    }
  }
  if (typeof external.confidence !== "number" || external.confidence < 0 || external.confidence > 1) {
    throw new Error("External data must declare confidence 0.0–1.0 (APP-1700.015)");
  }
  return createApplicationAspect({
    entityId,
    applicationId,
    name,
    data: {
      ...external.data,
      _provenance: {
        source: external.source,
        confidence: external.confidence,
        timestamp: external.timestamp,
        freshness: external.freshness,
        ...(external.permissionScope !== undefined ? { permissionScope: external.permissionScope } : {})
      }
    }
  });
}

/** APP-1700.003 / SDK-1800.014 — Domain Adapter contract and factory. */
export interface ROCDomainAdapterConfig {
  id: string;
  applicationId: string;
  version: string;
  worldId: string;

  describeWorld(identity: DomainIdentityStore): Promise<Record<string, unknown>>;

  mapEntity?(domainObject: unknown, identity: DomainIdentityStore): Promise<Record<string, unknown>>;

  metadata?: Record<string, unknown>;
}

export interface ROCDomainAdapter extends ROCDomainAdapterConfig {
  identity: DomainIdentityStore;
}

export function createAdapter(config: ROCDomainAdapterConfig): ROCDomainAdapter {
  return { ...config, identity: new DomainIdentityStore(config.applicationId, config.worldId) };
}
