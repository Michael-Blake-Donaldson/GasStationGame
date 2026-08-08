# Decision Log

Last updated: 2026-08-08

Decisions are append-only. To change one, add a new decision that supersedes it and update the old status.

## DEC-001 — Treat the GDD as design authority

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Autonomous work needs a stable product boundary.
- **Decision:** `docs/Last_Stop_Game_Design_Document.docx` is the design source of truth. Implementation discoveries may propose changes, but canon changes require an explicit decision.
- **Consequences:** Backlog and tests cite GDD rules. Conflicts stop affected work instead of being silently resolved in code.

## DEC-002 — Separate internal and player-facing names

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Gas Station Game is the repository name; Last Stop is temporary GDD copy.
- **Decision:** Technical identifiers remain generic/Gas Station Game. The visible title is supplied through validated configuration, initially `VITE_GAME_TITLE` with a `Last Stop` fallback.
- **Consequences:** A title change does not require schema, save, package, or app-identifier migrations.

## DEC-003 — Use a browser-first TypeScript architecture with Tauri 2

- **Date:** 2026-08-06
- **Status:** Accepted for vertical-slice prototyping
- **Context:** The GDD requires a code-first TypeScript/WebGL architecture and a Windows desktop wrapper.
- **Decision:** Use Node 24 + pnpm, strict TypeScript, Vite, React DOM UI, direct Three.js presentation, Zod boundaries, and Tauri 2 for Windows packaging.
- **Alternatives considered:** Godot/Unity would conflict with the requested code-first, editor-independent content workflow. Electron is viable but ships a larger runtime; keep it as fallback if Tauri/WebView2 demonstrates a blocker. Babylon.js offers stronger built-in game primitives but the slice currently benefits from Three.js's smaller abstraction surface and direct rendering control.
- **Consequences:** Renderer commitment remains provisional until measured Great Plains performance/readability tests. Browser development stays fast and desktop concerns sit behind an adapter.

## DEC-004 — Own the deterministic simulation core

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Economy, jobs, power, relationships, threats, saves, and after-action explanations must be reproducible.
- **Decision:** Build the authoritative simulation as pure serializable TypeScript using fixed ticks, typed commands/events, injected seeded RNG, and project-owned component stores. Do not add a third-party ECS or physics engine until profiling identifies a concrete need.
- **Consequences:** React, Three.js, animation, DOM time, and Tauri cannot own authoritative state. Save/replay tests become possible. Some infrastructure must be built deliberately in M1.

## DEC-005 — Use one normal writer and read-only specialist agents

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Parallel writes create conflicts and dilute architectural ownership in a young repository.
- **Decision:** The primary agent performs all repository writes, staging, and commits. Project agents under `.codex/agents/` are read-only and limited to systems, exploration, QA, or visual/UI review.
- **Consequences:** Parallelism is reserved for bounded analysis and verification. The primary agent must synthesize findings and re-run checks after fixes.

## DEC-006 — Keep the application offline-first

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** The slice excludes online services and should run as a self-contained Windows game.
- **Decision:** Production runtime may not require web fonts, remote content, telemetry, accounts, or network services. Assets and saves are local. Any future external service requires separate authorization and a new decision.
- **Consequences:** Placeholder fonts use system fallbacks until repository-owned licensed fonts are added. CSP and capabilities stay minimal.

## DEC-007 — Use integer clock units and a fixed 100 ms engine step

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Floating minute accumulation and one-second UI callbacks could produce drift, lose delayed time, apply one phase's speed across another phase, and continue beyond the third sunrise.
- **Decision:** Authoritative time uses 40 integer clock units per simulation minute. Active simulation advances in fixed 100,000-microsecond engine steps: 3 units at slow speed, 12 at normal speed, and 48 at daytime fast speed. Night fast is effectively normal; night pause requests canonicalize to slow. The platform adapter owns elapsed-time debt and timestamps, never the simulation.
- **Consequences:** Callback partitions converge to identical state, phase/hour boundaries remain exact, and replay commands can target stable ticks. Paused or hidden wall time creates no catch-up debt. Presentation interpolation and broader commands/events remain separate work.

