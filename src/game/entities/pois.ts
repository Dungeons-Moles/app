/**
 * POI Interaction System (T086-T098)
 * Handles interactions with all 12 POI types
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix F
 * @see specs/001-pve-dungeon-crawler/data-model.md POI Entities
 */

import type {
  GameState,
  POIInteraction,
  POIOption,
  Tool,
  Gear,
  Position,
  GearId,
  ItemRarity,
  ToolOil,
  Player,
  TimeState,
  ItemTag,
  POIId,
  ItemStats,
} from '../engine/types';
import { TimePhase, GamePhase } from '../engine/types';
import type { POIId as DataPOIId, POIDefinition } from '../../data/pois';
import { POI_DEFINITIONS, getPOIDefinition, canInteractWithPOI } from '../../data/pois';
import type { MapPOI, GameMap } from '../map/types';
import { FogState } from '../map/types';
import { createToolInstance, getToolsByRarity, TOOL_DEFINITIONS } from './items';
import { addGearToInventory, equipTool, refreshPlayerStats } from './player';
import {
  createGearInstance,
  getGearByRarity,
  GEAR_DEFINITIONS,
  RARITY_MULTIPLIER,
} from '../../data/gear';
import { SeededRNG } from '../engine/rng';
import { getBossWeaknessTags } from './bosses';

// ============================================================================
// Item Description Helpers
// ============================================================================

function pickUniqueById<T, Id extends string>(
  rng: SeededRNG,
  pool: readonly T[],
  count: number,
  getId: (item: T) => Id,
  exclude: ReadonlySet<Id> = new Set()
): T[] {
  const selected: T[] = [];
  const selectedIds = new Set<Id>(exclude);
  const available = [...pool].filter((item) => !selectedIds.has(getId(item)));

  while (selected.length < count && available.length > 0) {
    const index = rng.nextInt(0, available.length - 1);
    const item = available[index];
    selected.push(item);
    selectedIds.add(getId(item));
    available.splice(index, 1);
  }

  return selected;
}

