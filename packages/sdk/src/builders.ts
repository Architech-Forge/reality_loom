/**
 * Fluent builders (SDK-1800.004 – SDK-1800.010).
 *
 * Builders create definitions; they do not execute Worlds. Output is the
 * structured WDL document form (WDLSource), ready for the compiler.
 * Deterministic: identical builder calls produce identical output.
 */
import type {
  WDLConstraintDeclaration,
  WDLDocument,
  WDLEntityDeclaration,
  WDLLawDeclaration,
  WDLObjectiveDeclaration,
  WDLRelationshipDeclaration,
  WDLTraversalDeclaration
} from "@wge/wdl";
import { relationshipIdFor } from "@wge/wdl";
import type {
  WGELawCondition,
  WGELawOutcome,
  WGESelector,
  WGETraversalOutputSpec,
  WGETraversalRule,
  WGEVisibility,
  WILActor,
  WILContext,
  WILExecutionMode,
  WILIntent,
  WILMessage,
  WILTarget
} from "@roc/types";
import { createWILMessage } from "@wge/wil";
import { ROCSDKError } from "./errors.js";

const require_ = (value: unknown, code: string, what: string): void => {
  if (value === undefined || value === null || value === "") {
    throw new ROCSDKError({
      code,
      message: `${what} is required`,
      reason: "builders enforce Codex requirements before compilation",
      suggestedResolution: `provide ${what}`
    });
  }
};

/** SDK-1800.005 — Entity Builder. An Entity describes what exists. */
export class EntityBuilder {
  private declaration: Partial<WDLEntityDeclaration> & { aspects: NonNullable<WDLEntityDeclaration["aspects"]> };

  private constructor(id: string) {
    this.declaration = { id, aspects: [] };
  }

  static entity(id: string): EntityBuilder {
    require_(id, "SDK_ENTITY_ID_REQUIRED", "entity id");
    return new EntityBuilder(id);
  }

  type(type: string): this {
    this.declaration.type = type;
    return this;
  }

  aspect(kind: string, data: Record<string, unknown>, visibility?: WGEVisibility): this {
    require_(kind, "SDK_ASPECT_KIND_REQUIRED", "aspect kind");
    try {
      JSON.stringify(data);
    } catch {
      throw new ROCSDKError({
        code: "SDK_ASPECT_NOT_SERIALIZABLE",
        message: `aspect "${kind}" data is not serializable`,
        reason: "aspects MUST be serializable (WGE-1000.004)"
      });
    }
    this.declaration.aspects.push({ kind, data, ...(visibility !== undefined ? { visibility } : {}) });
    return this;
  }

  metadata(metadata: Record<string, unknown>): this {
    this.declaration.metadata = metadata;
    return this;
  }

  build(): WDLEntityDeclaration {
    require_(this.declaration.type, "SDK_ENTITY_TYPE_REQUIRED", "entity type");
    return this.declaration as WDLEntityDeclaration;
  }
}

/** SDK-1800.007 — Relationship Builder. Relationships connect World truth. */
export class RelationshipBuilder {
  private declaration: Partial<WDLRelationshipDeclaration> = {};

  private constructor(id?: string) {
    if (id !== undefined) this.declaration.id = id;
  }

  static relationship(id?: string): RelationshipBuilder {
    return new RelationshipBuilder(id);
  }

  from(entityId: string): this {
    this.declaration.from = entityId;
    return this;
  }

  to(entityId: string): this {
    this.declaration.to = entityId;
    return this;
  }

  type(type: string): this {
    this.declaration.type = type;
    return this;
  }

  direction(direction: "directed" | "bidirectional"): this {
    this.declaration.direction = direction;
    return this;
  }

  weight(weight: number): this {
    if (weight < -100 || weight > 100) {
      throw new ROCSDKError({
        code: "SDK_WEIGHT_OUT_OF_RANGE",
        message: `weight ${weight} out of range`,
        reason: "weight MUST be -100 to 100 (WGE-1000.005)"
      });
    }
    this.declaration.weight = weight;
    return this;
  }

  confidence(confidence: number): this {
    if (confidence < 0 || confidence > 1) {
      throw new ROCSDKError({
        code: "SDK_CONFIDENCE_OUT_OF_RANGE",
        message: `confidence ${confidence} out of range`,
        reason: "confidence MUST be 0.0 to 1.0 (WGE-1000.005)"
      });
    }
    this.declaration.confidence = confidence;
    return this;
  }

  build(): WDLRelationshipDeclaration {
    require_(this.declaration.from, "SDK_RELATIONSHIP_FROM_REQUIRED", "source entity id");
    require_(this.declaration.to, "SDK_RELATIONSHIP_TO_REQUIRED", "target entity id");
    require_(this.declaration.type, "SDK_RELATIONSHIP_TYPE_REQUIRED", "relationship type");
    return this.declaration as WDLRelationshipDeclaration;
  }
}

