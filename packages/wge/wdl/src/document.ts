/**
 * Structured WDL JSON document shape (REF-1900.008 "Acceptable First
 * Strategy": correct semantics first; the textual DSL parser follows in a
 * later phase). Sections mirror WDL-001.002 canonical sections; each
 * declaration mirrors its Volume 900 form.
 *
 * WDL describes reality. It never describes interfaces, components, or
 * pages (WDL-001.001).
 */
import type {
  WGELawCondition,
  WGELawOutcome,
  WGELawScope,
  WGESelector,
  WGETraversalOutputSpec,
  WGETraversalRule,
  WGEVisibility
} from "@roc/types";

/** WDL-001.003 — World Declaration. */
export interface WDLWorldDeclaration {
  id: string;
  name: string;
  version: string;

  description?: string;
  owner?: string;
  visibility?: WGEVisibility;
  default_locale?: string;
  default_timezone?: string;
  metadata?: Record<string, unknown>;
}

/** WDL-001.005 — Aspect Declaration. */
export interface WDLAspectDeclaration {
  kind: string;
  data: Record<string, unknown>;
  visibility?: WGEVisibility;
}

/** WDL-001.004 — Entity Declaration. */
export interface WDLEntityDeclaration {
  id: string;
  type: string;
  lifecycle?: "created" | "active" | "suspended" | "archived" | "deleted";
  aspects?: WDLAspectDeclaration[];
  metadata?: Record<string, unknown>;
}

/** WDL-001.006 — Relationship Declaration. */
export interface WDLRelationshipDeclaration {
  id?: string;
  from: string;
  type: string;
  to: string;
  direction?: "directed" | "bidirectional";
  weight?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

/** WDL-001.007 — World Law Declaration. */
export interface WDLLawDeclaration {
  id?: string;
  name: string;
  scope?: WGELawScope;
  appliesTo: WGESelector;
  condition: WGELawCondition;
  outcome: WGELawOutcome;
  severity?: "error" | "warning" | "suggestion";
  metadata?: Record<string, unknown>;
}

/** WDL-001.008 — Objective Declaration. Objectives become traversal entry points. */
export interface WDLObjectiveDeclaration {
  id: string;
  label: string;
  entry: string;
  traversal: string;
  /** Objective kind for tooling/physics; defaults to "general". */
  kind?: string;
  /** Priority / objective gravity seed, 0 to 100. */
  priority?: number;
  metadata?: Record<string, unknown>;
}

/** WDL-001.009 — Traversal Declaration. */
export interface WDLTraversalDeclaration {
  id: string;
  name?: string;
  from: string | WGESelector;
  rules: WGETraversalRule[];
  apply?: string[];
  output: WGETraversalOutputSpec;
  metadata?: Record<string, unknown>;
}

/** WDL-001.010 — Capability Declaration. */
export interface WDLCapabilityDeclaration {
  id: string;
  target: WGESelector;
  requires: string[];
  executes: string;
  public?: boolean;
  metadata?: Record<string, unknown>;
}

/** WDL-001.011 — Constraint Declaration. Constraints define what cannot happen. */
export interface WDLConstraintDeclaration {
  id: string;
  applies_to: WGESelector;
  block_when: WGELawCondition;
  reason: string;
  metadata?: Record<string, unknown>;
}

/** WDL-001.002 — Document Structure. Exactly one top-level world. */
export interface WDLDocument {
  world: WDLWorldDeclaration;
  entities?: WDLEntityDeclaration[];
  relationships?: WDLRelationshipDeclaration[];
  laws?: WDLLawDeclaration[];
  objectives?: WDLObjectiveDeclaration[];
  traversals?: WDLTraversalDeclaration[];
  capabilities?: WDLCapabilityDeclaration[];
  constraints?: WDLConstraintDeclaration[];
  metadata?: Record<string, unknown>;
}
