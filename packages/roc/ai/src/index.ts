/**
 * @roc/ai — AI & Reasoning boundary.
 *
 * Volume 2400 (AI-2400.001 – AI-2400.020). AI is an Actor inside the World.
 * AI-generated meaning is not Reality until validated and committed through
 * WGE Runtime; hidden uncertainty becomes false confidence, and false
 * confidence is noncompliant. A safe refusal is a successful protection of
 * Reality.
 */
import type {
  ROCDiagnostic,
  WGEDiffOperation,
  WGESelector,
  WGETimestamp,
  WGEWorld,
  WILActor,
  WILMessage
} from "@roc/types";
import type { ROCAuthority } from "@roc/security";
import type { ROCProjectionHint } from "@roc/app-integration";
import { validateWILMessage } from "@wge/wil";

/** AI-2400.002 — AI Actor Contract. An AI Actor is never authority-free. */
export type ROCAICapability =
  | "observe_world"
  | "summarize_trace"
  | "explain_projection"
  | "generate_candidate_world"
  | "propose_wil"
  | "generate_projection_hint"
  | "ask_clarifying_question"
  | "classify_context"
  | "detect_pattern"
  | "reason_about_domain";

export interface ROCAIActor {
  actorId: string;

  actorType: "ai";

  name: string;

  provider?: string;
  model?: string;

  applicationId?: string;

  delegatedFromActorId?: string;

  authority: ROCAuthority;

  capabilities: ROCAICapability[];

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

export function createAIActor(input: Omit<ROCAIActor, "actorType">): ROCAIActor {
  if (input.authority.permissions.length === 0 && input.delegatedFromActorId === undefined) {
    throw new Error(
      "An AI Actor is never authority-free: it has its own limited authority or explicit delegation (AI-2400.002)"
    );
  }
  return { ...input, actorType: "ai" };
}

/** AI-2400.008 — Assumptions And Uncertainty. Remembered does not mean true. */
export interface ROCAIAssumption {
  id: string;

  statement: string;

  source:
    | "user_input"
    | "world_state"
    | "historical_pattern"
    | "external_data"
    | "model_inference"
    | "application_hint";

  confidence: number;

  requiresConfirmation: boolean;
}

export interface ROCAIUncertainty {
  id: string;

  topic: string;

  reason:
    | "missing_data"
    | "low_confidence"
    | "conflicting_data"
    | "permission_redaction"
    | "stale_data"
    | "ambiguous_intent"
    | "model_limitation";

  severity: "low" | "medium" | "high";

  suggestedResolution?: string;
}

export interface ROCAIReasoningConstraint {
  id: string;
  description: string;
}

/** AI-2400.004 — World Observation: permission-aware and traceable. */
export interface ROCAIObservationRequest {
  requestId: string;

  aiActorId: string;

  worldId: string;
  snapshotId: string;

  objectiveId?: string;

  selectors: WGESelector[];

  purpose: string;

  traceId: string;
}

export interface ROCAIObservationResult {
  requestId: string;

  worldId: string;
  snapshotId: string;

  observedEntityIds: string[];
  observedRelationshipIds: string[];
  observedAspectIds: string[];

  redacted: boolean;
  redactionCount: number;

  summary?: string;

  diagnostics?: ROCDiagnostic[];

