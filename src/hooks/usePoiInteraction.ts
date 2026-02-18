/**
 * usePoiInteraction Hook
 *
 * Handles POI (Point of Interest) interaction logic with on-chain dispatch.
 * POI interactions are explicit (require button press), not auto-triggered.
 * Manages sub-state machines for multi-step interactions (shops, item choices).
 *
 * @see spec.md for POI interaction requirements
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useGame, GamePhase } from '@/contexts/GameContext';
import { useSession } from '@/contexts/SessionContext';
import { useGameplayStateContext, type PoiData } from '@/contexts/GameplayStateContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createPoiSystemProgramWithProvider,
  createAnchorProvider,
  createGameplayStateProgram,
} from '@/services/solana/programs';
import { oilFlagToModification } from '@/services/solana/types/player_inventory';
import { useWallet } from '@/contexts/WalletContext';
import { deriveMapPoisPda } from '@/services/solana/constants';
import { getGameStatePda, fetchGameState } from '@/services/solana/gameplayState';
import { POI_TYPES } from '@/services/solana/types/poi_system';
import type {
  ItemOffer,
  PoiInteractionState,
  CacheOffer,
} from '@/services/solana/types/poi_system';
import { Phase } from '@/services/solana/types/gameplay_state';
import { getUserErrorMessage } from '@/services/solana/errors';
import {
  interactRest,
  interactPickItem,
  interactToolOilCombined,
  interactSurveyBeacon,
  interactSeismicScanner,
  fastTravel,
  enterShop,
  shopPurchase,
  shopReroll,
  leaveShop,
  interactRustyAnvil,
  interactRuneKiln,
  interactScrapChute,
  fetchMapPois,
  generateCacheOffer,
  generateOilOffer,
} from '@/services/solana/poiSystem';
import { decodeItemId } from '@/services/solana/sessionRestore';
import { gearToBackend, toolToBackend } from '@/data/id-mapping';
import { createGearInstance } from '@/game/entities/items';
import { createToolInstance } from '@/game/entities/items';
import type { Position, POIOption, GearId, ToolId, Tool, Gear, ToolOil } from '@/game/engine/types';

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
  ) => Promise<{ success: boolean; keepOpen?: boolean; error?: string }>;
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

/** Map seismic scanner option label to on-chain category (0=Items,1=Upgrades,2=Utility,3=Shop) */
function labelToScanCategory(label: string): number {
  if (/Supply Cache|Tool Crate|Tool Oil|Geode Vault|Counter Cache/.test(label)) return 0;
  if (/Rusty Anvil|Rune Kiln|Scrap Chute/.test(label)) return 1;
  if (/Mole Den|Rest Alcove|Survey Beacon|Rail Waypoint|Seismic Scanner/.test(label)) return 2;
  if (/Smuggler Hatch/.test(label)) return 3;
  return 0;
}

