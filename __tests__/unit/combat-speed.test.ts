/**
 * T025: Combat animation timing tests
 * Verifies speed settings map to expected animation intervals.
 */

import {
  COMBAT_ANIMATION_BASE_MS,
  COMBAT_SPEED_MULTIPLIER,
  getCombatAnimationIntervalMs,
} from '../../src/contexts/CombatContext';

describe('Combat Speed Controls', () => {
  describe('Animation Timing', () => {
    it('returns no interval when speed is paused', () => {
      expect(getCombatAnimationIntervalMs('paused')).toBeNull();
    });

    it('returns base interval for normal speed', () => {
      expect(getCombatAnimationIntervalMs('normal')).toBe(
        COMBAT_ANIMATION_BASE_MS / COMBAT_SPEED_MULTIPLIER.normal
      );
    });

    it('returns half interval for fast speed', () => {
      expect(getCombatAnimationIntervalMs('fast')).toBe(
        COMBAT_ANIMATION_BASE_MS / COMBAT_SPEED_MULTIPLIER.fast
      );
    });
  });
});
