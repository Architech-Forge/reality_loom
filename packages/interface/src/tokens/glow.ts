/**
 * Glow — controlled signal, never decoration. Glow marks live runtime
 * energy: an active projection, a propagating ripple, a fresh commit.
 * Intensity is bounded; the substrate stays dark and precise.
 */

export type RAGlowRole = "projection" | "ripple" | "commit" | "trace" | "candidate";

export interface RAGlowToken {
  role: RAGlowRole;
  /** Blur radius in px at scale 1. */
  radius: number;
  /** 0..1 — glow is a signal, so intensity is deliberately capped. */
  intensity: number;
  colorRole: "reality" | "trace" | "candidate";
}

export const RA_GLOW_MAX_INTENSITY = 0.45;

export const raGlow: Record<RAGlowRole, RAGlowToken> = {
  projection: { role: "projection", radius: 24, intensity: 0.35, colorRole: "reality" },
  ripple: { role: "ripple", radius: 32, intensity: 0.3, colorRole: "reality" },
  commit: { role: "commit", radius: 16, intensity: 0.45, colorRole: "reality" },
  trace: { role: "trace", radius: 12, intensity: 0.3, colorRole: "trace" },
  candidate: { role: "candidate", radius: 16, intensity: 0.25, colorRole: "candidate" }
} as const;
