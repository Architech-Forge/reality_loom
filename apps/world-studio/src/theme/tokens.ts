/**
 * World Studio design extension (SLI-1600.018, SLI-1600.019).
 *
 * The studio brands the semantic token set by overriding token *values* —
 * never roles, categories, or accessibility constraints. The extension is
 * applied through the design system's own boundary-enforcing
 * applyDesignExtension; a rejected override is a bug, so it throws loudly.
 *
 * Realm color language (Reality Loom): Reality = gold, Candidate = violet,
 * Projection = teal, Law = ember. Color is never the only carrier of meaning
 * (SLI-1600.009) — every realm is also labeled in text on the canvas.
 */
import {
  applyDesignExtension,
  defaultTokens,
  type SLIDesignExtension,
  type SLIDesignToken
} from "@sli/design-system";

const colorValues: Record<string, string> = {
  background: "#0b0e14",
  foreground: "#e8e4d8",
  primary: "#d4a017",
  secondary: "#8b5cf6",
  supporting: "#2dd4bf",
  ambient: "#4b5563",
  success: "#4ade80",
  warning: "#facc15",
  danger: "#f97316",
  info: "#60a5fa",
  disabled: "#374151",
  focus: "#2dd4bf",
  selection: "#d4a017",
  confidence_high: "#4ade80",
  confidence_medium: "#facc15",
  confidence_low: "#f97316"
};

export const WORLD_STUDIO_EXTENSION: SLIDesignExtension = {
  id: "ext_world_studio",
  version: "1.0.0",
  applicationId: "world_studio",
  tokenOverrides: Object.entries(colorValues).map(
    ([role, value]): SLIDesignToken => ({
      id: `token_color_${role}`,
      category: "color",
      role,
      value,
      semanticDescription: `World Studio brand value for color role ${role}`,
      accessibilityConstraints: {
        minimumContrastRatio: role === "foreground" || role === "primary" ? 4.5 : 3
      }
    })
  )
};

export interface StudioTheme {
  tokens: SLIDesignToken[];
  cssVariables: Record<string, string>;
}

export function buildStudioTheme(): StudioTheme {
  const { tokens, rejectedOverrides } = applyDesignExtension(defaultTokens(), WORLD_STUDIO_EXTENSION);
  if (rejectedOverrides.length > 0) {
    // Extensions may express themselves; they may not corrupt projection
    // semantics — a rejection here means the studio broke that rule.
    throw new Error(
      `World Studio design extension rejected: ${rejectedOverrides
        .map((r) => `${r.tokenId} (${r.reason})`)
        .join("; ")}`
    );
  }

  const cssVariables: Record<string, string> = {};
  for (const token of tokens) {
    if (token.category === "color" && typeof token.value === "string") {
      cssVariables[`--color-${token.role}`] = token.value;
    }
    if (token.category === "motion" && typeof token.value === "object" && token.value !== null) {
      const motion = token.value as { durationMs?: number };
      if (typeof motion.durationMs === "number") {
        cssVariables[`--motion-${token.role}-ms`] = `${motion.durationMs}ms`;
      }
    }
    if (token.category === "space" && typeof token.value === "number") {
      cssVariables[`--space-${token.role}`] = `${token.value * 4}px`;
    }
    if (token.category === "depth" && typeof token.value === "number") {
      cssVariables[`--depth-${token.role}`] = String(token.value * 10);
    }
  }
  return { tokens, cssVariables };
}

/** Installs the theme on the document root. */
export function installStudioTheme(): StudioTheme {
  const theme = buildStudioTheme();
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme.cssVariables)) {
    root.style.setProperty(name, value);
  }
  return theme;
}
