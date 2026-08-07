# Development Progress

Last updated: 2026-08-06

## Current milestone

**M1 — Simulation skeleton:** GS-010 fixed-step time and GS-011 typed commands/events are verified; seeded RNG, grid, jobs, and saves remain.

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

## Verified evidence

| Check                            | Result | Evidence                                                                                                                                  |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GDD preserved                    | Pass   | Git recognizes the byte-identical file move under `docs/`                                                                                 |
| Formatting                       | Pass   | `pnpm format:check`                                                                                                                       |
| Lint                             | Pass   | `pnpm lint --max-warnings=0`                                                                                                              |
| Type checking                    | Pass   | `pnpm typecheck`                                                                                                                          |
| Unit tests                       | Pass   | 96/96 tests across 9 files with `pnpm test`, including commands, replay, event ordering, accessibility, and React Strict Mode integration |
| Coverage                         | Pass   | 100% functions, 96.25% lines, 95.67% statements, and 93.20% branches for targeted simulation/content modules                              |
| Browser production build         | Pass   | `pnpm build`; one JS asset, 809.80 kB minified / 216.93 kB gzip                                                                           |
| Desktop manifest/Rust formatting | Pass   | `cargo metadata --no-deps` and `cargo fmt --check`                                                                                        |
| Desktop Rust shell               | Pass   | Rust/Cargo 1.97.1 MSVC; rustfmt, Clippy with denied warnings, Cargo tests, and `cargo check --locked`                                     |
| Declared Rust minimum            | Pass   | Rust/Cargo 1.88.0 MSVC completes `cargo check --locked`; CI verifies this MSRV separately                                                 |
| Desktop release executable       | Pass   | `pnpm build:desktop`; optimized Windows executable built and remained healthy in an 8-second WebView2 smoke test                          |
| Local NSIS packaging             | Pass   | `pnpm build:installer`; local x64 installer produced without publishing or installing it                                                  |
| Configurable desktop title       | Pass   | A `Prairie Signal` test build embedded that product name and exposed the same live window title                                           |
| Visual smoke review              | Pass   | Local browser at 1440×900, 1024×720, and 1280×720 night; no overflow or console warnings                                                  |

## Honest capability boundary

The current screen is a presentation and architecture scaffold driven by a real fixed-step phase clock and authoritative event ledger. Time-mode changes are the only command payload implemented so far, and replay remains a deterministic clock harness rather than a complete scenario replay. The crew cards, job button, grid allocation, threat tags, and station geometry are representative placeholders. The repository does **not** yet implement customers, jobs, construction, pathfinding, saves, automatic combat, actual power allocation, traveler dialogue, the signature creature, wind/fire, audio, or the complete three-night scenario.

## Next work

1. Add serializable seeded RNG and scenario replay equality (GS-012).
2. Add station grid/occupancy and deterministic movement (GS-013–014).
3. Design versioned save/load before simulation state grows (GS-015).