## DEC-008 — Keep a complete typed active-scenario event ledger

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context:** Replay, morning reports, and failure explanations cannot depend on a bounded UI log or player-facing prose. Commands also need deterministic acceptance and rejection outcomes.
- **Decision:** Route authoritative player intent through a pure typed command dispatcher. Store every meaningful authoritative transition as an ordered, reason-coded domain event with an explicit safe-integer sequence, fixed tick, and exact clock position. Keep the full ledger for the active scenario; derive the latest eight items and all player-facing copy through presentation selectors. Mechanical tick/clock-unit movement, receipts, rejected/no-op commands, and UI-only state are not domain events.
- **Consequences:** Checkpoint version 2 hashes typed ledger data rather than localized copy; replay consumes the state ledger directly; resource changes preserve before/requested/applied/after causality. Save retention/compaction remains a GS-015 design concern, and new command/event variants must extend exhaustive dispatch and presentation tests.

## DEC-009 — Version deterministic randomness as replay and save ABI

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** Generated employees, travelers, threats, weather, loot, and combat must reproduce under tests and resume without reconstructing current random state from a seed.
- **Decision:** Use a project-owned xoshiro128** generator identified as `xoshiro128ss` version 1. Its JSON-native state contains four unsigned 32-bit words and a safe-integer raw draw count. Seed expansion consumes the complete existing non-negative safe-integer seed and zero gameplay draws. Pure draw functions return replacement state; bounded integers use rejection sampling, and simulation code may not call `Math.random()`.
- **Consequences:** The algorithm, seed expansion, output transform, state transition, rejection behavior, and draw-consumption rules are persistence/replay ABI. Any change requires a new RNG version and explicit migration or rejection policy. Checkpoint version 3 includes RNG and scenario identity. Raw draws are mechanical substrate and do not emit events; the authoritative outcome selected by a future random system must emit an explainable domain event.

## DEC-010 — Share overlay policy and isolate the browser runtime adapter

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** Grid, jobs, reports, and dialogue will add panels and overlays; duplicating focus and cadence behavior inside `App` would make those systems fragile.
- **Decision:** Keep `App` as a presentation composition root. Isolate wall-clock cadence plus typed UI-command dispatch in `game/runtime`, and route dialogs/drawers through one portal primitive that owns background inertness, focus containment/return, Escape, backdrop dismissal, scroll locking, and narrow-screen sheet behavior. Event history remains a projection of the authoritative ledger.
- **Consequences:** New overlays inherit one accessibility policy and cannot become alternate authoritative state. Presentation-specific open/closed state stays outside simulation and replay. Representative content may reuse the primitive, but each workflow still needs its own semantic and visual review.

## DEC-011 — Derive one deterministic station visual state

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** HUD and world graphics can contradict each other if phase and Beacon presentation are derived independently, while screenshot testing cannot wait hours of wall time for each state.
- **Decision:** Derive one pure `StationVisualState` from authoritative simulation phase and power, then pass it to both HUD and Three.js. Pin atmosphere and Beacon styles in pure tests and expose their nine combinations through a development-only query fixture. Retain one static renderer and redraw on initialization, resize, or visual-state changes instead of using a perpetual animation loop.
- **Consequences:** Visual fixtures are deterministic and do not mutate or bypass simulation. Dark means zero Beacon point light and emissive output in every atmosphere. Future animated systems may add rendering cadence without changing authority, and production builds must exclude the fixture route. Repository-owned typography remains GS-005 before cross-machine pixel baselines are stable.

## DEC-012 — Represent the station as authored reservations plus canonical occupancy

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** The GDD combines authored major-building plots with flexible utilities and defenses. Movement, construction, saves, and later path validation need one deterministic spatial contract without making rendering authoritative.
- **Decision:** Use zero-based integer `{x, z}` cells with row-major indexes and quarter-turn rectangular footprints. Content defines grid dimensions, flexible-build rectangles, reserved authored plots, and fixed/initial occupants. Simulation state stores only the grid definition ID/version and ID-sorted placement facts; expanded cells and lookup maps are derived. Empty authored plots remain reserved, and one structural occupant may own a cell in GS-013.
- **Consequences:** Scenario composition binds and injects validated Great Plains identity plus content into the pure simulation core. Great Plains scenario definition version 2, replay envelope version 2, and checkpoint version 4 identify and hash grid occupancy. Construction commands, interaction cells, navigation, utilities, and layered overlap remain separate decisions and backlog items.

