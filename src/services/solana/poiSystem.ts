/**
 * POI System Program Client
 *
 * TypeScript client interface for interacting with the poi-system Solana program.
 * Handles all POI interactions: rest, item picking, shops, crafting, and travel.
 * Uses sessionSigner wallet for signing all gameplay transactions.
 */

import { Connection, PublicKey, Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { sendSessionSignerTransaction } from './sessionSigner';
import {
  deriveInventoryPda,
  derivePoiAuthorityPda,
  deriveGameplayAuthorityPda,
  deriveInventoryAuthorityPda,
  deriveGeneratedMapPda,
} from './constants';
import { SOLANA_CONFIG } from './config';
import type { MapPoisData, PoiInstance, ShopState, ItemOffer } from './types/poi_system';
import type { ToolOilModification } from './types/player_inventory';

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type { MapPoisData, PoiInstance, ShopState, ItemOffer };

// GameState with gauntlet echoes is large; POI instructions that CPI into
// gameplay-state deserialize it multiple times, easily exceeding the 200K default.
const POI_CU_LIMIT = 400_000;

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
 * L1 (Mole Den): Full heal, repeatable, night-only, skip to day.
 * L5 (Rest Alcove): Heal 10 HP, one-time, night-only, skip to day.
 *
 * If used during Night3, triggers the boss fight (cannot skip end-of-week boss).
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @returns Transaction signature
 */
export async function interactRest(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);

  const transaction = await program.methods
    .interactRest(poiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      generatedMap: generatedMapPda,
      poiAuthority: poiAuthorityPda,
      gameplayAuthority: gameplayAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  // Rest does 2 CPIs (heal_player + skip_to_day) that each deserialize GameState;
  // gauntlet echoes make GameState large enough to exceed the default 200K CU.
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Pick Item POIs (L2, L3, L12, L13)
// ============================================================================

/**
 * Generate and store cache offers for a pick-item POI on-chain.
 * Must be called before interactPickItem to populate MapPois.current_offer.
 * The frontend reads current_offer to display deterministic options.
 * Boss weaknesses are fetched on-chain from the game state.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (for active_item_pool filtering)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @returns Transaction signature
 */
export async function generateCacheOffer(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .generateCacheOffer(poiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      gameSession: sessionPda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  // GenerateCacheOffer can exceed the default 200K CU limit (e.g. Geode Vault filtering)
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Interact with a pick-item POI to choose one of three offered items.
 * L2 (Supply Cache): Pick 1 of 3 Gear.
 * L3 (Tool Crate): Pick 1 of 3 Tools.
 * L12 (Geode Vault): Pick 1 of 3 Heroic+ items.
 * L13 (Counter Cache): Pick 1 of 3 weakness-tagged items.
 *
 * Requires generateCacheOffer to have been called first.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (for active_item_pool update)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param choiceIndex - Which of the 3 offers to pick (0-2)
 * @returns Transaction signature
 */
export async function interactPickItem(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  choiceIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .interactPickItem(poiIndex, choiceIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      gameSession: sessionPda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Tool Oil (L4)
// ============================================================================

/**
 * Apply a tool oil modification at a Tool Oil Rack (L4).
 * Tool Oil Rack is one-time use per POI instance.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param currentOilFlags - Current tool oil flags (bitmask)
 * @param modification - Oil type to apply (1=ATK, 2=SPD, 4=DIG)
 * @returns Transaction signature
 */
export async function interactToolOil(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  currentOilFlags: number,
  modification: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .interactToolOil(poiIndex, currentOilFlags, modification)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Combined Tool Oil interaction that sends both poi-system validation and
 * player-inventory oil application in a single transaction.
 *
 * This provides better UX by requiring only one confirmation and ensuring
 * atomicity - if either instruction fails, neither takes effect.
 *
 * @param connection - Solana connection
 * @param poiProgram - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param modification - Oil modification to apply (ToolOilModification enum value)
 * @param oilFlag - Oil flag for poi-system (1=ATK, 2=SPD, 4=DIG)
 * @returns Transaction signature
 */
export async function interactToolOilCombined(
  connection: Connection,
  poiProgram: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  modification: ToolOilModification,
  oilFlag: number
): Promise<string> {
  void modification;
  return interactToolOil(
    connection,
    poiProgram,
    mapPoisPda,
    gameStatePda,
    sessionPda,
    sessionSignerKeypair,
    poiIndex,
    0,
    oilFlag
  );
}

/**
 * Generate and store oil offers for a Tool Oil Rack (L4) on-chain.
 * Must be called before interactToolOil to populate MapPois.current_oil_offer.
 * The frontend reads current_oil_offer to display 3 of 4 possible oils.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @returns Transaction signature
 */
export async function generateOilOffer(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .generateOilOffer(poiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Survey Beacon (L6)
// ============================================================================

/**
 * Activate a Survey Beacon (L6) to reveal tiles within radius 13.
 * POI is one-time use.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @returns Transaction signature
 */
export async function interactSurveyBeacon(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number
): Promise<string> {
  const transaction = await program.methods
    .interactSurveyBeacon(poiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Seismic Scanner (L7)
// ============================================================================

/**
 * Activate a Seismic Scanner (L7) to reveal the nearest undiscovered POI
 * of a selected category. POI is one-time use.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param category - POI category to scan for
 * @returns Transaction signature
 */
export async function interactSeismicScanner(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  category: number
): Promise<string> {
  const transaction = await program.methods
    .interactSeismicScanner(poiIndex, category)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Rail Waypoint (L8)
// ============================================================================

/**
 * Fast travel between two discovered Rail Waypoints (L8).
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param fromPoiIndex - Index of the origin waypoint
 * @param toPoiIndex - Index of the destination waypoint
 * @returns Transaction signature
 */
export async function fastTravel(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair,
  fromPoiIndex: number,
  toPoiIndex: number
): Promise<string> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .fastTravel(fromPoiIndex, toPoiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Smuggler Hatch Shop (L9)
// ============================================================================

/**
 * Enter the Smuggler Hatch shop (L9).
 * Generates shop offers deterministically. Boss weaknesses are fetched on-chain.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (for active_item_pool filtering)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @returns Transaction signature
 */
export async function enterShop(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number
): Promise<string> {
  const transaction = await program.methods
    .enterShop(poiIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      gameSession: sessionPda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Purchase an item from the active shop.
 * Validates gold, marks offer as purchased, deducts gold via CPI.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param offerIndex - Index of the offer to purchase
 * @returns Transaction signature
 */
export async function shopPurchase(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  offerIndex: number
): Promise<string> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();

  const transaction = await program.methods
    .shopPurchase(offerIndex)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Reroll the shop offers for a gold cost.
 * Cost increases with each reroll: 4, 6, 8, 10, ...
 * Gold is deducted atomically via CPI. Boss weaknesses are fetched on-chain.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (for active_item_pool filtering)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @returns Transaction signature
 */
export async function shopReroll(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair
): Promise<string> {
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .shopReroll()
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      gameSession: sessionPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Leave the shop without purchasing.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param sessionPda - GameSession PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @returns Transaction signature
 */
export async function leaveShop(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair
): Promise<string> {
  const transaction = await program.methods
    .leaveShop()
    .accounts({
      mapPois: mapPoisPda,
      gameSession: sessionPda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Rusty Anvil (L10)
// ============================================================================

/**
 * Upgrade an item's tier at the Rusty Anvil (L10).
 * Tier I -> II costs 10 Gold, II -> III costs 20 Gold.
 * POI is repeatable. Gold is deducted atomically via CPI.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param itemId - 8-byte item identifier
 * @param currentTier - Current tier of the item
 * @returns Transaction signature
 */
export async function interactRustyAnvil(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  itemId: Uint8Array,
  currentTier: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .interactRustyAnvil(poiIndex, Array.from(itemId), currentTier)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Rune Kiln (L11)
// ============================================================================

/**
 * Fuse two identical items at the Rune Kiln (L11).
 * Items must have the same ID and tier. Free to use. POI is repeatable.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (used to derive inventory)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param item1Id - 8-byte identifier of the first item
 * @param item1Tier - Tier of the first item
 * @param item2Id - 8-byte identifier of the second item
 * @param item2Tier - Tier of the second item
 * @returns Transaction signature
 */
export async function interactRuneKiln(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  item1Id: Uint8Array,
  item1Tier: number,
  item2Id: Uint8Array,
  item2Tier: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .interactRuneKiln(poiIndex, Array.from(item1Id), item1Tier, Array.from(item2Id), item2Tier)
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

// ============================================================================
// Scrap Chute (L14)
// ============================================================================

/**
 * Scrap a gear item for gold at the Scrap Chute (L14).
 * Applies flat 4 gold cost + rarity refund and consumes one equipped gear item atomically.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for poi_system
 * @param mapPoisPda - MapPois PDA
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA (for inventory derivation)
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param poiIndex - Index of the POI in map_pois.pois
 * @param itemId - 8-byte identifier of the item to scrap
 * @returns Transaction signature
 */
export async function interactScrapChute(
  connection: Connection,
  program: Program,
  mapPoisPda: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  poiIndex: number,
  itemId: Uint8Array
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();
  const [poiAuthorityPda] = derivePoiAuthorityPda();

  const transaction = await program.methods
    .interactScrapChute(poiIndex, Array.from(itemId))
    .accounts({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      inventory: inventoryPda,
      inventoryAuthority: inventoryAuthorityPda,
      poiAuthority: poiAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: POI_CU_LIMIT }));
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}
