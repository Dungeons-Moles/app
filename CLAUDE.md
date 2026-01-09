# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dungeons & Moles is a React Native + Expo roguelike dungeon crawler mobile game with Solana wallet integration. The game features deterministic combat, procedural map generation, and a Day/Night/Week time cycle.

## Commands

```bash
# Development
npm install          # Install dependencies
npm start            # Start Expo dev server
npm run android      # Run on Android device/emulator
npm run ios          # Run on iOS device/simulator
npm run web          # Run in web browser

# Quality
npm run lint         # Run ESLint
npm run lint:fix     # Run ESLint with auto-fix
npm run format       # Format src/ with Prettier
npm run typecheck    # TypeScript type checking

# Testing
npm test                                    # Run all tests
npm test -- --watch                         # Watch mode
npm test -- __tests__/unit/combat/          # Run specific test directory
npm test -- path/to/file.test.ts            # Run single test file
npm test -- --coverage                      # With coverage report
```

## Architecture

### State Management Pattern

The game uses a reducer-based architecture with a clear separation between pure game logic and React:

- **`src/game/engine/game-reducer.ts`**: Central pure reducer that handles all game state transitions via typed `GameAction` discriminated union
- **`src/contexts/GameContext.tsx`**: React wrapper that delegates core actions to the pure reducer and handles context-specific actions (debug toggles, etc.)
- **`src/game/engine/types.ts`**: Root `GameState` interface and all core types

### Game State Machine

Defined in `src/game/engine/state-machine.ts`. Valid phase transitions:
- MainMenu → Exploration
- Exploration → Combat, POIInteraction, BossFight
- Combat → Exploration, Defeat
- POIInteraction → Exploration
- BossFight → Exploration, Victory, Defeat
- Victory/Defeat → MainMenu

### Determinism Requirements

All game logic in `src/game/` MUST be deterministic for replay/debugging:
- Use `SeededRNG` from `src/game/engine/rng.ts` instead of `Math.random()`
- No `Date.now()` in game logic
- Avoid object key iteration order issues (use arrays or sorted keys)

### Directory Structure

```
src/
├── game/           # Pure game logic (no React dependencies)
│   ├── engine/     # State management, reducer, RNG, state machine
│   ├── combat/     # Combat resolution, damage calculation, status effects
│   ├── map/        # Procedural map generation, fog of war, pathfinding
│   ├── entities/   # Player, items, POIs, bosses logic
│   ├── time/       # Day/Night/Week cycle progression
│   └── input/      # Direction types and input handling
├── data/           # Static data definitions (gear, itemsets, POIs, bosses)
├── screens/        # React Native screen components
├── components/     # UI components (game/, combat/)
├── contexts/       # React contexts (Game, Profile, Wallet, Combat)
├── hooks/          # Custom hooks (useInput, useOrientationLock)
└── navigation/     # React Navigation setup
```

### Key Subsystems

**Combat**: Auto-resolving turn-based system in `src/game/combat/`. Uses `CombatState` with phases (BattleStart → TurnStart → Attacks → TurnEnd → BattleEnd). Status effects: Chill, Shrapnel, Rust.

**Map**: Procedural generation in `src/game/map/generator.ts`. Tiles (Floor, Wall, Gravel, Water), fog of war, enemy spawning, POI placement.

**Time**: 3 weeks, each with 3 cycles of Day (50 moves) + Night (25 moves). Boss fight triggers after Night 3 each week.

**Rendering**: Uses `@shopify/react-native-skia` for the game canvas in `src/game/GameCanvas.tsx`.

### Import Alias

Use `@/` for `src/` imports (configured in `tsconfig.json`):
```typescript
import { GameState } from '@/game/engine/types';
```

## Testing

- Tests in `__tests__/` (unit and integration subdirs) and `src/`
- Files must be named `*.test.ts`
- Coverage collected from `src/game/**/*.ts`
- Game logic tests should verify determinism with fixed seeds

## Coding Conventions

- TypeScript strict mode
- 2-space indentation, single quotes, semicolons (Prettier)
- Commit messages: `feat(scope):`, `fix:`, `docs:`, `merge:`
- Reference task IDs in commits when relevant (e.g., T134)

## Spec Files

Product specifications live in `specs/001-pve-dungeon-crawler/`:
- `spec.md`: Feature specification
- `plan.md`: Implementation plan
- `tasks.md`: Task tracking (update when completing tasks)
- `research.md`: Technical decisions
- `quickstart.md`: Development guide

## Active Technologies
- TypeScript 5.x (strict mode) + React Native, Expo, @shopify/react-native-skia (canvas rendering) (002-qol-balance-batch)
- In-memory game state (no persistence for this feature set) (002-qol-balance-batch)

## Recent Changes
- 002-qol-balance-batch: Added TypeScript 5.x (strict mode) + React Native, Expo, @shopify/react-native-skia (canvas rendering)
