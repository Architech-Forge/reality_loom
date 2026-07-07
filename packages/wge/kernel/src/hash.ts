/**
 * Deterministic index hashing for Snapshots (WGE-1000.009).
 *
 * Kernel compliance (WGE-1000.013) requires deterministic serialization:
 * identical indexes always hash identically, regardless of key insertion
 * order, because hashing goes through canonical serialization.
 */
import { createHash } from "node:crypto";
import { serializeCanonicalValue } from "@wge/wil";

export function hashIndex(index: Record<string, unknown>): string {
  return createHash("sha256").update(serializeCanonicalValue(index), "utf8").digest("hex");
}
