/**
 * Canonical JSON encoding (WIL-001.009).
 *
 * Canonical WIL JSON MUST use UTF-8, deterministic key ordering, ISO 8601
 * timestamps, string IDs; and MUST avoid undefined values and non-finite
 * numbers. Deterministic key ordering here is recursive lexicographic
 * ordering of object keys; array order is semantic and preserved.
 */
import type { WILMessage } from "@roc/types";

export class CanonicalJsonError extends Error {
  constructor(
    message: string,
    public readonly path: string
  ) {
    super(`${message} at ${path}`);
    this.name = "CanonicalJsonError";
  }
}

function canonicalize(value: unknown, path: string): unknown {
  if (value === undefined) {
    // Reached only for array slots / explicit root undefined; object
    // properties that are undefined are omitted before we get here.
    throw new CanonicalJsonError("Canonical WIL JSON must avoid undefined values", path);
  }
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(
        "Canonical WIL JSON must avoid non-finite numbers",
        path
      );
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item, i) => canonicalize(item, `${path}[${i}]`));
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (item === undefined) continue; // omitted, per "avoid undefined values"
      sorted[key] = canonicalize(item, `${path}.${key}`);
    }
    return sorted;
  }
  throw new CanonicalJsonError(
    `Canonical WIL JSON cannot encode a ${typeof value}`,
    path
  );
}

/**
 * REF-1900.005 required function. Deterministic: identical messages always
 * produce byte-identical output.
 */
export function serializeCanonicalJson(message: WILMessage): string {
  return JSON.stringify(canonicalize(message, "$"));
}

/** Canonical serialization for any WIL-adjacent value (outcomes, traces). */
export function serializeCanonicalValue(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}
