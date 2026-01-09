# Dungeons & Moles - Gemini Context

## Project Overview
**Dungeons & Moles** is a PvE dungeon crawler built with **React Native**, **Expo**, and **Solana Mobile Stack**. It features a "He Is Coming" inspired loop: exploration, auto-battler combat, and week-based progression.

**Tech Stack:**
-   **Framework:** React Native + Expo (SDK 54)
-   **Rendering:** React Native Skia (Game Canvas)
-   **State:** React Context + Custom State Machine
-   **Language:** TypeScript
-   **Testing:** Jest + Testing Library

## Game Mechanics (The "Business Logic")
The game is deterministic and strictly specified in `specs/001-pve-dungeon-crawler/spec.md`.

### 1. Core Loop
-   **Week Structure:** 3 Cycles of (Day → Night) → Boss Fight.
-   **Day Phase:** 50 moves. Sight radius 5.
-   **Night Phase:** 30 moves. Sight radius 3. Enemies move towards player.
-   **Boss Fight:** Auto-triggered after Night 3.
-   **Victory/Defeat:** Player wins by defeating Week 3 boss. Player loses if HP reaches 0.

### 2. Exploration
-   **Map:** Procedurally generated corridors (no open rooms).
-   **Movement:** D-Pad only. 1 move = 1 time unit (Hard Rock = 2).
-   **POIs:** Interactable spots (Mole Den, Supply Cache, Shops).

### 3. Combat (Auto-Battler)
-   **Trigger:** Stepping on an enemy.
-   **Flow:** Battle Start effects → Turn loop (Speed check → Attack → End Turn).
-   **Damage Formula:** `ATK - ARM = DMG` (min 0).
-   **Status Effects:**
    -   **Chill:** Halves ATK. Decays 1/turn.
    -   **Shrapnel:** Thorns damage when struck. Clears at turn end.
    -   **Rust:** Reduces Armor at turn end.
-   **Determinism:** Same seed + same state = identical combat outcome.

### 4. Items & Progression
-   **Tools:** 1 Weapon slot (e.g., Pickaxe, Drill).
-   **Gear:** Grid inventory. Stats stack.
-   **Itemsets:** Bonus effects when specific items are combined.

## Architecture

### State Management
The game uses a **finite state machine** defined in `src/game/engine/state-machine.ts`.
-   **`GamePhase`**: `EXPLORATION` ↔ `COMBAT` / `POI_INTERACTION` / `BOSS_FIGHT`.
-   **`GameState`**: The single source of truth containing `Player`, `Map`, `Time`, and `Combat` states.

### Directory Structure
-   **`src/game/`**: Pure game logic (engine, entities, combat calculator). **No UI code.**
    -   `engine/`: State machine, reducer, RNG.
    -   `combat/`: Damage formulas, resolver.
    -   `entities/`: Definitions for Players, Enemies, Items.
-   **`src/components/game/`**: UI components that render game state (StatsPanel, Inventory).
-   **`src/screens/`**: High-level screens (`GameScreen` hosts the canvas).

## Development Workflow

### Key Commands
-   **Start Dev Server:** `npm start`
-   **Run on Android:** `npm run android` (Required for Wallet/Skia testing)
-   **Run Tests:** `npm test` (Jest)
-   **Lint/Format:** `npm run lint`, `npm run format`

### Conventions
-   **Files:** `src/` uses `@/` alias.
-   **Testing:** Unit tests in `__tests__/unit` mirror `src/` structure.
-   **Styling:** Tailwind-like or StyleSheet.
-   **Commits:** `feat(scope): ...`, `fix: ...`

## Critical Documentation
-   **`specs/001-pve-dungeon-crawler/spec.md`**: The Bible. If code contradicts spec, code is wrong.
-   **`AGENTS.md`**: Instructions for AI agents.
