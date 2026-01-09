/**
 * Core game types for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { GameMap } from '../map/types';

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
}

export const DEFAULT_STATUS_EFFECTS: StatusEffects = {
  chill: 0,
  shrapnel: 0,
  rust: 0,
};

export type ItemsetId =
  | 'UNION_STANDARD'
  | 'SHARD_CIRCUIT'
  | 'DEMOLITION_PERMIT'
  | 'FUSE_NETWORK'
  | 'SHRAPNEL_HARNESS'
  | 'RUST_RITUAL'
  | 'SWIFT_DIGGER_KIT'
  | 'ROYAL_EXTRACTION';

export type ItemRarity = 'COMMON' | 'GILDED' | 'DIAMOND' | 'RARE' | 'HEROIC' | 'MYTHIC';

export type ItemTag =
  | 'STONE'
  | 'SCOUT'
  | 'GREED'
  | 'FROST'
  | 'SHRAPNEL'
  | 'SHARD'
  | 'BLAST'
  | 'RUST';

export interface ItemStats {
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
  hp?: number;
}

export type ToolId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9';

export type GearId =
  | 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8' | 'I9' | 'I10'
  | 'I11' | 'I12' | 'I13' | 'I14' | 'I15' | 'I16' | 'I17' | 'I18' | 'I19' | 'I20'
  | 'I21' | 'I22' | 'I23' | 'I24' | 'I25' | 'I26' | 'I27' | 'I28' | 'I29';

export interface Tool {
  id: ToolId;
  name: string;
  emoji: string;
  rarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
}

export interface Gear {
  id: GearId;
  name: string;
  emoji: string;
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
}

// ============================================================================
// Time Types
// ============================================================================

export enum TimePhase {
  Day = 'DAY',
  Night = 'NIGHT',
  Boss = 'BOSS',
}

export type BossId =
  | 'BROODMOTHER'
  | 'OBSIDIAN_GOLEM'
  | 'GAS_ANOMALY'
  | 'MAD_MINER'
  | 'DRILL_SERGEANT'
  | 'CRYSTAL_MIMIC'
  | 'ELDRITCH_MOLE';

export interface TimeState {
  week: 1 | 2 | 3;
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
  consumedGearIds: GearId[];
  result: CombatResult | null;
}

export interface CombatantState {
  name: string;
  emoji: string;
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
  | 'TURN_START'
  | 'BEFORE_ATTACK'
  | 'ON_HIT'
  | 'ON_STRUCK'
  | 'ON_WOUNDED'
  | 'ON_EXPOSED'
  | 'TURN_END'
  | 'BATTLE_END'
  | 'DAY_START'
  | 'ON_DEATH'
  | 'PASSIVE';

export type CombatAction =
  | 'ATTACK'
  | 'APPLY_STATUS'
  | 'REMOVE_STATUS'
  | 'HEAL'
  | 'GAIN_ARMOR'
  | 'LOSE_ARMOR'
  | 'TRIGGER_TRAIT'
  | 'TRIGGER_ITEM'
  | 'TRIGGER_ITEMSET'
  | 'PHASE_TRIGGER';

export interface CombatActionResult {
  damage?: number;
  healing?: number;
  armorGained?: number;
  armorLost?: number;
  statusApplied?: { type: keyof StatusEffects; stacks: number };
  statusRemoved?: { type: keyof StatusEffects; stacks: number };
  effectName?: string;
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
  | 'ITEM_SELECTION'
  | 'REST'
  | 'TOOL_MODIFY'
  | 'REVEAL'
  | 'FAST_TRAVEL'
  | 'SHOP'
  | 'UPGRADE'
  | 'FUSE';

export interface POIInteraction {
  poi: { id: string; definitionId: string; position: Position; visited: boolean; discovered: boolean };
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
  player: Player;
  map: GameMap;
  time: TimeState;
  combat: CombatState | null;
  activePOI: POIInteraction | null;
  debug: DebugState;
}