function pickUniqueWeighted<T extends { tags: ItemTag[]; id: string }>(
  rng: SeededRNG,
  pool: readonly T[],
  count: number,
  weaknessTags: ItemTag[],
  exclude: ReadonlySet<string> = new Set()
): T[] {
  const selected: T[] = [];
  const selectedIds = new Set<string>(exclude);
  const available = [...pool].filter((item) => !selectedIds.has(item.id));

  while (selected.length < count && available.length > 0) {
    // Calculate weights: 1.0 base, 1.4 if matches weakness tag
    const weights = available.map((item) => {
      const isWeakness = item.tags.some((tag) => weaknessTags.includes(tag));
      return isWeakness ? 1.4 : 1.0;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = rng.next() * totalWeight;
    let chosenIndex = -1;

    for (let i = 0; i < available.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosenIndex = i;
        break;
      }
    }

    if (chosenIndex === -1) {
      chosenIndex = available.length - 1;
    }

    const item = available[chosenIndex];
    selected.push(item);
    selectedIds.add(item.id);
    available.splice(chosenIndex, 1);
  }

  return selected;
}

/**
 * Generates a description string from item stats
 */
function formatItemStats(stats: {
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
  hp?: number;
}): string {
  const parts: string[] = [];
  if (stats.atk) parts.push(`+${stats.atk} ATK`);
  if (stats.arm) parts.push(`+${stats.arm} ARM`);
  if (stats.spd) parts.push(`+${stats.spd} SPD`);
  if (stats.dig) parts.push(`+${stats.dig} DIG`);
  if (stats.hp) parts.push(`+${stats.hp} HP`);
  return parts.join(', ') || 'No stats';
}

/**
 * Generates a description for a gear item including stats and effects
 */
function getGearDescription(gear: Gear): string {
  const gearDef = GEAR_DEFINITIONS[gear.id];
  const statsDesc = formatItemStats(gear.stats);
  if (gearDef.effect) {
    return `${statsDesc}\n${gearDef.effect.description}`;
  }
  return statsDesc;
}

/**
 * Generates a description for a tool item including stats
 */
function getToolDescription(tool: Tool): string {
  return formatItemStats(tool.stats);
}

// ============================================================================
// POI Interaction Creation
// ============================================================================

/**
 * Creates a POI interaction state when player steps on a POI
 * @param poi - The map POI instance being interacted with
 * @param state - Current game state
 * @returns POI interaction with generated options, or null if interaction not allowed
 */
export function createPOIInteraction(poi: MapPOI, state: GameState): POIInteraction | null {
  const definition = getPOIDefinition(poi.definitionId);
  const isNight = state.time.phase === TimePhase.Night;

  // Check if POI can be interacted with
  if (!canInteractWithPOI(poi.definitionId, isNight)) {
    return null;
  }

  // Create RNG for generating options
  const rng = new SeededRNG(state.rngState);

  // Generate options based on POI type
  const options = generatePOIOptions(poi.definitionId, state, rng);

  return {
    poi: {
      id: poi.id,
      definitionId: poi.definitionId,
      position: poi.position,
      visited: poi.visited,
      discovered: poi.discovered,
    },
    type: definition.interaction,
    options,
  };
}

// ============================================================================
// Option Generation for Each POI Type
// ============================================================================

/**
 * Generates interaction options for a POI based on its type
 */
function generatePOIOptions(poiId: POIId, state: GameState, rng: SeededRNG): POIOption[] {
  switch (poiId) {
    case 'L1': // Mole Den
      return generateMoleDenOptions(state);
    case 'L2': // Supply Cache
      return generateSupplyCacheOptions(state, rng);
    case 'L3': // Tool Crate
      return generateToolCrateOptions(state, rng);
    case 'L4': // Tool Oil Rack
      return generateToolOilRackOptions(state);
    case 'L5': // Rest Alcove
      return generateRestAlcoveOptions(state);
    case 'L6': // Survey Beacon
      return generateSurveyBeaconOptions();
    case 'L7': // Seismic Scanner
      return generateSeismicScannerOptions(state);
    case 'L8': // Rail Waypoint
      return generateRailWaypointOptions(state);
    case 'L9': // Smuggler Hatch
      return generateSmugglerHatchOptions(state, rng);
    case 'L10': // Rusty Anvil
      return generateRustyAnvilOptions(state);
    case 'L11': // Rune Kiln
      return generateRuneKilnOptions(state);
    case 'L12': // Geode Vault
      return generateGeodeVaultOptions(state, rng);
    case 'L13': // Counter Cache - T086
      return generateCounterCacheOptions(state, rng);
    case 'L14': // Scrap Chute - T087
      return generateScrapChuteOptions(state);
    default:
      return [];
  }
}

// ============================================================================
// T087: Supply Cache (L2)
// Pick 1 of 3 Common items (with chance of Gilded/Diamond variants)
// ============================================================================

function generateSupplyCacheOptions(state: GameState, rng: SeededRNG): POIOption[] {
  const commonGear = getGearByRarity('COMMON');
  const options: POIOption[] = [];
  const weekBossId = state.time.weekBoss;
  const weaknessTags = getBossWeaknessTags(weekBossId);

  // Generate 3 unique random items (weighted by boss weakness)
  const pickedGear = pickUniqueWeighted(rng, commonGear, 3, weaknessTags);
  for (const gearDef of pickedGear) {
    // Small chance for rarity upgrade
    const roll = rng.next();
    let rarity: ItemRarity = 'COMMON';
    if (roll < 0.05) {
      rarity = 'DIAMOND'; // 5% chance
    } else if (roll < 0.15) {
      rarity = 'GILDED'; // 10% chance
    }
    const gear = createGearInstance(gearDef.id, rarity);
    options.push({
      label: gear.name,
      description: getGearDescription(gear),
      item: gear,
    });
  }

  return options;
}

// ============================================================================
// T088: Tool Crate (L3)
// Pick 1 of 3 Tools (Common/Rare distribution)
// ============================================================================

function generateToolCrateOptions(state: GameState, rng: SeededRNG): POIOption[] {
  const commonTools = getToolsByRarity('COMMON').filter((tool) => tool.id !== 'T9');
  const rareTools = getToolsByRarity('RARE');
  const options: POIOption[] = [];
  const weekBossId = state.time.weekBoss;
  const weaknessTags = getBossWeaknessTags(weekBossId);

  const selectedIds = new Set<string>();
  let attempts = 0;

  while (options.length < 3 && attempts < 1000) {
    attempts += 1;
    const roll = rng.next();
    let toolDef;

    // Rarity roll logic (kept from before)
    if (roll < 0.25 && rareTools.length > 0) {
      // Pick weighted from rare
      const picked = pickUniqueWeighted(rng, rareTools, 1, weaknessTags, selectedIds);
      if (picked.length > 0) toolDef = picked[0];
    } else {
      // Pick weighted from common
      const picked = pickUniqueWeighted(rng, commonTools, 1, weaknessTags, selectedIds);
      if (picked.length > 0) toolDef = picked[0];
    }

    if (!toolDef) {
      continue;
    }

    selectedIds.add(toolDef.id);
    const tool = createToolInstance(toolDef.id);
    options.push({
      label: tool.name,
      description: getToolDescription(tool),
      item: tool,
    });
  }

  return options;
}

// ============================================================================
// T089: Mole Den (L1)
// Night only: Skip to Day, restore all HP
// ============================================================================

function generateMoleDenOptions(state: GameState): POIOption[] {
  const isNight = state.time.phase === TimePhase.Night;

  if (!isNight) {
    return [
      {
        label: 'Rest (Night only)',
        disabled: true,
        disabledReason: 'Can only rest during Night',
      },
    ];
  }

  return [
    {
      label: 'Rest until morning (Full heal)',
    },
    {
      label: 'Leave',
    },
  ];
}

// ============================================================================
// T090: Rest Alcove (L5)
// Night only: Skip to Day, restore 10 HP
// ============================================================================

function generateRestAlcoveOptions(state: GameState): POIOption[] {
  const isNight = state.time.phase === TimePhase.Night;

  if (!isNight) {
    return [
      {
        label: 'Rest (Night only)',
        disabled: true,
        disabledReason: 'Can only rest during Night',
      },
    ];
  }

  return [
    {
      label: 'Rest until morning (+10 HP)',
    },
    {
      label: 'Leave',
    },
  ];
}

// ============================================================================
// T091: Survey Beacon (L6)
// Reveal tiles in radius 13
// ============================================================================

function generateSurveyBeaconOptions(): POIOption[] {
  return [
    {
      label: 'Activate beacon (Reveal area)',
    },
    {
      label: 'Leave',
    },
  ];
}

// ============================================================================
// T092: Seismic Scanner (L7)
// Choose from up to 3 random POI types to reveal a random instance
// ============================================================================

function generateSeismicScannerOptions(state: GameState): POIOption[] {
  // Get unique POI types on the map (excluding current position and already discovered)
  const poiTypes = new Set<POIId>();
  for (const poi of state.map.pois) {
    if (!poi.visited && poi.definitionId !== 'L1') {
      // Exclude Mole Den
      poiTypes.add(poi.definitionId);
    }
  }

  const options: POIOption[] = [];
  const poiTypeList = Array.from(poiTypes);
  const rng = new SeededRNG(state.rngState);

  for (let i = poiTypeList.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [poiTypeList[i], poiTypeList[j]] = [poiTypeList[j], poiTypeList[i]];
  }

  const selections = poiTypeList.slice(0, 3);
  for (const poiId of selections) {
    const def = getPOIDefinition(poiId);
    options.push({
      label: `${def.emoji} Find ${def.name}`,
    });
  }

  if (options.length === 0) {
    options.push({
      label: 'No POIs to reveal',
      disabled: true,
      disabledReason: 'All POIs already discovered',
    });
  }

  options.push({ label: 'Leave' });
  return options;
}

// ============================================================================
// T093: Rail Waypoint (L8)
// Fast travel between discovered waypoints
// ============================================================================

function generateRailWaypointOptions(state: GameState): POIOption[] {
  // Find all discovered/visible Rail Waypoints
  const waypoints = state.map.pois.filter(
    (poi) =>
      poi.definitionId === 'L8' &&
      (poi.discovered || state.map.fog[poi.position.y][poi.position.x] !== FogState.Hidden)
  );

  const currentPos = state.player.position;
  const options: POIOption[] = [];

  for (const wp of waypoints) {
    // Don't show current waypoint
    if (wp.position.x === currentPos.x && wp.position.y === currentPos.y) {
      continue;
    }
    options.push({
      label: `Travel to (${wp.position.x}, ${wp.position.y})`,
    });
  }

  if (options.length === 0) {
    options.push({
      label: 'No other waypoints discovered',
      disabled: true,
      disabledReason: 'Discover more waypoints to fast travel',
    });
  }

  options.push({ label: 'Leave' });
  return options;
}

// ============================================================================
// T094: Smuggler Hatch (L9)
// Shop: 5 Rare + 1 Heroic items
// ============================================================================

function generateSmugglerHatchOptions(state: GameState, rng: SeededRNG): POIOption[] {
  const rareGear = getGearByRarity('RARE');
  const heroicGear = getGearByRarity('HEROIC');
  const options: POIOption[] = [];

  // Generate 5 unique rare items
  const pickedRareGear = pickUniqueById(rng, rareGear, 5, (gearDef) => gearDef.id);
  for (const gearDef of pickedRareGear) {
    const gear = createGearInstance(gearDef.id);
    const cost = calculateItemCost(gear);
    const canAfford = state.player.stats.gold >= cost;
    options.push({
      label: `${gear.emoji} ${gear.name} (${cost}g)`,
      item: gear,
      cost,
      disabled: !canAfford,
      disabledReason: canAfford ? undefined : 'Not enough gold',
    });
  }

  // Generate 1 heroic item
  if (heroicGear.length > 0) {
    const heroicDef = rng.pick(heroicGear);
    const heroicItem = createGearInstance(heroicDef.id);
    const heroicCost = calculateItemCost(heroicItem);
    const canAffordHeroic = state.player.stats.gold >= heroicCost;
    options.push({
      label: `${heroicItem.emoji} ${heroicItem.name} (${heroicCost}g)`,
      item: heroicItem,
      cost: heroicCost,
      disabled: !canAffordHeroic,
      disabledReason: canAffordHeroic ? undefined : 'Not enough gold',
    });
  }

  // Reroll option
  const rerollCost = 5;
  const canReroll = state.player.stats.gold >= rerollCost;
  options.push({
    label: `Reroll shop (${rerollCost}g)`,
    cost: rerollCost,
    disabled: !canReroll,
    disabledReason: canReroll ? undefined : 'Not enough gold',
  });

  options.push({ label: 'Leave' });
  return options;
}

/**
 * Calculate item cost based on rarity
 */
function calculateItemCost(item: Gear | Tool): number {
  const rarity = 'currentRarity' in item ? item.currentRarity : item.rarity;
  switch (rarity) {
    case 'COMMON':
      return 5;
    case 'GILDED':
      return 10;
    case 'DIAMOND':
      return 20;
    case 'RARE':
      return 15;
    case 'HEROIC':
      return 30;
    case 'MYTHIC':
      return 50;
    default:
      return 10;
  }
}

// ============================================================================
// T095: Tool Oil Rack (L4)
// Modify tool: +1 ATK/ARM/DIG (once per tool)
// ============================================================================

function generateToolOilRackOptions(state: GameState): POIOption[] {
  const tool = state.player.equippedTool;

  if (!tool) {
    return [
      {
        label: 'No tool equipped',
        disabled: true,
        disabledReason: 'Equip a tool first',
      },
    ];
  }

  const allOptions: { option: POIOption; id: string }[] = [
    {
      id: 'ATK',
      option: {
        label: '+1 ATK',
        description: 'Increase attack power.\nDeal more damage in combat.',
      },
    },
    {
      id: 'ARM',
      option: {
        label: '+1 ARM',
        description: 'Increase armor.\nReduce damage taken in combat.',
      },
    },
    {
      id: 'DIG',
      option: {
        label: '+1 DIG',
        description: 'Increase dig speed.\nBreak walls faster.',
      },
    },
    {
      id: 'SPD',
      option: {
        label: '+1 SPD',
        description: 'Increase speed.\nAct sooner in combat.',
      },
    },
  ];

  // Randomly select 3 unique options
  const rng = new SeededRNG(state.rngState);
  const selectedOptions: POIOption[] = [];
  const available = [...allOptions];

  while (selectedOptions.length < 3 && available.length > 0) {
    const index = rng.nextInt(0, available.length - 1);
    selectedOptions.push(available[index].option);
    available.splice(index, 1);
  }

  return selectedOptions;
}

// ============================================================================
// T096: Rusty Anvil (L10)
// Upgrade tool tier (Common -> Gilded -> Diamond)
// Cost: 8g (to Gilded), 16g (to Diamond)
// ============================================================================

function generateRustyAnvilOptions(state: GameState): POIOption[] {
  const tool = state.player.equippedTool;

  if (!tool) {
    return [
      {
        label: 'No tool equipped',
        disabled: true,
        disabledReason: 'Equip a tool first',
      },
      { label: 'Leave' },
    ];
  }

  const rarity = tool.rarity;
  let nextRarity: ItemRarity | null = null;
  let cost = 0;

  if (rarity === 'COMMON') {
    nextRarity = 'GILDED';
    cost = 8;
  } else if (rarity === 'GILDED') {
    nextRarity = 'DIAMOND';
    cost = 16;
  }

  const options: POIOption[] = [];

  if (nextRarity) {
    const canAfford = state.player.stats.gold >= cost;
    options.push({
      label: `Upgrade to ${nextRarity}`,
      description: 'Increases stats multiplier',
      cost,
      disabled: !canAfford,
      disabledReason: canAfford ? undefined : 'Not enough gold',
    });
  } else {
    options.push({
      label: 'Max Upgrade Reached',
      disabled: true,
      disabledReason: 'Tool cannot be upgraded further',
    });
  }

  options.push({ label: 'Leave' });
  return options;
}

// ============================================================================
// T097: Rune Kiln (L11)
// Fuse 2 identical items to upgrade tier (Common->Gilded->Diamond)
// ============================================================================

function generateRuneKilnOptions(state: GameState): POIOption[] {
  const options: POIOption[] = [];

  // Find pairs of identical items that can be fused
  const gearCounts = new Map<GearId, { count: number; rarity: ItemRarity }>();
  for (const slot of state.player.inventory) {
    const { id, currentRarity } = slot.item;
    // Only Common and Gilded can be upgraded
    if (currentRarity === 'COMMON' || currentRarity === 'GILDED') {
      const key = id;
      const existing = gearCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        gearCounts.set(key, { count: 1, rarity: currentRarity });
      }
    }
  }

  // Create fusion options for pairs
  for (const [gearId, info] of gearCounts) {
    if (info.count >= 2) {
      const def = GEAR_DEFINITIONS[gearId];
      const nextRarity = info.rarity === 'COMMON' ? 'GILDED' : 'DIAMOND';
      const previewGear = createGearInstance(gearId, info.rarity);
      options.push({
        label: `${def.emoji} Fuse 2x ${def.name} -> ${nextRarity}`,
        item: previewGear,
      });
    }
  }

  if (options.length === 0) {
    options.push({
      label: 'No items to fuse',
      disabled: true,
      disabledReason: 'Need 2 identical Common or Gilded items',
    });
  }

  options.push({ label: 'Leave' });
  return options;
}

