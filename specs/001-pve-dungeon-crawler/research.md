# Research: PvE Dungeon Crawler Prototype

**Feature**: 001-pve-dungeon-crawler
**Date**: 2026-01-07
**Status**: Complete

---

## R1: Procedural Map Generation

### Problem Statement

Generate corridor-based dungeon maps that are:
- Fully connected (all tiles reachable)
- Deterministic (same seed = same map)
- Corridor-only (no open rooms per spec FR-039)
- Support three tile types with different move costs

### Approaches Evaluated

#### Option 1: Recursive Backtracker Maze (Selected)

**How it works**:
1. Start with grid of walls
2. Pick starting cell, mark as passage
3. While unvisited cells remain:
   - If current cell has unvisited neighbors:
     - Pick random unvisited neighbor (using seeded RNG)
     - Remove wall between current and neighbor
     - Push current to stack, move to neighbor
   - Else pop from stack (backtrack)

**Pros**:
- Guaranteed full connectivity
- Natural corridor layouts
- Simple to implement
- Perfectly deterministic with seeded RNG
- Low memory (just stack + grid)

**Cons**:
- Can produce long dead-ends
- Uniform passage width (1 tile)

**Verdict**: Best fit for spec requirements

#### Option 2: Drunkard's Walk / Random Walk

**How it works**:
1. Start at center
2. Walk randomly, carving passages
3. Stop after N steps or coverage %

**Pros**:
- Organic, cave-like feel
- Variable passage widths

**Cons**:
- Can create open spaces (violates FR-039)
- Not guaranteed connectivity
- Harder to control density

**Verdict**: Rejected - produces open spaces

#### Option 3: BSP (Binary Space Partitioning)

**How it works**:
1. Recursively divide space into regions
2. Place rooms in leaf nodes
3. Connect rooms with corridors

**Pros**:
- Good room distribution
- Controllable room sizes

**Cons**:
- Room-based, not corridor-only (violates FR-039)
- More complex to implement

**Verdict**: Rejected - room-based design

#### Option 4: Wave Function Collapse

**How it works**:
1. Define tile adjacency rules
2. Start with all possibilities
3. Collapse lowest-entropy cell
4. Propagate constraints

**Pros**:
- Highly customizable patterns
- Can enforce complex rules

**Cons**:
- Complex implementation
- Harder to guarantee determinism across platforms
- Can fail to find valid solution
- Overkill for corridor-only maps

**Verdict**: Rejected - over-engineered

### Selected Approach: Recursive Backtracker + Tile Assignment

```typescript
interface MapGenerationParams {
  width: number;
  height: number;
  seed: number;
}

function generateMap(params: MapGenerationParams): TileMap {
  const rng = new SeededRNG(params.seed);

  // Step 1: Generate maze skeleton
  const maze = generateMazeSkeleton(params.width, params.height, rng);

  // Step 2: Assign tile types to passages
  const tiles = assignTileTypes(maze, rng);

  // Step 3: Find spawn point and place Mole Den
  const spawn = findSpawnPoint(tiles, rng);
  const moleDenPos = placeMoleDen(spawn, tiles);

  // Step 4: Place POIs according to density rules
  const pois = placePOIs(tiles, rng);

  // Step 5: Place enemies on valid tiles
  const enemies = placeEnemies(tiles, pois, rng);

  return { tiles, spawn, pois, enemies, moleDenPos };
}
```

### Tile Type Distribution

Per spec, three walkable tile types with different time costs:

| Tile Type | Time Cost | Distribution |
|-----------|-----------|--------------|
| Empty Tunnel | 1 | 50% |
| Soft Earth | 1 | 35% |
| Hard Rock | 2 | 15% |

```typescript
function assignTileType(rng: SeededRNG): TileType {
  const roll = rng.next(); // 0-1
  if (roll < 0.50) return TileType.EmptyTunnel;
  if (roll < 0.85) return TileType.SoftEarth;
  return TileType.HardRock;
}
```

### POI Placement Rules

From spec:
- Same POI type not within ~10 tiles of itself
- Density: Common > Uncommon > Rare
- Mole Den always adjacent to spawn

