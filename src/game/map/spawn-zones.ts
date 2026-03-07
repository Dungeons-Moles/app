/**
 * Spawn zone helpers for enemy placement.
 * @see specs/002-qol-balance-batch/contracts/spawn-balance.md
 */

import { SeededRNG } from '../engine/rng';
import { MID_ZONE_RADIUS, SPAWN_PROTECTION_RADIUS, ZONE_TIER_WEIGHTS } from '../engine/constants';
import type { Position } from '../engine/types';

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function getSpawnZone(position: Position, spawnPosition: Position): 0 | 1 | 2 {
  const distance = manhattanDistance(position, spawnPosition);

  if (distance <= SPAWN_PROTECTION_RADIUS) {
    return 0;
  }

  if (distance <= MID_ZONE_RADIUS) {
    return 1;
  }

  return 2;
}

export function selectTierForZone(
  zone: 0 | 1 | 2,
  rng: SeededRNG,
  weightsOverride?: [number, number, number]
): 1 | 2 | 3 {
  const [tier1Weight, tier2Weight, tier3Weight] = weightsOverride ?? ZONE_TIER_WEIGHTS[zone];
  const totalWeight = tier1Weight + tier2Weight + tier3Weight;
  const roll = rng.next() * totalWeight;

  if (roll < tier1Weight) {
    return 1;
  }

  if (roll < tier1Weight + tier2Weight) {
    return 2;
  }

  return 3;
}