  traceId: string;
}

/**
 * AI cannot reason over protected World data it was not authorized to
 * observe: restricted/hidden aspects are excluded, and the exclusion is
 * visible in the result.
 */
export function observeWorld(
  request: ROCAIObservationRequest,
  world: WGEWorld,
  actor: WILActor
): ROCAIObservationResult {
  const observedEntityIds: string[] = [];
  const observedAspectIds: string[] = [];
  let redactionCount = 0;

  for (const entityId of Object.keys(world.entities).sort()) {
    const entity = world.entities[entityId];
    if (!entity || (entity.lifecycle !== "active" && entity.lifecycle !== "created")) continue;
    let entityRedacted = false;
    for (const aspect of entity.aspects) {
      const visibility = aspect.visibility;
      const blocked =
        visibility !== undefined &&
        (visibility.mode === "hidden" ||
          ((visibility.mode === "restricted" || visibility.mode === "redacted") &&
            visibility.requiredCapability !== undefined &&
            !actor.authority.permissions.includes(visibility.requiredCapability)));
      if (blocked) {
        redactionCount += 1;
        entityRedacted = true;
      } else {
        observedAspectIds.push(aspect.id);
      }
    }
    if (!entityRedacted) observedEntityIds.push(entityId);
  }

  return {
    requestId: request.requestId,
    worldId: request.worldId,
    snapshotId: request.snapshotId,
    observedEntityIds,
    observedRelationshipIds: Object.keys(world.relationships).sort(),
    observedAspectIds,
    redacted: redactionCount > 0,
    redactionCount,
    traceId: request.traceId,
    ...(redactionCount > 0
      ? {
          diagnostics: [
            {
              code: "AI_OBSERVATION_REDACTED",
              severity: "info" as const,
              message: `${redactionCount} protected detail(s) were omitted from AI observation`,
              reason: "AI cannot reason over protected data it is not authorized to observe (AI-2400.004)"
            }
          ]
        }
      : {})
  };
}

/** AI-2400.005 — Prompt Context Safety. The model is only as safe as its context. */
export interface ROCAIPromptContext {
  contextId: string;

  aiActorId: string;

  worldId: string;
  snapshotId: string;

  objectiveId?: string;

  realityContext: Record<string, unknown>;

  candidateContext?: Record<string, unknown>;

  redactionCount: number;

  uncertainty: ROCAIUncertainty[];

  createdAt: WGETimestamp;

  traceId: string;
}

export interface PromptContextInput {
  contextId: string;
  aiActor: ROCAIActor;
  actor: WILActor;
  world: WGEWorld;
  snapshotId: string;
  /** Candidate world state, kept strictly separate from Reality. */
  candidateWorld?: WGEWorld;
  candidateWorldId?: string;
  objectiveId?: string;
  traceId: string;
  now: string;
}

export function buildPromptContext(input: PromptContextInput): ROCAIPromptContext {
  const observation = observeWorld(
    {
      requestId: `obs_${input.contextId}`,
      aiActorId: input.aiActor.actorId,
      worldId: input.world.id,
      snapshotId: input.snapshotId,
      selectors: [{ kind: "root" }],
      purpose: "prompt context assembly",
      traceId: input.traceId
    },
    input.world,
    input.actor
  );

  const uncertainty: ROCAIUncertainty[] = [];
  if (observation.redacted) {
    // Redaction becomes explicit uncertainty — never silent absence.
    uncertainty.push({
      id: `unc_${input.contextId}_redaction`,
      topic: "protected World data",
      reason: "permission_redaction",
      severity: "medium",
      suggestedResolution: "request delegation for the protected capability"
    });
  }

  const context: ROCAIPromptContext = {
    contextId: input.contextId,
    aiActorId: input.aiActor.actorId,
    worldId: input.world.id,
    snapshotId: input.snapshotId,
    ...(input.objectiveId !== undefined ? { objectiveId: input.objectiveId } : {}),
    realityContext: {
      label: "REALITY",
      worldId: input.world.id,
      snapshotId: input.snapshotId,
      entityIds: observation.observedEntityIds,
      relationshipIds: observation.observedRelationshipIds
    },
    redactionCount: observation.redactionCount,
    uncertainty,
    createdAt: input.now,
    traceId: input.traceId
  };

  if (input.candidateWorld !== undefined) {
    // Reality and simulation stay separated and labeled (AI-2400.005).
    context.candidateContext = {
      label: "CANDIDATE_WORLD — POSSIBILITY, NOT REALITY",
      candidateWorldId: input.candidateWorldId,
      entityIds: Object.keys(input.candidateWorld.entities).sort()
    };
  }

  return context;
}

/** AI-2400.006 / AI-2400.007 — Reasoning Request and Result. */
export type ROCAIOutputType =
  | "text_explanation"
  | "candidate_world_definition"
  | "wil_message_proposal"
  | "projection_hint"
  | "question"
  | "classification"
  | "summary"
  | "diagnostic";

export interface ROCAIReasoningRequest {
  requestId: string;

