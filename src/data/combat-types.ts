/**
 * Combat types aligned with Solana backend (crates/combat-system/src/state.rs)
 * This file mirrors the Rust enums to ensure frontend/backend consistency
 */

// ============================================================================
// Trigger Types (matches TriggerType enum in Rust)
// ============================================================================

export type TriggerType =
  | { type: 'BattleStart' }
  | { type: 'FirstTurn' }
  | { type: 'FirstTurnIfFaster' }
  | { type: 'FirstTurnIfSlower' }
  | { type: 'TurnStart' }
  | { type: 'EveryOtherTurn' }
  | { type: 'OnHit' }
  | { type: 'Exposed' }
  | { type: 'Wounded' }
  | { type: 'Countdown'; turns: number }
  | { type: 'Victory' }
  | { type: 'OnStruck' }
  | { type: 'TurnN'; turn: number }
  | { type: 'EveryOtherTurnFirstHit' }
  | { type: 'TurnEnd' }
  | { type: 'OnEnemyBleedDamage' }
  | { type: 'OnApplyRust' }
  | { type: 'OnDealNonWeaponDamage' }
  | { type: 'OnGainShrapnel' }
  | { type: 'DayStart' }
  | { type: 'FirstTimeWounded' }
  | { type: 'FirstTimeExposed' }
  | { type: 'FirstTimeGainShrapnel' };

// Helper constructors for triggers
export const Trigger = {
  BattleStart: (): TriggerType => ({ type: 'BattleStart' }),
  FirstTurn: (): TriggerType => ({ type: 'FirstTurn' }),
  FirstTurnIfFaster: (): TriggerType => ({ type: 'FirstTurnIfFaster' }),
  FirstTurnIfSlower: (): TriggerType => ({ type: 'FirstTurnIfSlower' }),
  TurnStart: (): TriggerType => ({ type: 'TurnStart' }),
  EveryOtherTurn: (): TriggerType => ({ type: 'EveryOtherTurn' }),
  OnHit: (): TriggerType => ({ type: 'OnHit' }),
  Exposed: (): TriggerType => ({ type: 'Exposed' }),
  Wounded: (): TriggerType => ({ type: 'Wounded' }),
  Countdown: (turns: number): TriggerType => ({ type: 'Countdown', turns }),
  Victory: (): TriggerType => ({ type: 'Victory' }),
  OnStruck: (): TriggerType => ({ type: 'OnStruck' }),
  TurnN: (turn: number): TriggerType => ({ type: 'TurnN', turn }),
  EveryOtherTurnFirstHit: (): TriggerType => ({ type: 'EveryOtherTurnFirstHit' }),
  TurnEnd: (): TriggerType => ({ type: 'TurnEnd' }),
  OnEnemyBleedDamage: (): TriggerType => ({ type: 'OnEnemyBleedDamage' }),
  OnApplyRust: (): TriggerType => ({ type: 'OnApplyRust' }),
  OnDealNonWeaponDamage: (): TriggerType => ({ type: 'OnDealNonWeaponDamage' }),
  OnGainShrapnel: (): TriggerType => ({ type: 'OnGainShrapnel' }),
  DayStart: (): TriggerType => ({ type: 'DayStart' }),
  FirstTimeWounded: (): TriggerType => ({ type: 'FirstTimeWounded' }),
  FirstTimeExposed: (): TriggerType => ({ type: 'FirstTimeExposed' }),
  FirstTimeGainShrapnel: (): TriggerType => ({ type: 'FirstTimeGainShrapnel' }),
} as const;

// ============================================================================
// Effect Types (matches EffectType enum in Rust)
// ============================================================================

export type EffectType =
  | 'DealDamage'
  | 'DealNonWeaponDamage'
  | 'Heal'
  | 'GainArmor'
  | 'GainAtk'
  | 'GainGearAtk'
  | 'GainSpd'
  | 'GainDig'
  | 'GainGold'
  | 'AmplifyGoldGain'
  | 'ApplyBomb'
  | 'ApplyChill'
  | 'ApplyShrapnel'
  | 'ApplyRust'
  | 'ApplyBleed'
  | 'RemoveArmor'
  | 'GainStrikes'
  | 'StealGold'
  | 'GoldToArmor'
  | 'ApplyReflection'
  | 'MaxHp'
  | 'ReduceEnemySpd'
  | 'DealSelfNonWeaponDamage'
  | 'GoldToArmorScaled'
  | 'ConsumeGoldForArmor'
  | 'PreventDeath'
  | 'SetArmorPiercing'
  | 'ArmorToMaxHp'
  | 'ReduceAllCountdowns'
  | 'AmplifyNonWeaponDamage'
  | 'StoreDamage'
  | 'DoubleDetonationFirst'
  | 'DoubleDetonationSecond'
  | 'EmpowerNextBombDamage'
  | 'ReduceNextBombSelfDamage'
  | 'HalfGearAtkAfterSecondStrike'
  | 'BlastImmunity'
  | 'DoubleBombTrigger'
  | 'DoubleOnHitEffects'
  | 'TriggerAllShards';

// ============================================================================
// Status Types (matches StatusType enum in Rust)
// ============================================================================

