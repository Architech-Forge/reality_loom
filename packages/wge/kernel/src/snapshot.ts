/**
 * Snapshot primitive (WGE-1000.009, REF-1900.006).
 *
 * Snapshots are immutable, replayable, and causality-preserving. Immutability
 * is enforced structurally: every snapshot is deep-frozen at creation, so a
 * mutation attempt throws in strict mode ("Mutable Snapshot attempts" are a
 * kernel rejection, REF-1900.006).
 */
import type { WGESnapshot, WGEWorld } from "@roc/types";
import { generateId } from "@wge/wil";
import { hashIndex } from "./hash.js";

export interface WGESnapshotInput {
  world: WGEWorld;

  id?: string;
  parentSnapshotId?: string;
  eventId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * REF-1900.006 required function. Index hashes are deterministic: the same
 * World content always produces the same hashes (WGE-1000.013).
 */
export function createSnapshot(input: WGESnapshotInput): WGESnapshot {
  const { world } = input;
  const snapshot: WGESnapshot = {
    id: input.id ?? generateId("snap"),
    worldId: world.id,
    createdAt: input.createdAt ?? new Date().toISOString(),
    entityIndexHash: hashIndex(world.entities),
    relationshipIndexHash: hashIndex(world.relationships),
    lawIndexHash: hashIndex(world.laws)
  };
  if (input.parentSnapshotId !== undefined) snapshot.parentSnapshotId = input.parentSnapshotId;
  if (input.eventId !== undefined) snapshot.eventId = input.eventId;
  if (input.metadata !== undefined) snapshot.metadata = input.metadata;

  return deepFreeze(snapshot);
}

/** True when two snapshots capture identical World content. */
export function snapshotsEquivalent(a: WGESnapshot, b: WGESnapshot): boolean {
  return (
    a.worldId === b.worldId &&
    a.entityIndexHash === b.entityIndexHash &&
    a.relationshipIndexHash === b.relationshipIndexHash &&
    a.lawIndexHash === b.lawIndexHash
  );
}
