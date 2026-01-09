/**
 * Wall break helpers for DIG stat.
 * @see specs/002-qol-balance-batch/contracts/wall-break.md
 */

/**
 * Calculate the move cost to break a wall based on DIG stat.
 */
export function calculateWallBreakCost(dig: number): number | null {
  if (dig < 1) {
    return null;
  }

  return Math.max(1, 4 - dig);
}
