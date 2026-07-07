/**
 * Renderer-agnostic design tokens (SLI-1600.007 – SLI-1600.012, SLI-1600.018).
 *
 * Tokens are meaning contracts, not visual mandates: each answers what it
 * means before how it looks. Renderers map roles to platform systems; brands
 * may override values but never semantic meaning (SLI-1600.009).
 */

/** SLI-1600.007 — Typography Roles. Decorative text has no place in core SLI. */
export type SLITypographyRole =
  | "world_title"
  | "workspace_title"
  | "entity_label"
  | "body"
  | "explanation"
  | "annotation"
  | "status"
  | "decision"
  | "metadata"
  | "ambient";

/** Disappearance order as density decreases (SLI-1600.007). */
export const TYPOGRAPHY_DENSITY_SHED_ORDER: readonly SLITypographyRole[] = [
  "metadata",
  "ambient",
  "annotation",
  "explanation",
  "status",
  "body"
] as const;

/** SLI-1600.008 — Material Roles. Material expresses experience role, never domain truth. */
export type SLIMaterialRole =
  | "air"
  | "light"
  | "surface"
  | "paper"
  | "fabric"
  | "wood"
  | "stone"
  | "glass"
  | "shadow"
  | "ink";

/** SLI-1600.009 — Color Roles. Color must never be the only carrier of meaning. */
export type SLIColorRole =
  | "background"
  | "foreground"
  | "primary"
  | "secondary"
  | "supporting"
  | "ambient"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "disabled"
  | "focus"
  | "selection"
  | "confidence_high"
  | "confidence_medium"
  | "confidence_low";

/** SLI-1600.010 — Motion Roles + Tokens. Motion must explain what changed. */
export type SLIMotionRole =
  | "enter"
  | "exit"
  | "shift"
  | "expand"
  | "collapse"
  | "emphasize"
  | "deemphasize"
  | "confirm"
  | "reject"
  | "ambient"
  | "recompose"
  | "recover";

export interface SLIMotionToken {
  role: SLIMotionRole;

  durationMs: number;

  intensity: "none" | "subtle" | "moderate" | "strong";

  interruptible: boolean;

  reducedMotionAlternative: "none" | "fade" | "instant" | "static_state_change";

  metadata?: Record<string, unknown>;
}

/** Default motion tokens within the SLI-1500.009 timing guidance. */
export const DEFAULT_MOTION_TOKENS: readonly SLIMotionToken[] = [
  { role: "enter", durationMs: 280, intensity: "subtle", interruptible: true, reducedMotionAlternative: "fade" },
  { role: "exit", durationMs: 220, intensity: "subtle", interruptible: true, reducedMotionAlternative: "fade" },
  { role: "shift", durationMs: 400, intensity: "moderate", interruptible: true, reducedMotionAlternative: "instant" },
  { role: "expand", durationMs: 350, intensity: "moderate", interruptible: true, reducedMotionAlternative: "static_state_change" },
  { role: "collapse", durationMs: 280, intensity: "moderate", interruptible: true, reducedMotionAlternative: "static_state_change" },
  { role: "emphasize", durationMs: 240, intensity: "subtle", interruptible: true, reducedMotionAlternative: "static_state_change" },
  { role: "deemphasize", durationMs: 240, intensity: "subtle", interruptible: true, reducedMotionAlternative: "static_state_change" },
  { role: "confirm", durationMs: 200, intensity: "subtle", interruptible: false, reducedMotionAlternative: "static_state_change" },
  { role: "reject", durationMs: 200, intensity: "subtle", interruptible: false, reducedMotionAlternative: "static_state_change" },
  { role: "ambient", durationMs: 2400, intensity: "subtle", interruptible: true, reducedMotionAlternative: "none" },
  { role: "recompose", durationMs: 550, intensity: "moderate", interruptible: true, reducedMotionAlternative: "instant" },
  { role: "recover", durationMs: 400, intensity: "subtle", interruptible: false, reducedMotionAlternative: "fade" }
] as const;

/** SLI-1600.011 — Space Roles. Empty space is active design material. */
export type SLISpaceRole =
  | "breathing"
  | "grouping"
  | "separation"
  | "focus"
  | "inspection"
  | "decision"
  | "ambient"
  | "compressed";

/** SLI-1600.012 — Depth Levels. Depth is consequence hierarchy, not decoration. */
export type SLIDepthLevel =
  | "background"
  | "ambient"
  | "surface"
  | "raised"
  | "focused"
  | "decision"
  | "overlay"
  | "critical";

/** SLI-1600.018 — Renderer-Agnostic Design Token. */
export interface SLIDesignToken<T = unknown> {
  id: string;

  category:
    | "typography"
    | "color"
    | "material"
    | "motion"
    | "space"
    | "depth"
    | "interaction"
    | "accessibility";

  role: string;

  value: T;

  semanticDescription: string;

  accessibilityConstraints?: Record<string, unknown>;

  rendererOverrides?: Record<string, unknown>;

  metadata?: Record<string, unknown>;
}

/** The default semantic token set. Values are semantic scales, not pixels/hex. */
export function defaultTokens(): SLIDesignToken[] {
  const tokens: SLIDesignToken[] = [];

  for (const motion of DEFAULT_MOTION_TOKENS) {
    tokens.push({
      id: `token_motion_${motion.role}`,
      category: "motion",
      role: motion.role,
      value: motion,
      semanticDescription: `Motion for ${motion.role}: communicates continuity, respects reduced motion via ${motion.reducedMotionAlternative}`
    });
  }

  const colorMeanings: Record<SLIColorRole, string> = {
    background: "the experiential canvas",
    foreground: "readable content on the canvas",
    primary: "the current attention owner",
    secondary: "important support for the primary",
    supporting: "clarifying context",
    ambient: "background awareness",
    success: "a completed or valid outcome",
    warning: "caution requiring awareness",
    danger: "consequential or destructive action",
    info: "neutral explanation",
    disabled: "currently unavailable agency",
    focus: "keyboard/assistive focus indication",
    selection: "explicit user selection",
    confidence_high: "high-certainty information",
    confidence_medium: "medium-certainty information",
    confidence_low: "low-certainty information that must stay visible"
  };
  for (const [role, meaning] of Object.entries(colorMeanings)) {
    tokens.push({
      id: `token_color_${role}`,
      category: "color",
      role,
      value: role,
      semanticDescription: `Color role ${role}: ${meaning}. Never the only carrier of meaning (SLI-1600.009).`,
      accessibilityConstraints: { minimumContrastRatio: role === "foreground" || role === "primary" ? 4.5 : 3 }
    });
  }

  const spaceScale: Record<SLISpaceRole, number> = {
    compressed: 1,
    grouping: 2,
    separation: 3,
    ambient: 4,
    breathing: 5,
    inspection: 4,
    focus: 6,
    decision: 6
  };
  for (const [role, scale] of Object.entries(spaceScale)) {
    tokens.push({
      id: `token_space_${role}`,
      category: "space",
      role,
      value: scale,
      semanticDescription: `Space role ${role} on a semantic 1–6 scale; accessibility constraints override all spacing preferences (SLI-1600.011).`
    });
  }

  const depthOrder: SLIDepthLevel[] = [
    "background",
    "ambient",
    "surface",
    "raised",
    "focused",
    "decision",
    "overlay",
    "critical"
  ];
  depthOrder.forEach((level, i) => {
    tokens.push({
      id: `token_depth_${level}`,
      category: "depth",
      role: level,
      value: i,
      semanticDescription: `Depth level ${level} (${i}): consequence hierarchy, not decoration (SLI-1600.012).`
    });
  });

  return tokens;
}
