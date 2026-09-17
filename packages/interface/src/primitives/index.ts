/**
 * The Reality Architecture native primitives.
 *
 * These replace cards, panels, tabs, dashboards, and generic sections with
 * world-native primitives (Interface Contract rules 1–2). A primitive is a
 * headless, typed scene descriptor: renderers on any platform express it;
 * none may reinterpret it.
 */
import type { RAMotionDescriptor } from "../motion/tokens.js";
import type { RAVisualObject, RAVisualKind, RAVisualState } from "../layout/visualObject.js";
import type { RABounds } from "../layout/bounds.js";
import { depthOf, type RADepthLayer } from "../tokens/depth.js";

export type RAPrimitiveName =
  | "WorldGate"
  | "RuntimeField"
  | "ProjectionSurface"
  | "RuntimeNode"
  | "TraceLine"
  | "CandidateLayer"
  | "AuthorityBoundary"
  | "CommitSurface"
  | "CapabilityConstellation"
  | "CompilerFlow"
  | "SubstrateField"
  | "RippleField"
  | "RecedeLayer"
  | "WorldGraphCanvas";

export const RA_PRIMITIVES: readonly RAPrimitiveName[] = [
  "WorldGate",
  "RuntimeField",
  "ProjectionSurface",
  "RuntimeNode",
  "TraceLine",
  "CandidateLayer",
  "AuthorityBoundary",
  "CommitSurface",
  "CapabilityConstellation",
  "CompilerFlow",
  "SubstrateField",
  "RippleField",
  "RecedeLayer",
  "WorldGraphCanvas"
] as const;

/** Forbidden as primary primitives (Interface Contract rules 1, 4, 5). */
export const RA_FORBIDDEN_PRIMITIVES: readonly string[] = [
  "Card",
  "FeatureCard",
  "Panel",
  "DashboardShell",
  "HeroSection",
  "StatsGrid",
  "InfoBlock",
  "GenericModal",
  "GenericSection"
] as const;

export interface RAPrimitive {
  primitive: RAPrimitiveName;
  object: RAVisualObject;
  /** Human/runtime meaning: why this exists in the scene — always traceable. */
  meaning: string;
  children: RAPrimitive[];
  motion?: RAMotionDescriptor;
  /** Runtime linkage — worlds, snapshots, traces, candidates. */
  runtimeRef?: {
    worldId?: string;
    snapshotId?: string;
    traceId?: string;
    candidateWorldId?: string;
    entityId?: string;
  };
  /** Renderer-neutral content payload (labels, values, annotations). */
  content?: Record<string, unknown>;
}

export interface PrimitiveInput {
  id: string;
  meaning: string;
  bounds?: RABounds;
  state?: RAVisualState;
  priority?: number;
  children?: RAPrimitive[];
  motion?: RAMotionDescriptor;
  runtimeRef?: RAPrimitive["runtimeRef"];
  content?: Record<string, unknown>;
}

const ZERO: RABounds = { x: 0, y: 0, width: 0, height: 0 };

interface PrimitiveSpec {
  kind: RAVisualKind;
  layer: RADepthLayer;
  defaultState: RAVisualState;
  defaultPriority: number;
  allowOverlap?: RAVisualObject["overlapReason"];
}

/**
 * What each primitive IS in runtime terms. Overlap permissions are part of
 * the primitive's nature and therefore always declared (contract rule 7).
 */
