/**
 * Boss Definitions for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/spec.md - Appendix B
 * @see specs/001-pve-dungeon-crawler/data-model.md - Boss Entities
 */

import type { BossId } from '../game/engine/types';

// ============================================================================
// Boss Definition Interface
// ============================================================================

export interface BossDefinition {
  id: BossId;
  name: string;
  emoji: string;
  week: 1 | 2 | 3;
  stats: {
    hp: number;
    atk: number;
    arm: number;
    spd: number;
    dig?: number;
  };
  trait: {
    name: string;
    description: string;
  };
  testInfo: {
    whatItTests: string;
    intendedCounters: string[];
  };
}

// ============================================================================
// Boss Definitions
// ============================================================================

export const BOSSES: Record<BossId, BossDefinition> = {
  // Week 1 Gatekeepers (4 bosses, random selection)
  BROODMOTHER: {
    id: 'BROODMOTHER',
    name: 'The Broodmother',
    emoji: '\u{1F577}\uFE0F', // Spider
    week: 1,
    stats: { hp: 20, atk: 1, arm: 0, spd: 3 },
    trait: {
      name: 'Swarm',
      description: 'Strikes 3 times per turn',
    },
    testInfo: {
      whatItTests: 'ARM stacking, multi-hit mitigation',
      intendedCounters: ['High ARM', 'Shrapnel stacks'],
    },
  },

  OBSIDIAN_GOLEM: {
    id: 'OBSIDIAN_GOLEM',
    name: 'Obsidian Golem',
    emoji: '\u{1F5FF}', // Moyai
    week: 1,
    stats: { hp: 12, atk: 3, arm: 18, spd: 0 },
    trait: {
      name: 'Hardened',
      description: 'Turn Start: Regenerate +3 Armor',
    },
    testInfo: {
      whatItTests: 'Armor penetration, sustained damage',
      intendedCounters: ['Rust stacks', 'Armor ignore effects', 'High ATK'],
    },
  },

  GAS_ANOMALY: {
    id: 'GAS_ANOMALY',
    name: 'Gas Anomaly',
    emoji: '\u2601\uFE0F', // Cloud
    week: 1,
    stats: { hp: 28, atk: 2, arm: 0, spd: 2 },
    trait: {
      name: 'Toxic Seep',
      description: 'Turn Start: Deal 2 damage ignoring Armor',
    },
    testInfo: {
      whatItTests: 'HP pool, healing sustain',
      intendedCounters: ['High HP', 'Lifesteal', 'High DPS race'],
    },
  },

  MAD_MINER: {
    id: 'MAD_MINER',
    name: 'Mad Miner',
    emoji: '\u26CF\uFE0F', // Pick
    week: 1,
    stats: { hp: 22, atk: 3, arm: 6, spd: 2 },
    trait: {
      name: 'Scavenger Mirror',
      description: 'Battle Start: Gains one of your Common item effects',
    },
    testInfo: {
      whatItTests: 'Item diversity, adaptability',
      intendedCounters: ['Non-Common items', 'No item effects', 'High base stats'],
    },
  },

  // Week 2 Filters (2 bosses, random selection)
  DRILL_SERGEANT: {
    id: 'DRILL_SERGEANT',
    name: 'Drill Sergeant',
    emoji: '\u{1FA96}', // Military Helmet
    week: 2,
    stats: { hp: 26, atk: 0, arm: 10, spd: 2 },
    trait: {
      name: 'Rev Up',
      description: 'Turn Start: Gain +2 ATK',
    },
    testInfo: {
      whatItTests: 'Speed racing, quick kills',
      intendedCounters: ['High SPD', 'Burst damage', 'Chill stacks'],
    },
  },

  CRYSTAL_MIMIC: {
    id: 'CRYSTAL_MIMIC',
    name: 'Crystal Mimic',
    emoji: '\u{1F48E}', // Gem
    week: 2,
    stats: { hp: 30, atk: 4, arm: 8, spd: 3 },
    trait: {
      name: 'Reflection',
      description: 'First status application per turn reflects to player',
    },
    testInfo: {
      whatItTests: 'Status effect reliance',
      intendedCounters: ['No status builds', 'Pure damage', 'Status-immune builds'],
    },
  },

  // Week 3 Final Boss (fixed)
  ELDRITCH_MOLE: {
    id: 'ELDRITCH_MOLE',
    name: 'The Eldritch Mole',
    emoji: '\u{1F409}', // Dragon
    week: 3,
    stats: { hp: 60, atk: 5, arm: 12, spd: 3, dig: 5 },
    trait: {
      name: 'Three Phases',
      description: '75% HP: +12 Armor | 50% HP: Strike twice | 25% HP: +3 ATK, +2 DIG',
    },
    testInfo: {
      whatItTests: 'Complete build synergy, endurance',
      intendedCounters: ['Full build completion', 'Multi-phase planning', 'Burst windows'],
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get boss definition by ID
 */
export function getBoss(id: BossId): BossDefinition {
  return BOSSES[id];
}

/**
 * Get all bosses for a given week
 */
export function getBossesForWeek(week: 1 | 2 | 3): BossDefinition[] {
  return Object.values(BOSSES).filter(boss => boss.week === week);
}
