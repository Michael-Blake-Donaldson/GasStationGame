# Great Plains Playtest Plan

Last updated: 2026-08-08

## Purpose

The playtest gate decides whether daytime station management produces compelling, explainable nighttime consequences. It does not evaluate the full campaign, final asset quality, romance breadth, advanced expeditions, or commercial readiness.

## Preconditions

Do not run formal slice sessions until:

- the clean production build completes three days and three nights;
- one important traveler choice affects operations and story within three nights;
- Hollow Walkers, Headlight Men, the signature creature, wind, and grass fire have readable counterplay;
- morning reports reconcile to event logs;
- fixed-seed success and failure fixtures pass;
- accessibility/settings essentials are usable;
- no known blocker can destroy or invalidate a test run.

## Session setup

Record:

- build commit, save schema/checkpoint version, checksum algorithm, and recovery sequence;
- scenario/content version and seed;
- machine, resolution, display scaling, input devices, OS/GPU/WebView2;
- difficulty/accessibility settings;
- participant's relevant management/strategy experience;
- facilitator and note-taker.

Use the production build. Do not coach unless the protocol asks for a prompt. Capture local event logs and timestamps only; do not add network telemetry without separate authorization.

## Protocol

### 1. First-minute readability

Without explanation, ask the player to point to:

- current phase and time;
- Beacon and power state;
- cash, fuel, and ammunition;
- selected worker and task;
- highest-priority alert;
- why a visible defense or facility is failing.

Record correctness, hesitation, and any panel opened.

### 2. Day-one operation

Ask the player to reopen services and prepare for the forecast. Observe selection, assignment, queues, stocking, prices, construction, placement errors, camera control, and pause use. Do not suggest an optimal layout.

### 3. Dusk explanation

Before committing, ask: "What do you think will happen tonight, and which preparation matters most?" Record predicted routes, power priorities, staff, ammunition, and uncertainty.

### 4. Night agency

Observe whether the player notices and uses reload, repair, reroute, reassign, emergency light, lockdown, and slow time. Record idle periods, overload, missed causes, and interventions that felt meaningful or futile.

### 5. Morning causality

Before opening the report, ask what was lost, what was saved, and why. Then show the report and ask which event changed their next-day plan. Compare the answer to the event ledger.

### 6. Traveler consequence and later nights

Observe the important traveler decision without steering. Within three nights, ask whether the player recognizes its operational and story consequence. Track employee name/role/relationship recall and whether the player changes strategy after persistent damage.

### 7. Debrief

Ask:

1. Why did the station succeed or fail each night?
2. When did you feel most busy, and when did you feel passive?
3. Which employee do you remember and why?
4. Which preparation decision mattered most?
5. Was any warning, resource change, relationship change, or failure arbitrary?
6. What would you build or staff differently on a replay?
7. Would you play another run or the next region? Why?

## Observation template

```text
Build / seed:
Participant profile:
Settings / machine:

First-minute findings:
Day-loop findings:
Dusk prediction:
Night agency findings:
Morning explanation vs. ledger:
Traveler consequence recognized:
Employees recalled:
Strategy used:
Critical confusion or accessibility issue:
Replay / next-chapter intent:

Top 3 issues (severity + evidence):
1.
2.
3.
```

## Success metrics and gate

The slice may receive a **go** recommendation only when repeated sessions show:

- players can explain decisive success/failure causes;
- players remain occupied and emotionally engaged during automatic combat;
- at least two materially different defensive strategies succeed without one dominant layout;
- traveler consequences are recognized within three nights;
- employees are remembered by name, role, or relationship;
- most players choose replay or ask about the next chapter;
- no critical accessibility/readability failure blocks the core loop;
- production performance preserves a 30 fps readability floor on the agreed baseline, targeting 60 fps at 1080p;
- fixed-seed reports and saves remain deterministic and reconciled.

Record the go/no-go result in `docs/DECISIONS.md`. A no-go returns concrete experiments to the top of `docs/BACKLOG.md`; it does not justify adding campaign breadth.

## Presentation smoke matrix

Before a playtest build is accepted, inspect the HUD, station guide, station-operations dialog, and event-history drawer at these effective viewport widths:

| Width        | Expected composition                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| 1920–1180 px | Single-screen three-column station view; side panels scroll internally only when height requires it.           |
| 900 px       | World preview precedes the two secondary panels; essential controls remain visible.                            |
| 660 px       | One-column world/crew/intel flow; resource values wrap into two columns; event console stays reachable.        |
| 320 px       | No page-level horizontal overflow or visible text below 10 px; guide and event log remain keyboard accessible. |

At each width, verify selected time mode without relying on color, visible focus, forward and reverse focus containment, Escape/backdrop dismissal, focus return, background inertness, intentional overlay scrolling, and no clipped essential resource. Record screenshots only after repository-owned typography makes cross-machine comparisons deterministic.

Before any build with durable saves reaches playtest, exercise the recovery matrix: clean newest slot, truncated newest slot, invalid-checksum newest slot, one unreadable slot, interrupted atomic replacement, failed read-back verification, and concurrent autosave requests. Confirm the newest valid sequence resumes exactly, fallback is disclosed, no failure mutates another recovery slot, and a loaded runtime neither replays old phase autosaves nor carries wall-clock runner debt.

For development review, run `pnpm dev` and open `/?visual-fixture=station&atmosphere=day&beacon=stable`. Review the complete Cartesian matrix using `day|dusk|night` and `stable|critical|dark`. Each fixture must create one canvas, expose the selected values in its accessible scene label, avoid fresh console warnings, and keep important station silhouettes readable. This route is development-only and must not appear in a production bundle.

## Issue severity

- **Blocker:** Cannot complete or understand the core loop; data loss/crash; inaccessible required action.
- **High:** Frequently causes unfair failure, passivity, or incorrect mental model.
- **Medium:** Recoverable confusion, poor feedback, or notable friction.
- **Low:** Polish issue without meaningful outcome impact.
