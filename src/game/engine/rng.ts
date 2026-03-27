/**
 * SeededRNG - Deterministic random number generator
 * Uses a Linear Congruential Generator (LCG) for reproducible sequences
 * @see specs/001-pve-dungeon-crawler/plan.md - P04, P11
 */

/**
 * Constants for LCG (same as glibc)
 * These values produce a full period and good distribution
 */
const MULTIPLIER = 1103515245;
const INCREMENT = 12345;
const MODULUS = 0x80000000; // 2^31

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    // Ensure seed is a positive 32-bit integer
    this.state = Math.abs(Math.floor(seed)) % MODULUS;
  }

  /**
   * Get the current internal state (for saving/restoring)
   */
  getState(): number {
    return this.state;
  }

  /**
   * Restore from a saved state
   */
  setState(state: number): void {
    this.state = Math.abs(Math.floor(state)) % MODULUS;
  }

  /**
   * Generate next random number in [0, 1)
   */
  next(): number {
    // Math.imul keeps the multiplication in 32-bit integer range, avoiding
    // precision loss when state * MULTIPLIER exceeds 2^53 (JS safe integer limit).
    this.state = (Math.imul(this.state, MULTIPLIER) + INCREMENT) & 0x7fffffff;
    return this.state / MODULUS;
  }

  /**
   * Generate random integer in range [min, max] (inclusive)
   */
  nextInt(min: number, max: number): number {
    const range = max - min + 1;
    return Math.floor(this.next() * range) + min;
  }

  /**
   * Generate random boolean with given probability of true
   */
  nextBool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.nextInt(0, array.length - 1)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Create a new RNG with the same seed (for forking)
   */
  fork(): SeededRNG {
    return new SeededRNG(this.state);
  }
}
