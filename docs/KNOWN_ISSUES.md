# Known Issues and Risks

Last updated: 2026-08-07

## Active implementation limitations

### KI-001 — Current UI is a non-interactive systems mock

- **Severity:** Expected / P0 roadmap gap
- **Status:** Open
- **Symptoms:** Crew assignment, power allocation, camera help, threat tags, and station objects appear but are not connected to gameplay commands.
- **Impact:** The screen must not be described as a playable slice.
- **Plan:** GS-013 through GS-035 connect grid, jobs, power, combat, and reports through the GS-011 command/event foundation.

### KI-002 — Simulation clock is not yet a replay-grade fixed-step engine

- **Severity:** High
- **Status:** Resolved 2026-08-06
- **Resolution:** GS-010 replaced floating minute/UI cadence stepping with integer clock units, a fixed 100 ms active step, a debt-preserving browser accumulator, typed time commands, a clock replay fixture, and deterministic checkpoint hashing. Boundary, cadence-partition, long-run invariant, invalid-input, and exact-completion tests pass.
- **Remaining boundary:** GS-012 now supplies versioned serializable RNG and scenario-level replay. Save/load continuation and migration remain GS-015/016 work rather than clock defects.

### KI-003 — Save/load and recovery are not implemented

- **Severity:** High
- **Status:** Open
- **Impact:** Autosave, campaign/station separation, migration, corruption recovery, and resumed-run equality cannot be verified.
- **Plan:** GS-015 and GS-016 before expanding simulation state materially.

### KI-004 — Renderer choice has not passed the performance/readability prototype

- **Severity:** Medium
- **Status:** Open
- **Symptoms:** Current scene uses a few procedural meshes and lights, not target-scale entities, grass, weather, selection overlays, or threats.
- **Impact:** Three.js/Tauri may expose draw-call, shadow, WebView2, or isometric-readability limits later.
- **Plan:** Instrument target-scale Great Plains scenes under GS-056; record any renderer decision change.

### KI-005 — Placeholder typography depends on installed system fonts

- **Severity:** Low
- **Status:** Open
- **Symptoms:** Visual appearance varies when Barlow Condensed or IBM Plex Mono is unavailable.
- **Impact:** Screenshot baselines are not stable across machines.
- **Workaround:** CSS provides sans-serif/monospace fallbacks.
- **Plan:** Add repository-owned, license-documented font assets in GS-005 before visual baselines.

### KI-006 — GDD visual render QA unavailable in current environment

- **Severity:** Low
- **Status:** Open
- **Symptoms:** The canonical DOCX renderer could not launch because LibreOffice/`soffice` is absent.
- **Impact:** Requirements were structurally extracted, but the repository move was not visually rendered through the document-skill gate.
- **Workaround:** Preserve the DOCX byte-for-byte; compare its Git blob after the rename. Use Microsoft Word or install LibreOffice only with authorization if visual document QA is needed.

### KI-007 — Initial browser bundle is not code-split

- **Severity:** Low
- **Status:** Open
- **Symptoms:** React, Tauri's title adapter, the deterministic simulation foundation, and the direct Three.js prototype currently produce one roughly 810 kB minified JavaScript asset (about 217 kB gzip).
- **Impact:** Startup is acceptable for the scaffold but may grow without an asset/scene loading boundary.
- **Plan:** Measure startup and target scenes in GS-056, then split by actual loading phases rather than speculative package boundaries. Vite's advisory threshold is temporarily 850 kB so this known baseline does not appear as an unexplained build warning.

### KI-008 — Local Rust toolchain is too old for the resolved desktop dependencies

- **Severity:** Medium / environment blocker
- **Status:** Resolved 2026-08-06
- **Resolution:** Updated the stable MSVC toolchain from Rust/Cargo 1.80 to 1.97.1. Rust formatting, Clippy with denied warnings, Cargo tests/check, the optimized desktop build, WebView2 startup, and local NSIS packaging now pass.
- **Prevention:** Keep the explicitly tested `rust-version = "1.88"` minimum, preserve `Cargo.lock`, and run `pnpm verify:all` after desktop dependency changes. CI checks both the declared minimum and current stable. The repository does not change global toolchains automatically.

### KI-009 — Replay and event history are clock-only

- **Severity:** High / P0 roadmap gap
- **Status:** Resolved 2026-08-06
- **Resolution:** GS-011 replaced the bounded authoritative log with a complete active-scenario ledger of typed, ordered, reason-coded events. UI copy and the recent-eight projection are non-authoritative. Resource deltas retain causal values, commands return correlated acceptance/rejection receipts, checkpoint version 2 hashes the full ledger, and replay reads it directly.
- **Remaining boundary:** The only current command payload is `time-mode.set`; GS-012 adds serializable RNG and scenario replay without inventing random gameplay, later systems add their command/event variants, GS-015 defines persistence/retention, and GS-035 derives morning reports from the ledger.

### KI-010 — Current presentation is fixed-size and lacks reusable modal structure

- **Severity:** Medium / user-prioritized foundation gap
- **Status:** Open
- **Symptoms:** The current 1024×720 shell uses very small labels and clipping-prone fixed layout; `App.tsx` combines runtime orchestration with all HUD composition; time controls, fatigue, preview panels, dusk, and Beacon state need stronger semantics and world/HUD consistency. No reusable dialog or drawer owns keyboard/focus policy.
- **Impact:** Adding grid, jobs, reports, dialogue, and scaled desktop UI now would compound a monolith and make later visual polish more expensive.
- **Plan:** Complete GS-005, then GS-017/018 immediately after GS-012. Establish owned fonts, responsive tokens/layout, accessible controls/dialog/drawer primitives, phase/Beacon-consistent rendering, reduced-motion handling, honest preview labels, and deterministic screenshot fixtures. Defer real grid/jobs/power/threat/report/dialogue content to its owning system.

## Product and design risks

### KR-001 — Automatic night combat may feel passive

Prototype runner travel, competing power/ammunition demands, meaningful recoverable failures, and slow-time pressure before content polish. Test whether players remain occupied without direct aiming.

### KR-002 — Simultaneous crises may become unreadable

Establish alert priority, causal event history, camera cues, and failure explanations early. At normal scale, a player must understand what is failing and why.

### KR-003 — Flexible construction can break navigation and utility connections

Use deterministic occupancy, reserved interaction cells, path validation, segmented circuits, and explicit unreachable/ disconnected placement feedback.

### KR-004 — Event logs and morning reports can diverge

Reports must be derived from the event ledger and reconciled in fixed-seed tests. Do not mutate a separate summary model.

### KR-005 — Retro CRT styling can reduce accessibility

Keep scanlines/static away from body text, pair colors with icons/text, preserve focus and scaling, and expose reduced motion/interference settings.

### KR-006 — Grass, wind, fire, and isometric occlusion can hide counterplay

Review silhouettes, safe routes, placement cells, threat ranges, and fire spread at target zoom in day/dusk/night conditions.

### KR-007 — Scope can expand before the slice is proven

Campaign regions, romance breadth, advanced expeditions, factions, controller, online services, and commercial asset breadth remain blocked by GS-063.

## Environment risks

- The repository is in OneDrive. File syncing can lock high-churn generated output. `node_modules`, `dist`, coverage, and Rust targets are ignored; retry safe commands if a lock occurs.
- Local Rust is 1.97.1 on the stable `x86_64-pc-windows-msvc` toolchain. Tauri dependency updates may raise the declared minimum; keep the resolved lockfile and record toolchain changes.
- Windows WebView2 version differences may affect WebGL behavior. Packaged smoke tests must record OS/GPU/WebView2 context.
