# Development Progress

Last updated: 2026-08-07

## Current milestone

**M1 — Simulation skeleton:** GS-010 fixed-step time, GS-011 typed commands/events, GS-012 seeded RNG/scenario replay, GS-013 station grid/occupancy, GS-014 deterministic employee movement/jobs, GS-015 versioned save/load, and GS-017 responsive presentation/modal foundations are verified. Corrupted-save recovery rotation is next.

The repository has moved from a GDD-only state to a code-first project foundation with its first replay-grade simulation subsystem. The vertical slice is not yet playable.

## Initial checkpoint contents

- Preserved the tracked GDD under `docs/`.
- Confirmed `main` initially matched `origin/main` at `565bb7f`; the existing remote is `https://github.com/Michael-Blake-Donaldson/GasStationGame.git`.
- Added strict TypeScript, Vite, React, direct Three.js, Zod, Vitest, ESLint, Prettier, Tauri 2, Rust formatting, and CI configuration.
- Added a validated Great Plains content record.
- Added the initial phase/resource scaffold, then replaced its UI-cadence clock with the GS-010 integer fixed-step kernel.
- Added a representative orthographic 3D station and management HUD showing configurable title, resources, crew, phase/time, Beacon, threat forecast, and event seed.
- Added the repository-level autonomous-development guide and four project-scoped read-only agents.
- Added the prioritized backlog, decisions, architecture, known-issues, and playtest documents.
- Updated the local stable MSVC Rust toolchain to 1.97.1, verified the declared 1.88 MSRV separately, and verified rustfmt, Clippy, Cargo test/check, release linking, WebView2 startup, and NSIS packaging.
- Added a generic repository-owned application icon and made the desktop build wrapper propagate the configurable player-facing title to both product and window titles.
- Completed GS-010 with a 100 ms active engine step, integer phase clock, exact boundary-rate apportionment, debt-preserving browser runner, typed time commands, ordered clock replay, target-aware completion, and deterministic checkpoint hashing.
- Added Strict Mode timer integration coverage plus cadence-partition, pause/resume, phase boundary, exact third-sunrise, long-run invariant, malformed replay, overflow, and hash-divergence tests.
- Completed GS-011 with a pure typed command dispatcher, correlated acceptance/rejection receipts, runtime validation, a complete append-only typed event ledger, independent safe-integer event sequencing, and player-facing event presentation outside authoritative state.
- Added causal resource deltas, exact boundary timestamps, stable same-tick event ordering, full-ledger replay/hash coverage, a bounded non-mutating UI projection, accessible live feedback, and command rejection/order/overflow tests.
- Completed GS-012 with project-owned xoshiro128** randomness, full safe-integer seed expansion, versioned JSON-native RNG continuation state, unbiased bounded integer/index/choice/ratio draws, and a simulation-scoped lint ban on `Math.random()`.
- Added scenario replay metadata for scenario/RNG/replay versions, checkpoint schema v3, scenario identity in state and the start event, independent state/ledger hashes, explicit replay stop reasons and command consumption, a GS-010 compatibility adapter, detached checkpoint ledger snapshots, golden/reference vectors, and repeat/divergence/serialization/validation tests.
- Audited the current visual/UI scaffold and promoted GS-017/018 directly after GS-012: owned fonts, responsive panel/modal primitives, accessible focus/keyboard behavior, phase/Beacon-consistent graphics, reduced-motion support, and deterministic screenshot fixtures—without claiming final art or unimplemented gameplay.
- Completed GS-017 with a responsive desktop/mobile composition, readable minimum text sizing, semantic meters and grouped pressed time controls, extracted simulation runtime adapter, reusable accessible dialog/drawer primitive, station guide, and newest-first authoritative event-history drawer.
- Verified background inertness, focus containment/return, Escape, reverse/forward Tab wrapping, backdrop dismissal, body scroll restoration, narrow layout ordering, and breakpoint behavior. Browser audits at 1180, 900, 660, and 320 px found no page-level horizontal overflow or visible text below 10 px.
- Advanced GS-018 with one pure visual-state contract shared by the HUD and Three.js scene, pinned day/dusk/night plus Beacon stable/critical/dark style fixtures, a development-only nine-state browser fixture, and a lightweight Great Plains geometry/readability pass with road marking, prairie bands, pump canopy, windows, and status-aware Beacon light.
- Reworked the static Three.js scene to retain one renderer across phase/status changes and render only on initialization, resize, or visual-state updates. A mounted lifecycle test verifies renderer/canvas reuse plus observer, geometry, material, renderer, and DOM cleanup.
- Completed GS-013 with a validated 32×24 Great Plains grid, row-major integer coordinates, quarter-turn rectangular footprints, reserved store/garage plots, fixed pumps and Beacon occupancy, flexible-build checks, and deterministic structured rejection causes.
- Added canonical JSON-native station occupancy to Great Plains scenario definition v2 state, the self-describing start event, replay envelope v2, checkpoint v4, and state hashing. Great Plains content is injected through a bound scenario-composition module so the simulation core remains independent of region files and rejects replay/grid mismatches.
- Added semantic definition/state validation for safe numeric indexing, unique technical IDs, bounds, plot compatibility/reservations, overlaps, canonical source ordering, detached snapshots, and malformed persisted occupancy.
- Completed GS-014 with scenario-defined employee positions, jobs, subject-adjacent interaction cells, deterministic four-way shortest-path routing, exact per-clock-unit travel/work progress, cancellation, and simultaneous-event ordering by employee ID.
- Added `job.assign` and `job.cancel` commands with stable rejection causes plus correlated `job.assigned`, `employee.arrived`, `job.started`, `job.cancelled`, and `job.completed` events. Scenario replay v3 and checkpoint v5 preserve and validate the complete workforce state, including route continuity, destinations, progress, and unique assignment identity.
- Completed GS-015 with generic canonical JSON save schema v1, an FNV-1a corruption checksum, monotonic recovery sequence, explicit content/RNG compatibility, and separate campaign, station, session-command cursor, settings, and difficulty sections. The pure codec has no DOM, filesystem, Tauri, wall-clock, title, or presentation dependency.
- Added strict structural hydration and full semantic reconciliation for clock/phase/night facts, scheduled resource flow, event sequencing, time-mode history, canonical job lifecycles/routes, final workforce, occupancy, RNG, and campaign identity. A frozen v1 fixture and exact day/dusk/night/morning, mid-route, mid-work, terminal, continuation, detachment, whitespace, and adversarial corruption tests establish the migration boundary.

