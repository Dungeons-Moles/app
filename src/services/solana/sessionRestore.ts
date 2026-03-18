/**
 * Session Restore Service
 *
 * Orchestrates fetching all on-chain accounts for a session and
 * converting them into the game engine's GameState for full restore.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deriveGameStatePda,
  deriveInventoryPda,
  deriveSessionDiscoveryPda,
} from './constants';
import {
  createGameplayStateProgram,
  createMapGeneratorProgram,
  createPlayerInventoryProgram,
} from './programs';
import { fetchGameState } from './gameplayState';
import { fetchSessionDiscovery } from './mapGeneratorClient';
import type { SessionDiscoveryData } from './mapGeneratorClient';
import { fetchInventory } from './playerInventory';
import { Phase, RunMode } from './types/gameplay_state';
import { Tier } from './types/player_inventory';
import type { PlayerInventoryData, ItemInstance } from './types/player_inventory';
import type { GameState, ItemRarity } from '@/game/engine/types';
import {
  GamePhase,
  TimePhase,
  DEFAULT_STATUS_EFFECTS,
  DEFAULT_DEBUG_STATE,
} from '@/game/engine/types';
import type {
  Player,
  PlayerStats,
  TimeState,
  BossId,
  Tool,
  Gear,
  InventorySlot,
  ToolOil,
  GearId,
  ToolId,
  POIId,
} from '@/game/engine/types';
import type { GameMap, MapEnemy, MapPOI, EnemyId } from '@/game/map/types';
import { TileType, FogState } from '@/game/map/types';
import { getEnemyTierStats, ARCHETYPE_TO_ENEMY_ID } from '@/game/entities/enemies';
import {
  createToolInstance,
  createGearInstance,
  getToolStatsAtTier,
  rarityToToolTier,
} from '@/game/entities/items';
import { refreshPlayerStats } from '@/game/entities/player';
import { GAME_CONSTANTS, getBaseHp } from '@/game/engine/constants';
import { selectWeekBossForLevel } from '@/game/time/progression';
import { updateFogOfWar } from '@/game/map/fog-of-war';
import { BOSSES } from '@/data/bosses';

// ============================================================================
// Constants
// ============================================================================

const FOG_STORAGE_PREFIX = 'fog_state_';
const BROKEN_WALLS_STORAGE_PREFIX = 'broken_walls_';

// ARCHETYPE_TO_ENEMY_ID imported from @/game/entities/enemies

/**
 * Maps on-chain POI type IDs (1-14) to POIId strings.
 */
const POI_TYPE_TO_ID: Record<number, POIId> = {
  1: 'L1',
  2: 'L2',
  3: 'L3',
  4: 'L4',
  5: 'L5',
  6: 'L6',
  7: 'L7',
  8: 'L8',
  9: 'L9',
  10: 'L10',
  11: 'L11',
  12: 'L12',
  13: 'L13',
  14: 'L14',
};

/**
 * Maps on-chain item ID strings to game engine IDs.
 * On-chain format: "T-{TAG}-{NN}" for tools, "G-{TAG}-{NN}" for gear.
 * Game engine format: "T{N}" for tools (T0-T16), "I{N}" for gear (I1-I64).
 */
