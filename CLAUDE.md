# Dungeons & Moles - Coding Agent Guide

This repository hosts the React Native + Expo codebase for Dungeons & Moles, a PvE roguelike dungeon crawler with deterministic gameplay, auto-battler combat, and a Day/Night/Week loop. Use this guide to keep changes consistent with the game design and engine constraints.

## Project Overview

- **Game loop:** Explore a seeded map, fight auto-resolving combat, use POIs for upgrades, and clear week bosses.
- **Determinism:** `src/game/` logic must be deterministic for replay/debugging.
- **Specs:** Product specs live in `specs/001-pve-dungeon-crawler/` and design detail is summarized in `specs/gdd.md`.

## Architecture & Data Flow

- **Pure logic vs UI:** `src/game/` contains pure logic (no React). UI lives in `src/components/` and `src/screens/`.
- **State machine:** `src/game/engine/state-machine.ts` defines phase transitions (Exploration, Combat, POI, Boss, Victory/Defeat).
- **Reducer:** `src/game/engine/game-reducer.ts` manages local game state but must defer to on-chain state as the source of truth.
- **RNG:** Use `SeededRNG` from `src/game/engine/rng.ts`; avoid `Math.random()` and `Date.now()` in game logic.

## CRITICAL: On-Chain-First Principle

**This is a fully on-chain game. Nothing happens in the frontend unless it is first confirmed on-chain.**

- **Movement:** The player cannot move on the map unless the `move_player` Solana instruction succeeds. The local reducer must NOT advance the player position, deduct moves, or trigger any side effects until the on-chain transaction is confirmed.
- **Combat:** The `move_player` on-chain instruction handles enemy combat inline (no separate CPI). Combat is resolved deterministically on-chain. The frontend must read combat results from on-chain state/events, not resolve combat locally.
- **Wall breaking:** Handled by `move_player` on-chain — the instruction calculates dig cost (`max(2, 6 - DIG)`) and deducts moves. The frontend must not independently compute wall break results.
- **POI interactions:** Each POI type has a dedicated on-chain instruction in the `poi-system` program. The frontend must wait for transaction confirmation before updating local state.
- **Phase/time progression:** Day/Night/Week transitions happen on-chain when `move_player` exhausts remaining moves. The frontend must reflect on-chain phase state, not compute transitions locally.
- **Boss fights:** The `trigger_boss_fight` instruction resolves boss combat on-chain. The frontend must not resolve boss fights locally.

**Pattern: On-chain instruction → Confirm → Fetch confirmed state → Update local UI**

If the on-chain transaction fails, the local state must NOT change. No optimistic updates that persist on failure. The on-chain programs (`gameplay-state`, `combat-system`, `poi-system`, `session-manager`, `map-generator`, `player-inventory`, `field-enemies`) are the single source of truth.

### On-Chain Instruction Map

| Action | Program | Instruction | Notes |
|--------|---------|-------------|-------|
| Move | gameplay-state | `move_player` | Handles movement, wall dig, enemy combat, night enemy movement, phase transitions |
| Boss fight | gameplay-state | `trigger_boss_fight` | Resolves boss combat inline |
| Heal (POI) | gameplay-state | `heal_player` | Called via CPI from poi-system |
| Modify gold (POI) | gameplay-state | `modify_gold_authorized` | Called via CPI from poi-system |
| POI interactions | poi-system | 15 instructions (rest, pick_item, tool_oil, etc.) | Each POI type has its own instruction |
| Start session | session-manager | `start_session` | Creates session + derived accounts |
| End session | session-manager | `end_session` | Closes session + derived accounts |

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

## Active Technologies
- TypeScript 5.9.2 (React Native / Expo 54.0) + @solana/web3.js 1.98.4, @coral-xyz/anchor 0.32.1, React Native 0.81.5, Shopify React Native Skia (008-solana-program-instructions)
- AsyncStorage (profile cache), Expo SecureStore (burner wallet keys) (008-solana-program-instructions)

## Recent Changes
- 008-solana-program-instructions: Added TypeScript 5.9.2 (React Native / Expo 54.0) + @solana/web3.js 1.98.4, @coral-xyz/anchor 0.32.1, React Native 0.81.5, Shopify React Native Skia