## Verified evidence

| Check                            | Result | Evidence                                                                                                                                                                                                                                                       |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GDD preserved                    | Pass   | Git recognizes the byte-identical file move under `docs/`                                                                                                                                                                                                      |
| Formatting                       | Pass   | `pnpm format:check`                                                                                                                                                                                                                                            |
| Lint                             | Pass   | `pnpm lint --max-warnings=0`                                                                                                                                                                                                                                   |
| Type checking                    | Pass   | `pnpm typecheck`                                                                                                                                                                                                                                               |
| Unit tests                       | Pass   | 252/252 tests across 21 files with `pnpm test`, including frozen save fixtures, phase-boundary and mid-action continuation, adversarial load validation, deterministic jobs/pathfinding/replay, accessibility, renderer lifecycle, and Strict Mode integration |
| Coverage                         | Pass   | 98.70% functions, 90.51% lines, 90.32% statements, and 83.48% branches with `pnpm test:coverage`; persistence is included and has 98.14% lines / 90.38% branches                                                                                               |
| Browser production build         | Pass   | `pnpm build`; one JS asset, 849.34 kB minified / 228.28 kB gzip                                                                                                                                                                                                |
| Desktop manifest/Rust formatting | Pass   | `cargo metadata --no-deps` and `cargo fmt --check`                                                                                                                                                                                                             |
| Desktop Rust shell               | Pass   | Rust/Cargo 1.97.1 MSVC; rustfmt, Clippy with denied warnings, Cargo tests, and `cargo check --locked`                                                                                                                                                          |
| Declared Rust minimum            | Pass   | Rust/Cargo 1.88.0 MSVC completes `cargo check --locked`; CI verifies this MSRV separately                                                                                                                                                                      |
| Desktop release executable       | Pass   | `pnpm build:desktop`; optimized Windows executable built and remained healthy in an 8-second WebView2 smoke test                                                                                                                                               |
| Local NSIS packaging             | Pass   | `pnpm build:installer`; local x64 installer produced without publishing or installing it                                                                                                                                                                       |
| Configurable desktop title       | Pass   | A `Prairie Signal` test build embedded that product name and exposed the same live window title                                                                                                                                                                |
| Visual smoke review              | Pass   | Responsive matrix plus all nine day/dusk/night × stable/critical/dark station fixtures; one canvas each, no fresh console warnings or horizontal overflow                                                                                                      |

## Honest capability boundary

The current screen is a presentation and architecture scaffold driven by a real fixed-step phase clock, authoritative event ledger, versioned seeded RNG, scenario replay harness, deterministic station occupancy, headless employee jobs, and a validated headless save codec. Time and job commands exist in the simulation, but the current crew cards and job button are still representative placeholders and do not expose the job workflow; employee movement is not rendered. Save files can round-trip through the pure codec, but no storage slots, autosave trigger, load UI, or recovery rotation exist yet. No gameplay system consumes randomness yet. The repository does **not** yet implement customers, construction, automatic combat, actual power allocation, traveler dialogue, the signature creature, wind/fire, audio, or the complete three-night scenario.

## Next work

1. Add repository-owned, license-documented typography when external asset acquisition is separately authorized (GS-005), completing the remaining GS-018 baseline requirement.
2. Add corrupted-save recovery rotation around the validated codec (GS-016).
3. Begin the playable business loop with pumps, checkout, stock, and customers (GS-020).
