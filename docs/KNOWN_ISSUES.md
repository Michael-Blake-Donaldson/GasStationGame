# Known Issues and Risks

Last updated: 2026-08-08

## Active implementation limitations

### KI-001 — Current UI is a non-interactive systems mock

- **Severity:** Expected / P0 roadmap gap
- **Status:** Partially resolved 2026-08-08
- **Progress:** GS-020 connects routine customers, pump/checkout staffing, prices, inventory orders, queue totals, served totals, resources, receipts, and event history through the authoritative command/event foundation.
- **Remaining boundary:** Power allocation, camera controls, threat tags, and most station objects remain previews until GS-022 and GS-030 through GS-035. The current build has a playable day-business loop, not a complete vertical slice.

### KI-002 — Simulation clock is not yet a replay-grade fixed-step engine

- **Severity:** High
- **Status:** Resolved 2026-08-06
- **Resolution:** GS-010 replaced floating minute/UI cadence stepping with integer clock units, a fixed 100 ms active step, a debt-preserving browser accumulator, typed time commands, a clock replay fixture, and deterministic checkpoint hashing. Boundary, cadence-partition, long-run invariant, invalid-input, and exact-completion tests pass.
- **Remaining boundary:** GS-012 now supplies versioned serializable RNG and scenario-level replay. Save/load continuation and migration remain GS-015/016 work rather than clock defects.

### KI-003 — Save/recovery status has no player-facing UI

- **Severity:** High
- **Status:** Open
- **Impact:** Tauri now autosaves durably at dusk/morning and adopts the newest valid recovery at startup, but the player is not told when fallback occurred or a storage operation failed, and there is no manual save/load workflow. Browser development is intentionally ephemeral.
- **Progress:** GS-015 established the schema and validation boundary. GS-016 added the fixed-name Tauri adapter, three-slot compare-and-replace rotation, corruption/I/O diagnostics, newest-valid fallback, exact post-write verification, cross-service conflict handling, phase autosaves, and transient-safe startup adoption without granting frontend filesystem paths.
- **Plan:** Add accessible save/load and recovery-status presentation before external playtesting. Keep automatic failures non-destructive and surface actionable, non-technical copy without weakening diagnostic logs.

### KI-004 — Renderer choice has not passed the performance/readability prototype

- **Severity:** Medium
- **Status:** Open
- **Symptoms:** The reviewed scene now has deterministic atmosphere/Beacon fixtures, retained on-demand rendering, and richer procedural station identity, but still lacks target-scale entities, animated grass/weather, selection overlays, and threats.
- **Impact:** Three.js/Tauri may expose draw-call, shadow, WebView2, or isometric-readability limits later.
- **Plan:** Instrument target-scale Great Plains scenes under GS-056; record any renderer decision change.

### KI-005 — Placeholder typography depends on installed system fonts

- **Severity:** Low
- **Status:** Open
- **Symptoms:** The presentation intentionally uses generic system sans/monospace stacks until licensed local files exist, so font metrics and appearance still vary across machines.
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
- **Symptoms:** React, Tauri's title/recovery adapters, the deterministic simulation/persistence/business foundation, and the direct Three.js prototype currently produce one 901.60 kB minified JavaScript asset (241.54 kB gzip), which now triggers Vite's 900 kB advisory.
- **Impact:** Startup is acceptable for the scaffold but may grow without an asset/scene loading boundary.
- **Plan:** Add an intentional scene/platform loading boundary before the bundle grows further, then measure startup and target scenes in GS-056. Keep the advisory visible until a measured split resolves it rather than raising the threshold again.

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
- **Status:** Resolved 2026-08-07
- **Resolution:** GS-017 removed the fixed minimum viewport, introduced deliberate desktop/tablet/mobile composition, raised readable label sizing, extracted the browser simulation runtime from `App`, added semantic meters and grouped pressed-state time controls, and established one accessible dialog/drawer primitive used by the station guide and authoritative event log. Focus containment/return, inert background, Escape, backdrop dismissal, body-scroll restoration, and 320–1920 px layouts are verified.
- **Remaining boundary:** GS-005 still owns licensed repository typography. GS-018 owns deterministic phase/Beacon visual fixtures and Three.js consistency; GS-054 remains the representative-art gate.

### KI-011 — Authoritative movement is not yet projected into rendering

- **Severity:** Expected / P0 roadmap gap
- **Status:** Open
- **Symptoms:** Great Plains occupancy, interaction cells, employee routes, and job progress are deterministic and replayable. GS-020 exposes pump/checkout assignments and cancellation in the shift board, but employees and routes are not rendered in the procedural station scene, which is not yet generated from authoritative occupancy.
- **Impact:** Staffing is playable and inspectable in text, but travel and placement feedback are not visible in the world.
- **Plan:** Project employees and selection/path feedback downstream of simulation state; GS-022/023 add construction and construction-time path validation without letting placeholder art dictate domain geometry.

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
