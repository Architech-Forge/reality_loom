/**
 * @wge/wdl — Minimal WDL Implementation (structured JSON intake).
 *
 * REF-1900.008. Build order position 6 (REF-1900.003).
 * Volume 900 (WDL-001.001 – WDL-001.014) is the governing specification.
 *
 * WDL is for authoring Worlds; WIL is for interacting with them; WIR is for
 * compiler internals (WDL-001.001). The textual DSL follows in a later
 * phase — correct semantics come first (REF-1900.008).
 */
export type {
  WDLDocument,
  WDLWorldDeclaration,
  WDLEntityDeclaration,
  WDLAspectDeclaration,
  WDLRelationshipDeclaration,
  WDLLawDeclaration,
  WDLObjectiveDeclaration,
  WDLTraversalDeclaration,
  WDLCapabilityDeclaration,
  WDLConstraintDeclaration
} from "./document.js";
export { parseWDLDocument, type WDLParseResult } from "./parse.js";
export {
  toSemanticOperations,
  documentToWILMessages,
  relationshipIdFor,
  aspectIdFor,
  lawIdFor
} from "./semantic.js";
