/**
 * SLI projection bridge — SLI decides what should be experienced; this
 * bridge turns that plan into a Reality Loom scene, and registers as a
 * conforming renderer adapter. Renderers express the scene; they never
 * reinterpret the projection (SLI-1500.012).
 */
import type { SLIProjectionOutput, SLIRenderResult } from "@roc/types";
import type { SLIRendererAdapter } from "@sli/renderer-contract";
import { MINIMAL_RENDERER_CAPABILITIES } from "@sli/renderer-contract";
import type { RLBounds } from "../layout/bounds.js";
import { layoutProjection } from "../layout/projectionLayout.js";
import type { RLLayoutDiagnostic } from "../layout/diagnostics.js";
import {
  CandidateLayer,
  ProjectionSurface,
  RecedeLayer,
  RuntimeField,
  RuntimeNode,
  SubstrateField,
  type RLPrimitive
} from "../primitives/index.js";
import { projectMotion, simulateMotion } from "../motion/project.js";
import { recedeMotion } from "../motion/recede.js";
import { validateScene, type RLScene } from "../contract.js";

export interface SceneFromProjectionOptions {
  viewport?: RLBounds;
  /** Set when projecting a Candidate World — the scene wraps in a CandidateLayer. */
  candidateWorldId?: string;
  dev?: boolean;
}

const DEFAULT_VIEWPORT: RLBounds = { x: 0, y: 0, width: 1280, height: 800 };

export interface SceneResult {
  scene: RLScene;
  layoutDiagnostics: RLLayoutDiagnostic[];
  renderedEntityIds: string[];
  hiddenCount: number;
}

/**
 * Projection → contract-conforming scene. Deterministic: identical
 * projection + viewport produce identical scenes.
 */
export function sceneFromProjection(
  projection: SLIProjectionOutput,
  options: SceneFromProjectionOptions = {}
): SceneResult {
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const layout = layoutProjection(projection, viewport, { dev: options.dev ?? false });
  const objectById = new Map(layout.objects.map((o) => [o.id, o] as const));
  const isCandidate = options.candidateWorldId !== undefined;

  const visible = projection.rendererInstructions.filter((i) => i.projectionRole !== "hidden");
  const hidden = projection.rendererInstructions.filter((i) => i.projectionRole === "hidden");

  const entityPrimitives: RLPrimitive[] = visible.map((instruction) => {
    const placed = objectById.get(instruction.entityId);
    const composed = projection.composition.entities.find((e) => e.entityId === instruction.entityId);
    const meaning = composed?.reason ?? `projected as ${instruction.projectionRole}`;
    const shared = {
      id: instruction.entityId,
      meaning,
      ...(placed !== undefined ? { bounds: placed.bounds, state: placed.state, priority: placed.priority } : {}),
      runtimeRef: {
        worldId: projection.worldId,
        snapshotId: projection.snapshotId,
        entityId: instruction.entityId,
        ...(options.candidateWorldId !== undefined ? { candidateWorldId: options.candidateWorldId } : {})
      },
      content: {
        role: instruction.projectionRole,
        visualWeight: instruction.visualWeight,
        interactionLevel: instruction.interactionLevel,
        accessibilityRef: instruction.accessibilityRef
      },
      motion: isCandidate
        ? simulateMotion(`projected into candidate ${options.candidateWorldId}`, projection.traceId)
        : projectMotion(meaning, projection.traceId)
    };
    if (instruction.projectionRole === "primary") return ProjectionSurface(shared);
    if (instruction.projectionRole === "ambient") return RuntimeField(shared);
    if (instruction.projectionRole === "peripheral") return RuntimeNode(shared);
    return RuntimeField(shared);
  });

  // Hidden entities recede recoverably — never a blank absence (SLI-1500.018).
  if (hidden.length > 0) {
    entityPrimitives.push(
      RecedeLayer({
        id: `${projection.id}_receded`,
        meaning: `${hidden.length} entit${hidden.length === 1 ? "y" : "ies"} receded — recoverable when relevant`,
        motion: recedeMotion("context receded from projection", projection.traceId),
        content: { hiddenCount: hidden.length, entityIds: hidden.map((i) => i.entityId) }
      })
    );
  }

  const substrate = SubstrateField({
    id: `${projection.id}_substrate`,
    meaning: `the substrate world ${projection.worldId} stands on`,
    bounds: viewport,
    children: isCandidate
      ? [
          CandidateLayer({
            id: `${projection.id}_candidate_layer`,
            meaning: `candidate world ${options.candidateWorldId} — possibility, not Reality`,
            bounds: viewport,
            runtimeRef: { candidateWorldId: options.candidateWorldId ?? "" },
            content: { label: "CANDIDATE — possibility, not Reality" },
            children: entityPrimitives
          })
        ]
      : entityPrimitives
  });

  const scene: RLScene = {
    id: `scene_${projection.id}`,
    viewport,
    primitives: [substrate],
    runtimeRef: {
      worldId: projection.worldId,
      snapshotId: projection.snapshotId,
      traceId: projection.traceId,
      ...(options.candidateWorldId !== undefined ? { candidateWorldId: options.candidateWorldId } : {})
    }
  };

  return {
    scene,
    layoutDiagnostics: layout.diagnostics,
    renderedEntityIds: visible.map((i) => i.entityId),
    hiddenCount: hidden.length
  };
}

/**
 * The interface system as a conforming SLI renderer adapter. It "renders"
 * to a scene; platform renderers (React, native, 3D) express that scene.
 */
export function createInterfaceRenderer(
  options: Omit<SceneFromProjectionOptions, "candidateWorldId"> = {}
): SLIRendererAdapter & { lastScene(): RLScene | undefined } {
  let last: RLScene | undefined;
  return {
    id: "realityloom-interface",
    platform: "custom",
    capabilities: { ...MINIMAL_RENDERER_CAPABILITIES, supportsMotion: true },
    async render(projection: SLIProjectionOutput): Promise<SLIRenderResult> {
      const result = sceneFromProjection(projection, options);
      last = result.scene;
      const violations = validateScene(result.scene);
      if (violations.length > 0) {
        return {
          rendererId: "realityloom-interface",
          status: "failed",
          renderedEntityIds: [],
          diagnostics: violations.map((v) => ({
            code: `RL_CONTRACT_RULE_${v.rule}`,
            severity: "error" as const,
            message: v.reason,
            reason: `Interface Contract rule ${v.rule}`,
            traceId: projection.traceId
          }))
        };
      }
      return {
        rendererId: "realityloom-interface",
        status: "rendered",
        renderedEntityIds: result.renderedEntityIds
      };
    },
    lastScene: () => last
  };
}
