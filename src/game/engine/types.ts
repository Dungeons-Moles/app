/**
 * Core game types for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { GameMap, EnemyId } from '../map/types';
import type { Direction } from '../input/types';

// ============================================================================
// Game Phase State Machine
// ============================================================================

export enum GamePhase {
  MainMenu = 'MAIN_MENU',
  Exploration = 'EXPLORATION',
  POIInteraction = 'POI_INTERACTION',
  Combat = 'COMBAT',
  BossFight = 'BOSS_FIGHT',
  Victory = 'VICTORY',
  Defeat = 'DEFEAT',
}

// ============================================================================
// Position
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

// ============================================================================
// Interaction State Types
// ============================================================================

export type WallHighlightState = {
  targetPosition: Position;
  direction: Direction;
  cost: number;
} | null;

export type FastTravelState = {
  active: boolean;
  selectedIndex: number;
} | null;

// ============================================================================
// Player Types
// ============================================================================

export interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
}

export interface StatusEffects {
  chill: number;
  shrapnel: number;
  rust: number;
  bleed: number;
  reflection?: number;
}

export const DEFAULT_STATUS_EFFECTS: StatusEffects = {
  chill: 0,
  shrapnel: 0,
  rust: 0,
  bleed: 0,
  reflection: 0,
};

export type ItemsetId =
  | 'UNION_STANDARD'
  | 'SHARD_CIRCUIT'
  | 'DEMOLITION_PERMIT'
  | 'FUSE_NETWORK'
  | 'SHRAPNEL_HARNESS'
  | 'RUST_RITUAL'
  | 'SWIFT_DIGGER_KIT'
  | 'ROYAL_EXTRACTION'
  | 'WHITEOUT_INITIATIVE'
  | 'BLOODRUSH_PROTOCOL'
  | 'CORROSION_PAYLOAD'
  | 'GOLDEN_SHRAPNEL_EXCHANGE';

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC';

export type ItemRarity = 'COMMON' | 'SAPPHIRE' | 'GOLDEN' | 'RARE' | 'HEROIC' | 'MYTHIC';

export type ItemTag = 'STONE' | 'SCOUT' | 'GREED' | 'BLAST' | 'FROST' | 'RUST' | 'BLOOD' | 'TEMPO';

// 12 field enemy archetypes from GDD Section 11
export type EnemyArchetype =
  | 'TUNNEL_RAT'
  | 'CAVE_BAT'
  | 'SPORE_SLIME'
  | 'RUST_MITE_SWARM'
  | 'COLLAPSED_MINER'
  | 'SHARD_BEETLE'
  | 'TUNNEL_WARDEN'
  | 'BURROW_AMBUSHER'
  | 'FROST_WISP'
  | 'POWDER_TICK'
  | 'COIN_SLUG'
  | 'BLOOD_MOSQUITO';

export type EnemyTier = 1 | 2 | 3;

// 14 POI types from GDD Section 12
export type POIId =
  | 'L1' // Mole Den
  | 'L2' // Supply Cache
  | 'L3' // Tool Crate
  | 'L4' // Tool Oil Rack
  | 'L5' // Rest Alcove
  | 'L6' // Survey Beacon
  | 'L7' // Seismic Scanner
  | 'L8' // Rail Waypoint
  | 'L9' // Smuggler Hatch
  | 'L10' // Rusty Anvil
  | 'L11' // Rune Kiln
  | 'L12' // Geode Vault
  | 'L13' // Counter Cache
  | 'L14'; // Scrap Chute

export interface ItemStats {
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
  hp?: number;
}

// 16 tools total: 2 per tag
export type ToolId =
  | 'T0' // Rusty Pickaxe (Starting)
  | 'T1'
  | 'T2' // STONE: Bulwark Shovel, Cragbreaker Hammer
  | 'T3'
  | 'T4' // SCOUT: Twin Picks, Pneumatic Drill
  | 'T5'
  | 'T6' // GREED: Glittering Pick, Gemfinder Staff
  | 'T7'
  | 'T8' // BLAST: Fuse Pick, Spark Pick
  | 'T9'
  | 'T10' // FROST: Rime Pike, Glacier Fang
  | 'T11'
  | 'T12' // RUST: Corrosive Pick, Etched Burrowblade
  | 'T13'
  | 'T14' // BLOOD: Serrated Drill, Reaper Pick
  | 'T15'
  | 'T16' // TEMPO: Quickpick, Chrono Rapier
  | 'T17'; // RELIC: Pioneer's Mattock

export type ToolOil = 'ATK' | 'DIG' | 'SPD' | 'ARM';

// 64 gear items total: 8 per tag
export type GearId =
  // STONE (8): I1-I8
  | 'I1'
  | 'I2'
  | 'I3'
  | 'I4'
  | 'I5'
  | 'I6'
  | 'I7'
  | 'I8'
  // SCOUT (8): I9-I16
  | 'I9'
  | 'I10'
  | 'I11'
  | 'I12'
  | 'I13'
  | 'I14'
  | 'I15'
  | 'I16'
  // GREED (8): I17-I24
  | 'I17'
  | 'I18'
  | 'I19'
  | 'I20'
  | 'I21'
  | 'I22'
  | 'I23'
  | 'I24'
  // BLAST (8): I25-I32
  | 'I25'
  | 'I26'
  | 'I27'
  | 'I28'
  | 'I29'
  | 'I30'
  | 'I31'
  | 'I32'
  // FROST (8): I33-I40
  | 'I33'
  | 'I34'
  | 'I35'
  | 'I36'
  | 'I37'
  | 'I38'
  | 'I39'
  | 'I40'
  // RUST (8): I41-I48
  | 'I41'
  | 'I42'
  | 'I43'
  | 'I44'
  | 'I45'
  | 'I46'
  | 'I47'
  | 'I48'
  // BLOOD (8): I49-I56
  | 'I49'
  | 'I50'
  | 'I51'
  | 'I52'
  | 'I53'
  | 'I54'
  | 'I55'
  | 'I56'
  // TEMPO (8): I57-I64
  | 'I57'
  | 'I58'
  | 'I59'
  | 'I60'
  | 'I61'
  | 'I62'
  | 'I63'
  | 'I64';

export interface Tool {
  id: ToolId;
  name: string;
  emoji: string;
  image?: any;
  rarity: ItemRarity;
  tier?: 1 | 2 | 3;
  stats: ItemStats;
  tags: ItemTag[];
  oil?: ToolOil | null;
}

export interface Gear {
  id: GearId;
  name: string;
  emoji: string;
  image?: any;
  baseRarity: ItemRarity;
  currentRarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
}

export interface InventorySlot {
  item: Gear;
  index: number;
}

export interface Player {
  position: Position;
  baseStats: PlayerStats;
  stats: PlayerStats;
  equippedTool: Tool | null;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  statusEffects: StatusEffects;
  activeItemsets: ItemsetId[];
  facing: 'left' | 'right';
}

// ============================================================================
// Time Types
// ============================================================================

export enum TimePhase {
  Day = 'DAY',
  Night = 'NIGHT',
  Boss = 'BOSS',
}

export type BossSelectionMode = 'random' | 'campaign';

export type GuestDifficultyId = 'easy' | 'medium' | 'hard';

// Biome A bosses (Week 1: 5, Week 2: 5, Week 3: 2) + Biome B (Week 1: 5, Week 2: 5, Week 3: 2)
export type BossId =
  // Biome A - Week 1
  | 'B-A-W1-01' // The Broodmother
  | 'B-A-W1-02' // Obsidian Golem
  | 'B-A-W1-03' // Gas Anomaly
  | 'B-A-W1-04' // Mad Miner
  | 'B-A-W1-05' // Shard Colossus
  // Biome A - Week 2
  | 'B-A-W2-01' // Drill Sergeant
  | 'B-A-W2-02' // Crystal Mimic
  | 'B-A-W2-03' // Rust Regent
  | 'B-A-W2-04' // Powder Keg Baron
  | 'B-A-W2-05' // Greedkeeper
  // Biome A - Week 3 Finals
  | 'B-A-W3-01' // The Eldritch Mole
  | 'B-A-W3-02' // The Gilded Devourer
  // Biome B - Week 1
  | 'B-B-W1-01' // The Broodmother (B)
  | 'B-B-W1-02' // Obsidian Golem (B)
  | 'B-B-W1-03' // Gas Anomaly (B)
  | 'B-B-W1-04' // Mad Miner (B)
  | 'B-B-W1-05' // Shard Colossus (B)
  // Biome B - Week 2
  | 'B-B-W2-01' // Drill Sergeant (B)
  | 'B-B-W2-02' // Crystal Mimic (B)
  | 'B-B-W2-03' // Rust Regent (B)
  | 'B-B-W2-04' // Powder Keg Baron (B)
  | 'B-B-W2-05' // Greedkeeper (B)
  // Biome B - Week 3 Finals
  | 'B-B-W3-01' // The Frostbound Leviathan
  | 'B-B-W3-02'; // The Rusted Chronomancer

export interface TimeState {
  week: number;
  phase: TimePhase;
  cycle: 1 | 2 | 3;
  movesRemaining: number;
  weekBoss: BossId;
}

// ============================================================================
// Combat Types (Basic - full types in combat/types.ts)
// ============================================================================

export interface CombatState {
  player: CombatantState;
  enemy: CombatantState;
  turn: number;
  phase: CombatPhase;
  log: CombatLogEntry[];
  rngState: number;
  playerGold: number;
  enemyGold: number;
  goldReward: number;
  enemyDefinitionId: string;
  enemyTier: 1 | 2 | 3;
  consumedGearIds: GearId[];
  result: CombatResult | null;
}

export interface CombatantState {
  name: string;
  emoji: string;
  definitionId?: string; // T105: For image lookup
  isPlayer: boolean;
  maxHp: number;
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  bonusAtk: number;
  bonusArm: number;
  bonusSpd: number;
  statusEffects: StatusEffects;
  strikesPerTurn: number;
  ignoresArmor: boolean;
}

export enum CombatPhase {
  BattleStart = 'BATTLE_START',
  TurnStart = 'TURN_START',
  PlayerAttack = 'PLAYER_ATTACK',
  EnemyAttack = 'ENEMY_ATTACK',
  TurnEnd = 'TURN_END',
  BattleEnd = 'BATTLE_END',
}

export type CombatResult = 'VICTORY' | 'DEFEAT';

export type EffectTiming =
  | 'BATTLE_START'
  | 'FIRST_TURN' // Only during Turn 1
  | 'TURN_START'
  | 'EVERY_OTHER_TURN' // Turns 2, 4, 6...
  | 'BEFORE_ATTACK'
  | 'ON_HIT' // Once per turn unless specified
  | 'ON_STRUCK' // When this combatant is hit
  | 'WOUNDED' // When HP < 50% max
  | 'EXPOSED' // When ARM = 0
  | 'TURN_END'
  | 'BATTLE_END'
  | 'VICTORY' // When combat ends in victory
  | 'DAY_START'
  | 'ON_DEATH'
  | 'COUNTDOWN' // Countdown(N) bombs
  | 'PASSIVE';

export type CombatAction =
  | 'ATTACK'
  | 'APPLY_STATUS'
  | 'REMOVE_STATUS'
  | 'HEAL'
  | 'GAIN_ARMOR'
  | 'LOSE_ARMOR'
  | 'GOLD_REWARD'
  | 'TRIGGER_TRAIT'
  | 'TRIGGER_ITEM'
  | 'TRIGGER_ITEMSET'
  | 'PHASE_TRIGGER';

export interface CombatActionResult {
  damage?: number;
  healing?: number;
  armorGained?: number;
  armorLost?: number;
  atkBonus?: number;
  digBonus?: number;
  statusApplied?: { type: keyof StatusEffects; stacks: number };
  statusRemoved?: { type: keyof StatusEffects; stacks: number };
  amount?: number;
  totalGold?: number;
  effectName?: string;
  goldStolen?: number;
  goldGained?: number;
  goldSpent?: number;
  spdBonus?: number;
  source?: CombatSourceRef;
  contributions?: CombatContribution[];
}

export interface CombatSourceRef {
  kind: 'tool' | 'gear' | 'itemset' | 'enemy' | 'boss' | 'status';
  id: string;
  name?: string;
}

export interface CombatContribution {
  source: CombatSourceRef;
  value: number;
}

export interface CombatLogEntry {
  turn: number;
  timing: EffectTiming | CombatPhase;
  actor: 'player' | 'enemy' | 'system';
  action: CombatAction;
  target: 'player' | 'enemy' | 'none';
  result: CombatActionResult;
  rngValues: number[];
}

// ============================================================================
// POI Types (Basic - full types in entities/pois.ts)
// ============================================================================

export type POIInteractionType =
  | 'ITEM_SELECTION' // L2, L3, L12, L13: Pick 1 of N items
  | 'REST' // L1, L5: Restore HP, skip to day
  | 'TOOL_MODIFY' // L4: +1 stat to tool
  | 'REVEAL' // L6: Reveal tiles in radius
  | 'LOCATE' // L7: Reveal nearest POI of category
  | 'FAST_TRAVEL' // L8: Travel between waypoints
  | 'SHOP' // L9: Buy items with gold
  | 'UPGRADE' // L10: Upgrade tool tier
  | 'FUSE' // L11: Fuse 2 identical items
  | 'DESTROY'; // L14: Destroy 1 gear item

export interface POIInteraction {
  poi: {
    id: string;
    definitionId: string;
    position: Position;
    visited: boolean;
    discovered: boolean;
  };
  type: POIInteractionType;
  options?: POIOption[];
  selectedOption?: number;
}

export interface POIOption {
  label: string;
  description?: string;
  item?: Gear | Tool;
  cost?: number;
  disabled?: boolean;
  disabledReason?: string;
}

// ============================================================================
// Debug State
// ============================================================================

export interface DebugState {
  showFPS: boolean;
  showSeed: boolean;
  showStateInspector: boolean;
  showCombatLog: boolean;
  showHitboxes: boolean;
}

export const DEFAULT_DEBUG_STATE: DebugState = {
  showFPS: false,
  showSeed: false,
  showStateInspector: false,
  showCombatLog: false,
  showHitboxes: false,
};

// ============================================================================
// Game State (Root)
// ============================================================================

export interface GameState {
  phase: GamePhase;
  seed: number;
  rngState: number;
  campaignLevel: number;
  bossSelectionMode: BossSelectionMode;
  guestDifficultyId?: GuestDifficultyId;
  player: Player;
  map: GameMap;
  time: TimeState;
  combat: CombatState | null;
  activePOI: POIInteraction | null;
  wallHighlight: WallHighlightState;
  fastTravel: FastTravelState;
  debug: DebugState;
  /** Active item pool bitmask (80 bits = 10 bytes), filters available shop items */
  activeItemPool?: Uint8Array;
  /** Total moves made this run (incremented on each successful move) */
  totalMoves: number;
}