```typescript
const POI_DENSITY = {
  Common: 0.08,    // 8% of walkable tiles
  Uncommon: 0.04,  // 4% of walkable tiles
  Rare: 0.02       // 2% of walkable tiles
};

const POI_MIN_SPACING = 10; // tiles between same type
```

---

## R2: Combat Resolution System

### Problem Statement

Combat must be:
- Fully automatic (no player input)
- Deterministic (same inputs = same outputs)
- Support complex interactions (traits, items, itemsets, statuses)
- Produce structured combat log

### Combat Flow Design

```
┌─────────────────┐
│  Battle Start   │ Execute Battle Start effects
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Turn Start     │ Execute Turn Start effects
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Determine Order │ Higher SPEED attacks first
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Execute Attack  │ Calculate damage, apply
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check Death    │ If HP <= 0, end combat
└────────┬────────┘
         │ (both alive)
         ▼
┌─────────────────┐
│ Counter Attack  │ Other combatant attacks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Turn End      │ Apply end-of-turn effects
└────────┬────────┘
         │ (both alive)
         ▼
      Loop to Turn Start
```

### Damage Calculation

```typescript
interface DamageCalculation {
  baseAtk: number;
  atkAfterChill: number;
  armorReduction: number;
  finalDamage: number;
  shrapnelReflect: number;
}

function calculateDamage(
  attacker: Combatant,
  target: Combatant,
  ignoresArmor: boolean
): DamageCalculation {
  // Base ATK
  let atk = attacker.stats.ATK + attacker.bonusATK;

  // Apply Chill (halves ATK)
  if (attacker.statusEffects.chill > 0) {
    atk = Math.floor(atk / 2);
  }

  // Armor reduction
  let armorReduction = 0;
  if (!ignoresArmor) {
    armorReduction = Math.min(target.stats.ARM, atk);
  }

  const hpDamage = Math.max(0, atk - armorReduction);

  // Shrapnel reflect
  const shrapnelReflect = target.statusEffects.shrapnel;

  return {
    baseAtk: attacker.stats.ATK + attacker.bonusATK,
    atkAfterChill: atk,
    armorReduction,
    finalDamage: hpDamage,
    shrapnelReflect
  };
}
```

### Effect Timing System

Effects trigger at specific timings. Implementation uses a simple dispatcher:

```typescript
type EffectTiming =
  | 'BATTLE_START'
  | 'TURN_START'
  | 'ON_HIT'
  | 'ON_STRUCK'
  | 'ON_WOUNDED'
  | 'ON_EXPOSED'
  | 'TURN_END';

function dispatchEffects(
  timing: EffectTiming,
  state: CombatState,
  context: EffectContext
): CombatState {
  // Collect all effects that trigger at this timing
  const effects = collectEffectsForTiming(timing, state);

  // Execute in order (items, then enemy traits, then itemsets)
  for (const effect of effects) {
    state = executeEffect(effect, state, context);
    state = logEffect(state, effect);
  }

  return state;
}
```

### Combat Log Structure

Per constitution P13, structured combat log:

```typescript
interface CombatLogEntry {
  turn: number;
  timing: EffectTiming;
  actor: 'player' | 'enemy';
  action: string;           // e.g., "ATTACK", "APPLY_STATUS", "TRIGGER_TRAIT"
  target: 'player' | 'enemy';
  result: {
    damage?: number;
    healing?: number;
    armorChange?: number;
    statusApplied?: StatusEffect;
    statusRemoved?: StatusEffect;
  };
  rngValues: number[];      // RNG values used for this action
}

const MAX_COMBAT_LOG_ENTRIES = 100;
```

---

## R3: Seeded Random Number Generator

### Problem Statement

All randomness must be reproducible given the same seed. Standard Math.random() is not seeded.

### Selected Approach: Mulberry32

Mulberry32 is a simple, fast, seeded PRNG with good statistical properties:

```typescript
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // Convert to unsigned 32-bit
  }

  next(): number {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Save/restore state for determinism verification
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}
```

### Determinism Verification

Test that same seed produces same sequence:

