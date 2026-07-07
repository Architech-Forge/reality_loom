/**
 * Graph Serialization (WGE-1100.012).
 *
 * Canonical JSON is the required baseline encoding. Serialization goes
 * through the WIL canonical serializer, so ordering is deterministic and a
 * decoded graph preserves semantic equivalence with its source.
 */
import type { WGEWorld } from "@roc/types";
import { serializeCanonicalValue } from "@wge/wil";

export function serializeWorld(world: WGEWorld): string {
  return serializeCanonicalValue(world);
}

export function deserializeWorld(json: string): WGEWorld {
  return JSON.parse(json) as WGEWorld;
}

/** True when two Worlds are semantically equivalent (canonical-mode comparison). */
export function worldsEquivalent(a: WGEWorld, b: WGEWorld): boolean {
  return serializeCanonicalValue(a) === serializeCanonicalValue(b);
}
