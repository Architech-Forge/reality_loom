# Reality Loom Interface Contract

1. Reality Loom does not use cards as its primary visual metaphor.
2. Every visible element is a field, node, trace, surface, layer, projection, or boundary.
3. The UI must visually express runtime behavior.
4. Generic SaaS layouts are invalid.
5. Light textured card grids are invalid.
6. MUI visual components may not define primary brand surfaces.
7. No visual object may overlap another unless explicitly intentional.
8. Motion must express projection, trace, ripple, commit, recede, or recomposition.
9. The system must distinguish candidate state from committed reality.
10. Reality Loom should feel like an operating substrate, not a website template.

---

## Enforcement

This contract is executable. `@realityloom/interface` enforces it:

- The primitive registry exports only world-native primitives; the forbidden
  primitive names (`Card`, `FeatureCard`, `Panel`, `DashboardShell`,
  `HeroSection`, `StatsGrid`, `InfoBlock`, `GenericModal`, `GenericSection`)
  are rejected by `validateScene`.
- Every visual object carries a `kind` restricted to
  `field | surface | node | trace | label | boundary | candidate | commit | projection`.
- The no-overlap layout engine (`resolveCollisions`) enforces rule 7: overlap
  requires `allowOverlap: true` plus a declared, traceable `overlapReason`.
- Motion descriptors are restricted to the runtime vocabulary
  (`project, recede, ripple, trace, commit, simulate, fork, merge, collapse, recompose`).
- Candidate-state objects can never carry the `committed` state
  (`validateScene` rule 9), and the SLI bridge wraps candidate worlds in
  `CandidateLayer` — possibility never renders as Reality.
- The `interface` compliance suite (`pnpm compliance`) verifies every rule.

Renderers (web, native, 3D, voice) express scenes produced by this system.
They do not reinterpret them.