  aiActorId: string;

  worldId: string;
  snapshotId: string;

  objectiveId?: string;

  task:
    | "explain"
    | "recommend"
    | "summarize"
    | "simulate"
    | "compare"
    | "classify"
    | "detect_pattern"
    | "ask_question"
    | "propose_action";

  context: ROCAIPromptContext;

  allowedOutputs: ROCAIOutputType[];

  constraints: ROCAIReasoningConstraint[];

  traceId: string;

  metadata?: Record<string, unknown>;
}

export interface ROCAIReasoningResult {
  requestId: string;

  aiActorId: string;

  outputType: ROCAIOutputType;

  status: "completed" | "partial" | "needs_clarification" | "refused" | "failed";

  confidence: number;

  result: Record<string, unknown>;

  assumptions: ROCAIAssumption[];

  uncertainty: ROCAIUncertainty[];

  proposedWILMessages?: WILMessage[];

  candidateWorldDefinition?: Record<string, unknown>;

  projectionHints?: ROCProjectionHint[];

  diagnostics?: ROCDiagnostic[];

  traceId: string;
}

/**
 * Result validation: outputs the system did not ask for are rejected, and
 * uncertainty from redacted context must be preserved — hidden uncertainty
 * is false confidence (AI-2400.008).
 */
export function validateReasoningResult(
  request: ROCAIReasoningRequest,
  result: ROCAIReasoningResult
): ROCDiagnostic[] {
  const diagnostics: ROCDiagnostic[] = [];
  if (!request.allowedOutputs.includes(result.outputType)) {
    diagnostics.push({
      code: "AI_OUTPUT_NOT_ALLOWED",
      severity: "error",
      message: `output type "${result.outputType}" was not requested`,
      reason: "AI should never produce an output the system is not prepared to validate (AI-2400.006)"
    });
  }
  if (request.context.redactionCount > 0 && result.uncertainty.length === 0) {
    diagnostics.push({
      code: "AI_UNCERTAINTY_SUPPRESSED",
      severity: "error",
      message: "context was redacted but the result declares no uncertainty",
      reason: "hidden uncertainty becomes false confidence; false confidence is noncompliant (AI-2400.008)"
    });
  }
  for (const message of result.proposedWILMessages ?? []) {
    const validation = validateWILMessage(message);
    if (!validation.valid) {
      diagnostics.push({
        code: "AI_PROPOSAL_INVALID_WIL",
        severity: "error",
        message: `proposed WIL message "${message.id}" is invalid`,
        reason: validation.diagnostics.map((d) => d.message).join("; ")
      });
    }
  }
  return diagnostics;
}

/** AI-2400.010 / AI-2400.011 — WIL Proposals and Human Confirmation. */
export interface ROCAIRisk {
  id: string;

  description: string;

  severity: "low" | "medium" | "high" | "critical";

  affectedEntityIds?: string[];

  mitigation?: string;
}

export interface ROCAIWILProposal {
  proposalId: string;

  aiActorId: string;

  worldId: string;
  snapshotId: string;

  proposedMessages: WILMessage[];

  intendedOutcome: string;

  requiresHumanConfirmation: boolean;

  assumptions: ROCAIAssumption[];

  risks: ROCAIRisk[];

  confidence: number;

