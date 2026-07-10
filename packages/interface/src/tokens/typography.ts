/**
 * Typography intent — technical, precise, substrate-native. Roles are
 * semantic (SLI-1600.007); renderers map them to platform type systems.
 * Text exists to reduce uncertainty; decorative text has no place here.
 */

export type RLTypeRole =
  | "world_title"
  | "surface_title"
  | "node_label"
  | "trace_annotation"
  | "runtime_value"
  | "boundary_notice"
  | "candidate_marker"
  | "substrate_caption";

export interface RLTypeToken {
  role: RLTypeRole;
  /** rem scale — renderers may adapt for dynamic type. */
  size: number;
  weight: 300 | 400 | 500 | 600;
  tracking: "tight" | "normal" | "wide" | "mono";
  /** Monospace signals machine truth (ids, hashes, values, traces). */
  mono: boolean;
}

export const rlTypography: Record<RLTypeRole, RLTypeToken> = {
  world_title: { role: "world_title", size: 1.75, weight: 300, tracking: "wide", mono: false },
  surface_title: { role: "surface_title", size: 1.125, weight: 500, tracking: "wide", mono: false },
  node_label: { role: "node_label", size: 0.8125, weight: 500, tracking: "normal", mono: false },
  trace_annotation: { role: "trace_annotation", size: 0.75, weight: 400, tracking: "mono", mono: true },
  runtime_value: { role: "runtime_value", size: 0.8125, weight: 400, tracking: "mono", mono: true },
  boundary_notice: { role: "boundary_notice", size: 0.75, weight: 600, tracking: "wide", mono: false },
  candidate_marker: { role: "candidate_marker", size: 0.6875, weight: 600, tracking: "wide", mono: true },
  substrate_caption: { role: "substrate_caption", size: 0.6875, weight: 400, tracking: "normal", mono: false }
} as const;
