# Dungeons & Moles - Coding Agent Guide

This repository hosts the React Native + Expo codebase for Dungeons & Moles, a PvE roguelike dungeon crawler with deterministic gameplay, auto-battler combat, and a Day/Night/Week loop. Use this guide to keep changes consistent with the game design and engine constraints.

## Project Overview

- **Game loop:** Explore a seeded map, fight auto-resolving combat, use POIs for upgrades, and clear week bosses.
- **Determinism:** `src/game/` logic must be deterministic for replay/debugging.
- **Specs:** Product specs live in `specs/001-pve-dungeon-crawler/` and design detail is summarized in `specs/gdd.md`.

## Architecture & Data Flow

- **Pure logic vs UI:** `src/game/` contains pure logic (no React). UI lives in `src/components/` and `src/screens/`.
- **State machine:** `src/game/engine/state-machine.ts` defines phase transitions (Exploration, Combat, POI, Boss, Victory/Defeat).
- **Reducer:** `src/game/engine/game-reducer.ts` is the single source of truth for game state updates.
- **RNG:** Use `SeededRNG` from `src/game/engine/rng.ts`; avoid `Math.random()` and `Date.now()` in game logic.

## Key Directories

- `src/game/`: Deterministic engine, combat, map generation, entities.
- `src/data/`: Static definitions for items, gear, bosses, POIs.
- `src/components/` + `src/screens/`: React Native UI.
- `assets/`: All static images (see structure below).
- `specs/`: Product specs and plans (`specs/gdd.md` is the design reference).

## Solana Programs (On-Chain)

The on-chain Solana programs live in the sibling repository at `../solana-programs`. Reference this folder when:

- Implementing frontend interactions with on-chain instructions
- Understanding account structures and PDAs
- Debugging on-chain transaction failures
- Updating programs to work with frontend changes

### Program Structure

| Program          | Path                         | Purpose                                                           |
| ---------------- | ---------------------------- | ----------------------------------------------------------------- |
| gameplay-state   | `programs/gameplay-state/`   | Core game state: movement, combat, phase transitions, boss fights |
| session-manager  | `programs/session-manager/`  | Session lifecycle: start/end session, burner wallet management    |
| poi-system       | `programs/poi-system/`       | POI interactions: rest, shop, forge, chest, etc.                  |
| map-generator    | `programs/map-generator/`    | Seeded map generation and tile data                               |
| player-inventory | `programs/player-inventory/` | Player items, gear, and inventory management                      |
| player-profile   | `programs/player-profile/`   | Player profile and progression                                    |

### Shared Crates

| Crate         | Path                    | Purpose                                    |
| ------------- | ----------------------- | ------------------------------------------ |
| combat-system | `crates/combat-system/` | Deterministic combat resolution logic      |
| boss-system   | `crates/boss-system/`   | Boss encounter definitions and mechanics   |
| field-enemies | `crates/field-enemies/` | Field enemy definitions and spawning logic |

**Important:** The programs repo has its own `CLAUDE.md` and `AGENTS.md` with detailed Anchor/Rust conventions. Consult those when making program changes.

### IDL Synchronization (CRITICAL)

**After ANY changes to Solana programs, the IDLs must be copied to the frontend.**

When you run `anchor build` in `../solana-programs`, it generates updated IDLs in `target/idl/`. These MUST be copied to `app/src/services/solana/idl/`:

```bash
cp ../solana-programs/target/idl/poi_system.json src/services/solana/idl/
cp ../solana-programs/target/idl/player_inventory.json src/services/solana/idl/
cp ../solana-programs/target/idl/gameplay_state.json src/services/solana/idl/
cp ../solana-programs/target/idl/session_manager.json src/services/solana/idl/
cp ../solana-programs/target/idl/map_generator.json src/services/solana/idl/
cp ../solana-programs/target/idl/player_profile.json src/services/solana/idl/
```

**Failure to sync IDLs will cause runtime errors** like `AccountOwnedByWrongProgram` because the frontend will pass incorrect accounts to on-chain instructions.

## Assets

- The assets tree is type-based (not screen-based).
- Use `assets.json` as the canonical index for asset paths and dimensions.
- Structure highlights:
  - `assets/branding/` (app icons, logo, splash)
  - `assets/ui/` (backgrounds, buttons, panels, frames, illustrations)
  - `assets/icons/` (items, itemsets, oils, stats, ui)
  - `assets/world/` (tiles, markers, pois)
  - `assets/entities/` (characters, enemies)

## Build, Test, and Development Commands

- `npm install`: install dependencies
- `npm start`: start Expo dev server
- `npm run android` / `npm run ios` / `npm run web`: run on device/emulator/web
- `npm run lint` / `npm run lint:fix`: lint code
- `npm run format`: format code with Prettier
- `npm run typecheck`: TypeScript type check
- `npm test` / `npm run test:watch` / `npm run test:coverage`: Jest tests

## Coding Conventions

- TypeScript only for app code (`.ts`, `.tsx`).
- Prettier: 2 spaces, single quotes, semicolons, print width 100.
- Use `@/` alias for `src/` imports.
- Test files: `*.test.ts`.

## Testing Guidelines

- Jest tests live in `__tests__/` and `src/`.
- Coverage targets `src/game/**/*.ts`.
- Add deterministic tests for game logic changes (fixed seeds).

## Commit/PR Notes

- Commit format: `feat(scope): ...`, `fix: ...`, `docs: ...`, `merge: ...`.
- Reference task IDs when relevant (e.g., `T134`).
- Update `specs/001-pve-dungeon-crawler/tasks.md` when completing planned tasks.