## DEC-013 — Make employee work a scenario-authored deterministic lifecycle

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** Day staffing and night reassignment need visible travel cost, reproducible routes, explainable rejection, and persistence-safe progress without coupling navigation to the renderer.
- **Decision:** Define initial employee positions, jobs, work subjects, interaction cells, and work durations in validated scenario data. Model employee activity as idle, traveling, or working. Use canonical four-way breadth-first search with structural occupancy as blockers, employees as non-blocking agents, and fixed tie-breaking. Advance travel and work only through authoritative integer clock units; route all assignment/cancellation through typed commands and lifecycle events.
- **Consequences:** Scenario definition/replay advance to version 3 and checkpoints to version 5. Active routes and work progress are serializable and validated against scenario context. Reassignment preserves current position and incurs a fresh route. Skills, fatigue, job outputs, crowd avoidance, animation, and player-facing assignment UI remain explicit later work.

## DEC-014 — Separate save compatibility from simulation and content compatibility

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** Local saves must survive controlled schema evolution without treating replay/checkpoint diagnostics as player saves or coupling persistence to UI, filesystem, or the temporary title.
- **Decision:** Use canonical generic save format `station-campaign-save` version 1. Keep save schema, campaign schema, checkpoint, scenario/grid content, RNG, settings, and difficulty versions explicit and independent. Separate campaign, current station, and session command cursor. Validate untrusted JSON structurally and causally before exposing state; include FNV-1a corruption checksum and monotonic recovery sequence, while reserving physical rotation/atomic storage for GS-016.
- **Consequences:** Exact day/dusk/night/morning and mid-action continuation are migration fixtures. Unknown versions reject rather than best-effort load; RNG is never reconstructed from seed; future migrations are pure sequential steps with retained fixtures. The checksum detects ordinary corruption but is not an authenticity or security mechanism. Player-facing title changes never migrate saves.

## DEC-015 — Rotate recovery saves behind a narrow atomic-slot contract

- **Date:** 2026-08-07
- **Status:** Accepted
- **Context:** Recovery must tolerate a truncated newest candidate and concurrent autosave requests without letting browser or Tauri storage behavior leak into the deterministic save codec. Broad frontend filesystem permissions are unnecessary and unsafe.
- **Decision:** Use three fixed logical slots behind `readSlot` and compare-and-replace `replaceSlotAtomically`. Refuse rotation when any slot cannot be read safely, fill empty slots before invalid then oldest-valid slots, verify exact persisted bytes through the codec, reject writers behind monotonic command/clock/event/tick/RNG progress, and load the highest fully valid sequence with stable ties. Treat codec-invalid and storage-unreadable candidates as distinct diagnostics. Gate runtime activity until startup recovery resolves, derive dusk/morning triggers from the event ledger, retry transient writes with a bound, and keep a validated major-choice seam.
- **Consequences:** The Tauri adapter retains the previous target bytes when replacement rejects, bounds reads/writes, and exposes only fixed command arguments, never arbitrary paths. Policy tests prove selection, fallback, stale-race handling, failure isolation, read-back verification, retry, and concurrency; Rust tests use repository-local target directories and never touch real app data. Startup adoption resets transient timing and feedback while retaining authoritative state and command order. Save/load status UI remains later presentation work.

## DEC-016 — Model routine retail as authored deterministic service queues

- **Date:** 2026-08-08
- **Status:** Accepted
- **Context:** The first playable day loop needs understandable operational pressure without introducing unreviewed randomness, customer micromanagement, or duplicate resource authorities.
- **Decision:** Generate routine customers from disjoint authored traffic windows and sequence-derived fuel/food demand. Route each customer through a single pump lane and, when needed, a single checkout lane. Workstations are staffed only by employees actively working the corresponding scenario job. Service snapshots the current integer unit price, consumes the existing fuel/food resources, adds exact cash, and emits arrival, sale, and completion facts. Price changes and immediate wholesale orders are daytime typed commands. Customer patience, theft, skill/fatigue modifiers, multiple lanes, and important travelers remain later systems.
- **Consequences:** Identical content, commands, and clock progression reproduce the same queues and ledger without consuming RNG. Scenario/replay v4, checkpoint v6, and save v2 include business state. V1 saves migrate by removing the retired fake daytime flow and starting routine traffic from their next future authored arrival; historical money is never silently presented as a sale. The first UI is an operations dialog over commands and snapshots, not a second business model.