// ============================================================================
// T098: Geode Vault (L12)
// Pick 1 of 3 Heroic items
// ============================================================================

function generateGeodeVaultOptions(state: GameState, rng: SeededRNG): POIOption[] {
  const heroicGear = getGearByRarity('HEROIC');
  const weekBossId = state.time.weekBoss;
  const weaknessTags = getBossWeaknessTags(weekBossId);
  const options: POIOption[] = [];

  if (heroicGear.length === 0) {
    return [];
  }

  // Generate 3 heroic items weighted by weakness
  const pickedGear = pickUniqueWeighted(rng, heroicGear, 3, weaknessTags);

  for (const gearDef of pickedGear) {
    const gear = createGearInstance(gearDef.id);
    options.push({
      label: gear.name,
      description: getGearDescription(gear),
      item: gear,
    });
  }

  return options;
}

// ============================================================================
// T086: Counter Cache (L13)
// Pick 1 of 3 items from boss weakness tags only
// ============================================================================

function generateCounterCacheOptions(state: GameState, rng: SeededRNG): POIOption[] {
  const weekBossId = state.time.weekBoss;
  const weaknessTags = getBossWeaknessTags(weekBossId);
  const options: POIOption[] = [];

  // Filter gear by weakness tags
  const validGear = Object.values(GEAR_DEFINITIONS).filter((def) => {
    // Check if gear has one of the weakness tags
    return def.tags.some((tag) => weaknessTags.includes(tag));
  });

  if (validGear.length === 0) {
    return [];
  }

  // Generate 3 unique items
  const pickedGear = pickUniqueById(rng, validGear, 3, (gearDef) => gearDef.id);
  for (const gearDef of pickedGear) {
    const gear = createGearInstance(gearDef.id);
    options.push({
      label: gear.name,
      description: getGearDescription(gear),
      item: gear,
    });
  }

  return options;
}

