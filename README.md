# Gas Station Game

Gas Station Game is the internal name for a code-first supernatural roadside-management game. **Last Stop** is the current working title from the GDD, exposed as configurable player-facing copy rather than a technical identifier.

The first production target is a replayable three-night Great Plains vertical slice proving that daytime station management creates readable, meaningful nighttime consequences.

## Current checkpoint

This repository contains the development foundation and a representative systems prototype:

- strict TypeScript simulation code isolated from Three.js presentation;
- a configurable player-facing title (`VITE_GAME_TITLE`);
- validated Great Plains content data;
- a placeholder orthographic 3D station and management HUD;
- an integer fixed-step phase clock with typed time commands, replay fixtures, and deterministic checkpoint hashing;
- Vite browser builds and a Tauri 2 Windows desktop shell;
- repository guidance, project-scoped read-only review agents, and production planning documents.

This is not yet a playable vertical slice. See [docs/BACKLOG.md](docs/BACKLOG.md) and [docs/PROGRESS.md](docs/PROGRESS.md) for the exact status.

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer
- Rust 1.88 or newer using the `x86_64-pc-windows-msvc` target; `rust-toolchain.toml` selects stable Rust with rustfmt and Clippy
- Visual Studio 2022 Build Tools or Community with Desktop development with C++ (MSVC and a Windows SDK)
- Windows WebView2 for running the Tauri desktop application

## Setup and commands

```powershell
rustup show
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
pnpm lint:rust
pnpm test:rust
pnpm build:desktop
pnpm verify
pnpm verify:all
```

`pnpm build:desktop` creates a release executable without an installer. `pnpm build:installer` creates a local NSIS installer when packaging is explicitly in scope; it does not publish or install the application.

## Configuration

Copy `.env.example` to `.env.local` and change `VITE_GAME_TITLE` to alter the visible working title. The browser document, Tauri window, desktop product name, and human-facing installer filename use this value. Do not derive persistent technical identifiers—such as package names, Rust crate names, save keys, schema identifiers, bundle identifiers, or internal paths—from the player-facing title.

## Source of truth

The retained design authority is [docs/Last_Stop_Game_Design_Document.docx](docs/Last_Stop_Game_Design_Document.docx). When code and the GDD disagree, stop and record the conflict in `docs/DECISIONS.md` before changing canon.

## Repository policy

Read [AGENTS.md](AGENTS.md) before autonomous work. The primary agent is the only normal writer. Project subagents are read-only specialists for systems analysis, exploration, QA, and visual/UI review.
