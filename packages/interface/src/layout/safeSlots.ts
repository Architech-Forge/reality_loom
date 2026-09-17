/**
 * Safe slots — where a displaced object may land. Candidate positions ring
 * outward from the preferred bounds in a deterministic spiral, so the same
 * contention always resolves to the same layout.
 */
import { clampInto, intersects, within, type RABounds } from "./bounds.js";
import { RA_MIN_GAP } from "../tokens/spacing.js";

/** Deterministic ring search: 8 directions per radius, radius grows by step. */
export function* candidateSlots(preferred: RABounds, viewport: RABounds, maxRings = 12): Generator<RABounds> {
  const step = Math.max(RA_MIN_GAP * 2, Math.min(preferred.width, preferred.height) / 2, 16);
  for (let ring = 1; ring <= maxRings; ring += 1) {
    const r = ring * step;
    // Fixed direction order: E, W, S, N, SE, SW, NE, NW — deterministic.
    const offsets: Array<[number, number]> = [
      [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]
    ];
    for (const [dx, dy] of offsets) {
      const slot = clampInto(
        { x: preferred.x + dx, y: preferred.y + dy, width: preferred.width, height: preferred.height },
        viewport
      );
      yield slot;
    }
  }
}

/**
 * Nearest safe slot: the first candidate (in deterministic ring order) that
 * fits the viewport and collides with nothing. Returns undefined when no
 * slot exists — the caller collapses the object to a node marker.
 */
export function nearestSafeSlot(
  preferred: RABounds,
  obstacles: readonly RABounds[],
  viewport: RABounds
): RABounds | undefined {
  const fits = (slot: RABounds): boolean =>
    within(slot, viewport) && obstacles.every((o) => !intersects(slot, o, RA_MIN_GAP));

  for (const slot of candidateSlots(preferred, viewport)) {
    if (fits(slot)) return slot;
  }
  return undefined;
}

/** The collapsed node marker an unplaceable object becomes. */
export const NODE_MARKER_SIZE = 12;

export function collapseToMarker(preferred: RABounds, viewport: RABounds): RABounds {
  return clampInto(
    {
      x: preferred.x + preferred.width / 2 - NODE_MARKER_SIZE / 2,
      y: preferred.y + preferred.height / 2 - NODE_MARKER_SIZE / 2,
      width: NODE_MARKER_SIZE,
      height: NODE_MARKER_SIZE
    },
    viewport
  );
}
