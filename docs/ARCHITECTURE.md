# Architecture

Last updated: 2026-08-07

## Goals

The architecture must support a deterministic, explainable station simulation; a readable isometric 2.5D presentation; authored plus generated data; versioned local saves; and a Windows desktop build without depending on a visual game-engine editor.

## Current structure

```text
.
├── .codex/                  # Project agent configuration; all specialists read-only
├── .github/workflows/       # Automated verification
├── docs/                    # GDD and durable production records
├── scripts/                 # Reproducible build orchestration
├── src/
│   ├── components/          # Reusable accessible presentation primitives
│   ├── config/              # Player-facing metadata and composition settings
│   ├── content/             # Validated content schemas and Great Plains data
│   ├── game/
│   │   ├── presentation/    # Domain-event selectors and player-facing copy
│   │   ├── rendering/       # Three.js projection; no domain authority
│   │   ├── runtime/         # Browser cadence and typed UI command adapter
│   │   └── simulation/      # Pure domain state, clock, and transitions
│   ├── test/                # Shared test setup
│   ├── App.tsx              # Current UI/composition root
│   └── main.tsx             # Browser entry
└── src-tauri/               # Thin Windows desktop shell and capabilities
```

The repository begins as one TypeScript package so dependency rules remain visible. Split stable domains into workspaces only when size or independent build/test boundaries justify the overhead.

## Dependency rule

```mermaid
flowchart LR
  Content["Validated content"] --> Simulation["Deterministic simulation"]
  App["Composition root"] --> Simulation
  App --> Rendering["Three.js presentation"]
  App --> UI["React management UI"]
  App --> Platform["Browser / Tauri adapters"]
  Simulation --> Snapshot["Immutable snapshots + events"]
  Snapshot --> Rendering
  Snapshot --> UI
  UI --> Commands["Typed commands"]
  Commands --> Simulation
```

Forbidden dependencies:

- simulation → React, Three.js, DOM, Tauri, filesystem, wall clock, or uncontrolled randomness;
- content schema → rendered scene objects;
- UI → direct mutation of authoritative state;
- save keys/schema IDs → player-facing working title.

## Simulation model

The M1 core uses or will expand:

- a fixed tick and explicit phase state machine;
- stable entity IDs and plain serializable component stores;
- typed player/system commands with validation;
- ordered reason-coded domain events;
- injected seeded RNG with serializable state;
- deterministic grid occupancy, A* movement, range, and line-of-sight;
- immutable external snapshots/selectors;
- state hashing and command replay for regression tests.

GS-010 established the clock kernel: one engine step represents 100,000 real microseconds, and authoritative time uses 40 integer clock units per simulation minute. Slow, normal, and daytime-fast rates advance 3, 12, and 48 clock units per full step respectively; a step crossing a phase boundary apportions its remaining integer time at the new phase's effective rate and carries only an integer sub-unit remainder. Night caps fast mode at the normal rate and canonicalizes pause requests to slow. The browser owns the elapsed-time accumulator, caps work per pump without dropping debt, and discards hidden/paused catch-up time. Simulation state contains no wall-clock timestamp or floating-point time remainder.

GS-011 adds a pure exhaustive command dispatcher around typed envelopes. A command receipt records identity, scheduled tick, accepted/rejected status, stable reason, whether state changed, and any emitted event sequences. Valid no-op commands are accepted without events; malformed, mistimed, unsupported, or post-completion commands are rejected without mutation. Only `time-mode.set` exists today, so future gameplay work extends the union instead of bypassing the dispatcher.

The authoritative `eventLedger` is complete for the active scenario and has an independent monotonic `nextEventSequence`. Events contain typed facts and reason codes for scenario start, time-mode change, phase entry, resource change, night completion, and slice completion. Resource events retain before, requested delta, applied delta, and after values in stable resource-key order. Events caused at a clock boundary use the exact crossed clock unit; sequence resolves events sharing a tick and boundary. Presentation maps events to copy/tone and selects the latest eight without truncating state. Mechanical tick/clock-unit increments are ordering substrate rather than domain events.

GS-012 adds project-owned xoshiro128** randomness. Authoritative state retains the original scenario seed plus the current RNG algorithm/version, four uint32 words, and raw draw count. Initialization uses the complete non-negative safe-integer seed, while every draw is pure and returns replacement state. Bounded integer, index, choice, and ratio helpers have fixed draw-consumption rules; modulo bias is avoided through rejection sampling. Simulation lint rejects `Math.random()`. RNG movement is mechanical substrate rather than a domain event; future random outcomes must emit their meaningful resolved facts.