export const ONCHAIN_TO_ENGINE_ID: Record<string, string> = {
  // Starter tool
  'T-XX-00': 'T0',
  // STONE tools
  'T-ST-01': 'T1',
  'T-ST-02': 'T2',
  // SCOUT tools
  'T-SC-01': 'T3',
  'T-SC-02': 'T4',
  // GREED tools
  'T-GR-01': 'T5',
  'T-GR-02': 'T6',
  // BLAST tools
  'T-BL-01': 'T7',
  'T-BL-02': 'T8',
  // FROST tools
  'T-FR-01': 'T9',
  'T-FR-02': 'T10',
  // RUST tools
  'T-RU-01': 'T11',
  'T-RU-02': 'T12',
  // BLOOD tools
  'T-BO-01': 'T13',
  'T-BO-02': 'T14',
  // TEMPO tools
  'T-TE-01': 'T15',
  'T-TE-02': 'T16',
  // STONE gear (I1-I8)
  'G-ST-01': 'I1',
  'G-ST-02': 'I2',
  'G-ST-03': 'I3',
  'G-ST-04': 'I4',
  'G-ST-05': 'I5',
  'G-ST-06': 'I6',
  'G-ST-07': 'I7',
  'G-ST-08': 'I8',
  // SCOUT gear (I9-I16)
  'G-SC-01': 'I9',
  'G-SC-02': 'I10',
  'G-SC-03': 'I11',
  'G-SC-04': 'I12',
  'G-SC-05': 'I13',
  'G-SC-06': 'I14',
  'G-SC-07': 'I15',
  'G-SC-08': 'I16',
  // GREED gear (I17-I24)
  'G-GR-01': 'I17',
  'G-GR-02': 'I18',
  'G-GR-03': 'I19',
  'G-GR-04': 'I20',
  'G-GR-05': 'I21',
  'G-GR-06': 'I22',
  'G-GR-07': 'I23',
  'G-GR-08': 'I24',
  // BLAST gear (I25-I32)
  'G-BL-01': 'I25',
  'G-BL-02': 'I26',
  'G-BL-03': 'I27',
  'G-BL-04': 'I28',
  'G-BL-05': 'I29',
  'G-BL-06': 'I30',
  'G-BL-07': 'I31',
  'G-BL-08': 'I32',
  // FROST gear (I33-I40)
  'G-FR-01': 'I33',
  'G-FR-02': 'I34',
  'G-FR-03': 'I35',
  'G-FR-04': 'I36',
  'G-FR-05': 'I37',
  'G-FR-06': 'I38',
  'G-FR-07': 'I39',
  'G-FR-08': 'I40',
  // RUST gear (I41-I48)
  'G-RU-01': 'I41',
  'G-RU-02': 'I42',
  'G-RU-03': 'I43',
  'G-RU-04': 'I44',
  'G-RU-05': 'I45',
  'G-RU-06': 'I46',
  'G-RU-07': 'I47',
  'G-RU-08': 'I48',
  // BLOOD gear (I49-I56)
  'G-BO-01': 'I49',
  'G-BO-02': 'I50',
  'G-BO-03': 'I51',
  'G-BO-04': 'I52',
  'G-BO-05': 'I53',
  'G-BO-06': 'I54',
  'G-BO-07': 'I55',
  'G-BO-08': 'I56',
  // TEMPO gear (I57-I64)
  'G-TE-01': 'I57',
  'G-TE-02': 'I58',
  'G-TE-03': 'I59',
  'G-TE-04': 'I60',
  'G-TE-05': 'I61',
  'G-TE-06': 'I62',
  'G-TE-07': 'I63',
  'G-TE-08': 'I64',
};

/**
 * Tool oil flag constants.
 */
const TOOL_OIL_FLAG_ATK = 0x01;
const TOOL_OIL_FLAG_SPD = 0x02;
const TOOL_OIL_FLAG_DIG = 0x04;
const TOOL_OIL_FLAG_ARM = 0x08;

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Fetches all on-chain accounts for a session and converts them to a complete
 * game engine GameState. Used for full session restore.
 *
 * @param connection - Solana connection
 * @param sessionPda - Session PDA
 * @param seed - Map generation seed (number)
 * @returns Complete GameState ready for RESTORE_GAME dispatch, or null on failure
 */
