/**
 * Effect Bridge - Connects gear/tool definitions to the effect executor
 *
 * This module provides helpers to collect and process effects from player
 * equipment using the new type system while maintaining backward compatibility
 * with the existing resolver.
 */

import type { CombatState, Gear, Tool, GearId, ToolId } from '../engine/types';
import type { ItemEffect } from '../../data/combat-types';
import { GEAR_EFFECTS, getGearEffectsAtTier } from '../../data/gear-effects';
import { TOOL_EFFECTS, getToolEffectsAtTier } from '../../data/tool-effects';
import { RARITY_MULTIPLIER, getTierFromRarity } from '../../data/gear';
import type { CombatEffectContext, EffectLogEntry } from './effect-executor';
import { processEffects } from './effect-executor';

// ============================================================================
// Equipment Effect Collection
// ============================================================================

export interface EquippedEffect {
  effect: ItemEffect;
  id: string; // Unique identifier for once-per-turn tracking
  name: string; // Display name for logging
  sourceId: GearId | ToolId; // Item that provides this effect
}

/**
 * Get the tier for a gear item based on its rarity
 */
export function getGearTier(gear: Gear): 1 | 2 | 3 {
  const multiplier = RARITY_MULTIPLIER[gear.currentRarity];
  if (multiplier >= 4) return 3; // Diamond
  if (multiplier >= 2) return 2; // Gilded
  return 1; // Base
}

/**
 * Collect all effects from equipped gear
 */
export function collectGearEffects(gear: Gear[]): EquippedEffect[] {
  const effects: EquippedEffect[] = [];

  for (const item of gear) {
    const gearEffects = GEAR_EFFECTS[item.id];
    if (!gearEffects) continue;

    const tier = getGearTier(item);
    const itemEffects = getGearEffectsAtTier(item.id, tier);

    for (let i = 0; i < itemEffects.length; i++) {
      effects.push({
        effect: itemEffects[i],
        id: `${item.id}-${i}-${effects.length}`, // Unique per item instance
        name: item.name,
        sourceId: item.id,
      });
    }
  }

  return effects;
}

/**
 * Collect all effects from equipped tool
 */
export function collectToolEffects(tool: Tool | null): EquippedEffect[] {
  if (!tool) return [];

  const toolEffects = TOOL_EFFECTS[tool.id];
  if (!toolEffects) return [];

  const tier = getTierFromRarity(tool.rarity);
  const itemEffects = getToolEffectsAtTier(tool.id, tier);

  return itemEffects.map((effect, i) => ({
    effect,
    id: `${tool.id}-${i}`,
    name: tool.name,
    sourceId: tool.id,
  }));
}

/**
 * Collect all effects from player equipment
 */
export function collectAllEffects(gear: Gear[], tool: Tool | null): EquippedEffect[] {
  return [...collectToolEffects(tool), ...collectGearEffects(gear)];
}

// ============================================================================
// Battle State Flags (extracted from effects at battle start)
// ============================================================================

export interface BattleFlags {
  /** Blast immunity (G-BL-02: Blast Suit) */
  blastImmunity: boolean;
  /** Double bomb triggers (G-BL-08: Twin-Fuse Knot) */
  doubleBombTrigger: boolean;
  /** Double on-hit effects (G-SC-08: Gear-Link Medallion) */
  doubleOnHitEffects: boolean;
  /** Non-weapon damage amplification total */
  nonWeaponAmplify: number;
  /** Armor piercing amount */
  armorPiercing: number;
  /** Prevent death charges */
  preventDeathCharges: number;
  /** Has Trigger All Shards effect (T-GR-02: Gemfinder Staff) */
  triggerAllShards: boolean;
}

/**
 * Extract battle flags from effects
 */
export function extractBattleFlags(effects: EquippedEffect[]): BattleFlags {
  const flags: BattleFlags = {
    blastImmunity: false,
    doubleBombTrigger: false,
    doubleOnHitEffects: false,
    nonWeaponAmplify: 0,
    armorPiercing: 0,
    preventDeathCharges: 0,
    triggerAllShards: false,
  };

  for (const { effect } of effects) {
    // Most flags are BattleStart, but TriggerAllShards is an OnHit flag.
    if (effect.trigger.type !== 'BattleStart' && effect.effectType !== 'TriggerAllShards') {
      continue;
    }

    switch (effect.effectType) {
      case 'BlastImmunity':
        flags.blastImmunity = true;
        break;
      case 'DoubleBombTrigger':
        flags.doubleBombTrigger = true;
        break;
      case 'DoubleOnHitEffects':
        flags.doubleOnHitEffects = true;
        break;
      case 'AmplifyNonWeaponDamage':
        flags.nonWeaponAmplify += effect.value;
        break;
      case 'SetArmorPiercing':
        flags.armorPiercing = Math.max(flags.armorPiercing, effect.value);
        break;
      case 'PreventDeath':
        flags.preventDeathCharges += 1;
        break;
      case 'TriggerAllShards':
        flags.triggerAllShards = true;
        break;
    }
  }

  return flags;
}

