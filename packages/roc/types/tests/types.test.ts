import { describe, expect, it } from "vitest";
import {
  isConfidence,
  isPriority,
  isWeight,
  isWGETimestamp,
  WIL_EXECUTION_MODES,
  WIL_INTENT_TYPES,
  WIL_PROTOCOL,
  WIL_PROTOCOL_VERSION,
  WGE_SELECTOR_KINDS
} from "@roc/types";

describe("@roc/types primitives (REF-1900.004)", () => {
  it("validates Confidence range 0.0 to 1.0", () => {
    expect(isConfidence(0)).toBe(true);
    expect(isConfidence(1)).toBe(true);
    expect(isConfidence(0.98)).toBe(true);
    expect(isConfidence(-0.1)).toBe(false);
    expect(isConfidence(1.1)).toBe(false);
    expect(isConfidence(Number.NaN)).toBe(false);
    expect(isConfidence("0.5")).toBe(false);
  });

  it("validates Weight range -100 to 100", () => {
    expect(isWeight(-100)).toBe(true);
    expect(isWeight(100)).toBe(true);
    expect(isWeight(101)).toBe(false);
    expect(isWeight(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("validates Priority range 0 to 100", () => {
    expect(isPriority(0)).toBe(true);
    expect(isPriority(100)).toBe(true);
    expect(isPriority(-1)).toBe(false);
  });

  it("validates ISO 8601 timestamps (WIL-001.009)", () => {
    expect(isWGETimestamp("2026-07-05T10:00:00-06:00")).toBe(true);
    expect(isWGETimestamp("2026-07-05T10:00:00Z")).toBe(true);
    expect(isWGETimestamp("not a date")).toBe(false);
    expect(isWGETimestamp("2026-07-05")).toBe(false);
    expect(isWGETimestamp(1234567890)).toBe(false);
  });
});

describe("@roc/types protocol constants", () => {
  it("pins the WIL protocol identity (WIL-001.001)", () => {
    expect(WIL_PROTOCOL).toBe("wil");
    expect(WIL_PROTOCOL_VERSION).toBe("1.0.0");
  });

  it("exposes the full WIL intent set (WIL-001.003)", () => {
    expect(WIL_INTENT_TYPES).toHaveLength(12);
    expect(WIL_INTENT_TYPES).toContain("observe");
    expect(WIL_INTENT_TYPES).toContain("explain");
  });

  it("exposes the four execution modes (WIL-001.005)", () => {
    expect([...WIL_EXECUTION_MODES]).toEqual([
      "observe",
      "simulate",
      "commit",
      "replay"
    ]);
  });

  it("exposes the eight selector kinds (WGE-1000.011)", () => {
    expect(WGE_SELECTOR_KINDS).toHaveLength(8);
  });
});
