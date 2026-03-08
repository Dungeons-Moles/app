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
  ItemTag,
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

export type BossTraitExecutor = (state: CombatState, context: BossTraitContext) => BossTraitResult;

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
  id: 'B-A-W1-01',
  name: 'Swarm Queen',
  description: 'Strikes 2 times per turn',
  timings: ['BATTLE_START'],
  execute: (state, context) => {
    if (context.timing !== 'BATTLE_START') {
      return { state, triggered: false };
    }

    // Set enemy to strike 2 times per turn
    const newEnemy: CombatantState = {
      ...state.enemy,
      strikesPerTurn: 2,
    };

    return {
      state: { ...state, enemy: newEnemy },
      triggered: true,
      effectName: 'Swarm',
    };
  },
};

// ============================================================================
// T104: Obsidian Golem Trait - Hardened (+4 Armor on Turn Start per GDD)
// ============================================================================

const obsidianGolemTrait: BossTrait = {
  id: 'B-A-W1-02',
  name: 'Hardened',
  description: 'Turn Start: Regenerate +2 Armor',
  timings: ['TURN_START'],
  execute: (state, context) => {
    if (context.timing !== 'TURN_START') {
      return { state, triggered: false };
    }

    const newEnemy: CombatantState = {
      ...state.enemy,
      bonusArm: state.enemy.bonusArm + 2,
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
  id: 'B-A-W1-03',
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

function getRandomCommonItemEffect(playerGear: Gear[]): GearDefinition | null {
  // Filter for Common items that have effects
  const commonItemIds = playerGear.filter((g) => g.currentRarity === 'COMMON').map((g) => g.id);

  const commonWithEffects = commonItemIds
    .map((id) => GEAR_DEFINITIONS[id])
    .filter((def): def is GearDefinition => def?.effect !== undefined);

  if (commonWithEffects.length === 0) {
    return null;
  }

  // TODO: P03 VIOLATION - Math.random() breaks determinism.
  // This should accept a SeededRNG parameter and use rng.nextInt() instead.
  // Per constitution P03: All game logic MUST be deterministic.
  const randomIndex = Math.floor(Math.random() * commonWithEffects.length);
  return commonWithEffects[randomIndex];
}

const madMinerTrait: BossTrait = {
  id: 'B-A-W1-04',
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
  id: 'B-A-W2-01',
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
  id: 'B-A-W2-02',
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
  if (bossId !== 'B-A-W2-02') {
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
      [statusType]: (state.player.statusEffects[statusType] ?? 0) + stacks,
    },
  };

  return { ...state, player: newPlayer };
}

// ============================================================================
// T109: Eldritch Mole Trait - Three Phases (75%/50%/25% HP thresholds)
// ============================================================================

const eldritchMoleTrait: BossTrait = {
  id: 'B-A-W3-01',
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
  if (bossId !== 'B-A-W3-01') {
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
// T072: Shard Colossus Trait - Prismatic Spines (8 Shrapnel at Battle Start)
// ============================================================================

const shardColossusTrait: BossTrait = {
  id: 'B-A-W1-05',
  name: 'Prismatic Spines',
  description: 'Battle Start: Gain 8 Shrapnel. Every other turn: +4 Shrapnel',
  timings: ['BATTLE_START', 'EVERY_OTHER_TURN'],
  execute: (state, context) => {
    if (context.timing === 'BATTLE_START') {
      const newEnemy: CombatantState = {
        ...state.enemy,
        statusEffects: {
          ...state.enemy.statusEffects,
          shrapnel: state.enemy.statusEffects.shrapnel + 8,
        },
      };
      return {
        state: { ...state, enemy: newEnemy },
        triggered: true,
        effectName: 'Prismatic Spines',
      };
    }

    if (context.timing === 'EVERY_OTHER_TURN') {
      const newEnemy: CombatantState = {
        ...state.enemy,
        statusEffects: {
          ...state.enemy.statusEffects,
          shrapnel: state.enemy.statusEffects.shrapnel + 4,
        },
      };
      return {
        state: { ...state, enemy: newEnemy },
        triggered: true,
        effectName: 'Refracting Hide',
      };
    }

    return { state, triggered: false };
  },
};

// ============================================================================
// T073: Rust Regent Trait - Corroding Edict (1 Rust on hit, once/turn)
// ============================================================================

const rustRegentTrait: BossTrait = {
  id: 'B-A-W2-03',
  name: 'Corroding Edict',
  description: 'On Hit (once/turn): apply 1 Rust',
  timings: ['ON_HIT'],
  execute: (state, context) => {
    if (context.timing !== 'ON_HIT') {
      return { state, triggered: false };
    }

    // Apply 1 Rust to player
    const newPlayer: CombatantState = {
      ...state.player,
      statusEffects: {
        ...state.player.statusEffects,
        rust: state.player.statusEffects.rust + 1,
      },
    };

    return {
      state: { ...state, player: newPlayer },
      triggered: true,
      effectName: 'Corroding Edict',
    };
  },
};

// ============================================================================
// T073: Powder Keg Baron Trait - Countdown(3) bomb
// ============================================================================

// Track countdown state for Powder Keg Baron
let powderKegCountdown = 3;

export function resetPowderKegCountdown(): void {
  powderKegCountdown = 3;
}

export function getPowderKegCountdown(): number {
  return powderKegCountdown;
}

const powderKegBaronTrait: BossTrait = {
  id: 'B-A-W2-04',
  name: 'Volatile Countdown',
  description: 'Countdown(3): deal 10 damage to both. Short Fuse: Wounded reduces countdown by 1',
  timings: ['TURN_END', 'WOUNDED'],
  execute: (state, context) => {
    if (context.timing === 'TURN_END') {
      powderKegCountdown--;

      if (powderKegCountdown <= 0) {
        // BOOM! Deal 10 damage to both (non-weapon, ignores armor)
        const newPlayer: CombatantState = {
          ...state.player,
          hp: Math.max(0, state.player.hp - 10),
        };
        const newEnemy: CombatantState = {
          ...state.enemy,
          hp: Math.max(0, state.enemy.hp - 10),
        };

        // Reset countdown for next explosion
        powderKegCountdown = 3;

        return {
          state: { ...state, player: newPlayer, enemy: newEnemy },
          triggered: true,
          effectName: 'Volatile Countdown BOOM!',
        };
      }

      return {
        state,
        triggered: true,
        effectName: `Volatile Countdown (${powderKegCountdown})`,
      };
    }

    if (context.timing === 'WOUNDED') {
      // Short Fuse: reduce countdown by 1 (min 1)
      powderKegCountdown = Math.max(1, powderKegCountdown - 1);
      return {
        state,
        triggered: true,
        effectName: `Short Fuse (${powderKegCountdown})`,
      };
    }

    return { state, triggered: false };
  },
};

// ============================================================================
// T073: Greedkeeper Trait - Toll Collector (steal gold, gain armor)
// ============================================================================

const greedkeeperTrait: BossTrait = {
  id: 'B-A-W2-05',
  name: 'Toll Collector',
  description: 'Battle Start: Steal 10 Gold, gain Armor = floor(stolen/5) (cap 6)',
  timings: ['BATTLE_START'],
  execute: (state, context) => {
    if (context.timing !== 'BATTLE_START') {
      return { state, triggered: false };
    }

    // Steal up to 10 gold
    const stolen = Math.min(10, state.playerGold);
    const armorGain = Math.min(6, Math.floor(stolen / 5));

    const newEnemy: CombatantState = {
      ...state.enemy,
      bonusArm: state.enemy.bonusArm + armorGain,
    };

    return {
      state: {
        ...state,
        enemy: newEnemy,
        playerGold: state.playerGold - stolen,
      },
      triggered: true,
      effectName: `Toll Collector (-${stolen}g, +${armorGain} ARM)`,
    };
  },
};

// ============================================================================
// T074: Gilded Devourer Trait - Tax Feast (convert gold to armor)
// ============================================================================

const gildedDevourerTrait: BossTrait = {
  id: 'B-A-W3-02',
  name: 'Tax Feast',
  description:
    'Battle Start: Convert your Gold to Armor (+1 ARM per 5g, cap 10). Wounded: apply 3 Bleed',
  timings: ['BATTLE_START', 'WOUNDED'],
  execute: (state, context) => {
    if (context.timing === 'BATTLE_START') {
      // Convert gold to armor
      const armorGain = Math.min(10, Math.floor(state.playerGold / 5));

      const newEnemy: CombatantState = {
        ...state.enemy,
        bonusArm: state.enemy.bonusArm + armorGain,
      };

      return {
        state: { ...state, enemy: newEnemy },
        triggered: true,
        effectName: `Tax Feast (+${armorGain} ARM)`,
      };
    }

    if (context.timing === 'WOUNDED') {
      // Apply 3 Bleed to player
      const newPlayer: CombatantState = {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          bleed: state.player.statusEffects.bleed + 3,
        },
      };

      return {
        state: { ...state, player: newPlayer },
        triggered: true,
        effectName: 'Hunger (3 Bleed)',
      };
    }

    return { state, triggered: false };
  },
};

// ============================================================================
// T075: Frostbound Leviathan Trait - Whiteout (3 Chill at Battle Start)
// ============================================================================

const frostboundLeviathanTrait: BossTrait = {
  id: 'B-B-W3-01',
  name: 'Whiteout',
  description:
    'Battle Start: Apply 3 Chill. Every other turn: +4 Armor. Exposed: remove Chill, +2 SPD',
  timings: ['BATTLE_START', 'EVERY_OTHER_TURN', 'EXPOSED'],
  execute: (state, context) => {
    if (context.timing === 'BATTLE_START') {
      const newPlayer: CombatantState = {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          chill: state.player.statusEffects.chill + 3,
        },
      };

      return {
        state: { ...state, player: newPlayer },
        triggered: true,
        effectName: 'Whiteout (3 Chill)',
      };
    }

    if (context.timing === 'EVERY_OTHER_TURN') {
      const newEnemy: CombatantState = {
        ...state.enemy,
        bonusArm: state.enemy.bonusArm + 4,
      };

      return {
        state: { ...state, enemy: newEnemy },
        triggered: true,
        effectName: 'Glacial Bulk (+4 ARM)',
      };
    }

    if (context.timing === 'EXPOSED') {
      // Remove all Chill from player, boss gains +2 SPD
      const newPlayer: CombatantState = {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          chill: 0,
        },
      };
      const newEnemy: CombatantState = {
        ...state.enemy,
        bonusSpd: state.enemy.bonusSpd + 2,
      };

      return {
        state: { ...state, player: newPlayer, enemy: newEnemy },
        triggered: true,
        effectName: 'Crack Ice (+2 SPD)',
      };
    }

    return { state, triggered: false };
  },
};

// ============================================================================
// T075: Rusted Chronomancer Trait - Time Shear (2 strikes first turn)
// ============================================================================

const rustedChronomancerTrait: BossTrait = {
  id: 'B-B-W3-02',
  name: 'Time Shear',
  description: 'First Turn: Strike twice. Turn Start: Apply 1 Rust. Wounded: Apply 4 Bleed',
  timings: ['FIRST_TURN', 'TURN_START', 'WOUNDED'],
  execute: (state, context) => {
    if (context.timing === 'FIRST_TURN') {
      const newEnemy: CombatantState = {
        ...state.enemy,
        strikesPerTurn: 2,
      };

      return {
        state: { ...state, enemy: newEnemy },
        triggered: true,
        effectName: 'Time Shear (2 strikes)',
      };
    }

    if (context.timing === 'TURN_START') {
      // Apply 1 Rust to player
      const newPlayer: CombatantState = {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          rust: state.player.statusEffects.rust + 1,
        },
      };

      return {
        state: { ...state, player: newPlayer },
        triggered: true,
        effectName: 'Oxidized Future (1 Rust)',
      };
    }

    if (context.timing === 'WOUNDED') {
      // Apply 4 Bleed to player
      const newPlayer: CombatantState = {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          bleed: state.player.statusEffects.bleed + 4,
        },
      };

      return {
        state: { ...state, player: newPlayer },
        triggered: true,
        effectName: 'Blood Price (4 Bleed)',
      };
    }

    return { state, triggered: false };
  },
};

