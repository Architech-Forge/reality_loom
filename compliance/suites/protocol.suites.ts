/**
 * Official compliance suites — WIL (COMP-2000.006) and WDL (COMP-2000.007).
 */
import type { ROCComplianceSuite } from "@roc/compliance";
import { defineTest } from "@roc/compliance";
import { createWILMessage, serializeCanonicalJson, validateWILMessage } from "@wge/wil";
import { parseWDLDocument, toSemanticOperations } from "@wge/wdl";
import { familyStyleWorld } from "@examples/family-style-world";
import { anonymous, assert, compileFamily, emma, garmentCreate } from "./helpers.js";

const observe = () =>
  createWILMessage({
    actor: emma,
    intent: { type: "observe" },
    target: { kind: "world" },
    context: { worldId: "world_family" },
    mode: "observe"
  });

const withoutField = (field: string): Record<string, unknown> => {
  const message = { ...observe() } as Record<string, unknown>;
  delete message[field];
  return message;
};

const rejects = (message: unknown, code: string, what: string): void => {
  const result = validateWILMessage(message);
  assert(!result.valid, `${what} must be rejected`);
  assert(
    result.diagnostics.some((d) => d.code === code),
    `${what} must emit ${code}, got ${result.diagnostics.map((d) => d.code).join(",")}`
  );
};

export const wilSuite: ROCComplianceSuite = {
  id: "suite_wil",
  area: "wil",
  version: "1.0.0",
  fixtures: [],
  tests: [
    defineTest("WIL-CT-001", "Message without protocol is rejected", ["WIL-001.001"], async () => {
      rejects(withoutField("protocol"), "WIL_PROTOCOL_INVALID", "protocol-less message");
    }),
    defineTest("WIL-CT-002", "Message without version is rejected", ["WIL-001.001"], async () => {
      rejects(withoutField("version"), "WIL_VERSION_INVALID", "version-less message");
    }),
    defineTest("WIL-CT-003", "Message without Actor is rejected", ["WIL-001.001", "WIL-001.002"], async () => {
      rejects(withoutField("actor"), "WIL_ACTOR_MISSING", "actor-less message");
    }),
    defineTest("WIL-CT-004", "Message without Intent is rejected", ["WIL-001.003"], async () => {
      rejects(withoutField("intent"), "WIL_INTENT_MISSING", "intent-less message");
    }),
    defineTest("WIL-CT-005", "Message without Target is rejected", ["WIL-001.004"], async () => {
      rejects(withoutField("target"), "WIL_TARGET_MISSING", "target-less message");
    }),
    defineTest("WIL-CT-006", "Message without Context is rejected", ["WIL-001.006"], async () => {
      rejects(withoutField("context"), "WIL_CONTEXT_MISSING", "context-less message");
    }),
    defineTest("WIL-CT-007", "Unsupported execution mode is rejected", ["WIL-001.005"], async () => {
      rejects({ ...observe(), mode: "teleport" }, "WIL_MODE_INVALID", "invalid mode");
    }),
    defineTest("WIL-CT-008", "Observe mode cannot declare committed mutation", ["WIL-001.005"], async () => {
      const { WGERuntime } = await import("@wge/runtime");
      const compiled = await compileFamily();
      assert(compiled.executableWorld, "fixture compiles");
      const runtime = new WGERuntime(compiled.executableWorld);
      const output = await runtime.observe(garmentCreate(emma, "garment_x", "commit", runtime.currentSnapshot().id));
      assert(output.outcome.status === "rejected", "commit message via observe() must be rejected");
      assert(!runtime.realityWorld().entities["garment_x"], "Reality must be unchanged");
    }),
    defineTest("WIL-CT-009", "Simulate mode remains distinct from Commit", ["WIL-001.005"], async () => {
      const message = garmentCreate(emma, "garment_y", "simulate");
      assert(message.mode === "simulate" && message.mode !== ("commit" as string), "modes are distinct");
    }),
    defineTest("WIL-CT-010", "Canonical JSON preserves semantic fields deterministically", ["WIL-001.009"], async () => {
      const message = observe();
      const a = serializeCanonicalJson(message);
      const b = serializeCanonicalJson(JSON.parse(a));
      assert(a === b, "canonical serialization must be byte-identical");
      assert(a.includes('"actor"') && a.includes('"intent"'), "semantic fields preserved");
    }),
    defineTest("WIL-CT-011", "Trace ID is preserved", ["WIL-001.008"], async () => {
      const first = observe();
      const second = createWILMessage({
        actor: emma,
        intent: { type: "observe" },
        target: { kind: "world" },
        context: { worldId: "world_family" },
        mode: "observe",
        traceId: first.traceId
      });
      assert(second.traceId === first.traceId, "trace id joins the causal chain");
    }),
    defineTest("WIL-CT-012", "Outcome is produced for valid interaction", ["WIL-001.007"], async () => {
      const { loadFamilyRuntime } = await import("./helpers.js");
      const runtime = await loadFamilyRuntime();
      const output = await runtime.observe(observe());
      assert(output.outcome.status === "success", "valid observe produces success outcome");
      assert(output.trace.steps.length > 0, "trace produced");
    }),
    defineTest("WIL-CT-013", "Rejected outcome is not an implementation error", ["WIL-001.007"], async () => {
      const { loadFamilyRuntime } = await import("./helpers.js");
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(
        garmentCreate(emma, "garment_soldout", "commit", runtime.currentSnapshot().id, "sold_out")
      );
      assert(output.outcome.status === "rejected", "law rejection yields rejected, not error");
    }),
    defineTest("WIL-CT-014", "AI Actor does not inherit human authority automatically", ["WIL-001.002"], async () => {
      const { loadFamilyRuntime, aiActor } = await import("./helpers.js");
      const runtime = await loadFamilyRuntime();
      const output = await runtime.commit(
        garmentCreate(aiActor, "garment_ai", "commit", runtime.currentSnapshot().id)
      );
      assert(output.outcome.status === "rejected", "AI without world.commit cannot commit");
    }),
    defineTest("WIL-CT-015", "Target cannot reference renderer-specific UI", ["WIL-001.004"], async () => {
      rejects({ ...observe(), target: { kind: "button", id: "submit" } }, "WIL_TARGET_KIND_INVALID", "UI target");
    }),
    defineTest("SEC-CT-001", "Anonymous Actor cannot commit Reality", ["WIL-001.002", "COMP-2000.020"], async () => {
      rejects(
        { ...garmentCreate(emma, "garment_anon", "commit", "snap_x"), actor: anonymous },
        "WIL_ANONYMOUS_COMMIT",
        "anonymous commit"
      );
    })
  ]
};

