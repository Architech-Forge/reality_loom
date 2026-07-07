/**
 * SLI projection types.
 *
 * Volumes 1500 + 1600 — interfaces transcribed from the Codex verbatim
 * wherever specified. WGE computes what is true; SLI computes what should
 * be experienced; renderers compute how it appears (SLI-1500.001).
 */
import type { WGETimestamp } from "./primitives.js";
import type { WGEDiff } from "./wge.js";
import type { WGERecompositionTrigger } from "./physics.js";
import type { WILContext, WILIntent, WILOutcome, WILTarget } from "./wil.js";

/** SLI-1600.003 — Object Roles. Exactly one active primary is permitted. */
export type SLIObjectRole =
  | "primary"
  | "secondary"
  | "supporting"
  | "peripheral"
  | "ambient"
  | "hidden";

export const SLI_OBJECT_ROLES: readonly SLIObjectRole[] = [
  "primary",
  "secondary",
  "supporting",
  "peripheral",
  "ambient",
  "hidden"
] as const;

/** SLI-1600.006 — Interaction Levels. Affordance must match consequence. */
export type SLIInteractionLevel = "none" | "passive" | "inspectable" | "interactive" | "decision";

/** SLI-1500.007 — Density Levels. Density must earn its place. */
export type SLIDensityLevel = "ambient" | "aware" | "decision" | "professional";

/** Normalized bounds hint (0..1 of viewport) — a hint, never pixels. */
export interface SLIBoundsHint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SLIViewport {
  width: number;
  height: number;
  pixelRatio?: number;
}

export interface SLISafeArea {
  edge: "top" | "bottom" | "left" | "right";
  size: number;
}

/** SLI-1600.002 — Experience Regions: semantic, never pixel slots. */
export type SLIRegionId =
  | "center"
  | "north"
  | "east"
  | "south"
  | "west"
  | "periphery"
  | "background"
  | "foreground"
  | "overlay"
  | "ambient";

export interface SLIRegion {
  id: SLIRegionId;
  purpose: string;
}

/** SLI-1500.010 — Spatial Memory Record. Stable imperfection beats unstable perfection. */
export interface SLISpatialMemoryRecord {
  id: string;

  worldId: string;

  actorId?: string;

  entityId: string;

  preferredRegionId?: string;

  lastKnownBounds?: SLIBoundsHint;

  stabilityScore: number;

  lastSeenAt: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/**
 * Where an entity's projection relevance came from. "projection_baseline" is
 * projection presence only — never physics evidence, objective gravity,
 * activity, priority, or truth (approved 2026-07-06).
 */
export type SLIRelevanceSource = "physics" | "objective" | "event_ripple" | "projection_baseline";

/** SLI-1500.003 — Projection Input Model. */
export interface SLIProjectedEntity {
  id: string;
  type: string;

  label?: string;

  relevance?: number;
  relevanceSource?: SLIRelevanceSource;
  confidence?: number;
  priority?: number;

  projectionHints?: Record<string, unknown>;

  permissions?: {
    visible: boolean;
    interactive: boolean;
    explainable: boolean;
  };

  metadata?: Record<string, unknown>;
}

export interface SLIProjectedRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  weight?: number;
  confidence?: number;
}

/** SLI-1500.012 / SLI-1500.017 — renderer and device capability context. */
export interface SLIRendererCapabilities {
  supportsMotion: boolean;
  supports3D: boolean;
  supportsTouch: boolean;
  supportsKeyboard: boolean;
  supportsScreenReader: boolean;
  supportsVoice: boolean;
  supportsReducedMotion: boolean;

  maxInteractiveEntities?: number;

  metadata?: Record<string, unknown>;
}

export interface SLIDeviceContext {
  deviceId: string;

  formFactor:
    | "desktop"
    | "mobile"
    | "tablet"
    | "watch"
    | "voice"
    | "ar"
    | "vr"
    | "embedded"
    | "large_display";

  viewport?: SLIViewport;

  inputModes: Array<"touch" | "mouse" | "keyboard" | "voice" | "gesture" | "gaze">;

  capabilities: SLIRendererCapabilities;
}

export interface SLIAccessibilityContext {
  reducedMotion?: boolean;
  dynamicTypeScale?: number;
  highContrast?: boolean;
  screenReader?: boolean;
}

export interface SLIProjectionContext {
  device?: SLIDeviceContext;
  accessibility?: SLIAccessibilityContext;
  spatialMemory?: SLISpatialMemoryRecord[];
  application?: Record<string, unknown>;
}

