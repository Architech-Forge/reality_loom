/**
 * Studio actors (WIL-001.002) and world constants.
 *
 * Every interaction has an Actor; Reality cannot change without causality.
 */
import type { WILActor } from "@roc/types";

export const WORLD_ID = "world_family";
export const OBJECTIVE_ID = "objective_plan_family_look";

/** Emma — the human at the loom. Full household authority. */
export const ACTOR_EMMA: WILActor = {
  id: "actor_emma",
  type: "human",
  displayName: "Emma",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.simulate", "world.commit", "household.measurements.view"]
  }
};

/** A guest observing the household world: no authority, no private aspects. */
export const ACTOR_VISITOR: WILActor = {
  id: "actor_visitor",
  type: "human",
  displayName: "Guest",
  authority: { authenticated: false, permissions: ["world.observe"] }
};

/**
 * The studio's internal runtime actor (WIL-001.002 type "runtime"): commits
 * physics-proposed relevance diffs so effects become Reality the sanctioned
 * way (WGE-1400.013). Scope-bound to that bookkeeping.
 */
export const ACTOR_STUDIO_RUNTIME: WILActor = {
  id: "actor_studio_runtime",
  type: "runtime",
  displayName: "Studio Runtime",
  authority: {
    authenticated: true,
    permissions: ["world.observe", "world.commit", "household.measurements.view"]
  }
};

/** External weather integration (APP-1700.015): attributed, traced provenance. */
export const ACTOR_WEATHER: WILActor = {
  id: "actor_weather_service",
  type: "external_system",
  displayName: "Weather Service",
  authority: { authenticated: true, permissions: ["world.observe", "world.commit"] }
};

/** Actors the studio can act as (the internal actors are not selectable). */
export const SELECTABLE_ACTORS: Record<string, WILActor> = {
  [ACTOR_EMMA.id]: ACTOR_EMMA,
  [ACTOR_VISITOR.id]: ACTOR_VISITOR
};