// ============================================================================
// Boss Traits Registry
// ============================================================================

// Note: Only some bosses have custom trait logic defined here.
// Other bosses use ability definitions from data/bosses.ts
export const BOSS_TRAITS: Partial<Record<BossId, BossTrait>> = {
  // Biome A - Week 1
  'B-A-W1-01': broodmotherTrait, // The Broodmother
  'B-A-W1-02': obsidianGolemTrait, // Obsidian Golem
  'B-A-W1-03': gasAnomalyTrait, // Gas Anomaly
  'B-A-W1-04': madMinerTrait, // Mad Miner
  'B-A-W1-05': shardColossusTrait, // Shard Colossus
  // Biome A - Week 2
  'B-A-W2-01': drillSergeantTrait, // Drill Sergeant
  'B-A-W2-02': crystalMimicTrait, // Crystal Mimic
  'B-A-W2-03': rustRegentTrait, // Rust Regent
  'B-A-W2-04': powderKegBaronTrait, // Powder Keg Baron
  'B-A-W2-05': greedkeeperTrait, // Greedkeeper
  // Biome A - Week 3
  'B-A-W3-01': eldritchMoleTrait, // The Eldritch Mole
  'B-A-W3-02': gildedDevourerTrait, // The Gilded Devourer
  // Biome B - Week 3
  'B-B-W3-01': frostboundLeviathanTrait, // Frostbound Leviathan
  'B-B-W3-02': rustedChronomancerTrait, // Rusted Chronomancer
};

// ============================================================================
// Boss Combat Helpers
// ============================================================================

/**
 * Get boss trait by ID (returns undefined if no custom trait)
 */
export function getBossTrait(bossId: BossId): BossTrait | undefined {
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
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
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

  if (!trait || !trait.timings.includes(timing)) {
    return { state, triggered: false };
  }

  return trait.execute(state, { timing });
}

/**
 * Check if boss ID is valid
 */
export function isBoss(id: string): id is BossId {
  return id in BOSSES;
}

/**
 * T077: Get boss weakness tags for loot weighting
 * Returns the 2 weakness tags of the specified boss
 * Used by POI item generation to weight items toward boss counters
 */
export function getBossWeaknessTags(bossId: BossId | null | undefined): ItemTag[] {
  if (!bossId) return [];
  const boss = BOSSES[bossId];
  if (!boss || !Array.isArray(boss.weaknessTags)) {
    return [];
  }
  return boss.weaknessTags;
}

/**
 * Get boss definition by ID (re-export from data)
 */
export { getBoss, getBossesForWeek, BOSSES } from '../../data/bosses';
