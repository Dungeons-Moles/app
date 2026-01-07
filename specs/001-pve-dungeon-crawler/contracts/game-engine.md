# Game Engine Internal API Contract

**Feature**: 001-pve-dungeon-crawler
**Date**: 2026-01-07

This document defines the internal API contracts for the game engine module.

---

## GameEngine Module

### `initializeGame(seed: number): GameState`

Creates a new game state with the given seed.

**Input:**
- `seed: number` - RNG seed for deterministic generation

**Output:**
- `GameState` - Initial game state with:
  - Generated map
  - Player at spawn position
  - Week 1 boss selected
  - Time at Day 1, 50 moves
  - Empty inventory (4 slots)

**Guarantees:**
- Same seed always produces identical initial state
- Player spawn is adjacent to Mole Den
- Map is fully connected

---

### `gameReducer(state: GameState, action: GameAction): GameState`

Pure function that applies an action to produce new state.

**Input:**
- `state: GameState` - Current game state
- `action: GameAction` - Action to apply

**Output:**
- `GameState` - New state after action

**Actions:**

```typescript
type GameAction =
  | { type: 'MOVE'; direction: Direction }
  | { type: 'ENTER_COMBAT'; enemyId: string }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult }
  | { type: 'INTERACT_POI'; poiId: string }
  | { type: 'SELECT_POI_OPTION'; optionIndex: number }
  | { type: 'CLOSE_POI' }
  | { type: 'TRIGGER_BOSS' }
  | { type: 'END_GAME'; result: 'VICTORY' | 'DEFEAT' }
  | { type: 'RETURN_TO_MENU' };
```

**Guarantees:**
- Pure function: no side effects
- Invalid transitions throw error or return unchanged state
- State machine guards enforced

---

## Map Module

### `generateMap(params: MapParams): GameMap`

Generates a procedural map.

**Input:**
```typescript
interface MapParams {
  width: number;
  height: number;
  seed: number;
  week: 1 | 2 | 3;
}
```

**Output:**
- `GameMap` with tiles, fog, enemies, POIs, spawn point

**Guarantees:**
- Deterministic: same params = same map
- All tiles reachable from spawn
- Mole Den adjacent to spawn
- POI spacing rules enforced

---

### `updateFogOfWar(map: GameMap, position: Position, radius: number): GameMap`

Updates fog state based on player position and sight radius.

**Input:**
- `map: GameMap` - Current map
- `position: Position` - Player position
- `radius: number` - Sight radius (5 day, 3 night)

**Output:**
- `GameMap` - Map with updated fog state

**Guarantees:**
- Tiles within radius marked VISIBLE
- Previously VISIBLE tiles become REVEALED (never hidden again)
- Hidden tiles remain HIDDEN

---

### `canMoveTo(map: GameMap, from: Position, direction: Direction): boolean`

Checks if movement is valid.

**Input:**
- `map: GameMap` - Current map
- `from: Position` - Current position
- `direction: Direction` - Desired direction

**Output:**
- `boolean` - True if target tile is walkable

**Guarantees:**
- Returns false for walls
- Returns false for out-of-bounds
- Does not modify state

---

### `getMoveCost(map: GameMap, position: Position): number`

Gets time cost to enter a tile.

**Input:**
- `map: GameMap` - Current map
- `position: Position` - Target position

**Output:**
- `number` - Time units consumed (1 for Empty/Soft, 2 for Hard)

---

## Combat Module

### `createCombatState(player: Player, enemy: MapEnemy | BossDefinition): CombatState`

Creates initial combat state from player and enemy.

**Input:**
- `player: Player` - Player entity
- `enemy: MapEnemy | BossDefinition` - Enemy to fight

**Output:**
- `CombatState` - Initial combat state with snapshots

**Guarantees:**
- Player stats include all item bonuses
- Active itemset bonuses applied
- Status effects initialized to 0

---

### `resolveCombat(state: CombatState, rng: SeededRNG): CombatResult`

Resolves combat to completion.

**Input:**
- `state: CombatState` - Initial combat state
- `rng: SeededRNG` - Seeded RNG for any random effects