/** SDK-1800.008 — Law Builder. Application truth must be explicit and executable. */
export class LawBuilder {
  private declaration: Partial<WDLLawDeclaration> & { metadata: Record<string, unknown> } = {
    metadata: {}
  };

  private constructor(id: string) {
    this.declaration.id = id;
  }

  static law(id: string): LawBuilder {
    require_(id, "SDK_LAW_ID_REQUIRED", "law id");
    return new LawBuilder(id);
  }

  name(name: string): this {
    this.declaration.name = name;
    return this;
  }

  scope(scope: "world" | "physics"): this {
    // Kernel scope is deliberately not offered: World Laws MUST NOT override
    // Kernel Laws (WGE-1200.010), and the compiler rejects attempts.
    this.declaration.scope = scope;
    return this;
  }

  appliesTo(selector: WGESelector): this {
    this.declaration.appliesTo = selector;
    return this;
  }

  /** The requirement as a deterministic condition AST (see Cond helpers). */
  when(condition: WGELawCondition): this {
    if (typeof condition === "function") {
      throw new ROCSDKError({
        code: "SDK_LAW_CONDITION_NOT_DATA",
        message: "law conditions must be data, not callbacks",
        reason: "nondeterministic conditions are noncompliant (SDK-1800.008); use the Cond helpers"
      });
    }
    this.declaration.condition = condition;
    return this;
  }

  outcome(outcome: WGELawOutcome): this {
    this.declaration.outcome = outcome;
    return this;
  }

  severity(severity: "error" | "warning" | "suggestion"): this {
    this.declaration.severity = severity;
    return this;
  }

  /** Required: laws must not hide rejection reasons (SDK-1800.008). */
  explain(explanation: string): this {
    this.declaration.metadata.explanation = explanation;
    return this;
  }

  build(): WDLLawDeclaration {
    require_(this.declaration.name, "SDK_LAW_NAME_REQUIRED", "law name");
    require_(this.declaration.appliesTo, "SDK_LAW_SELECTOR_REQUIRED", "appliesTo selector");
    require_(this.declaration.condition, "SDK_LAW_CONDITION_REQUIRED", "condition");
    require_(this.declaration.outcome, "SDK_LAW_OUTCOME_REQUIRED", "outcome");
    require_(
      this.declaration.metadata.explanation,
      "SDK_LAW_EXPLANATION_REQUIRED",
      "explanation (explain(...))"
    );
    return this.declaration as WDLLawDeclaration;
  }
}

/** SDK-1800.009 — Traversal Builder. Traversal computes understanding. */
export class TraversalBuilder {
  private declaration: Partial<WDLTraversalDeclaration> & { rules: WGETraversalRule[]; apply: string[] } = {
    rules: [],
    apply: []
  };

  private constructor(id: string) {
    this.declaration.id = id;
  }

  static traversal(id: string): TraversalBuilder {
    require_(id, "SDK_TRAVERSAL_ID_REQUIRED", "traversal id");
    return new TraversalBuilder(id);
  }

  from(entry: string | WGESelector): this {
    this.declaration.from = entry;
    return this;
  }

  /** Each follow starts a new ordered rule (one hop). */
  follow(relationshipType: string): this {
    this.declaration.rules.push({ follow: relationshipType });
    return this;
  }

  /** Attaches to the most recent follow rule. */
  collect(selector: WGESelector): this {
    const rule = this.declaration.rules[this.declaration.rules.length - 1];
    if (!rule) {
      throw new ROCSDKError({
        code: "SDK_TRAVERSAL_COLLECT_WITHOUT_FOLLOW",
        message: "collect() requires a preceding follow()",
        reason: "traversal rules are ordered hops (WDL-001.009)"
      });
    }
    rule.collect = selector;
    return this;
  }

  maxDepth(depth: number): this {
    const rule = this.declaration.rules[this.declaration.rules.length - 1];
    if (rule) rule.maxDepth = depth;
    return this;
  }

  minConfidence(confidence: number): this {
    const rule = this.declaration.rules[this.declaration.rules.length - 1];
    if (rule) rule.minConfidence = confidence;
    return this;
  }

  applyLaw(lawId: string): this {
    this.declaration.apply.push(lawId);
    return this;
  }

  output(kind: WGETraversalOutputSpec["kind"], spec?: Omit<WGETraversalOutputSpec, "kind">): this {
    this.declaration.output = { kind, orderBy: "id", ...spec };
    return this;
  }

  build(): WDLTraversalDeclaration {
    require_(this.declaration.from, "SDK_TRAVERSAL_ENTRY_REQUIRED", "entry selector");
    require_(this.declaration.output, "SDK_TRAVERSAL_OUTPUT_REQUIRED", "output spec");
    return this.declaration as WDLTraversalDeclaration;
  }
}

