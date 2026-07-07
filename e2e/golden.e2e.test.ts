/**
 * Golden fixture verification (TEST-2500.003, TEST-2500.005): golden outputs
 * are executable specification examples.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileWorld } from "@wge/compiler";
import { familyStyleWorld } from "@examples/family-style-world";

interface GoldenFixture {
  id: string;
  input: { now: string };
  expected: {
    worldId: string;
    initialSnapshotId: string;
    entityIndexHash: string;
    relationshipIndexHash: string;
    lawIndexHash: string;
    entityCount: number;
  };
}

describe("golden fixtures (TEST-2500.003)", () => {
  it("golden_family_style_world compiles to its canonical hashes", async () => {
    const fixture = JSON.parse(
      readFileSync("test/fixtures/golden/golden_family_style_world.json", "utf8")
    ) as GoldenFixture;

    const result = await compileWorld({
      source: {
        id: fixture.id,
        format: "wdl",
        content: familyStyleWorld() as unknown as Record<string, unknown>
      },
      now: fixture.input.now
    });

    expect(result.success).toBe(true);
    const exec = result.executableWorld;
    expect(exec?.worldId).toBe(fixture.expected.worldId);
    expect(exec?.initialSnapshotId).toBe(fixture.expected.initialSnapshotId);
    expect(exec?.initialSnapshot.entityIndexHash).toBe(fixture.expected.entityIndexHash);
    expect(exec?.initialSnapshot.relationshipIndexHash).toBe(fixture.expected.relationshipIndexHash);
    expect(exec?.initialSnapshot.lawIndexHash).toBe(fixture.expected.lawIndexHash);
    expect(exec?.graph.entitiesById.size).toBe(fixture.expected.entityCount);
  });

  it("golden_invalid_relationship_world fails compilation deterministically", async () => {
    const world = familyStyleWorld();
    world.relationships?.push({ from: "person_ghost", type: "owns", to: "closet_emma" });
    const [a, b] = await Promise.all(
      [1, 2].map(() =>
        compileWorld({
          source: { id: "golden_invalid", format: "wdl", content: world as unknown as Record<string, unknown> },
          now: "2026-07-06T12:00:00Z"
        })
      )
    );
    expect(a.success).toBe(false);
    expect(a.diagnostics.map((d) => d.code)).toEqual(b.diagnostics.map((d) => d.code));
  });
});
