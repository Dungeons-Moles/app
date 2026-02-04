import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { PlayerInventoryData, ItemInstance } from './types/player_inventory';
import { Tier, ToolOilModification } from './types/player_inventory';
import { sendBurnerTransaction } from './burnerWallet';
import { deriveInventoryPda, deriveInventoryAuthorityPda } from './constants';
import { deriveGameStatePda } from './types/gameplay_state';
import { SOLANA_CONFIG } from './config';

interface OnChainItemInstance {
  itemId: number[] | Uint8Array;
  tier: { i?: object; ii?: object; iii?: object };
  toolOilFlags: number;
}

interface OnChainInventory {
  session: PublicKey;
  player: PublicKey;
  tool: OnChainItemInstance | null;
  gear: (OnChainItemInstance | null)[];
  gearSlotCapacity: number;
  bump: number;
}

function parseTier(tier: { i?: object; ii?: object; iii?: object }): Tier {
  if ('ii' in tier) return Tier.II;
  if ('iii' in tier) return Tier.III;
  return Tier.I;
}

function parseItemInstance(item: OnChainItemInstance | null): ItemInstance | null {
  if (!item) return null;
  return {
    itemId: new Uint8Array(item.itemId),
    tier: parseTier(item.tier),
    toolOilFlags: item.toolOilFlags,
  };
}

export async function fetchInventory(
  program: Program,
  inventoryPda: PublicKey
): Promise<PlayerInventoryData | null> {
  try {
    const account = await (
      program.account as {
        playerInventory: {
          fetchNullable: (address: PublicKey) => Promise<OnChainInventory | null>;
        };
      }
    ).playerInventory.fetchNullable(inventoryPda);

    if (!account) return null;

    return {
      session: account.session,
      player: account.player,
      tool: parseItemInstance(account.tool),
      gear: account.gear.map(parseItemInstance),
      gearSlotCapacity: account.gearSlotCapacity,
      bump: account.bump,
    };
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    return null;
  }
}

/**
 * Converts Tier enum to the Anchor IDL format expected by the program.
 */
function tierToAnchor(tier: Tier): { i: object } | { ii: object } | { iii: object } {
  switch (tier) {
    case Tier.II:
      return { ii: {} };
    case Tier.III:
      return { iii: {} };
    default:
      return { i: {} };
  }
}

/**
 * Equips a gear item in an available slot.
 *
 * @deprecated Use poi-system's interactPickItem or shopPurchase instead.
 * These now handle equipping via CPI, including HP bonus sync.
 * Direct calls to equipGear will NOT update HP bonuses on-chain.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for player_inventory
 * @param sessionPda - Session PDA (used to derive inventory)
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param itemId - 8-byte item identifier
 * @param tier - Item tier
 * @returns Transaction signature
 */
export async function equipGear(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  itemId: Uint8Array | number[],
  tier: Tier
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .equipGear(Array.from(itemId), tierToAnchor(tier))
    .accounts({
      inventory: inventoryPda,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}

/**
 * Equips a tool item (replaces existing tool if any).
 *
 * @deprecated Use poi-system's interactPickItem instead.
 * This now handles equipping via CPI, including HP bonus sync.
 * Direct calls to equipTool will NOT update HP bonuses on-chain.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for player_inventory
 * @param sessionPda - Session PDA (used to derive inventory)
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param itemId - 8-byte item identifier
 * @param tier - Item tier
 * @returns Transaction signature
 */
export async function equipTool(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  itemId: Uint8Array | number[],
  tier: Tier
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .equipTool(Array.from(itemId), tierToAnchor(tier))
    .accounts({
      inventory: inventoryPda,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}

/**
 * Converts ToolOilModification enum to the Anchor IDL format expected by the program.
 */
function toolOilModificationToAnchor(
  mod: ToolOilModification
): { plusAtk: object } | { plusSpd: object } | { plusDig: object } | { plusArm: object } {
  switch (mod) {
    case ToolOilModification.PlusAtk:
      return { plusAtk: {} };
    case ToolOilModification.PlusSpd:
      return { plusSpd: {} };
    case ToolOilModification.PlusDig:
      return { plusDig: {} };
    case ToolOilModification.PlusArm:
      return { plusArm: {} };
  }
}

/**
 * Applies a Tool Oil modification to the equipped tool.
 * Each modification (+ATK, +SPD, +DIG) can only be applied once per tool.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for player_inventory
 * @param sessionPda - Session PDA (used to derive inventory)
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param modification - The oil modification to apply
 * @returns Transaction signature
 */
export async function applyToolOil(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  modification: ToolOilModification
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .applyToolOil(toolOilModificationToAnchor(modification))
    .accounts({
      inventory: inventoryPda,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}

/**
 * Unequips a gear item from the specified slot.
 * Calls remove_hp_bonus_authorized via CPI to gameplay-state if the item had +HP.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance for player_inventory
 * @param sessionPda - Session PDA (used to derive inventory and game_state)
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param slotIndex - Index of the gear slot to unequip (0-7)
 * @returns Transaction signature
 */
export async function unequipGear(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  slotIndex: number
): Promise<string> {
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [gameStatePda] = deriveGameStatePda(sessionPda, SOLANA_CONFIG.programs.gameplayState);
  const [inventoryAuthorityPda] = deriveInventoryAuthorityPda();

  const transaction = await program.methods
    .unequipGear(slotIndex)
    .accounts({
      inventory: inventoryPda,
      gameState: gameStatePda,
      inventoryAuthority: inventoryAuthorityPda,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}
