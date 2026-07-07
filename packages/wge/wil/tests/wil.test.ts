import { describe, expect, it } from "vitest";
import type { WILMessage } from "@roc/types";
import {
  createOutcome,
  createTrace,
  createWILMessage,
  redactTraceStep,
  serializeCanonicalJson,
  validateWILMessage,
  WILMessageError
} from "@wge/wil";

const emma = {
  id: "actor_emma",
  type: "human" as const,
  displayName: "Emma",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate"]
  }
};

function simulateInput() {
  return {
    actor: emma,
    intent: {
      type: "simulate" as const,
      reason: "Plan a family look for a wedding",
      objectiveId: "objective_family_event_look",
      confidence: 0.98
    },
    target: { kind: "candidate_world" as const },
    context: {
      worldId: "world_family",
      snapshotId: "snap_2026_07_05_001",
      temporal: {
        timestamp: "2026-07-05T10:00:00-06:00",
        timezone: "America/Denver"
      },
      execution: {
        deterministic: true,
        allowPartial: false,
        allowDeferred: true
      }
    },
    mode: "simulate" as const,
    payload: {
      event: "wedding rehearsal dinner",
      people: ["person_emma", "person_james", "person_lila"],
      goal: "coordinated but not matching"
    }
  };
}

describe("createWILMessage (REF-1900.005)", () => {
  it("creates a valid envelope with generated ids and defaults", () => {
    const message = createWILMessage(simulateInput());
    expect(message.protocol).toBe("wil");
    expect(message.version).toBe("1.0.0");
    expect(message.id).toMatch(/^msg_/);
    expect(message.traceId).toMatch(/^trace_/);
    expect(Number.isFinite(Date.parse(message.timestamp))).toBe(true);
    expect(validateWILMessage(message).valid).toBe(true);
  });

  it("generates globally unique message ids", () => {
    const ids = new Set(
      Array.from({ length: 500 }, () => createWILMessage(simulateInput()).id)
    );
    expect(ids.size).toBe(500);
  });

  it("lets multiple messages share a trace id (WIL-001.001)", () => {
    const first = createWILMessage(simulateInput());
    const second = createWILMessage({ ...simulateInput(), traceId: first.traceId });
    expect(second.traceId).toBe(first.traceId);
  });

  it("rejects an invalid actor at construction", () => {
    const input = simulateInput();
    // @ts-expect-error — deliberately invalid actor type
    input.actor = { ...emma, type: "alien" };
    expect(() => createWILMessage(input)).toThrow(WILMessageError);
  });
});

