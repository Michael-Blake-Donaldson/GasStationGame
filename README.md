# Gas Station Game

Gas Station Game is the internal name for a code-first supernatural roadside-management game. **Last Stop** is the current working title from the GDD, exposed as configurable player-facing copy rather than a technical identifier.

The first production target is a replayable three-night Great Plains vertical slice proving that daytime station management creates readable, meaningful nighttime consequences.

## Current checkpoint

This repository contains the development foundation and a representative systems prototype:

- strict TypeScript simulation code isolated from Three.js presentation;
- a configurable player-facing title (`VITE_GAME_TITLE`);
- validated Great Plains content data;
- a placeholder orthographic 3D station and management HUD;
- deterministic phase/resource tests;
- Vite browser builds and a Tauri 2 Windows desktop shell;
- repository guidance, project-scoped read-only review agents, and production planning documents.

This is not yet a playable vertical slice. See [docs/BACKLOG.md](docs/BACKLOG.md) and [docs/PROGRESS.md](docs/PROGRESS.md) for the exact status.

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer
- Rust 1.85 or newer for the desktop shell (Edition 2024 dependency support)
- Windows WebView2 for running the Tauri desktop application

## Setup and commands

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Quality gates:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm build:desktop
pnpm verify
```

`pnpm build:desktop` creates a release executable without an installer. A distributable NSIS bundle remains configured in `src-tauri/tauri.conf.json` for an explicitly authorized release workflow.

## Configuration

Copy `.env.example` to `.env.local` and change `VITE_GAME_TITLE` to alter the visible working title. The browser document, Tauri window, and desktop build product name use this value. Do not derive package names, Rust crate names, save keys, schema identifiers, bundle identifiers, or filenames from the player-facing title.

## Source of truth

The retained design authority is [docs/Last_Stop_Game_Design_Document.docx](docs/Last_Stop_Game_Design_Document.docx). When code and the GDD disagree, stop and record the conflict in `docs/DECISIONS.md` before changing canon.

## Repository policy

Read [AGENTS.md](AGENTS.md) before autonomous work. The primary agent is the only normal writer. Project subagents are read-only specialists for systems analysis, exploration, QA, and visual/UI review.
