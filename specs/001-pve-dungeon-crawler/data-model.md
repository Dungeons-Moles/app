# Data Model: PvE Dungeon Crawler Prototype

**Feature**: 001-pve-dungeon-crawler
**Date**: 2026-01-07
**Status**: Complete

---

## Core Game State

```typescript
interface GameState {
  // Phase management (P01: Explicit State Machines)
  phase: GamePhase;

  // RNG state for determinism (P04, P05)
  seed: number;
  rngState: number;

  // Core entities
  player: Player;
  map: GameMap;
  time: TimeState;

  // Combat (when in Combat/BossFight phase)
  combat: CombatState | null;

  // POI interaction (when in POIInteraction phase)
  activePOI: POIInteraction | null;

  // Debug (P15: isolated)
  debug: DebugState;
}

enum GamePhase {
  MainMenu = 'MAIN_MENU',
  Exploration = 'EXPLORATION',
  POIInteraction = 'POI_INTERACTION',
  Combat = 'COMBAT',
  BossFight = 'BOSS_FIGHT',
  Victory = 'VICTORY',
  Defeat = 'DEFEAT',
}
```

---

## Player Entity

```typescript
interface Player {
  // Position on map
  position: Position;

  // Base stats (before item bonuses)
  baseStats: PlayerStats;

  // Computed stats (base + items)
  stats: PlayerStats;

  // Equipment
  equippedTool: Tool | null;
  inventory: InventorySlot[];
  inventoryCapacity: number; // 4 at start, +2 per Day

  // Active status effects
  statusEffects: StatusEffects;

  // Active itemset bonuses
  activeItemsets: ItemsetId[];
}

interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
}

interface Position {
  x: number;
  y: number;
}

interface InventorySlot {
  item: Gear;
  index: number;
}
```

---

## Map Entities

```typescript
interface GameMap {
  width: number;
  height: number;
  tiles: TileType[][];
  fog: FogState[][];

  // Entities on map
  enemies: MapEnemy[];
  pois: MapPOI[];
  moleDenPosition: Position;
}

enum TileType {
  Wall = 'WALL',
  EmptyTunnel = 'EMPTY_TUNNEL',
  SoftEarth = 'SOFT_EARTH',
  HardRock = 'HARD_ROCK',
}

enum FogState {
  Hidden = 'HIDDEN',     // Never seen
  Revealed = 'REVEALED', // Previously seen
  Visible = 'VISIBLE',   // Currently in sight
}

// Tile movement costs
const TILE_MOVE_COST: Record<TileType, number> = {
  [TileType.Wall]: Infinity, // Impassable
  [TileType.EmptyTunnel]: 1,
  [TileType.SoftEarth]: 1,
  [TileType.HardRock]: 2,
};

// Sight radius by time phase
const SIGHT_RADIUS = {
  day: 5,
  night: 3,
};
```

---

## Enemy Entities

```typescript
interface EnemyDefinition {
  id: EnemyId;
  name: string;
  emoji: string;
  tiers: EnemyTierStats[];
  trait: EnemyTrait;
}

interface EnemyTierStats {
  tier: 1 | 2 | 3;
  hp: number;
  atk: number;
  arm: number;
  spd: number;
}

interface EnemyTrait {
  name: string;
  timing: EffectTiming;
  description: string;
  execute: (state: CombatState, context: EffectContext) => CombatState;
}

interface MapEnemy {
  id: string; // Unique instance ID
  definitionId: EnemyId;
  tier: 1 | 2 | 3;
  position: Position;
  stats: EnemyStats; // Current stats (can be modified)
}

type EnemyId =
  | 'TUNNEL_RAT'
  | 'CAVE_BAT'
  | 'SPORE_SLIME'
  | 'RUST_MITE_SWARM'
  | 'COLLAPSED_MINER'
  | 'SHARD_BEETLE'
  | 'TUNNEL_WARDEN'
  | 'BURROW_AMBUSHER';
```

---

## Boss Entities

