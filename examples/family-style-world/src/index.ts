/**
 * Reference Family Style World (REF-1900.018).
 *
 * Every required entity, relationship, and law from the Codex, authored
 * through the SDK builders (SDK-1800.004 – SDK-1800.009). The demo
 * objective: plan a coordinated family look for a wedding rehearsal dinner.
 */
import { Cond, EntityBuilder, LawBuilder, TraversalBuilder, WorldBuilder } from "@roc/sdk";
import type { WDLDocument } from "@wge/wdl";

const person = (id: string, name: string) =>
  EntityBuilder.entity(id)
    .type("person")
    .aspect("identity", { display_name: name })
    .aspect(
      "permission",
      { measurements: "private" },
      { mode: "restricted", requiredCapability: "household.measurements.view" }
    )
    .build();

const closet = (id: string, owner: string) =>
  EntityBuilder.entity(id).type("closet").aspect("identity", { display_name: `${owner}'s closet` }).build();

const garment = (id: string, name: string, status: string, formality: string, waterproof = false) =>
  EntityBuilder.entity(id)
    .type("garment")
    .aspect("identity", { display_name: name })
    .aspect("application", { "availability.status": status, formality, waterproof })
    .build();

export function familyStyleWorld(): WDLDocument {
  return (
    WorldBuilder.world("Family Style World")
      .id("world_family")
      .version("1.0.0")
      .defaultTimezone("America/Denver")

      // --- Required entities (REF-1900.018) --------------------------------
      .entity(EntityBuilder.entity("household_primary").type("household").aspect("identity", { display_name: "The Family" }).build())
      .entity(person("person_emma", "Emma"))
      .entity(person("person_james", "James"))
      .entity(person("person_lila", "Lila"))
      .entity(closet("closet_emma", "Emma"))
      .entity(closet("closet_james", "James"))
      .entity(closet("closet_lila", "Lila"))
      .entity(garment("garment_blue_jacket", "Blue Jacket", "available", "smart_casual"))
      .entity(garment("garment_cream_dress", "Cream Dress", "available", "formal"))
      .entity(garment("garment_gray_suit", "Gray Suit", "available", "formal"))
      .entity(garment("garment_rain_boots", "Rain Boots", "available", "casual", true))
      .entity(
        EntityBuilder.entity("weather_forecast")
          .type("weather")
          .aspect("state", { condition: "rain_possible", confidence: 0.7 })
          .build()
      )
      .entity(
        EntityBuilder.entity("event_wedding")
          .type("event")
          .aspect("state", { kind: "wedding_rehearsal_dinner", formality: "formal" })
          .build()
      )
      .entity(
        EntityBuilder.entity("bird_guide")
          .type("bird")
          .aspect("identity", { display_name: "Birdi" })
          .aspect("capability", { guides: true })
          .build()
      )

      // --- Required relationships ------------------------------------------
      .relationship("world_family_root", "contains", "household_primary", { weight: 100 })
      .relationship("household_primary", "includes_person", "person_emma", { weight: 100, confidence: 1 })
      .relationship("household_primary", "includes_person", "person_james", { weight: 100, confidence: 1 })
      .relationship("household_primary", "includes_person", "person_lila", { weight: 100, confidence: 1 })
      .relationship("person_emma", "owns", "closet_emma", { weight: 100 })
      .relationship("person_james", "owns", "closet_james", { weight: 100 })
      .relationship("person_lila", "owns", "closet_lila", { weight: 100 })
      .relationship("closet_emma", "contains", "garment_blue_jacket")
      .relationship("closet_emma", "contains", "garment_cream_dress")
      .relationship("closet_james", "contains", "garment_gray_suit")
      .relationship("closet_lila", "contains", "garment_rain_boots")
      .relationship("weather_forecast", "influences", "garment_rain_boots", { weight: 78, confidence: 0.92 })
      .relationship("event_wedding", "requires", "garment_cream_dress", { weight: 60 })
      .relationship("event_wedding", "requires", "garment_gray_suit", { weight: 60 })
      .relationship("household_primary", "references", "event_wedding")
      .relationship("household_primary", "references", "weather_forecast")
      .relationship("bird_guide", "guides", "person_emma", { weight: 50, confidence: 0.9 })
      .relationship("world_family_root", "contains", "bird_guide")

      // --- Required laws (REF-1900.018) -------------------------------------
      .law(
        LawBuilder.law("law_garment_available")
          .name("Garments must be available before recommendation")
          .scope("world")
          .appliesTo({ kind: "type", value: "garment" })
          .when(Cond.aspectEquals("application", "availability.status", "available"))
          .outcome("reject")
          .severity("error")
          .explain("Unavailable garments cannot be recommended as wearable today.")
          .build()
      )
      .law(
        LawBuilder.law("law_measurements_private")
          .name("Private measurements cannot be projected without permission")
          .scope("world")
          .appliesTo({ kind: "type", value: "person" })
          .when(Cond.hasAuthority("household.measurements.view"))
          .outcome("reject")
          .severity("error")
          .explain("Measurements are private; viewing them requires household permission.")
          .build()
      )
      .law(
        LawBuilder.law("law_candidate_acceptance")
          .name("Candidate outfits do not become Reality until accepted")
          .scope("world")
          .appliesTo({ kind: "type", value: "outfit_plan" })
          .when(
            Cond.any(
              Cond.aspectEquals("state", "status", "accepted"),
              // Drafts may exist inside Candidate Worlds; Reality requires
              // explicit acceptance.
              Cond.insideCandidateWorld()
            )
          )
          .outcome("reject")
          .severity("error")
          .explain("An outfit plan enters Reality only after the family accepts it.")
          .build()
      )

      // --- Traversal + objective --------------------------------------------
      .traversal(
        TraversalBuilder.traversal("traversal_coordinate_group_style")
          .from("household_primary")
          .follow("includes_person")
          .collect({ kind: "type", value: "person" })
          .follow("owns")
          .collect({ kind: "type", value: "closet" })
          .follow("contains")
          .collect({ kind: "type", value: "garment" })
          .applyLaw("law_garment_available")
          .output("entities")
          .build()
      )
      .objective({
        id: "objective_plan_family_look",
        label: "Plan a coordinated family look for the wedding rehearsal dinner",
        entry: "household_primary",
        traversal: "traversal_coordinate_group_style",
        kind: "planning",
        priority: 85
      })
      .build()
  );
}