/** SDK-1800.004 — World Builder. Creates definitions; never executes them. */
export class WorldBuilder {
  private worldName: string;
  private worldId?: string;
  private worldVersion = "1.0.0";
  private timezone?: string;
  private readonly entities: WDLEntityDeclaration[] = [];
  private readonly relationships: WDLRelationshipDeclaration[] = [];
  private readonly laws: WDLLawDeclaration[] = [];
  private readonly traversals: WDLTraversalDeclaration[] = [];
  private readonly objectives: WDLObjectiveDeclaration[] = [];
  private readonly constraints: WDLConstraintDeclaration[] = [];

  private constructor(name: string) {
    this.worldName = name;
  }

  static world(name: string): WorldBuilder {
    require_(name, "SDK_WORLD_NAME_REQUIRED", "world name");
    return new WorldBuilder(name);
  }

  id(id: string): this {
    this.worldId = id;
    return this;
  }

  version(version: string): this {
    this.worldVersion = version;
    return this;
  }

  defaultTimezone(timezone: string): this {
    this.timezone = timezone;
    return this;
  }

  entity(declaration: WDLEntityDeclaration): this {
    if (this.entities.some((e) => e.id === declaration.id)) {
      throw new ROCSDKError({
        code: "SDK_DUPLICATE_ENTITY_ID",
        message: `duplicate entity id "${declaration.id}"`,
        reason: "entity IDs must be unique within a World (WGE-1200.007)"
      });
    }
    this.entities.push(declaration);
    return this;
  }

  relationship(
    fromOrDeclaration: string | WDLRelationshipDeclaration,
    type?: string,
    to?: string,
    options: Pick<WDLRelationshipDeclaration, "weight" | "confidence" | "direction"> = {}
  ): this {
    if (typeof fromOrDeclaration === "string") {
      require_(type, "SDK_RELATIONSHIP_TYPE_REQUIRED", "relationship type");
      require_(to, "SDK_RELATIONSHIP_TO_REQUIRED", "target entity id");
      this.relationships.push({
        id: relationshipIdFor(fromOrDeclaration, type as string, to as string),
        from: fromOrDeclaration,
        type: type as string,
        to: to as string,
        ...options
      });
    } else {
      this.relationships.push(fromOrDeclaration);
    }
    return this;
  }

  law(declaration: WDLLawDeclaration): this {
    this.laws.push(declaration);
    return this;
  }

  traversal(declaration: WDLTraversalDeclaration): this {
    this.traversals.push(declaration);
    return this;
  }

  objective(declaration: WDLObjectiveDeclaration): this {
    this.objectives.push(declaration);
    return this;
  }

  constraint(declaration: WDLConstraintDeclaration): this {
    this.constraints.push(declaration);
    return this;
  }

  build(): WDLDocument {
    require_(this.worldId, "SDK_WORLD_ID_REQUIRED", "world id (stable identity)");
    return {
      world: {
        id: this.worldId as string,
        name: this.worldName,
        version: this.worldVersion,
        ...(this.timezone !== undefined ? { default_timezone: this.timezone } : {})
      },
      entities: this.entities,
      relationships: this.relationships,
      laws: this.laws,
      traversals: this.traversals,
      objectives: this.objectives,
      constraints: this.constraints
    };
  }
}

/** SDK-1800.010 — WIL Message Builder. No Actor, no interaction. */
export class WILBuilder {
  private actorValue?: WILActor;
  private intentValue?: WILIntent;
  private targetValue?: WILTarget;
  private contextValue?: WILContext;
  private modeValue?: WILExecutionMode;
  private payloadValue?: Record<string, unknown>;
  private traceIdValue?: string;

  static message(): WILBuilder {
    return new WILBuilder();
  }

  actor(actor: WILActor): this {
    this.actorValue = actor;
    return this;
  }

  intent(intent: WILIntent): this {
    this.intentValue = intent;
    return this;
  }

  target(target: WILTarget): this {
    this.targetValue = target;
    return this;
  }

  context(context: WILContext): this {
    this.contextValue = context;
    return this;
  }

  mode(mode: WILExecutionMode): this {
    this.modeValue = mode;
    return this;
  }

  payload(payload: Record<string, unknown>): this {
    this.payloadValue = payload;
    return this;
  }

  traceId(traceId: string): this {
    this.traceIdValue = traceId;
    return this;
  }

  build(): WILMessage {
    require_(this.actorValue, "SDK_WIL_ACTOR_REQUIRED", "actor");
    require_(this.intentValue, "SDK_WIL_INTENT_REQUIRED", "intent");
    require_(this.targetValue, "SDK_WIL_TARGET_REQUIRED", "target");
    require_(this.contextValue, "SDK_WIL_CONTEXT_REQUIRED", "context");
    require_(this.modeValue, "SDK_WIL_MODE_REQUIRED", "mode");
    return createWILMessage({
      actor: this.actorValue as WILActor,
      intent: this.intentValue as WILIntent,
      target: this.targetValue as WILTarget,
      context: this.contextValue as WILContext,
      mode: this.modeValue as WILExecutionMode,
      ...(this.payloadValue !== undefined ? { payload: this.payloadValue } : {}),
      ...(this.traceIdValue !== undefined ? { traceId: this.traceIdValue } : {})
    });
  }
}
