# Development Progress

Last updated: 2026-08-06

## Current milestone

**M0 — Development foundation:** browser, native Windows toolchain, desktop runtime, and local packaging foundation verified.

The repository has moved from a GDD-only state to a code-first project foundation. No gameplay milestone is complete yet.

## Initial checkpoint contents

- Preserved the tracked GDD under `docs/`.
- Confirmed `main` initially matched `origin/main` at `565bb7f`; the existing remote is `https://github.com/Michael-Blake-Donaldson/GasStationGame.git`.
- Added strict TypeScript, Vite, React, direct Three.js, Zod, Vitest, ESLint, Prettier, Tauri 2, Rust formatting, and CI configuration.
- Added a validated Great Plains content record.
- Added a deterministic-enough scaffold for phase transitions, pause/slow rules, resource flow, event history, and three-night completion. This is a prototype clock, not the final fixed-tick replay architecture.
- Added a representative orthographic 3D station and management HUD showing configurable title, resources, crew, phase/time, Beacon, threat forecast, and event seed.
- Added the repository-level autonomous-development guide and four project-scoped read-only agents.
- Added the prioritized backlog, decisions, architecture, known-issues, and playtest documents.
- Updated the local stable MSVC Rust toolchain to 1.97.1, verified the declared 1.88 MSRV separately, and verified rustfmt, Clippy, Cargo test/check, release linking, WebView2 startup, and NSIS packaging.
- Added a generic repository-owned application icon and made the desktop build wrapper propagate the configurable player-facing title to both product and window titles.

## Verified evidence

| Check                            | Result | Evidence                                                                                                         |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| GDD preserved                    | Pass   | Git recognizes the byte-identical file move under `docs/`                                                        |
| Formatting                       | Pass   | `pnpm format:check`                                                                                              |
| Lint                             | Pass   | `pnpm lint --max-warnings=0`                                                                                     |
| Type checking                    | Pass   | `pnpm typecheck`                                                                                                 |
| Unit tests                       | Pass   | 19/19 tests across 3 files with `pnpm test`                                                                      |
| Coverage                         | Pass   | 100% lines/functions, 97.59% statements, 95.65% branches for targeted simulation modules                         |
| Browser production build         | Pass   | `pnpm build`; one JS asset, 801.22 kB minified / 214.68 kB gzip                                                  |
| Desktop manifest/Rust formatting | Pass   | `cargo metadata --no-deps` and `cargo fmt --check`                                                               |
| Desktop Rust shell               | Pass   | Rust/Cargo 1.97.1 MSVC; rustfmt, Clippy with denied warnings, Cargo tests, and `cargo check --locked`            |
| Declared Rust minimum            | Pass   | Rust/Cargo 1.88.0 MSVC completes `cargo check --locked`; CI verifies this MSRV separately                        |
| Desktop release executable       | Pass   | `pnpm build:desktop`; optimized Windows executable built and remained healthy in an 8-second WebView2 smoke test |
| Local NSIS packaging             | Pass   | `pnpm build:installer`; local x64 installer produced without publishing or installing it                         |
| Configurable desktop title       | Pass   | A `Prairie Signal` test build embedded that product name and exposed the same live window title                  |
| Visual smoke review              | Pass   | Local browser at 1440×900, 1024×720, and 1280×720 night; no overflow or console warnings                         |

## Honest capability boundary

The current screen is a presentation and architecture scaffold. The crew cards, job button, grid allocation, threat tags, and station geometry are representative placeholders. The repository does **not** yet implement customers, jobs, construction, pathfinding, saves, automatic combat, actual power allocation, traveler dialogue, the signature creature, wind/fire, audio, or the complete three-night scenario.

## Next work

1. Complete GS-010 with a fixed-step command/replay harness.
2. Implement typed commands and reason-coded events (GS-011).
3. Add serializable seeded RNG and state hashing (GS-012).
4. Add station grid/occupancy and deterministic movement (GS-013–014).
5. Design versioned save/load before simulation state grows (GS-015).
