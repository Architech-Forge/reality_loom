/**
 * Z stacking — the numeric projection of depth.ts. Renderers use these
 * directly; the layout engine uses them for collision layering.
 */
import { RA_DEPTH_ORDER, type RADepthLayer } from "./depth.js";

/** Each depth layer owns a 100-slot band; objects fine-tune within it. */
export const RA_Z_BAND = 100;

export const raZ: Record<RADepthLayer, number> = Object.fromEntries(
  RA_DEPTH_ORDER.map((layer, index) => [layer, index * RA_Z_BAND])
) as Record<RADepthLayer, number>;

export const zFor = (layer: RADepthLayer, offset = 0): number =>
  raZ[layer] + Math.max(0, Math.min(RA_Z_BAND - 1, offset));