## DEC-017 — Snapshot inspectable employee performance at routine service start

- **Date:** 2026-08-08
- **Status:** Accepted
- **Context:** The GDD requires job experience to improve speed/accuracy and fatigue to reduce reliability, while the deterministic architecture requires every outcome to survive replay and save/load exactly.
- **Decision:** Author pump and checkout skill as canonical integer levels from 0–5 and retain fatigue as an exact integer from 0–100. At service start, calculate duration and rework chance using authored integer-permille rules, consume one bounded draw from the canonical xoshiro RNG, and snapshot every input, contribution, final value, roll cursor, and outcome. A mistake adds authored rework time only; it never silently changes cash or stock. If the attributed worker stops staffing, emit `service.interrupted`, requeue the customer, and require a newly attributed snapshot before progress resumes.
- **Consequences:** Scenario/replay advance to version 5, checkpoints to version 7, and saves to schema v3. V2 active service migrates to its queue at an explicit performance baseline so no historical modifier or RNG fact is invented. Skill XP, fatigue gain/recovery, traits, relationships, injuries, customer patience, and job-wide performance remain deferred to their named backlog systems.

## DEC-018 — Place construction from content-owned blueprints through one evaluator

- **Date:** 2026-08-08
- **Status:** Accepted
- **Context:** The GDD requires authored major-building plots and flexible utility/defense construction, but does not specify numeric footprints or costs. Preview and dispatch must agree exactly, while untrusted commands must not supply authoritative geometry, price, placement identity, or facility identity.
- **Decision:** Define construction blueprints in validated scenario content with stable IDs, placement class, display copy, exact cash/scrap cost, and either authored facility identity or flexible footprint/allowed rotations. Commands supply only a blueprint and authored plot or flexible origin/rotation. Use one pure evaluator for preview and authoritative dispatch; derive affected cells and canonical `built-{blueprint}-{sequence}` identities; reject grid, phase, resource, current-employee, and remaining-active-route conflicts before applying cost and occupancy atomically. Treat the Great Plains numeric costs and footprints as explicit provisional slice tuning. Defer whole-layout route preservation to GS-023 rather than implying that active-route protection proves future reachability.
- **Consequences:** Same-tick stale placements reject without mutation and accepted events carry enough canonical blueprint, geometry, cost, and occupancy facts for causal validation. Scenario/replay advance to version 6, checkpoints to version 8, and saves to schema v4; frozen v1–v3 saves migrate without fabricating construction history. Construction is daytime and immediate for the slice. Demolition, build duration, path preview, utility connectivity, gate traversal, storage capacity, light, turret, generator, and repair behavior remain named later work.

## DEC-019 — Preserve one authored work-access network after construction

- **Date:** 2026-08-08
- **Status:** Accepted
- **Context:** Protecting only a crew member's occupied cell and current route still allows a later wall to isolate idle staff, seal every interaction cell, or disconnect a work area. The GDD makes staffing, construction layout, and vulnerable operational routes consequential, but the slice does not yet model customer vehicles, threats, evacuation, or utilities on the station grid.
- **Decision:** Scenario content names one anchor work target and a unique ascending set of required work targets. For Great Plains, checkout anchors a network containing checkout, west pumps, the garage plot, Beacon watch, and every current employee cell. After tentatively appending a geometrically valid construction occupant, require at least one open interaction cell per target and four-way path connectivity from every endpoint to the anchor. Keep the existing active-route blocker stricter than future reachability. Report blocked interactions and disconnected employee/target endpoints separately with exact IDs and cells. Treat all constructed shells, including gates, as solid until gate state deliberately changes job and construction semantics together.
- **Consequences:** Scenario content advances to version 7 while replay v6, checkpoint v8, and save v4 retain their serialized shapes. Preview and dispatch share the policy, accepted event prefixes and final snapshots revalidate it, and construction consumes no RNG. Safe scenario-v6 v4 saves migrate; unsafe layouts reject with a dedicated issue instead of deleting structures or inventing refunds. Customer/vehicle ingress, deliveries, threat/defender routes, evacuation, utility networks, route width/redundancy, terrain costs, crowds, damage blockages, and gate controls remain explicit later work.
