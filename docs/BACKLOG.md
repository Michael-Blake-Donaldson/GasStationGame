# Great Plains Vertical-Slice Backlog

Last updated: 2026-08-08

This backlog implements the GDD milestone sequence. Priority is strict: finish and verify the current milestone before expanding the next. `P0` blocks the vertical slice, `P1` is required for the playtest gate, and `P2` is post-gate or optional polish.

## M0 — Development foundation

- [x] **GS-001 (P0): Establish repository quality gates.** Configure formatting, linting, strict type checking, unit tests, coverage, browser production build, and local CI workflow. Acceptance: root commands exist and pass on the initial checkpoint.
- [x] **GS-002 (P0): Preserve design authority and autonomous workflow.** Retain the GDD under `docs/`, add repository guidance, durable tracking documents, and read-only project subagents. Acceptance: all required files exist and explicitly enforce one normal writer.
- [x] **GS-003 (P0): Scaffold code-first browser/desktop clients.** React, direct Three.js, validated content, and Tauri 2 are configured without simulation/presentation coupling; browser and Windows desktop production builds pass with the explicitly tested Rust 1.88 minimum.
- [x] **GS-004 (P0): Make the player-facing title configurable.** Acceptance: visible title comes from `VITE_GAME_TITLE`; technical identifiers remain generic.
- [ ] **GS-005 (P1): Add an offline-owned font and placeholder asset pipeline.** Acceptance: production presentation uses repository-owned, license-documented assets and does not require runtime network access.

## M1 — Simulation skeleton

- [x] **GS-010 (P0): Implement fixed-tick phase clock.** Acceptance: the integer 100 ms clock kernel preserves exact phase/resource boundaries, daytime pause, the nighttime slow-time floor and fast-time cap, and exact three-night completion; the browser accumulator is independent of callback cadence and retains capped catch-up debt; typed time commands, replay receipts, deterministic checkpoint hashes, and boundary/property tests pass.
- [x] **GS-011 (P0): Add typed command and domain-event buses.** Acceptance: UI submits typed commands; every authoritative change emits ordered, reason-coded events; rejected commands explain why.
- [x] **GS-012 (P0): Add seeded RNG and replay harness.** Acceptance: RNG state is serializable; identical seed plus command stream yields identical state hash and event ledger across repeated runs.
- [x] **GS-017 (P0): Establish the responsive presentation and modal foundation.** Acceptance met: App runtime orchestration is separated from reusable HUD composition; a shared accessible dialog/drawer primitive implements inert background, focus containment/return, Escape, backdrop dismissal, and intentional scrolling; the station guide and authoritative event-history drawer use it; time controls expose grouped pressed state; essential UI remains usable from 320 px through 1920×1080 and effective 100–150% UI scale. Repository-owned typography remains the separate GS-005 prerequisite for deterministic visual baselines.
- [ ] **GS-018 (P1): Establish the graphics and readability baseline.** Acceptance: deterministic day/dusk/night and Beacon stable/critical/dark fixtures keep HUD and Three.js state consistent; repository-owned fonts, visual tokens, reduced-motion behavior, lightweight Great Plains placeholder identity, and a documented screenshot matrix produce reviewed baselines without claiming final art or gameplay systems. Progress: the shared visual-state contract, nine-state development fixture, retained on-demand renderer, Great Plains procedural pass, lifecycle tests, and visual review are complete; GS-005 repository-owned typography remains before deterministic cross-machine baselines can close this item.
- [x] **GS-013 (P0): Implement station grid and occupancy.** Acceptance met: the validated 32×24 Great Plains definition combines reserved authored facility plots, flexible-build areas, fixed station landmarks, and canonical JSON-native occupancy; pure bounds, rotation, index, occupant, and placement checks provide deterministic structured results; grid identity and occupants participate in scenario v2 start events, replay, checkpoint v4, and state hashes; malformed definitions/state and source-order invariance have unit/property coverage.
- [x] **GS-014 (P0): Implement deterministic employee movement and job assignment.** Acceptance met: four scenario-positioned employees accept, travel to, perform, cancel, and complete jobs through typed commands; canonical four-way pathfinding and validated interaction cells reject unavailable, blocked, and unreachable work with stable causes; movement, work, events, replay v3, and checkpoint v5 remain deterministic across clock partitions.
- [x] **GS-015 (P0): Implement versioned save/load.** Acceptance met: canonical save schema v1 separates campaign, station, session cursor, settings, difficulty, content compatibility, and recovery metadata; checkpoint v5 round-trips exact authoritative state at day, dusk, night, morning, mid-job, and terminal boundaries; strict Zod plus semantic validation rejects malformed, incompatible, checksummed-but-fabricated, or causally inconsistent data with typed issues.
- [x] **GS-016 (P1): Add corrupted-save recovery rotation.** Acceptance met: a serialized three-slot policy fills empty slots, replaces invalid then oldest valid candidates, loads the highest valid sequence with stable ties, and falls back around truncated or unreadable candidates; compare-and-replace writes require exact decode/read-back verification, abort on any unsafe read, never rewrite another slot after failure, reject stale racers, and retry transient failures without reversing freshness. The Tauri adapter accepts only three fixed names, bounds reads/writes, flushes and atomically replaces under one process lock, and gates runtime startup until recovery before enabling dusk/morning autosaves. A major-choice trigger seam is ready for its future command.

## M2 — Playable day loop

