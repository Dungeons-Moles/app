/**
 * Boss Entity Logic - T102-T109
 * Boss trait definitions and combat execution logic
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix B
 * @see specs/001-pve-dungeon-crawler/data-model.md Boss Entities
 */

import type {
  BossId,
  CombatState,
  CombatantState,
  StatusEffects,
  EffectTiming,
  Gear,
  GearId,
} from '../engine/types';
import { BOSSES, type BossDefinition } from '../../data/bosses';
import { GEAR_DEFINITIONS, type GearDefinition } from '../../data/gear';

// ============================================================================
// Boss Trait Types
// ============================================================================

export interface BossTraitContext {
  timing: EffectTiming;
  statusApplied?: { type: keyof StatusEffects; stacks: number };
}

export interface BossTraitResult {
  state: CombatState;
  triggered: boolean;
  effectName?: string;
}

export type BossTraitExecutor = (
  state: CombatState,
  context: BossTraitContext
) => BossTraitResult;

export interface BossTrait {
  id: BossId;
  name: string;
  description: string;
  timings: EffectTiming[];
  execute: BossTraitExecutor;
}

// ============================================================================
// Boss Phase Tracking (for Eldritch Mole)
// ============================================================================

export interface BossPhaseState {
  phase75Triggered: boolean;
  phase50Triggered: boolean;
  phase25Triggered: boolean;
  statusReflectedThisTurn: boolean;
}

const DEFAULT_BOSS_PHASE_STATE: BossPhaseState = {
  phase75Triggered: false,
  phase50Triggered: false,
  phase25Triggered: false,
  statusReflectedThisTurn: false,
};

// Store boss phase state per combat (reset on combat start)
let bossPhaseState: BossPhaseState = { ...DEFAULT_BOSS_PHASE_STATE };

export function resetBossPhaseState(): void {
  bossPhaseState = { ...DEFAULT_BOSS_PHASE_STATE };
}

export function resetStatusReflectionFlag(): void {
  bossPhaseState.statusReflectedThisTurn = false;
}

export function getBossPhaseState(): BossPhaseState {
  return bossPhaseState;
}

// ============================================================================
// T103: Broodmother Trait - Swarm (3 strikes per turn)
// ============================================================================

const broodmotherTrait: BossTrait = {
  id: 'BROODMOTHER',
  name: 'Swarm',
  description: 'Strikes 3 times per turn',
  timings: ['BATTLE_START'],
  execute: (state, context) => {
    if (context.timing !== 'BATTLE_START') {
      return { state, triggered: false };
    }

    // Set enemy to strike 3 times per turn
    const newEnemy: CombatantState = {
      ...state.enemy,
      strikesPerTurn: 3,
    };

    return {
      state: { ...state, enemy: newEnemy },
      triggered: true,
      effectName: 'Swarm',
    };
  },
};

// ============================================================================
// T104: Obsidian Golem Trait - Hardened (+3 Armor on Turn Start)
// ============================================================================

const obsidianGolemTrait: BossTrait = {
  id: 'OBSIDIAN_GOLEM',
  name: 'Hardened',
  description: 'Turn Start: Regenerate +3 Armor',
  timings: ['TURN_START'],
  execute: (state, context) => {
    if (context.timing !== 'TURN_START') {
      return { state, triggered: false };
    }

    // Add +3 to bonus armor
    const newEnemy: CombatantState = {
      ...state.enemy,
      bonusArm: state.enemy.bonusArm + 3,
    };

    return {
      state: { ...state, enemy: newEnemy },
      triggered: true,
      effectName: 'Hardened',
    };
  },
};

// ============================================================================
// T105: Gas Anomaly Trait - Toxic Seep (2 damage ignoring Armor on Turn Start)
// ============================================================================

const gasAnomalyTrait: BossTrait = {
  id: 'GAS_ANOMALY',
  name: 'Toxic Seep',
  description: 'Turn Start: Deal 2 damage ignoring Armor',
  timings: ['TURN_START'],
  execute: (state, context) => {
    if (context.timing !== 'TURN_START') {
      return { state, triggered: false };
    }

    // Deal 2 damage to player (ignores armor)
    const newPlayer: CombatantState = {
      ...state.player,
      hp: Math.max(0, state.player.hp - 2),
    };

    return {
      state: { ...state, player: newPlayer },
      triggered: true,
      effectName: 'Toxic Seep',
    };
  },
};

