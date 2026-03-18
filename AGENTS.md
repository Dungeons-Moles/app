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

## Session & Signing Rules (MANDATORY)

These rules are non-negotiable. All code — programs and frontend — must follow them strictly. If existing code violates these rules, it must be refactored.

### Rule 1: One wallet signature per session entry

The player's wallet signs **exactly one transaction** to enter a game session. Every other in-session transaction (movement, combat, POI interaction, session closure) is signed by the **session key** in the background — no wallet popups.

The only exception is **abandon session**, which requires the wallet signature as a safety measure.

**Implication:** Any instruction that runs during a session (start to end) must accept the session signer, not the player wallet. Entry fees, echo draws, and any other setup must be bundled into the single entry transaction or handled by session-key-authorized instructions.

### Rule 2: All in-session gameplay happens on the Ephemeral Rollup

Everything between delegation and undelegation runs on the ER via session keys. No base-layer transactions during active gameplay.

Base-layer wallet transactions are only for **out-of-session** actions:
- Starting/entering a session (the single wallet-signed entry tx)
- Equipping skins
- Buying sessions / top-ups
- Marketplace trades (list, buy, cancel)
- Managing the item pool

**Implication:** Settlement, point crediting, echo insertion, and any other post-game bookkeeping that touches global/shared accounts must either (a) be deferred to session end and signed by the session key, or (b) be handled by a PDA authority so the session key can invoke it via CPI. Never require the player wallet mid-session or at session teardown.

### Rule 3: All VRF must be on the Ephemeral Rollup (MANDATORY)

This rule is non-negotiable for both frontend and programs.

- **Localnet:** use the same `*Vrf` methods as other clusters, backed by a local VRF oracle/queue when testing locally.
- **Devnet/Mainnet:** It is forbidden to use client-generated randomness for gameplay/session-critical randomness. Use `*Vrf` methods only.
- **VRF oracle queue:** All VRF requests must use the ER oracle queue (`VRF_EPHEMERAL_QUEUE`). Never use the base-layer `DEFAULT_QUEUE`.
- **VRF timing:** `request_*_vrf` MUST run on the Ephemeral Rollup **after** delegation, via `sendRoutedErTransaction`. `init_*_vrf_state` may be pre-created on base before delegation when the flow needs the PDA to exist ahead of ER requests.
- **Gameplay gate:** A session may be created on-chain before VRF completes, but gameplay must remain blocked until required VRF states are fulfilled on ER.
- **Frontend behavior:** If VRF is not fulfilled, the app must not navigate to `src/screens/GameScreen.tsx` for active gameplay and must retry/fetch/request until fulfilled or surface a blocking error.
- **Movement/POI gate:** The frontend must not send gameplay actions (movement/POI progression) that rely on VRF when VRF fulfillment is missing.

### Rule 4: No offline mode fallback for on-chain sessions (MANDATORY)

When a player is connected (non-guest mode), the frontend must NEVER fall back to "offline mode" or use locally generated seeds (`getVrfSeed()`, `getLocalSecureSeed()`, `Math.random()`, `Date.now()`) to start gameplay. If the on-chain session creation or delegation fails, the frontend must either:
- **Retry** the on-chain operation, or
- **Show an error** and block the user from proceeding.

It must NEVER silently start the game with a local seed and pretend the session is active. The `START_GAME` reducer dispatch with a locally generated seed is only valid in **guest mode**.

`getVrfSeed()` / `getLocalSecureSeed()` are for guest mode only — they generate non-VRF local randomness. On-chain sessions must use VRF seeds from the chain.

### On-Chain Instruction Map