export async function fetchFullSessionState(
  connection: Connection,
  sessionPda: PublicKey,
  seedOverride?: number,
  options?: { silentMissingData?: boolean }
): Promise<GameState | null> {
  // Derive all PDAs
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  // Create program instances
  const gameplayProgram = createGameplayStateProgram(connection);
  const mapGenProgram = createMapGeneratorProgram(connection);
  const inventoryProgram = createPlayerInventoryProgram(connection);

  // Fetch the runtime-safe public/session accounts in parallel.
  const [gameStateData, inventoryData, sessionDiscoveryData] =
    await Promise.all([
      fetchGameState(gameplayProgram, gameStatePda),
      fetchInventory(inventoryProgram, inventoryPda),
      fetchSessionDiscovery(mapGenProgram, sessionDiscoveryPda),
    ]);

  if (!gameStateData || !sessionDiscoveryData) {
    if (!options?.silentMissingData) {
      console.error('[sessionRestore] Missing required on-chain data:', {
        gameState: !!gameStateData,
        sessionDiscovery: !!sessionDiscoveryData,
      });
    }
    return null;
  }

  const mapLooksUninitialized =
    sessionDiscoveryData.mapWidth <= 0 ||
    sessionDiscoveryData.mapHeight <= 0 ||
    (gameStateData.positionX === 0 && gameStateData.positionY === 0);

  if (mapLooksUninitialized) {
    if (!options?.silentMissingData) {
      console.warn('[sessionRestore] Generated map is not initialized yet:', {
        width: sessionDiscoveryData.mapWidth,
        height: sessionDiscoveryData.mapHeight,
        discoveredEnemyCount: sessionDiscoveryData.discoveredEnemyCount,
        discoveredPoiCount: sessionDiscoveryData.discoveredPoiCount,
        position: {
          x: gameStateData.positionX,
          y: gameStateData.positionY,
        },
      });
    }
    return null;
  }

  const seed = seedOverride ?? derivePublicSessionSeed(sessionPda);

  const tiles = unpackDiscoveryTiles(
    sessionDiscoveryData,
    sessionDiscoveryData.mapWidth,
    sessionDiscoveryData.mapHeight
  );
  const enemies = convertDiscoveredEnemies(
    sessionDiscoveryData.discoveredEnemies,
    sessionDiscoveryData.discoveredEnemyCount
  );
  const pois = convertDiscoveredPois(
    sessionDiscoveryData.discoveredPois,
    sessionDiscoveryData.discoveredPoiCount
  );
  const time = convertTimeState(
    gameStateData,
    gameStateData.campaignLevel,
    decodeBossId(sessionDiscoveryData.currentBossId)
  );
  const player = buildPlayer(gameStateData, inventoryData);
  const playerPos = { x: gameStateData.positionX, y: gameStateData.positionY };

  // Build the map
  // Add Mole Den (L1) if not already in discoveredPois.
  // The mole-den is always the first POI placed in GeneratedMap (index 0),
  // so its MapPois index is always 0 after refreshMapPois.
  const moleDenPos = { x: sessionDiscoveryData.moleDenX, y: sessionDiscoveryData.moleDenY };
  const hasMoleDen = pois.some(
    (p) => p.definitionId === 'L1' && p.position.x === moleDenPos.x && p.position.y === moleDenPos.y
  );
  if (!hasMoleDen && moleDenPos.x > 0 && moleDenPos.y > 0) {
    pois.unshift({
      id: 'poi-mole-den',
      definitionId: 'L1',
      position: moleDenPos,
      visited: false,
      discovered: true,
      mapPoisIndex: 0,
    });
  }

  const map: GameMap = {
    width: sessionDiscoveryData.mapWidth,
    height: sessionDiscoveryData.mapHeight,
    tiles,
    fog: buildFogFromDiscovery(
      sessionDiscoveryData,
      sessionDiscoveryData.mapWidth,
      sessionDiscoveryData.mapHeight
    ),
    enemies,
    pois,
    moleDenPosition: moleDenPos,
  };

  // Overlay the live visibility ring on top of persisted discovered tiles.
  const updatedMap = updateFogOfWar(map, playerPos, time.phase === 'DAY');
  map.fog = updatedMap.fog;
  map.enemies = updatedMap.enemies;

  // Build RNG state: seed + totalMoves for deterministic resumption
  const rngState = seed + gameStateData.totalMoves;

  const state: GameState = {
    phase: GamePhase.Exploration,
    seed,
    rngState,
    campaignLevel: gameStateData.campaignLevel,
    bossSelectionMode: 'campaign',
    player,
    map,
    time,
    combat: null,
    activePOI: null,
    wallHighlight: null,
    fastTravel: null,
    debug: DEFAULT_DEBUG_STATE,
    totalMoves: gameStateData.totalMoves,
  };

  return state;
}

// ============================================================================
// Tile Unpacking
// ============================================================================

