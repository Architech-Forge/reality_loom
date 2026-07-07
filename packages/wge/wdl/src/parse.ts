/**
 * WDL JSON parsing and validation (WDL-001.002 – WDL-001.011, WDL-001.014).
 *
 * Parsing produces structure and syntax diagnostics only — parsing MUST NOT
 * produce World entities directly (WGE-1200.004): "Parsing produces syntax.
 * Compilation produces Worlds."
 */
import type { WGECompilerDiagnostic, WGESourceRef } from "@roc/types";
import { WGE_LAW_OUTCOMES, WGE_LAW_SCOPES, WGE_SELECTOR_KINDS } from "@roc/types";
import type { WDLDocument } from "./document.js";

export interface WDLParseResult {
  document?: WDLDocument;
  diagnostics: WGECompilerDiagnostic[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function diag(
  code: string,
  message: string,
  reason: string,
  sourceRef: WGESourceRef,
  suggestedFix?: string
): WGECompilerDiagnostic {
  return {
    code,
    severity: "error",
    message,
    reason,
    sourceRef,
    ...(suggestedFix !== undefined ? { suggestedFix } : {})
  };
}

/**
 * Validates structured WDL JSON. Never throws; invalid documents return
 * diagnostics with source paths so authors can fix them (WGE-1200.017:
 * diagnostics should teach).
 */
export function parseWDLDocument(input: unknown, sourceUnitId = "wdl"): WDLParseResult {
  const diagnostics: WGECompilerDiagnostic[] = [];
  const at = (path: string): WGESourceRef => ({ sourceUnitId, path });

  if (!isRecord(input)) {
    return {
      diagnostics: [
        diag(
          "WDL_DOCUMENT_NOT_OBJECT",
          "A structured WDL document must be a JSON object",
          `received ${Array.isArray(input) ? "array" : typeof input}`,
          at("$")
        )
      ]
    };
  }

  // WDL-001.002: exactly one top-level world.
  const world = input.world;
  if (!isRecord(world)) {
    diagnostics.push(
      diag(
        "WDL_WORLD_MISSING",
        "Every WDL document MUST define exactly one top-level world (WDL-001.002)",
        "the world section is missing or not an object",
        at("$.world"),
        'add a world section: { "id": "...", "name": "...", "version": "..." }'
      )
    );
  } else {
    for (const field of ["id", "name", "version"] as const) {
      if (typeof world[field] !== "string" || world[field].length === 0) {
        diagnostics.push(
          diag(
            "WDL_WORLD_FIELD_MISSING",
            `A World MUST have ${field} (WDL-001.003)`,
            `world.${field} is missing or empty`,
            at(`$.world.${field}`)
          )
        );
      }
    }
  }

  validateArraySection(input, "entities", at, diagnostics, (entity, path) => {
    if (typeof entity.id !== "string" || entity.id.length === 0) {
      diagnostics.push(
        diag("WDL_ENTITY_ID_MISSING", "Every Entity MUST have a stable ID (WDL-001.004)", `entity at ${path} has no id`, at(`${path}.id`))
      );
    }
    if (typeof entity.type !== "string" || entity.type.length === 0) {
      diagnostics.push(
        diag("WDL_ENTITY_TYPE_MISSING", "Every Entity MUST have a type (WDL-001.004)", `entity "${String(entity.id)}" has no type`, at(`${path}.type`))
      );
    }
    if (entity.aspects !== undefined) {
      if (!Array.isArray(entity.aspects)) {
        diagnostics.push(
          diag("WDL_ASPECTS_INVALID", "entity.aspects must be an array (WDL-001.005)", `entity "${String(entity.id)}"`, at(`${path}.aspects`))
        );
      } else {
        entity.aspects.forEach((aspect, i) => {
          if (!isRecord(aspect) || typeof aspect.kind !== "string" || !isRecord(aspect.data)) {
            diagnostics.push(
              diag(
                "WDL_ASPECT_INVALID",
                "An Aspect declaration needs kind and data (WDL-001.005)",
                `aspect ${i} of entity "${String(entity.id)}"`,
                at(`${path}.aspects[${i}]`)
              )
            );
          }
        });
      }
    }
  });

  validateArraySection(input, "relationships", at, diagnostics, (rel, path) => {
    for (const field of ["from", "type", "to"] as const) {
      if (typeof rel[field] !== "string" || rel[field].length === 0) {
        diagnostics.push(
          diag(
            "WDL_RELATIONSHIP_FIELD_MISSING",
            `Every Relationship MUST define source entity, target entity, and type (WDL-001.006)`,
            `relationship at ${path} is missing ${field}`,
            at(`${path}.${field}`)
          )
        );
      }
    }
  });

  validateArraySection(input, "laws", at, diagnostics, (law, path) => {
    if (typeof law.name !== "string" || law.name.length === 0) {
      diagnostics.push(
        diag("WDL_LAW_NAME_MISSING", "A Law needs a name (WDL-001.007)", `law at ${path}`, at(`${path}.name`))
      );
    }
    if (!isRecord(law.appliesTo) || !WGE_SELECTOR_KINDS.includes(law.appliesTo.kind as never)) {
      diagnostics.push(
        diag("WDL_LAW_SELECTOR_INVALID", "A Law needs a valid appliesTo selector (WGE-1000.006)", `law "${String(law.name)}"`, at(`${path}.appliesTo`))
      );
    }
    if (!isRecord(law.condition) || typeof law.condition.op !== "string") {
      diagnostics.push(
        diag("WDL_LAW_CONDITION_INVALID", "A Law condition must be a deterministic expression AST with an op (WGE-1000.006)", `law "${String(law.name)}"`, at(`${path}.condition`))
      );
    }
    if (!WGE_LAW_OUTCOMES.includes(law.outcome as never)) {
      diagnostics.push(
        diag(
          "WDL_LAW_OUTCOME_INVALID",
          `A Law outcome must be one of: ${WGE_LAW_OUTCOMES.join(" | ")} (WDL-001.007)`,
          `law "${String(law.name)}" has outcome ${JSON.stringify(law.outcome)}`,
          at(`${path}.outcome`)
        )
      );
    }
    if (law.scope !== undefined && !WGE_LAW_SCOPES.includes(law.scope as never)) {
      diagnostics.push(
        diag("WDL_LAW_SCOPE_INVALID", "Law scope must be kernel | physics | world (WGE-1000.006)", `law "${String(law.name)}"`, at(`${path}.scope`))
      );
    }
  });

  validateArraySection(input, "objectives", at, diagnostics, (objective, path) => {
    for (const field of ["id", "label", "entry", "traversal"] as const) {
      if (typeof objective[field] !== "string" || objective[field].length === 0) {
        diagnostics.push(
          diag(
            "WDL_OBJECTIVE_FIELD_MISSING",
            "Every Objective MUST define stable ID, label, entry point, and traversal strategy (WDL-001.008)",
            `objective at ${path} is missing ${field}`,
            at(`${path}.${field}`)
          )
        );
      }
    }
  });

  validateArraySection(input, "traversals", at, diagnostics, (traversal, path) => {
    if (typeof traversal.id !== "string" || traversal.id.length === 0) {
      diagnostics.push(
        diag("WDL_TRAVERSAL_ID_MISSING", "A Traversal needs a stable id (WDL-001.009)", `traversal at ${path}`, at(`${path}.id`))
      );
    }
    const from = traversal.from;
    const fromValid =
      (typeof from === "string" && from.length > 0) ||
      (isRecord(from) && WGE_SELECTOR_KINDS.includes(from.kind as never));
    if (!fromValid) {
      diagnostics.push(
        diag("WDL_TRAVERSAL_FROM_INVALID", "A Traversal needs an entry entity or selector (WDL-001.009)", `traversal "${String(traversal.id)}"`, at(`${path}.from`))
      );
    }
    if (!Array.isArray(traversal.rules)) {
      diagnostics.push(
        diag("WDL_TRAVERSAL_RULES_INVALID", "Traversal rules must be an array (WDL-001.009)", `traversal "${String(traversal.id)}"`, at(`${path}.rules`))
      );
    }
    if (!isRecord(traversal.output) || typeof traversal.output.kind !== "string") {
      diagnostics.push(
        diag("WDL_TRAVERSAL_OUTPUT_INVALID", "A Traversal needs an output spec (WDL-001.009)", `traversal "${String(traversal.id)}"`, at(`${path}.output`))
      );
    }
  });

  validateArraySection(input, "capabilities", at, diagnostics, (capability, path) => {
    if (typeof capability.id !== "string") {
      diagnostics.push(
        diag("WDL_CAPABILITY_ID_MISSING", "A Capability needs a stable id (WDL-001.010)", `capability at ${path}`, at(`${path}.id`))
      );
    }
    // WDL-001.010: a Capability without permission requirements is invalid
    // unless explicitly marked public.
    const requires = capability.requires;
    const isPublic = capability.public === true;
    if (!isPublic && (!Array.isArray(requires) || requires.length === 0)) {
      diagnostics.push(
        diag(
          "WDL_CAPABILITY_UNPERMISSIONED",
          "A Capability without permission requirements is invalid unless explicitly marked public (WDL-001.010)",
          `capability "${String(capability.id)}" declares no requires and is not public`,
          at(`${path}.requires`),
          'add requires: ["<permission>"] or set public: true'
        )
      );
    }
  });

  validateArraySection(input, "constraints", at, diagnostics, (constraint, path) => {
    if (typeof constraint.id !== "string") {
      diagnostics.push(
        diag("WDL_CONSTRAINT_ID_MISSING", "A Constraint needs a stable id (WDL-001.011)", `constraint at ${path}`, at(`${path}.id`))
      );
    }
    if (!isRecord(constraint.applies_to)) {
      diagnostics.push(
        diag("WDL_CONSTRAINT_SELECTOR_INVALID", "A Constraint needs an applies_to selector (WDL-001.011)", `constraint "${String(constraint.id)}"`, at(`${path}.applies_to`))
      );
    }
    if (!isRecord(constraint.block_when)) {
      diagnostics.push(
        diag("WDL_CONSTRAINT_CONDITION_INVALID", "A Constraint needs a block_when condition (WDL-001.011)", `constraint "${String(constraint.id)}"`, at(`${path}.block_when`))
      );
    }
    if (typeof constraint.reason !== "string" || constraint.reason.length === 0) {
      diagnostics.push(
        diag("WDL_CONSTRAINT_REASON_MISSING", "A Constraint needs a human readable reason (WDL-001.011)", `constraint "${String(constraint.id)}"`, at(`${path}.reason`))
      );
    }
  });

  if (diagnostics.some((d) => d.severity === "error")) {
    return { diagnostics };
  }
  return { document: input as unknown as WDLDocument, diagnostics };
}

function validateArraySection(
  input: Record<string, unknown>,
  section: string,
  at: (path: string) => WGESourceRef,
  diagnostics: WGECompilerDiagnostic[],
  validateItem: (item: Record<string, unknown>, path: string) => void
): void {
  const value = input[section];
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      diag(
        "WDL_SECTION_NOT_ARRAY",
        `The ${section} section must be an array (WDL-001.002)`,
        `received ${typeof value}`,
        at(`$.${section}`)
      )
    );
    return;
  }
  value.forEach((item, i) => {
    const path = `$.${section}[${i}]`;
    if (!isRecord(item)) {
      diagnostics.push(
        diag("WDL_DECLARATION_NOT_OBJECT", `Each ${section} declaration must be an object`, `item ${i} is ${typeof item}`, at(path))
      );
      return;
    }
    validateItem(item, path);
  });
}
