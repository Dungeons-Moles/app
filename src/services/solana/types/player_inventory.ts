import { PublicKey } from '@solana/web3.js';

// Item type enum
export enum ItemType {
  Tool = 0,
  Gear = 1,
}

// Item tag enum for categorization
export enum ItemTag {
  Weapon = 0,
  Armor = 1,
  Accessory = 2,
  Consumable = 3,
}

// Rarity enum
export enum Rarity {
  Common = 0,
  Uncommon = 1,
  Rare = 2,
  Epic = 3,
  Legendary = 4,
}

// Tier enum
export enum Tier {
  I = 0,
  II = 1,
  III = 2,
}

// Tool oil modification flags
export const TOOL_OIL_FLAGS = {
  ATK: 0x01,
  SPD: 0x02,
  DIG: 0x04,
  ARM: 0x08,
} as const;

// Tool oil modification enum (matches on-chain ToolOilModification)
export enum ToolOilModification {
  PlusAtk = 'plusAtk',
  PlusSpd = 'plusSpd',
  PlusDig = 'plusDig',
  PlusArm = 'plusArm',
}

// Convert oil flag to modification enum
export function oilFlagToModification(flag: number): ToolOilModification | null {
  switch (flag) {
    case TOOL_OIL_FLAGS.ATK:
      return ToolOilModification.PlusAtk;
    case TOOL_OIL_FLAGS.SPD:
      return ToolOilModification.PlusSpd;
    case TOOL_OIL_FLAGS.DIG:
      return ToolOilModification.PlusDig;
    case TOOL_OIL_FLAGS.ARM:
      return ToolOilModification.PlusArm;
    default:
      return null;
  }
}

// Item instance on-chain
export interface ItemInstance {
  itemId: Uint8Array; // 8 bytes
  tier: Tier;
  toolOilFlags: number;
}

// Player inventory account data
export interface PlayerInventoryData {
  session: PublicKey;
  player: PublicKey;
  tool: ItemInstance | null;
  gear: (ItemInstance | null)[];
  gearSlotCapacity: number;
  bump: number;
}

// Item instance data for display (parsed from on-chain)
export interface ItemInstanceData {
  itemId: string;
  tier: number;
  toolOilFlags: number;
}