/**
 * Unpacks bit-packed tile data into a 2D TileType array.
 * On-chain format: bit index = y * width + x, 0=floor, 1=wall.
 *
 * @param packedTiles - Bit-packed tile array (e.g., 313 bytes for 50x50)
 * @param width - Map width
 * @param height - Map height
 * @returns 2D array of TileType
 */
export function unpackTiles(packedTiles: number[], width: number, height: number): TileType[][] {
  const tiles: TileType[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const bitIndex = y * width + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const isWall = (packedTiles[byteIndex] >> bitOffset) & 1;
      tiles[y][x] = isWall ? TileType.Wall : TileType.Floor;
    }
  }

  return tiles;
}

export function buildFogFromOnChainDiscovery(
  discoveredTiles: number[],
  width: number,
  height: number
): FogState[][] {
  const fog = buildEmptyFog(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bitIndex = y * width + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const isDiscovered = ((discoveredTiles[byteIndex] ?? 0) >> bitOffset) & 1;
      if (isDiscovered) {
        fog[y][x] = FogState.Revealed;
      }
    }
  }

  return fog;
}

// ============================================================================
// Enemy Conversion
// ============================================================================

/**
 * Converts on-chain enemy data to game engine MapEnemy array.
 * Filters out defeated enemies, maps archetype IDs, and looks up stats.
 *
 * @param mapEnemies - On-chain MapEnemies enemy instances (with defeated flag)
 * @param generatedEnemies - GeneratedMap enemy spawns (for initial data)
 * @param enemyCount - Actual enemy count from GeneratedMap
 * @returns Array of MapEnemy for the game engine
 */
export function convertDiscoveredEnemies(
  discoveredEnemies: SessionDiscoveryData['discoveredEnemies'],
  enemyCount: number
): MapEnemy[] {
  const result: MapEnemy[] = [];

  for (let i = 0; i < enemyCount; i++) {
    const enemy = discoveredEnemies[i];
    if (!enemy || enemy.defeated !== 0) {
      continue;
    }

    const archetypeId = enemy.archetypeId;
    if (archetypeId < 0 || archetypeId >= ARCHETYPE_TO_ENEMY_ID.length) {
      console.warn(`[sessionRestore] Unknown archetype ID: ${archetypeId}, skipping`);
      continue;
    }

    const enemyId = ARCHETYPE_TO_ENEMY_ID[archetypeId];
    // On-chain tier is 0-based (0=T1, 1=T2, 2=T3), game engine uses 1-based
    const tier = (enemy.tier + 1) as 1 | 2 | 3;
    const tierStats = getEnemyTierStats(enemyId, tier);

    result.push({
      id: `enemy-${enemy.x}-${enemy.y}`,
      definitionId: enemyId,
      tier,
      position: { x: enemy.x, y: enemy.y },
      stats: {
        hp: tierStats.hp,
        atk: tierStats.atk,
        arm: tierStats.arm,
        spd: tierStats.spd,
      },
      discovered: true, // Enemies in SessionDiscovery have already been discovered
    });
  }

  return result;
}

/**
 * Converts raw enemy data (from MapEnemies) to MapEnemy array.
 * Used when SessionDiscovery enemy data is stale (e.g., after survey beacon).
 */
export function convertRawEnemiesToMapEnemies(
  rawEnemies: Array<{ x: number; y: number; archetypeId: number; tier: number }>
): MapEnemy[] {
  const result: MapEnemy[] = [];
  for (let i = 0; i < rawEnemies.length; i++) {
    const enemy = rawEnemies[i];
    if (enemy.archetypeId < 0 || enemy.archetypeId >= ARCHETYPE_TO_ENEMY_ID.length) continue;

    const enemyId = ARCHETYPE_TO_ENEMY_ID[enemy.archetypeId];
    const tier = (enemy.tier + 1) as 1 | 2 | 3;
    const tierStats = getEnemyTierStats(enemyId, tier);

    result.push({
      id: `enemy-${enemy.x}-${enemy.y}`,
      definitionId: enemyId,
      tier,
      position: { x: enemy.x, y: enemy.y },
      stats: { hp: tierStats.hp, atk: tierStats.atk, arm: tierStats.arm, spd: tierStats.spd },
      discovered: true,
    });
  }
  return result;
}

