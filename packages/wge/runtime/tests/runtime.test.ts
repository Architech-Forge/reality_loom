import { beforeEach, describe, expect, it } from "vitest";
import type { WGESourceUnit, WILActor, WILMessage } from "@roc/types";
import { compileWorld } from "@wge/compiler";
import type { WGEExecutableWorld } from "@wge/executable";
import { createWILMessage } from "@wge/wil";
import { WGERuntime } from "@wge/runtime";
import { familyStyleWorldDocument } from "../../wdl/tests/fixtures.js";

const NOW = "2026-07-06T12:00:00Z";
let tick = 0;
const clock = () => `2026-07-06T12:00:${String(tick++ % 60).padStart(2, "0")}Z`;

const emma: WILActor = {
  id: "actor_emma",
  type: "human",
  displayName: "Emma",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "measurements.view"]
  }
};

const strangerAI: WILActor = {
  id: "actor_stranger_ai",
  type: "ai",
  authority: { authenticated: true, permissions: ["world.observe"] }
};

async function loadRuntime(): Promise<WGERuntime> {
  const source: WGESourceUnit = {
    id: "family",
    format: "wdl",
    content: familyStyleWorldDocument() as unknown as Record<string, unknown>
  };
  const compiled = await compileWorld({ source, now: NOW });
  if (!compiled.executableWorld) throw new Error("family world failed to compile");
  return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: clock });
}

function msg(
  actor: WILActor,
  mode: "observe" | "simulate" | "commit",
  intentType: WILMessage["intent"]["type"],
  overrides: {
    targetKind?: WILMessage["target"]["kind"];
    targetId?: string;
    payload?: Record<string, unknown>;
    snapshotId?: string;
    candidateWorldId?: string;
    traceId?: string;
  } = {}
): WILMessage {
  return createWILMessage({
    actor,
    intent: { type: intentType, reason: `test ${intentType}` },
    target: {
      kind: overrides.targetKind ?? "entity",
      ...(overrides.targetId !== undefined ? { id: overrides.targetId } : {})
    },
    context: {
      worldId: "world_family",
      ...(overrides.snapshotId !== undefined ? { snapshotId: overrides.snapshotId } : {}),
      ...(overrides.candidateWorldId !== undefined
        ? { candidateWorldId: overrides.candidateWorldId }
        : {})
    },
    mode,
    ...(overrides.payload !== undefined ? { payload: overrides.payload } : {}),
    ...(overrides.traceId !== undefined ? { traceId: overrides.traceId } : {})
  });
}

const newGarment = (id: string, status: string) => ({
  id,
  type: "garment",
  containedBy: "closet_emma",
  aspects: [{ kind: "application", data: { "availability.status": status } }]
});

describe("WGERuntime lifecycle (WGE-1300.002)", () => {
  it("loads an Executable World and reaches ready", async () => {
    const runtime = await loadRuntime();
    expect(runtime.lifecycleState).toBe("ready");
    expect(runtime.currentSnapshot().id).toBe("snap_world_family__initial");
  });
});

describe("observe mode (WGE-1300.006)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  it("observes without mutating Reality", async () => {
    const before = runtime.currentSnapshot();
    const output = await runtime.observe(msg(emma, "observe", "observe", { targetId: "person_emma" }));
    expect(output.outcome.status).toBe("success");
    expect(output.outcome.snapshotId).toBe(before.id);
    expect(runtime.currentSnapshot()).toBe(before); // Reality snapshot unchanged
    expect(output.trace.steps.map((s) => s.phase)).toContain("authorized");
  });

  it("rejects observation of missing entities with a full trace", async () => {
    const output = await runtime.observe(msg(emma, "observe", "observe", { targetId: "entity_ghost" }));
    expect(output.outcome.status).toBe("rejected");
    expect(output.trace.steps.at(-1)?.phase).toBe("completed");
  });

  it("rejects mode mismatch: a commit message cannot slip through observe()", async () => {
    const commitMessage = msg(emma, "commit", "create", {
      targetId: "garment_new",
      payload: newGarment("garment_new", "available"),
      snapshotId: runtime.currentSnapshot().id
    });
    const output = await runtime.observe(commitMessage);
    expect(output.outcome.status).toBe("rejected");
    expect(output.diagnostics?.some((d) => d.code === "RUNTIME_MODE_MISMATCH")).toBe(true);
    expect(runtime.realityWorld().entities["garment_new"]).toBeUndefined();
  });
});