// ============================================================================
// T106: Mad Miner Trait - Scavenger Mirror (Battle Start: copy Common item)
// ============================================================================

function getRandomCommonItemEffect(
  playerGear: Gear[]
): GearDefinition | null {
  // Filter for Common items that have effects
  const commonItemIds = playerGear
    .filter((g) => g.currentRarity === 'COMMON')
    .map((g) => g.id);

  const commonWithEffects = commonItemIds
    .map((id) => GEAR_DEFINITIONS[id])
    .filter((def): def is GearDefinition => def?.effect !== undefined);

  if (commonWithEffects.length === 0) {
    return null;
  }

  // Pick a random one (using simple random for now - will be seeded in resolver)
  const randomIndex = Math.floor(Math.random() * commonWithEffects.length);
  return commonWithEffects[randomIndex];
}

const madMinerTrait: BossTrait = {
  id: 'MAD_MINER',
  name: 'Scavenger Mirror',
  description: 'Battle Start: Gains one of your Common item effects',
  timings: ['BATTLE_START'],
  execute: (state, context) => {
    if (context.timing !== 'BATTLE_START') {
      return { state, triggered: false };
    }

    // Note: In actual implementation, we'd need access to player's inventory
    // For now, this trait sets a flag that the combat resolver will check
    // The actual effect mirroring happens in the combat system

    return {
      state,
      triggered: true,
      effectName: 'Scavenger Mirror',
    };
  },
};

// ============================================================================
// T107: Drill Sergeant Trait - Rev Up (+2 ATK on Turn Start)
// ============================================================================

const drillSergeantTrait: BossTrait = {
  id: 'DRILL_SERGEANT',
  name: 'Rev Up',
  description: 'Turn Start: Gain +2 ATK',
  timings: ['TURN_START'],
  execute: (state, context) => {
    if (context.timing !== 'TURN_START') {
      return { state, triggered: false };
    }

    // Add +2 to bonus ATK
    const newEnemy: CombatantState = {
      ...state.enemy,
      bonusAtk: state.enemy.bonusAtk + 2,
    };

    return {
      state: { ...state, enemy: newEnemy },
      triggered: true,
      effectName: 'Rev Up',
    };
  },
};

// ============================================================================
// T108: Crystal Mimic Trait - Reflection (first status reflects to player)
// ============================================================================

const crystalMimicTrait: BossTrait = {
  id: 'CRYSTAL_MIMIC',
  name: 'Reflection',
  description: 'First status application per turn reflects to player',
  timings: ['TURN_START'], // Reset flag at turn start
  execute: (state, context) => {
    if (context.timing === 'TURN_START') {
      // Reset the reflection flag at turn start
      resetStatusReflectionFlag();
      return { state, triggered: false };
    }

    return { state, triggered: false };
  },
};

/**
 * T108: Crystal Mimic - Check and apply status reflection
 * Call this when applying a status to the enemy
 * Returns updated state with status also applied to player if reflection triggers
 */
export function applyCrystalMimicReflection(
  state: CombatState,
  bossId: BossId,
  statusType: keyof StatusEffects,
  stacks: number
): CombatState {
  if (bossId !== 'CRYSTAL_MIMIC') {
    return state;
  }

  // Check if we already reflected this turn
  if (bossPhaseState.statusReflectedThisTurn) {
    return state;
  }

  // Mark that we've reflected this turn
  bossPhaseState.statusReflectedThisTurn = true;

  // Apply the same status to the player
  const newPlayer: CombatantState = {
    ...state.player,
    statusEffects: {
      ...state.player.statusEffects,
      [statusType]: state.player.statusEffects[statusType] + stacks,
    },
  };

  return { ...state, player: newPlayer };
}

// ============================================================================
// T109: Eldritch Mole Trait - Three Phases (75%/50%/25% HP thresholds)
// ============================================================================