export type StatusType = 'Chill' | 'Shrapnel' | 'Rust' | 'Bleed' | 'Reflection';

// ============================================================================
// Condition Types (matches Condition enum in Rust)
// ============================================================================

export type Condition =
  | { type: 'None' }
  | { type: 'EnemyHasStatus'; status: StatusType }
  | { type: 'EnemyHasNoArmor' }
  | { type: 'EnemyHasArmor' }
  | { type: 'DigGreaterThanEnemyDig' }
  | { type: 'SpdGreaterThanEnemySpd' }
  | { type: 'OwnerWounded' }
  | { type: 'OwnerExposed' }
  | { type: 'EnemyWounded' }
  | { type: 'OwnerHasArmor' }
  | { type: 'OwnerArmorAtLeast'; value: number }
  | { type: 'OwnerGoldAtLeast'; value: number }
  | { type: 'EnemyGoldAtLeast'; value: number }
  | { type: 'OwnerHasStatus'; status: StatusType }
  | { type: 'EnemyHasStatusAtLeast'; status: StatusType; minStacks: number }
  | { type: 'OwnerDigGreaterThanEnemyArmor' }
  | { type: 'Or'; conditions: [Condition, Condition] };

// Helper constructors for conditions
export const Cond = {
  None: (): Condition => ({ type: 'None' }),
  EnemyHasStatus: (status: StatusType): Condition => ({ type: 'EnemyHasStatus', status }),
  EnemyHasNoArmor: (): Condition => ({ type: 'EnemyHasNoArmor' }),
  EnemyHasArmor: (): Condition => ({ type: 'EnemyHasArmor' }),
  DigGreaterThanEnemyDig: (): Condition => ({ type: 'DigGreaterThanEnemyDig' }),
  SpdGreaterThanEnemySpd: (): Condition => ({ type: 'SpdGreaterThanEnemySpd' }),
  OwnerWounded: (): Condition => ({ type: 'OwnerWounded' }),
  OwnerExposed: (): Condition => ({ type: 'OwnerExposed' }),
  EnemyWounded: (): Condition => ({ type: 'EnemyWounded' }),
  OwnerHasArmor: (): Condition => ({ type: 'OwnerHasArmor' }),
  OwnerArmorAtLeast: (value: number): Condition => ({ type: 'OwnerArmorAtLeast', value }),
  OwnerGoldAtLeast: (value: number): Condition => ({ type: 'OwnerGoldAtLeast', value }),
  EnemyGoldAtLeast: (value: number): Condition => ({ type: 'EnemyGoldAtLeast', value }),
  OwnerHasStatus: (status: StatusType): Condition => ({ type: 'OwnerHasStatus', status }),
  EnemyHasStatusAtLeast: (status: StatusType, minStacks: number): Condition => ({
    type: 'EnemyHasStatusAtLeast',
    status,
    minStacks,
  }),
  OwnerDigGreaterThanEnemyArmor: (): Condition => ({ type: 'OwnerDigGreaterThanEnemyArmor' }),
  Or: (a: Condition, b: Condition): Condition => ({ type: 'Or', conditions: [a, b] }),
} as const;

// ============================================================================
// Item Effect (matches ItemEffect struct in Rust)
// ============================================================================

export interface ItemEffect {
  trigger: TriggerType;
  oncePerTurn: boolean;
  effectType: EffectType;
  value: number;
  condition: Condition;
}

// Helper to create effects with defaults
export function createEffect(
  trigger: TriggerType,
  effectType: EffectType,
  value: number,
  options?: {
    oncePerTurn?: boolean;
    condition?: Condition;
  }
): ItemEffect {
  return {
    trigger,
    effectType,
    value,
    oncePerTurn: options?.oncePerTurn ?? false,
    condition: options?.condition ?? Cond.None(),
  };
}

// ============================================================================
// Legacy EffectTiming Mapping (for backward compatibility)
// Maps old string-based timing to new TriggerType
// ============================================================================

export function legacyTimingToTrigger(timing: string): TriggerType {
  switch (timing) {
    case 'BATTLE_START':
      return Trigger.BattleStart();
    case 'FIRST_TURN':
      return Trigger.FirstTurn();
    case 'TURN_START':
      return Trigger.TurnStart();
    case 'EVERY_OTHER_TURN':
      return Trigger.EveryOtherTurn();
    case 'ON_HIT':
      return Trigger.OnHit();
    case 'ON_STRUCK':
      return Trigger.OnStruck();
    case 'WOUNDED':
      return Trigger.Wounded();
    case 'EXPOSED':
      return Trigger.Exposed();
    case 'TURN_END':
      return Trigger.TurnEnd();
    case 'VICTORY':
      return Trigger.Victory();
    case 'DAY_START':
      return Trigger.DayStart();
    case 'COUNTDOWN':
      return Trigger.Countdown(2); // Default countdown
    case 'PASSIVE':
      return Trigger.BattleStart(); // Passives typically apply at battle start
    case 'ON_DEATH':
      return Trigger.BattleStart(); // PreventDeath is a battle start effect
    default:
      console.warn(`Unknown timing: ${timing}, defaulting to BattleStart`);
      return Trigger.BattleStart();
  }
}
