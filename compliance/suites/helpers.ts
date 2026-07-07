/**
 * Shared fixtures and assertions for the official compliance suites
 * (COMP-2000.004: fixtures are part of the specification).
 */
import type { WGEExecutableWorld } from "@wge/executable";
import type { WGESourceUnit, WILActor, WILMessage } from "@roc/types";
import { familyStyleWorld } from "@examples/family-style-world";
import { compileWorld, type WGECompileResult } from "@wge/compiler";
import { WGERuntime } from "@wge/runtime";
import { createWILMessage } from "@wge/wil";

export const FIXED_NOW = "2026-07-06T12:00:00Z";

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  displayName: "Emma",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view"]
  }
};

export const guest: WILActor = {
  id: "actor_guest",
  type: "human",
  authority: { authenticated: true, permissions: ["world.observe"] }
};

export const anonymous: WILActor = {
  id: "actor_anonymous",
  type: "human",
  authority: { authenticated: false, permissions: [] }
};

export const aiActor: WILActor = {
  id: "actor_ai_assistant",
  type: "ai",
  authority: { authenticated: true, permissions: ["world.observe", "world.simulate"] }
};

export const familyDoc = (): Record<string, unknown> =>
  familyStyleWorld() as unknown as Record<string, unknown>;

export async function compileFamily(
  mutate?: (doc: ReturnType<typeof familyStyleWorld>) => void
): Promise<WGECompileResult> {
  const doc = familyStyleWorld();
  mutate?.(doc);
  const source: WGESourceUnit = {
    id: "compliance_family",
    format: "wdl",
    content: doc as unknown as Record<string, unknown>
  };
  return compileWorld({ source, now: FIXED_NOW });
}

export async function loadFamilyRuntime(): Promise<WGERuntime> {
  const compiled = await compileFamily();
  assert(compiled.executableWorld, "family fixture world must compile");
  return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: () => FIXED_NOW });
}

export function garmentCreate(
  actor: WILActor,
  id: string,
  mode: "simulate" | "commit",
  snapshotId?: string,
  status = "available"
): WILMessage {
  return createWILMessage({
    actor,
    intent: { type: "create", reason: `compliance fixture: create ${id}` },
    target: { kind: "entity", id },
    context: { worldId: "world_family", ...(snapshotId !== undefined ? { snapshotId } : {}) },
    mode,
    payload: {
      id,
      type: "garment",
      containedBy: "closet_emma",
      aspects: [{ kind: "application", data: { "availability.status": status } }]
    }
  });
}