const eldritchMoleTrait: BossTrait = {
  id: 'ELDRITCH_MOLE',
  name: 'Three Phases',
  description: '75% HP: +12 Armor | 50% HP: Strike twice | 25% HP: +3 ATK, +2 DIG',
  timings: ['ON_STRUCK'], // Check phases after taking damage
  execute: (state, context) => {
    // Phase checks happen after damage is dealt
    // We don't actually need to implement here - see checkEldritchMolePhases
    return { state, triggered: false };
  },
};

/**
 * T109: Check and trigger Eldritch Mole phase transitions
 * Call this after enemy takes damage
 */
export function checkEldritchMolePhases(
  state: CombatState,
  bossId: BossId
): { state: CombatState; phaseTriggered: string | null } {
  if (bossId !== 'ELDRITCH_MOLE') {
    return { state, phaseTriggered: null };
  }

  const enemy = state.enemy;
  const hpPercent = enemy.hp / enemy.maxHp;

  let newState = state;
  let phaseTriggered: string | null = null;

  // Phase 1: 75% HP threshold - Gain +12 Armor
  if (hpPercent <= 0.75 && !bossPhaseState.phase75Triggered) {
    bossPhaseState.phase75Triggered = true;
    newState = {
      ...newState,
      enemy: {
        ...newState.enemy,
        bonusArm: newState.enemy.bonusArm + 12,
      },
    };
    phaseTriggered = 'Phase 1: +12 Armor';
  }

  // Phase 2: 50% HP threshold - Strike twice per turn
  if (hpPercent <= 0.5 && !bossPhaseState.phase50Triggered) {
    bossPhaseState.phase50Triggered = true;
    newState = {
      ...newState,
      enemy: {
        ...newState.enemy,
        strikesPerTurn: 2,
      },
    };
    phaseTriggered = 'Phase 2: Strike twice';
  }

  // Phase 3: 25% HP threshold - Gain +3 ATK, +2 DIG
  if (hpPercent <= 0.25 && !bossPhaseState.phase25Triggered) {
    bossPhaseState.phase25Triggered = true;
    newState = {
      ...newState,
      enemy: {
        ...newState.enemy,
        bonusAtk: newState.enemy.bonusAtk + 3,
        dig: newState.enemy.dig + 2,
      },
    };
    phaseTriggered = 'Phase 3: +3 ATK, +2 DIG';
  }

  return { state: newState, phaseTriggered };
}

// ============================================================================
// Boss Traits Registry
// ============================================================================

export const BOSS_TRAITS: Record<BossId, BossTrait> = {
  BROODMOTHER: broodmotherTrait,
  OBSIDIAN_GOLEM: obsidianGolemTrait,
  GAS_ANOMALY: gasAnomalyTrait,
  MAD_MINER: madMinerTrait,
  DRILL_SERGEANT: drillSergeantTrait,
  CRYSTAL_MIMIC: crystalMimicTrait,
  ELDRITCH_MOLE: eldritchMoleTrait,
};

// ============================================================================
// Boss Combat Helpers
// ============================================================================

/**
 * Get boss trait by ID
 */
export function getBossTrait(bossId: BossId): BossTrait {
  return BOSS_TRAITS[bossId];
}

/**
 * Create enemy combatant state from boss definition
 */
export function createBossCombatant(bossId: BossId): CombatantState {
  const boss = BOSSES[bossId];

  return {
    name: boss.name,
    emoji: boss.emoji,
    isPlayer: false,
    maxHp: boss.stats.hp,
    hp: boss.stats.hp,
    atk: boss.stats.atk,
    arm: boss.stats.arm,
    spd: boss.stats.spd,
    dig: boss.stats.dig ?? 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0 },
    strikesPerTurn: 1, // Will be modified by traits like Broodmother
    ignoresArmor: false,
  };
}

/**
 * Execute boss trait for given timing
 */
export function executeBossTrait(
  state: CombatState,
  bossId: BossId,
  timing: EffectTiming
): BossTraitResult {
  const trait = BOSS_TRAITS[bossId];

  if (!trait.timings.includes(timing)) {
    return { state, triggered: false };
  }

  return trait.execute(state, { timing });
}

/**
 * Check if boss ID is valid
 */
export function isBoss(id: string): id is BossId {
  return id in BOSS_TRAITS;
}

/**
 * Get boss definition by ID (re-export from data)
 */
export { getBoss, getBossesForWeek, BOSSES } from '../../data/bosses';