  traceId: string;
}

/**
 * Consequential actions (any commit-mode message) force human confirmation
 * regardless of what the AI declared (AI-2400.011).
 */
export function createWILProposal(
  input: Omit<ROCAIWILProposal, "requiresHumanConfirmation"> & {
    requiresHumanConfirmation?: boolean;
  }
): ROCAIWILProposal {
  const consequential = input.proposedMessages.some((m) => m.mode === "commit");
  for (const message of input.proposedMessages) {
    const validation = validateWILMessage(message);
    if (!validation.valid) {
      throw new Error(`proposal contains invalid WIL message "${message.id}" (AI-2400.010)`);
    }
  }
  return {
    ...input,
    requiresHumanConfirmation: consequential ? true : (input.requiresHumanConfirmation ?? false)
  };
}

export interface ROCHumanConfirmation {
  confirmationId: string;

  actorId: string;

  aiActorId?: string;

  proposalId: string;

  worldId: string;
  snapshotId: string;

  confirmed: boolean;

  confirmedAt?: WGETimestamp;

  rejectedAt?: WGETimestamp;

  reason?: string;

  traceId: string;
}

/**
 * The only path from proposal to executable messages. Unconfirmed
 * consequential proposals release nothing: a proposed WIL message is not an
 * executed WIL message.
 */
export function releaseProposal(
  proposal: ROCAIWILProposal,
  confirmation?: ROCHumanConfirmation
): { messages: WILMessage[]; reason: string } {
  if (!proposal.requiresHumanConfirmation) {
    return { messages: proposal.proposedMessages, reason: "non-consequential proposal released" };
  }
  if (!confirmation || confirmation.proposalId !== proposal.proposalId || !confirmation.confirmed) {
    return {
      messages: [],
      reason:
        "human confirmation required and not granted: the user must understand what will happen before AI-assisted Reality mutation (AI-2400.011)"
    };
  }
  return {
    messages: proposal.proposedMessages,
    reason: `confirmed by ${confirmation.actorId} at ${confirmation.confirmedAt ?? "unknown"}`
  };
}

/** AI-2400.009 — Candidate World Generation output. */
export interface ROCAICandidateWorldOutput {
  candidateWorldProposalId: string;

  baseWorldId: string;
  baseSnapshotId: string;

  proposedOperations: WGEDiffOperation[];

  proposedWILMessages: WILMessage[];

  assumptions: ROCAIAssumption[];

  uncertainty: ROCAIUncertainty[];

  confidence: number;

  traceId: string;
}

/** AI-2400.013 — Recommendation: advice, never action. Modeled as an aspect. */
export interface ROCAIRecommendationAspect {
  recommendationType: string;

  targetEntityIds: string[];

  reason: string;

  confidence: number;

  assumptions: ROCAIAssumption[];

  uncertainty: ROCAIUncertainty[];

  generatedByAIActorId: string;

  generatedAt: WGETimestamp;
}

/** AI-2400.014 — Memory Boundary. */
export interface ROCAIMemoryRecord {
  memoryId: string;

  aiActorId: string;

  worldId?: string;
  actorId?: string;

  source:
    | "user_confirmed"
    | "world_observed"
    | "trace_summary"
    | "application_provided"
    | "model_inferred";

  content: Record<string, unknown>;

  confidence: number;

  sensitivity: "public" | "internal" | "private" | "sensitive";

  createdAt: WGETimestamp;
  updatedAt: WGETimestamp;

  expiresAt?: WGETimestamp;

  traceId: string;
}

export function createMemory(record: ROCAIMemoryRecord): ROCAIMemoryRecord {
  if (!record.source) throw new Error("AI memory MUST declare its source (AI-2400.014)");
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    throw new Error("AI memory MUST declare confidence 0.0–1.0 (AI-2400.014)");
  }
  if (!record.sensitivity) throw new Error("AI memory MUST declare sensitivity (AI-2400.014)");
  if (record.source === "model_inferred" && record.confidence >= 1) {
    throw new Error("inference may not be stored as certain fact — remembered does not mean true (AI-2400.014)");
  }
  return structuredClone(record);
}

/** AI-2400.018 — AI Trace. Untraceable AI reasoning cannot produce trusted actions. */
export interface ROCAITrace {
  traceId: string;

