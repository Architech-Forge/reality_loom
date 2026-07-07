/**
 * Deterministic law-condition evaluation (WGE-1300.008).
 *
 * Evaluates the canonical WGELawCondition AST — plain data, never callbacks —
 * against a World, a subject Entity, the interacting Actor, and the WIL
 * Context. Same inputs always produce the same verdict.
 */
import type {
  WGEEntity,
  WGELawCondition,
  WGEValueRef,
  WGEWorld,
  WILActor,
  WILContext
} from "@roc/types";
import { resolveSelector } from "./selector.js";

export interface ConditionScope {
  world: WGEWorld;
  entity?: WGEEntity;
  actor: WILActor;
  context: WILContext;
}

/**
 * Path resolution over a subject entity. Supports:
 *   "type" | "lifecycle" | "id" | "version"
 *   "metadata.<path>"
 *   "aspects.<kind>.<path>"  — descends into that aspect's data
 * Aspect data paths try the longest flat key first ("availability.status"
 * as a literal key) then dotted descent, so both authoring styles resolve.
 */
export function resolveEntityPath(entity: WGEEntity | undefined, path: string): unknown {
  if (!entity) return undefined;
  const segments = path.split(".");
  const head = segments[0];
  if (head === "type") return entity.type;
  if (head === "lifecycle") return entity.lifecycle;
  if (head === "id") return entity.id;
  if (head === "version") return entity.version;
  if (head === "metadata") return descend(entity.metadata, segments.slice(1));
  if (head === "aspects") {
    const kind = segments[1];
    const aspect = entity.aspects.find((a) => a.kind === kind);
    if (!aspect) return undefined;
    return descend(aspect.data, segments.slice(2));
  }
  return undefined;
}

function descend(value: unknown, segments: string[]): unknown {
  if (segments.length === 0) return value;
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  // Longest flat key first: {"availability.status": "available"} matches
  // the path ["availability", "status"].
  for (let take = segments.length; take >= 1; take--) {
    const key = segments.slice(0, take).join(".");
    if (key in record) return descend(record[key], segments.slice(take));
  }
  return undefined;
}

export function resolveValueRef(ref: WGEValueRef, scope: ConditionScope): unknown {
  switch (ref.kind) {
    case "literal":
      return ref.value;
    case "path":
      return resolveEntityPath(scope.entity, ref.path);
    case "context": {
      const context = scope.context as unknown as Record<string, unknown>;
      return descend(context, ref.key.split("."));
    }
    case "actor": {
      const actor = scope.actor as unknown as Record<string, unknown>;
      return descend(actor, ref.field.split("."));
    }
  }
}

export function evaluateCondition(condition: WGELawCondition, scope: ConditionScope): boolean {
  switch (condition.op) {
    case "all":
      return condition.conditions.every((sub) => evaluateCondition(sub, scope));
    case "any":
      return condition.conditions.some((sub) => evaluateCondition(sub, scope));
    case "not":
      return !evaluateCondition(condition.condition, scope);
    case "exists": {
      const resolved = resolveSelector(scope.world, condition.selector);
      return resolved.entities.length > 0 || resolved.relationships.length > 0;
    }
    case "equals":
    case "not_equals":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
    case "contains":
      return compare(
        condition.op,
        resolveValueRef(condition.left, scope),
        resolveValueRef(condition.right, scope)
      );
    case "has_relationship": {
      const from = resolveSelector(scope.world, condition.from).entities.map((e) => e.id);
      const to = condition.to
        ? resolveSelector(scope.world, condition.to).entities.map((e) => e.id)
        : undefined;
      return Object.values(scope.world.relationships).some(
        (rel) =>
          rel.type === condition.relationshipType &&
          from.includes(rel.fromEntityId) &&
          (to === undefined || to.includes(rel.toEntityId))
      );
    }
    case "has_authority":
      // actorRef identifies the acting party; the reference runtime evaluates
      // authority against the interacting Actor's permission set.
      return scope.actor.authority.permissions.includes(condition.capability);
  }
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "equals":
      return canonicalEqual(left, right);
    case "not_equals":
      return !canonicalEqual(left, right);
    case "gt":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "gte":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "lte":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "contains":
      if (Array.isArray(left)) return left.some((item) => canonicalEqual(item, right));
      if (typeof left === "string" && typeof right === "string") return left.includes(right);
      return false;
    default:
      return false;
  }
}

function canonicalEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
