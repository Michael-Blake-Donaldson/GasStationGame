# Decision Log

Last updated: 2026-08-06

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
