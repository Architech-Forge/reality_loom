/**
 * Condition helpers for the Law Builder (SDK-1800.008).
 *
 * The Codex forbids nondeterministic law conditions: laws are data, never
 * callbacks. These helpers give the fluent authoring feel of the SDK
 * examples while emitting the canonical WGELawCondition JSON AST.
 */
import type { WGEJSONValue, WGELawCondition, WGESelector } from "@roc/types";

const literal = (value: WGEJSONValue) => ({ kind: "literal" as const, value });
const path = (p: string) => ({ kind: "path" as const, path: p });

export const Cond = {
  all: (...conditions: WGELawCondition[]): WGELawCondition => ({ op: "all", conditions }),
  any: (...conditions: WGELawCondition[]): WGELawCondition => ({ op: "any", conditions }),
  not: (condition: WGELawCondition): WGELawCondition => ({ op: "not", condition }),

  exists: (selector: WGESelector): WGELawCondition => ({ op: "exists", selector }),

  /** Subject path equals a literal, e.g. Cond.aspectEquals("application", "availability.status", "available"). */
  aspectEquals: (aspectKind: string, dataPath: string, value: WGEJSONValue): WGELawCondition => ({
    op: "equals",
    left: path(`aspects.${aspectKind}.${dataPath}`),
    right: literal(value)
  }),

  pathEquals: (subjectPath: string, value: WGEJSONValue): WGELawCondition => ({
    op: "equals",
    left: path(subjectPath),
    right: literal(value)
  }),

  pathCompare: (
    op: "not_equals" | "gt" | "gte" | "lt" | "lte" | "contains",
    subjectPath: string,
    value: WGEJSONValue
  ): WGELawCondition => ({ op, left: path(subjectPath), right: literal(value) }),

  hasRelationship: (
    from: WGESelector,
    relationshipType: string,
    to?: WGESelector
  ): WGELawCondition => ({
    op: "has_relationship",
    from,
    relationshipType,
    ...(to !== undefined ? { to } : {})
  }),

  /** The interacting Actor holds a capability. */
  hasAuthority: (capability: string, target?: WGESelector): WGELawCondition => ({
    op: "has_authority",
    actorRef: { kind: "actor", field: "id" },
    capability,
    ...(target !== undefined ? { target } : {})
  }),

  /**
   * True only while evaluating inside a Candidate World: the runtime injects
   * the candidate's id (prefixed "cw_") into the evaluation context. Lets
   * laws express "drafts may exist in simulation; Reality requires more".
   */
  insideCandidateWorld: (): WGELawCondition => ({
    op: "contains",
    left: { kind: "context", key: "candidateWorldId" },
    right: literal("cw_")
  })
};
