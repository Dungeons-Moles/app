/**
 * T116-T119: Dig Mechanics Tests
 * Verifies dig cost calculation based on DIG stat.
 */

import { calculateDigCost } from '../../../src/game/map/dig';

describe('Dig Mechanics', () => {
  // ============================================================================
  // T116: dig cost = 5 moves when DIG = 1
  // ============================================================================
  it('T116: dig cost = 5 moves when DIG = 1', () => {
    // max(2, 6 - 1) = 5
    expect(calculateDigCost(1)).toBe(5);
  });

  // ============================================================================
  // T117: dig cost = 2 moves when DIG = 4
  // ============================================================================
  it('T117: dig cost = 2 moves when DIG = 4', () => {
    // max(2, 6 - 4) = 2
    expect(calculateDigCost(4)).toBe(2);
  });

  // ============================================================================
  // T118: dig cost = 2 moves when DIG = 6 (minimum floor)
  // ============================================================================
  it('T118: dig cost = 2 moves when DIG = 6 (minimum floor)', () => {
    // max(2, 6 - 6) = 0 -> clamped to 2
    expect(calculateDigCost(6)).toBe(2);
  });

  it('dig cost = 2 moves when DIG = 10', () => {
    // max(2, 6 - 10) = -4 -> clamped to 2
    expect(calculateDigCost(10)).toBe(2);
  });

  it('returns null if DIG < 1', () => {
    expect(calculateDigCost(0)).toBeNull();
  });
});