describe("simulate mode — Candidate Worlds (WGE-1300.013, REF-1900.015)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  it("creates a Candidate World and applies changes in isolation", async () => {
    const before = runtime.currentSnapshot();
    const output = await runtime.simulate(
      msg(emma, "simulate", "create", {
        targetId: "garment_sim",
        payload: newGarment("garment_sim", "available")
      })
    );
    expect(output.outcome.status).toBe("simulation");
    expect(output.candidateWorldId).toBeDefined();

    // Isolation: Reality is untouched (this is one of the first compliance tests).
    expect(runtime.currentSnapshot()).toBe(before);
    expect(runtime.realityWorld().entities["garment_sim"]).toBeUndefined();

    const candidate = runtime.getCandidateWorld(output.candidateWorldId ?? "");
    expect(candidate?.status).toBe("active");
    expect(candidate?.baseSnapshotId).toBe(before.id);
    expect(candidate?.currentCandidateSnapshotId).not.toBe(before.id); // separate lineage

    const comparison = runtime.compareCandidateToReality(output.candidateWorldId ?? "");
    expect(comparison?.equivalent).toBe(false);
    expect(comparison?.operationCount).toBeGreaterThan(0);
  });

  it("laws apply inside Candidate Worlds too", async () => {
    const output = await runtime.simulate(
      msg(emma, "simulate", "create", {
        targetId: "garment_bad",
        payload: newGarment("garment_bad", "sold_out")
      })
    );
    expect(output.outcome.status).toBe("rejected");
    expect(output.diagnostics?.some((d) => d.code === "RUNTIME_LAW_REJECTED")).toBe(true);
  });

  it("rejects simulation from actors without world.simulate", async () => {
    const output = await runtime.simulate(
      msg(strangerAI, "simulate", "create", {
        targetId: "garment_x",
        payload: newGarment("garment_x", "available")
      })
    );
    expect(output.outcome.status).toBe("rejected");
    expect(output.diagnostics?.some((d) => d.code === "RUNTIME_UNAUTHORIZED")).toBe(true);
  });

  it("discards Candidate Worlds", async () => {
    const output = await runtime.simulate(msg(emma, "simulate", "simulate", { targetKind: "candidate_world" }));
    const id = output.candidateWorldId ?? "";
    expect(runtime.discardCandidateWorld(id)).toBe(true);
    expect(runtime.getCandidateWorld(id)?.status).toBe("discarded");
    expect(runtime.discardCandidateWorld(id)).toBe(false); // already discarded
  });
});

