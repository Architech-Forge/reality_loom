/**
 * Shared primitive types.
 *
 * REF-1900.004 — Minimal Type Package.
 */

export type ROCID = string;
export type WGEID = string;

/** ISO 8601 timestamp string (WIL-001.009). */
export type WGETimestamp = string;

/** 0.0 to 1.0 */
export type Confidence = number;

/** -100 to 100 */
export type Weight = number;

/** 0 to 100 */
export type Priority = number;

/**
 * Narrow validation helpers.
 *
 * REF-1900.004 permits the type package to contain "no runtime logic except
 * narrow validation helpers" — these are those helpers.
 */

export function isConfidence(value: unknown): value is Confidence {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isWeight(value: unknown): value is Weight {
  return typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 100;
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** ISO 8601 check: must parse to a finite date and round-trip a "T" separator. */
export function isWGETimestamp(value: unknown): value is WGETimestamp {
  if (typeof value !== "string" || !value.includes("T")) return false;
  return Number.isFinite(Date.parse(value));
}