**Output:**
```typescript
interface CombatResult {
  outcome: 'VICTORY' | 'DEFEAT';
  finalState: CombatState;
  log: CombatLogEntry[];
  turns: number;
  rewards?: CombatRewards;
}
```

**Guarantees:**
- Deterministic: same state + same RNG seed = same result
- Combat log capped at 100 entries
- All effects executed in correct timing order

---

### `calculateDamage(attacker: CombatantState, target: CombatantState, context: DamageContext): DamageResult`

Pure damage calculation.

**Input:**
- `attacker: CombatantState` - Attacking combatant
- `target: CombatantState` - Target combatant
- `context: DamageContext` - Additional context (ignores armor, etc.)

**Output:**
```typescript
interface DamageResult {
  rawDamage: number;
  armorReduction: number;
  finalDamage: number;
  chillApplied: boolean;
  shrapnelReflect: number;
}
```

**Guarantees:**
- Pure function
- Minimum 0 damage to HP
- Chill halves ATK (rounded down)
- Shrapnel reflects correct amount

---

## Time Module

### `consumeMove(state: TimeState, cost: number): TimeState`

Consumes time for a move.

**Input:**
- `state: TimeState` - Current time state
- `cost: number` - Move cost (1 or 2)

**Output:**
- `TimeState` - Updated time state

**Guarantees:**
- Transitions to Night when Day moves depleted
- Transitions to next Day when Night moves depleted
- Triggers boss flag when Night 3 depletes

---

### `advanceToNextDay(state: TimeState): TimeState`

Skips to next Day (for Mole Den / Rest Alcove).

**Input:**
- `state: TimeState` - Current time state (must be Night)

**Output:**
- `TimeState` - State at start of next Day

**Guarantees:**
- Only works during Night
- Full move refresh
- Increments cycle counter

---

### `selectWeekBoss(week: 1 | 2 | 3, rng: SeededRNG): BossId`

Selects boss for the week.

**Input:**
- `week: 1 | 2 | 3` - Week number
- `rng: SeededRNG` - Seeded RNG

**Output:**
- `BossId` - Selected boss ID

**Guarantees:**
- Week 1: Random from [BROODMOTHER, OBSIDIAN_GOLEM, GAS_ANOMALY, MAD_MINER]
- Week 2: Random from [DRILL_SERGEANT, CRYSTAL_MIMIC]
- Week 3: Always ELDRITCH_MOLE

---

## Input Module

### `InputHandler.subscribe(callback: InputCallback): Unsubscribe`

Subscribes to input events.

**Input:**
- `callback: (event: InputEvent) => void` - Handler function

**Output:**
- `() => void` - Unsubscribe function

**Guarantees:**
- Callback called for every input event
- Debounced (100ms default)
- Cleanup on unsubscribe

---

### `InputHandler.emit(event: InputEvent): void`

Emits an input event.

**Input:**
- `event: InputEvent` - Input event to emit

**Guarantees:**
- Debouncing applied
- All subscribers notified

---

## RNG Module

### `SeededRNG.constructor(seed: number)`

Creates a seeded RNG.

**Input:**
- `seed: number` - Initial seed value

**Guarantees:**
- Same seed always produces same sequence

---

### `SeededRNG.next(): number`

Gets next random value.

**Output:**
- `number` - Value in range [0, 1)

---

### `SeededRNG.nextInt(min: number, max: number): number`

Gets random integer in range.

**Input:**
- `min: number` - Minimum (inclusive)
- `max: number` - Maximum (inclusive)

**Output:**
- `number` - Integer in [min, max]

---

### `SeededRNG.pick<T>(array: T[]): T`

Picks random element from array.

**Input:**
- `array: T[]` - Non-empty array

**Output:**
- `T` - Random element

---

### `SeededRNG.shuffle<T>(array: T[]): T[]`

Shuffles array (Fisher-Yates).

**Input:**
- `array: T[]` - Array to shuffle

**Output:**
- `T[]` - New shuffled array (original unchanged)

---

### `SeededRNG.getState(): number`

Gets current RNG state for saving/verification.

**Output:**
- `number` - Current state

---

### `SeededRNG.setState(state: number): void`

Restores RNG state.

**Input:**
- `state: number` - State to restore