export interface SLIProjectionInput {
  id: string;

  worldId: string;
  snapshotId: string;

  actorId: string;

  objectiveId?: string;

  entities: SLIProjectedEntity[];
  relationships: SLIProjectedRelationship[];

  runtimeOutcome?: WILOutcome;
  worldDiff?: WGEDiff;

  recompositionTriggers?: WGERecompositionTrigger[];

  context: SLIProjectionContext;

  previousProjectionId?: string;

  traceId: string;
}

/** SLI-1500.005 — Composition: attention architecture. */
export interface SLIComposedEntity {
  entityId: string;

  role: SLIObjectRole;

  priority: number;
  relevance: number;
  relevanceSource?: SLIRelevanceSource;
  confidence: number;

  visualWeight: number;

  reason: string;
}

export interface SLIComposedRelationship {
  relationshipId: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  emphasis: "strong" | "normal" | "faint";
}

export interface SLIComposition {
  id: string;

  worldId: string;
  snapshotId: string;

  primaryEntityId: string;

  entities: SLIComposedEntity[];

  relationships: SLIComposedRelationship[];

  density: SLIDensityLevel;

  reason: string;

  traceId: string;
}

/** SLI-1500.006 — Focus: attention is protected state. */
export interface SLIFocusEntry {
  entityId: string;

  focusLevel: SLIObjectRole;

  order: number;

  keyboardReachable: boolean;
  screenReaderReachable: boolean;

  reason: string;
}

export interface SLIFocusPlan {
  id: string;

  primaryFocusEntityId: string;

  focusOrder: SLIFocusEntry[];

  attentionOwnerId: string;

  reason: string;

  traceId: string;
}

/** SLI-1500.007 — Density Plan. */
export interface SLIDensityPlan {
  id: string;
  level: SLIDensityLevel;
  maxSecondary: number;
  maxSupporting: number;
  reason: string;
  traceId: string;
}

/** SLI-1500.008 — Layout: spatial organization, never styling. */
export interface SLIPlacement {
  entityId: string;

  regionId: string;

  boundsHint: SLIBoundsHint;

  zOrder: number;

  anchor?: string;

  spatialMemoryRef?: string;

  reason: string;
}

export interface SLILayoutPlan {
  id: string;

  viewport: SLIViewport;

  regions: SLIRegion[];

  placements: SLIPlacement[];

  readingOrder: string[];

  touchOrder: string[];

  safeAreas: SLISafeArea[];

  traceId: string;
}

/** SLI-1500.009 — Motion: must clarify, or it should not exist. */
export interface SLITransition {
  id: string;

  entityId: string;

  type:
    | "appear"
    | "disappear"
    | "move"
    | "resize"
    | "expand"
    | "collapse"
    | "emphasize"
    | "deemphasize"
    | "reorder"
    | "ambient";

  from?: SLIBoundsHint;
  to?: SLIBoundsHint;

  priority: "critical" | "high" | "normal" | "ambient";

  durationHintMs: number;

  reason: string;
}

export interface SLIMotionPlan {
  id: string;

  transitions: SLITransition[];

  reducedMotionApplied: boolean;

  reason: string;

  traceId: string;
}

/** SLI-1500.011 — Accessibility is part of composition. */
export interface SLIAccessibilityNode {
  entityId: string;

  role: "main" | "navigation" | "context" | "action" | "status" | "explanation" | "ambient";

  label: string;

  description?: string;

  order: number;

  reachable: boolean;
}

export interface SLIContrastRequirement {
  entityId: string;
  minimumRatio: number;
  reason: string;
}

export interface SLIInteractionTarget {
  entityId: string;
  minimumSizePx: number;
  interactionLevel: SLIInteractionLevel;
}

export interface SLIAccessibilityPlan {
  id: string;

  readingOrder: SLIAccessibilityNode[];

  keyboardOrder: SLIAccessibilityNode[];

  reducedMotion: boolean;

  dynamicTypeScale?: number;

  contrastRequirements: SLIContrastRequirement[];

  interactionTargets: SLIInteractionTarget[];

  summary: string;

  traceId: string;
}

/** SLI-1500.002 — the full projection plan. Temporary; Snapshots are durable. */
export interface SLIProjectionDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  reason: string;
  entityIds?: string[];
  traceId: string;
}

export interface SLIProjection {
  id: string;

  worldId: string;
  snapshotId: string;

