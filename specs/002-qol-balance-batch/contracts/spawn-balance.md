# Contract: Enemy Spawn Balance

**Feature**: 002-qol-balance-batch
**Component**: Spawn Placement Rules
**Priority**: P2

## Overview

Enemy spawn placement uses distance-based zones to ensure difficulty progression. No high-tier enemies spawn near the player's starting position.

## Interface Contract

### Spawn Zone Constants

```typescript
// src/game/engine/constants.ts

/**
 * Spawn zone radiuses (Manhattan distance from spawn point).
 */
export const SPAWN_ZONES = {
  /** Zone 0: Protected area, T1 only */
  PROTECTION_RADIUS: 5,
  /** Zone 1: Mid area, T1 + T2 */
  MID_ZONE_RADIUS: 10,
  /** Zone 2: Far area, all tiers (implicit, > MID_ZONE_RADIUS) */
} as const;

/**
 * Enemy tier weights by zone.
 * Weights are relative (will be normalized).
 * [T1 weight, T2 weight, T3 weight]
 */
export const ZONE_TIER_WEIGHTS: Record<0 | 1 | 2, [number, number, number]> = {
  0: [1.0, 0.0, 0.0],  // Zone 0: 100% T1
  1: [0.6, 0.4, 0.0],  // Zone 1: 60% T1, 40% T2
  2: [0.3, 0.4, 0.3],  // Zone 2: 30% T1, 40% T2, 30% T3
};
```

### Zone Calculation Functions

```typescript
// src/game/map/spawn-zones.ts

/**
 * Calculate Manhattan distance between two positions.
 *
 * @param a - First position
 * @param b - Second position
 * @returns Manhattan distance
 */
export function manhattanDistance(a: Position, b: Position): number;

/**
 * Determine spawn zone for a position.
 *
 * @param position - Candidate spawn position
 * @param spawnPosition - Player start position (Mole Den)
 * @returns Zone number (0, 1, or 2)
 *
 * @example
 * getSpawnZone({ x: 3, y: 2 }, { x: 0, y: 0 }) // => 0 (distance 5)
 * getSpawnZone({ x: 6, y: 2 }, { x: 0, y: 0 }) // => 1 (distance 8)
 * getSpawnZone({ x: 8, y: 5 }, { x: 0, y: 0 }) // => 2 (distance 13)
 */
export function getSpawnZone(position: Position, spawnPosition: Position): 0 | 1 | 2;

/**
 * Select enemy tier based on zone and RNG.
 *
 * @param zone - Spawn zone (0, 1, or 2)
 * @param rng - Seeded RNG instance
 * @returns Selected tier (1, 2, or 3)
 */
export function selectTierForZone(zone: 0 | 1 | 2, rng: SeededRNG): 1 | 2 | 3;

/**
 * Filter candidate positions by zone requirements.
 *
 * @param positions - All candidate floor positions
 * @param spawnPosition - Player start position
 * @param requiredTier - Tier of enemy to place
 * @returns Positions where this tier is allowed
 */
export function filterPositionsForTier(
  positions: Position[],
  spawnPosition: Position,
  requiredTier: 1 | 2 | 3
): Position[];
```

### Generator Integration

```typescript
// src/game/map/generator.ts

/**
 * Modified placeEnemies function.
 *
 * Changes from current implementation:
 * 1. Calculate zone for each candidate position
 * 2. For each enemy to place:
 *    a. Determine tier based on zone weights and RNG
 *    b. Filter positions to those allowing this tier
 *    c. Select random position from filtered set
 *    d. Place enemy with selected tier
 *
 * This ensures:
 * - No T2/T3 in Zone 0 (within 5 tiles of spawn)
 * - No T3 in Zone 1 (within 10 tiles of spawn)
 * - All tiers possible in Zone 2 (beyond 10 tiles)
 */
export function placeEnemies(
  map: GameMap,
  spawnPosition: Position,
  enemyCount: number,
  rng: SeededRNG
): MapEnemy[];
```

## Behavior Specification

### Zone Definition

```
Zone 0: distance <= 5 tiles
├── T1: 100%
├── T2: 0%
└── T3: 0%

Zone 1: 6 <= distance <= 10 tiles
├── T1: 60%
├── T2: 40%
└── T3: 0%

Zone 2: distance > 10 tiles
├── T1: 30%
├── T2: 40%
└── T3: 30%
```

### Placement Algorithm

```
1. Collect all valid floor positions (walkable, not spawn, not POI)
2. Partition positions into zones based on distance from spawn
3. For each enemy to place:
   a. Select zone with available positions (prefer distant zones)
   b. Roll tier using zone's weight distribution
   c. Select random position from zone
   d. Place enemy with tier and random type for tier
   e. Remove position from available set
4. Return placed enemies
```

