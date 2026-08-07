# Autonomous Development Guide

## Mission and source authority

Develop the Great Plains vertical slice described in `docs/Last_Stop_Game_Design_Document.docx`. The document is the design source of truth. Its first production gate is a replayable scenario with three complete days and three escalating nights that proves daytime operations create understandable nighttime consequences.

Authority order:

1. The current user request.
2. This `AGENTS.md`.
3. The GDD.
4. Accepted entries in `docs/DECISIONS.md`.
5. The prioritized backlog.
6. Existing implementation details.

If two higher-authority sources conflict, stop the affected work, record the conflict, and ask for direction. Do not silently reinterpret canon.

## Naming rules

- **Gas Station Game** is the internal repository/project name.
- **Last Stop** is only the current working player-facing title.
- Read the player-facing title through `src/config/game.ts` and `VITE_GAME_TITLE`.
- Keep package names, modules, app identifiers, save keys, schema identifiers, analytics/event names, paths, and Rust identifiers generic. Never create a technical identifier such as `LastStopSave`, `last-stop-player`, or `com.laststop.*`.
- Prefer domain names such as `station`, `beacon`, `employee`, `traveler`, `threat`, `region`, and `simulation`.

## One-writer operating model

The primary agent is the only normal code/document writer and the only agent allowed to stage or commit. Use project subagents for bounded read-only work:

- `game_systems_designer`: mechanics, balance, causality, scope, and acceptance criteria.
- `codebase_explorer`: paths, dependencies, execution flow, and impact mapping.
- `qa_test_reviewer`: correctness, determinism, saves, regressions, and test gaps.
- `visual_ui_reviewer`: isometric readability, UI, controls, and accessibility.

Subagents must not edit files, install packages, update snapshots, stage, or commit. The primary agent gives each subagent a narrow question, collects concise evidence, then performs all changes sequentially. Do not delegate two overlapping implementation tasks.

## Required workflow

Before changing code:

1. Read the relevant GDD section and current `docs/BACKLOG.md` item.
2. Inspect `docs/PROGRESS.md`, `docs/DECISIONS.md`, and `docs/KNOWN_ISSUES.md` for related constraints.
3. Trace the existing execution path. Use `codebase_explorer` for broad or unfamiliar areas.
4. Define observable acceptance criteria and the verification commands.
5. Keep the change inside the current vertical-slice milestone. Do not build excluded campaign features opportunistically.

While changing code:

1. Keep authoritative simulation state out of React, Three.js, Tauri, and wall-clock APIs.
2. Add or update automated tests with the behavior.
3. Emit explainable domain events for resource, relationship, damage, power, and combat changes.
4. Validate content and save data at boundaries.
5. Update docs in the same checkpoint when scope, architecture, progress, decisions, playtest procedure, or known issues change.

Before completing work:

1. Run `pnpm verify`.
2. Run `pnpm test:coverage` for simulation, persistence, content-schema, or save work.
3. Run `pnpm build:desktop` when desktop configuration or platform integration changes.
4. Ask `qa_test_reviewer` to review risky logic and `visual_ui_reviewer` to inspect visible changes.
5. Re-run affected checks after review fixes.
6. Update `docs/PROGRESS.md` and move backlog items only when acceptance criteria truly pass.
7. Review `git diff --check`, `git status --short`, and the staged diff before committing.

Never claim a feature exists because a panel, placeholder, or type exists. Progress language must distinguish scaffolded, implemented, verified, and playtested work.

## Architecture invariants

- Simulation is pure, deterministic-enough TypeScript with serializable state and explicit commands/events.
- Rendering and UI consume snapshots and emit commands; they never directly own or mutate domain truth.
- Rendering is currently direct Three.js with an orthographic camera. Treat renderer selection as provisional until the Great Plains performance/readability prototype passes.
- React owns presentation and transient UI state only.
- Tauri is a platform adapter. Simulation/content modules must not import Tauri APIs.
- All uncontrolled randomness is prohibited in simulation code. Use a seeded RNG whose state can be saved and replayed.
- Use fixed simulation ticks. Rendering interpolation and animation time must not affect outcomes.
- Saves must be versioned from their first implementation, validate on load, and separate campaign state from station-region state.
- Content identifiers are stable kebab-case keys. Player-facing copy is data.
- Morning reports are projections of the event ledger, not independently mutated summaries.
- Major traveling companions cannot die from routine simulation outcomes.

Target dependency direction:

```text
content -> simulation <- app/composition -> rendering
                               |          -> UI
                               +----------> platform
```

## Coding standards