```typescript
test('RNG determinism', () => {
  const seed = 12345;
  const rng1 = new SeededRNG(seed);
  const rng2 = new SeededRNG(seed);

  for (let i = 0; i < 1000; i++) {
    expect(rng1.next()).toBe(rng2.next());
  }
});

test('Combat determinism', () => {
  const seed = 12345;
  const initialState = createCombatState(player, enemy);

  const result1 = resolveCombat(initialState, new SeededRNG(seed));
  const result2 = resolveCombat(initialState, new SeededRNG(seed));

  expect(result1).toEqual(result2);
});
```

---

## R4: State Machine Implementation

### Problem Statement

Game phases must use explicit state machines per constitution P01. No implicit state via boolean flags.

### Selected Approach: Reducer with Typed Actions

Using TypeScript discriminated unions for type-safe transitions:

```typescript
enum GamePhase {
  MainMenu = 'MAIN_MENU',
  Exploration = 'EXPLORATION',
  POIInteraction = 'POI_INTERACTION',
  Combat = 'COMBAT',
  BossFight = 'BOSS_FIGHT',
  Victory = 'VICTORY',
  Defeat = 'DEFEAT'
}

// Valid transitions encoded as type
type PhaseTransition = {
  [GamePhase.MainMenu]: GamePhase.Exploration;
  [GamePhase.Exploration]:
    | GamePhase.Combat
    | GamePhase.POIInteraction
    | GamePhase.BossFight;
  [GamePhase.POIInteraction]: GamePhase.Exploration;
  [GamePhase.Combat]:
    | GamePhase.Exploration
    | GamePhase.Defeat;
  [GamePhase.BossFight]:
    | GamePhase.Exploration
    | GamePhase.Victory
    | GamePhase.Defeat;
  [GamePhase.Victory]: GamePhase.MainMenu;
  [GamePhase.Defeat]: GamePhase.MainMenu;
};

function isValidTransition(from: GamePhase, to: GamePhase): boolean {
  const validTransitions: Record<GamePhase, GamePhase[]> = {
    [GamePhase.MainMenu]: [GamePhase.Exploration],
    [GamePhase.Exploration]: [GamePhase.Combat, GamePhase.POIInteraction, GamePhase.BossFight],
    [GamePhase.POIInteraction]: [GamePhase.Exploration],
    [GamePhase.Combat]: [GamePhase.Exploration, GamePhase.Defeat],
    [GamePhase.BossFight]: [GamePhase.Exploration, GamePhase.Victory, GamePhase.Defeat],
    [GamePhase.Victory]: [GamePhase.MainMenu],
    [GamePhase.Defeat]: [GamePhase.MainMenu],
  };

  return validTransitions[from].includes(to);
}
```

### Transition Guards

Guards prevent invalid state changes:

```typescript
function canEnterCombat(state: GameState): boolean {
  return (
    state.phase === GamePhase.Exploration &&
    state.player.hp > 0
  );
}

function canTriggerBoss(state: GameState): boolean {
  return (
    state.phase === GamePhase.Exploration &&
    state.time.phase === TimePhase.Night &&
    state.time.cycle === 3 &&
    state.time.movesRemaining === 0
  );
}
```

---

## R5: Performance Optimization

### Problem Statement

Maintain 60 FPS on Solana Seeker (mobile) during exploration and combat.

### Skia Rendering Strategy

#### Viewport Culling

Only render tiles visible on screen plus buffer:

```typescript
const BUFFER_TILES = 2;

function getVisibleTiles(
  cameraPos: Position,
  viewportSize: Size,
  tileSize: number
): TileRange {
  const tilesX = Math.ceil(viewportSize.width / tileSize) + BUFFER_TILES * 2;
  const tilesY = Math.ceil(viewportSize.height / tileSize) + BUFFER_TILES * 2;

  return {
    startX: cameraPos.x - Math.floor(tilesX / 2),
    endX: cameraPos.x + Math.ceil(tilesX / 2),
    startY: cameraPos.y - Math.floor(tilesY / 2),
    endY: cameraPos.y + Math.ceil(tilesY / 2)
  };
}
```

#### Sprite Caching

Pre-render tile sprites once:

