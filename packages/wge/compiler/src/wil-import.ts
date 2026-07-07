/**
 * WIL Semantic Import (WGE-1200.005).
 *
 * Converts WIL messages into compiler-compatible semantic operations so
 * Worlds can be authored, modified, replayed, or synchronized via WIL.
 * Imported WIL describes intended World structure — it never mutates live
 * Reality; only the runtime executes commits.
 */
import type { WGECompilerDiagnostic, WGESemanticOperation, WILMessage } from "@roc/types";
import { validateWILMessage } from "@wge/wil";

export interface WILImportInput {
  messages: WILMessage[];
  baseSnapshotId?: string;
  mode: "definition" | "migration" | "replay" | "patch";
}

export interface WILSemanticImportResult {
  operations: WGESemanticOperation[];
  diagnostics: WGECompilerDiagnostic[];
  traceIds: string[];
}

const TARGET_TO_OPERATION: Record<string, WGESemanticOperation["kind"] | undefined> = {
  world: "world.declare",
  entity: "entity.declare",
  relationship: "relationship.declare",
  law: "law.declare",
  traversal: "traversal.declare",
  aspect: "aspect.attach",
  capability: "capability.declare"
};

export function importWILMessages(input: WILImportInput): WILSemanticImportResult {
  const operations: WGESemanticOperation[] = [];
  const diagnostics: WGECompilerDiagnostic[] = [];
  const traceIds = new Set<string>();

  input.messages.forEach((message, i) => {
    const validation = validateWILMessage(message);
    if (!validation.valid) {
      diagnostics.push({
        code: "WGE1200-WIL-001",
        severity: "error",
        message: `WIL message ${i} failed envelope validation`,
        reason: validation.diagnostics.map((d) => d.message).join("; "),
        affectedIds: [String((message as { id?: unknown }).id ?? `index_${i}`)]
      });
      return;
    }

    traceIds.add(message.traceId); // trace causality is preserved

    // Definition compilation accepts structural creation only
    // (WGE-1200.005: reject invalid commit semantics during definition).
    if (input.mode === "definition" && message.intent.type !== "create") {
      diagnostics.push({
        code: "WGE1200-WIL-002",
        severity: "error",
        message: `WIL message "${message.id}" has intent "${message.intent.type}" during definition compilation`,
        reason:
          "definition compilation describes intended World structure; only create intents are valid (WGE-1200.005)",
        affectedIds: [message.id],
        suggestedFix: 'use mode: "migration" or "patch" for modification semantics'
      });
      return;
    }

    const kind = TARGET_TO_OPERATION[message.target.kind];
    if (kind === undefined) {
      diagnostics.push({
        code: "WGE1200-WIL-003",
        severity: "error",
        message: `WIL target kind "${message.target.kind}" cannot import as a definition operation`,
        reason: "only structural target kinds map to semantic operations (WGE-1200.006)",
        affectedIds: [message.id]
      });
      return;
    }

    operations.push({
      id: `op_wil__${message.id}`,
      kind,
      sourceRef: { sourceUnitId: message.id },
      payload: {
        // Actor, intent, target, context, mode are preserved per WGE-1200.005.
        ...(message.payload ?? {}),
        ...(message.target.id !== undefined ? { id: message.target.id } : {}),
        _wil: {
          actorId: message.actor.id,
          intent: message.intent.type,
          mode: message.mode,
          traceId: message.traceId
        }
      }
    });
  });

  return { operations, diagnostics, traceIds: [...traceIds].sort() };
}
