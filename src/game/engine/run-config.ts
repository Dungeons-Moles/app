import type { BossId, BossSelectionMode, GuestDifficultyId } from './types';
import { BOSS_POOLS, getActForCampaignLevel } from './constants';
import type { SeededRNG } from './rng';
import { selectWeekBossForLevel } from '../time/progression';

export interface GuestDifficultyConfig {
  id: GuestDifficultyId;
  label: string;
  campaignLevel: number;
}

export const GUEST_DIFFICULTY_CONFIGS: Record<GuestDifficultyId, GuestDifficultyConfig> = {
  easy: { id: 'easy', label: 'Easy', campaignLevel: 1 },
  medium: { id: 'medium', label: 'Medium', campaignLevel: 19 },
  hard: { id: 'hard', label: 'Hard', campaignLevel: 40 },
};

export function selectBossForRun(
  week: 1 | 2 | 3,
  campaignLevel: number,
  bossSelectionMode: BossSelectionMode,
  rng: SeededRNG
): BossId {
  if (bossSelectionMode === 'campaign') {
    return selectWeekBossForLevel(campaignLevel, week);
  }

  return rng.pick(BOSS_POOLS[week]);
}

export function getBiomeForCampaignLevel(campaignLevel: number): 'A' | 'B' {
  const act = getActForCampaignLevel(campaignLevel);
  return act % 2 === 1 ? 'A' : 'B';
}