export const wdlSuite: ROCComplianceSuite = {
  id: "suite_wdl",
  area: "wdl",
  version: "1.0.0",
  fixtures: [{ id: "fixture_family_world", type: "wdl_source", specVersion: "1.0.0", data: familyStyleWorld() }],
  tests: [
    defineTest("WDL-CT-001", "Document without world declaration is rejected", ["WDL-001.002"], async () => {
      const result = parseWDLDocument({ entities: [] });
      assert(result.document === undefined, "document rejected");
      assert(result.diagnostics.some((d) => d.code === "WDL_WORLD_MISSING"), "diagnostic emitted");
    }),
    defineTest("WDL-CT-003", "Entity declaration requires stable ID", ["WDL-001.004"], async () => {
      const doc = familyStyleWorld();
      doc.entities?.push({ id: "", type: "thing" });
      const result = parseWDLDocument(doc);
      assert(result.diagnostics.some((d) => d.code === "WDL_ENTITY_ID_MISSING"), "missing id rejected");
    }),
    defineTest("WDL-CT-004", "Entity type does not imply inheritance", ["WDL-001.004", "WGE-1000.003"], async () => {
      const compiled = await compileFamily();
      const bird = compiled.executableWorld?.world.entities["bird_guide"];
      assert(bird?.type === "bird", "type is descriptive");
      assert(bird.aspects.length > 0, "meaning lives in aspects, not type hierarchies");
    }),
    defineTest("WDL-CT-006", "Relationship to missing Entity fails", ["WDL-001.006", "WGE-1200.008"], async () => {
      const result = await compileFamily((doc) => {
        doc.relationships?.push({ from: "ghost", type: "owns", to: "closet_emma" });
      });
      assert(!result.success, "compilation fails");
      assert(result.diagnostics.some((d) => d.code === "WGE1200-REL-001"), "endpoint diagnostic emitted");
    }),
    defineTest("WDL-CT-007", "World Law with invalid selector fails", ["WDL-001.007"], async () => {
      const doc = familyStyleWorld();
      doc.laws?.push({
        name: "Bad law",
        appliesTo: { kind: "pixels" } as never,
        condition: { op: "exists", selector: { kind: "root" } },
        outcome: "reject"
      });
      const result = parseWDLDocument(doc);
      assert(result.diagnostics.some((d) => d.code === "WDL_LAW_SELECTOR_INVALID"), "invalid selector rejected");
    }),
    defineTest("WDL-CT-008", "Objective without traversal fails", ["WDL-001.008"], async () => {
      const doc = familyStyleWorld();
      doc.objectives?.push({ id: "objective_lost", label: "Lost", entry: "household_primary", traversal: "" });
      const result = parseWDLDocument(doc);
      assert(result.diagnostics.some((d) => d.code === "WDL_OBJECTIVE_FIELD_MISSING"), "objective rejected");
    }),
    defineTest("WDL-CT-009", "Traversal with unreachable output emits diagnostic", ["WGE-1200.011"], async () => {
      const result = await compileFamily((doc) => {
        doc.traversals?.push({
          id: "traversal_nowhere",
          from: "household_primary",
          rules: [{ follow: "teleports_to" }],
          output: { kind: "entities" }
        });
      });
      assert(result.diagnostics.some((d) => d.code === "WGE1200-TRAV-004"), "reachability diagnostic emitted");
    }),
    defineTest("WDL-CT-012", "Compilation output is deterministic", ["WDL-001.013", "WGE-1200.002"], async () => {
      const { serializeCanonicalValue } = await import("@wge/wil");
      const [a, b] = await Promise.all([compileFamily(), compileFamily()]);
      assert(
        serializeCanonicalValue(a.executableWorld?.world) === serializeCanonicalValue(b.executableWorld?.world),
        "identical input compiles to identical world"
      );
    }),
    defineTest("WDL-CT-005", "Aspect data must be serializable", ["WDL-001.005"], async () => {
      const { toSemanticOperations: _t } = { toSemanticOperations };
      const doc = familyStyleWorld();
      const ops = toSemanticOperations(doc);
      assert(ops.length > 0, "semantic operations produced");
      for (const op of ops) JSON.stringify(op.payload); // throws on non-serializable
    })
  ]
};
