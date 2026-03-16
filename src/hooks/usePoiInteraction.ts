/**
 * usePoiInteraction Hook
 *
 * Handles POI (Point of Interest) interaction logic with on-chain dispatch.
 * POI interactions are explicit (require button press), not auto-triggered.
 * Manages sub-state machines for multi-step interactions (shops, item choices).
 *
 * @see spec.md for POI interaction requirements
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useGame, GamePhase } from '@/contexts/GameContext';
import { TimePhase } from '@/game/engine/types';
import { useSession } from '@/contexts/SessionContext';
import { useGameplayStateContext, type PoiData } from '@/contexts/GameplayStateContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createPoiSystemProgramWithProvider,
  createAnchorProvider,
  createGameplayStateProgram,
  createMapGeneratorProgram,
} from '@/services/solana/programs';
import { oilFlagToModification } from '@/services/solana/types/player_inventory';
import { useWallet } from '@/contexts/WalletContext';
import { useAudio } from '@/contexts/AudioContext';
import { deriveMapPoisPda, derivePoiVrfStatePda, deriveGameplayVrfStatePda, deriveSessionDiscoveryPda } from '@/services/solana/constants';
import { getGameStatePda, fetchGameState } from '@/services/solana/gameplayState';
import { buildRefreshDiscoveredEnemiesInstruction, buildRevealRadiusInstruction } from '@/services/solana/vrf';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { POI_TYPES } from '@/services/solana/types/poi_system';
import type {
  ItemOffer,
  PoiInteractionState,
  CacheOffer,
} from '@/services/solana/types/poi_system';
import { Phase } from '@/services/solana/types/gameplay_state';
import { parseBossCombatFromMoveTx } from '@/services/solana/eventParser';
import { getUserErrorMessage } from '@/services/solana/errors';
import {
  interactRest,
  interactPickItem,
  interactToolOilCombined,
  interactSurveyBeacon,
  generateScannerOffer,
  interactSeismicScanner,
  fastTravel,
  enterShop,
  shopPurchase,
  shopReroll,
  leaveShop,
  interactRustyAnvil,
  interactRuneKiln,
  interactScrapChute,
  generateCacheOffer,
  generateOilOffer,
  type PoiTransactionContext,
} from '@/services/solana/poiSystem';
import {
  fetchSessionDiscovery,
  type SessionDiscoveryData,
  type DiscoveryShopOffer,
  type DiscoveryOfferItem,
} from '@/services/solana/mapGeneratorClient';
import {
  decodeItemId,
  convertToolInstance,
  convertGearInstance,
  unpackDiscoveryTiles,
  convertDiscoveredEnemies,
  convertDiscoveredPois,
} from '@/services/solana/sessionRestore';
import { fetchInventory } from '@/services/solana/playerInventory';
import { createPlayerInventoryProgram } from '@/services/solana/programs';
import { deriveInventoryPda } from '@/services/solana/constants';
import { gearToBackend, toolToBackend } from '@/data/id-mapping';
import { createGearInstance } from '@/game/entities/items';
import { createToolInstance } from '@/game/entities/items';
import {
  generateRuneKilnOptions,
  generateRustyAnvilOptions,
  generateScrapChuteOptions,
} from '@/game/entities/pois';
import { getPOIDefinition } from '@/data/pois';
import type { GameState } from '@/game/engine/types';
import type { Position, POIOption, GearId, ToolId, Tool, Gear, ToolOil, POIId } from '@/game/engine/types';

// ============================================================================
// ER Position Retry Helper
// ============================================================================

/** poi-system error 6028 = PlayerNotOnPoiTile */
const ER_POSITION_MISMATCH_CODE = 6028;
const ER_POSITION_MAX_RETRIES = 3;
const ER_POSITION_BASE_DELAY_MS = 400;
const POI_DEBUG_LOGS = false;

function debugLog(...args: unknown[]) {
  if (__DEV__ && POI_DEBUG_LOGS) {
    console.log(...args);
  }
}

/**
 * Checks if an error is the on-chain "Player is not on the POI tile" error.
 * This can occur transiently on the MagicBlock ER when a POI interaction tx
 * arrives before the ER's execution engine has fully settled state from a
 * prior move_player transaction.
 */
function isPositionMismatchError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes(`"Custom":${ER_POSITION_MISMATCH_CODE}`) ||
      err.message.includes(`"Custom": ${ER_POSITION_MISMATCH_CODE}`)
    );
  }
  return false;
}

/**
 * Wraps an on-chain POI call with retries on error 6028.
 * Uses exponential backoff (400ms, 800ms, 1600ms) to give the ER time
 * to settle state from a prior move_player before retrying.
 */