  objectiveId?: string;

  primaryEntityId?: string;

  composition: SLIComposition;

  focusPlan: SLIFocusPlan;
  densityPlan: SLIDensityPlan;
  layoutPlan: SLILayoutPlan;
  motionPlan: SLIMotionPlan;
  accessibilityPlan: SLIAccessibilityPlan;

  traceId: string;

  diagnostics?: SLIProjectionDiagnostic[];

  metadata?: Record<string, unknown>;
}

/** SLI-1500.004 — Renderer instructions are projection contracts, not components. */
export interface SLIRendererInstruction {
  entityId: string;

  projectionRole: SLIObjectRole;

  region?: string;

  boundsHint?: SLIBoundsHint;

  visualWeight: number;

  interactionLevel: SLIInteractionLevel;

  accessibilityRef: string;

  motionRef?: string;

  metadata?: Record<string, unknown>;
}

export interface SLIInteractionMapEntry {
  entityId: string;
  interactionLevel: SLIInteractionLevel;
  allowedInteractions: SLIInteractionIntent["interactionType"][];
  /** True when this interaction may become a WIL message (SLI-1500.016). */
  wilEligible: boolean;
}

export interface SLIInteractionMap {
  projectionId: string;
  entries: SLIInteractionMapEntry[];
}

export interface SLIProjectionOutput {
  id: string;

  worldId: string;
  snapshotId: string;

  composition: SLIComposition;

  rendererInstructions: SLIRendererInstruction[];

  accessibilityPlan: SLIAccessibilityPlan;

  motionPlan: SLIMotionPlan;

  interactionMap: SLIInteractionMap;

  traceId: string;

  diagnostics?: SLIProjectionDiagnostic[];
}

/** SLI-1500.013 — Experience State: supports experience; WGE state is Reality. */
export interface SLIExperienceState {
  id: string;

  worldId: string;
  actorId?: string;

  projectionId: string;
  snapshotId: string;

  activeObjectiveId?: string;

  primaryEntityId?: string;

  expandedEntityIds: string[];

  hiddenEntityIds: string[];

  spatialMemoryRefs: string[];

  lastInteractionAt?: WGETimestamp;

  metadata?: Record<string, unknown>;
}

/** SLI-1500.014 — Recomposition updates experience; it never navigates away from reality. */
export interface SLIRecompositionInput {
  previousProjection: SLIProjectionOutput;

  projectionInput: SLIProjectionInput;

  triggers: WGERecompositionTrigger[];

  reason: string;

  traceId: string;
}

/** SLI-1500.015 — SLI Event Bus. */
export interface SLIEvent {
  id: string;

  type:
    | "projection.requested"
    | "projection.completed"
    | "focus.changed"
    | "density.changed"
    | "layout.changed"
    | "motion.completed"
    | "interaction.received"
    | "accessibility.changed"
    | "renderer.ready"
    | "renderer.failed";

  projectionId?: string;
  entityId?: string;

  actorId?: string;

  traceId: string;

  payload?: Record<string, unknown>;

  createdAt: WGETimestamp;
}

/** SLI-1500.016 — Interaction Intent Bridge. Reality changes only through WIL. */
export interface SLIInteractionIntent {
  id: string;

  actorId: string;

  projectionId: string;
  entityId?: string;

  interactionType:
    | "select"
    | "inspect"
    | "expand"
    | "collapse"
    | "compare"
    | "accept"
    | "reject"
    | "modify"
    | "create"
    | "delete"
    | "commit"
    | "simulate";

  semanticIntent?: WILIntent;

  target?: WILTarget;

  context: WILContext;

  traceId: string;
}

/** SLI-1500.012 — Renderer Adapter render result. */
export interface SLIRenderResult {
  rendererId: string;
  status: "rendered" | "degraded" | "failed";
  renderedEntityIds: string[];
  diagnostics?: SLIProjectionDiagnostic[];
  metadata?: Record<string, unknown>;
}

/** SLI-1500.019 — Devtools Trace: "Why is this here right now?" */
export interface SLIDevtoolsTrace {
  id: string;

  projectionId: string;
  worldId: string;
  snapshotId: string;

  inputTraceId: string;

  compositionTrace: string[];
  focusTrace: string[];
  densityTrace: string[];
  layoutTrace: string[];
  motionTrace: string[];
  accessibilityTrace: string[];

  diagnostics: SLIProjectionDiagnostic[];

  createdAt: WGETimestamp;
}