const SPEC: Record<RAPrimitiveName, PrimitiveSpec> = {
  // The void the World floats in — everything stands on it by design.
  SubstrateField: { kind: "field", layer: "substrate", defaultState: "ambient", defaultPriority: 0, allowOverlap: "depth-layer" },
  // The entry portal into a World.
  WorldGate: { kind: "surface", layer: "projection", defaultState: "projected", defaultPriority: 80 },
  // A resting region of live runtime.
  RuntimeField: { kind: "field", layer: "field", defaultState: "projected", defaultPriority: 40, allowOverlap: "depth-layer" },
  // The active experience surface — SLI's one primary lives here.
  ProjectionSurface: { kind: "projection", layer: "projection", defaultState: "focused", defaultPriority: 100 },
  // A single runtime object (entity, aspect, step, value).
  RuntimeNode: { kind: "node", layer: "graph", defaultState: "projected", defaultPriority: 50 },
  // Causality drawn: crosses structure intentionally.
  TraceLine: { kind: "trace", layer: "trace", defaultState: "projected", defaultPriority: 60, allowOverlap: "active-trace" },
  // Possibility space — never Reality (contract rule 9).
  CandidateLayer: { kind: "candidate", layer: "candidate", defaultState: "projected", defaultPriority: 70, allowOverlap: "depth-layer" },
  // Permission truth made visible.
  AuthorityBoundary: { kind: "boundary", layer: "authority", defaultState: "projected", defaultPriority: 85, allowOverlap: "depth-layer" },
  // The consequential surface where possibility becomes Reality.
  CommitSurface: { kind: "commit", layer: "commit", defaultState: "projected", defaultPriority: 95, allowOverlap: "modal" },
  // Capabilities orbiting their owner.
  CapabilityConstellation: { kind: "node", layer: "graph", defaultState: "projected", defaultPriority: 45, allowOverlap: "intentional-orbit" },
  // The WDL → WIR → Executable pipeline as living geometry.
  CompilerFlow: { kind: "surface", layer: "field", defaultState: "projected", defaultPriority: 55 },
  // Physics propagation radiating over structure.
  RippleField: { kind: "field", layer: "trace", defaultState: "projected", defaultPriority: 65, allowOverlap: "depth-layer" },
  // Receded context: dimmed, recoverable, never deleted.
  RecedeLayer: { kind: "field", layer: "recede", defaultState: "receded", defaultPriority: 5, allowOverlap: "depth-layer" },
  // The world graph itself; edges may cross by nature.
  WorldGraphCanvas: { kind: "field", layer: "graph", defaultState: "projected", defaultPriority: 20, allowOverlap: "graph-edge-crossing" }
};

function make(name: RAPrimitiveName, input: PrimitiveInput): RAPrimitive {
  const spec = SPEC[name];
  if (!input.meaning) {
    throw new Error(`${name} "${input.id}" must declare its runtime meaning (contract rule 3)`);
  }
  const object: RAVisualObject = {
    id: input.id,
    kind: spec.kind,
    layer: depthOf(spec.layer),
    priority: input.priority ?? spec.defaultPriority,
    bounds: input.bounds ?? { ...ZERO },
    state: input.state ?? spec.defaultState,
    ...(spec.allowOverlap !== undefined
      ? { allowOverlap: true, overlapReason: spec.allowOverlap }
      : {})
  };
  return {
    primitive: name,
    object,
    meaning: input.meaning,
    children: input.children ?? [],
    ...(input.motion !== undefined ? { motion: input.motion } : {}),
    ...(input.runtimeRef !== undefined ? { runtimeRef: input.runtimeRef } : {}),
    ...(input.content !== undefined ? { content: input.content } : {})
  };
}

export const WorldGate = (input: PrimitiveInput): RAPrimitive => make("WorldGate", input);
export const RuntimeField = (input: PrimitiveInput): RAPrimitive => make("RuntimeField", input);
export const ProjectionSurface = (input: PrimitiveInput): RAPrimitive => make("ProjectionSurface", input);
export const RuntimeNode = (input: PrimitiveInput): RAPrimitive => make("RuntimeNode", input);
export const TraceLine = (input: PrimitiveInput): RAPrimitive => make("TraceLine", input);
export const CandidateLayer = (input: PrimitiveInput): RAPrimitive => {
  const primitive = make("CandidateLayer", input);
  if (primitive.object.state === "committed") {
    throw new Error(`CandidateLayer "${input.id}" cannot carry committed state — possibility is not Reality (contract rule 9)`);
  }
  return primitive;
};
export const AuthorityBoundary = (input: PrimitiveInput): RAPrimitive => make("AuthorityBoundary", input);
export const CommitSurface = (input: PrimitiveInput): RAPrimitive => make("CommitSurface", input);
export const CapabilityConstellation = (input: PrimitiveInput): RAPrimitive => make("CapabilityConstellation", input);
export const CompilerFlow = (input: PrimitiveInput): RAPrimitive => make("CompilerFlow", input);
export const SubstrateField = (input: PrimitiveInput): RAPrimitive => make("SubstrateField", input);
export const RippleField = (input: PrimitiveInput): RAPrimitive => make("RippleField", input);
export const RecedeLayer = (input: PrimitiveInput): RAPrimitive => make("RecedeLayer", input);
export const WorldGraphCanvas = (input: PrimitiveInput): RAPrimitive => make("WorldGraphCanvas", input);