// ============================================================================
// POI Conversion
// ============================================================================

/** Counter Cache POI type ID (L13) — excluded from Duel/Gauntlet on-chain */
const COUNTER_CACHE_POI_TYPE = 13;

/**
 * Converts on-chain POI data to game engine MapPOI array.
 *
 * Uses SessionDiscovery's `discoveredPois[].used` as the `visited` flag
 * (no longer reads MapPois directly for privacy).
 *
 * @param discoveredPois - SessionDiscovery POI data
 * @param poiCount - Actual discovered POI count
 * @returns Array of MapPOI for the game engine
 */
export function convertDiscoveredPois(
  discoveredPois: SessionDiscoveryData['discoveredPois'],
  poiCount: number
): MapPOI[] {
  const result: MapPOI[] = [];

  for (let i = 0; i < poiCount; i++) {
    const poi = discoveredPois[i];
    if (!poi) continue;

    const poiId = POI_TYPE_TO_ID[poi.poiType];
    if (!poiId) {
      console.warn(`[sessionRestore] Unknown POI type: ${poi.poiType}, skipping`);
      continue;
    }

    result.push({
      id: `poi-${poi.mapPoisIndex}`,
      definitionId: poiId,
      position: { x: poi.x, y: poi.y },
      visited: !!poi.used,
      discovered: true,
      mapPoisIndex: poi.mapPoisIndex,
    });
  }

  return result;
}

// ============================================================================
// Time State Conversion
// ============================================================================

/**
 * Converts on-chain phase/week/movesRemaining to game engine TimeState.
 *
 * @param gameState - On-chain GameState data
 * @param campaignLevel - Campaign level (1-40) for deterministic boss selection
 * @returns TimeState for the game engine
 */
export function convertTimeState(
  gameState: {
    week: number;
    phase: Phase;
    movesRemaining: number;
    totalMoves: number;
    runMode?: RunMode;
  },
  campaignLevel: number,
  currentBossId: BossId | null
): TimeState {
  const week = Math.max(1, Math.min(3, gameState.week)) as 1 | 2 | 3;
  const { phase, cycle } = convertPhase(gameState.phase);

  const weekBoss = currentBossId ?? selectWeekBossForLevel(campaignLevel, 1);

  return {
    week,
    phase,
    cycle,
    movesRemaining: gameState.movesRemaining,
    weekBoss,
  };
}

/**
 * Converts on-chain Phase enum to TimePhase + cycle.
 */
function convertPhase(phase: Phase): { phase: TimePhase; cycle: 1 | 2 | 3 } {
  switch (phase) {
    case Phase.Day1:
      return { phase: TimePhase.Day, cycle: 1 };
    case Phase.Night1:
      return { phase: TimePhase.Night, cycle: 1 };
    case Phase.Day2:
      return { phase: TimePhase.Day, cycle: 2 };
    case Phase.Night2:
      return { phase: TimePhase.Night, cycle: 2 };
    case Phase.Day3:
      return { phase: TimePhase.Day, cycle: 3 };
    case Phase.Night3:
      return { phase: TimePhase.Night, cycle: 3 };
    default:
      return { phase: TimePhase.Day, cycle: 1 };
  }
}

// ============================================================================
// Player Building
// ============================================================================

/**
 * Builds a Player object from on-chain GameState and inventory data.
 *
 * On-chain GameState does NOT store ATK, ARM, SPD, DIG, or MaxHP —
 * those stats are derived from inventory at runtime. We start from
 * engine base stats, attach inventory, then call refreshPlayerStats()
 * to compute derived stats. Finally we override HP and gold from
 * the on-chain values (player may be damaged / have earned gold).
 */
