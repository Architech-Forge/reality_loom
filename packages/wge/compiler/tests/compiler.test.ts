import { describe, expect, it } from "vitest";
import type { WGESourceUnit } from "@roc/types";
import { compileWorld, importWILMessages } from "@wge/compiler";
import { createWILMessage, serializeCanonicalValue } from "@wge/wil";
import { familyStyleWorldDocument } from "../../wdl/tests/fixtures.js";

const NOW = "2026-07-06T12:00:00Z";

function source(content: unknown, format: WGESourceUnit["format"] = "wdl"): WGESourceUnit {
  return { id: "test_source", format, content: content as Record<string, unknown> };
}

async function compileFamily(mutate?: (doc: ReturnType<typeof familyStyleWorldDocument>) => void) {
  const doc = familyStyleWorldDocument();
  mutate?.(doc);
  return compileWorld({ source: source(doc), now: NOW });
}

describe("compileWorld — success path (REF-1900.009)", () => {
  it("compiles the Family Style World into an Executable World", async () => {
    const result = await compileFamily();
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.success).toBe(true);

    const exec = result.executableWorld;
    expect(exec).toBeDefined();
    if (!exec) return;

    // REF-1900.010 minimum executable structure.
    expect(exec.worldId).toBe("world_family");
    expect(exec.rootEntityId).toBe("world_family_root");
    expect(exec.graph.entitiesById.has("garment_blue_jacket")).toBe(true);
    expect(exec.lawIndex.size).toBeGreaterThanOrEqual(2); // law + constraint
    expect(exec.traversalIndex.has("traversal_coordinate_group_style")).toBe(true);
    expect(exec.traversalPlans.get("traversal_coordinate_group_style")?.expectedOutputKind).toBe(
      "entities"
    );
    expect(exec.initialSnapshotId).toBe("snap_world_family__initial");
    expect(exec.graph.snapshotsById.has(exec.initialSnapshotId)).toBe(true);
    expect(exec.compilerVersion).toBeTruthy();
    expect(exec.kernelVersion).toBeTruthy();
    expect(exec.wilVersion).toBe("1.0.0");
  });

  it("produces deterministic output for identical input (WGE-1200.002)", async () => {
    const [a, b] = await Promise.all([compileFamily(), compileFamily()]);
    expect(a.executableWorld && b.executableWorld).toBeTruthy();
    expect(serializeCanonicalValue(a.executableWorld?.world)).toBe(
      serializeCanonicalValue(b.executableWorld?.world)
    );
    expect(a.executableWorld?.initialSnapshot.entityIndexHash).toBe(
      b.executableWorld?.initialSnapshot.entityIndexHash
    );
    expect(serializeCanonicalValue(a.executableWorld?.physicsPlan)).toBe(
      serializeCanonicalValue(b.executableWorld?.physicsPlan)
    );
  });

  it("prepares physics without applying it (WGE-1200.012)", async () => {
    const result = await compileFamily();
    const plan = result.executableWorld?.physicsPlan;
    expect(plan?.propagationIndexes).toContain("owns");
    expect(plan?.constraintMaps).toEqual(["constraint_no_private_measurement_leak"]);
    expect(plan?.relevanceFieldSeeds).toEqual(["objective_family_event_look"]);
  });

  it("objectives compile as root-contained wge.objective entities (WDL-001.008)", async () => {
    const result = await compileFamily();
    const world = result.executableWorld?.world;
    const objective = world?.entities["objective_family_event_look"];
    expect(objective?.type).toBe("wge.objective");
    expect(objective?.aspects[0]?.kind).toBe("wge.objective_state");
    expect(objective?.aspects[0]?.data).toMatchObject({
      status: "declared",
      source: { language: "wdl", declarationId: "objective_family_event_look" }
    });
    expect(
      world?.relationships["rel_world_family_root__contains__objective_family_event_look"]
    ).toBeDefined();
  });

  it("constraints compile as Laws with typed compiled-constraint metadata", async () => {
    const result = await compileFamily();
    const law = result.executableWorld?.world.laws["constraint_no_private_measurement_leak"];
    expect(law?.outcome).toBe("reject");
    expect(law?.metadata).toMatchObject({
      source: "wdl",
      constraint: true,
      wdlDeclarationId: "constraint_no_private_measurement_leak",
      compiledFrom: "constraint",
      severity: "error"
    });
  });
});