// ============================================================================
// T087: Scrap Chute (L14)
// Destroy 1 Gear item (costs Gold by act)
// ============================================================================

function generateScrapChuteOptions(state: GameState): POIOption[] {
  const options: POIOption[] = [];
  const inventory = state.player.inventory;

  // Cost based on Act (approximate via week/cycle)
  // Act 1: 5g, Act 2: 10g, etc.
  // Using simplified cost for now: 5 * Week
  const scrapCost = 5 * state.time.week;

  if (inventory.length === 0) {
    options.push({
      label: 'No gear to scrap',
      disabled: true,
      disabledReason: 'Inventory is empty',
    });
  } else {
    for (const slot of inventory) {
      const gear = slot.item;
      const canAfford = state.player.stats.gold >= scrapCost;
      options.push({
        label: `Scrap ${gear.name} (-${scrapCost}g)`,
        description: getGearDescription(gear),
        item: gear,
        cost: scrapCost,
        disabled: !canAfford,
        disabledReason: canAfford ? undefined : 'Not enough gold',
      });
    }
  }

  options.push({ label: 'Leave' });
  return options;
}

// ============================================================================
// POI Effect Application
// ============================================================================

/**
 * Apply the effects of selecting a POI option
 * @returns Updated game state after applying effects
 */