describe("validateWILMessage (WIL-001.010 minimum compliance)", () => {
  it("accepts the canonical Codex example message (WIL-001.009)", () => {
    const message = {
      protocol: "wil",
      version: "1.0.0",
      id: "msg_01HZX",
      traceId: "trace_88K",
      actor: {
        id: "actor_emma",
        type: "human",
        displayName: "Emma",
        authority: {
          authenticated: true,
          permissions: ["world.observe", "world.simulate"]
        }
      },
      intent: {
        type: "simulate",
        reason: "Plan a family look for a wedding",
        objectiveId: "objective_family_event_look",
        confidence: 0.98
      },
      target: { kind: "candidate_world" },
      context: {
        worldId: "world_family",
        snapshotId: "snap_2026_07_05_001",
        temporal: {
          timestamp: "2026-07-05T10:00:00-06:00",
          timezone: "America/Denver"
        },
        execution: {
          deterministic: true,
          allowPartial: false,
          allowDeferred: true
        }
      },
      mode: "simulate",
      payload: {
        event: "wedding rehearsal dinner",
        people: ["person_emma", "person_james", "person_lila"],
        goal: "coordinated but not matching"
      },
      timestamp: "2026-07-05T10:00:00-06:00"
    };
    const result = validateWILMessage(message);
    expect(result.diagnostics).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("rejects non-object input without throwing", () => {
    for (const bad of [null, undefined, 42, "wil", []]) {
      const result = validateWILMessage(bad);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("WIL_ENVELOPE_NOT_OBJECT");
    }
  });

  it("requires every envelope field (WIL-001.001)", () => {
    const result = validateWILMessage({ protocol: "wil" });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("WIL_ACTOR_MISSING");
    expect(codes).toContain("WIL_INTENT_MISSING");
    expect(codes).toContain("WIL_TARGET_MISSING");
    expect(codes).toContain("WIL_CONTEXT_MISSING");
    expect(codes).toContain("WIL_MODE_INVALID");
    expect(codes).toContain("WIL_TIMESTAMP_INVALID");
  });

  it("a message without an Actor is invalid (WIL-001.001 invariant)", () => {
    const message = { ...createWILMessage(simulateInput()) } as Record<string, unknown>;
    delete message.actor;
    const result = validateWILMessage(message);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WIL_ACTOR_MISSING")).toBe(true);
  });

  it("rejects unsupported protocol major versions (version negotiation)", () => {
    const message = { ...createWILMessage(simulateInput()), version: "2.0.0" };
    const result = validateWILMessage(message);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WIL_VERSION_UNSUPPORTED")).toBe(true);
  });

  it("requires the Context to identify a World (WIL-001.006)", () => {
    const input = simulateInput();
    input.context = { ...input.context, worldId: "" };
    const result = validateWILMessage({
      ...createWILMessage(simulateInput()),
      context: input.context
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WIL_CONTEXT_WORLD_MISSING")).toBe(true);
  });

  it("rejects anonymous commits (WIL-001.002 / WIL-001.010)", () => {
    const message = createWILMessage(simulateInput());
    const anonymousCommit = {
      ...message,
      mode: "commit",
      actor: { ...emma, authority: { authenticated: false, permissions: [] } }
    };
    const result = validateWILMessage(anonymousCommit);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "WIL_ANONYMOUS_COMMIT")).toBe(true);
  });

  it("warns when a commit does not name its expected snapshot (WIL-001.006 SHOULD)", () => {
    const input = simulateInput();
    const { snapshotId: _snapshotId, ...contextWithoutSnapshot } = input.context;
    const message = createWILMessage({
      ...input,
      mode: "commit",
      context: contextWithoutSnapshot
    });
    const result = validateWILMessage(message);
    expect(result.valid).toBe(true); // SHOULD → warning, not error
    expect(
      result.diagnostics.some(
        (d) => d.code === "WIL_COMMIT_WITHOUT_SNAPSHOT" && d.severity === "warning"
      )
    ).toBe(true);
  });
});

describe("serializeCanonicalJson (WIL-001.009)", () => {
  it("orders keys deterministically regardless of insertion order", () => {
    const a = createWILMessage({ ...simulateInput(), id: "msg_A", traceId: "trace_A", timestamp: "2026-07-05T10:00:00Z" });
    const shuffled = JSON.parse(JSON.stringify(a)) as WILMessage;
    expect(serializeCanonicalJson(shuffled)).toBe(serializeCanonicalJson(a));
    const keys = Object.keys(JSON.parse(serializeCanonicalJson(a)) as object);
    expect(keys).toEqual([...keys].sort());
  });

  it("is byte-identical across repeated serialization (determinism)", () => {
    const message = createWILMessage({ ...simulateInput(), id: "msg_B", traceId: "trace_B", timestamp: "2026-07-05T10:00:00Z" });
    expect(serializeCanonicalJson(message)).toBe(serializeCanonicalJson(message));
  });

  it("rejects non-finite numbers", () => {
    const message = createWILMessage(simulateInput());
    message.payload = { bad: Number.POSITIVE_INFINITY };
    expect(() => serializeCanonicalJson(message)).toThrow(/non-finite/);
    message.payload = { bad: Number.NaN };
    expect(() => serializeCanonicalJson(message)).toThrow(/non-finite/);
  });

  it("omits undefined object values (avoid undefined values)", () => {
    const message = createWILMessage(simulateInput());
    message.payload = { present: 1, absent: undefined };
    expect(serializeCanonicalJson(message)).not.toContain("absent");
  });
});

describe("createOutcome (WIL-001.007)", () => {
  it("creates outcomes for every status, including rejected-as-success-of-truth", () => {
    for (const status of [
      "success",
      "rejected",
      "deferred",
      "partial",
      "simulation",
      "conflict",
      "error"
    ] as const) {
      const outcome = createOutcome({ status, messageId: "msg_1", traceId: "trace_1" });
      expect(outcome.status).toBe(status);
    }
  });

  it("requires messageId and traceId", () => {
    expect(() => createOutcome({ status: "success", messageId: "", traceId: "t" })).toThrow();
    expect(() => createOutcome({ status: "success", messageId: "m", traceId: "" })).toThrow();
  });
});

describe("createTrace (WIL-001.008)", () => {
  const steps = [
    { order: 2, phase: "validated" as const, status: "passed" as const, reason: "envelope valid" },
    { order: 1, phase: "received" as const, status: "passed" as const, reason: "message received" }
  ];

  it("creates a trace with steps ordered by declared order", () => {
    const trace = createTrace({
      messageId: "msg_1",
      actorId: "actor_emma",
      steps,
      summary: "Simulation request validated"
    });
    expect(trace.steps.map((s) => s.phase)).toEqual(["received", "validated"]);
    expect(trace.id).toMatch(/^trace_/);
  });

  it("requires actor identity — who initiated the interaction", () => {
    expect(() =>
      createTrace({ messageId: "msg_1", actorId: "", steps, summary: "s" })
    ).toThrow(/who initiated/);
  });

  it("requires a reason on every step — every interaction must be explainable", () => {
    expect(() =>
      createTrace({
        messageId: "msg_1",
        actorId: "actor_emma",
        steps: [{ order: 1, phase: "received", status: "passed", reason: "" }],
        summary: "s"
      })
    ).toThrow(/explainable/);
  });

  it("redacts protected details while indicating the omission (privacy rule)", () => {
    const step = {
      order: 3,
      phase: "law_checked" as const,
      status: "blocked" as const,
      reason: "measurements are private",
      relatedEntityIds: ["person_emma_measurements"],
      relatedLawIds: ["law_measurements_private"]
    };
    const redacted = redactTraceStep(step);
    expect(redacted.relatedEntityIds).toBeUndefined();
    expect(redacted.relatedLawIds).toBeUndefined();
    expect(redacted.reason).toContain("omitted");
    expect(redacted.phase).toBe("law_checked");
  });
});