// ============================================================================
// Effect Filtering
// ============================================================================

/**
 * Filter effects by trigger type
 */
export function filterEffectsByTrigger(
  effects: EquippedEffect[],
  triggerType: string
): EquippedEffect[] {
  return effects.filter((e) => e.effect.trigger.type === triggerType);
}

/**
 * Filter effects by effect type
 */
export function filterEffectsByType(
  effects: EquippedEffect[],
  effectType: string
): EquippedEffect[] {
  return effects.filter((e) => e.effect.effectType === effectType);
}

/**
 * Get all Countdown effects with their current countdown values
 */
export function getCountdownEffects(
  effects: EquippedEffect[]
): Array<{ effect: EquippedEffect; turns: number }> {
  return effects
    .filter((e) => e.effect.trigger.type === 'Countdown')
    .map((e) => ({
      effect: e,
      turns: (e.effect.trigger as { type: 'Countdown'; turns: number }).turns,
    }));
}

/**
 * Get all shard effects (for Gemfinder Staff trigger)
 */
export function getShardEffects(effects: EquippedEffect[]): EquippedEffect[] {
  // Shards are G-GR-05 through G-GR-08
  const shardIds: GearId[] = ['I21', 'I22', 'I23', 'I24'];
  return effects.filter((e) => shardIds.includes(e.sourceId as GearId));
}

// ============================================================================
// Processing Helpers
// ============================================================================

export interface ProcessingResult {
  state: CombatState;
  logs: EffectLogEntry[];
  applied: boolean;
}

/**
 * Create an effect context for processing
 */
export function createEffectContext(
  state: CombatState,
  turn: number,
  playerGold: number,
  flags: BattleFlags,
  firedThisTurn: Set<string>,
  callbacks: {
    updateGold: (amount: number) => void;
    addLog: (entry: EffectLogEntry) => void;
    setStoredDamage: (value: number) => void;
    setPreventDeathCharges: (value: number) => void;
    setFirstTimeWoundedTriggered: (value: boolean) => void;
  },
  extraState: {
    storedDamage: number;
    preventDeathCharges: number;
    countdownItems: Map<GearId, number>;
    firstTimeWoundedTriggered: boolean;
  }
): CombatEffectContext {
  return {
    state,
    owner: 'player',
    turn,
    playerGold,
    updateGold: callbacks.updateGold,
    addLog: callbacks.addLog,
    firedThisTurn,
    storedDamage: extraState.storedDamage,
    setStoredDamage: callbacks.setStoredDamage,
    nonWeaponAmplify: flags.nonWeaponAmplify,
    blastImmunity: flags.blastImmunity,
    doubleBombTrigger: flags.doubleBombTrigger,
    doubleOnHitEffects: flags.doubleOnHitEffects,
    armorPiercing: flags.armorPiercing,
    preventDeathCharges: extraState.preventDeathCharges,
    setPreventDeathCharges: callbacks.setPreventDeathCharges,
    countdownItems: extraState.countdownItems,
    firstTimeWoundedTriggered: extraState.firstTimeWoundedTriggered,
    setFirstTimeWoundedTriggered: callbacks.setFirstTimeWoundedTriggered,
  };
}

/**
 * Process effects for a specific phase
 */
export function processPhaseEffects(
  effects: EquippedEffect[],
  ctx: CombatEffectContext,
  phase: string,
  triggerContext?: {
    isFirstStrike?: boolean;
    wasWounded?: boolean;
    isWounded?: boolean;
    wasExposed?: boolean;
    isExposed?: boolean;
    enemyTookBleedDamage?: boolean;
    rustApplied?: boolean;
    shrapnelGained?: boolean;
    isDayStart?: boolean;
    playerActsFirst?: boolean;
  }
): ProcessingResult {
  const result = processEffects({
    effects: effects.map((e) => ({ effect: e.effect, id: e.id, name: e.name })),
    ctx,
    phase,
    triggerContext,
  });

  return {
    state: result.state,
    logs: result.logs,
    applied: result.applied,
  };
}