export function applyPOIOption(state: GameState, optionIndex: number): GameState {
  const { activePOI } = state;
  if (!activePOI || !activePOI.options) {
    return state;
  }

  const option = activePOI.options[optionIndex];
  if (!option || option.disabled) {
    return state;
  }

  const poiId = activePOI.poi.definitionId as POIId;

  switch (poiId) {
    case 'L1':
      return applyMoleDenEffect(state, optionIndex);
    case 'L2':
    case 'L3':
    case 'L12':
    case 'L13':
      return applyItemSelectionEffect(state, option);
    case 'L4':
      return applyToolOilRackEffect(state, optionIndex);
    case 'L5':
      return applyRestAlcoveEffect(state, optionIndex);
    case 'L6':
      return applySurveyBeaconEffect(state, optionIndex);
    case 'L7':
      return applySeismicScannerEffect(state, optionIndex);
    case 'L8':
      return applyRailWaypointEffect(state, optionIndex);
    case 'L9':
      return applySmugglerHatchEffect(state, optionIndex, option);
    case 'L10':
      return applyRustyAnvilEffect(state, optionIndex, option);
    case 'L11':
      return applyRuneKilnEffect(state, optionIndex);
    case 'L14':
      return applyScrapChuteEffect(state, optionIndex, option);
    default:
      return state;
  }
}

// ============================================================================
// Individual Effect Handlers
// ============================================================================

/**
 * Mole Den: Skip to Day, restore all HP
 */
function applyMoleDenEffect(state: GameState, optionIndex: number): GameState {
  if (optionIndex !== 0) {
    // Leave option
    return state;
  }

  // Skip to next day and full heal
  const newTime = skipToNextDay(state.time);
  const newPlayer = {
    ...state.player,
    baseStats: {
      ...state.player.baseStats,
      hp: state.player.stats.maxHp,
    },
    stats: {
      ...state.player.stats,
      hp: state.player.stats.maxHp,
    },
  };

  return {
    ...state,
    time: newTime,
    player: newPlayer,
  };
}

/**
 * Rest Alcove: Skip to Day, restore 10 HP
 */
function applyRestAlcoveEffect(state: GameState, optionIndex: number): GameState {
  if (optionIndex !== 0) {
    return state;
  }

  const newTime = skipToNextDay(state.time);
  const newHp = Math.min(state.player.stats.hp + 10, state.player.stats.maxHp);
  const newPlayer = {
    ...state.player,
    baseStats: {
      ...state.player.baseStats,
      hp: newHp,
    },
    stats: {
      ...state.player.stats,
      hp: newHp,
    },
  };

  return {
    ...state,
    time: newTime,
    player: newPlayer,
  };
}

