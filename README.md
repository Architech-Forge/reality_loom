# Reality Loom

**Reality Loom** is an open foundation for building software as living worlds instead of screens around data.

It is the early public foundation for **Reality-Oriented Computing**: a way of describing reality, computing understanding, and projecting experience through world-aware systems.

```text
Describe reality.
Compute understanding.
Project experience.
```

Reality Loom is currently published by **Architech Forge**. The long-term intent is for Reality Loom to become its own dedicated platform/company and steward the category, standards, and ecosystem.

---

## What Reality Loom Is

Reality Loom is a public foundation for a new class of software:

- software that models reality as worlds, entities, relationships, laws, events, objectives, and traces
- software that separates possible states from committed reality
- software that projects experience from structured world truth
- software that treats AI as a bounded actor, not an unquestioned authority
- software that makes privacy, traceability, and determinism part of the architecture

Reality Loom is not another app framework, chat interface, dashboard system, or AI wrapper.

It is a foundation for **world-oriented, reality-aware software**.

---

## Core Stack

```text
Reality Loom
  ↓
Reality-Oriented Computing
  ↓
World Graph Engine
  ↓
World Runtime
  ↓
Spatial Living Interface
  ↓
Applications
```

### Reality-Oriented Computing

The philosophy and category.

Reality-Oriented Computing replaces the default software model of pages, screens, dashboards, and generic components with worlds, entities, laws, objectives, candidate states, and projections.

### World Graph Engine

The computational substrate.

The World Graph Engine represents worlds as structured, temporal, traceable graphs of entities, aspects, relationships, laws, events, snapshots, diffs, traversals, and traces.

### World Interaction Language

The public interaction protocol.

WIL defines how actors, humans, agents, runtimes, and applications request observation, simulation, commitment, explanation, traversal, and projection.

### World Definition Language

The human-authorable language for declaring worlds.

WDL compiles into canonical runtime structures. The runtime does not execute raw WDL.

### World Intermediate Representation

The compiler-internal representation.

WIR is intentionally unstable and should not be treated as a public application interface.

### Spatial Living Interface

The projection layer.

SLI turns world truth and runtime state into living experiences without making the renderer the source of truth.

---

## Architecture

```text
WDL Source
  ↓
WIL Semantic Operations
  ↓
World Compiler
  ↓
WIR
  ↓
Optimized WIR
  ↓
Executable World
  ↓
WGE Runtime
  ↓
SLI Projection
  ↓
Renderer / Application
```

### Dependency Direction

```text
types
  ↓
schema
  ↓
kernel
  ↓
graph
  ↓
runtime
  ↓
compiler
  ↓
projection
  ↓
applications
```

Runtime truth flows downward into projection. Projection and rendering must not mutate truth directly.

---

## Running the Reference Implementation

This repository contains a working reference implementation of the full stack — 23 packages built in Codex order, from the WIL protocol through the SLI projection engines, with compliance suites and an end-to-end demo.

```bash
pnpm install
pnpm build        # 23 packages in Codex dependency order
pnpm test         # unit + e2e suites
pnpm compliance   # the executable compliance gate + machine-readable report
pnpm demo         # the First End-To-End Demo: simulate → law-check → commit → project
```

The demo runs the complete loop on the reference Family Style World: a candidate plan is drafted in simulation, a World Law rejects the premature merge, explicit acceptance turns the interaction into a Commit through the interaction bridge, Reality advances with a traceable diff, and the experience recomposes — then the system answers what changed, why, who caused it, what was simulated, what became Reality, and why it is visible now.

Deferred capabilities (federation, replay, incremental compilation, compiler plugins, version negotiation) are declared as visible skips in the compliance report — never hidden.

---

## What Is Public In This Repository

This repository is intended to contain the public Reality Loom foundation:

- Codex volumes
- WGE schemas and canonical types
- WIL envelope and protocol definitions
- WDL grammar/specification examples
- SLI projection contracts
- reference implementation notes
- compliance fixtures
- deterministic testing utilities
- public architecture diagrams

---

## What Is Not Public

This repository should not include private product code or commercial moat.

Do not include:

- proprietary application code
- private products such as SoBirdi/LilBirdi, Sentii, DeckLogic, Autelier, Trader Sherpa, or other private projects
- private AI prompts or orchestration logic considered proprietary
- private API keys, tokens, credentials, secrets, or environment files
- user data, production exports, logs, private traces, or personal information
- private cloud runtime code
- proprietary avatar, commerce, admin, or recommendation systems
- unreleased business plans, investor materials, or customer data

Reality Loom is the open foundation. Private products remain private.

---

## Current Status

Reality Loom is early and evolving.

The Codex currently covers a substantial foundation, including volumes in the 800–2500 range. That is enough to publish as an early public foundation **if the repository has been cleaned of private code, secrets, proprietary prompts, and product-specific moat**.

Recommended initial public status:

```text
Status: Early Public Foundation
Stability: Draft / Pre-1.0
Audience: developers, designers, researchers, system builders
Use: study, experimentation, contribution, reference implementation
```

---

## Repository Principles

Reality Loom should remain:

- deterministic where runtime truth is concerned
- traceable where decisions are made
- explicit about authority and permission
- clear about candidate state vs committed reality
- renderer-agnostic
- provider-agnostic
- AI-bounded
- privacy-aware
- open enough to invite collaboration
- controlled enough to preserve the brand and standard

---

## Governance

Reality Loom is currently owned and published by **Architech Forge**.

Planned future stewardship:

```text
Architech Forge
  early creator / publisher / incubator

Reality Loom
  future dedicated company / platform steward / category owner
```

Brand names, logos, marks, and certification language are reserved. See [`TRADEMARKS.md`](./TRADEMARKS.md).

---

## License

Code is licensed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE).

Documentation, diagrams, and written specifications are intended to be shared under **Creative Commons Attribution 4.0 International** unless otherwise noted. See [`DOCS-LICENSE.md`](./DOCS-LICENSE.md).

Trademarks are not granted by either license.

---

## Security

Please do not open public issues containing secrets, credentials, private user data, or exploitable security details.

See [`SECURITY.md`](./SECURITY.md).

---

## Before You Push Publicly

Run the release checklist:

- [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md)
- [`REPOSITORY_BOUNDARIES.md`](./REPOSITORY_BOUNDARIES.md)

The most important rule:

```text
Open-source the foundation.
Do not accidentally open-source the moat.
```