- [x] **GS-020 (P0): Implement pumps, checkout, stock, and customers.** Acceptance met: authored traffic creates deterministic pump and checkout queues; staffed service snapshots bounded prices, consumes stock, earns exact cash, and emits causal arrival/sale/completion facts; daytime commands set prices and purchase fuel/food at exact wholesale cost; a complete staffed day reconciles all 82 customers and every unit/revenue change. The accessible shift board exposes staffing, prices, orders, queues, and served totals.
- [ ] **GS-021 (P0): Implement employee skill and fatigue.** Acceptance: role skill and fatigue change speed/error outcomes; every modifier is inspectable and deterministic.
- [ ] **GS-022 (P0): Implement construction rules.** Acceptance: store/garage use authored plots; wall, gate, floodlight, turret, ammo storage, repair station, and generator upgrade use flexible placement with cost, rotation, and validity feedback.
- [ ] **GS-023 (P0): Validate paths after construction.** Acceptance: placement cannot silently strand required routes; invalidity identifies the blocked route or interaction cell.
- [ ] **GS-024 (P1): Add rush-hour pressure.** Acceptance: customer patience, staffing, layout, fatigue, and theft/suspicion create recoverable operational pressure without manual service for routine customers.

## M3 — Dusk and automatic night defense

- [ ] **GS-030 (P0): Build dusk readiness review.** Acceptance: forecast, power priorities, defenders, emergency staff, locks, and ammunition allocation can be inspected and committed before night.
- [ ] **GS-031 (P0): Implement power network and shedding.** Acceptance: generation, consumers, priorities, circuits, outages, and Beacon state are pure simulation data; demand cannot exceed allocated supply.
- [ ] **GS-032 (P0): Add Hollow Walkers and Headlight Men.** Acceptance: automatic targeting uses deterministic range/line-of-sight/priority; direct light freezes Headlight Men; counters are readable.
- [ ] **GS-033 (P0): Add automatic defenses.** Acceptance: floodlights and turrets consume power/ammo, can fail, report their causes, and respond to daytime layout choices.
- [ ] **GS-034 (P0): Add night interventions.** Acceptance: slow time, reload, repair, reroute, reassign, emergency light, and lockdown have travel/resource/risk costs and can change outcomes.
- [ ] **GS-035 (P0): Generate morning report from event ledger.** Acceptance: injuries, consumption, damage, relationships, recovered materials, trust, and decisive causes reconcile exactly to logged events.
- [ ] **GS-036 (P1): Add readable breach and persistent damage.** Acceptance: damage survives sunrise and clearly changes the next day.

## M4 — People and narrative consequence

- [ ] **GS-040 (P0): Add visible relationships, traits, fatigue, and injury.** Acceptance: exact values, tiers, change history, buffs, and debuffs are inspectable; major companions cannot die in routine simulation.
- [ ] **GS-041 (P0): Add one important traveler and one recruit.** Acceptance: observe/question/negotiate/decide/remember loop works with authored conditions and consequences.
- [ ] **GS-042 (P0): Make a traveler choice matter within three nights.** Acceptance: one decision changes at least one operational variable and one later story/event result.
- [ ] **GS-043 (P1): Add portrait dialogue presentation.** Acceptance: Keeper movement preserves world context before one representative illustrated portrait set and accessible dialogue UI appear.

## M5 — Great Plains three-night content

- [ ] **GS-050 (P0): Author the complete three-night scenario.** Acceptance: three days, two dusk readiness windows, three escalating nights, and morning reports run from a clean start without debug intervention.
- [ ] **GS-051 (P0): Add wind and grass-fire simulation.** Acceptance: wind direction changes spread and safe routes; fire never obscures its source, affected cells, or available counterplay.
- [ ] **GS-052 (P0): Design and implement the signature creature.** Acceptance: it tests station layout differently from basic threats and has forecastable, explainable counterplay.
- [ ] **GS-053 (P0): Prove two viable defense strategies.** Acceptance: fixed-seed scenarios and human playtests demonstrate at least two materially distinct successful preparations without a dominant layout.
- [ ] **GS-054 (P1): Reach representative presentation quality.** Acceptance: Great Plains identity, store, pumps, garage plot, grass, road, red Beacon sign, warm/dark lighting contrast, CRT threat panel, persistent damage, and core audio mood are present and readable.
- [ ] **GS-055 (P1): Complete accessibility/settings baseline.** Acceptance: scalable UI, visible focus, remapping-ready input actions, reduced motion/flash/shake, adjustable CRT interference, captions, and visual audio-warning equivalents pass review.
- [ ] **GS-056 (P1): Profile and meet provisional budgets.** Acceptance: record baseline PC; target 60 fps at 1080p, preserve a 30 fps readability floor, p95 simulation step at or below 4 ms, no ordinary input-blocking task over 50 ms, and bounded logs/save growth.

## M6 — Playtest gate

- [ ] **GS-060 (P0): Run structured comprehension tests.** Acceptance: players can explain why the station succeeded or failed, including decisive power/ammo/people events.
- [ ] **GS-061 (P0): Validate night engagement.** Acceptance: players remain occupied during automatic combat and can identify meaningful interventions.
- [ ] **GS-062 (P0): Validate people and consequences.** Acceptance: players remember employees by name/role/relationship and recognize traveler consequences within three nights.
- [ ] **GS-063 (P0): Make expansion go/no-go decision.** Acceptance: replay intent and all GDD success metrics are recorded; chapter production begins only after an explicit go decision in `docs/DECISIONS.md`.

## Explicit post-gate scope

- [ ] **GS-100 (P2): Expand Great Plains toward its full 21-night chapter.** Blocked by GS-063.
- [ ] **GS-110 (P2): Add advanced expeditions, factions, romance arcs, and broader generation.** Blocked by the vertical-slice gate.
- [ ] **GS-120 (P2): Evaluate controller, mod, console, and online-service work.** Not authorized and excluded from the slice.
