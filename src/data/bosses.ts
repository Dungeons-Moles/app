/**
 * Boss Data Definitions
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix B
 */

import type { EffectTiming, BossId, CombatState } from '../game/engine/types';

// ============================================================================
// Boss Types
// ============================================================================

export interface BossStats {
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig?: number;
}

export interface BossTrait {
  name: string;
  description: string;
  timings: EffectTiming[];
}

export interface BossPhase {
  threshold: number; // HP percentage (0.75, 0.50, 0.25)
  description: string;
}

export interface BossDefinition {
  id: BossId;
  name: string;
  emoji: string;
  week: 1 | 2 | 3;
  stats: BossStats;
  trait: BossTrait;
  phases?: BossPhase[];
}

// ============================================================================
// Boss Definitions
// ============================================================================

export const BOSSES: Record<BossId, BossDefinition> = {
  BROODMOTHER: {
    id: 'BROODMOTHER',
    name: 'The Broodmother',
    emoji: '🕷️',
    week: 1,
    stats: {
      hp: 20,
      atk: 1,
      arm: 0,
      spd: 3,
    },
    trait: {
      name: 'Swarm',
      description: 'Strikes 3 times per turn',
      timings: ['TURN_START'],
    },
  },

  OBSIDIAN_GOLEM: {
    id: 'OBSIDIAN_GOLEM',
    name: 'Obsidian Golem',
    emoji: '🗿',
    week: 1,
    stats: {
      hp: 12,
      atk: 3,
      arm: 18,
      spd: 0,
    },
    trait: {
      name: 'Hardened',
      description: 'Turn Start: Regenerate +3 Armor',
      timings: ['TURN_START'],
    },
  },

  GAS_ANOMALY: {
    id: 'GAS_ANOMALY',
    name: 'Gas Anomaly',
    emoji: '☁️',
    week: 1,
    stats: {
      hp: 28,
      atk: 2,
      arm: 0,
      spd: 2,
    },
    trait: {
      name: 'Toxic Seep',
      description: 'Turn Start: Deal 2 damage ignoring Armor',
      timings: ['TURN_START'],
    },
  },

  MAD_MINER: {
    id: 'MAD_MINER',
    name: 'Mad Miner',
    emoji: '⛏️',
    week: 1,
    stats: {
      hp: 22,
      atk: 3,
      arm: 6,
      spd: 2,
    },
    trait: {
      name: 'Scavenger Mirror',
      description: 'Battle Start: Gains one of your Common item effects',
      timings: ['BATTLE_START'],
    },
  },

  DRILL_SERGEANT: {
    id: 'DRILL_SERGEANT',
    name: 'Drill Sergeant',
    emoji: '🪖',
    week: 2,
    stats: {
      hp: 26,
      atk: 0,
      arm: 10,
      spd: 2,
    },
    trait: {
      name: 'Rev Up',
      description: 'Turn Start: Gains +2 ATK',
      timings: ['TURN_START'],
    },
  },

  CRYSTAL_MIMIC: {
    id: 'CRYSTAL_MIMIC',
    name: 'Crystal Mimic',
    emoji: '💎',
    week: 2,
    stats: {
      hp: 30,
      atk: 4,
      arm: 8,
      spd: 3,
    },
    trait: {
      name: 'Reflection',
      description: 'First status application per turn reflects to player',
      timings: ['ON_STRUCK'],
    },
  },

  ELDRITCH_MOLE: {
    id: 'ELDRITCH_MOLE',
    name: 'The Eldritch Mole',
    emoji: '🐲',
    week: 3,
    stats: {
      hp: 60,
      atk: 5,
      arm: 12,
      spd: 3,
      dig: 5,
    },
    trait: {
      name: 'Three Phases',
      description: '75%: +12 Armor, 50%: Strike twice, 25%: +3 ATK +2 DIG',
      timings: ['ON_WOUNDED'],
    },
    phases: [
      {
        threshold: 0.75,
        description: 'Phase 1: Gain +12 Armor',
      },
      {
        threshold: 0.5,
        description: 'Phase 2: Begin striking twice per turn',
      },
      {
        threshold: 0.25,
        description: 'Phase 3: Gain +3 ATK and +2 DIG',
      },
    ],
  },
};

// ============================================================================
// Boss Pools by Week
// ============================================================================

export const BOSS_POOLS: Record<1 | 2 | 3, BossId[]> = {
  1: ['BROODMOTHER', 'OBSIDIAN_GOLEM', 'GAS_ANOMALY', 'MAD_MINER'],
  2: ['DRILL_SERGEANT', 'CRYSTAL_MIMIC'],
  3: ['ELDRITCH_MOLE'], // Fixed
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getBoss(id: BossId): BossDefinition {
  return BOSSES[id];
}

export function getBossesForWeek(week: 1 | 2 | 3): BossDefinition[] {
  return BOSS_POOLS[week].map((id) => BOSSES[id]);
}

export function getAllBossIds(): BossId[] {
  return Object.keys(BOSSES) as BossId[];
}

export function isWeek1Boss(id: BossId): boolean {
  return BOSS_POOLS[1].includes(id);
}

export function isWeek2Boss(id: BossId): boolean {
  return BOSS_POOLS[2].includes(id);
}

export function isWeek3Boss(id: BossId): boolean {
  return BOSS_POOLS[3].includes(id);
}

export function getBossStats(id: BossId): BossStats {
  return BOSSES[id].stats;
}

export function getBossPhases(id: BossId): BossPhase[] | undefined {
  return BOSSES[id].phases;
}
