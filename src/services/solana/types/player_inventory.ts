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

// Status type enum for conditions
export enum StatusType {
  Chill = 'chill',
  Shrapnel = 'shrapnel',
  Rust = 'rust',
  Bleed = 'bleed',
  Reflection = 'reflection',
}

// Conditions that must be met for an effect to fire
export type Condition =
  | { none: Record<string, never> }
  | { enemyHasStatus: { statusType: StatusType } }
  | { enemyHasNoArmor: Record<string, never> }
  | { enemyHasArmor: Record<string, never> }
  | { digGreaterThanEnemyDig: Record<string, never> }
  | { spdGreaterThanEnemySpd: Record<string, never> }
  | { ownerWounded: Record<string, never> }
  | { ownerExposed: Record<string, never> }
  | { enemyWounded: Record<string, never> }
  | { ownerHasArmor: Record<string, never> }
  | { ownerArmorAtLeast: { value: number } }
  | { ownerHasStatus: { statusType: StatusType } }
  | { enemyHasStatusAtLeast: { statusType: StatusType; minStacks: number } };

// Effect type enum
export type EffectType =
  | { dealDamage: Record<string, never> }
  | { dealNonWeaponDamage: Record<string, never> }
  | { heal: Record<string, never> }
  | { gainArmor: Record<string, never> }
  | { gainAtk: Record<string, never> }
  | { gainGearAtk: Record<string, never> }
  | { gainSpd: Record<string, never> }
  | { gainDig: Record<string, never> }
  | { gainGold: Record<string, never> }
  | { applyBomb: Record<string, never> }
  | { applyChill: Record<string, never> }
  | { applyShrapnel: Record<string, never> }
  | { applyRust: Record<string, never> }
  | { applyBleed: Record<string, never> }
  | { removeArmor: Record<string, never> }
  | { gainStrikes: Record<string, never> }
  | { stealGold: Record<string, never> }
  | { goldToArmor: Record<string, never> }
  | { applyReflection: Record<string, never> }
  | { maxHp: Record<string, never> }
  | { reduceEnemySpd: Record<string, never> }
  | { dealSelfNonWeaponDamage: Record<string, never> }
  | { goldToArmorScaled: Record<string, never> }
  | { consumeGoldForArmor: Record<string, never> }
  | { preventDeath: Record<string, never> }
  | { setArmorPiercing: Record<string, never> }
  | { armorToMaxHp: Record<string, never> }
  | { reduceAllCountdowns: Record<string, never> }
  | { amplifyNonWeaponDamage: Record<string, never> }
  | { storeDamage: Record<string, never> }
  | { empowerNextBombDamage: Record<string, never> }
  | { reduceNextBombSelfDamage: Record<string, never> }
  | { halfGearAtkAfterSecondStrike: Record<string, never> }
  | { blastImmunity: Record<string, never> }
  | { doubleBombTrigger: Record<string, never> }
  | { doubleOnHitEffects: Record<string, never> }
  | { triggerAllShards: Record<string, never> };

// Trigger type enum
export type TriggerType =
  | { battleStart: Record<string, never> }
  | { firstTurn: Record<string, never> }
  | { firstTurnIfFaster: Record<string, never> }
  | { firstTurnIfSlower: Record<string, never> }
  | { turnStart: Record<string, never> }
  | { everyOtherTurn: Record<string, never> }
  | { onHit: Record<string, never> }
  | { exposed: Record<string, never> }
  | { wounded: Record<string, never> }
  | { countdown: { turns: number } }
  | { victory: Record<string, never> }
  | { onStruck: Record<string, never> }
  | { turnN: { turn: number } }
  | { everyOtherTurnFirstHit: Record<string, never> }
  | { turnEnd: Record<string, never> }
  | { onEnemyBleedDamage: Record<string, never> }
  | { onApplyRust: Record<string, never> }
  | { onGainShrapnel: Record<string, never> }
  | { dayStart: Record<string, never> }
  | { firstTimeWounded: Record<string, never> }
  | { firstTimeExposed: Record<string, never> }
  | { firstTimeGainShrapnel: Record<string, never> };

// Item effect (matches on-chain ItemEffect struct)
export interface ItemEffect {
  trigger: TriggerType;
  oncePerTurn: boolean;
  effectType: EffectType;
  value: number;
  condition: Condition;
}
