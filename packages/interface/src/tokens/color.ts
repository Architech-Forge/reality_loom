/**
 * Reality Loom color system.
 *
 * dark · precise · spatial · technical · substrate-like · graph-based ·
 * thin luminous geometry · controlled teal/gold signal.
 * No soft SaaS cards. No beige lifestyle texture.
 *
 * Color is functional before aesthetic (SLI-1600.009): every value below is
 * bound to a runtime meaning, and color is never the only carrier of it.
 */

export const realityLoomPalette = {
  void: "#050607",
  obsidian: "#090B0D",
  graphite: "#12161A",
  deepField: "#071C22",

  tealCore: "#62E6D8",
  signalBlue: "#4DA3FF",
  oldGold: "#C89B4A",
  ember: "#E0783E",

  pearl: "#EAE3D3",
  mutedPearl: "rgba(234, 227, 211, 0.64)",

  line: "rgba(234, 227, 211, 0.12)",
  signalLine: "rgba(98, 230, 216, 0.28)"
} as const;

export type RLPaletteKey = keyof typeof realityLoomPalette;

/** Runtime-semantic color roles — what each signal MEANS in the substrate. */
export const rlColorRoles = {
  /** The substrate itself: the space Worlds live in. */
  substrate: realityLoomPalette.void,
  /** Resting field surfaces. */
  field: realityLoomPalette.obsidian,
  /** Raised runtime structure. */
  structure: realityLoomPalette.graphite,
  /** Projection-active regions. */
  projectionField: realityLoomPalette.deepField,

  /** Committed Reality signal. */
  reality: realityLoomPalette.tealCore,
  /** Live trace / causality signal. */
  trace: realityLoomPalette.signalBlue,
  /** Candidate / possibility signal — never teal: possibility must read differently from Reality. */
  candidate: realityLoomPalette.oldGold,
  /** Authority boundaries, blocked paths, and law rejections. */
  boundary: realityLoomPalette.ember,

  /** Primary readable content. */
  content: realityLoomPalette.pearl,
  /** Secondary/receded content. */
  contentMuted: realityLoomPalette.mutedPearl,

  /** Resting geometry. */
  line: realityLoomPalette.line,
  /** Energized geometry (active projection, live runtime). */
  signalLine: realityLoomPalette.signalLine
} as const;

export type RLColorRole = keyof typeof rlColorRoles;