async function withErPositionRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= ER_POSITION_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isPositionMismatchError(err) || attempt === ER_POSITION_MAX_RETRIES) {
        throw err;
      }
      lastErr = err;
      const delay = ER_POSITION_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `[usePoiInteraction] ER position not settled (error ${ER_POSITION_MISMATCH_CODE}), ` +
          `retry ${attempt + 1}/${ER_POSITION_MAX_RETRIES} after ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

function getDiscoveredTileDiff(
  before: number[] | undefined,
  after: number[] | undefined,
  width: number,
  height: number
): Position[] {
  if (!before || !after) {
    return [];
  }

  const positions: Position[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bitIndex = y * width + x;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      const beforeBit = ((before[byteIndex] ?? 0) >> bitOffset) & 1;
      const afterBit = ((after[byteIndex] ?? 0) >> bitOffset) & 1;
      if (!beforeBit && afterBit) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}

/**
 * Validates a poiIndex against fresh on-chain MapPois data.
 * The GameplayStateContext pois can be stale (e.g., ER state divergence,
 * connection switch), causing findPoiIndex to return an index that is
 * out of bounds or points to the wrong POI on-chain.
 *
 * Returns the validated (possibly re-derived) index, or -1 if not found.
 *
 * TODO: Replace this MapPois read with SessionDiscovery POI indices once
 * SessionDiscovery exposes position data for all POIs (currently only stores
 * discoveredPois which may not include the target POI before discovery).
 */
async function validatePoiIndex(
  _program: unknown,
  _mapPoisPda: unknown,
  poiIndex: number,
  x: number,
  y: number,
  contextLabel: string,
  sessionDiscoveryPda?: PublicKey,
  connection?: Connection
): Promise<{ index: number }> {
  // Use SessionDiscovery's discoveredPois (public) instead of MapPois (private).
  // Each DiscoveredPoi has a mapPoisIndex field — the on-chain MapPois array index.
  if (sessionDiscoveryPda && connection) {
    try {
      const discovery = await fetchSessionDiscovery(
        createMapGeneratorProgram(connection),
        sessionDiscoveryPda
      );
      if (discovery) {
        // Find the discovered POI at (x, y) and return its mapPoisIndex
        const allPois = discovery.discoveredPois.slice(0, discovery.discoveredPoiCount);
        console.log(
          `[validatePoiIndex] ${contextLabel}: searching for (${x},${y}) in ${allPois.length} discoveredPois:`,
          allPois.map((p, i) => `[${i}] type=${p.poiType} pos=(${p.x},${p.y}) idx=${p.mapPoisIndex} used=${p.used}`)
        );
        for (let i = 0; i < discovery.discoveredPoiCount; i++) {
          const dp = discovery.discoveredPois[i];
          if (dp && dp.x === x && dp.y === y) {
            console.log(`[validatePoiIndex] ${contextLabel}: found mapPoisIndex=${dp.mapPoisIndex} for (${x},${y})`);
            return { index: dp.mapPoisIndex };
          }
        }
        console.warn(
          `[usePoiInteraction] ${contextLabel}: POI at (${x},${y}) not found in SessionDiscovery`
        );
      }
    } catch (err) {
      console.warn(`[usePoiInteraction] ${contextLabel}: SessionDiscovery fetch failed:`, err);
    }
  }
  // Fallback: return hint index as-is
  return { index: poiIndex };
}

// ============================================================================
// Types
// ============================================================================

export interface PoiInteractionHookState {
  /** Whether player can interact with a POI at current position */
  canInteract: boolean;
  /** Whether POI should auto-open (false if preconditions not met, e.g., no inventory space) */
  shouldAutoOpen: boolean;
  /** The POI at current position (if any) */
  currentPoi: PoiData | undefined;
  /** Whether interaction is in progress */
  isInteracting: boolean;
  /** Error message if any */
  error: string | null;
  /** Current interaction sub-state */
  interactionState: PoiInteractionState;
  /** Shop offers (when in shop) */
  shopOffers: ItemOffer[];
  /** Shop reroll count */
  shopRerollCount: number;
}

export interface UsePoiInteractionResult extends PoiInteractionHookState {
  /** Attempt to interact with POI at current position */
  interact: (params?: PoiInteractParams) => Promise<{ success: boolean; result?: unknown }>;
  /** Check if there's a POI at a specific position */
  hasPoiAt: (x: number, y: number) => boolean;
  /** Get POI data at a specific position */
  getPoiAt: (x: number, y: number) => PoiData | undefined;
  /** Clear error state */
  clearError: () => void;
  /** Purchase item from shop */
  purchaseItem: (offerIndex: number) => Promise<{ success: boolean }>;
  /** Reroll shop offers */
  rerollShop: (seed: bigint) => Promise<{ success: boolean }>;
  /** Exit the shop */
  exitShop: () => Promise<{ success: boolean }>;
  /** Fast travel to another waypoint */
  travelToWaypoint: (fromPoiIndex: number, toPoiIndex: number) => Promise<{ success: boolean }>;
  /** Execute fast travel from current position to a destination position */
  executeFastTravel: (
    fromPos: Position,
    toPos: Position
  ) => Promise<{ success: boolean; newState?: any; error?: string }>;
  /** On-chain cache offers for pick-item POIs (overrides local options) */
  cacheOfferOptions: POIOption[] | null;
  /** Select a cache offer option (sends on-chain interactPickItem) */
  selectCacheOffer: (choiceIndex: number) => Promise<{ success: boolean; error?: string }>;
  /** Clear cache offers state */
  clearCacheOffers: () => void;
  /** Confirm a deferred POI selection on-chain (Tool Oil, Scanner, Shop) */
  confirmPoiSelection: (
    optionIndex: number
  ) => Promise<{
    success: boolean;
    keepOpen?: boolean;
    error?: string;
    bossResolved?: {
      playerWon: boolean;
      finalPlayerHp: number;
      finalPlayerGold: number;
      totalMoves: number;
      phase: number;
      preBossPlayerHp?: number;
      turnsTaken?: number;
      finalEnemyHp?: number;
      signature?: string;
    };
  }>;
  /** POI type of the current deferred selection (null if none) */
  deferredPoiType: number | null;
}

export interface PoiInteractParams {
  /** Choice index for pick-item POIs (0-2) */
  choiceIndex?: number;
  /** Tool oil modification type */
  oilModification?: number;
  /** Current tool oil flags */
  currentOilFlags?: number;
  /** Item ID for upgrade/scrap/fuse */
  itemId?: Uint8Array;
  /** Current item tier for upgrade */
  currentTier?: number;
  /** Second item for fuse (Rune Kiln) */
  item2Id?: Uint8Array;
  item2Tier?: number;
  /** Seismic scanner category */
  scanCategory?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Night-only POI types */
const NIGHT_ONLY_POIS: Set<number> = new Set([POI_TYPES.MOLE_DEN, POI_TYPES.REST_ALCOVE]);

/** One-time use POI types */
const ONE_TIME_POIS: Set<number> = new Set([
  POI_TYPES.MOLE_DEN,
  POI_TYPES.SUPPLY_CACHE,
  POI_TYPES.TOOL_CRATE,
  POI_TYPES.TOOL_OIL_RACK,
  POI_TYPES.REST_ALCOVE,
  POI_TYPES.SURVEY_BEACON,
  POI_TYPES.SEISMIC_SCANNER,
  POI_TYPES.GEODE_VAULT,
  POI_TYPES.COUNTER_CACHE,
]);

function isOneTimePoiType(poiType: number | null | undefined): boolean {
  return poiType !== null && poiType !== undefined && ONE_TIME_POIS.has(poiType);
}

/** Pick-item POI types that use two-step on-chain flow (generate → pick) */
const PICK_ITEM_POIS: Set<number> = new Set([
  POI_TYPES.SUPPLY_CACHE,
  POI_TYPES.TOOL_CRATE,
  POI_TYPES.GEODE_VAULT,
  POI_TYPES.COUNTER_CACHE,
]);

/** POI types where interact() defers the transaction until user picks an option */
const DEFERRED_SELECTION_POIS: Set<number> = new Set([
  POI_TYPES.MOLE_DEN,
  POI_TYPES.REST_ALCOVE,
  POI_TYPES.TOOL_OIL_RACK,
  POI_TYPES.SEISMIC_SCANNER,
  POI_TYPES.RAIL_WAYPOINT,
  POI_TYPES.SMUGGLER_HATCH,
  POI_TYPES.RUSTY_ANVIL,
]);

/** Tool oil flag constants (match on-chain OIL_FLAG_*) */
const OIL_FLAG_ATK = 0x01;
const OIL_FLAG_SPD = 0x02;
const OIL_FLAG_DIG = 0x04;
const OIL_FLAG_ARM = 0x08;

/** Map option label substring to oil modification flag */
function labelToOilFlag(label: string): number {
  if (label.includes('ATK')) return OIL_FLAG_ATK;
  if (label.includes('SPD')) return OIL_FLAG_SPD;
  if (label.includes('DIG')) return OIL_FLAG_DIG;
  if (label.includes('ARM')) return OIL_FLAG_ARM;
  return 0;
}

/** Map oil flag to ToolOil type and stat key */
function oilFlagToToolOil(
  oilFlag: number
): { oil: ToolOil; statKey: 'atk' | 'spd' | 'dig' | 'arm' } | null {
  switch (oilFlag) {
    case OIL_FLAG_ATK:
      return { oil: 'ATK', statKey: 'atk' };
    case OIL_FLAG_SPD:
      return { oil: 'SPD', statKey: 'spd' };
    case OIL_FLAG_DIG:
      return { oil: 'DIG', statKey: 'dig' };
    case OIL_FLAG_ARM:
      return { oil: 'ARM', statKey: 'arm' };
    default:
      return null;
  }
}

function poiTypeToPoiId(poiType: number): POIId | null {
  if (poiType >= 1 && poiType <= 14) {
    return `L${poiType}` as POIId;
  }
  return null;
}

function convertScannerOfferToOptions(poiTypes: number[]): POIOption[] {
  const options = poiTypes
    .map((poiType) => {
      const poiId = poiTypeToPoiId(poiType);
      if (!poiId) return null;
      const def = getPOIDefinition(poiId);
      return {
        label: `${def.emoji} Find ${def.name}`,
      } satisfies POIOption;
    })
    .filter((option): option is POIOption => option !== null);

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

function isNightPhase(phase: Phase): boolean {
  return phase === Phase.Night1 || phase === Phase.Night2 || phase === Phase.Night3;
}

// ============================================================================
// SessionDiscovery → MapPois Offer Adapters
// ============================================================================

/**
 * Convert DiscoveryShopOffer[] to ItemOffer[] (MapPois format).
 * SessionDiscovery uses number[] for itemId; ItemOffer uses Uint8Array.
 */
function discoveryShopOffersToItemOffers(offers: DiscoveryShopOffer[]): ItemOffer[] {
  return offers
    .filter((o) => o.itemId.some((b) => b !== 0)) // skip empty slots
    .map((o) => ({
      itemId: new Uint8Array(o.itemId),
      tier: o.tier,
      price: o.price,
      purchased: o.purchased !== 0,
    }));
}

/**
 * Convert DiscoveryOfferItem[] to CacheOffer format.
 * SessionDiscovery stores cache items flat; CacheOffer wraps them with poiIndex.
 */
function discoveryCacheItemsToCacheOffer(
  items: DiscoveryOfferItem[],
  poiIndex: number
): CacheOffer {
  return {
    poiIndex,
    items: items.map((item) => ({
      itemId: item.itemId,
      rarity: item.rarity,
      tier: item.tier,
    })),
    generatedAtSeed: BigInt(0),
  };
}

/**
 * Helper to fetch SessionDiscovery for offer reads.
 * Requires sessionDiscoveryPda and a connection to create the map generator program.
 */
async function fetchDiscoveryOffers(
  connection: import('@solana/web3.js').Connection,
  sessionPda: import('@solana/web3.js').PublicKey
): Promise<SessionDiscoveryData | null> {
  const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
  return fetchSessionDiscovery(createMapGeneratorProgram(connection), sdPda);
}

function extractCustomErrorCode(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const customMatch = message.match(/"Custom"\s*:\s*(\d+)/);
  if (customMatch) {
    return Number(customMatch[1]);
  }
  const hexMatch = message.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (hexMatch) {
    return Number.parseInt(hexMatch[1], 16);
  }
  return null;
}

function isPoiAlreadyUsedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    extractCustomErrorCode(error) === 6003 ||
    message.includes('PoiAlreadyUsed') ||
    message.includes('already been used')
  );
}

function isInvalidPoiIndexError(error: unknown): boolean {
  return extractCustomErrorCode(error) === 6017;
}

function isOfferAlreadyGeneratedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    extractCustomErrorCode(error) === 6025 ||
    message.includes('OfferAlreadyGenerated')
  );
}

function isIgnorableLeaveShopCloseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code = extractCustomErrorCode(error);
  return (
    code === 6011 || // ShopNotActive
    code === 6018 || // Unauthorized (session changed while closing modal)
    message.includes('ShopNotActive') ||
    message.includes('No active shop session') ||
    message.includes('Unauthorized')
  );
}

/**
 * Convert on-chain CacheOffer items to POIOption[] for the POI modal.
 * Decodes 8-byte item IDs, looks up gear/tool definitions, creates instances.
 */
function convertCacheOfferToOptions(cacheOffer: CacheOffer): POIOption[] {
  const options: POIOption[] = [];

  if (!cacheOffer.items || !Array.isArray(cacheOffer.items)) {
    console.error('[usePoiInteraction] cacheOffer.items is not an array:', cacheOffer.items);
    return options;
  }

  for (let i = 0; i < cacheOffer.items.length; i++) {
    const offerItem = cacheOffer.items[i];

    if (!offerItem || !offerItem.itemId) {
      continue;
    }

    const rawBytes = Array.isArray(offerItem.itemId)
      ? offerItem.itemId
      : Array.from(offerItem.itemId as unknown as Iterable<number>);
    const nonZeroBytes = rawBytes.filter((b) => b !== 0);

    // Skip empty slots (all zeros means item was filtered out by active_item_pool)
    if (nonZeroBytes.length === 0) {
      continue;
    }

    const engineId = decodeItemId(offerItem.itemId);
    if (!engineId) {
      const decodedStr = String.fromCharCode(...nonZeroBytes);
      console.warn('[usePoiInteraction] Unknown item ID in cache offer:', decodedStr);
      options.push({ label: 'Unknown Item', disabled: true });
      continue;
    }

    try {
      if (engineId.startsWith('T')) {
        // Tool
        const tool = createToolInstance(engineId as ToolId);
        options.push({
          label: tool.name,
          item: tool,
        });
      } else if (engineId.startsWith('I')) {
        // Gear - map on-chain rarity byte to ItemRarity
        // On-chain: 0=Common, 1=Rare, 2=Heroic, 3=Mythic
        const onChainRarityMap = ['COMMON', 'RARE', 'HEROIC', 'MYTHIC'] as const;
        const rarity = onChainRarityMap[offerItem.rarity] ?? 'COMMON';
        const gear = createGearInstance(engineId as GearId, rarity);
        options.push({
          label: gear.name,
          item: gear,
        });
      } else {
        options.push({ label: engineId, disabled: true });
      }
    } catch (err) {
      console.warn('[usePoiInteraction] Failed to create item instance:', engineId, err);
      options.push({ label: engineId, disabled: true });
    }
  }

  return options;
}

/**
 * Convert on-chain shop offers (ItemOffer[]) to POIOption[] for the Smuggler Hatch modal.
 * Decodes 8-byte item IDs, creates gear instances, adds cost/affordability info.
 */
function convertShopOffersToOptions(
  offers: ItemOffer[],
  rerollCount: number,
  playerGold: number
): POIOption[] {
  const options: POIOption[] = [];
  // Tier: 1=base rarity (use gear's baseRarity), 2=GILDED, 3=DIAMOND
  // Tier 1 means unupgraded — don't override the gear's base rarity
  const tierToRarity: Record<number, 'GILDED' | 'DIAMOND' | undefined> = { 1: undefined, 2: 'GILDED', 3: 'DIAMOND' };

  for (const offer of offers) {
    const engineId = decodeItemId(offer.itemId);
    if (!engineId) {
      options.push({ label: 'Unknown Item', disabled: true });
      continue;
    }

    try {
      const rarity = tierToRarity[offer.tier];
      const item = engineId.startsWith('T')
        ? createToolInstance(engineId as ToolId)
        : createGearInstance(engineId as GearId, rarity);
      const cost = offer.price;
      const canAfford = playerGold >= cost;

      options.push({
        label: offer.purchased ? `${item.name} (Sold)` : `${item.emoji} ${item.name} (${cost}g)`,
        item,
        cost: offer.purchased ? undefined : cost,
        disabled: offer.purchased || !canAfford,
        disabledReason: offer.purchased
          ? 'Already purchased'
          : !canAfford
            ? 'Not enough gold'
            : undefined,
      });
    } catch {
      options.push({ label: engineId, disabled: true });
    }
  }

  // Reroll option
  const hasRerollsRemaining = rerollCount < 3;
  const rerollCost = 4 + rerollCount * 2;
  const canReroll = hasRerollsRemaining && playerGold >= rerollCost;
  options.push({
    label: hasRerollsRemaining
      ? `Reroll shop (${rerollCost}g)`
      : 'Reroll shop (Limit reached)',
    cost: hasRerollsRemaining ? rerollCost : undefined,
    disabled: !canReroll,
    disabledReason: hasRerollsRemaining
      ? canReroll
        ? undefined
        : 'Not enough gold'
      : 'Maximum 3 rerolls per visit',
  });

  options.push({ label: 'Leave' });
  return options;
}

/**
 * Convert on-chain OilOffer (3 oil flags) to POIOption[] for the Tool Oil Rack modal.
 */
function convertOilOfferToOptions(oils: number[]): POIOption[] {
  const oilDescriptions: Record<number, { label: string; description: string }> = {
    [OIL_FLAG_ATK]: {
      label: '+1 ATK',
      description: 'Increase attack power.\nDeal more damage in combat.',
    },
    [OIL_FLAG_SPD]: {
      label: '+1 SPD',
      description: 'Increase speed.\nAct sooner in combat.',
    },
    [OIL_FLAG_DIG]: {
      label: '+1 DIG',
      description: 'Increase dig speed.\nBreak walls faster.',
    },
    [OIL_FLAG_ARM]: {
      label: '+1 ARM',
      description: 'Increase armor.\nTake less damage in combat.',
    },
  };

  return oils
    .map((flag) => oilDescriptions[flag])
    .filter((opt): opt is { label: string; description: string } => !!opt);
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Find the local POI at the given position and dispatch INTERACT_POI to show the modal.
 * Falls back to SHOW_POI_MODAL with a synthetic POI if no local POI exists.
 */
function dispatchPoiModal(
  dispatch: ReturnType<typeof useGame>['dispatch'],
  localPois: Array<{ id: string; position: { x: number; y: number }; visited: boolean }> | undefined,
  pos: { x: number; y: number },
  definitionId: string,
  interactionType: string
) {
  const localPoi = localPois?.find(
    (p) => p.position.x === pos.x && p.position.y === pos.y && !p.visited
  );
  if (localPoi) {
    dispatch({ type: 'INTERACT_POI', poiId: localPoi.id });
  } else {
    console.warn(
      `[usePoiInteraction] ${definitionId}: no local POI found at`,
      pos.x,
      pos.y,
      '| dispatching SHOW_POI_MODAL fallback'
    );
    dispatch({
      type: 'SHOW_POI_MODAL',
      interaction: {
        poi: {
          id: `onchain-${definitionId}-${pos.x}-${pos.y}`,
          definitionId,
          position: { x: pos.x, y: pos.y },
          visited: false,
          discovered: true,
        },
        type: interactionType as any,
      },
    });
  }
}

export function usePoiInteraction(): UsePoiInteractionResult {
  const { state: gameState, dispatch } = useGame();
  const {
    hasActiveSession,
    gameplayState: onChainState,
    getSessionSignerKeypair,
    sessionPda,
    refreshGameplayState: refreshSessionState,
  } = useSession();
  const {
    gameState: chainGameState,
    refresh: refreshGameplayState,
  } = useGameplayStateContext();
  const { gameplayConnection, gameplayReadConnection } = useSolanaConnection();
  const { wallet } = useWallet();
  const { playSfx } = useAudio();

  const [isInteracting, setIsInteracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactionState, setInteractionState] = useState<PoiInteractionState>('idle');
  const [shopOffers, setShopOffers] = useState<ItemOffer[]>([]);
  const [shopRerollCount, setShopRerollCount] = useState(0);
  // Tracks whether leaveShop was already sent (e.g. via "Leave" button) so
  // clearCacheOffers doesn't fire a redundant on-chain call.
  const shopLeftRef = useRef(false);
  const [cacheOfferOptions, setCacheOfferOptions] = useState<POIOption[] | null>(null);
  // Store params used during generateCacheOffer so interactPickItem uses the same values
  const [cacheOfferParams, setCacheOfferParams] = useState<{
    poiIndex: number;
    rawOffer: CacheOffer;
    poiType: number;
  } | null>(null);
  // Store POI index and type for deferred-selection POIs (Tool Oil, Scanner, Shop)
  const [deferredPoiIndex, setDeferredPoiIndex] = useState<number | null>(null);
  const [deferredPoiType, setDeferredPoiType] = useState<number | null>(null);

  const syncLocalPoiAsConsumed = useCallback(
    (poi: PoiData | undefined) => {
      if (!poi) return;
      const localPoi = gameState?.map?.pois?.find(
        (p) => p.position.x === poi.x && p.position.y === poi.y
      );
      if (localPoi) {
        dispatch({ type: 'MARK_POI_VISITED', poiId: localPoi.id });
      }
    },
    [dispatch, gameState?.map?.pois]
  );

  // Reset interactionState to 'idle' after a completed interaction settles.
  // This re-enables mismatch-detection in GameScreen after the POI modal closes.
  // We use a short delay to ensure all state updates have propagated first.
  useEffect(() => {
    if (
      interactionState === 'complete' &&
      !isInteracting &&
      gameState?.phase === GamePhase.Exploration
    ) {
      const timer = setTimeout(() => {
        setInteractionState('idle');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [interactionState, isInteracting, gameState?.phase]);

  // Get player position
  const playerPosition: Position | null = gameState?.player?.position ?? null;

  // Derive dependent PDAs from the active session PDA (which correctly handles campaign/duel/gauntlet)
  const mapPoisPda = useMemo(() => {
    if (!sessionPda) return null;
    const [pda] = deriveMapPoisPda(sessionPda);
    return pda;
  }, [sessionPda]);

  const gameStatePda = useMemo(() => {
    if (!sessionPda) return null;
    const [pda] = getGameStatePda(sessionPda);
    return pda;
  }, [sessionPda]);

  // Create POI system program
  const poiProgram = useMemo(() => {
    if (!wallet.publicKey) return null;
    try {
      const provider = createAnchorProvider(gameplayConnection, {
        publicKey: wallet.publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      });
      return createPoiSystemProgramWithProvider(provider);
    } catch {
      return null;
    }
  }, [gameplayConnection, wallet.publicKey]);

  /** Derive PoiVrfState PDA for the active session (if any). */
  const poiVrfStatePda = useMemo(() => {
    if (!sessionPda) return undefined;
    return derivePoiVrfStatePda(sessionPda)[0];
  }, [sessionPda]);

  /** Derive GameplayVrfState PDA for VRF-backed boss selection in skip_to_day CPI. */
  const gameplayVrfStatePda = useMemo(() => {
    if (!sessionPda) return undefined;
    return deriveGameplayVrfStatePda(sessionPda)[0];
  }, [sessionPda]);

  /** Derive SessionDiscovery PDA for fog-of-war dual-write. */
  const sessionDiscoveryPda = useMemo(() => {
    if (!sessionPda) return undefined;
    return deriveSessionDiscoveryPda(sessionPda)[0];
  }, [sessionPda]);

  /** Creates a PoiTransactionContext or returns null if session not ready. */
  const createPoiCtx = useCallback((): PoiTransactionContext | null => {
    const keypair = getSessionSignerKeypair();
    if (!keypair || !poiProgram || !mapPoisPda || !gameStatePda || !sessionPda) {
      return null;
    }
    return {
      connection: gameplayConnection,
      program: poiProgram,
      mapPoisPda,
      gameStatePda,
      sessionPda,
      sessionSignerKeypair: keypair,
      poiVrfStatePda,
      gameplayVrfStatePda,
      sessionDiscoveryPda,
    };
  }, [getSessionSignerKeypair, poiProgram, mapPoisPda, gameStatePda, sessionPda, gameplayConnection, poiVrfStatePda, gameplayVrfStatePda, sessionDiscoveryPda]);

  // Check if there's a valid POI at the player's current position.
  // Sources from the game reducer state (populated by SYNC_DISCOVERY).
  const currentPoi = useMemo((): PoiData | undefined => {
    if (!playerPosition) return undefined;

    if (gameState?.map?.pois) {
      const localPoi = gameState.map.pois.find(
        (p) => p.position.x === playerPosition.x && p.position.y === playerPosition.y && !p.visited
      );
      if (localPoi) {
        // Derive poiType from definitionId (e.g. 'L2' → 2, 'L13' → 13)
        const poiType = parseInt(localPoi.definitionId.substring(1), 10) || 0;
        debugLog(
          '[usePoiInteraction] currentPoi: found at',
          playerPosition.x,
          playerPosition.y,
          '| definitionId:',
          localPoi.definitionId,
          '| derived poiType:',
          poiType
        );
        return {
          x: localPoi.position.x,
          y: localPoi.position.y,
          poiType,
          consumed: localPoi.visited,
        };
      }
    }

    return undefined;
  }, [playerPosition, gameState?.map?.pois]);

  // Can interact if:
  // 1. Player is in exploration phase
  // 2. There's a non-consumed POI at current position
  // 3. One-time POIs haven't been used
  // Night-only POIs (Mole Den, Rest Alcove) are not interactable during the day.
  const canInteract = useMemo((): boolean => {
    if (!gameState || gameState.phase !== GamePhase.Exploration) {
      return false;
    }
    if (!currentPoi || currentPoi.consumed) {
      return false;
    }
    // Block night-only POIs during the day (no modal at all)
    if (NIGHT_ONLY_POIS.has(currentPoi.poiType) && gameState.time.phase === TimePhase.Day) {
      return false;
    }

    debugLog(
      '[usePoiInteraction] canInteract: true | poiType:',
      currentPoi.poiType,
      '| pos:',
      currentPoi.x,
      currentPoi.y
    );
    return true;
  }, [gameState, currentPoi]);

  // Determines if POI should auto-open when player steps on it.
  // Returns false if preconditions are not met (e.g., no inventory space, already has oil).
  // User can still manually open these POIs with the A button.
  const shouldAutoOpen = useMemo((): boolean => {
    if (!canInteract || !currentPoi || !gameState) {
      return false;
    }

    const poiType = currentPoi.poiType;

    // Rail Waypoint (L8): Never auto-open; discovery is automatic, interaction is manual
    if (poiType === POI_TYPES.RAIL_WAYPOINT) {
      return false;
    }

    // Tool Oil Rack (L4): Don't auto-open if player already has oil on weapon
    if (poiType === POI_TYPES.TOOL_OIL_RACK) {
      if (gameState.player.equippedTool?.oil) {
        debugLog('[usePoiInteraction] shouldAutoOpen: false (already has oil on weapon)');
        return false;
      }
    }

    // Tool Crate (L3): Don't auto-open if player has a non-starter tool equipped
    if (poiType === POI_TYPES.TOOL_CRATE) {
      if (gameState.player.equippedTool && gameState.player.equippedTool.id !== 'T0') {
        debugLog('[usePoiInteraction] shouldAutoOpen: false (already has tool equipped)');
        return false;
      }
    }

    // Rusty Anvil (L10): Don't auto-open if tool is already max tier (DIAMOND)
    if (poiType === POI_TYPES.RUSTY_ANVIL) {
      if (gameState.player.equippedTool?.rarity === 'DIAMOND') {
        debugLog('[usePoiInteraction] shouldAutoOpen: false (tool already max tier)');
        return false;
      }
    }

    // Rune Kiln (L11): Don't auto-open if no fuseable pairs (need 2 identical non-Diamond gear)
    if (poiType === POI_TYPES.RUNE_KILN) {
      const gearCounts = new Map<string, number>();
      let hasPair = false;
      for (const slot of gameState.player.inventory) {
        if (slot.item.currentRarity !== 'DIAMOND') {
          const key = `${slot.item.id}:${slot.item.currentRarity}`;
          const count = (gearCounts.get(key) ?? 0) + 1;
          gearCounts.set(key, count);
          if (count >= 2) {
            hasPair = true;
            break;
          }
        }
      }
      if (!hasPair) {
        debugLog('[usePoiInteraction] shouldAutoOpen: false (no fuseable pairs for kiln)');
        return false;
      }
    }

    // Item-granting POIs (L2, L3, L9, L12, L13): Don't auto-open if inventory is full
    const PICK_ITEM_POIS: number[] = [
      POI_TYPES.SUPPLY_CACHE,
      POI_TYPES.TOOL_CRATE,
      POI_TYPES.SMUGGLER_HATCH,
      POI_TYPES.GEODE_VAULT,
      POI_TYPES.COUNTER_CACHE,
    ];
    if (PICK_ITEM_POIS.includes(poiType)) {
      const hasSpace = gameState.player.inventory.length < gameState.player.inventoryCapacity;
      if (!hasSpace) {
        debugLog('[usePoiInteraction] shouldAutoOpen: false (inventory full)');
        return false;
      }
    }

    return true;
  }, [canInteract, currentPoi, gameState]);

  /**
   * Find POI index in the on-chain MapPois array by position.
   * Always validates against fresh on-chain data since we no longer cache MapPois.
   */
  const findPoiIndex = useCallback(
    async (x: number, y: number): Promise<number> => {
      if (!poiProgram || !mapPoisPda) return -1;
      const validated = await validatePoiIndex(poiProgram, mapPoisPda, -1, x, y, 'findPoiIndex', sessionDiscoveryPda, gameplayConnection);
      return validated.index;
    },
    [poiProgram, mapPoisPda, sessionDiscoveryPda, gameplayConnection]
  );

  /**
   * Check if there's a POI at a specific position.
   */
  const hasPoiAt = useCallback(
    (x: number, y: number): boolean => {
      if (gameState?.map?.pois) {
        const localPoi = gameState.map.pois.find(
          (p) => p.position.x === x && p.position.y === y && !p.visited
        );
        return localPoi !== undefined;
      }

      return false;
    },
    [gameState?.map?.pois]
  );

  /**
   * Get POI data at a specific position (from local game state).
   */
  const getPoiAt = useCallback(
    (x: number, y: number): PoiData | undefined => {
      if (gameState?.map?.pois) {
        const localPoi = gameState.map.pois.find(
          (p) => p.position.x === x && p.position.y === y && !p.visited
        );
        if (localPoi) {
          const poiType = parseInt(localPoi.definitionId.substring(1), 10) || 0;
          return {
            x: localPoi.position.x,
            y: localPoi.position.y,
            poiType,
            consumed: localPoi.visited,
          };
        }
      }

      return undefined;
    },
    [gameState?.map?.pois]
  );

  /**
   * Verifies that a one-time POI was actually consumed on-chain.
   * Uses SessionDiscovery's discoveredPois to check the `consumed` flag.
   * This prevents local optimistic state (inventory/visited) from drifting when a tx
   * appears processed but did not persist.
   */
  const assertPoiConsumedOnChain = useCallback(
    async (poiIndex: number): Promise<void> => {
      if (!sessionPda) {
        return; // Can't verify without session
      }
      const discovery = await fetchDiscoveryOffers(gameplayConnection, sessionPda).catch(() => null);
      if (!discovery) {
        return; // Can't verify — trust local MARK_POI_VISITED
      }
      // Check discoveredPois for a matching mapPoisIndex with used flag
      const discoveredPoi = discovery.discoveredPois
        .slice(0, discovery.discoveredPoiCount)
        .find((p) => p.mapPoisIndex === poiIndex);
      if (discoveredPoi && discoveredPoi.used) {
        return; // Confirmed consumed via SessionDiscovery
      }
      // Not all POI types dual-write the used flag to SessionDiscovery yet.
      // Trust local MARK_POI_VISITED to prevent re-interaction.
      console.warn(
        `[usePoiInteraction] assertPoiConsumedOnChain: POI ${poiIndex} not confirmed used in SessionDiscovery`
      );
    },
    [sessionPda, gameplayConnection]
  );

  /**
   * Interact with the POI at current position.
   * Dispatches the correct on-chain instruction based on POI type.
   */
  const interact = useCallback(
    async (params?: PoiInteractParams): Promise<{ success: boolean; result?: unknown }> => {
      debugLog(
        '[usePoiInteraction] interact() called | canInteract:',
        canInteract,
        '| playerPos:',
        playerPosition,
        '| currentPoi:',
        currentPoi
          ? {
              x: currentPoi.x,
              y: currentPoi.y,
              poiType: currentPoi.poiType,
              consumed: currentPoi.consumed,
            }
          : null
      );

      if (!canInteract || !playerPosition || !currentPoi) {
        console.warn(
          '[usePoiInteraction] interact() BLOCKED: canInteract=',
          canInteract,
          'playerPos=',
          !!playerPosition,
          'currentPoi=',
          !!currentPoi
        );
        setError('Cannot interact with POI');
        return { success: false };
      }

      // Guest mode: dispatch INTERACT_POI to the local reducer (no on-chain interaction)
      if (!hasActiveSession) {
        const localPoi = gameState?.map?.pois?.find(
          (p) =>
            p.position.x === currentPoi.x &&
            p.position.y === currentPoi.y &&
            !p.visited
        );
        if (localPoi) {
          debugLog('[usePoiInteraction] Guest mode: dispatching INTERACT_POI for', localPoi.id);
          dispatch({ type: 'INTERACT_POI', poiId: localPoi.id });
          return { success: true };
        }
        console.warn('[usePoiInteraction] Guest mode: no local POI found at', currentPoi.x, currentPoi.y);
        setError('POI not found');
        return { success: false };
      }

      const ctx = createPoiCtx();
      if (!ctx) {
        console.warn(
          '[usePoiInteraction] interact() BLOCKED: session not ready | poiProgram:',
          !!poiProgram,
          '| mapPoisPda:',
          !!mapPoisPda,
          '| gameStatePda:',
          !!gameStatePda,
          '| sessionPda:',
          !!sessionPda
        );
        setError('Session not ready for POI interaction');
        return { success: false };
      }

      // Validate POI index against fresh on-chain MapPois data
      const validated = await validatePoiIndex(
        ctx.program,
        ctx.mapPoisPda,
        -1,
        currentPoi.x,
        currentPoi.y,
        'interact',
        sessionDiscoveryPda,
        ctx.connection
      );
      let poiIndex = validated.index;
      debugLog(
        '[usePoiInteraction] validatePoiIndex result:',
        poiIndex
      );

      if (poiIndex === -1) {
        console.error(
          '[usePoiInteraction] POI NOT FOUND at',
          currentPoi.x,
          currentPoi.y
        );
        setError('POI not found on-chain. Try again.');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);
      setInteractionState('confirming');

      try {
        const poiType = currentPoi.poiType;
        debugLog(
          '[usePoiInteraction] Dispatching on-chain interaction | poiType:',
          poiType,
          '| poiIndex:',
          poiIndex
        );

        // Clear stale cache offers from any previous POI interaction.
        // POIs that need them (L2, L3, L4, L9, L12, L13) will set fresh values below.
        setCacheOfferOptions(null);
        setCacheOfferParams(null);

        switch (poiType) {
          // Rest POIs (L1, L5) — Deferred flow:
          // Step 1 (here): show modal with options (Rest / Leave)
          // Step 2 (confirmPoiSelection): call interactRest on-chain when user confirms
          case POI_TYPES.MOLE_DEN:
          case POI_TYPES.REST_ALCOVE: {
            debugLog('[usePoiInteraction] Rest POI | poiType:', poiType, '| showing modal');

            // Store deferred state for confirmPoiSelection
            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(poiType);

            // Dispatch INTERACT_POI to show the modal with options
            // The options are generated locally by pois.ts (generateMoleDenOptions / generateRestAlcoveOptions)
            const defId = poiType === POI_TYPES.MOLE_DEN ? 'L1' : 'L5';
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, defId, 'REST');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          // Pick Item POIs (L2, L3, L12, L13) — Two-step flow:
          // Step 1 (here): generate offers on-chain, fetch, display in modal
          // Step 2 (selectCacheOffer): pick chosen item on-chain
          case POI_TYPES.SUPPLY_CACHE:
          case POI_TYPES.TOOL_CRATE:
          case POI_TYPES.GEODE_VAULT:
          case POI_TYPES.COUNTER_CACHE: {
            debugLog(
              '[usePoiInteraction] Pick-item POI flow | poiType:',
              poiType,
              '| poiIndex:',
              poiIndex
            );
            // Clear any stale deferred state from a previous interaction (e.g. a Rest POI that
            // was dismissed without going through confirmPoiSelection). Pick-item POIs use
            // selectCacheOffer, not confirmPoiSelection, so deferredPoiType must be null here
            // to ensure handlePOIOption routes correctly.
            setDeferredPoiType(null);
            setDeferredPoiIndex(null);
            // Fetch SessionDiscovery to check for existing offer
            let discovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);

            // Check if an active cache offer already exists for this POI
            const hasExistingCacheOffer =
              discovery &&
              discovery.activeOfferType === 2 && // 2=cache
              discovery.activeOfferPoiIndex === poiIndex &&
              discovery.cacheOfferItems.some((item) => item.itemId.some((b) => b !== 0));

            if (!hasExistingCacheOffer) {
              debugLog('[usePoiInteraction] Sending generateCacheOffer on-chain');
              try {
                await withErPositionRetry(() =>
                  generateCacheOffer(ctx, poiIndex)
                );
              } catch (err) {
                if (isOfferAlreadyGeneratedError(err)) {
                  debugLog(
                    '[usePoiInteraction] Offer already exists on-chain, re-fetching existing offer'
                  );
                  // Offer already generated (e.g., previous attempt succeeded on-chain
                  // but frontend didn't complete the flow). Just re-fetch and use it.
                } else if (isPoiAlreadyUsedError(err)) {
                  console.warn(
                    '[usePoiInteraction] generateCacheOffer hit PoiAlreadyUsed; syncing local state'
                  );
                  await Promise.all([
                    refreshGameplayState(),
                    refreshSessionState(),
                  ]);
                  syncLocalPoiAsConsumed(currentPoi);
                  dispatch({ type: 'CLOSE_POI' });
                  setInteractionState('complete');
                  return { success: true };
                } else {
                  throw err;
                }
              }
              debugLog('[usePoiInteraction] generateCacheOffer CONFIRMED, re-fetching...');
              // Re-fetch SessionDiscovery to read the stored offer
              discovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            } else {
              debugLog('[usePoiInteraction] Saved cache offer found for poiIndex:', poiIndex);
            }

            // Convert SessionDiscovery cache items to CacheOffer format
            const existingOffer =
              discovery &&
              discovery.activeOfferType === 2 &&
              discovery.activeOfferPoiIndex === poiIndex
                ? discoveryCacheItemsToCacheOffer(discovery.cacheOfferItems, poiIndex)
                : null;

            if (!existingOffer || existingOffer.items.every((i) => i.itemId.every((b) => b === 0))) {
              console.error(
                '[usePoiInteraction] No cache offer found in SessionDiscovery for poiIndex:',
                poiIndex,
                '| activeOfferType:',
                discovery?.activeOfferType,
                '| activeOfferPoiIndex:',
                discovery?.activeOfferPoiIndex
              );
              setError('Failed to generate cache offers');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Convert on-chain offers to POIOption[] for the modal
            const offerOptions = convertCacheOfferToOptions(existingOffer);
            debugLog(
              '[usePoiInteraction] Cache offers ready:',
              offerOptions.length,
              'items | labels:',
              offerOptions.map((o) => o.label)
            );
            setCacheOfferOptions(offerOptions);
            setCacheOfferParams({ poiIndex, rawOffer: existingOffer, poiType });

            // Dispatch INTERACT_POI locally to transition to POIInteraction phase (shows modal)
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, `L${poiType}`, 'ITEM_SELECTION');

            // Stay in choosing state — don't mark consumed yet
            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true, result: offerOptions };
          }

          // Tool Oil (L4) — Two-step flow: generate oil offer on-chain, then display options
          case POI_TYPES.TOOL_OIL_RACK: {
            debugLog('[usePoiInteraction] Tool Oil two-step flow | poiIndex:', poiIndex);

            // Check if player already has oil on weapon
            if (gameState?.player?.equippedTool?.oil) {
              setError('You already have an oil on your weapon');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Step 1: Check SessionDiscovery for existing oil offer, or generate one on-chain
            let oilDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);

            const hasExistingOilOffer =
              oilDiscovery &&
              oilDiscovery.activeOfferType === 3 && // 3=oil
              oilDiscovery.activeOfferPoiIndex === poiIndex &&
              oilDiscovery.oilOfferOils.some((o) => o !== 0);

            if (!hasExistingOilOffer) {
              debugLog('[usePoiInteraction] Sending generateOilOffer on-chain');
              try {
                await withErPositionRetry(() =>
                  generateOilOffer(ctx, poiIndex)
                );
              } catch (err) {
                if (isOfferAlreadyGeneratedError(err)) {
                  debugLog(
                    '[usePoiInteraction] Oil offer already exists on-chain, re-fetching'
                  );
                } else if (isPoiAlreadyUsedError(err)) {
                  console.warn(
                    '[usePoiInteraction] generateOilOffer hit PoiAlreadyUsed; syncing local state'
                  );
                  await Promise.all([
                    refreshGameplayState(),
                    refreshSessionState(),
                  ]);
                  syncLocalPoiAsConsumed(currentPoi);
                  dispatch({ type: 'CLOSE_POI' });
                  setInteractionState('complete');
                  return { success: true };
                } else {
                  throw err;
                }
              }
              debugLog('[usePoiInteraction] generateOilOffer CONFIRMED, re-fetching...');
              oilDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            } else {
              debugLog('[usePoiInteraction] Saved oil offer found for poiIndex:', poiIndex);
            }

            if (
              !oilDiscovery ||
              oilDiscovery.activeOfferType !== 3 ||
              oilDiscovery.activeOfferPoiIndex !== poiIndex
            ) {
              console.error(
                '[usePoiInteraction] No oil offer found in SessionDiscovery for poiIndex:',
                poiIndex,
                '| activeOfferType:',
                oilDiscovery?.activeOfferType,
                '| activeOfferPoiIndex:',
                oilDiscovery?.activeOfferPoiIndex
              );
              setError('Failed to generate oil offers');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Convert on-chain oils to POIOption[] for the modal
            const oilOptions = convertOilOfferToOptions(
              Array.from(oilDiscovery.oilOfferOils)
            );
            debugLog(
              '[usePoiInteraction] Oil offers ready:',
              oilOptions.length,
              'oils | labels:',
              oilOptions.map((o) => o.label)
            );
            setCacheOfferOptions(oilOptions);

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.TOOL_OIL_RACK);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L4', 'TOOL_MODIFY');
            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true, result: oilOptions };
          }

          // Survey Beacon (L6)
          case POI_TYPES.SURVEY_BEACON: {
            await withErPositionRetry(() =>
              interactSurveyBeacon(ctx, poiIndex)
            );
            // Refresh discovered enemies on-chain (beacon reveals tiles but doesn't sync enemies)
            try {
              const refreshEnemiesIx = await buildRefreshDiscoveredEnemiesInstruction(
                createGameplayStateProgram(ctx.connection),
                ctx.sessionPda,
                ctx.sessionSignerKeypair.publicKey
              );
              const refreshEnemiesTx = new Transaction().add(
                ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                refreshEnemiesIx
              );
              await sendSessionSignerTransaction(ctx.connection, refreshEnemiesTx, ctx.sessionSignerKeypair);
            } catch (e) {
              console.warn('[usePoiInteraction] Failed to refresh discovered enemies after beacon:', e);
            }
            await Promise.all([
              refreshGameplayState(),
              refreshSessionState(),
            ]);
            if (playerPosition) {
              dispatch({ type: 'REVEAL_TILES', center: playerPosition, radius: 13 });
            }
            // Sync tile types, enemies, and POIs from SessionDiscovery (now includes refreshed enemies)
            const [beaconSdPda] = deriveSessionDiscoveryPda(ctx.sessionPda);
            const beaconDiscovery = await fetchSessionDiscovery(
              createMapGeneratorProgram(ctx.connection),
              beaconSdPda
            ).catch(() => null);
            if (beaconDiscovery) {
              const sdTiles = unpackDiscoveryTiles(beaconDiscovery, beaconDiscovery.mapWidth, beaconDiscovery.mapHeight);
              const sdEnemies = convertDiscoveredEnemies(beaconDiscovery.discoveredEnemies, beaconDiscovery.discoveredEnemyCount);
              const sdPois = convertDiscoveredPois(beaconDiscovery.discoveredPois, beaconDiscovery.discoveredPoiCount);
              dispatch({ type: 'SYNC_DISCOVERY', tiles: sdTiles, enemies: sdEnemies, pois: sdPois });
            }
            break;
          }

          // Seismic Scanner (L7) — Two-step flow: generate on-chain options, then reveal selection
          case POI_TYPES.SEISMIC_SCANNER: {
            let scannerDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);

            const hasExistingScannerOffer =
              scannerDiscovery &&
              scannerDiscovery.activeOfferType === 4 && // 4=scanner
              scannerDiscovery.activeOfferPoiIndex === poiIndex &&
              scannerDiscovery.scannerOfferCount > 0;

            if (!hasExistingScannerOffer) {
              debugLog('[usePoiInteraction] Sending generateScannerOffer on-chain');
              try {
                await withErPositionRetry(() =>
                  generateScannerOffer(ctx, poiIndex)
                );
              } catch (err) {
                if (isOfferAlreadyGeneratedError(err)) {
                  debugLog(
                    '[usePoiInteraction] Scanner offer already exists on-chain, re-fetching'
                  );
                } else if (isPoiAlreadyUsedError(err)) {
                  await Promise.all([
                    refreshGameplayState(),
                    refreshSessionState(),
                  ]);
                  syncLocalPoiAsConsumed(currentPoi);
                  dispatch({ type: 'CLOSE_POI' });
                  setInteractionState('complete');
                  return { success: true };
                } else {
                  throw err;
                }
              }

              scannerDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            }

            if (
              !scannerDiscovery ||
              scannerDiscovery.activeOfferType !== 4 ||
              scannerDiscovery.scannerOfferCount === 0
            ) {
              setError('Failed to generate scanner options');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            const scannerOptions = convertScannerOfferToOptions(
              Array.from(scannerDiscovery.scannerOfferTypes).slice(0, scannerDiscovery.scannerOfferCount)
            );
            setCacheOfferOptions(scannerOptions);
            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.SEISMIC_SCANNER);
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L7', 'LOCATE');
            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true, result: scannerOptions };
          }

          // Rail Waypoint (L8) — Deferred flow:
          // Step 1 (here): show modal with fast-travel options
          // Step 2 (confirmPoiSelection): call fastTravel on-chain when user picks a destination
          case POI_TYPES.RAIL_WAYPOINT: {
            debugLog('[usePoiInteraction] Rail Waypoint | showing modal');

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.RAIL_WAYPOINT);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L8', 'LOCATE');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          // Smuggler Hatch Shop (L9) — Enter shop on-chain, then show modal with on-chain offers
          case POI_TYPES.SMUGGLER_HATCH: {
            shopLeftRef.current = false;
            // Check if shop is already active on-chain via SessionDiscovery
            let shopDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            const shopAlreadyActive =
              shopDiscovery &&
              shopDiscovery.activeOfferType === 1 && // 1=shop
              shopDiscovery.shopActive !== 0;

            if (!shopAlreadyActive) {
              await withErPositionRetry(() =>
                enterShop(ctx, poiIndex)
              );
              // Re-fetch after entering
              shopDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            } else {
              debugLog('[usePoiInteraction] Shop already active on-chain, skipping enterShop');
            }
            if (shopDiscovery && shopDiscovery.activeOfferType === 1 && shopDiscovery.shopActive !== 0) {
              const adaptedOffers = discoveryShopOffersToItemOffers(shopDiscovery.shopOffers);
              setShopOffers(adaptedOffers);
              setShopRerollCount(shopDiscovery.shopRerollCount);
              const gold = gameState?.player?.stats?.gold ?? 0;
              setCacheOfferOptions(
                convertShopOffersToOptions(
                  adaptedOffers,
                  shopDiscovery.shopRerollCount,
                  gold
                )
              );
            }

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.SMUGGLER_HATCH);

            // Dispatch INTERACT_POI to transition game phase and show modal
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L9', 'SHOP');

            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true };
          }

          // Rusty Anvil (L10) — Deferred flow:
          // Step 1 (here): show modal with upgrade options
          // Step 2 (confirmPoiSelection): call interactRustyAnvil on-chain when user confirms
          case POI_TYPES.RUSTY_ANVIL: {
            debugLog('[usePoiInteraction] Rusty Anvil | showing modal');

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.RUSTY_ANVIL);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L10', 'UPGRADE');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          // Rune Kiln (L11) — Deferred flow:
          // Step 1 (here): show modal with fusion options
          // Step 2 (confirmPoiSelection): call interactRuneKiln on-chain when user confirms
          case POI_TYPES.RUNE_KILN: {
            debugLog('[usePoiInteraction] Rune Kiln | showing modal');

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.RUNE_KILN);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L11', 'FUSE');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          // Scrap Chute (L14) — Deferred flow:
          // Step 1 (here): show modal with inventory gear options
          // Step 2 (confirmPoiSelection): call interactScrapChute on-chain when user confirms
          case POI_TYPES.SCRAP_CHUTE: {
            debugLog('[usePoiInteraction] Scrap Chute | showing modal');

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.SCRAP_CHUTE);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L14', 'SCRAP');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          default:
            console.error(
              '[usePoiInteraction] UNKNOWN POI type:',
              poiType,
              '— no on-chain handler matched'
            );
            setError(`Unknown POI type: ${poiType}`);
            setIsInteracting(false);
            setInteractionState('idle');
            return { success: false };
        }

        if (isOneTimePoiType(currentPoi.poiType)) {
          await assertPoiConsumedOnChain(poiIndex);
          // Mark one-time POIs as consumed locally for immediate UI feedback.
          debugLog(
            '[usePoiInteraction] On-chain interaction complete, marking POI consumed at',
            currentPoi.x,
            currentPoi.y
          );
          syncLocalPoiAsConsumed(currentPoi);
        }

        setInteractionState('complete');
        return { success: true };
      } catch (err) {
        const errorMessage = getUserErrorMessage(err, 'poi_system');
        setError(errorMessage);
        console.error('[usePoiInteraction] interact() ERROR:', err);
        setInteractionState('idle');
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      canInteract,
      playerPosition,
      currentPoi,
      hasActiveSession,
      createPoiCtx,
      poiProgram,
      mapPoisPda,
      sessionPda,
      findPoiIndex,
      refreshGameplayState,
      refreshSessionState,
      assertPoiConsumedOnChain,
      gameplayConnection,
      syncLocalPoiAsConsumed,
      dispatch,
      gameState?.map?.pois,
    ]
  );

  /**
   * Refresh shop state from SessionDiscovery account.
   */
  const refreshShopState = useCallback(async () => {
    if (!sessionPda) return;
    const discovery = await fetchDiscoveryOffers(gameplayConnection, sessionPda);
    if (discovery && discovery.activeOfferType === 1 && discovery.shopActive !== 0) {
      const adaptedOffers = discoveryShopOffersToItemOffers(discovery.shopOffers);
      setShopOffers(adaptedOffers);
      setShopRerollCount(discovery.shopRerollCount);
    }
  }, [sessionPda, gameplayConnection]);

  /**
   * Purchase an item from the active shop.
   */
  const purchaseItem = useCallback(
    async (offerIndex: number): Promise<{ success: boolean }> => {
      const ctx = createPoiCtx();
      if (!ctx) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await shopPurchase(ctx, offerIndex);
        playSfx('gold_pickup');
        // Refresh shop state to update offers
        await refreshShopState();
        return { success: true };
      } catch (err) {
        setError(getUserErrorMessage(err, 'poi_system'));
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      createPoiCtx,
      refreshShopState,
      playSfx,
    ]
  );

  /**
   * Reroll shop offers.
   */
  const rerollShopFn = useCallback(
    async (_seed: bigint): Promise<{ success: boolean }> => {
      const ctx = createPoiCtx();
      if (!ctx) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await shopReroll(ctx);
        await refreshShopState();
        return { success: true };
      } catch (err) {
        setError(getUserErrorMessage(err, 'poi_system'));
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      createPoiCtx,
      refreshShopState,
    ]
  );

  /**
   * Exit the shop.
   */
  const exitShop = useCallback(async (): Promise<{ success: boolean }> => {
    const ctx = createPoiCtx();
    if (!ctx) {
      setError('Session not ready');
      return { success: false };
    }

    setIsInteracting(true);
    setError(null);

    try {
      await leaveShop(ctx);
      shopLeftRef.current = true;
      setShopOffers([]);
      setShopRerollCount(0);
      setInteractionState('complete');
      return { success: true };
    } catch (err) {
      setError(getUserErrorMessage(err, 'poi_system'));
      return { success: false };
    } finally {
      setIsInteracting(false);
    }
  }, [createPoiCtx]);

  /**
   * Fast travel between two discovered waypoints.
   */
  const travelToWaypoint = useCallback(
    async (fromPoiIndex: number, toPoiIndex: number): Promise<{ success: boolean }> => {
      const ctx = createPoiCtx();
      if (!ctx) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await withErPositionRetry(() =>
          fastTravel(ctx, fromPoiIndex, toPoiIndex)
        );

        await refreshGameplayState();
        const gpProg = createGameplayStateProgram(ctx.connection);

        // Sync position immediately so local state matches on-chain
        const ftState = await fetchGameState(gpProg, ctx.gameStatePda);
        if (ftState) {
          dispatch({ type: 'SYNC_MOVE', confirmedState: ftState });
        }

        // Reveal tiles + sync enemies at destination
        try {
          const isNight = gameState?.time?.phase === 'NIGHT';
          const destX = ftState?.positionX ?? 0;
          const destY = ftState?.positionY ?? 0;
          const revealIx = await buildRevealRadiusInstruction(
            createMapGeneratorProgram(ctx.connection), ctx.sessionPda,
            ctx.sessionSignerKeypair.publicKey, destX, destY, isNight ? 2 : 4
          );
          await sendSessionSignerTransaction(ctx.connection,
            new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), revealIx),
            ctx.sessionSignerKeypair
          );
          const refreshIx = await buildRefreshDiscoveredEnemiesInstruction(
            gpProg, ctx.sessionPda, ctx.sessionSignerKeypair.publicKey
          );
          await sendSessionSignerTransaction(ctx.connection,
            new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), refreshIx),
            ctx.sessionSignerKeypair
          );
        } catch (e) {
          console.warn('[usePoiInteraction] Failed to reveal/refresh after fast travel (direct):', e);
        }

        // Fetch discovery and sync tiles/enemies/POIs
        const disc = await fetchSessionDiscovery(
          createMapGeneratorProgram(ctx.connection),
          deriveSessionDiscoveryPda(ctx.sessionPda)[0]
        ).catch(() => null);
        if (disc) {
          dispatch({ type: 'SYNC_DISCOVERY',
            tiles: unpackDiscoveryTiles(disc, disc.mapWidth, disc.mapHeight),
            enemies: convertDiscoveredEnemies(disc.discoveredEnemies, disc.discoveredEnemyCount),
            pois: convertDiscoveredPois(disc.discoveredPois, disc.discoveredPoiCount),
          });
        }

        return { success: true };
      } catch (err) {
        setError(getUserErrorMessage(err, 'poi_system'));
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [createPoiCtx]
  );

  /**
   * Execute fast travel from one position to another via on-chain instruction.
   * Used by the FastTravelOverlay D-PAD confirm flow.
   */
  const executeFastTravel = useCallback(
    async (
      fromPos: Position,
      toPos: Position
    ): Promise<{ success: boolean; newState?: any; error?: string }> => {
      const ctx = createPoiCtx();
      if (!ctx) {
        return { success: false, error: 'Session not ready' };
      }

      // Validate both waypoint indices against fresh on-chain data
      const fromValidated = await validatePoiIndex(
        ctx.program, ctx.mapPoisPda,
        -1,
        fromPos.x, fromPos.y,
        'executeFastTravel(from)',
        sessionDiscoveryPda, ctx.connection
      );
      const toValidated = await validatePoiIndex(
        ctx.program, ctx.mapPoisPda,
        -1,
        toPos.x, toPos.y,
        'executeFastTravel(to)',
        sessionDiscoveryPda, ctx.connection
      );

      if (fromValidated.index === -1 || toValidated.index === -1) {
        return { success: false, error: 'Waypoint not found' };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await withErPositionRetry(() =>
          fastTravel(ctx, fromValidated.index, toValidated.index)
        );

        await refreshGameplayState();

        const gameplayProgram = createGameplayStateProgram(gameplayReadConnection);

        // Sync position immediately so local state matches on-chain
        const updatedState = await fetchGameState(gameplayProgram, ctx.gameStatePda);
        if (updatedState) {
          dispatch({ type: 'SYNC_MOVE', confirmedState: updatedState });
        }

        // Reveal tiles + sync enemies at destination
        try {
          const isNight = gameState?.time?.phase === 'NIGHT';
          const revealIx = await buildRevealRadiusInstruction(
            createMapGeneratorProgram(ctx.connection), ctx.sessionPda,
            ctx.sessionSignerKeypair.publicKey, toPos.x, toPos.y, isNight ? 2 : 4
          );
          await sendSessionSignerTransaction(ctx.connection,
            new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), revealIx),
            ctx.sessionSignerKeypair
          );
          const refreshIx = await buildRefreshDiscoveredEnemiesInstruction(
            createGameplayStateProgram(ctx.connection), ctx.sessionPda,
            ctx.sessionSignerKeypair.publicKey
          );
          await sendSessionSignerTransaction(ctx.connection,
            new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), refreshIx),
            ctx.sessionSignerKeypair
          );
        } catch (e) {
          console.warn('[usePoiInteraction] Failed to reveal/refresh after fast travel (overlay):', e);
        }

        // Fetch discovery and sync tiles/enemies/POIs
        const disc = await fetchSessionDiscovery(
          createMapGeneratorProgram(ctx.connection),
          deriveSessionDiscoveryPda(ctx.sessionPda)[0]
        ).catch(() => null);
        if (disc) {
          dispatch({ type: 'SYNC_DISCOVERY',
            tiles: unpackDiscoveryTiles(disc, disc.mapWidth, disc.mapHeight),
            enemies: convertDiscoveredEnemies(disc.discoveredEnemies, disc.discoveredEnemyCount),
            pois: convertDiscoveredPois(disc.discoveredPois, disc.discoveredPoiCount),
          });
        }

        return { success: true, newState: updatedState };
      } catch (err) {
        const errorMessage = getUserErrorMessage(err, 'poi_system');
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      createPoiCtx,
      gameplayReadConnection,
      findPoiIndex,
      refreshGameplayState,
    ]
  );

  /**
   * Select a cache offer item (Step 2 of pick-item flow).
   * Sends interactPickItem on-chain with the chosen index, then marks POI as consumed.
   */
  const selectCacheOffer = useCallback(
    async (choiceIndex: number): Promise<{ success: boolean; error?: string }> => {
      debugLog(
        '[usePoiInteraction] selectCacheOffer called | choiceIndex:',
        choiceIndex,
        '| cacheOfferParams:',
        cacheOfferParams
          ? {
              poiIndex: cacheOfferParams.poiIndex,
              poiType: cacheOfferParams.poiType,
              rawOfferItems: cacheOfferParams.rawOffer?.items?.length ?? 0,
              rawOfferItemIds: cacheOfferParams.rawOffer?.items?.map((i) =>
                i?.itemId ? String.fromCharCode(...i.itemId.filter((b: number) => b !== 0)) : 'null'
              ),
            }
          : null
      );
      const ctx = createPoiCtx();
      if (!ctx || !cacheOfferParams) {
        console.warn(
          '[usePoiInteraction] selectCacheOffer BLOCKED: session not ready | ctx:',
          !!ctx,
          '| cacheOfferParams:',
          !!cacheOfferParams
        );
        setError('Session not ready for item selection');
        return { success: false };
      }

      // Check if player has inventory space (for gear items, not tools)
      const isTool = cacheOfferParams.poiType === POI_TYPES.TOOL_CRATE;
      if (!isTool && gameState) {
        const hasSpace = gameState.player.inventory.length < gameState.player.inventoryCapacity;
        if (!hasSpace) {
          return { success: false, error: "You don't have enough space in your inventory" };
        }
      }

      setIsInteracting(true);
      setError(null);

      let confirmedPoiIndex = cacheOfferParams.poiIndex;
      try {

        // Validate args before sending
        if (confirmedPoiIndex < 0 || confirmedPoiIndex > 254 || !Number.isInteger(confirmedPoiIndex)) {
          console.error('[usePoiInteraction] Invalid poiIndex:', confirmedPoiIndex);
          setError('Invalid POI index');
          return { success: false };
        }
        if (choiceIndex < 0 || choiceIndex > 2 || !Number.isInteger(choiceIndex)) {
          console.error('[usePoiInteraction] Invalid choiceIndex:', choiceIndex);
          setError('Invalid choice');
          return { success: false };
        }

        // Validate the stored poiIndex against fresh on-chain data.
        if (currentPoi) {
          const cacheValidated = await validatePoiIndex(
            ctx.program,
            ctx.mapPoisPda,
            confirmedPoiIndex,
            currentPoi.x,
            currentPoi.y,
            'selectCacheOffer',
            sessionDiscoveryPda,
            ctx.connection
          );
          if (cacheValidated.index === -1) {
            setError('POI state changed. Please try again.');
            return { success: false };
          }
          confirmedPoiIndex = cacheValidated.index;
        }

        debugLog(
          '[usePoiInteraction] Sending interactPickItem on-chain | poiIndex:',
          confirmedPoiIndex,
          '| choice:',
          choiceIndex
        );
        await withErPositionRetry(() =>
          interactPickItem(ctx, confirmedPoiIndex, choiceIndex)
        );
        debugLog('[usePoiInteraction] interactPickItem CONFIRMED on-chain');
        await assertPoiConsumedOnChain(confirmedPoiIndex);

        // Item is now auto-equipped via CPI in the on-chain program.
        // The poi-system calls player-inventory::equip_gear_authorized or equip_tool_authorized,
        // which in turn calls gameplay-state::add_hp_bonus_authorized to sync HP bonuses.
        // No need to call equipGear/equipTool/syncHpFromInventory from the frontend anymore.

        // Mark POI as consumed locally after successful on-chain transaction
        syncLocalPoiAsConsumed(currentPoi);

        // Close the POI modal and return to exploration.
        // IMPORTANT: Use CLOSE_POI instead of SELECT_POI_OPTION because:
        // - SELECT_POI_OPTION calls applyPOIOption which adds LOCAL items to inventory
        // - The selected item is already equipped on-chain via interactPickItem CPI flow
        // - Using SELECT_POI_OPTION would duplicate the item (one from on-chain, one from local)
        dispatch({ type: 'CLOSE_POI' });

        // Clean up cache state
        setCacheOfferOptions(null);
        setCacheOfferParams(null);
        setInteractionState('complete');
        return { success: true };
      } catch (err) {
        if (isInvalidPoiIndexError(err)) {
          console.error(
            '[usePoiInteraction] selectCacheOffer InvalidPoiIndex! poiIndex:',
            confirmedPoiIndex,
            '| choiceIndex:',
            choiceIndex
          );
        }
        const errorMessage = getUserErrorMessage(err, 'poi_system');
        setError(errorMessage);
        console.error('[usePoiInteraction] selectCacheOffer ERROR:', err);
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      createPoiCtx,
      cacheOfferParams,
      cacheOfferOptions,
      assertPoiConsumedOnChain,
      currentPoi,
      syncLocalPoiAsConsumed,
      dispatch,
    ]
  );

  /**
   * Clear cache offers and deferred selection state.
   * If in a shop, also sends leaveShop on-chain (fire-and-forget).
   * Also resets interactionState to 'idle' to re-enable mismatch-detection.
   */
  const clearCacheOffers = useCallback(() => {
    setCacheOfferOptions(null);
    setCacheOfferParams(null);
    // If in shop, close on-chain (fire-and-forget) — skip if already left
    if (deferredPoiType === POI_TYPES.SMUGGLER_HATCH) {
      if (!shopLeftRef.current) {
        const ctx = createPoiCtx();
        if (ctx) {
          leaveShop(ctx).catch((err) => {
            if (!isIgnorableLeaveShopCloseError(err)) {
              console.error('[usePoiInteraction] leaveShop on close:', err);
            } else {
              console.warn('[usePoiInteraction] leaveShop on close ignored:', err);
            }
          });
        }
      }
      shopLeftRef.current = false;
      setShopOffers([]);
      setShopRerollCount(0);
    }
    setDeferredPoiIndex(null);
    setDeferredPoiType(null);
    // Reset interaction state to re-enable mismatch-detection after POI interaction completes
    setInteractionState('idle');
  }, [deferredPoiType, createPoiCtx]);

  /**
   * Confirm a deferred POI selection on-chain.
   * For Tool Oil: sends interactToolOil with the selected oil flag.
   * For Seismic Scanner: sends interactSeismicScanner with the selected category.
   * For Smuggler Hatch: routes to purchase, reroll, or leave.
   */
  const confirmPoiSelection = useCallback(
    async (
      optionIndex: number
    ): Promise<{
    success: boolean;
    keepOpen?: boolean;
    error?: string;
    bossResolved?: {
      playerWon: boolean;
      finalPlayerHp: number;
      finalPlayerGold: number;
      totalMoves: number;
      phase: number;
      preBossPlayerHp?: number;
      turnsTaken?: number;
      finalEnemyHp?: number;
      signature?: string;
    };
  }> => {
      debugLog(
        '[usePoiInteraction] confirmPoiSelection called | optionIndex:',
        optionIndex,
        '| deferredPoiType:',
        deferredPoiType,
        '| deferredPoiIndex:',
        deferredPoiIndex
      );
      const ctx = createPoiCtx();
      if (
        !ctx ||
        deferredPoiIndex === null ||
        deferredPoiType === null
      ) {
        setError('Session not ready for POI selection');
        return { success: false };
      }

      // Validate deferredPoiIndex against fresh on-chain data before using it.
      const confirmValidated = currentPoi
        ? await validatePoiIndex(
            ctx.program,
            ctx.mapPoisPda,
            deferredPoiIndex,
            currentPoi.x,
            currentPoi.y,
            'confirmPoiSelection',
            sessionDiscoveryPda,
            ctx.connection
          )
        : { index: deferredPoiIndex };
      const validatedPoiIndex = confirmValidated.index;
      if (validatedPoiIndex === -1) {
        setError('POI state changed. Please try again.');
        return { success: false };
      }
      if (validatedPoiIndex !== deferredPoiIndex) {
        setDeferredPoiIndex(validatedPoiIndex);
      }

      setIsInteracting(true);
      setError(null);

      try {
        switch (deferredPoiType) {
          // Rest POIs (L1, L5) — call interactRest on-chain when user confirms
          case POI_TYPES.MOLE_DEN:
          case POI_TYPES.REST_ALCOVE: {
            const restOption = gameState?.activePOI?.options?.[optionIndex];
            if (!restOption) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid option' };
            }

            // Check if Leave option selected
            if (restOption.label === 'Leave') {
              debugLog('[usePoiInteraction] User selected Leave for rest POI');
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              dispatch({ type: 'CLOSE_POI' });
              return { success: true };
            }

            // Check if option is disabled (e.g., "Rest (Night only)")
            if (restOption.disabled) {
              setIsInteracting(false);
              return { success: false, error: restOption.disabledReason ?? 'Option is disabled' };
            }

            // Save pre-interaction week to detect boss resolution after on-chain call
            const preWeek = gameState?.time.week ?? 0;

            // Send interactRest on-chain
            debugLog(
              '[usePoiInteraction] Sending interactRest on-chain | poiIndex:',
              validatedPoiIndex
            );
            const restSignature = await withErPositionRetry(() =>
              interactRest(ctx, validatedPoiIndex)
            );
            debugLog('[usePoiInteraction] interactRest CONFIRMED');

            // Refresh BOTH gameplay state contexts to prevent mismatch-detection from reverting
            // and to allow boss fight detection (which reads SessionContext's onChainState).
            // GameplayStateContext must be updated before we dispatch to the reducer.
            // SessionContext must be updated so GameScreen's boss detection useEffect
            // sees bossFightReady=true (e.g., after rest on Night 3).
            await Promise.all([refreshGameplayState(), refreshSessionState()]);

            // Parse inline boss combat (if Night3 triggered resolution in the same tx).
            // We do this before syncing local state so navigation can use authoritative logs.
            const gameplayProgram = createGameplayStateProgram(gameplayReadConnection);
            let parsedBossCombat:
              | Awaited<ReturnType<typeof parseBossCombatFromMoveTx>>
              | undefined;
            try {
              parsedBossCombat = await parseBossCombatFromMoveTx(
                gameplayConnection,
                restSignature,
                gameplayProgram
              );
            } catch (err) {
              console.warn('[usePoiInteraction] Failed to parse rest tx boss combat:', err);
            }

            // Now fetch and sync to local reducer (healed HP, new phase)
            const updatedState = await fetchGameState(gameplayProgram, ctx.gameStatePda);
            if (updatedState) {
              debugLog(
                '[usePoiInteraction] Syncing REST result | hp:',
                updatedState.hp,
                '| phase:',
                updatedState.phase
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedState });
            }

            // Phase changed (night→day): reveal tiles at new day radius + sync enemies/discovery
            if (updatedState && playerPosition) {
              try {
                // Reveal tiles at day radius (4) around player — on-chain rest doesn't do this
                const revealIx = await buildRevealRadiusInstruction(
                  createMapGeneratorProgram(ctx.connection),
                  ctx.sessionPda,
                  ctx.sessionSignerKeypair.publicKey,
                  playerPosition.x,
                  playerPosition.y,
                  4 // DAY_VISION_RADIUS
                );
                const refreshEnemiesIx = await buildRefreshDiscoveredEnemiesInstruction(
                  createGameplayStateProgram(ctx.connection),
                  ctx.sessionPda,
                  ctx.sessionSignerKeypair.publicKey
                );
                const revealTx = new Transaction().add(
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  revealIx
                );
                await sendSessionSignerTransaction(ctx.connection, revealTx, ctx.sessionSignerKeypair);
                const refreshTx = new Transaction().add(
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                  refreshEnemiesIx
                );
                await sendSessionSignerTransaction(ctx.connection, refreshTx, ctx.sessionSignerKeypair);
              } catch (e) {
                console.warn('[usePoiInteraction] Failed to reveal/refresh after rest:', e);
              }
            }
            {
              const [restSdPda] = deriveSessionDiscoveryPda(ctx.sessionPda);
              const restDiscovery = await fetchSessionDiscovery(
                createMapGeneratorProgram(ctx.connection),
                restSdPda
              ).catch(() => null);
              if (restDiscovery) {
                const sdTiles = unpackDiscoveryTiles(restDiscovery, restDiscovery.mapWidth, restDiscovery.mapHeight);
                const sdEnemies = convertDiscoveredEnemies(restDiscovery.discoveredEnemies, restDiscovery.discoveredEnemyCount);
                const sdPois = convertDiscoveredPois(restDiscovery.discoveredPois, restDiscovery.discoveredPoiCount);
                dispatch({ type: 'SYNC_DISCOVERY', tiles: sdTiles, enemies: sdEnemies, pois: sdPois });
              }
            }

            // Detect boss resolution:
            // - week advanced (typical win on week 1/2),
            // - player died (loss),
            // - final week completed flag set (week 3 win keeps week=3).
            // during this POI interaction (e.g., Rest Alcove on Night 3).
            let bossResolved:
              | {
                  playerWon: boolean;
                  finalPlayerHp: number;
                  finalPlayerGold: number;
                  totalMoves: number;
                  phase: number;
                  preBossPlayerHp?: number;
                  turnsTaken?: number;
                  finalEnemyHp?: number;
                  signature?: string;
                }
              | undefined;
            if (updatedState) {
              const weekAdvanced = updatedState.week > preWeek;
              const playerDied = updatedState.isDead;
              const levelCompleted = updatedState.completed;
              if (weekAdvanced || playerDied || levelCompleted) {
                bossResolved = {
                  playerWon: parsedBossCombat?.combatEnded
                    ? parsedBossCombat.combatEnded.playerWon
                    : !playerDied,
                  finalPlayerHp: updatedState.hp,
                  finalPlayerGold: updatedState.gold,
                  totalMoves: updatedState.totalMoves,
                  phase: updatedState.phase,
                  preBossPlayerHp: parsedBossCombat?.preBossPlayerHp,
                  turnsTaken: parsedBossCombat?.combatEnded?.turnsTaken,
                  finalEnemyHp: parsedBossCombat?.combatEnded?.finalEnemyHp,
                  signature: restSignature,
                };
                debugLog(
                  '[usePoiInteraction] Boss resolved during REST POI:',
                  {
                    ...bossResolved,
                    detection: { weekAdvanced, playerDied, levelCompleted },
                  }
                );
              }
            }

            // Mark one-time POIs as visited locally.
            if (currentPoi && isOneTimePoiType(deferredPoiType)) {
              const localRestPoi = gameState?.map?.pois?.find(
                (p) => p.position.x === currentPoi?.x && p.position.y === currentPoi?.y
              );
              if (localRestPoi) {
                dispatch({ type: 'MARK_POI_VISITED', poiId: localRestPoi.id });
              }
            }

            // Close the POI modal
            dispatch({ type: 'CLOSE_POI' });

            // Clean up state and return (skip common code after switch)
            setDeferredPoiIndex(null);
            setDeferredPoiType(null);
            setInteractionState('complete');
            return { success: true, bossResolved };
          }

          case POI_TYPES.TOOL_OIL_RACK: {
            // Check if player already has oil on weapon - return error for toast display
            if (gameState?.player?.equippedTool?.oil) {
              setIsInteracting(false);
              return { success: false, error: 'You already have an oil on your weapon' };
            }

            // Get oil label from cached on-chain offer options
            const label = cacheOfferOptions?.[optionIndex]?.label ?? '';
            const oilFlag = labelToOilFlag(label);
            if (oilFlag === 0) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid oil selection' };
            }

            // Convert flag to modification enum for player-inventory program
            const modification = oilFlagToModification(oilFlag);
            if (!modification) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid oil modification' };
            }

            // Send combined transaction (poi-system + player-inventory in one tx)
            // This validates the POI, marks it as used, and applies the oil atomically
            await withErPositionRetry(() =>
              interactToolOilCombined(ctx, validatedPoiIndex, modification, oilFlag)
            );
            debugLog('[usePoiInteraction] Tool oil applied on-chain:', modification);

            // Update tool from confirmed on-chain inventory (not optimistic)
            const oilInventoryProgram = createPlayerInventoryProgram(gameplayReadConnection);
            const [oilInventoryPda] = deriveInventoryPda(ctx.sessionPda);
            const oilInventoryData = await fetchInventory(oilInventoryProgram, oilInventoryPda);

            if (oilInventoryData?.tool) {
              const confirmedOilTool = convertToolInstance(oilInventoryData.tool);
              if (confirmedOilTool) {
                dispatch({ type: 'EQUIP_TOOL', tool: confirmedOilTool });
                debugLog(
                  '[usePoiInteraction] Tool oil confirmed from on-chain | oil:',
                  confirmedOilTool.oil
                );
              } else {
                console.warn(
                  '[usePoiInteraction] Tool oil: failed to convert on-chain tool, UI not updated'
                );
              }
            } else {
              console.warn(
                '[usePoiInteraction] Tool oil: failed to fetch inventory, falling back to local'
              );
              // Fallback: apply locally if inventory fetch fails
              const currentTool = gameState?.player?.equippedTool;
              if (currentTool) {
                const oilInfo = oilFlagToToolOil(oilFlag);
                if (oilInfo) {
                  dispatch({ type: 'EQUIP_TOOL', tool: { ...currentTool, oil: oilInfo.oil } });
                }
              }
            }

            // POI consumed state synced via SYNC_DISCOVERY on next move
            break;
          }

          case POI_TYPES.SEISMIC_SCANNER: {
            const label = cacheOfferOptions?.[optionIndex]?.label ?? gameState?.activePOI?.options?.[optionIndex]?.label ?? '';
            if (label === 'Leave' || !label) {
              // User selected Leave — no on-chain tx needed
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              return { success: true };
            }

            // Read scanner offer and pre-interaction discovery state from SessionDiscovery
            const discoveryBefore = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            if (
              !discoveryBefore ||
              discoveryBefore.activeOfferType !== 4 ||
              discoveryBefore.scannerOfferCount === 0
            ) {
              setIsInteracting(false);
              return { success: false, error: 'Scanner options expired. Try again.' };
            }
            const targetPoiType = discoveryBefore.scannerOfferTypes[optionIndex];
            if (targetPoiType == null || optionIndex >= discoveryBefore.scannerOfferCount) {
              setIsInteracting(false);
              return { success: false, error: 'Scanner options expired. Try again.' };
            }

            await withErPositionRetry(() =>
              interactSeismicScanner(ctx, validatedPoiIndex, targetPoiType)
            );
            await Promise.all([
              refreshGameplayState(),
              refreshSessionState(),
            ]);

            const discoveryAfter = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);

            const discoveryDiff =
              discoveryBefore && discoveryAfter
                ? getDiscoveredTileDiff(
                    discoveryBefore.discoveredTiles,
                    discoveryAfter.discoveredTiles,
                    discoveryAfter.mapWidth,
                    discoveryAfter.mapHeight
                  )
                : [];

            if (discoveryDiff.length > 0) {
              dispatch({ type: 'REVEAL_DISCOVERED_TILES', positions: discoveryDiff });
            } else if (discoveryAfter) {
              // Fall back to checking newly discovered POIs in SessionDiscovery
              const beforePoiCount = discoveryBefore.discoveredPoiCount;
              const afterPois = convertDiscoveredPois(discoveryAfter.discoveredPois, discoveryAfter.discoveredPoiCount);
              // Any POI beyond beforePoiCount is newly discovered
              const newPois = afterPois.slice(beforePoiCount);
              if (newPois.length > 0) {
                dispatch({
                  type: 'REVEAL_DISCOVERED_TILES',
                  positions: newPois.map((p) => ({ x: p.position.x, y: p.position.y })),
                });
              }
            }
            // Sync tile types, enemies, and POIs from SessionDiscovery
            if (discoveryAfter) {
              const sdTiles = unpackDiscoveryTiles(discoveryAfter, discoveryAfter.mapWidth, discoveryAfter.mapHeight);
              const sdEnemies = convertDiscoveredEnemies(discoveryAfter.discoveredEnemies, discoveryAfter.discoveredEnemyCount);
              const sdPois = convertDiscoveredPois(discoveryAfter.discoveredPois, discoveryAfter.discoveredPoiCount);
              dispatch({ type: 'SYNC_DISCOVERY', tiles: sdTiles, enemies: sdEnemies, pois: sdPois });
            }
            break;
          }

          case POI_TYPES.RAIL_WAYPOINT: {
            const waypointOption = gameState?.activePOI?.options?.[optionIndex];
            if (!waypointOption) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid option' };
            }

            if (waypointOption.label === 'Leave' || !waypointOption.label.startsWith('Travel')) {
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              dispatch({ type: 'CLOSE_POI' });
              return { success: true };
            }

            if (waypointOption.disabled) {
              setIsInteracting(false);
              return { success: false, error: waypointOption.disabledReason ?? 'Option is disabled' };
            }

            // Find the destination waypoint's POI index from the option
            // The option label format is "Travel to (x, y)"
            const coordMatch = waypointOption.label.match(/\((\d+),\s*(\d+)\)/);
            if (coordMatch) {
              const destX = parseInt(coordMatch[1], 10);
              const destY = parseInt(coordMatch[2], 10);

              // Re-validate both indices against fresh on-chain data.
              // After SYNC_DISCOVERY, local pois may have stale indices.
              // Fetch current on-chain position (playerPosition may be stale from closure).
              const freshGameState = await fetchGameState(
                createGameplayStateProgram(gameplayReadConnection),
                ctx.gameStatePda
              );
              const currentX = freshGameState?.positionX ?? playerPosition?.x ?? 0;
              const currentY = freshGameState?.positionY ?? playerPosition?.y ?? 0;
              console.log('[usePoiInteraction] Fast travel validation:', {
                freshPosition: { x: currentX, y: currentY },
                closurePosition: playerPosition,
                destCoords: { x: destX, y: destY },
                validatedPoiIndex,
              });
              const fromValidated = await validatePoiIndex(
                ctx.program, ctx.mapPoisPda,
                validatedPoiIndex,
                currentX, currentY,
                'fastTravel(from)',
                sessionDiscoveryPda, ctx.connection
              );
              const destValidated = await validatePoiIndex(
                ctx.program, ctx.mapPoisPda,
                -1,
                destX, destY,
                'fastTravel(to)',
                sessionDiscoveryPda, ctx.connection
              );

              if (fromValidated.index !== -1 && destValidated.index !== -1) {
                debugLog(
                  '[usePoiInteraction] Fast travel | from poiIndex:',
                  fromValidated.index,
                  '| to poiIndex:',
                  destValidated.index
                );
                await withErPositionRetry(() =>
                  fastTravel(ctx, fromValidated.index, destValidated.index)
                );
                debugLog('[usePoiInteraction] fastTravel CONFIRMED');

                // Refresh gameplay state to sync position
                await refreshGameplayState();

                const gameplayProgram = createGameplayStateProgram(gameplayReadConnection);
                const updatedState = await fetchGameState(gameplayProgram, ctx.gameStatePda);
                if (updatedState) {
                  dispatch({ type: 'SYNC_MOVE', confirmedState: updatedState });
                }

                // Reveal tiles at destination + sync enemies after fast travel
                try {
                  const isNight = updatedState?.phase != null &&
                    (updatedState.phase === 1 || updatedState.phase === 3 || updatedState.phase === 5);
                  const ftRadius = isNight ? 2 : 4;
                  const revealIx = await buildRevealRadiusInstruction(
                    createMapGeneratorProgram(ctx.connection),
                    ctx.sessionPda,
                    ctx.sessionSignerKeypair.publicKey,
                    destX,
                    destY,
                    ftRadius
                  );
                  const revealTx = new Transaction().add(
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                    revealIx
                  );
                  await sendSessionSignerTransaction(ctx.connection, revealTx, ctx.sessionSignerKeypair);

                  const refreshEnemiesIx = await buildRefreshDiscoveredEnemiesInstruction(
                    createGameplayStateProgram(ctx.connection),
                    ctx.sessionPda,
                    ctx.sessionSignerKeypair.publicKey
                  );
                  const refreshTx = new Transaction().add(
                    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
                    refreshEnemiesIx
                  );
                  await sendSessionSignerTransaction(ctx.connection, refreshTx, ctx.sessionSignerKeypair);
                } catch (e) {
                  console.warn('[usePoiInteraction] Failed to reveal/refresh after fast travel:', e);
                }
                {
                  const [ftSdPda] = deriveSessionDiscoveryPda(ctx.sessionPda);
                  const ftDiscovery = await fetchSessionDiscovery(
                    createMapGeneratorProgram(ctx.connection),
                    ftSdPda
                  ).catch(() => null);
                  if (ftDiscovery) {
                    const sdTiles = unpackDiscoveryTiles(ftDiscovery, ftDiscovery.mapWidth, ftDiscovery.mapHeight);
                    const sdEnemies = convertDiscoveredEnemies(ftDiscovery.discoveredEnemies, ftDiscovery.discoveredEnemyCount);
                    const sdPois = convertDiscoveredPois(ftDiscovery.discoveredPois, ftDiscovery.discoveredPoiCount);
                    dispatch({ type: 'SYNC_DISCOVERY', tiles: sdTiles, enemies: sdEnemies, pois: sdPois });
                  }
                }
              }
            }

            break;
          }

          case POI_TYPES.SMUGGLER_HATCH: {
            const option = cacheOfferOptions?.[optionIndex];
            if (!option) {
              setIsInteracting(false);
              return { success: false };
            }

            if (option.label === 'Leave') {
              await withErPositionRetry(() =>
                leaveShop(ctx)
              );
              shopLeftRef.current = true;
              setShopOffers([]);
              setShopRerollCount(0);
              break; // Will clean up deferred state and consume POI below
            }

            if (option.label.includes('Reroll')) {
              await withErPositionRetry(() =>
                shopReroll(ctx)
              );

              // Sync gold from on-chain state after reroll
              await refreshGameplayState();
              const rerollGameplayProgram = createGameplayStateProgram(gameplayReadConnection);
              const updatedRerollState = await fetchGameState(
                rerollGameplayProgram,
                ctx.gameStatePda
              );
              if (updatedRerollState) {
                debugLog(
                  '[usePoiInteraction] Syncing SHOP reroll | gold:',
                  updatedRerollState.gold
                );
                dispatch({ type: 'SYNC_MOVE', confirmedState: updatedRerollState });
              }

              // Re-fetch shop state from SessionDiscovery and update options
              const rerollDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
              if (rerollDiscovery && rerollDiscovery.activeOfferType === 1 && rerollDiscovery.shopActive !== 0) {
                const rerollAdaptedOffers = discoveryShopOffersToItemOffers(rerollDiscovery.shopOffers);
                setShopOffers(rerollAdaptedOffers);
                setShopRerollCount(rerollDiscovery.shopRerollCount);
                const gold = updatedRerollState?.gold ?? gameState?.player?.stats?.gold ?? 0;
                setCacheOfferOptions(
                  convertShopOffersToOptions(
                    rerollAdaptedOffers,
                    rerollDiscovery.shopRerollCount,
                    gold
                  )
                );
              }
              setIsInteracting(false);
              return { success: true, keepOpen: true };
            }

            // Purchase item — optionIndex maps to on-chain offer index
            await withErPositionRetry(() =>
              shopPurchase(ctx, optionIndex)
            );
            playSfx('gold_pickup');

            // Sync gold + inventory from on-chain state after purchase
            await refreshGameplayState();
            const gameplayProgram = createGameplayStateProgram(gameplayReadConnection);
            const updatedShopState = await fetchGameState(gameplayProgram, ctx.gameStatePda);
            if (updatedShopState) {
              debugLog(
                '[usePoiInteraction] Syncing SHOP purchase | gold:',
                updatedShopState.gold
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedShopState });
            }

            // Sync inventory so newly purchased gear is available to other POIs (e.g. Rune Kiln)
            const shopInventoryProgram = createPlayerInventoryProgram(gameplayReadConnection);
            const [shopInventoryPda] = deriveInventoryPda(ctx.sessionPda);
            const shopInventoryData = await fetchInventory(
              shopInventoryProgram,
              shopInventoryPda
            );
            if (shopInventoryData) {
              const confirmedShopTool = shopInventoryData.tool
                ? convertToolInstance(shopInventoryData.tool)
                : null;
              const confirmedShopGear = shopInventoryData.gear
                .map((g) => (g ? convertGearInstance(g) : null))
                .filter((g): g is Gear => g !== null);
              debugLog(
                '[usePoiInteraction] Shop: syncing inventory from on-chain | gear count:',
                confirmedShopGear.length
              );
              dispatch({
                type: 'SYNC_INVENTORY',
                tool: confirmedShopTool,
                gear: confirmedShopGear,
              });
            }

            // Re-fetch shop state from SessionDiscovery and update options
            const purchaseDiscovery = await fetchDiscoveryOffers(ctx.connection, ctx.sessionPda);
            if (purchaseDiscovery && purchaseDiscovery.activeOfferType === 1 && purchaseDiscovery.shopActive !== 0) {
              const purchaseAdaptedOffers = discoveryShopOffersToItemOffers(purchaseDiscovery.shopOffers);
              setShopOffers(purchaseAdaptedOffers);
              setShopRerollCount(purchaseDiscovery.shopRerollCount);
              const gold = updatedShopState?.gold ?? gameState?.player?.stats?.gold ?? 0;
              setCacheOfferOptions(
                convertShopOffersToOptions(
                  purchaseAdaptedOffers,
                  purchaseDiscovery.shopRerollCount,
                  gold
                )
              );
            }
            setIsInteracting(false);
            return { success: true, keepOpen: true };
          }

          case POI_TYPES.RUNE_KILN: {
            const kilnOption = gameState?.activePOI?.options?.[optionIndex];
            if (!kilnOption) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid option' };
            }

            if (kilnOption.label === 'Leave') {
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              dispatch({ type: 'CLOSE_POI' });
              return { success: true };
            }

            const kilnGear = kilnOption.item;
            if (!kilnGear || !('id' in kilnGear) || !('currentRarity' in kilnGear)) {
              setIsInteracting(false);
              return { success: false, error: 'No gear selected' };
            }

            // Convert frontend gear ID to on-chain 8-byte format
            const kilnBackendId = gearToBackend(kilnGear.id as GearId);
            const kilnIdBytes = new Uint8Array(8);
            for (let i = 0; i < Math.min(kilnBackendId.length, 8); i++) {
              kilnIdBytes[i] = kilnBackendId.charCodeAt(i);
            }

            // Map rarity to on-chain tier: COMMON=1, GILDED=2
            const kilnTier = kilnGear.currentRarity === 'GILDED' ? 2 : 1;

            debugLog(
              '[usePoiInteraction] Sending interactRuneKiln on-chain | gear:',
              kilnGear.id,
              '| backendId:',
              kilnBackendId,
              '| tier:',
              kilnTier
            );
            await withErPositionRetry(() =>
              interactRuneKiln(ctx, validatedPoiIndex, kilnIdBytes, kilnTier, kilnIdBytes, kilnTier)
            );
            debugLog('[usePoiInteraction] interactRuneKiln CONFIRMED');
            playSfx('poi_kiln');

            // Sync inventory from confirmed on-chain state (not optimistic)
            const kilnInventoryProgram = createPlayerInventoryProgram(gameplayReadConnection);
            const [kilnInventoryPda] = deriveInventoryPda(ctx.sessionPda);
            const kilnInventoryData = await fetchInventory(
              kilnInventoryProgram,
              kilnInventoryPda
            );

            if (kilnInventoryData) {
              const confirmedKilnTool = kilnInventoryData.tool
                ? convertToolInstance(kilnInventoryData.tool)
                : null;
              const confirmedKilnGear = kilnInventoryData.gear
                .map((g) => (g ? convertGearInstance(g) : null))
                .filter((g): g is Gear => g !== null);

              debugLog(
                '[usePoiInteraction] Kiln: syncing inventory from on-chain | gear count:',
                confirmedKilnGear.length
              );
              dispatch({
                type: 'SYNC_INVENTORY',
                tool: confirmedKilnTool,
                gear: confirmedKilnGear,
              });

              // Check if more fusable pairs remain — keep modal open if so
              const kilnUpdatedState: Pick<GameState, 'player' | 'time'> = {
                player: {
                  ...gameState!.player,
                  inventory: confirmedKilnGear.map((g, i) => ({ item: g, index: i })),
                  equippedTool: confirmedKilnTool ?? gameState!.player.equippedTool,
                },
                time: gameState!.time,
              };
              const freshKilnOptions = generateRuneKilnOptions(kilnUpdatedState as GameState);
              const hasMoreFusable = freshKilnOptions.some(
                (opt) => opt.label !== 'Leave' && !opt.disabled
              );

              if (hasMoreFusable && gameState?.activePOI) {
                dispatch({
                  type: 'SHOW_POI_MODAL',
                  interaction: {
                    poi: gameState.activePOI.poi,
                    type: gameState.activePOI.type,
                    options: freshKilnOptions,
                  },
                });
                setIsInteracting(false);
                return { success: true, keepOpen: true };
              }
            } else {
              console.warn(
                '[usePoiInteraction] Kiln: failed to fetch inventory, falling back to local update'
              );
              dispatch({ type: 'FUSE_GEAR', gearId: kilnGear.id as GearId });
            }

            break;
          }

          case POI_TYPES.RUSTY_ANVIL: {
            const anvilOption = gameState?.activePOI?.options?.[optionIndex];
            if (!anvilOption) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid option' };
            }

            if (anvilOption.label === 'Leave') {
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              dispatch({ type: 'CLOSE_POI' });
              return { success: true };
            }

            if (anvilOption.disabled) {
              setIsInteracting(false);
              return { success: false, error: anvilOption.disabledReason ?? 'Option is disabled' };
            }

            const tool = gameState?.player?.equippedTool;
            if (!tool) {
              setIsInteracting(false);
              return { success: false, error: 'No tool equipped' };
            }

            // Convert frontend tool ID to on-chain 8-byte format
            const anvilBackendId = toolToBackend(tool.id as ToolId);
            const anvilIdBytes = new Uint8Array(8);
            for (let i = 0; i < Math.min(anvilBackendId.length, 8); i++) {
              anvilIdBytes[i] = anvilBackendId.charCodeAt(i);
            }

            // Map rarity to on-chain tier: COMMON=1, GILDED=2
            const anvilTier = tool.rarity === 'GILDED' ? 2 : 1;

            debugLog(
              '[usePoiInteraction] Sending interactRustyAnvil on-chain | tool:',
              tool.id,
              '| backendId:',
              anvilBackendId,
              '| tier:',
              anvilTier
            );
            await withErPositionRetry(() =>
              interactRustyAnvil(ctx, validatedPoiIndex, anvilIdBytes, anvilTier)
            );
            debugLog('[usePoiInteraction] interactRustyAnvil CONFIRMED');
            playSfx('poi_anvil');

            // Fetch confirmed on-chain state (gameplay + inventory) to verify the upgrade
            const [gameplayProgram, inventoryProgram] = [
              createGameplayStateProgram(gameplayReadConnection),
              createPlayerInventoryProgram(gameplayReadConnection),
            ];
            const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);

            const [updatedAnvilState, inventoryData] = await Promise.all([
              fetchGameState(gameplayProgram, ctx.gameStatePda),
              fetchInventory(inventoryProgram, inventoryPda),
              refreshGameplayState(),
            ]);

            if (updatedAnvilState) {
              debugLog(
                '[usePoiInteraction] Syncing ANVIL result | gold:',
                updatedAnvilState.gold
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedAnvilState });
            }

            // Update tool from confirmed on-chain inventory (not optimistic)
            if (inventoryData?.tool) {
              const confirmedTool = convertToolInstance(inventoryData.tool);
              if (confirmedTool) {
                debugLog(
                  '[usePoiInteraction] Anvil: confirmed tool from on-chain | id:',
                  confirmedTool.id,
                  '| rarity:',
                  confirmedTool.rarity,
                  '| stats:',
                  confirmedTool.stats
                );
                dispatch({ type: 'EQUIP_TOOL', tool: confirmedTool });

                // Keep open if upgraded to GILDED and can still afford next tier (20g)
                const confirmedGold = updatedAnvilState?.gold ?? gameState?.player?.stats?.gold ?? 0;
                if (confirmedTool.rarity === 'GILDED' && confirmedGold >= 20 && gameState?.activePOI) {
                  const anvilUpdatedState: Pick<GameState, 'player' | 'time'> = {
                    player: {
                      ...gameState.player,
                      equippedTool: confirmedTool,
                      stats: { ...gameState.player.stats, gold: confirmedGold },
                    },
                    time: gameState.time,
                  };
                  const freshAnvilOptions = generateRustyAnvilOptions(anvilUpdatedState as GameState);
                  dispatch({
                    type: 'SHOW_POI_MODAL',
                    interaction: {
                      poi: gameState.activePOI.poi,
                      type: gameState.activePOI.type,
                      options: freshAnvilOptions,
                    },
                  });
                  setIsInteracting(false);
                  return { success: true, keepOpen: true };
                }
              } else {
                console.warn(
                  '[usePoiInteraction] Anvil: failed to convert on-chain tool, UI not updated'
                );
              }
            } else {
              console.warn(
                '[usePoiInteraction] Anvil: failed to fetch inventory, UI not updated'
              );
            }

            break;
          }

          case POI_TYPES.SCRAP_CHUTE: {
            const scrapOption = gameState?.activePOI?.options?.[optionIndex];
            if (!scrapOption) {
              setIsInteracting(false);
              return { success: false, error: 'Invalid option' };
            }

            if (scrapOption.label === 'Leave') {
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              dispatch({ type: 'CLOSE_POI' });
              return { success: true };
            }

            const scrapGear = scrapOption.item;
            if (!scrapGear || !('id' in scrapGear)) {
              setIsInteracting(false);
              return { success: false, error: 'No gear selected' };
            }

            // Convert frontend gear ID to on-chain 8-byte format
            const backendId = gearToBackend(scrapGear.id as any);
            const idBytes = new Uint8Array(8);
            for (let i = 0; i < Math.min(backendId.length, 8); i++) {
              idBytes[i] = backendId.charCodeAt(i);
            }

            debugLog(
              '[usePoiInteraction] Sending interactScrapChute on-chain | gear:',
              scrapGear.id,
              '| backendId:',
              backendId
            );
            await withErPositionRetry(() =>
              interactScrapChute(ctx, validatedPoiIndex, idBytes)
            );
            debugLog('[usePoiInteraction] interactScrapChute CONFIRMED');
            playSfx('gold_pickup');

            // Fetch confirmed on-chain state (gameplay + inventory)
            const scrapGameplayProgram = createGameplayStateProgram(gameplayReadConnection);
            const scrapInventoryProgram = createPlayerInventoryProgram(gameplayReadConnection);
            const [scrapInventoryPda] = deriveInventoryPda(ctx.sessionPda);

            const [updatedScrapState, scrapInventoryData] = await Promise.all([
              fetchGameState(scrapGameplayProgram, ctx.gameStatePda),
              fetchInventory(scrapInventoryProgram, scrapInventoryPda),
              refreshGameplayState(),
            ]);

            if (updatedScrapState) {
              debugLog(
                '[usePoiInteraction] Syncing SCRAP result | gold:',
                updatedScrapState.gold
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedScrapState });
            }

            // Sync inventory from confirmed on-chain state (not optimistic)
            if (scrapInventoryData) {
              const confirmedScrapTool = scrapInventoryData.tool
                ? convertToolInstance(scrapInventoryData.tool)
                : null;
              const confirmedScrapGear = scrapInventoryData.gear
                .map((g) => (g ? convertGearInstance(g) : null))
                .filter((g): g is Gear => g !== null);

              debugLog(
                '[usePoiInteraction] Scrap: syncing inventory from on-chain | gear count:',
                confirmedScrapGear.length
              );
              dispatch({
                type: 'SYNC_INVENTORY',
                tool: confirmedScrapTool,
                gear: confirmedScrapGear,
              });

              // Check if more scrapable gear remains — keep modal open if so
              const confirmedScrapGold =
                updatedScrapState?.gold ?? gameState?.player?.stats?.gold ?? 0;
              const scrapUpdatedState: Pick<GameState, 'player' | 'time'> = {
                player: {
                  ...gameState!.player,
                  inventory: confirmedScrapGear.map((g, i) => ({ item: g, index: i })),
                  equippedTool: confirmedScrapTool ?? gameState!.player.equippedTool,
                  stats: { ...gameState!.player.stats, gold: confirmedScrapGold },
                },
                time: gameState!.time,
              };
              const freshScrapOptions = generateScrapChuteOptions(scrapUpdatedState as GameState);
              const hasMoreScrapable = freshScrapOptions.some(
                (opt) => opt.label !== 'Leave' && !opt.disabled
              );

              if (hasMoreScrapable && gameState?.activePOI) {
                dispatch({
                  type: 'SHOW_POI_MODAL',
                  interaction: {
                    poi: gameState.activePOI.poi,
                    type: gameState.activePOI.type,
                    options: freshScrapOptions,
                  },
                });
                setIsInteracting(false);
                return { success: true, keepOpen: true };
              }
            } else {
              console.warn(
                '[usePoiInteraction] Scrap: failed to fetch inventory, falling back to local update'
              );
              dispatch({ type: 'DISCARD_GEAR_BY_ID', gearId: scrapGear.id as any });
            }

            break;
          }

          default:
            setError(`Unknown deferred POI type: ${deferredPoiType}`);
            setIsInteracting(false);
            return { success: false };
        }

        // Only consume one-time POIs.
        if (currentPoi && isOneTimePoiType(deferredPoiType)) {
          if (validatedPoiIndex !== null) {
            await assertPoiConsumedOnChain(validatedPoiIndex);
          }
        }

        // Mark one-time POIs as visited in local game state.
        if (currentPoi && isOneTimePoiType(deferredPoiType)) {
          const localPoiForDeferred = gameState?.map?.pois?.find(
            (p) => p.position.x === currentPoi?.x && p.position.y === currentPoi?.y
          );
          if (localPoiForDeferred) {
            dispatch({ type: 'MARK_POI_VISITED', poiId: localPoiForDeferred.id });
          }
        }

        // Close the POI modal and return to exploration
        dispatch({ type: 'CLOSE_POI' });

        setCacheOfferOptions(null);
        setCacheOfferParams(null);
        setDeferredPoiIndex(null);
        setDeferredPoiType(null);
        setInteractionState('complete');
        return { success: true };
      } catch (err) {
        const errorMessage = getUserErrorMessage(err, 'poi_system');
        setError(errorMessage);
        console.error('[usePoiInteraction] confirmPoiSelection error:', err);
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      createPoiCtx,
      assertPoiConsumedOnChain,
      deferredPoiIndex,
      deferredPoiType,
      gameplayConnection,
      currentPoi,
      dispatch,
      gameState?.activePOI?.options,
      gameState?.player?.stats?.gold,
      gameState?.player?.equippedTool,
      cacheOfferOptions,
      refreshGameplayState,
      refreshSessionState,
      sessionPda,
    ]
  );

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return useMemo(
    () => ({
      canInteract,
      shouldAutoOpen,
      currentPoi,
      isInteracting,
      error,
      interactionState,
      shopOffers,
      shopRerollCount,
      interact,
      hasPoiAt,
      getPoiAt,
      clearError,
      purchaseItem,
      rerollShop: rerollShopFn,
      exitShop,
      travelToWaypoint,
      executeFastTravel,
      cacheOfferOptions,
      selectCacheOffer,
      clearCacheOffers,
      confirmPoiSelection,
      deferredPoiType,
    }),
    [
      canInteract,
      shouldAutoOpen,
      currentPoi,
      isInteracting,
      error,
      interactionState,
      shopOffers,
      shopRerollCount,
      interact,
      hasPoiAt,
      getPoiAt,
      clearError,
      purchaseItem,
      rerollShopFn,
      exitShop,
      travelToWaypoint,
      executeFastTravel,
      cacheOfferOptions,
      selectCacheOffer,
      clearCacheOffers,
      confirmPoiSelection,
      deferredPoiType,
    ]
  );
}