/**
 * Item Selection (Supply Cache, Tool Crate, Geode Vault)
 */
function applyItemSelectionEffect(state: GameState, option: POIOption): GameState {
  if (!option.item) {
    return state;
  }

  // Check if it's a tool or gear
  if ('rarity' in option.item && !('currentRarity' in option.item)) {
    // It's a tool
    return {
      ...state,
      player: equipTool(state.player, option.item as Tool),
    };
  }

  // It's gear - add to inventory
  const gear = option.item as Gear;
  const updatedPlayer = addGearToInventory(state.player, gear);
  if (!updatedPlayer) {
    return state; // Inventory full
  }

  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Tool Oil Rack: +1 ATK/ARM/DIG
 */
function applyToolOilRackEffect(state: GameState, optionIndex: number): GameState {
  const { activePOI } = state;
  const tool = state.player.equippedTool;

  if (!tool || !activePOI || !activePOI.options || optionIndex >= activePOI.options.length) {
    return state;
  }

  const selectedOption = activePOI.options[optionIndex];
  const newStats = { ...tool.stats };
  let oil: ToolOil | null = null;

  if (selectedOption.label.includes('+1 ATK')) {
    newStats.atk = (newStats.atk ?? 0) + 1;
    oil = 'ATK';
  } else if (selectedOption.label.includes('+1 ARM')) {
    newStats.arm = (newStats.arm ?? 0) + 1;
    oil = 'ARM';
  } else if (selectedOption.label.includes('+1 DIG')) {
    newStats.dig = (newStats.dig ?? 0) + 1;
    oil = 'DIG';
  } else if (selectedOption.label.includes('+1 SPD')) {
    newStats.spd = (newStats.spd ?? 0) + 1;
    oil = 'SPD';
  }

  return {
    ...state,
    player: refreshPlayerStats({
      ...state.player,
      equippedTool: {
        ...tool,
        stats: newStats,
        oil,
      },
    }),
  };
}

/**
 * Survey Beacon: Reveal tiles in radius 13
 */
function applySurveyBeaconEffect(state: GameState, optionIndex: number): GameState {
  if (optionIndex !== 0) {
    return state;
  }

  return activateSurveyBeacon(state);
}

/**
 * Activates the Survey Beacon effect directly (Reveal tiles in radius 13)
 */
export function activateSurveyBeacon(state: GameState): GameState {
  const playerPos = state.player.position;
  const radius = 13;
  const newFog = state.map.fog.map((row) => [...row]);
  const visibleKeys = new Set<string>();

  // Reveal all tiles within radius
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= radius) {
        const x = playerPos.x + dx;
        const y = playerPos.y + dy;
        if (x >= 0 && x < state.map.width && y >= 0 && y < state.map.height) {
          if (newFog[y][x] === FogState.Hidden) {
            newFog[y][x] = FogState.Revealed;
          }
          visibleKeys.add(`${x},${y}`);
        }
      }
    }
  }

  const updatedEnemies = state.map.enemies.map((enemy) => {
    const key = `${enemy.position.x},${enemy.position.y}`;
    if (visibleKeys.has(key)) {
      return { ...enemy, discovered: true };
    }
    return enemy;
  });

  return {
    ...state,
    map: {
      ...state.map,
      fog: newFog,
      enemies: updatedEnemies,
    },
  };
}

/**
 * Seismic Scanner: Reveal a random instance of selected POI type
 */
function applySeismicScannerEffect(state: GameState, optionIndex: number): GameState {
  const options = state.activePOI?.options;
  if (!options) {
    return state;
  }

  // Check if Leave option
  if (options[optionIndex]?.label === 'Leave') {
    return state;
  }

  // Get the POI type from the option label
  const option = options[optionIndex];
  if (!option || option.disabled) {
    return state;
  }

  // Find the POI type from label
  const poiTypes = Object.values(POI_DEFINITIONS);
  const selectedPOI = poiTypes.find((poi) => option.label.includes(poi.name));

  if (!selectedPOI) {
    return state;
  }

  const candidates = state.map.pois.filter((poi) => {
    if (poi.definitionId !== selectedPOI.id || poi.visited) {
      return false;
    }
    return state.map.fog[poi.position.y][poi.position.x] === FogState.Hidden;
  });

  if (candidates.length === 0) {
    return state;
  }

  const rng = new SeededRNG(state.rngState + 1);
  const selected = rng.pick(candidates);

  // Reveal the POI and surrounding tiles
  const newFog = state.map.fog.map((row) => [...row]);
  const revealRadius = 1;

  for (let dy = -revealRadius; dy <= revealRadius; dy++) {
    for (let dx = -revealRadius; dx <= revealRadius; dx++) {
      const x = selected.position.x + dx;
      const y = selected.position.y + dy;
      if (x >= 0 && x < state.map.width && y >= 0 && y < state.map.height) {
        if (newFog[y][x] === FogState.Hidden) {
          newFog[y][x] = FogState.Revealed;
        }
      }
    }
  }

  return {
    ...state,
    rngState: state.rngState + 1,
    map: {
      ...state.map,
      fog: newFog,
    },
  };
}

