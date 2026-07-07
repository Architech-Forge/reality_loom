/**
 * Kernel primitive construction (REF-1900.006, WGE-1000.002 – WGE-1000.008).
 *
 * Constructors fill defaults and enforce per-primitive requirements. Whole-
 * World invariants (duplicate ids, orphans, missing references) belong to
 * validateWorld (WGE-1000.012), which MUST pass before compilation.
 */
import type {
  WGEAspect,
  WGEEntity,
  WGEEntityLifecycle,
  WGEEvent,
  WGELaw,
  WGERelationship,
  WGERelationshipLifecycle,
  WGESelector,
  WGETraversal,
  WGEVisibility,
  WGEWorld
} from "@roc/types";
import { isConfidence, isWeight } from "@roc/types";
import { generateId } from "@wge/wil";

const now = (): string => new Date().toISOString();

export interface WGEWorldInput {
  name: string;
  version?: string;

  id?: string;
  /**
   * The root entity represents the World as a whole (WGE-1000.002). When not
   * provided, a root entity is created automatically.
   */
  rootEntityId?: string;
  rootEntityType?: string;
  metadata?: Record<string, unknown>;
}

/** REF-1900.006 required function. A World MUST have exactly one root entity. */
export function createWorld(input: WGEWorldInput): WGEWorld {
  if (!input.name) throw new Error("A World MUST have a name (WGE-1000.002)");

  const worldId = input.id ?? generateId("world");
  const world: WGEWorld = {
    id: worldId,
    type: "world",
    name: input.name,
    version: input.version ?? "1.0.0",
    rootEntityId: input.rootEntityId ?? `${worldId}_root`,
    entities: {},
    relationships: {},
    laws: {},
    traversals: {}
  };
  if (input.metadata !== undefined) world.metadata = input.metadata;

  if (input.rootEntityId === undefined) {
    const root = createEntity({
      id: world.rootEntityId,
      worldId,
      type: input.rootEntityType ?? "world_root",
      lifecycle: "active"
    });
    world.entities[root.id] = root;
  }
  return world;
}

export interface WGEEntityInput {
  worldId: string;
  type: string;

  id?: string;
  aspects?: WGEAspect[];
  lifecycle?: WGEEntityLifecycle;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/** REF-1900.006 required function. */
export function createEntity(input: WGEEntityInput): WGEEntity {
  if (!input.worldId) throw new Error("An Entity MUST have World ownership (WGE-1000.003)");
  if (!input.type) throw new Error("An Entity MUST have a type (WGE-1000.003)");

  const createdAt = input.createdAt ?? now();
  const entity: WGEEntity = {
    id: input.id ?? generateId("entity"),
    worldId: input.worldId,
    type: input.type,
    aspects: input.aspects ?? [],
    lifecycle: input.lifecycle ?? "created",
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    version: input.version ?? 1
  };
  if (input.metadata !== undefined) entity.metadata = input.metadata;
  return entity;
}

export interface WGEAspectInput {
  entityId: string;
  kind: string;
  data: Record<string, unknown>;

  id?: string;
  version?: number;
  visibility?: WGEVisibility;
  metadata?: Record<string, unknown>;
}

export function createAspect(input: WGEAspectInput): WGEAspect {
  if (!input.entityId) throw new Error("An Aspect MUST belong to an Entity (WGE-1000.004)");
  if (!input.kind) throw new Error("An Aspect MUST have a kind (WGE-1000.004)");

  const aspect: WGEAspect = {
    id: input.id ?? generateId("aspect"),
    entityId: input.entityId,
    kind: input.kind,
    data: input.data,
    version: input.version ?? 1
  };
  if (input.visibility !== undefined) aspect.visibility = input.visibility;
  if (input.metadata !== undefined) aspect.metadata = input.metadata;
  return aspect;
}

export interface WGERelationshipInput {
  worldId: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;

