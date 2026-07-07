/**
 * Selector primitive resolution (WGE-1000.011).
 *
 * Selectors MUST be deterministic: results are always sorted by id, so
 * identical inputs produce identical outputs. Selectors resolve against a
 * World's current content; snapshot-bound resolution arrives with the
 * graph/runtime layers (WGE-1100, WGE-1300).
 */
import type { WGEEntity, WGERelationship, WGESelector, WGEWorld } from "@roc/types";

export interface SelectorResolution {
  entities: WGEEntity[];
  relationships: WGERelationship[];
}

const byId = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export function resolveSelector(world: WGEWorld, selector: WGESelector): SelectorResolution {
  const none: SelectorResolution = { entities: [], relationships: [] };
  const allEntities = Object.values(world.entities);
  const allRelationships = Object.values(world.relationships);

  switch (selector.kind) {
    case "root": {
      const root = world.entities[world.rootEntityId];
      return { entities: root ? [root] : [], relationships: [] };
    }
    case "id": {
      const id = String(selector.value);
      const entity = world.entities[id];
      const relationship = world.relationships[id];
      return {
        entities: entity ? [entity] : [],
        relationships: relationship ? [relationship] : []
      };
    }
    case "type":
      return {
        entities: byId(allEntities.filter((e) => e.type === selector.value)),
        relationships: []
      };
    case "aspect":
      return {
        entities: byId(
          allEntities.filter((e) => e.aspects.some((a) => a.kind === selector.value))
        ),
        relationships: []
      };
    case "relationship":
      return {
        entities: [],
        relationships: byId(allRelationships.filter((r) => r.type === selector.value))
      };
    case "law":
    case "traversal":
    case "query":
      // Law/traversal-driven selection and the query language are compiler
      // and runtime concerns (WGE-1200.011, WGE-1300.010); the kernel
      // resolves them to empty deterministically rather than guessing.
      return none;
  }
}