function isNightPhase(phase: Phase): boolean {
  return phase === Phase.Night1 || phase === Phase.Night2 || phase === Phase.Night3;
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
  // Tier: 1=Tier I (COMMON), 2=Tier II (GILDED), 3=Tier III (DIAMOND)
  const tierToRarity = ['COMMON', 'COMMON', 'GILDED', 'DIAMOND'] as const; // Index 0 unused, tiers are 1-3

  for (const offer of offers) {
    const engineId = decodeItemId(offer.itemId);
    if (!engineId) {
      options.push({ label: 'Unknown Item', disabled: true });
      continue;
    }

    try {
      const rarity = tierToRarity[offer.tier] ?? 'COMMON';
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
    pois,
    getPoiAt: getOnChainPoiAt,
    consumePoi,
    gameState: chainGameState,
    refreshMapEntities,
    refresh: refreshGameplayState,
  } = useGameplayStateContext();
  const { gameplayConnection } = useSolanaConnection();
  const { wallet } = useWallet();

  const [isInteracting, setIsInteracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interactionState, setInteractionState] = useState<PoiInteractionState>('idle');
  const [shopOffers, setShopOffers] = useState<ItemOffer[]>([]);
  const [shopRerollCount, setShopRerollCount] = useState(0);
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
      consumePoi(poi.x, poi.y);
      const localPoi = gameState?.map?.pois?.find(
        (p) => p.position.x === poi.x && p.position.y === poi.y
      );
      if (localPoi) {
        dispatch({ type: 'MARK_POI_VISITED', poiId: localPoi.id });
      }
    },
    [consumePoi, dispatch, gameState?.map?.pois]
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

  // Check if there's a valid POI at the player's current position
  const currentPoi = useMemo((): PoiData | undefined => {
    if (!playerPosition) return undefined;

    // Check on-chain POIs
    const onChainPoi = getOnChainPoiAt(playerPosition.x, playerPosition.y);
    if (onChainPoi && !onChainPoi.consumed) {
      console.log(
        '[usePoiInteraction] currentPoi: found on-chain POI at',
        playerPosition.x,
        playerPosition.y,
        '| poiType:',
        onChainPoi.poiType
      );
      return onChainPoi;
    }

    // Fall back to local game state POIs
    if (gameState?.map?.pois) {
      const localPoi = gameState.map.pois.find(
        (p) => p.position.x === playerPosition.x && p.position.y === playerPosition.y && !p.visited
      );
      if (localPoi) {
        // Derive poiType from definitionId (e.g. 'L2' → 2, 'L13' → 13)
        const poiType = parseInt(localPoi.definitionId.substring(1), 10) || 0;
        console.log(
          '[usePoiInteraction] currentPoi: local fallback at',
          playerPosition.x,
          playerPosition.y,
          '| definitionId:',
          localPoi.definitionId,
          '| derived poiType:',
          poiType,
          '| on-chain pois loaded:',
          pois.length
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
  }, [playerPosition, getOnChainPoiAt, gameState?.map?.pois, pois.length]);

  // Can interact if:
  // 1. Player is in exploration phase
  // 2. There's a non-consumed POI at current position
  // 3. One-time POIs haven't been used
  // Note: Night-only POIs (Mole Den, Rest Alcove) still show canInteract=true during day.
  // The modal will show with the "Rest" option disabled, explaining "Night only".
  const canInteract = useMemo((): boolean => {
    if (!gameState || gameState.phase !== GamePhase.Exploration) {
      return false;
    }
    if (!currentPoi || currentPoi.consumed) {
      return false;
    }

    console.log(
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
        console.log('[usePoiInteraction] shouldAutoOpen: false (already has oil on weapon)');
        return false;
      }
    }

    // Pick Item POIs (L2, L3, L12, L13): Don't auto-open if inventory is full
    const PICK_ITEM_POIS: number[] = [
      POI_TYPES.SUPPLY_CACHE,
      POI_TYPES.TOOL_CRATE,
      POI_TYPES.GEODE_VAULT,
      POI_TYPES.COUNTER_CACHE,
    ];
    if (PICK_ITEM_POIS.includes(poiType)) {
      const hasSpace = gameState.player.inventory.length < gameState.player.inventoryCapacity;
      if (!hasSpace) {
        console.log('[usePoiInteraction] shouldAutoOpen: false (inventory full)');
        return false;
      }
    }

    return true;
  }, [canInteract, currentPoi, gameState]);

  /**
   * Find POI index in the on-chain pois array by position.
   */
  const findPoiIndex = useCallback(
    (x: number, y: number): number => {
      return pois.findIndex((p) => p.x === x && p.y === y);
    },
    [pois]
  );

  /**
   * Check if there's a POI at a specific position.
   */
  const hasPoiAt = useCallback(
    (x: number, y: number): boolean => {
      const onChainPoi = getOnChainPoiAt(x, y);
      if (onChainPoi && !onChainPoi.consumed) {
        return true;
      }

      if (gameState?.map?.pois) {
        const localPoi = gameState.map.pois.find(
          (p) => p.position.x === x && p.position.y === y && !p.visited
        );
        return localPoi !== undefined;
      }

      return false;
    },
    [getOnChainPoiAt, gameState?.map?.pois]
  );

  /**
   * Get POI data at a specific position.
   */
  const getPoiAt = useCallback(
    (x: number, y: number): PoiData | undefined => {
      const onChainPoi = getOnChainPoiAt(x, y);
      if (onChainPoi && !onChainPoi.consumed) {
        return onChainPoi;
      }

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
    [getOnChainPoiAt, gameState?.map?.pois]
  );

  /**
   * Verifies that a one-time POI was actually consumed on-chain.
   * This prevents local optimistic state (inventory/visited) from drifting when a tx
   * appears processed but did not persist.
   */
  const assertPoiConsumedOnChain = useCallback(
    async (poiIndex: number): Promise<void> => {
      if (!poiProgram || !mapPoisPda) {
        throw new Error('POI program not ready for verification');
      }
      const latest = await fetchMapPois(poiProgram, mapPoisPda);
      const poi = latest?.pois?.[poiIndex];
      if (!poi || !poi.used) {
        throw new Error('POI interaction not persisted on-chain');
      }
    },
    [poiProgram, mapPoisPda]
  );

  /**
   * Interact with the POI at current position.
   * Dispatches the correct on-chain instruction based on POI type.
   */
  const interact = useCallback(
    async (params?: PoiInteractParams): Promise<{ success: boolean; result?: unknown }> => {
      console.log(
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
          console.log('[usePoiInteraction] Guest mode: dispatching INTERACT_POI for', localPoi.id);
          dispatch({ type: 'INTERACT_POI', poiId: localPoi.id });
          return { success: true };
        }
        console.warn('[usePoiInteraction] Guest mode: no local POI found at', currentPoi.x, currentPoi.y);
        setError('POI not found');
        return { success: false };
      }

      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !gameStatePda || !sessionPda) {
        console.warn(
          '[usePoiInteraction] interact() BLOCKED: session not ready | sessionSigner:',
          !!sessionSignerKeypair,
          '| poiProgram:',
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

      let poiIndex = findPoiIndex(currentPoi.x, currentPoi.y);
      console.log(
        '[usePoiInteraction] findPoiIndex result:',
        poiIndex,
        '| on-chain pois count:',
        pois.length
      );

      // If POIs haven't been loaded into context yet, fetch directly from on-chain
      if (poiIndex === -1 && mapPoisPda) {
        console.log(
          '[usePoiInteraction] POI not in context — fetching MapPois directly from on-chain...'
        );
        try {
          const mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);
          if (mapPoisData?.pois) {
            console.log(
              '[usePoiInteraction] Fetched',
              mapPoisData.pois.length,
              'POIs from on-chain'
            );
            poiIndex = mapPoisData.pois.findIndex(
              (p) => p.x === currentPoi.x && p.y === currentPoi.y && !p.used
            );
            console.log('[usePoiInteraction] Direct lookup poiIndex:', poiIndex);
            // Also trigger a background refresh so context catches up
            if (sessionPda) {
              refreshMapEntities(sessionPda).catch((err) =>
                console.warn('[usePoiInteraction] Background refreshMapEntities failed:', err)
              );
            }
          }
        } catch (fetchErr) {
          console.error('[usePoiInteraction] Direct fetchMapPois failed:', fetchErr);
        }
      }

      if (poiIndex === -1) {
        console.error(
          '[usePoiInteraction] POI NOT FOUND at',
          currentPoi.x,
          currentPoi.y,
          '| context pois:',
          JSON.stringify(
            pois.map((p) => ({ x: p.x, y: p.y, type: p.poiType, consumed: p.consumed }))
          )
        );
        setError('POI not found on-chain. Try again.');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);
      setInteractionState('confirming');

      try {
        const poiType = currentPoi.poiType;
        console.log(
          '[usePoiInteraction] Dispatching on-chain interaction | poiType:',
          poiType,
          '| poiIndex:',
          poiIndex
        );

        switch (poiType) {
          // Rest POIs (L1, L5) — Deferred flow:
          // Step 1 (here): show modal with options (Rest / Leave)
          // Step 2 (confirmPoiSelection): call interactRest on-chain when user confirms
          case POI_TYPES.MOLE_DEN:
          case POI_TYPES.REST_ALCOVE: {
            console.log('[usePoiInteraction] Rest POI | poiType:', poiType, '| showing modal');

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
            console.log(
              '[usePoiInteraction] Pick-item POI flow | poiType:',
              poiType,
              '| poiIndex:',
              poiIndex
            );
            // Fetch current MapPois to check for existing offer
            let mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);

            const onChainPoi = mapPoisData?.pois?.[poiIndex];
            if (onChainPoi?.used) {
              console.warn(
                '[usePoiInteraction] POI already consumed on-chain before offer generation | poiIndex:',
                poiIndex
              );
              syncLocalPoiAsConsumed(currentPoi);
              dispatch({ type: 'CLOSE_POI' });
              setInteractionState('complete');
              return { success: true };
            }

            // Generate offers on-chain if not already present for this POI
            if (!mapPoisData?.currentOffer || mapPoisData.currentOffer.poiIndex !== poiIndex) {
              console.log('[usePoiInteraction] Sending generateCacheOffer on-chain');
              try {
                await generateCacheOffer(
                  gameplayConnection,
                  poiProgram,
                  mapPoisPda,
                  gameStatePda,
                  sessionPda,
                  sessionSignerKeypair,
                  poiIndex
                );
              } catch (err) {
                if (!isPoiAlreadyUsedError(err)) {
                  throw err;
                }
                console.warn(
                  '[usePoiInteraction] generateCacheOffer hit PoiAlreadyUsed; syncing local state'
                );
                await Promise.all([
                  refreshMapEntities(sessionPda),
                  refreshGameplayState(),
                  refreshSessionState(),
                ]);
                syncLocalPoiAsConsumed(currentPoi);
                dispatch({ type: 'CLOSE_POI' });
                setInteractionState('complete');
                return { success: true };
              }
              console.log('[usePoiInteraction] generateCacheOffer CONFIRMED, re-fetching...');
              // Re-fetch to read the stored offer
              mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);
            } else {
              console.log('[usePoiInteraction] Existing cache offer found for poiIndex:', poiIndex);
            }

            if (!mapPoisData?.currentOffer) {
              console.error(
                '[usePoiInteraction] Failed to generate cache offers — currentOffer is null'
              );
              setError('Failed to generate cache offers');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Convert on-chain offers to POIOption[] for the modal
            const offerOptions = convertCacheOfferToOptions(mapPoisData.currentOffer);
            console.log(
              '[usePoiInteraction] Cache offers ready:',
              offerOptions.length,
              'items | labels:',
              offerOptions.map((o) => o.label)
            );
            setCacheOfferOptions(offerOptions);
            setCacheOfferParams({ poiIndex, rawOffer: mapPoisData.currentOffer, poiType });

            // Dispatch INTERACT_POI locally to transition to POIInteraction phase (shows modal)
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, `L${poiType}`, 'ITEM_SELECTION');

            // Stay in choosing state — don't mark consumed yet
            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true, result: offerOptions };
          }

          // Tool Oil (L4) — Two-step flow: generate oil offer on-chain, then display options
          case POI_TYPES.TOOL_OIL_RACK: {
            console.log('[usePoiInteraction] Tool Oil two-step flow | poiIndex:', poiIndex);

            // Check if player already has oil on weapon
            if (gameState?.player?.equippedTool?.oil) {
              setError('You already have an oil on your weapon');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Step 1: Generate oil offer on-chain
            let mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);

            // Generate offers if not already present for this POI
            if (
              !mapPoisData?.currentOilOffer ||
              mapPoisData.currentOilOffer.poiIndex !== poiIndex
            ) {
              console.log('[usePoiInteraction] Sending generateOilOffer on-chain');
              await generateOilOffer(
                gameplayConnection,
                poiProgram,
                mapPoisPda,
                gameStatePda,
                sessionPda,
                sessionSignerKeypair,
                poiIndex
              );
              console.log('[usePoiInteraction] generateOilOffer CONFIRMED, re-fetching...');
              mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);
            } else {
              console.log('[usePoiInteraction] Existing oil offer found for poiIndex:', poiIndex);
            }

            if (!mapPoisData?.currentOilOffer) {
              console.error(
                '[usePoiInteraction] Failed to generate oil offers — currentOilOffer is null'
              );
              setError('Failed to generate oil offers');
              setIsInteracting(false);
              setInteractionState('idle');
              return { success: false };
            }

            // Convert on-chain oils to POIOption[] for the modal
            const oilOptions = convertOilOfferToOptions(
              Array.from(mapPoisData.currentOilOffer.oils)
            );
            console.log(
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
          case POI_TYPES.SURVEY_BEACON:
            await interactSurveyBeacon(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionSignerKeypair,
              poiIndex
            );
            break;

          // Seismic Scanner (L7) — Deferred: show category options first, send tx when user picks
          case POI_TYPES.SEISMIC_SCANNER: {
            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.SEISMIC_SCANNER);
            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L7', 'LOCATE');
            setInteractionState('choosing');
            setIsInteracting(false);
            return { success: true };
          }

          // Rail Waypoint (L8) — Deferred flow:
          // Step 1 (here): show modal with fast-travel options
          // Step 2 (confirmPoiSelection): call fastTravel on-chain when user picks a destination
          case POI_TYPES.RAIL_WAYPOINT: {
            console.log('[usePoiInteraction] Rail Waypoint | showing modal');

            setDeferredPoiIndex(poiIndex);
            setDeferredPoiType(POI_TYPES.RAIL_WAYPOINT);

            dispatchPoiModal(dispatch, gameState?.map?.pois, currentPoi, 'L8', 'LOCATE');

            setIsInteracting(false);
            setInteractionState('choosing');
            return { success: true };
          }

          // Smuggler Hatch Shop (L9) — Enter shop on-chain, then show modal with on-chain offers
          case POI_TYPES.SMUGGLER_HATCH: {
            // Check if shop is already active on-chain (e.g. reopening after closing modal)
            let shopData = await fetchMapPois(poiProgram, mapPoisPda);
            if (!shopData?.shopState?.active) {
              await enterShop(
                gameplayConnection,
                poiProgram,
                mapPoisPda,
                gameStatePda,
                sessionPda,
                sessionSignerKeypair,
                poiIndex
              );
              // Re-fetch after entering
              shopData = await fetchMapPois(poiProgram, mapPoisPda);
            } else {
              console.log('[usePoiInteraction] Shop already active on-chain, skipping enterShop');
            }
            if (shopData?.shopState?.active) {
              setShopOffers(shopData.shopState.offers);
              setShopRerollCount(shopData.shopState.rerollCount);
              const gold = gameState?.player?.stats?.gold ?? 0;
              setCacheOfferOptions(
                convertShopOffersToOptions(
                  shopData.shopState.offers,
                  shopData.shopState.rerollCount,
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
            console.log('[usePoiInteraction] Rusty Anvil | showing modal');

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
            console.log('[usePoiInteraction] Rune Kiln | showing modal');

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
            console.log('[usePoiInteraction] Scrap Chute | showing modal');

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
          console.log(
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
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      gameStatePda,
      sessionPda,
      findPoiIndex,
      pois.length,
      pois,
      refreshMapEntities,
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
   * Refresh shop state from on-chain MapPois account.
   */
  const refreshShopState = useCallback(async () => {
    if (!poiProgram || !mapPoisPda) return;
    const mapPoisData = await fetchMapPois(poiProgram, mapPoisPda);
    if (mapPoisData?.shopState?.active) {
      setShopOffers(mapPoisData.shopState.offers);
      setShopRerollCount(mapPoisData.shopState.rerollCount);
    }
  }, [poiProgram, mapPoisPda]);

  /**
   * Purchase an item from the active shop.
   */
  const purchaseItem = useCallback(
    async (offerIndex: number): Promise<{ success: boolean }> => {
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !gameStatePda || !sessionPda) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await shopPurchase(
          gameplayConnection,
          poiProgram,
          mapPoisPda,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          offerIndex
        );
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
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      gameStatePda,
      sessionPda,
      gameplayConnection,
      refreshShopState,
    ]
  );

  /**
   * Reroll shop offers.
   */
  const rerollShopFn = useCallback(
    async (_seed: bigint): Promise<{ success: boolean }> => {
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !gameStatePda || !sessionPda) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await shopReroll(
          gameplayConnection,
          poiProgram,
          mapPoisPda,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair
        );
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
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      gameStatePda,
      sessionPda,
      gameplayConnection,
      refreshShopState,
    ]
  );

  /**
   * Exit the shop.
   */
  const exitShop = useCallback(async (): Promise<{ success: boolean }> => {
    const sessionSignerKeypair = getSessionSignerKeypair();
    if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !sessionPda) {
      setError('Session not ready');
      return { success: false };
    }

    setIsInteracting(true);
    setError(null);

    try {
      await leaveShop(gameplayConnection, poiProgram, mapPoisPda, sessionPda, sessionSignerKeypair);
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
  }, [getSessionSignerKeypair, poiProgram, mapPoisPda, sessionPda, gameplayConnection]);

  /**
   * Fast travel between two discovered waypoints.
   */
  const travelToWaypoint = useCallback(
    async (fromPoiIndex: number, toPoiIndex: number): Promise<{ success: boolean }> => {
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !gameStatePda) {
        setError('Session not ready');
        return { success: false };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await fastTravel(
          gameplayConnection,
          poiProgram,
          mapPoisPda,
          gameStatePda,
          sessionSignerKeypair,
          fromPoiIndex,
          toPoiIndex
        );
        return { success: true };
      } catch (err) {
        setError(getUserErrorMessage(err, 'poi_system'));
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [getSessionSignerKeypair, poiProgram, mapPoisPda, gameStatePda, gameplayConnection]
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
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair || !poiProgram || !mapPoisPda || !gameStatePda) {
        return { success: false, error: 'Session not ready' };
      }

      const fromPoiIndex = findPoiIndex(fromPos.x, fromPos.y);
      const toPoiIndex = findPoiIndex(toPos.x, toPos.y);

      if (fromPoiIndex === -1 || toPoiIndex === -1) {
        return { success: false, error: 'Waypoint not found' };
      }

      setIsInteracting(true);
      setError(null);

      try {
        await fastTravel(
          gameplayConnection,
          poiProgram,
          mapPoisPda,
          gameStatePda,
          sessionSignerKeypair,
          fromPoiIndex,
          toPoiIndex
        );

        await refreshGameplayState();

        const gameplayProgram = createGameplayStateProgram(gameplayConnection);
        const updatedState = await fetchGameState(gameplayProgram, gameStatePda);

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
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      gameStatePda,
      gameplayConnection,
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
      console.log(
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
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (
        !sessionSignerKeypair ||
        !poiProgram ||
        !mapPoisPda ||
        !gameStatePda ||
        !sessionPda ||
        !cacheOfferParams
      ) {
        console.warn(
          '[usePoiInteraction] selectCacheOffer BLOCKED: session not ready | sessionSigner:',
          !!sessionSignerKeypair,
          '| sessionPda:',
          !!sessionPda,
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

      try {
        console.log(
          '[usePoiInteraction] Sending interactPickItem on-chain | poiIndex:',
          cacheOfferParams.poiIndex,
          '| choice:',
          choiceIndex
        );
        await interactPickItem(
          gameplayConnection,
          poiProgram,
          mapPoisPda,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          cacheOfferParams.poiIndex,
          choiceIndex
        );
        console.log('[usePoiInteraction] interactPickItem CONFIRMED on-chain');
        await assertPoiConsumedOnChain(cacheOfferParams.poiIndex);

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
        const errorMessage = getUserErrorMessage(err, 'poi_system');
        setError(errorMessage);
        console.error('[usePoiInteraction] selectCacheOffer ERROR:', err);
        return { success: false };
      } finally {
        setIsInteracting(false);
      }
    },
    [
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      gameStatePda,
      sessionPda,
      cacheOfferParams,
      cacheOfferOptions,
      assertPoiConsumedOnChain,
      gameplayConnection,
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
    // If in shop, close on-chain (fire-and-forget)
    if (deferredPoiType === POI_TYPES.SMUGGLER_HATCH) {
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (sessionSignerKeypair && poiProgram && mapPoisPda && sessionPda) {
        leaveShop(gameplayConnection, poiProgram, mapPoisPda, sessionPda, sessionSignerKeypair).catch((err) => {
          console.error('[usePoiInteraction] leaveShop on close:', err);
        });
      }
      setShopOffers([]);
      setShopRerollCount(0);
    }
    setDeferredPoiIndex(null);
    setDeferredPoiType(null);
    // Reset interaction state to re-enable mismatch-detection after POI interaction completes
    setInteractionState('idle');
  }, [deferredPoiType, getSessionSignerKeypair, poiProgram, mapPoisPda, sessionPda, gameplayConnection]);

  /**
   * Confirm a deferred POI selection on-chain.
   * For Tool Oil: sends interactToolOil with the selected oil flag.
   * For Seismic Scanner: sends interactSeismicScanner with the selected category.
   * For Smuggler Hatch: routes to purchase, reroll, or leave.
   */
  const confirmPoiSelection = useCallback(
    async (
      optionIndex: number
    ): Promise<{ success: boolean; keepOpen?: boolean; error?: string }> => {
      console.log(
        '[usePoiInteraction] confirmPoiSelection called | optionIndex:',
        optionIndex,
        '| deferredPoiType:',
        deferredPoiType,
        '| deferredPoiIndex:',
        deferredPoiIndex
      );
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (
        !sessionSignerKeypair ||
        !poiProgram ||
        !mapPoisPda ||
        !gameStatePda ||
        !sessionPda ||
        deferredPoiIndex === null ||
        deferredPoiType === null
      ) {
        setError('Session not ready for POI selection');
        return { success: false };
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
              console.log('[usePoiInteraction] User selected Leave for rest POI');
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

            // Send interactRest on-chain
            console.log(
              '[usePoiInteraction] Sending interactRest on-chain | poiIndex:',
              deferredPoiIndex
            );
            await interactRest(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              deferredPoiIndex
            );
            console.log('[usePoiInteraction] interactRest CONFIRMED');

            // Refresh BOTH gameplay state contexts to prevent mismatch-detection from reverting
            // and to allow boss fight detection (which reads SessionContext's onChainState).
            // GameplayStateContext must be updated before we dispatch to the reducer.
            // SessionContext must be updated so GameScreen's boss detection useEffect
            // sees bossFightReady=true (e.g., after rest on Night 3).
            await Promise.all([refreshGameplayState(), refreshSessionState()]);

            // Now fetch and sync to local reducer (healed HP, new phase)
            const gameplayProgram = createGameplayStateProgram(gameplayConnection);
            const updatedState = await fetchGameState(gameplayProgram, gameStatePda);
            if (updatedState) {
              console.log(
                '[usePoiInteraction] Syncing REST result | hp:',
                updatedState.hp,
                '| phase:',
                updatedState.phase
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedState });
            }

            // Only consume one-time POIs.
            if (currentPoi && isOneTimePoiType(deferredPoiType)) {
              consumePoi(currentPoi.x, currentPoi.y);
            }

            // Mark one-time POIs as visited locally.
            if (isOneTimePoiType(deferredPoiType)) {
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
            return { success: true };
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
            await interactToolOilCombined(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              deferredPoiIndex,
              modification,
              oilFlag
            );
            console.log('[usePoiInteraction] Tool oil applied on-chain:', modification);

            // Update local game state's tool with the oil modification
            // Only set the oil property - calculateItemStats handles the +1 stat bonus
            const currentTool = gameState?.player?.equippedTool;
            if (currentTool) {
              const oilInfo = oilFlagToToolOil(oilFlag);
              if (oilInfo) {
                const updatedTool: Tool = {
                  ...currentTool,
                  oil: oilInfo.oil,
                };
                dispatch({ type: 'EQUIP_TOOL', tool: updatedTool });
                console.log('[usePoiInteraction] Local tool updated with oil:', oilInfo.oil);
              }
            }

            // Refresh map entities to reflect POI as used
            if (sessionPda) {
              refreshMapEntities(sessionPda).catch((err) =>
                console.warn('[usePoiInteraction] Failed to refresh map entities:', err)
              );
            }
            break;
          }

          case POI_TYPES.SEISMIC_SCANNER: {
            const label = gameState?.activePOI?.options?.[optionIndex]?.label ?? '';
            if (label === 'Leave' || !label) {
              // User selected Leave — no on-chain tx needed
              setDeferredPoiIndex(null);
              setDeferredPoiType(null);
              setInteractionState('idle');
              setIsInteracting(false);
              return { success: true };
            }
            const scanCat = labelToScanCategory(label);
            await interactSeismicScanner(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionSignerKeypair,
              deferredPoiIndex,
              scanCat
            );
            // Dispatch REVEAL_POI_LOCATIONS to update local fog state
            // This reveals all POIs matching the selected category
            dispatch({ type: 'REVEAL_POI_LOCATIONS', category: scanCat });
            console.log(
              '[usePoiInteraction] Dispatched REVEAL_POI_LOCATIONS for category:',
              scanCat
            );
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
              const destPoiIndex = pois.findIndex((p) => p.x === destX && p.y === destY);

              if (destPoiIndex !== -1) {
                console.log(
                  '[usePoiInteraction] Fast travel | from poiIndex:',
                  deferredPoiIndex,
                  '| to poiIndex:',
                  destPoiIndex
                );
                await fastTravel(
                  gameplayConnection,
                  poiProgram,
                  mapPoisPda,
                  gameStatePda,
                  sessionSignerKeypair,
                  deferredPoiIndex,
                  destPoiIndex
                );
                console.log('[usePoiInteraction] fastTravel CONFIRMED');

                // Refresh gameplay state to sync position
                await refreshGameplayState();

                const gameplayProgram = createGameplayStateProgram(gameplayConnection);
                const updatedState = await fetchGameState(gameplayProgram, gameStatePda);
                if (updatedState) {
                  dispatch({ type: 'SYNC_MOVE', confirmedState: updatedState });
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
              await leaveShop(gameplayConnection, poiProgram, mapPoisPda, sessionPda!, sessionSignerKeypair);
              setShopOffers([]);
              setShopRerollCount(0);
              break; // Will clean up deferred state and consume POI below
            }

            if (option.label.includes('Reroll')) {
              await shopReroll(
                gameplayConnection,
                poiProgram,
                mapPoisPda,
                gameStatePda,
                sessionPda!,
                sessionSignerKeypair
              );
              // Re-fetch shop state and update options
              const rerollData = await fetchMapPois(poiProgram, mapPoisPda);
              if (rerollData?.shopState?.active) {
                setShopOffers(rerollData.shopState.offers);
                setShopRerollCount(rerollData.shopState.rerollCount);
                const gold = gameState?.player?.stats?.gold ?? 0;
                setCacheOfferOptions(
                  convertShopOffersToOptions(
                    rerollData.shopState.offers,
                    rerollData.shopState.rerollCount,
                    gold
                  )
                );
              }
              setIsInteracting(false);
              return { success: true, keepOpen: true };
            }

            // Purchase item — optionIndex maps to on-chain offer index
            await shopPurchase(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              optionIndex
            );
            // Re-fetch shop state and update options
            const purchaseData = await fetchMapPois(poiProgram, mapPoisPda);
            if (purchaseData?.shopState?.active) {
              setShopOffers(purchaseData.shopState.offers);
              setShopRerollCount(purchaseData.shopState.rerollCount);
              const gold = gameState?.player?.stats?.gold ?? 0;
              setCacheOfferOptions(
                convertShopOffersToOptions(
                  purchaseData.shopState.offers,
                  purchaseData.shopState.rerollCount,
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

            console.log(
              '[usePoiInteraction] Sending interactRuneKiln on-chain | gear:',
              kilnGear.id,
              '| backendId:',
              kilnBackendId,
              '| tier:',
              kilnTier
            );
            await interactRuneKiln(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              deferredPoiIndex,
              kilnIdBytes,
              kilnTier,
              kilnIdBytes,
              kilnTier
            );
            console.log('[usePoiInteraction] interactRuneKiln CONFIRMED');

            // Refresh gameplay state to sync changes
            await refreshGameplayState();

            // Remove 2 copies of the fused gear from local inventory
            dispatch({ type: 'DISCARD_GEAR_BY_ID', gearId: kilnGear.id as GearId });
            dispatch({ type: 'DISCARD_GEAR_BY_ID', gearId: kilnGear.id as GearId });

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

            console.log(
              '[usePoiInteraction] Sending interactRustyAnvil on-chain | tool:',
              tool.id,
              '| backendId:',
              anvilBackendId,
              '| tier:',
              anvilTier
            );
            await interactRustyAnvil(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              deferredPoiIndex,
              anvilIdBytes,
              anvilTier
            );
            console.log('[usePoiInteraction] interactRustyAnvil CONFIRMED');

            // Refresh gameplay state to sync gold changes
            await refreshGameplayState();

            const gameplayProgram = createGameplayStateProgram(gameplayConnection);
            const updatedAnvilState = await fetchGameState(gameplayProgram, gameStatePda);
            if (updatedAnvilState) {
              console.log(
                '[usePoiInteraction] Syncing ANVIL result | gold:',
                updatedAnvilState.gold
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedAnvilState });
            }

            // Upgrade tool locally to reflect new tier
            const nextRarity = tool.rarity === 'COMMON' ? 'GILDED' : 'DIAMOND';
            dispatch({
              type: 'EQUIP_TOOL',
              tool: { ...tool, rarity: nextRarity as any },
            });

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

            console.log(
              '[usePoiInteraction] Sending interactScrapChute on-chain | gear:',
              scrapGear.id,
              '| backendId:',
              backendId
            );
            await interactScrapChute(
              gameplayConnection,
              poiProgram,
              mapPoisPda,
              gameStatePda,
              sessionPda!,
              sessionSignerKeypair,
              deferredPoiIndex,
              idBytes
            );
            console.log('[usePoiInteraction] interactScrapChute CONFIRMED');

            // Refresh gameplay state to sync gold changes
            await refreshGameplayState();

            const gameplayProgram = createGameplayStateProgram(gameplayConnection);
            const updatedScrapState = await fetchGameState(gameplayProgram, gameStatePda);
            if (updatedScrapState) {
              console.log(
                '[usePoiInteraction] Syncing SCRAP result | gold:',
                updatedScrapState.gold
              );
              dispatch({ type: 'SYNC_MOVE', confirmedState: updatedScrapState });
            }

            // Remove scrapped gear from local inventory
            dispatch({ type: 'DISCARD_GEAR_BY_ID', gearId: scrapGear.id as any });

            break;
          }

          default:
            setError(`Unknown deferred POI type: ${deferredPoiType}`);
            setIsInteracting(false);
            return { success: false };
        }

        // Only consume one-time POIs.
        if (currentPoi && isOneTimePoiType(deferredPoiType)) {
          if (deferredPoiIndex !== null) {
            await assertPoiConsumedOnChain(deferredPoiIndex);
          }
          consumePoi(currentPoi.x, currentPoi.y);
        }

        // Mark one-time POIs as visited in local game state.
        if (isOneTimePoiType(deferredPoiType)) {
          const localPoiForDeferred = gameState?.map?.pois?.find(
            (p) => p.position.x === currentPoi?.x && p.position.y === currentPoi?.y
          );
          if (localPoiForDeferred) {
            dispatch({ type: 'MARK_POI_VISITED', poiId: localPoiForDeferred.id });
          }
        }

        // Close the POI modal and return to exploration
        dispatch({ type: 'CLOSE_POI' });

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
      getSessionSignerKeypair,
      poiProgram,
      mapPoisPda,
      assertPoiConsumedOnChain,
      gameStatePda,
      sessionPda,
      deferredPoiIndex,
      deferredPoiType,
      gameplayConnection,
      currentPoi,
      consumePoi,
      dispatch,
      gameState?.activePOI?.options,
      gameState?.player?.stats?.gold,
      gameState?.player?.equippedTool,
      cacheOfferOptions,
      refreshMapEntities,
      refreshGameplayState,
      pois,
    ]
  );

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
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
  };
}
