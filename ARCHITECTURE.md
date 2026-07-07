# Reality Loom Architecture

## High-Level Stack

```mermaid
flowchart TD
  RL[Reality Loom] --> ROC[Reality-Oriented Computing]
  ROC --> WGE[World Graph Engine]
  WGE --> WR[World Runtime]
  WR --> SLI[Spatial Living Interface]
  SLI --> APPS[Applications]
```

## Compiler / Runtime Pipeline

```mermaid
flowchart TD
  WDL[WDL Source] --> WIL[WIL Semantic Operations]
  WIL --> COMP[World Compiler]
  COMP --> WIR[World Intermediate Representation]
  WIR --> OWIR[Optimized WIR]
  OWIR --> EXE[Executable World]
  EXE --> RUNTIME[WGE Runtime]
  RUNTIME --> PROJ[SLI Projection]
  PROJ --> RENDERER[Renderer / App]
```

## Truth Boundary

```mermaid
flowchart LR
  USER[Human / Actor] --> WILMSG[WIL Message]
  WILMSG --> RUNTIME[Runtime Validation]
  RUNTIME --> CANDIDATE[Candidate World]
  CANDIDATE --> DECISION{Commit?}
  DECISION -- no --> DISCARD[Reject / Expire]
  DECISION -- yes --> DIFF[Diff]
  DIFF --> SNAPSHOT[New Snapshot]
  SNAPSHOT --> TRACE[Trace]
  SNAPSHOT --> PROJECTION[Projection]
```

## Core Concepts

```text
World
Entity
Aspect
Relationship
Law
Event
Traversal
Snapshot
Diff
Trace
Candidate World
Executable World
Projection
```

## Invariants

```text
Applications describe worlds.
The runtime owns truth.
Candidate Worlds are possible, not real.
Commits require authority.
Snapshots are immutable.
Diffs are ordered.
Traces explain causality.
Projection is not authority.
AI is an actor, not a sovereign.
```

## Package Boundary Direction

```mermaid
flowchart TD
  TYPES[types] --> SCHEMA[schema]
  SCHEMA --> KERNEL[kernel]
  KERNEL --> GRAPH[graph]
  GRAPH --> RUNTIME[runtime]
  RUNTIME --> COMPILER[compiler]
  RUNTIME --> SLI[sli projection]
  SLI --> APP[application examples]
```

## Public vs Private

```mermaid
flowchart LR
  subgraph Public[Open Source Reality Loom]
    COD[Codex]
    TYPES[Types]
    WGE[WGE]
    WIL[WIL]
    WDL[WDL]
    SLI[SLI Contracts]
    TESTS[Compliance Fixtures]
  end

  subgraph Private[Private Products]
    SOBIRDI[SoBirdi / LilBirdi]
    SENTII[Sentii]
    DECK[DeckLogic]
    AUT[Autelier]
    TRADER[Trader Sherpa]
    CLOUD[Commercial Cloud Runtime]
    PROMPTS[Proprietary AI Orchestration]
  end

  Public -. foundation for .-> Private
```
