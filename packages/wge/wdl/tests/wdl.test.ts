import { describe, expect, it } from "vitest";
import {
  documentToWILMessages,
  parseWDLDocument,
  toSemanticOperations
} from "@wge/wdl";
import { validateWILMessage } from "@wge/wil";
import { familyStyleWorldDocument } from "./fixtures.js";

describe("parseWDLDocument (WDL-001.002 – WDL-001.011)", () => {
  it("accepts the Family Style World document", () => {
    const result = parseWDLDocument(familyStyleWorldDocument());
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.document?.world.id).toBe("world_family");
  });

  it("requires exactly one top-level world", () => {
    const result = parseWDLDocument({ entities: [] });
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === "WDL_WORLD_MISSING")).toBe(true);
  });

  it("requires world id, name, and version (WDL-001.003)", () => {
    const result = parseWDLDocument({ world: { id: "w" } });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes.filter((c) => c === "WDL_WORLD_FIELD_MISSING")).toHaveLength(2);
  });

  it("rejects relationships without source, target, and type (WDL-001.006)", () => {
    const doc = familyStyleWorldDocument();
    doc.relationships?.push({ from: "person_emma", type: "", to: "" } as never);
    const result = parseWDLDocument(doc);
    expect(
      result.diagnostics.some((d) => d.code === "WDL_RELATIONSHIP_FIELD_MISSING")
    ).toBe(true);
  });

  it("rejects unpermissioned capabilities unless public (WDL-001.010)", () => {
    const doc = familyStyleWorldDocument();
    doc.capabilities = [
      { id: "capability_open", target: { kind: "root" }, requires: [], executes: "b" }
    ];
    const withoutPermission = parseWDLDocument(doc);
    expect(
      withoutPermission.diagnostics.some((d) => d.code === "WDL_CAPABILITY_UNPERMISSIONED")
    ).toBe(true);

    doc.capabilities = [
      { id: "capability_open", target: { kind: "root" }, requires: [], executes: "b", public: true }
    ];
    const asPublic = parseWDLDocument(doc);
    expect(
      asPublic.diagnostics.some((d) => d.code === "WDL_CAPABILITY_UNPERMISSIONED")
    ).toBe(false);
  });

  it("requires constraints to carry a human readable reason (WDL-001.011)", () => {
    const doc = familyStyleWorldDocument();
    doc.constraints = [
      {
        id: "constraint_bad",
        applies_to: { kind: "root" },
        block_when: { op: "exists", selector: { kind: "root" } },
        reason: ""
      }
    ];
    const result = parseWDLDocument(doc);
    expect(result.diagnostics.some((d) => d.code === "WDL_CONSTRAINT_REASON_MISSING")).toBe(true);
  });

  it("teaches through diagnostics: source path and reason present (WGE-1200.017)", () => {
    const result = parseWDLDocument({ world: { id: "w", name: "W" } });
    const [d] = result.diagnostics;
    expect(d?.reason).toBeTruthy();
    expect(d?.sourceRef?.path).toContain("$.world");
  });
});

describe("toSemanticOperations (WGE-1200.006)", () => {
  it("normalizes every section in deterministic order", () => {
    const doc = familyStyleWorldDocument();
    const first = toSemanticOperations(doc);
    const second = toSemanticOperations(familyStyleWorldDocument());
    expect(first).toEqual(second);
    expect(first[0]?.kind).toBe("world.declare");
    const kinds = new Set(first.map((op) => op.kind));
    expect(kinds).toContain("entity.declare");
    expect(kinds).toContain("aspect.attach");
    expect(kinds).toContain("relationship.declare");
    expect(kinds).toContain("law.declare");
    expect(kinds).toContain("traversal.declare");
    expect(kinds).toContain("constraint.declare");
  });

  it("lowers objectives to wge.objective entities with wge.objective_state aspects (WDL-001.008)", () => {
    const operations = toSemanticOperations(familyStyleWorldDocument());
    const objective = operations.find((op) => op.id === "op_objective__objective_family_event_look");
    expect(objective?.kind).toBe("entity.declare");
    expect(objective?.payload.type).toBe("wge.objective");
    const aspect = operations.find(
      (op) =>
        op.id === "op_aspect__aspect_objective_family_event_look__wge.objective_state"
    );
    expect(aspect?.payload.kind).toBe("wge.objective_state");
    expect(aspect?.payload.data).toMatchObject({
      objectiveKind: "general",
      label: "Plan family event look",
      entry: { selector: { kind: "id", value: "household_primary" } },
      traversal: { traversalId: "traversal_coordinate_group_style", strategy: "declared" },
      status: "declared",
      source: { language: "wdl", declarationId: "objective_family_event_look" }
    });
  });

  it("generates deterministic ids for relationships and laws (WGE-1200.007)", () => {
    const operations = toSemanticOperations(familyStyleWorldDocument());
    expect(
      operations.some((op) => op.id === "op_relationship__rel_person_emma__owns__closet_emma")
    ).toBe(true);
    expect(
      operations.some(
        (op) => op.id === "op_law__law_garments_must_be_available_before_recommendation"
      )
    ).toBe(true);
  });
});

describe("documentToWILMessages (WDL-001.012 Export To WIL)", () => {
  it("exports declarations as valid WIL create messages sharing one trace", () => {
    const actor = {
      id: "actor_studio",
      type: "application" as const,
      authority: { authenticated: true, permissions: ["world.author"] }
    };
    const messages = documentToWILMessages(familyStyleWorldDocument(), actor);
    expect(messages.length).greaterThan(5);
    const traceIds = new Set(messages.map((m) => m.traceId));
    expect(traceIds.size).toBe(1);
    for (const message of messages) {
      expect(message.intent.type).toBe("create");
      expect(validateWILMessage(message).valid).toBe(true);
    }
  });
});