| Action            | Program         | Instruction                                       | Notes                                                                             |
| ----------------- | --------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Move              | gameplay-state  | `move_player`                                     | Handles movement, wall dig, enemy combat, night enemy movement, phase transitions |
| Boss fight        | gameplay-state  | `trigger_boss_fight`                              | Resolves boss combat inline                                                       |
| Heal (POI)        | gameplay-state  | `heal_player`                                     | Called via CPI from poi-system                                                    |
| Modify gold (POI) | gameplay-state  | `modify_gold_authorized`                          | Called via CPI from poi-system                                                    |
| POI interactions  | poi-system      | 15 instructions (rest, pick_item, tool_oil, etc.) | Each POI type has its own instruction                                             |
| Start session     | session-manager | `start_session`                                   | Creates session + derived accounts                                                |
| End session       | session-manager | `end_session`                                     | Closes session + derived accounts                                                 |

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
| session-manager  | `programs/session-manager/`  | Session lifecycle: start/end session, sessionSigner wallet management    |
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

## Core Loop Integration (007)

The core loop integration feature (specs/007-core-loop-integration/) adds:

### Screens

- `DeathScreen` - Run summary after player death
- `VictoryScreen` - Level completion with unlock animations
- `RunPurchaseScreen` - Purchase runs (20 for 0.001 SOL)

### Components

- `src/components/combat/` - CombatLayout (shared PvE/PvP), CombatArena (Skia + web), EnemyPanel, PlayerPanel, SpeedControls, VictoryDefeatDisplay
- `src/components/ui/` - ControllerHints (button hint bar), FocusGlow (selection highlight), ControllerKeyboard (on-screen keyboard)
- `src/components/session/` - SessionCard for multi-session display
- `src/components/items/` - ItemCard, ItemGrid, UnlockAnimation

### Hooks

- `useSessionList` - Multi-session management (fetch, switch, abandon)
- `useCombatReplay` - Combat event parsing and replay
- `useNightMovement` - Enemy movement during night phase
- `usePoiInteraction` - POI interaction handling
- `useControllerAction` - Gamepad/controller button action mapping
- `useInputMode` - Detects controller vs touch input mode (has `.web.ts` variant)

### Services

- `src/services/solana/sessionList.ts` - Session list fetching and switching
- `src/services/solana/sessionBundle.ts` - Session creation with sessionSigner wallet
- `src/services/solana/eventParser.ts` - Combat event parsing from transaction logs

### Navigation Routes

- Death, Victory, RunPurchase screens added to navigation
- Route params include combat replay data, level info, and unlock data

### Time/Phase System

- 3 weeks per level, each with Day 1-3 and Night 1-3 phases
- Boss fight triggers at end of Night 3 for each week
- Phase labels utility in `src/utils/phase-labels.ts`

## Controller / Gamepad Support

All screens support gamepad navigation via `psg1-sim`. Key patterns:

- `useInputMode()` returns `'controller'` or `'touch'` — used to show/hide controller hints and button-based navigation
- `useControllerAction({ onA, onB, onDPadLeft, ... }, enabled)` — maps controller buttons to screen actions
- `ControllerHints` renders a bar of button icon + label pairs at the bottom of the screen
- `FocusGlow` wraps focusable elements to show a glow when selected in controller mode
- Platform-specific files: `useInputMode.ts` (native) and `useInputMode.web.ts` (web/simulator)
- Controller button icons live in `assets/ui/control-buttons/`

## Screen Variants

- `useScreenVariant()` returns `'compact'` (simulator/TV, ~1240×1080) or `'wide'` (mobile landscape)
- Common pattern: `const isCompact = useScreenVariant() === 'compact'; const scale = isCompact ? 2 : 1;`
- Both `.tsx` and `.web.tsx` variants exist for components using Skia (native) vs plain RN (web)

## Active Technologies

- TypeScript 5.9.2 (React Native / Expo 54.0) + @solana/web3.js 1.98.4, @coral-xyz/anchor 0.32.1, React Native 0.81.5, Shopify React Native Skia
- psg1-sim (console simulator shell with gamepad input)
- AsyncStorage (profile cache), Expo SecureStore (sessionSigner wallet keys)