  id?: string;
  direction?: "directed" | "bidirectional";
  weight?: number;
  confidence?: number;
  lifecycle?: WGERelationshipLifecycle;
  aspects?: WGEAspect[];
  metadata?: Record<string, unknown>;
}

/** REF-1900.006 required function. */
export function createRelationship(input: WGERelationshipInput): WGERelationship {
  for (const field of ["worldId", "fromEntityId", "toEntityId", "type"] as const) {
    if (!input[field]) {
      throw new Error(`A Relationship MUST define ${field} (WGE-1000.005)`);
    }
  }
  if (input.weight !== undefined && !isWeight(input.weight)) {
    throw new Error("Relationship weight MUST be -100 to 100 (WGE-1000.005)");
  }
  if (input.confidence !== undefined && !isConfidence(input.confidence)) {
    throw new Error("Relationship confidence MUST be 0.0 to 1.0 (WGE-1000.005)");
  }

  const relationship: WGERelationship = {
    id: input.id ?? generateId("rel"),
    worldId: input.worldId,
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    type: input.type,
    direction: input.direction ?? "directed",
    lifecycle: input.lifecycle ?? "active"
  };
  if (input.weight !== undefined) relationship.weight = input.weight;
  if (input.confidence !== undefined) relationship.confidence = input.confidence;
  if (input.aspects !== undefined) relationship.aspects = input.aspects;
  if (input.metadata !== undefined) relationship.metadata = input.metadata;
  return relationship;
}

export interface WGELawInput {
  worldId: string;
  name: string;
  scope: WGELaw["scope"];
  appliesTo: WGESelector;
  condition: WGELaw["condition"];
  outcome: WGELaw["outcome"];

  id?: string;
  severity?: WGELaw["severity"];
  metadata?: Record<string, unknown>;
}

export function createLaw(input: WGELawInput): WGELaw {
  for (const field of ["worldId", "name", "scope", "appliesTo", "condition", "outcome"] as const) {
    if (input[field] === undefined || input[field] === "") {
      throw new Error(`A Law MUST define ${field} (WGE-1000.006)`);
    }
  }
  const law: WGELaw = {
    id: input.id ?? generateId("law"),
    worldId: input.worldId,
    name: input.name,
    scope: input.scope,
    appliesTo: input.appliesTo,
    condition: input.condition,
    outcome: input.outcome,
    severity: input.severity ?? "error"
  };
  if (input.metadata !== undefined) law.metadata = input.metadata;
  return law;
}

export interface WGEEventInput {
  worldId: string;
  actorId: string;
  type: string;
  traceId: string;

  id?: string;
  originEntityId?: string;
  timestamp?: string;
  magnitude?: number;
  confidence?: number;
  payload?: Record<string, unknown>;
}

export function createEvent(input: WGEEventInput): WGEEvent {
  for (const field of ["worldId", "actorId", "type", "traceId"] as const) {
    if (!input[field]) throw new Error(`An Event MUST have ${field} (WGE-1000.007)`);
  }
  const event: WGEEvent = {
    id: input.id ?? generateId("event"),
    worldId: input.worldId,
    actorId: input.actorId,
    type: input.type,
    timestamp: input.timestamp ?? now(),
    traceId: input.traceId
  };
  if (input.originEntityId !== undefined) event.originEntityId = input.originEntityId;
  if (input.magnitude !== undefined) event.magnitude = input.magnitude;
  if (input.confidence !== undefined) event.confidence = input.confidence;
  if (input.payload !== undefined) event.payload = input.payload;
  return event;
}

export interface WGETraversalInput {
  worldId: string;
  name: string;
  entry: WGESelector;

  id?: string;
  rules?: WGETraversal["rules"];
  constraints?: string[];
  output?: WGETraversal["output"];
  metadata?: Record<string, unknown>;
}

export function createTraversal(input: WGETraversalInput): WGETraversal {
  if (!input.worldId || !input.name || input.entry === undefined) {
    throw new Error("A Traversal MUST define worldId, name, and entry (WGE-1000.008)");
  }
  const traversal: WGETraversal = {
    id: input.id ?? generateId("traversal"),
    worldId: input.worldId,
    name: input.name,
    entry: input.entry,
    rules: input.rules ?? [],
    output: input.output ?? { kind: "entities", orderBy: "id" }
  };
  if (input.constraints !== undefined) traversal.constraints = input.constraints;
  if (input.metadata !== undefined) traversal.metadata = input.metadata;
  return traversal;
}
