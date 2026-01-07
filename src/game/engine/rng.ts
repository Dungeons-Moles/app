/**
 * Seeded Random Number Generator using Mulberry32 algorithm
 * @see specs/001-pve-dungeon-crawler/research.md R3
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md RNG Module
 *
 * Guarantees:
 * - Same seed always produces same sequence (deterministic)
 * - All game randomness flows through this class
 * - State can be saved/restored for replays and verification
 */

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // Convert to unsigned 32-bit
  }

  /**
   * Gets next random value in range [0, 1)
   * Uses Mulberry32 algorithm for good statistical properties
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Gets random integer in range [min, max] (inclusive)
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * Picks random element from array
   * @param array - Non-empty array to pick from
   * @returns Random element from array
   * @throws Error if array is empty
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffles array using Fisher-Yates algorithm
   * @param array - Array to shuffle
   * @returns New shuffled array (original unchanged)
   */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Gets current RNG state for saving/verification
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restores RNG state
   * @param state - State to restore
   */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}