- TypeScript stays in strict mode. Do not weaken compiler or lint rules to land a feature.
- Prefer small pure functions and explicit domain types over general utility abstractions.
- Use immutable updates at simulation boundaries until profiling proves a measured need for specialized storage.
- Avoid `any`, non-null assertions, implicit global state, raw timers inside simulation modules, and direct `Math.random()` calls.
- Exhaustively handle domain unions. New phases, commands, events, or save versions require test coverage.
- Use Zod at untrusted data boundaries; infer TypeScript types from schemas when practical.
- UI text must explain actionable causes. Do not communicate critical state by color alone.
- Keep files focused. Split a module when it mixes simulation, content, presentation, and platform responsibilities.
- Do not add a physics engine, networking, telemetry, cloud service, or database without a recorded decision and demonstrated slice need.

## Testing standards

Every domain behavior needs the narrowest durable test:

- Unit tests for phase rules, resource flows, power, targeting, relationships, and invariants.
- Fixed-seed scenario tests for cross-system outcomes.
- Save round-trip and migration fixtures for persistence.
- UI tests for keyboard behavior, focus, alerts, and command dispatch.
- Visual snapshots only after time, camera, seed, fonts, and animation are stabilized.
- Packaged smoke tests for desktop checkpoints.

Determinism contract: the same content version, initial state, seed, and command stream must produce the same authoritative state and ordered event ledger, including after a save/load boundary.

Coverage thresholds are guardrails, not goals. Never exclude difficult domain code merely to raise the number. All save migrations and phase-transition branches must be covered even if global thresholds already pass.

## Visual and accessibility standards

- Preserve the GDD contrast between warm station light and blue-black darkness outside the Beacon.
- At normal camera scale, players must identify phase/time, Beacon/power, core resources, selected worker/task, top alert, routes, ranges, damage, and failure causes.
- CRT/radio/ledger styling must support hierarchy; never place scanlines or static over body text.
- Critical states require text or shape/icon reinforcement in addition to color.
- Maintain visible focus, logical keyboard order, remapping-ready actions, scalable text/UI, reduced-motion support, captions/visual warning equivalents, and adjustable high-intensity effects.
- Mouse and keyboard are the first target; do not add controller scope early, but avoid architecture that makes it impossible.

## Scope guardrails

The active scope is the Great Plains slice. Do not implement the following before the playtest gate unless the user explicitly reprioritizes them:

- all six regions or the full 126-night campaign;
- full romance arcs or large generated populations;
- advanced expeditions, factions, late-game artifacts, or endings;
- multiplayer, online services, telemetry, mod tools, controller support, consoles, or publishing;
- final-commercial asset production across the whole game.

Use placeholders deliberately and label them honestly. Prefer proving a system's player consequence over expanding content count.

## Repository and Git safety

- Preserve user changes and inspect the worktree before edits.
- Never fetch, pull, push, open a PR, deploy, publish, or contact external services without separate authorization.
- Never modify Git remotes unless explicitly asked. The expected remote is `origin` for `Michael-Blake-Donaldson/GasStationGame`.
- Do not use destructive Git commands (`reset --hard`, forced checkout, clean) or delete broad paths.
- Keep commits focused and local. Use imperative messages such as `chore: establish autonomous development foundation`.
- Do not commit secrets, `.env` files, generated builds, coverage, `node_modules`, Rust targets, or machine-specific configuration.
- This repository lives in OneDrive. Expect file-lock/sync contention around generated directories; retry safe build steps rather than relocating or deleting user data.

## Documentation ownership

- `docs/BACKLOG.md`: ordered work and acceptance criteria.
- `docs/PROGRESS.md`: verified current state and latest checkpoint.
- `docs/DECISIONS.md`: durable architectural/product choices and consequences.
- `docs/ARCHITECTURE.md`: current system boundaries and intended evolution.
- `docs/KNOWN_ISSUES.md`: reproducible defects, limitations, risks, and workarounds.
- `docs/PLAYTEST.md`: test protocol, observation format, and go/no-go gates.

Update dates in ISO format (`YYYY-MM-DD`). Link related backlog and decision IDs. Preserve history: mark decisions superseded and backlog items complete instead of erasing important context.

## Definition of done

A backlog item is done only when its implementation, tests, documentation, and relevant build checks pass; user-visible changes have been reviewed for clarity/accessibility; no new unexplained warnings exist; and `docs/PROGRESS.md` records the evidence. A milestone is done only when every exit criterion passes in a clean production build. The vertical slice is not successful until real playtests satisfy the GDD success metrics.
