import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { PlayerInventoryData, ItemInstance } from './types/player_inventory';
import { Tier, ToolOilModification } from './types/player_inventory';

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

function directMutationDisabled(methodName: string): never {
  throw new Error(
    `player-inventory::${methodName} direct mutation is disabled on-chain. ` +
      'Use authorized POI/session/gameplay flows (poi-system instructions) instead.'
  );
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
 * @returns Never. Throws because direct mutation is disabled on-chain.
 */
export async function equipGear(
  _connection: Connection,
  _program: Program,
  _sessionPda: PublicKey,
  _burnerKeypair: Keypair,
  _itemId: Uint8Array | number[],
  _tier: Tier
): Promise<string> {
  return directMutationDisabled('equip_gear');
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
 * @returns Never. Throws because direct mutation is disabled on-chain.
 */
export async function equipTool(
  _connection: Connection,
  _program: Program,
  _sessionPda: PublicKey,
  _burnerKeypair: Keypair,
  _itemId: Uint8Array | number[],
  _tier: Tier
): Promise<string> {
  return directMutationDisabled('equip_tool');
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
 * @returns Never. Throws because direct mutation is disabled on-chain.
 */
export async function applyToolOil(
  _connection: Connection,
  _program: Program,
  _sessionPda: PublicKey,
  _burnerKeypair: Keypair,
  _modification: ToolOilModification
): Promise<string> {
  return directMutationDisabled('apply_tool_oil');
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
 * @returns Never. Throws because direct mutation is disabled on-chain.
 */
export async function unequipGear(
  _connection: Connection,
  _program: Program,
  _sessionPda: PublicKey,
  _burnerKeypair: Keypair,
  _slotIndex: number
): Promise<string> {
  return directMutationDisabled('unequip_gear');
}