describe("commit mode — transactions (WGE-1300.007, REF-1900.012)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  it("commits a valid mutation atomically with full causality", async () => {
    const base = runtime.currentSnapshot();
    const output = await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_committed",
        payload: newGarment("garment_committed", "available"),
        snapshotId: base.id
      })
    );
    expect(output.outcome.status).toBe("success");
    expect(output.snapshot?.parentSnapshotId).toBe(base.id); // lineage
    expect(output.diff?.fromSnapshotId).toBe(base.id); // snapshot-bound
    expect(output.diff?.traceId).toBe(output.trace.messageId ? output.outcome.traceId : ""); // causal
    expect(runtime.currentSnapshot().id).toBe(output.snapshot?.id);
    expect(runtime.realityWorld().entities["garment_committed"]?.type).toBe("garment");
    expect(runtime.realityWorld().entities["garment_committed"]?.lifecycle).toBe("active");

    const phases = output.trace.steps.map((s) => s.phase);
    for (const phase of ["received", "validated", "authorized", "law_checked", "diff_generated", "committed", "completed"]) {
      expect(phases).toContain(phase);
    }
  });

  it("rejects commits blocked by World Laws and preserves Reality", async () => {
    const base = runtime.currentSnapshot();
    const output = await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_unavailable",
        payload: newGarment("garment_unavailable", "sold_out"),
        snapshotId: base.id
      })
    );
    expect(output.outcome.status).toBe("rejected");
    expect(runtime.currentSnapshot()).toBe(base);
    expect(runtime.realityWorld().entities["garment_unavailable"]).toBeUndefined();
    expect(
      output.trace.steps.some((s) => s.phase === "law_checked" && s.status === "blocked")
    ).toBe(true);
  });

  it("constraint blocks modifying a person without measurements.view", async () => {
    const noAuthority: WILActor = {
      ...emma,
      id: "actor_no_authority",
      authority: { authenticated: true, permissions: ["world.commit"] }
    };
    const output = await runtime.commit(
      msg(noAuthority, "commit", "modify", {
        targetId: "person_emma",
        payload: { aspects: [{ kind: "state", data: { mood: "curious" } }] },
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(output.outcome.status).toBe("rejected");
    expect(
      output.diagnostics?.some(
        (d) => d.code === "RUNTIME_LAW_REJECTED" && d.relatedIds?.includes("constraint_no_private_measurement_leak")
      )
    ).toBe(true);

    // With authority, the same modification commits.
    const allowed = await runtime.commit(
      msg(emma, "commit", "modify", {
        targetId: "person_emma",
        payload: { aspects: [{ kind: "state", data: { mood: "curious" } }] },
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(allowed.outcome.status).toBe("success");
  });

  it("rejects unauthorized commits (WGE-1300.020 noncompliance list)", async () => {
    const output = await runtime.commit(
      msg(strangerAI, "commit", "create", {
        targetId: "garment_hack",
        payload: newGarment("garment_hack", "available"),
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(output.outcome.status).toBe("rejected");
    expect(output.diagnostics?.some((d) => d.code === "RUNTIME_UNAUTHORIZED_COMMIT")).toBe(true);
  });

  it("refuses stale-snapshot commits as conflicts — never silently overwrites", async () => {
    const stale = runtime.currentSnapshot().id;
    await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_first",
        payload: newGarment("garment_first", "available"),
        snapshotId: stale
      })
    );
    const output = await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_second",
        payload: newGarment("garment_second", "available"),
        snapshotId: stale // Reality has moved on
      })
    );
    expect(output.outcome.status).toBe("conflict");
    expect(runtime.realityWorld().entities["garment_second"]).toBeUndefined();
  });

  it("delete archives instead of destroying (WIL-001.003)", async () => {
    const output = await runtime.commit(
      msg(emma, "commit", "delete", {
        targetId: "garment_blue_jacket",
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(output.outcome.status).toBe("success");
    expect(runtime.realityWorld().entities["garment_blue_jacket"]?.lifecycle).toBe("archived");
  });

  it("commit snapshots are immutable and lineage-linked", async () => {
    const output = await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_snap",
        payload: newGarment("garment_snap", "available"),
        snapshotId: runtime.currentSnapshot().id
      })
    );
    const snapshot = output.snapshot;
    expect(snapshot).toBeDefined();
    expect(() => {
      (snapshot as { id: string }).id = "snap_hacked";
    }).toThrow(TypeError);
  });
});

describe("candidate world merge (WGE-1300.014)", () => {
  let runtime: WGERuntime;
  beforeEach(async () => {
    runtime = await loadRuntime();
  });

  it("merges a Candidate World into Reality through explicit commit", async () => {
    const simulated = await runtime.simulate(
      msg(emma, "simulate", "create", {
        targetId: "garment_planned",
        payload: newGarment("garment_planned", "available")
      })
    );
    const candidateId = simulated.candidateWorldId ?? "";
    expect(runtime.realityWorld().entities["garment_planned"]).toBeUndefined();

    const merged = await runtime.commit(
      msg(emma, "commit", "commit", {
        targetKind: "candidate_world",
        targetId: candidateId,
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(merged.outcome.status).toBe("success");
    expect(runtime.realityWorld().entities["garment_planned"]?.type).toBe("garment");
    expect(runtime.getCandidateWorld(candidateId)?.status).toBe("merged");
    expect(merged.snapshot?.metadata?.mergedFromCandidate).toBe(candidateId);
  });

  it("refuses to merge when Reality diverged since branching", async () => {
    const simulated = await runtime.simulate(
      msg(emma, "simulate", "create", {
        targetId: "garment_stale_plan",
        payload: newGarment("garment_stale_plan", "available")
      })
    );
    // Reality moves on.
    await runtime.commit(
      msg(emma, "commit", "create", {
        targetId: "garment_interloper",
        payload: newGarment("garment_interloper", "available"),
        snapshotId: runtime.currentSnapshot().id
      })
    );
    const merged = await runtime.commit(
      msg(emma, "commit", "commit", {
        targetKind: "candidate_world",
        targetId: simulated.candidateWorldId ?? "",
        snapshotId: runtime.currentSnapshot().id
      })
    );
    expect(merged.outcome.status).toBe("conflict");
    expect(runtime.realityWorld().entities["garment_stale_plan"]).toBeUndefined();
  });
});

describe("trace store (WGE-1300.004)", () => {
  it("persists retrievable traces for every execution", async () => {
    const runtime = await loadRuntime();
    const message = msg(emma, "observe", "observe", { targetId: "person_emma" });
    await runtime.observe(message);
    const trace = runtime.getTrace(message.traceId);
    expect(trace).toBeDefined();
    expect(trace?.actorId).toBe("actor_emma");
    expect(trace?.steps.every((s) => s.reason.length > 0)).toBe(true);
  });
});

describe("deterministic execution (WGE-1300.005 invariant)", () => {
  it("identical inputs on identical worlds produce identical Reality", async () => {
    const fixed = () => "2026-07-06T12:00:00Z";
    const build = async () => {
      const compiled = await compileWorld({
        source: { id: "family", format: "wdl", content: familyStyleWorldDocument() as unknown as Record<string, unknown> },
        now: NOW
      });
      return new WGERuntime(compiled.executableWorld as WGEExecutableWorld, { now: fixed });
    };
    const [a, b] = await Promise.all([build(), build()]);
    const run = (r: WGERuntime) =>
      r.commit(
        msg(emma, "commit", "create", {
          targetId: "garment_det",
          payload: newGarment("garment_det", "available"),
          snapshotId: "snap_world_family__initial",
          traceId: "trace_fixed"
        })
      );
    const [ra, rb] = [await run(a), await run(b)];
    expect(ra.outcome.status).toBe("success");
    expect(ra.snapshot?.entityIndexHash).toBe(rb.snapshot?.entityIndexHash);
    expect(ra.snapshot?.relationshipIndexHash).toBe(rb.snapshot?.relationshipIndexHash);
  });
});