describe("compileWorld — fatal failures (WGE-1200.002)", () => {
  it("rejects duplicate entity ids (WGE1200-ID-001)", async () => {
    const result = await compileFamily((doc) => {
      doc.entities?.push({ id: "person_emma", type: "person" });
    });
    expect(result.success).toBe(false);
    expect(result.executableWorld).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === "WGE1200-ID-001")).toBe(true);
  });

  it("rejects relationships with missing endpoints (WGE1200-REL-001)", async () => {
    const result = await compileFamily((doc) => {
      doc.relationships?.push({ from: "person_ghost", type: "owns", to: "closet_emma" });
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WGE1200-REL-001")).toBe(true);
  });

  it("rejects world laws that claim kernel scope (WGE-1200.010)", async () => {
    const result = await compileFamily((doc) => {
      doc.laws?.push({
        name: "Sneaky kernel override",
        scope: "kernel",
        appliesTo: { kind: "root" },
        condition: { op: "exists", selector: { kind: "root" } },
        outcome: "allow"
      });
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WGE1200-LAW-001")).toBe(true);
  });

  it("rejects traversals whose entry does not resolve (WGE1200-TRAV-002)", async () => {
    const result = await compileFamily((doc) => {
      doc.traversals?.push({
        id: "traversal_ghost",
        from: "entity_ghost",
        rules: [],
        output: { kind: "entities" }
      });
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WGE1200-TRAV-002")).toBe(true);
  });

  it("kernel validation gates compilation: orphan actives fail (WGE-1000.012)", async () => {
    const result = await compileFamily((doc) => {
      doc.entities?.push({ id: "person_island", type: "person" });
      // no relationship — orphaned active entity
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "KERNEL_ORPHAN_ENTITY")).toBe(true);
  });

  it("warns about unreachable traversal follows (WGE-1200.011)", async () => {
    const result = await compileFamily((doc) => {
      doc.traversals?.push({
        id: "traversal_nowhere",
        from: "household_primary",
        rules: [{ follow: "teleports_to" }],
        output: { kind: "entities" }
      });
    });
    expect(result.success).toBe(true); // warning, not fatal
    expect(
      result.diagnostics.some((d) => d.code === "WGE1200-TRAV-004" && d.severity === "warning")
    ).toBe(true);
  });

  it("stops on unparseable source (WGE1200-SRC-002)", async () => {
    const result = await compileWorld({
      source: { id: "bad", format: "wdl", content: "{not json" },
      now: NOW
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("WGE1200-SRC-002");
  });
});

describe("importWILMessages (WGE-1200.005)", () => {
  const actor = {
    id: "actor_studio",
    type: "application" as const,
    authority: { authenticated: true, permissions: ["world.author"] }
  };

  it("imports create messages as semantic operations preserving causality", () => {
    const message = createWILMessage({
      actor,
      intent: { type: "create", reason: "declare entity" },
      target: { kind: "entity", id: "person_emma" },
      context: { worldId: "world_family" },
      mode: "commit",
      payload: { type: "person" }
    });
    const result = importWILMessages({ messages: [message], mode: "definition" });
    expect(result.diagnostics).toEqual([]);
    expect(result.operations[0]?.kind).toBe("entity.declare");
    expect(result.operations[0]?.payload.id).toBe("person_emma");
    expect(result.operations[0]?.payload._wil).toMatchObject({
      actorId: "actor_studio",
      intent: "create",
      traceId: message.traceId
    });
    expect(result.traceIds).toEqual([message.traceId]);
  });

  it("rejects non-create intents during definition compilation", () => {
    const message = createWILMessage({
      actor,
      intent: { type: "delete", reason: "remove entity" },
      target: { kind: "entity", id: "person_emma" },
      context: { worldId: "world_family", snapshotId: "snap_1" },
      mode: "commit"
    });
    const result = importWILMessages({ messages: [message], mode: "definition" });
    expect(result.operations).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === "WGE1200-WIL-002")).toBe(true);
  });

  it("rejects invalid WIL envelopes", () => {
    const result = importWILMessages({
      messages: [{ protocol: "wil" } as never],
      mode: "definition"
    });
    expect(result.diagnostics.some((d) => d.code === "WGE1200-WIL-001")).toBe(true);
  });
});