### Determinism Requirement

```typescript
/**
 * CRITICAL: Spawn placement MUST be deterministic.
 *
 * Given same:
 * - Map layout (tiles)
 * - Spawn position
 * - Enemy count
 * - RNG seed
 *
 * MUST produce identical:
 * - Enemy positions
 * - Enemy tiers
 * - Enemy types
 */
```

## Test Cases

```typescript
describe('Spawn Balance', () => {
  describe('Zone Classification', () => {
    it('classifies positions within 5 tiles as Zone 0', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 10, y: 10 }, spawn)).toBe(0); // distance 0
      expect(getSpawnZone({ x: 12, y: 13 }, spawn)).toBe(0); // distance 5
      expect(getSpawnZone({ x: 15, y: 10 }, spawn)).toBe(0); // distance 5
    });

    it('classifies positions 6-10 tiles as Zone 1', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 16, y: 10 }, spawn)).toBe(1); // distance 6
      expect(getSpawnZone({ x: 15, y: 15 }, spawn)).toBe(1); // distance 10
    });

    it('classifies positions beyond 10 tiles as Zone 2', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 16, y: 15 }, spawn)).toBe(2); // distance 11
      expect(getSpawnZone({ x: 25, y: 20 }, spawn)).toBe(2); // distance 25
    });
  });

  describe('Tier Selection', () => {
    it('only selects T1 in Zone 0', () => {
      const rng = createSeededRNG(12345);
      for (let i = 0; i < 100; i++) {
        expect(selectTierForZone(0, rng)).toBe(1);
      }
    });

    it('never selects T3 in Zone 1', () => {
      const rng = createSeededRNG(12345);
      const tiers = Array.from({ length: 100 }, () => selectTierForZone(1, rng));
      expect(tiers.every(t => t === 1 || t === 2)).toBe(true);
      expect(tiers.some(t => t === 3)).toBe(false);
    });

    it('can select all tiers in Zone 2', () => {
      const rng = createSeededRNG(12345);
      const tiers = Array.from({ length: 1000 }, () => selectTierForZone(2, rng));
      expect(tiers.some(t => t === 1)).toBe(true);
      expect(tiers.some(t => t === 2)).toBe(true);
      expect(tiers.some(t => t === 3)).toBe(true);
    });
  });

  describe('Statistical Verification', () => {
    it('maintains zone constraints across 100 seeds', () => {
      for (let seed = 1; seed <= 100; seed++) {
        const map = generateMap({ seed, width: 50, height: 50 });
        const spawn = map.moleDenPosition;

        for (const enemy of map.enemies) {
          const zone = getSpawnZone(enemy.position, spawn);

          if (zone === 0) {
            expect(enemy.tier).toBe(1);
          } else if (zone === 1) {
            expect(enemy.tier).toBeLessThanOrEqual(2);
          }
          // Zone 2 allows all tiers
        }
      }
    });

    it('maintains approximate tier distribution in Zone 2', () => {
      const tierCounts = { 1: 0, 2: 0, 3: 0 };

      for (let seed = 1; seed <= 100; seed++) {
        const map = generateMap({ seed, width: 50, height: 50 });
        const spawn = map.moleDenPosition;

        for (const enemy of map.enemies) {
          const zone = getSpawnZone(enemy.position, spawn);
          if (zone === 2) {
            tierCounts[enemy.tier]++;
          }
        }
      }

      const total = tierCounts[1] + tierCounts[2] + tierCounts[3];
      const t1Ratio = tierCounts[1] / total;
      const t2Ratio = tierCounts[2] / total;
      const t3Ratio = tierCounts[3] / total;

      // Allow 10% tolerance from expected weights
      expect(t1Ratio).toBeGreaterThan(0.2);  // Expected 0.3
      expect(t1Ratio).toBeLessThan(0.4);
      expect(t2Ratio).toBeGreaterThan(0.3);  // Expected 0.4
      expect(t2Ratio).toBeLessThan(0.5);
      expect(t3Ratio).toBeGreaterThan(0.2);  // Expected 0.3
      expect(t3Ratio).toBeLessThan(0.4);
    });
  });

  describe('Determinism', () => {
    it('produces identical spawns with same seed', () => {
      const config = { seed: 42, width: 40, height: 40 };

      const map1 = generateMap(config);
      const map2 = generateMap(config);

      expect(map1.enemies.length).toBe(map2.enemies.length);

      for (let i = 0; i < map1.enemies.length; i++) {
        expect(map1.enemies[i].position).toEqual(map2.enemies[i].position);
        expect(map1.enemies[i].tier).toBe(map2.enemies[i].tier);
        expect(map1.enemies[i].definitionId).toBe(map2.enemies[i].definitionId);
      }
    });
  });
});
```