Scenario replay version 1 pins replay kind/version, Great Plains scenario ID/version, RNG algorithm/version/seed, target night count, command stream, and stop tick. It validates the complete envelope before initialization, executes commands by tick and sequence, and reports consumed/unconsumed command IDs, receipts, final RNG, an explicit stop reason, full state, and independent state/ledger diagnostic hashes. Repeated runs compare full state and ledger rather than trusting hashes alone. The GS-010 clock replay remains an explicit compatibility adapter.

Checkpoint version 3 includes scenario identity, complete RNG continuation state, the full ledger, and sequence cursor; it canonicalizes object keys, preserves semantic array order, and excludes presentation copy. Checkpoints and replays are deterministic diagnostics, not yet the validated save-file format introduced by GS-015.

## Content model

Zod validates content at startup and will validate saves on load. Technical IDs use stable kebab-case keys, while names and descriptions are player-facing data. Region, building, item, employee, traveler, threat, dialogue, and event schemas should reference other content by ID and fail with actionable validation paths.

Major story content remains authored. Generated employees/travelers will combine validated templates and traits, and every generated result must stay explainable and valid.

## Rendering and UI

Three.js owns scene projection, camera, lighting, meshes, particles, picking, overlays, and animation adapters. The initial renderer uses an orthographic camera and procedural placeholder geometry. Because the current scene is static, one retained renderer redraws only on initialization, resize, or a derived visual-state change; it does not run a perpetual animation frame. Geometry and materials are scene-owned and disposed with the observer, renderer, and canvas on unmount. Future motion will consume immutable simulation snapshots and add an animation loop only when measured presentation needs justify it.

React owns panels, alerts, dialogue, settings, focus, and transient selection affordances. UI sends commands instead of changing simulation objects. Critical state uses text/shape plus color and remains readable without decorative CRT interference.

GS-017 separates browser cadence and typed UI-command dispatch into `game/runtime`, leaving `App` as the composition root. A shared portal-based modal primitive supplies dialog and drawer variants with background inertness, focus containment/return, Escape and backdrop dismissal, body-scroll ownership, and narrow-screen sheet behavior. The station guide and newest-first event-history drawer are non-authoritative projections over simulation state. Responsive layout reorders the world before secondary panels below 900 px, wraps essential resources below 660 px, and keeps semantic meters plus grouped pressed-state time controls.

GS-018 derives `StationVisualState` from authoritative phase and power once; both HUD and Three.js consume that same value. A pure style selector pins day, dusk, and night atmosphere plus stable, critical, and dark Beacon output, including zero light/emission when dark. A development-only query fixture renders all nine combinations for browser review but is removed from production builds. These are presentation foundations, not completion of the representative-art gate in GS-054.

Renderer selection is provisional. Measure target-scale lighting, instancing, selection, occlusion, and night readability before DEC-003 becomes a permanent commercial-engine commitment.

## Persistence

Persistence is not implemented yet. The first schema must include:

- explicit save format and content version;
- separate campaign and current-station state;
- authoritative simulation state and tick;
- RNG state;
- ordered event-sequence position;
- settings and difficulty;
- stable content IDs;
- checksum/recovery metadata.

Autosaves occur at morning, dusk, and major choices. Rotating slots must recover from a corrupt newest save. Save/load boundaries must not change deterministic outcomes.

## Platform and security

The Vite build is the primary development surface. Tauri packages the same assets for Windows and starts with `core:default` capabilities only. Production is offline-first: no runtime web fonts, telemetry, account, cloud save, or external content requirement. Add capabilities narrowly and only when a backlog item demonstrates need.

## Verification layers

1. Prettier and ESLint for consistent, reviewable source.
2. Strict TypeScript for boundary and exhaustiveness errors.
3. Vitest unit/integration checks for deterministic domain behavior and content schemas.
4. Coverage guardrails for simulation/content; save migrations require explicit coverage.
5. Vite production build for deployable browser assets.
6. Cargo/Tauri release build for Windows shell integration.
7. Fixed-seed scenarios, UI automation, visual baselines, and packaged smoke tests as their systems arrive.