/**
 * Rail Waypoint: Fast travel to another waypoint
 */
function applyRailWaypointEffect(state: GameState, optionIndex: number): GameState {
  const options = state.activePOI?.options;
  if (!options) {
    return state;
  }

  // Check if Leave option
  if (options[optionIndex]?.label === 'Leave') {
    return state;
  }

  const option = options[optionIndex];
  if (!option || option.disabled) {
    return state;
  }

  // Parse coordinates from label "Travel to (x, y)"
  const match = option.label.match(/\((\d+), (\d+)\)/);
  if (!match) {
    return state;
  }

  const targetX = parseInt(match[1], 10);
  const targetY = parseInt(match[2], 10);

  return {
    ...state,
    player: {
      ...state.player,
      position: { x: targetX, y: targetY },
    },
  };
}

/**
 * Smuggler Hatch: Purchase item or reroll
 */
function applySmugglerHatchEffect(
  state: GameState,
  optionIndex: number,
  option: POIOption
): GameState {
  if (option.label === 'Leave' || option.disabled) {
    return state;
  }

  const cost = option.cost ?? 0;

  // Deduct gold
  if (state.player.stats.gold < cost) {
    return state;
  }

  const newState = {
    ...state,
    player: {
      ...state.player,
      baseStats: {
        ...state.player.baseStats,
        gold: state.player.baseStats.gold - cost,
      },
      stats: {
        ...state.player.stats,
        gold: state.player.stats.gold - cost,
      },
    },
  };

  // Check if reroll option
  if (option.label.includes('Reroll')) {
    // Regenerate shop options with new RNG state
    const rng = new SeededRNG(state.rngState + 1);
    const newOptions = generateSmugglerHatchOptions(newState, rng);
    return {
      ...newState,
      rngState: state.rngState + 1,
      activePOI: state.activePOI ? { ...state.activePOI, options: newOptions } : null,
    };
  }

  // Add item to inventory
  if (option.item) {
    return applyItemSelectionEffect(newState, option);
  }

  return newState;
}

/**
 * Rusty Anvil: Apply forge mod to tool (Upgrade Tier)
 */
function applyRustyAnvilEffect(
  state: GameState,
  optionIndex: number,
  option: POIOption
): GameState {
  const tool = state.player.equippedTool;
  // If Leave or Max Upgrade (disabled)
  if (!tool || option.label === 'Leave' || option.disabled) {
    return state;
  }

  const cost = option.cost ?? 0;
  if (state.player.stats.gold < cost) {
    return state;
  }

  // Determine next rarity based on current
  let nextRarity: ItemRarity = tool.rarity;
  if (tool.rarity === 'COMMON') nextRarity = 'GILDED';
  else if (tool.rarity === 'GILDED') nextRarity = 'DIAMOND';
  else return state; // Should not happen if options generated correctly

  // Calculate new stats: Base * Multiplier + Oil Bonus
  const baseDef = TOOL_DEFINITIONS[tool.id];
  const multiplier = RARITY_MULTIPLIER[nextRarity];
  const newStats: ItemStats = {};

  // Base stats * multiplier
  if (baseDef.stats.atk) newStats.atk = Math.floor(baseDef.stats.atk * multiplier);
  if (baseDef.stats.arm) newStats.arm = Math.floor(baseDef.stats.arm * multiplier);
  if (baseDef.stats.spd) newStats.spd = Math.floor(baseDef.stats.spd * multiplier);
  if (baseDef.stats.dig) newStats.dig = Math.floor(baseDef.stats.dig * multiplier);
  if (baseDef.stats.hp) newStats.hp = Math.floor(baseDef.stats.hp * multiplier);

  // Re-apply Oil bonus if present
  if (tool.oil === 'ATK') newStats.atk = (newStats.atk ?? 0) + 1;
  if (tool.oil === 'ARM') newStats.arm = (newStats.arm ?? 0) + 1;
  if (tool.oil === 'DIG') newStats.dig = (newStats.dig ?? 0) + 1;
  if (tool.oil === 'SPD') newStats.spd = (newStats.spd ?? 0) + 1;

  return {
    ...state,
    player: refreshPlayerStats({
      ...state.player,
      baseStats: {
        ...state.player.baseStats,
        gold: state.player.baseStats.gold - cost,
      },
      equippedTool: {
        ...tool,
        rarity: nextRarity,
        stats: newStats,
      },
    }),
  };
}

/**
 * Rune Kiln: Fuse 2 identical items
 */
