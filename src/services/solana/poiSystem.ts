/**
 * POI System Program Client
 *
 * TypeScript client interface for interacting with the poi-system Solana program.
 * Handles all POI interactions: rest, item picking, shops, crafting, and travel.
 * Uses sessionSigner wallet for signing all gameplay transactions.
 */

import { PublicKey, Keypair, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { sendSessionSignerTransaction } from './sessionSigner';
import {
  deriveInventoryPda,
  derivePoiAuthorityPda,
  deriveGameplayAuthorityPda,
  deriveInventoryAuthorityPda,
  deriveGeneratedMapPda,
  deriveMapEnemiesPda,
} from './constants';
import { SOLANA_CONFIG } from './config';
import { createGameplayStateProgram } from './programs';
import type { MapPoisData, PoiInstance, ShopState, ItemOffer } from './types/poi_system';
import type { ToolOilModification } from './types/player_inventory';

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type { MapPoisData, PoiInstance, ShopState, ItemOffer };

// GameState with gauntlet echoes is large; POI instructions that CPI into
// gameplay-state deserialize it multiple times, easily exceeding the 200K default.
const POI_CU_LIMIT = 1_000_000;

// ============================================================================
// Transaction Context
// ============================================================================

/** Common parameters shared by all POI transaction functions. */
export interface PoiTransactionContext {
  connection: Connection;
  program: Program;
  mapPoisPda: PublicKey;
  gameStatePda: PublicKey;
  sessionPda: PublicKey;
  sessionSignerKeypair: Keypair;
  /** Optional VRF state PDA for offer randomness (PvP modes). */
  poiVrfStatePda?: PublicKey;
  /** Optional GameplayVrfState PDA for VRF-backed boss selection in skip_to_day CPI. */
  gameplayVrfStatePda?: PublicKey;
  /** Optional SessionDiscovery PDA for discovery-aware POI interactions. */
  sessionDiscoveryPda?: PublicKey;
}

/** Builds CU limit instruction and sends a POI transaction via session signer. */
async function sendPoiTx(ctx: PoiTransactionContext, transaction: Transaction): Promise<string> {
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(ctx.connection, transaction, ctx.sessionSignerKeypair);
}

// ============================================================================
// Read-Only Fetch
// ============================================================================

/**
 * Fetches current MapPois account data from chain.
 *
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA address
 * @returns MapPoisData or null if not found
 */
export async function fetchMapPois(
  program: Program,
  mapPoisPda: PublicKey
): Promise<MapPoisData | null> {
  try {
    const account = await (
      program.account as {
        mapPois: {
          fetchNullable: (address: PublicKey) => Promise<MapPoisData | null>;
        };
      }
    ).mapPois.fetchNullable(mapPoisPda);

    return account ?? null;
  } catch (error) {
    console.error('Failed to fetch map POIs:', error);
    return null;
  }
}

// ============================================================================
// Rest POIs (L1 Mole Den, L5 Rest Alcove)
// ============================================================================

/**
 * Interact with a rest POI to heal HP and skip to the next day phase.
 * If used during Night3, triggers the boss fight.
 */
export async function interactRest(ctx: PoiTransactionContext, poiIndex: number): Promise<string> {
  const transaction = await buildInteractRestTransaction(ctx, poiIndex);
  return sendPoiTx(ctx, transaction);
}

export async function buildInteractRestTransaction(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<Transaction> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [generatedMapPda] = deriveGeneratedMapPda(ctx.sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(ctx.sessionPda);

  // Optional account: include only when fully initialized/deserializable.
  // Some local flows can leave the PDA allocated but not initialized, which
  // triggers Anchor 3012 (AccountNotInitialized) if passed.
  // Must pass null explicitly for Anchor to skip optional accounts.
  let vrfState: PublicKey | null = null;
  if (ctx.gameplayVrfStatePda) {
    const gpProgram = createGameplayStateProgram(ctx.connection);
    const vrfAccount = await (gpProgram.account as any)?.gameplayVrfState
      ?.fetchNullable(ctx.gameplayVrfStatePda)
      .catch(() => null);
    if (vrfAccount) vrfState = ctx.gameplayVrfStatePda;
  }

  const restAccounts: any = {
    mapPois: ctx.mapPoisPda,
    gameState: ctx.gameStatePda,
    mapEnemies: mapEnemiesPda,
    inventory: inventoryPda,
    generatedMap: generatedMapPda,
    poiAuthority: poiAuthorityPda,
    gameplayAuthority: gameplayAuthorityPda,
    gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
    playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
    gameplayVrfState: vrfState,
    gauntletEchoes: null,
    player: ctx.sessionSignerKeypair.publicKey,
    sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
    session: ctx.sessionPda,
    mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
  };

  return ctx.program.methods
    .interactRest(poiIndex)
    .accountsPartial(restAccounts)
    .transaction();
}

// ============================================================================
// Pick Item POIs (L2, L3, L12, L13)
// ============================================================================

/**
 * Generate and store cache offers for a pick-item POI on-chain.
 * Must be called before interactPickItem to populate MapPois.cache_offers.
 */
export async function generateCacheOffer(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .generateCacheOffer(poiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      gameSession: ctx.sessionPda,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Interact with a pick-item POI to choose one of three offered items.
 * Requires generateCacheOffer to have been called first.
 */
export async function interactPickItem(
  ctx: PoiTransactionContext,
  poiIndex: number,
  choiceIndex: number
): Promise<string> {
  // Defensive: ensure u8 values are valid integers before Anchor serialization
  const safePoiIndex = Math.floor(poiIndex) & 0xff;
  const safeChoiceIndex = Math.floor(choiceIndex) & 0xff;
  if (safePoiIndex !== poiIndex || safeChoiceIndex !== choiceIndex) {
    console.error(
      '[interactPickItem] arg sanitization changed values! poiIndex:',
      poiIndex, '→', safePoiIndex,
      '| choiceIndex:', choiceIndex, '→', safeChoiceIndex
    );
  }

  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .interactPickItem(safePoiIndex, safeChoiceIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      gameSession: ctx.sessionPda,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Tool Oil (L4)
// ============================================================================

/**
 * Apply a tool oil modification at a Tool Oil Rack (L4).
 * Tool Oil Rack is one-time use per POI instance.
 */
export async function interactToolOil(
  ctx: PoiTransactionContext,
  poiIndex: number,
  currentOilFlags: number,
  modification: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);

  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .interactToolOil(poiIndex, currentOilFlags, modification)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Combined Tool Oil interaction that sends both poi-system validation and
 * player-inventory oil application in a single transaction.
 */
export async function interactToolOilCombined(
  ctx: PoiTransactionContext,
  poiIndex: number,
  modification: ToolOilModification,
  oilFlag: number
): Promise<string> {
  void modification;
  return interactToolOil(ctx, poiIndex, 0, oilFlag);
}

/**
 * Generate and store oil offers for a Tool Oil Rack (L4) on-chain.
 * Must be called before interactToolOil to populate MapPois.oil_offers.
 */
export async function generateOilOffer(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);

  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .generateOilOffer(poiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Survey Beacon (L6)
// ============================================================================

/**
 * Activate a Survey Beacon (L6) to reveal tiles within radius 13.
 * POI is one-time use.
 */
export async function interactSurveyBeacon(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<string> {
  const transaction = await buildInteractSurveyBeaconTransaction(ctx, poiIndex);
  return sendPoiTx(ctx, transaction);
}

export async function buildInteractSurveyBeaconTransaction(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<Transaction> {
  const [generatedMapPda] = deriveGeneratedMapPda(ctx.sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(ctx.sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  return ctx.program.methods
    .interactSurveyBeacon(poiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      generatedMap: generatedMapPda,
      session: ctx.sessionPda,
      mapEnemies: mapEnemiesPda,
      poiAuthority: poiAuthorityPda,
      gameplayAuthority: gameplayAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? undefined,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();
}

// ============================================================================
// Seismic Scanner (L7)
// ============================================================================

/**
 * Generate and persist Seismic Scanner (L7) options from on-chain VRF state.
 */
export async function generateScannerOffer(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<string> {
  const [generatedMapPda] = deriveGeneratedMapPda(ctx.sessionPda);
  const transaction = await ctx.program.methods
    .generateScannerOffer(poiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      generatedMap: generatedMapPda,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? undefined,
      session: ctx.sessionPda,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Activate a Seismic Scanner (L7) to reveal the nearest undiscovered POI
 * of a selected offered type. POI is one-time use.
 */
export async function interactSeismicScanner(
  ctx: PoiTransactionContext,
  poiIndex: number,
  poiType: number
): Promise<string> {
  const [generatedMapPda] = deriveGeneratedMapPda(ctx.sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(ctx.sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const transaction = await ctx.program.methods
    .interactSeismicScanner(poiIndex, poiType)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      generatedMap: generatedMapPda,
      session: ctx.sessionPda,
      mapEnemies: mapEnemiesPda,
      poiAuthority: poiAuthorityPda,
      gameplayAuthority: gameplayAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? undefined,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Rail Waypoint (L8)
// ============================================================================

/**
 * Fast travel between two discovered Rail Waypoints (L8).
 */
export async function fastTravel(
  ctx: PoiTransactionContext,
  fromPoiIndex: number,
  toPoiIndex: number
): Promise<string> {
  const transaction = await buildFastTravelTransaction(ctx, fromPoiIndex, toPoiIndex);
  return sendPoiTx(ctx, transaction);
}

export async function buildFastTravelTransaction(
  ctx: PoiTransactionContext,
  fromPoiIndex: number,
  toPoiIndex: number
): Promise<Transaction> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [generatedMapPda] = deriveGeneratedMapPda(ctx.sessionPda);
  const [mapEnemiesPda] = deriveMapEnemiesPda(ctx.sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();

  return ctx.program.methods
    .fastTravel(fromPoiIndex, toPoiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      gameplayAuthority: gameplayAuthorityPda,
      mapEnemies: mapEnemiesPda,
      generatedMap: generatedMapPda,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? undefined,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();
}

// ============================================================================
// Smuggler Hatch Shop (L9)
// ============================================================================

/**
 * Enter the Smuggler Hatch shop (L9).
 * Generates shop offers deterministically.
 */
export async function enterShop(
  ctx: PoiTransactionContext,
  poiIndex: number
): Promise<string> {
  const transaction = await ctx.program.methods
    .enterShop(poiIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      gameSession: ctx.sessionPda,
      poiVrfState: ctx.poiVrfStatePda,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Purchase an item from the active shop.
 * Validates gold, marks offer as purchased, deducts gold via CPI.
 */
export async function shopPurchase(
  ctx: PoiTransactionContext,
  offerIndex: number
): Promise<string> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();

  const transaction = await ctx.program.methods
    .shopPurchase(offerIndex)
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Reroll the shop offers for a gold cost.
 * Cost increases with each reroll: 4, 6, 8, 10, ...
 */
export async function shopReroll(ctx: PoiTransactionContext): Promise<string> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .shopReroll()
    .accountsPartial({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      gameSession: ctx.sessionPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: ctx.sessionSignerKeypair.publicKey,
      sessionDiscovery: ctx.sessionDiscoveryPda ?? null,
      session: ctx.sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

/**
 * Leave the shop without purchasing.
 */
export async function leaveShop(ctx: PoiTransactionContext): Promise<string> {
  const transaction = await ctx.program.methods
    .leaveShop()
    .accounts({
      mapPois: ctx.mapPoisPda,
      gameSession: ctx.sessionPda,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Rusty Anvil (L10)
// ============================================================================

/**
 * Upgrade an item's tier at the Rusty Anvil (L10).
 * Tier I -> II costs 10 Gold, II -> III costs 20 Gold.
 */
export async function interactRustyAnvil(
  ctx: PoiTransactionContext,
  poiIndex: number,
  itemId: Uint8Array,
  currentTier: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .interactRustyAnvil(poiIndex, Array.from(itemId), currentTier)
    .accounts({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Rune Kiln (L11)
// ============================================================================

/**
 * Fuse two identical items at the Rune Kiln (L11).
 * Items must have the same ID and tier. Free to use.
 */
export async function interactRuneKiln(
  ctx: PoiTransactionContext,
  poiIndex: number,
  item1Id: Uint8Array,
  item1Tier: number,
  item2Id: Uint8Array,
  item2Tier: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);

  const transaction = await ctx.program.methods
    .interactRuneKiln(poiIndex, Array.from(item1Id), item1Tier, Array.from(item2Id), item2Tier)
    .accounts({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}

// ============================================================================
// Scrap Chute (L14)
// ============================================================================

/**
 * Scrap a gear item for gold at the Scrap Chute (L14).
 * Applies flat 4 gold cost + rarity refund and consumes one equipped gear item atomically.
 */
export async function interactScrapChute(
  ctx: PoiTransactionContext,
  poiIndex: number,
  itemId: Uint8Array
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(ctx.sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await ctx.program.methods
    .interactScrapChute(poiIndex, Array.from(itemId))
    .accounts({
      mapPois: ctx.mapPoisPda,
      gameState: ctx.gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: ctx.sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendPoiTx(ctx, transaction);
}
