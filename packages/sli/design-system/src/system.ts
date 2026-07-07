/**
 * Regions, workspaces, ambient layer, patterns, and the extension model
 * (SLI-1600.002, .004, .005, .013 – .017, .019).
 */
import type {
  SLIDensityLevel,
  SLIObjectRole,
  SLIRegion,
  SLIRegionId
} from "@roc/types";
import type { WGETimestamp } from "@roc/types";
import type { SLIDesignToken } from "./tokens.js";

/** SLI-1600.002 — Standard Experience Regions: behavioral, not page slots. */
export const STANDARD_REGIONS: readonly SLIRegion[] = [
  { id: "center", purpose: "Primary objective, main entity, or active workspace" },
  { id: "north", purpose: "Orientation, time, status, global context" },
  { id: "east", purpose: "Related context, supporting entities, secondary explanations" },
  { id: "south", purpose: "History, reflection, timeline, supporting actions" },
  { id: "west", purpose: "Guide, companion, assistant, notes, navigation-like presence" },
  { id: "periphery", purpose: "Low-priority contextual entities" },
  { id: "background", purpose: "Atmosphere, environmental state, noninteractive context" },
  { id: "foreground", purpose: "Temporary decision or confirmation layer" },
  { id: "overlay", purpose: "Interruptive or modal projection layer" },
  { id: "ambient", purpose: "Subtle persistent awareness layer" }
] as const;

/** Default region for each object role (renderers may map differently per platform). */
export const ROLE_DEFAULT_REGION: Record<SLIObjectRole, SLIRegionId> = {
  primary: "center",
  secondary: "east",
  supporting: "south",
  peripheral: "periphery",
  ambient: "ambient",
  hidden: "background"
};

/** Visual weight per role (SLI-1600.003: roles MUST influence visual weight). */
export const ROLE_VISUAL_WEIGHT: Record<SLIObjectRole, number> = {
  primary: 1,
  secondary: 0.7,
  supporting: 0.5,
  peripheral: 0.3,
  ambient: 0.15,
  hidden: 0
};

/** SLI-1600.004 — Workspace Model. Workspaces replace pages. */
export interface SLIWorkspaceState {
  expandedEntityIds: string[];
  selectedEntityIds: string[];
  comparedEntityIds: string[];
  hiddenEntityIds: string[];

  density: SLIDensityLevel;

  lastInteractionAt?: WGETimestamp;
}

export interface SLIWorkspace {
  id: string;

  worldId: string;
  snapshotId: string;

  objectiveId: string;

  primaryEntityId: string;

  mode:
    | "ambient"
    | "planning"
    | "decision"
    | "review"
    | "comparison"
    | "simulation"
    | "completion";

  entities: string[];

  state: SLIWorkspaceState;

  traceId: string;

  metadata?: Record<string, unknown>;
}

/** SLI-1600.016 — Inspection levels. Looking is not changing Reality. */
export type SLIInspectionLevel = "peek" | "inspect" | "expand" | "deep_inspect";

/** SLI-1600.013 — Decision Surface: the user must understand what will happen. */
export interface SLIDecisionSurface {
  id: string;
  entityId: string;
  choice: string;
  reason: string;
  consequence: string;
  alternatives: string[];
  cancelable: boolean;
  accessibilityLabel: string;
  traceId: string;
}

/** SLI-1600.014 — Explanation Surface: truthful, concise, expandable. */
export interface SLIExplanationSurface {
  id: string;
  entityId: string;
  summary: string;
  detail?: string;
  sources: Array<"wil_trace" | "runtime_trace" | "physics_trace" | "traversal_trace" | "composition_trace" | "application">;
  uncertainty?: string;
  traceId: string;
}

/** SLI-1600.015 — Comparison Surface: possibility must never appear as Reality. */
export interface SLIComparisonSurface {
  id: string;
  criteria: string[];
  items: Array<{
    id: string;
    kind: "reality" | "candidate_world" | "entity" | "snapshot" | "recommendation";
    label: string;
  }>;
  traceId: string;
}

/** SLI-1600.017 — Confirmation & Recovery: failure should preserve trust. */
export interface SLIConfirmationSurface {
  id: string;
  whatHappened: string;
  realityChanged: boolean;
  snapshotId?: string;
  candidateWorldId?: string;
  undoAvailable: boolean;
  whatHappensNext: string;
  traceId: string;
}

/** SLI-1600.019 — Design Extension Model. */
export interface SLIDesignValidationRule {
  id: string;
  description: string;
}

export interface SLIDesignExtension {
  id: string;
  version: string;

  applicationId?: string;

  tokenOverrides?: SLIDesignToken[];

  regionMappings?: Record<string, unknown>;

  rendererMappings?: Record<string, unknown>;

  validationRules?: SLIDesignValidationRule[];

  metadata?: Record<string, unknown>;
}

export interface ExtensionApplicationResult {
  tokens: SLIDesignToken[];
  rejectedOverrides: Array<{ tokenId: string; reason: string }>;
}

/**
 * Applies an extension to a token set with boundary enforcement
 * (SLI-1600.019): applications may express themselves; they may not corrupt
 * projection semantics. Overrides may change values, never roles/categories,
 * and may not weaken accessibility constraints.
 */
export function applyDesignExtension(
  baseTokens: SLIDesignToken[],
  extension: SLIDesignExtension
): ExtensionApplicationResult {
  const tokens = new Map(baseTokens.map((t) => [t.id, t]));
  const rejectedOverrides: ExtensionApplicationResult["rejectedOverrides"] = [];

  for (const override of extension.tokenOverrides ?? []) {
    const base = tokens.get(override.id);
    if (!base) {
      rejectedOverrides.push({
        tokenId: override.id,
        reason: "override targets a token that does not exist; extensions may not add new core semantics"
      });
      continue;
    }
    if (base.category !== override.category || base.role !== override.role) {
      rejectedOverrides.push({
        tokenId: override.id,
        reason: "extensions may override token values, never semantic meaning (SLI-1600.009 color rule, SLI-1600.019)"
      });
      continue;
    }
    const baseContrast = base.accessibilityConstraints?.minimumContrastRatio;
    const overrideContrast = override.accessibilityConstraints?.minimumContrastRatio;
    if (
      typeof baseContrast === "number" &&
      typeof overrideContrast === "number" &&
      overrideContrast < baseContrast
    ) {
      rejectedOverrides.push({
        tokenId: override.id,
        reason: "extensions MUST NOT break accessibility requirements (SLI-1600.019)"
      });
      continue;
    }
    tokens.set(override.id, {
      ...base,
      value: override.value,
      ...(override.rendererOverrides !== undefined
        ? { rendererOverrides: override.rendererOverrides }
        : {}),
      metadata: { ...base.metadata, overriddenBy: extension.id }
    });
  }

  return { tokens: [...tokens.values()], rejectedOverrides };
}