function applyRuneKilnEffect(state: GameState, optionIndex: number): GameState {
  const options = state.activePOI?.options;
  if (!options) {
    return state;
  }

  const option = options[optionIndex];
  if (!option || option.disabled || option.label === 'Leave') {
    return state;
  }

  const optionGear = option.item && 'currentRarity' in option.item ? option.item : null;
  const gearDef = optionGear
    ? GEAR_DEFINITIONS[optionGear.id]
    : Object.values(GEAR_DEFINITIONS).find((g) => option.label.includes(g.name));
  if (!gearDef) {
    return state;
  }

  // Find the first two items of this type
  const slotsToRemove: number[] = [];
  let currentRarity: ItemRarity = 'COMMON';

  for (const slot of state.player.inventory) {
    if (slot.item.id === gearDef.id && slotsToRemove.length < 2) {
      slotsToRemove.push(slot.index);
      currentRarity = slot.item.currentRarity;
    }
  }

  if (slotsToRemove.length < 2) {
    return state;
  }

  // Remove the two items
  const newInventory = state.player.inventory.filter((slot) => !slotsToRemove.includes(slot.index));

  // Add the upgraded item
  const nextRarity: ItemRarity = currentRarity === 'COMMON' ? 'GILDED' : 'DIAMOND';
  const upgradedGear = createGearInstance(gearDef.id, nextRarity);

  // Find next available slot
  const usedIndices = new Set(newInventory.map((s) => s.index));
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  return {
    ...state,
    player: refreshPlayerStats({
      ...state.player,
      inventory: [...newInventory, { item: upgradedGear, index: nextIndex }],
    }),
  };
}

/**
 * Scrap Chute: Destroy gear for gold
 */
function applyScrapChuteEffect(
  state: GameState,
  optionIndex: number,
  option: POIOption
): GameState {
  if (option.label === 'Leave' || option.disabled || !option.item) {
    return state;
  }

  const gearId = option.item.id;
  const cost = option.cost ?? 0;

  if (state.player.stats.gold < cost) {
    return state;
  }

  // Remove the specific item instance
  // Since we don't have unique instance IDs in inventory (just definition ID + rarity),
  // and inventory is slots, we should try to match by slot index if we had it.
  // But POIOption doesn't store slot index.
  // We'll remove the first matching item. This might be slightly inaccurate if duplicates exist,
  // but acceptable for MVP given uniqueness constraints elsewhere.
  // Actually, wait, `generateScrapChuteOptions` iterates inventory.
  // We can pass the gear object reference from inventory.
  // `state.player.inventory` contains `{ item: Gear, index: number }`.
  // `option.item` is the Gear object.
  // If we assume `option.item` IS the object reference from inventory (which it is in `generateScrapChuteOptions`),
  // we can find the slot by object equality.

  const slotIndex = state.player.inventory.findIndex((slot) => slot.item === option.item);

  if (slotIndex === -1) {
    // Should not happen if object reference is preserved
    return state;
  }

  const newInventory = [...state.player.inventory];
  newInventory.splice(slotIndex, 1);

  return {
    ...state,
    player: refreshPlayerStats({
      ...state.player,
      baseStats: {
        ...state.player.baseStats,
        gold: state.player.baseStats.gold - cost,
      },
      inventory: newInventory,
    }),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Skip to the next Day from Night
 */
function skipToNextDay(time: TimeState): TimeState {
  if (time.phase !== TimePhase.Night) {
    return time;
  }

  // If Night 3, go to Boss
  if (time.cycle === 3) {
    return {
      ...time,
      phase: TimePhase.Boss,
      movesRemaining: 0,
    };
  }

  // Go to next Day
  return {
    ...time,
    phase: TimePhase.Day,
    cycle: (time.cycle + 1) as 1 | 2 | 3,
    movesRemaining: 50, // DAY_MOVES
  };
}

/**
 * Mark a POI as visited on the map
 */
export function markPOIVisited(map: GameMap, poiId: string): GameMap {
  return {
    ...map,
    pois: map.pois.map((poi) => (poi.id === poiId ? { ...poi, visited: true } : poi)),
  };
}

/**
 * Mark a POI as discovered on the map
 */
export function markPOIDiscovered(map: GameMap, poiId: string): GameMap {
  return {
    ...map,
    pois: map.pois.map((poi) => (poi.id === poiId ? { ...poi, discovered: true } : poi)),
  };
}

/**
 * Get all discovered Rail Waypoints from the map.
 */
export function getDiscoveredWaypoints(map: GameMap): MapPOI[] {
  return map.pois.filter((poi) => poi.definitionId === 'L8' && poi.discovered);
}

/**
 * Check if fast travel is available.
 */
export function canFastTravel(map: GameMap): boolean {
  return getDiscoveredWaypoints(map).length >= 2;
}

/**
 * Find POI at a given position
 */
export function findPOIAtPosition(map: GameMap, position: Position): MapPOI | null {
  return (
    map.pois.find((poi) => poi.position.x === position.x && poi.position.y === position.y) ?? null
  );
}

/**
 * Check if player is standing on a POI
 */
export function isPlayerOnPOI(state: GameState): boolean {
  return findPOIAtPosition(state.map, state.player.position) !== null;
}

/**
 * Get the POI at the player's current position
 */
export function getPOIAtPlayerPosition(state: GameState): MapPOI | null {
  return findPOIAtPosition(state.map, state.player.position);
}