function buildPlayer(
  gameState: {
    positionX: number;
    positionY: number;
    hp: number;
    gold: number;
    gearSlots: number;
    campaignLevel: number;
    runMode?: RunMode;
  },
  inventoryData: PlayerInventoryData | null
): Player {
  const position = { x: gameState.positionX, y: gameState.positionY };
  const isPvP =
    gameState.runMode === RunMode.Duel || gameState.runMode === RunMode.Gauntlet;
  const initialHp = isPvP ? GAME_CONSTANTS.INITIAL_HP : getBaseHp(gameState.campaignLevel);

  // Base stats from game engine constants (pre-gear values)
  const baseStats: PlayerStats = {
    hp: initialHp,
    maxHp: initialHp,
    atk: GAME_CONSTANTS.INITIAL_ATK,
    arm: GAME_CONSTANTS.INITIAL_ARM,
    spd: GAME_CONSTANTS.INITIAL_SPD,
    dig: GAME_CONSTANTS.INITIAL_DIG,
    gold: gameState.gold,
  };

  let equippedTool: Tool | null = null;
  const inventory: InventorySlot[] = [];

  if (inventoryData) {
    // Convert tool
    if (inventoryData.tool) {
      equippedTool = convertToolInstance(inventoryData.tool);
    }

    // Convert gear
    let slotIndex = 0;
    for (const gearSlot of inventoryData.gear) {
      if (gearSlot) {
        const gear = convertGearInstance(gearSlot);
        if (gear) {
          inventory.push({ item: gear, index: slotIndex });
        } else {
          console.warn('[sessionRestore] buildPlayer: failed to convert gear at slot', slotIndex);
        }
      }
      slotIndex++;
    }
  }

  // Build player with base stats and inventory, then let
  // refreshPlayerStats compute derived stats (base + gear bonuses)
  const player: Player = refreshPlayerStats({
    position,
    baseStats,
    stats: { ...baseStats },
    equippedTool,
    inventory,
    inventoryCapacity: gameState.gearSlots,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    activeItemsets: [],
    facing: 'right',
  });

  // Handle HP from on-chain state, accounting for gear bonuses.
  // The on-chain HP may not reflect +HP gear bonuses if sync_hp_from_inventory
  // wasn't called (e.g., older sessions or failed sync).
  const onChainHp = gameState.hp;
  const baseHp = initialHp;
  const computedMaxHp = player.stats.maxHp;

  // Calculate gear HP bonus to determine the true base HP
  // On-chain HP includes gear bonuses, so we subtract them to get base HP
  const gearHpBonus = computedMaxHp - baseHp;

  if (onChainHp === baseHp && computedMaxHp > baseHp) {
    // On-chain HP equals base HP (10) but player has +HP gear equipped.
    // This means the player was at full health before equipping gear,
    // and the on-chain HP hasn't been synced with gear bonuses.
    // Set baseStats.hp to base, stats.hp will be calculated with gear bonus.
    player.stats.hp = computedMaxHp;
    player.baseStats.hp = baseHp; // Store BASE hp, not total
  } else {
    // Player has taken damage or on-chain HP was already synced.
    // On-chain HP includes gear bonus, so subtract it to get base HP.
    const hp = Math.max(0, Math.min(onChainHp, computedMaxHp));
    const trueBaseHp = Math.max(0, hp - gearHpBonus);
    player.stats.hp = hp;
    player.baseStats.hp = trueBaseHp; // Store BASE hp, not total
  }

  return player;
}

/**
 * Converts an on-chain ItemInstance (tool) to a game engine Tool.
 */
export function convertToolInstance(item: ItemInstance): Tool | null {
  const id = decodeItemId(item.itemId);
  if (!id || !id.startsWith('T')) return null;

  try {
    const tool = createToolInstance(id as ToolId);

    // Apply tier upgrade (Tier II = GILDED, Tier III = DIAMOND)
    const upgradedRarity = tierToRarity(item.tier);
    if (upgradedRarity) {
      tool.rarity = upgradedRarity;
    }

    // Recalculate stats using TOOL_EFFECTS tier values (matches on-chain)
    const tier = rarityToToolTier(tool.rarity);
    tool.stats = { ...getToolStatsAtTier(id as ToolId, tier) };

    // Apply tool oil modifications
    const oils: ToolOil[] = [];
    if (item.toolOilFlags & TOOL_OIL_FLAG_ATK) oils.push('ATK');
    if (item.toolOilFlags & TOOL_OIL_FLAG_SPD) oils.push('SPD');
    if (item.toolOilFlags & TOOL_OIL_FLAG_DIG) oils.push('DIG');
    if (item.toolOilFlags & TOOL_OIL_FLAG_ARM) oils.push('ARM');
    if (oils.length > 0) {
      tool.oil = oils[0]; // Only one oil supported at a time in game engine
    }
    return tool;
  } catch {
    console.warn(`[sessionRestore] Failed to create tool instance for: ${id}`);
    return null;
  }
}

