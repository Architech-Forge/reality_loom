/**
 * Reality Architecture color system.
 *
 * dark · precise · spatial · technical · substrate-like · graph-based ·
 * thin luminous geometry · controlled teal/gold signal.
 * No soft SaaS cards. No beige lifestyle texture.
 *
 * Color is functional before aesthetic (SLI-1600.009): every value below is
 * bound to a runtime meaning, and color is never the only carrier of it.
 */

export const realityArchitecturePalette = {
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

export type RAPaletteKey = keyof typeof realityArchitecturePalette;

/** Runtime-semantic color roles — what each signal MEANS in the substrate. */
export const raColorRoles = {
  /** The substrate itself: the space Worlds live in. */
  substrate: realityArchitecturePalette.void,
  /** Resting field surfaces. */
  field: realityArchitecturePalette.obsidian,
  /** Raised runtime structure. */
  structure: realityArchitecturePalette.graphite,
  /** Projection-active regions. */
  projectionField: realityArchitecturePalette.deepField,

  /** Committed Reality signal. */
  reality: realityArchitecturePalette.tealCore,
  /** Live trace / causality signal. */
  trace: realityArchitecturePalette.signalBlue,
  /** Candidate / possibility signal — never teal: possibility must read differently from Reality. */
  candidate: realityArchitecturePalette.oldGold,
  /** Authority boundaries, blocked paths, and law rejections. */
  boundary: realityArchitecturePalette.ember,

  /** Primary readable content. */
  content: realityArchitecturePalette.pearl,
  /** Secondary/receded content. */
  contentMuted: realityArchitecturePalette.mutedPearl,

  /** Resting geometry. */
  line: realityArchitecturePalette.line,
  /** Energized geometry (active projection, live runtime). */
  signalLine: realityArchitecturePalette.signalLine
} as const;

export type RAColorRole = keyof typeof raColorRoles;