```typescript
interface BossDefinition {
  id: BossId;
  name: string;
  emoji: string;
  week: 1 | 2 | 3;
  stats: BossStats;
  trait: BossTrait;
  phases?: BossPhase[]; // For Eldritch Mole
}

interface BossStats {
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig?: number; // Some bosses have DIG
}

interface BossTrait {
  name: string;
  description: string;
  timings: EffectTiming[];
  execute: (state: CombatState, context: EffectContext) => CombatState;
}

interface BossPhase {
  threshold: number; // HP percentage (0.75, 0.50, 0.25)
  triggered: boolean;
  effect: (state: CombatState) => CombatState;
}

type BossId =
  | 'BROODMOTHER'
  | 'OBSIDIAN_GOLEM'
  | 'GAS_ANOMALY'
  | 'MAD_MINER'
  | 'DRILL_SERGEANT'
  | 'CRYSTAL_MIMIC'
  | 'ELDRITCH_MOLE';

// Boss pools per week
const BOSS_POOLS: Record<1 | 2 | 3, BossId[]> = {
  1: ['BROODMOTHER', 'OBSIDIAN_GOLEM', 'GAS_ANOMALY', 'MAD_MINER'],
  2: ['DRILL_SERGEANT', 'CRYSTAL_MIMIC'],
  3: ['ELDRITCH_MOLE'], // Fixed
};
```

---

## Item Entities

### Tools (Weapons)

```typescript
interface Tool {
  id: ToolId;
  name: string;
  emoji: string;
  rarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: ItemEffect;
  forgeMod?: ForgeMod; // Applied at Rusty Anvil
}

type ToolId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9';

interface ItemStats {
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
  hp?: number;
}

type ItemRarity = 'COMMON' | 'GILDED' | 'DIAMOND' | 'RARE' | 'HEROIC' | 'MYTHIC';

type ItemTag = 'STONE' | 'SCOUT' | 'GREED' | 'FROST' | 'SHRAPNEL' | 'SHARD';

interface ItemEffect {
  timing: EffectTiming;
  description: string;
  execute: (state: CombatState, context: EffectContext) => CombatState;
}
```

### Gear (Equipment)

```typescript
interface Gear {
  id: GearId;
  name: string;
  emoji: string;
  baseRarity: ItemRarity;
  currentRarity: ItemRarity; // Can be upgraded via Crusher Golem
  stats: ItemStats; // Scaled by rarity tier
  tags: ItemTag[];
  effect?: ItemEffect;
}

// Rarity stat multipliers
const RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  COMMON: 1.0,
  GILDED: 1.5,
  DIAMOND: 2.0,
  RARE: 1.0,    // Fixed rarity, no scaling
  HEROIC: 1.0,  // Fixed rarity, no scaling
  MYTHIC: 1.0,  // Fixed rarity, no scaling
};

type GearId =
  | 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10'
  | 'I11' | 'I12' | 'I13' | 'I14' | 'I15' | 'I16' | 'I17' | 'I18' | 'I19' | 'I20'
  | 'I21' | 'I22' | 'I23' | 'I24' | 'I25' | 'I26' | 'I27';
```

### Itemsets

```typescript
interface Itemset {
  id: ItemsetId;
  name: string;
  emoji: string;
  requiredItems: (ToolId | GearId)[];
  bonus: ItemsetBonus;
}

interface ItemsetBonus {
  description: string;
  timing?: EffectTiming; // If timing-based
  passive?: boolean; // If always active
  execute?: (state: CombatState, context: EffectContext) => CombatState;
  modify?: (stats: PlayerStats) => PlayerStats; // For passive stat bonuses
}

type ItemsetId =
  | 'UNION_STANDARD'
  | 'SHARD_CIRCUIT'
  | 'DEMOLITION_PERMIT'
  | 'FUSE_NETWORK'
  | 'SHRAPNEL_HARNESS'
  | 'RUST_RITUAL'
  | 'SWIFT_DIGGER_KIT'
  | 'ROYAL_EXTRACTION';
```

---

## Status Effects

```typescript
interface StatusEffects {
  chill: number;     // Stacks: halve ATK per attack, -1 at turn end
  shrapnel: number;  // Stacks: reflect damage when struck, clears at turn end
  rust: number;      // Stacks: reduce ARM by this amount
}

const DEFAULT_STATUS_EFFECTS: StatusEffects = {
  chill: 0,
  shrapnel: 0,
  rust: 0,
};
```

---

## Time System