/**
 * Converts an on-chain ItemInstance (gear) to a game engine Gear.
 */
export function convertGearInstance(item: ItemInstance): Gear | null {
  const id = decodeItemId(item.itemId);
  if (!id || !id.startsWith('I')) return null;

  try {
    // Convert on-chain tier (Tier enum: I=0, II=1, III=2) to rarity
    // Tier I = base rarity, Tier II/III = upgraded
    const rarityFromTier = tierToRarity(item.tier);
    return createGearInstance(id as GearId, rarityFromTier);
  } catch {
    console.warn(`[sessionRestore] Failed to create gear instance for: ${id}`);
    return null;
  }
}

/**
 * Decodes an 8-byte on-chain item ID and maps it to the game engine ID.
 * On-chain format: UTF-8 in 8-byte array, zero-padded (e.g., "T-ST-01\0").
 * Returns game engine ID (e.g., "T1", "I1") or null if unknown.
 */
export function decodeItemId(itemId: Uint8Array | number[]): string | null {
  if (!itemId || itemId.length === 0) return null;
  const bytes = Array.from(itemId).filter((b) => b !== 0);
  if (bytes.length === 0) return null;
  const onChainId = String.fromCharCode(...bytes);
  const engineId = ONCHAIN_TO_ENGINE_ID[onChainId];
  if (!engineId) {
    console.warn(`[sessionRestore] Unknown on-chain item ID: ${onChainId}`);
    return null;
  }
  return engineId;
}

/**
 * Maps on-chain Tier enum to ItemRarity for gear.
 * Tier I = base rarity (COMMON), Tier II = GILDED, Tier III = DIAMOND
 */
function tierToRarity(tier: Tier): ItemRarity | undefined {
  switch (tier) {
    case Tier.II:
      return 'GILDED';
    case Tier.III:
      return 'DIAMOND';
    default:
      return undefined; // Tier I uses the item's base rarity
  }
}

// ============================================================================
// Fog of War Persistence
// ============================================================================

/**
 * Saves fog state to AsyncStorage keyed by session PDA.
 *
 * @param sessionKey - Session PDA base58 string
 * @param fog - 2D fog state array
 */
export async function saveFogState(sessionKey: string, fog: FogState[][]): Promise<void> {
  try {
    // Compact encoding: H=0, R=1, V=2
    const encoded = fog.map((row) =>
      row.map((cell) => (cell === FogState.Hidden ? 0 : cell === FogState.Revealed ? 1 : 2))
    );
    await AsyncStorage.setItem(FOG_STORAGE_PREFIX + sessionKey, JSON.stringify(encoded));
  } catch (error) {
    console.warn('[sessionRestore] Failed to save fog state:', error);
  }
}

/**
 * Loads fog state from AsyncStorage.
 *
 * @param sessionKey - Session PDA base58 string
 * @param width - Expected map width
 * @param height - Expected map height
 * @returns 2D FogState array or null if not found/invalid
 */
async function loadFogState(
  sessionKey: string,
  width: number,
  height: number
): Promise<FogState[][] | null> {
  try {
    const stored = await AsyncStorage.getItem(FOG_STORAGE_PREFIX + sessionKey);
    if (!stored) return null;

    const encoded: number[][] = JSON.parse(stored);
    if (!Array.isArray(encoded) || encoded.length !== height) return null;
    if (!Array.isArray(encoded[0]) || encoded[0].length !== width) return null;

    return encoded.map((row) =>
      row.map((cell) => {
        if (cell === 1) return FogState.Revealed;
        if (cell === 2) return FogState.Visible;
        return FogState.Hidden;
      })
    );
  } catch {
    return null;
  }
}