  aiActorId: string;

  worldId?: string;
  snapshotId?: string;

  requestId?: string;

  observedContextRefs: string[];

  reasoningTask: string;

  outputType: ROCAIOutputType;

  assumptions: ROCAIAssumption[];

  uncertainty: ROCAIUncertainty[];

  proposedActionRefs?: string[];

  redactionCount: number;

  createdAt: WGETimestamp;
}

export function traceReasoning(
  request: ROCAIReasoningRequest,
  result: ROCAIReasoningResult,
  now: string
): ROCAITrace {
  return {
    traceId: request.traceId,
    aiActorId: request.aiActorId,
    worldId: request.worldId,
    snapshotId: request.snapshotId,
    requestId: request.requestId,
    observedContextRefs: [request.context.contextId],
    reasoningTask: request.task,
    outputType: result.outputType,
    assumptions: result.assumptions,
    uncertainty: result.uncertainty,
    ...(result.proposedWILMessages !== undefined
      ? { proposedActionRefs: result.proposedWILMessages.map((m) => m.id) }
      : {}),
    redactionCount: request.context.redactionCount,
    createdAt: now
  };
}

/** AI-2400.019 — Failure And Refusal. A safe refusal protects Reality. */
export interface ROCAIFailureResult {
  requestId: string;

  aiActorId: string;

  status: "refused" | "deferred" | "needs_clarification" | "failed";

  reason: string;

  safeAlternative?: string;

  diagnostics?: ROCDiagnostic[];

  traceId: string;
}

export function refuse(
  request: ROCAIReasoningRequest,
  reason: string,
  safeAlternative?: string
): ROCAIFailureResult {
  return {
    requestId: request.requestId,
    aiActorId: request.aiActorId,
    status: "refused",
    reason,
    ...(safeAlternative !== undefined ? { safeAlternative } : {}),
    traceId: request.traceId
  };
}

/** AI-2400.004 — spec-named observation request alias for candidate generation. */
export interface ROCAICandidateWorldRequest {
  requestId: string;

  aiActorId: string;

  baseWorldId: string;
  baseSnapshotId: string;

  objectiveId: string;

  goal: string;

  constraints: ROCAIReasoningConstraint[];

  traceId: string;
}

/** SEC-2300.007 / AI-2400 — AI Interaction record. */
export interface ROCAIInteractionRecord {
  interactionId: string;

  aiActorId: string;

  delegatedFromActorId?: string;

  worldId: string;

  messageId?: string;
  traceId: string;

  action: "observe" | "explain" | "simulate" | "propose" | "summarize" | "project_hint" | "commit_request";

  confidence?: number;

  createdAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** AI-2400.012 — Explanation output. If it cannot be traced, AI must not pretend to know it. */
export interface ROCAIExplanation {
  explanationId: string;

  audience: "user" | "developer" | "admin" | "auditor" | "ai_agent";

  summary: string;

  supportingTraceIds: string[];

  facts: string[];

  inferences: string[];

  uncertainties: ROCAIUncertainty[];

  redacted: boolean;

  traceId: string;
}

/** AI-2400.015 — Tool Use Through WIL. AI tools are not backdoors around the World. */
export interface ROCAIToolRequest {
  toolRequestId: string;

  aiActorId: string;

  toolId: string;

  worldId?: string;
  snapshotId?: string;

  purpose: string;

  proposedWILMessage?: WILMessage;

  requiresConfirmation: boolean;

  traceId: string;

  metadata?: Record<string, unknown>;
}

/** AI-2400.017 — AI Projection Hint: may influence experience, never own projection. */
export interface ROCAIProjectionHint extends ROCProjectionHint {
  generatedByAIActorId: string;

  confidence: number;

  explanation: string;

  assumptions: ROCAIAssumption[];

  uncertainty: ROCAIUncertainty[];

  expiresAt?: WGETimestamp;
}