```typescript
interface TimeState {
  week: 1 | 2 | 3;
  phase: TimePhase;
  cycle: 1 | 2 | 3;      // Which Day/Night pair (1, 2, or 3)
  movesRemaining: number;
  weekBoss: BossId;      // Selected at week start
}

enum TimePhase {
  Day = 'DAY',
  Night = 'NIGHT',
  Boss = 'BOSS',
}

// Move limits per phase
const PHASE_MOVES = {
  [TimePhase.Day]: 50,
  [TimePhase.Night]: 30,
  [TimePhase.Boss]: 0, // N/A
};

// Week structure
const WEEK_PHASES: TimePhase[] = [
  TimePhase.Day,   // Day 1
  TimePhase.Night, // Night 1
  TimePhase.Day,   // Day 2
  TimePhase.Night, // Night 2
  TimePhase.Day,   // Day 3
  TimePhase.Night, // Night 3
  TimePhase.Boss,  // Boss fight
];
```

---

## Combat State

```typescript
interface CombatState {
  // Combatants
  player: CombatantState;
  enemy: CombatantState;

  // Turn tracking
  turn: number;
  phase: CombatPhase;

  // Combat log (P07: bounded, P13: structured)
  log: CombatLogEntry[];

  // RNG state for reproducibility
  rngState: number;

  // Result (set when combat ends)
  result: CombatResult | null;
}

interface CombatantState {
  name: string;
  emoji: string;
  isPlayer: boolean;

  // Stats (snapshot at combat start)
  maxHp: number;
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;

  // Bonus stats from effects
  bonusAtk: number;
  bonusArm: number;
  bonusSpd: number;

  // Status effects
  statusEffects: StatusEffects;

  // Strike count (modified by traits/items)
  strikesPerTurn: number;

  // Flags
  ignoresArmor: boolean;
}

enum CombatPhase {
  BattleStart = 'BATTLE_START',
  TurnStart = 'TURN_START',
  PlayerAttack = 'PLAYER_ATTACK',
  EnemyAttack = 'ENEMY_ATTACK',
  TurnEnd = 'TURN_END',
  BattleEnd = 'BATTLE_END',
}

type CombatResult = 'VICTORY' | 'DEFEAT';

interface CombatLogEntry {
  turn: number;
  timing: EffectTiming | CombatPhase;
  actor: 'player' | 'enemy' | 'system';
  action: CombatAction;
  target: 'player' | 'enemy' | 'none';
  result: CombatActionResult;
  rngValues: number[]; // For determinism verification
}

type CombatAction =
  | 'ATTACK'
  | 'APPLY_STATUS'
  | 'REMOVE_STATUS'
  | 'HEAL'
  | 'GAIN_ARMOR'
  | 'LOSE_ARMOR'
  | 'TRIGGER_TRAIT'
  | 'TRIGGER_ITEM'
  | 'TRIGGER_ITEMSET'
  | 'PHASE_TRIGGER'; // For Eldritch Mole

interface CombatActionResult {
  damage?: number;
  healing?: number;
  armorGained?: number;
  armorLost?: number;
  statusApplied?: { type: keyof StatusEffects; stacks: number };
  statusRemoved?: { type: keyof StatusEffects; stacks: number };
  effectName?: string; // Name of trait/item/itemset that triggered
}
```

---

## POI Entities

```typescript
interface POIDefinition {
  id: POIId;
  name: string;
  emoji: string;
  rarity: POIRarity;
  interaction: POIInteractionType;
  nightOnly?: boolean; // Mole Den, Rest Alcove
}

type POIRarity = 'FIXED' | 'COMMON' | 'UNCOMMON' | 'RARE';

type POIInteractionType =
  | 'ITEM_SELECTION'    // Supply Cache, Tool Crate, Geode Vault
  | 'REST'              // Mole Den, Rest Alcove
  | 'TOOL_MODIFY'       // Tool Oil Rack
  | 'REVEAL'            // Survey Beacon, Seismic Scanner
  | 'FAST_TRAVEL'       // Rail Waypoint
  | 'SHOP'              // Smuggler Hatch
  | 'UPGRADE'           // Rusty Anvil
  | 'FUSE';             // Crusher Golem

interface MapPOI {
  id: string; // Unique instance ID
  definitionId: POIId;
  position: Position;
  visited: boolean;
  discovered: boolean; // For fast travel waypoints
}

type POIId =
  | 'L1'  // Mole Den
  | 'L2'  // Supply Cache
  | 'L3'  // Tool Crate
  | 'L4'  // Tool Oil Rack
  | 'L5'  // Rest Alcove
  | 'L6'  // Survey Beacon
  | 'L7'  // Seismic Scanner
  | 'L8'  // Rail Waypoint
  | 'L9'  // Smuggler Hatch
  | 'L10' // Rusty Anvil
  | 'L11' // Crusher Golem
  | 'L12';// Geode Vault

interface POIInteraction {
  poi: MapPOI;
  type: POIInteractionType;
  options?: POIOption[];
  selectedOption?: number;
}

interface POIOption {
  label: string;
  item?: Gear | Tool;
  cost?: number; // Gold cost for shops
  disabled?: boolean;
  disabledReason?: string;
}
```