/**
 * Clears saved fog state for a session.
 */
export async function clearFogState(sessionKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(FOG_STORAGE_PREFIX + sessionKey);
  } catch {
    // Ignore
  }
}

// ============================================================================
// Broken Wall Persistence
// ============================================================================

/**
 * Saves broken wall positions to AsyncStorage keyed by session PDA.
 * On-chain GeneratedMap.packedTiles is immutable, so broken walls
 * must be tracked client-side for session restore.
 *
 * @param sessionKey - Session PDA base58 string
 * @param walls - Array of {x, y} positions of broken walls
 */
export async function saveBrokenWalls(
  sessionKey: string,
  walls: { x: number; y: number }[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(BROKEN_WALLS_STORAGE_PREFIX + sessionKey, JSON.stringify(walls));
  } catch (error) {
    console.warn('[sessionRestore] Failed to save broken walls:', error);
  }
}

/**
 * Loads broken wall positions from AsyncStorage.
 *
 * @param sessionKey - Session PDA base58 string
 * @returns Array of {x, y} positions or null if not found
 */
export async function loadBrokenWalls(
  sessionKey: string
): Promise<{ x: number; y: number }[] | null> {
  try {
    const stored = await AsyncStorage.getItem(BROKEN_WALLS_STORAGE_PREFIX + sessionKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clears saved broken wall positions for a session.
 */
export async function clearBrokenWalls(sessionKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(BROKEN_WALLS_STORAGE_PREFIX + sessionKey);
  } catch {
    // Ignore
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates an empty fog grid (all Hidden).
 */
function buildEmptyFog(width: number, height: number): FogState[][] {
  const fog: FogState[][] = [];
  for (let y = 0; y < height; y++) {
    fog[y] = [];
    for (let x = 0; x < width; x++) {
      fog[y][x] = FogState.Hidden;
    }
  }
  return fog;
}

/**
 * Unpacks tile types from SessionDiscovery bitmaps.
 * Uses discoveredTiles (which tiles are known) + revealedTileTypes (actual tile type)
 * to build the tile grid. Broken walls are reflected in revealedTileTypes, so no
 * client-side broken wall tracking is needed.
 *
 * Undiscovered tiles stay fully private and are represented as Unknown locally.
 */
export function unpackDiscoveryTiles(
  discovery: SessionDiscoveryData,
  width: number,
  height: number
): TileType[][] {
  const tiles: TileType[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const bitIndex = y * width + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const isDiscovered = ((discovery.discoveredTiles[byteIndex] ?? 0) >> bitOffset) & 1;
      const isWall = ((discovery.revealedTileTypes[byteIndex] ?? 0) >> bitOffset) & 1;
      tiles[y][x] = isDiscovered ? (isWall ? TileType.Wall : TileType.Floor) : TileType.Unknown;
    }
  }

  return tiles;
}

/**
 * Builds fog state from SessionDiscovery's discoveredTiles bitmap.
 * 1 = Revealed, 0 = Hidden.
 */
function buildFogFromDiscovery(
  discovery: SessionDiscoveryData,
  width: number,
  height: number
): FogState[][] {
  const fog = buildEmptyFog(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bitIndex = y * width + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const isDiscovered = ((discovery.discoveredTiles[byteIndex] ?? 0) >> bitOffset) & 1;
      if (isDiscovered) {
        fog[y][x] = FogState.Revealed;
      }
    }
  }

  return fog;
}

function decodeBossId(bytes: number[] | Uint8Array): BossId | null {
  const value = Buffer.from(bytes)
    .toString('utf-8')
    .replace(/\0/g, '')
    .trim() as BossId;
  return value && value in BOSSES ? value : null;
}

function derivePublicSessionSeed(sessionPda: PublicKey): number {
  const bytes = sessionPda.toBytes();
  return (
    ((bytes[0] ?? 0) << 24) ^
    ((bytes[1] ?? 0) << 16) ^
    ((bytes[2] ?? 0) << 8) ^
    (bytes[3] ?? 0)
  ) >>> 0;
}
