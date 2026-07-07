/**
 * @wge/graph — Minimal in-memory World Graph.
 *
 * REF-1900.007. Build order position 5 (REF-1900.003).
 * Volume 1100 (WGE-1100.001 – WGE-1100.013) is the governing specification.
 */
export {
  buildGraph,
  getEntity,
  getRelationship,
  outbound,
  inbound,
  aspectsOf,
  getSnapshot,
  getDiff,
  addSnapshot,
  addDiff,
  findOrphanedEntities,
  type InMemoryWorldGraph
} from "./graph.js";
export {
  buildEntityIndex,
  buildAspectIndex,
  buildRelationshipIndex,
  buildTemporalIndex,
  type TemporalIndexInput
} from "./indexes.js";
export { serializeWorld, deserializeWorld, worldsEquivalent } from "./serialize.js";