---

## Effect System

```typescript
type EffectTiming =
  | 'BATTLE_START'
  | 'TURN_START'
  | 'BEFORE_ATTACK'
  | 'ON_HIT'       // When this entity hits
  | 'ON_STRUCK'    // When this entity is hit
  | 'ON_WOUNDED'   // When HP drops below 50%
  | 'ON_EXPOSED'   // When ARM reaches 0
  | 'TURN_END'
  | 'BATTLE_END';

interface EffectContext {
  source: 'player' | 'enemy';
  target: 'player' | 'enemy';
  timing: EffectTiming;
  rng: SeededRNG;
}

interface Effect {
  id: string;
  source: 'item' | 'trait' | 'itemset' | 'status';
  sourceId: string; // ToolId, GearId, EnemyId, etc.
  timing: EffectTiming;
  execute: (state: CombatState, context: EffectContext) => CombatState;
}
```

---

## Debug State

```typescript
interface DebugState {
  showFPS: boolean;
  showSeed: boolean;
  showStateInspector: boolean;
  showCombatLog: boolean;
  showHitboxes: boolean;
}

const DEFAULT_DEBUG_STATE: DebugState = {
  showFPS: false,
  showSeed: false,
  showStateInspector: false,
  showCombatLog: false,
  showHitboxes: false,
};
```

---

## Input Types

```typescript
enum Direction {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
}

interface InputEvent {
  type: 'DIRECTION' | 'CONFIRM' | 'CANCEL';
  direction?: Direction;
  source: 'dpad' | 'keyboard';
  timestamp: number;
}

// Direction to position delta
const DIRECTION_DELTA: Record<Direction, Position> = {
  [Direction.Up]: { x: 0, y: -1 },
  [Direction.Down]: { x: 0, y: 1 },
  [Direction.Left]: { x: -1, y: 0 },
  [Direction.Right]: { x: 1, y: 0 },
};
```

---

## Entity Relationships

```
GameState
├── Player
│   ├── equippedTool: Tool
│   ├── inventory: Gear[]
│   ├── activeItemsets: Itemset[]
│   └── statusEffects: StatusEffects
├── GameMap
│   ├── tiles: TileType[][]
│   ├── fog: FogState[][]
│   ├── enemies: MapEnemy[]
│   │   └── definitionId -> EnemyDefinition
│   └── pois: MapPOI[]
│       └── definitionId -> POIDefinition
├── TimeState
│   └── weekBoss -> BossDefinition
└── CombatState (when active)
    ├── player: CombatantState
    ├── enemy: CombatantState
    └── log: CombatLogEntry[]
```

---

## Constants

```typescript
// Game balance constants
const GAME_CONSTANTS = {
  // Map
  MAP_WIDTH: 50,
  MAP_HEIGHT: 50,
  INITIAL_SIGHT_RADIUS: 6,

  // Player
  INITIAL_HP: 10,
  INITIAL_ATK: 0,
  INITIAL_ARM: 0,
  INITIAL_SPD: 0,
  INITIAL_DIG: 0,
  INITIAL_GOLD: 0,

  // Inventory
  INITIAL_INVENTORY_SLOTS: 4,
  INVENTORY_SLOTS_PER_WEEK: 2,
  MAX_INVENTORY_SLOTS: 12,

  // Time
  DAY_MOVES: 50,
  NIGHT_MOVES: 30,
  CYCLES_PER_WEEK: 3,
  TOTAL_WEEKS: 3,

  // Combat
  MAX_COMBAT_LOG_ENTRIES: 100,
  VICTORY_DISPLAY_MS: 3000,
  DEFEAT_DISPLAY_MS: 3000,

  // POI
  POI_MIN_SPACING: 10,

  // Performance
  TARGET_FPS: 60,
  FRAME_BUDGET_MS: 16,
} as const;
```
