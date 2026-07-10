/**
 * Z stacking — the numeric projection of depth.ts. Renderers use these
 * directly; the layout engine uses them for collision layering.
 */
import { RL_DEPTH_ORDER, type RLDepthLayer } from "./depth.js";

/** Each depth layer owns a 100-slot band; objects fine-tune within it. */
export const RL_Z_BAND = 100;

export const rlZ: Record<RLDepthLayer, number> = Object.fromEntries(
  RL_DEPTH_ORDER.map((layer, index) => [layer, index * RL_Z_BAND])
) as Record<RLDepthLayer, number>;

export const zFor = (layer: RLDepthLayer, offset = 0): number =>
  rlZ[layer] + Math.max(0, Math.min(RL_Z_BAND - 1, offset));