```typescript
const tileSprites = useMemo(() => {
  return {
    [TileType.Wall]: createWallSprite(),
    [TileType.EmptyTunnel]: createEmptySprite(),
    [TileType.SoftEarth]: createSoftEarthSprite(),
    [TileType.HardRock]: createHardRockSprite(),
    [TileType.Fog]: createFogSprite(),
  };
}, []);
```

#### Batched Drawing

Group similar draw calls:

```typescript
// Good: Batch all wall tiles together
const wallPositions = visibleTiles.filter(t => t.type === TileType.Wall);
for (const pos of wallPositions) {
  canvas.drawImage(tileSprites.wall, pos.x, pos.y);
}

// Bad: Draw tiles in arbitrary order (more state changes)
```

### React Optimization

```typescript
// Memoize expensive calculations
const visibleTiles = useMemo(
  () => getVisibleTiles(playerPos, viewport, TILE_SIZE),
  [playerPos.x, playerPos.y, viewport.width, viewport.height]
);

// Memoize callbacks
const handleMove = useCallback(
  (direction: Direction) => dispatch({ type: 'MOVE', direction }),
  [dispatch]
);

// Split components to isolate renders
// StatsPanel only re-renders when stats change
const StatsPanel = memo(({ stats }: { stats: PlayerStats }) => {
  // ...
});
```

### Memory Management

Per constitution P07, bounded structures:

```typescript
// Combat log with eviction
function addLogEntry(log: CombatLogEntry[], entry: CombatLogEntry): CombatLogEntry[] {
  const newLog = [...log, entry];
  if (newLog.length > MAX_COMBAT_LOG_ENTRIES) {
    return newLog.slice(-MAX_COMBAT_LOG_ENTRIES);
  }
  return newLog;
}

// Pre-allocated entity pools
const MAX_ENEMIES_ON_MAP = 50;
const MAX_POIS_ON_MAP = 30;
```

---

## R6: Input Handling Architecture

### Problem Statement

Per constitution P12, input must be centralized and testable. Support touch D-pad and keyboard.

### Input Handler Design

```typescript
type InputEvent = {
  type: 'DIRECTION';
  direction: Direction;
  source: 'dpad' | 'keyboard';
  timestamp: number;
};

class InputHandler {
  private listeners: ((event: InputEvent) => void)[] = [];
  private lastInput: number = 0;
  private debounceMs: number = 100;

  emit(event: InputEvent): void {
    const now = Date.now();
    if (now - this.lastInput < this.debounceMs) {
      return; // Debounce rapid inputs
    }
    this.lastInput = now;

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // For testing: inject synthetic inputs
  injectInput(direction: Direction): void {
    this.emit({
      type: 'DIRECTION',
      direction,
      source: 'keyboard',
      timestamp: Date.now()
    });
  }
}
```

### Keyboard Bindings (Web Dev)

```typescript
const KEYBOARD_MAP: Record<string, Direction> = {
  'ArrowUp': Direction.Up,
  'ArrowDown': Direction.Down,
  'ArrowLeft': Direction.Left,
  'ArrowRight': Direction.Right,
  'w': Direction.Up,
  's': Direction.Down,
  'a': Direction.Left,
  'd': Direction.Right,
  'W': Direction.Up,
  'S': Direction.Down,
  'A': Direction.Left,
  'D': Direction.Right,
};

function setupKeyboardInput(handler: InputHandler): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const direction = KEYBOARD_MAP[e.key];
    if (direction !== undefined) {
      e.preventDefault();
      handler.emit({
        type: 'DIRECTION',
        direction,
        source: 'keyboard',
        timestamp: Date.now()
      });
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
```

---

## Summary

| Research Area | Decision |
|--------------|----------|
| Map Generation | Recursive Backtracker Maze + tile type assignment |
| Combat Resolution | Pure function resolver with structured log |
| RNG | Mulberry32 seeded PRNG |
| State Machine | Reducer with typed actions and transition guards |
| Performance | Viewport culling, sprite caching, memoization |
| Input | Centralized InputHandler with D-pad and keyboard support |

All decisions align with constitution principles and spec requirements.
