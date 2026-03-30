/**
 * Boss stat scaling by campaign level.
 * Mirrors on-chain logic in boss-system/scaling.rs.
 */

const LEVELS_PER_ACT = 10;

function calculateAct(level: number): number {
  return Math.floor((level - 1) / LEVELS_PER_ACT);
}

function calculateStageInAct(level: number): number {
  return ((level - 1) % LEVELS_PER_ACT) + 1;
}

function calculateTier(stageInAct: number): number {
  if (stageInAct <= 3) return 0;
  if (stageInAct <= 7) return 1;
  return 2;
}

function scaleWeek1Stats(
  baseHp: number,
  baseArm: number,
  tier: number
): { hp: number; arm: number; atkBonus: number } {
  return {
    hp: baseHp + tier,
    arm: baseArm + tier,
    atkBonus: 0,
  };
}

function scaleWeek2Stats(
  baseHp: number,
  baseArm: number,
  tier: number
): { hp: number; arm: number; atkBonus: number } {
  return {
    hp: baseHp + 2 * tier,
    arm: baseArm + tier,
    atkBonus: tier >= 2 ? 1 : 0,
  };
}

function scaleWeek3Stats(
  baseHp: number,
  baseArm: number,
  tier: number
): { hp: number; arm: number; atkBonus: number } {
  const armReduction = tier === 0 ? 3 : 0;
  return {
    hp: baseHp + 3 * tier,
    arm: Math.max(0, baseArm - armReduction) + tier,
    atkBonus: tier >= 1 ? 1 : 0,
  };
}

function applyActBaseline(
  atk: number,
  spd: number,
  act: number,
  week: 1 | 2 | 3
): { atk: number; spd: number } {
  let finalAtk = atk;
  let finalSpd = spd;

  if (act === 2) {
    // Act 3 (A+)
    finalAtk += week === 3 ? 2 : 1;
  } else if (act >= 3) {
    // Act 4 (B+)
    finalAtk += week === 3 ? 2 : 1;
    finalSpd += 1;
    if (week !== 3) {
      finalSpd = Math.min(finalSpd, 3);
    }
  }

  return { atk: finalAtk, spd: finalSpd };
}

export interface ScaledBossStats {
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
}

/**
 * Scale boss stats based on campaign level and week.
 * Mirrors `scale_boss()` in boss-system/scaling.rs.
 */
export function scaleBossStats(
  baseStats: { hp: number; atk: number; arm: number; spd: number; dig: number },
  campaignLevel: number,
  week: 1 | 2 | 3
): ScaledBossStats {
  const act = calculateAct(campaignLevel);
  const stageInAct = calculateStageInAct(campaignLevel);
  const tier = calculateTier(stageInAct);

  let scaled: { hp: number; arm: number; atkBonus: number };
  switch (week) {
    case 1:
      scaled = scaleWeek1Stats(baseStats.hp, baseStats.arm, tier);
      break;
    case 2:
      scaled = scaleWeek2Stats(baseStats.hp, baseStats.arm, tier);
      break;
    case 3:
      scaled = scaleWeek3Stats(baseStats.hp, baseStats.arm, tier);
      break;
  }

  const scaledAtk = baseStats.atk + scaled.atkBonus;
  const { atk: finalAtk, spd: finalSpd } = applyActBaseline(scaledAtk, baseStats.spd, act, week);

  return {
    hp: scaled.hp,
    atk: finalAtk,
    arm: scaled.arm,
    spd: finalSpd,
    dig: baseStats.dig,
  };
}
