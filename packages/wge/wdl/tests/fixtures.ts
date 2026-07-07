/**
 * Shared structured-WDL fixture: the Family Style World from the Codex
 * examples (WDL-001.002, WGE-1100.007, REF-1900.018).
 */
import type { WDLDocument } from "@wge/wdl";

export function familyStyleWorldDocument(): WDLDocument {
  return {
    world: {
      id: "world_family",
      name: "Family Style World",
      version: "1.0.0",
      default_timezone: "America/Denver"
    },
    entities: [
      { id: "household_primary", type: "household" },
      {
        id: "person_emma",
        type: "person",
        aspects: [
          { kind: "identity", data: { display_name: "Emma" } },
          {
            kind: "permission",
            data: { measurements: "private" },
            visibility: { mode: "restricted", requiredCapability: "household.measurements.view" }
          }
        ]
      },
      { id: "closet_emma", type: "closet" },
      {
        id: "garment_blue_jacket",
        type: "garment",
        aspects: [
          { kind: "state", data: { color: "navy", material: "wool", category: "jacket" } },
          { kind: "application", data: { "availability.status": "available" } }
        ]
      },
      { id: "event_wedding", type: "event" }
    ],
    relationships: [
      { from: "household_primary", type: "includes_person", to: "person_emma", weight: 100, confidence: 1 },
      { from: "person_emma", type: "owns", to: "closet_emma", weight: 100, confidence: 1 },
      { from: "closet_emma", type: "contains", to: "garment_blue_jacket" },
      { from: "household_primary", type: "references", to: "event_wedding" },
      { from: "world_family_root", type: "contains", to: "household_primary" }
    ],
    laws: [
      {
        name: "Garments must be available before recommendation",
        appliesTo: { kind: "type", value: "garment" },
        condition: {
          op: "equals",
          left: { kind: "path", path: "aspects.application.availability.status" },
          right: { kind: "literal", value: "available" }
        },
        outcome: "reject",
        severity: "error"
      }
    ],
    objectives: [
      {
        id: "objective_family_event_look",
        label: "Plan family event look",
        entry: "household_primary",
        traversal: "traversal_coordinate_group_style"
      }
    ],
    traversals: [
      {
        id: "traversal_coordinate_group_style",
        name: "Coordinate group style",
        from: "household_primary",
        rules: [
          { follow: "includes_person", collect: { kind: "type", value: "person" } },
          { follow: "owns", collect: { kind: "type", value: "closet" } },
          { follow: "contains", collect: { kind: "type", value: "garment" } }
        ],
        apply: ["law_garments_must_be_available_before_recommendation"],
        output: { kind: "entities", orderBy: "id" }
      }
    ],
    constraints: [
      {
        id: "constraint_no_private_measurement_leak",
        applies_to: { kind: "type", value: "person" },
        block_when: {
          op: "not",
          condition: {
            op: "has_authority",
            actorRef: { kind: "actor", field: "id" },
            capability: "measurements.view"
          }
        },
        reason: "Measurements are private."
      }
    ]
  };
}
