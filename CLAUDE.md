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

## Core Loop Integration (007)

The core loop integration feature (specs/007-core-loop-integration/) adds:

### Screens
- `DeathScreen` - Run summary after player death
- `VictoryScreen` - Level completion with unlock animations
- `RunPurchaseScreen` - Purchase runs (20 for 0.001 SOL)

### Components
- `src/components/combat/` - CombatOverlay, BossIntro, TurnDisplay
- `src/components/session/` - SessionCard for multi-session display
- `src/components/items/` - ItemCard, ItemGrid, UnlockAnimation

### Hooks
- `useSessionList` - Multi-session management (fetch, switch, abandon)
- `useCombatReplay` - Combat event parsing and replay
- `useNightMovement` - Enemy movement during night phase
- `usePoiInteraction` - POI interaction handling

### Services
- `src/services/solana/sessionList.ts` - Session list fetching and switching
- `src/services/solana/sessionBundle.ts` - Session creation with burner wallet
- `src/services/solana/eventParser.ts` - Combat event parsing from transaction logs

### Navigation Routes
- Death, Victory, RunPurchase screens added to navigation
- Route params include combat replay data, level info, and unlock data

### Time/Phase System
- 3 weeks per level, each with Day 1-3 and Night 1-3 phases
- Boss fight triggers at end of Night 3 for each week
- Phase labels utility in `src/utils/phase-labels.ts`
