# Contract: Enemy Gold Rewards

**Feature**: 002-qol-balance-batch
**Component**: Combat Gold Rewards
**Priority**: P3

## Overview

Defeating enemies awards gold based on enemy type and tier. Rewards are displayed in the combat result screen and added to player's gold total.

## Interface Contract

### Gold Reward Calculation

```typescript
// src/game/entities/enemies.ts

/**
 * Enemy category for gold reward classification.
 */
export type EnemyCategory = 'BASIC' | 'MID' | 'STRONG';

/**
 * Base gold by category (tier 1 reward).
 */
export const ENEMY_BASE_GOLD: Record<EnemyCategory, number> = {
  BASIC: 1,
  MID: 2,
  STRONG: 3,
};

/**
 * Enemy type to category mapping.
 */
export const ENEMY_CATEGORIES: Record<EnemyId, EnemyCategory> = {
  TUNNEL_RAT: 'BASIC',
  CAVE_BAT: 'BASIC',
  SPORE_SLIME: 'BASIC',
  RUST_MITE_SWARM: 'BASIC',
  COLLAPSED_MINER: 'MID',
  SHARD_BEETLE: 'MID',
  TUNNEL_WARDEN: 'STRONG',
  BURROW_AMBUSHER: 'STRONG',
};

/**
 * Calculate gold reward for defeating an enemy.
 *
 * Formula: baseGold + (tier - 1)
 *
 * @param enemyId - Enemy definition ID
 * @param tier - Enemy tier (1, 2, or 3)
 * @returns Gold amount to award
 *
 * @example
 * calculateGoldReward('TUNNEL_RAT', 1) // => 1
 * calculateGoldReward('TUNNEL_RAT', 3) // => 3
 * calculateGoldReward('COLLAPSED_MINER', 2) // => 3
 * calculateGoldReward('TUNNEL_WARDEN', 3) // => 5
 */
export function calculateGoldReward(enemyId: EnemyId, tier: 1 | 2 | 3): number;
```

### Gold Reward Table

| Enemy Type | Category | T1 | T2 | T3 |
|------------|----------|----|----|----|
| Tunnel Rat | BASIC | 1 | 2 | 3 |
| Cave Bat | BASIC | 1 | 2 | 3 |
| Spore Slime | BASIC | 1 | 2 | 3 |
| Rust Mite Swarm | BASIC | 1 | 2 | 3 |
| Collapsed Miner | MID | 2 | 3 | 4 |
| Shard Beetle | MID | 2 | 3 | 4 |
| Tunnel Warden | STRONG | 3 | 4 | 5 |
| Burrow Ambusher | STRONG | 3 | 4 | 5 |

### Combat State Extension

```typescript
// src/game/engine/types.ts

export interface CombatState {
  // ... existing fields ...

  /** Gold reward for defeating this enemy (0 if player loses) */
  goldReward: number;

  /** Enemy definition ID (for display and logging) */
  enemyDefinitionId: EnemyId;

  /** Enemy tier (for display and logging) */
  enemyTier: 1 | 2 | 3;
}
```

### Combat Resolver Integration

```typescript
// src/game/combat/resolver.ts

/**
 * createCombatState modifications:
 *
 * Add goldReward calculation when creating combat state.
 * goldReward is calculated upfront but only awarded on VICTORY.
 */
export function createCombatState(params: {
  player: CombatantState;
  enemy: CombatantState;
  seed: number;
  enemyDefinitionId: EnemyId;
  enemyTier: 1 | 2 | 3;
  playerGold: number;
}): CombatState;

/**
 * Combat log entry for gold reward.
 */
export interface GoldRewardLogEntry {
  type: 'GOLD_REWARD';
  amount: number;
  totalGold: number;  // After adding reward
}
```

### Game Reducer Integration

```typescript
// src/game/engine/game-reducer.ts

/**
 * handleResolveCombat modifications:
 *
 * On VICTORY:
 * 1. Add goldReward to player.stats.gold
 * 2. Log gold reward in combat log
 *
 * On DEFEAT:
 * - No gold awarded (goldReward ignored)
 */
```

## UI Contract

### Combat Result Display

```typescript
// src/components/combat/CombatResult.tsx

interface CombatResultProps {
  /** Combat result (VICTORY or DEFEAT) */
  result: CombatResult;
  /** Final player HP */
  playerHp: number;
  /** Gold rewarded (only shown on VICTORY) */
  goldReward?: number;
  /** Handler to continue */
  onContinue: () => void;
}

/**
 * Combat result screen with gold reward display.
 *
 * VICTORY Layout:
 * ┌─────────────────────────────┐
 * │         VICTORY!            │
 * │                             │
 * │      ⚔️ Enemy Defeated      │
 * │                             │
 * │      💰 +3 Gold             │
 * │                             │
 * │      [Continue]             │
 * └─────────────────────────────┘
 *
 * DEFEAT Layout:
 * ┌─────────────────────────────┐
 * │          DEFEAT             │
 * │                             │
 * │      💀 You were slain      │
 * │                             │
 * │      [Return to Menu]       │
 * └─────────────────────────────┘
 */
```

### Gold Display Animation

```typescript
/**
 * Gold reward animation sequence:
 *
 * 1. Result text appears (VICTORY!)
 * 2. Short delay (300ms)
 * 3. Gold icon and amount animate in
 * 4. Gold counter increments from 0 to reward amount
 * 5. Total gold briefly flashes in corner
 */
```

### TopBar Gold Display

```typescript
// src/components/game/TopBar.tsx

/**
 * Existing gold display should update immediately
 * after combat victory when returning to exploration.
 *
 * No animation required - just reflect new total.
 */
```

## Behavior Specification

### Reward Timing

```
1. Combat resolves (pre-calculated, deterministic)
2. Animation plays through combat log
3. Result screen shows with gold reward
4. Player taps Continue
5. Gold added to player.stats.gold
6. Return to exploration with updated gold
```

### Edge Cases

1. **Player defeats boss**: Bosses may have separate reward table (out of scope for this feature)
2. **Player already has max gold**: Gold still awarded, capped at max if applicable
3. **Combat speed affects display**: Animation timing adjusts, reward amount unchanged
4. **Flee/escape**: Not implemented (combat is always to completion)

## Test Cases

```typescript
describe('Enemy Gold Rewards', () => {
  describe('Reward Calculation', () => {
    describe('BASIC enemies (base 1)', () => {
      const basicEnemies: EnemyId[] = [
        'TUNNEL_RAT',
        'CAVE_BAT',
        'SPORE_SLIME',
        'RUST_MITE_SWARM',
      ];

      basicEnemies.forEach(enemyId => {
        it(`${enemyId} T1 = 1 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(1);
        });

        it(`${enemyId} T2 = 2 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(2);
        });

        it(`${enemyId} T3 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(3);
        });
      });
    });

    describe('MID enemies (base 2)', () => {
      const midEnemies: EnemyId[] = ['COLLAPSED_MINER', 'SHARD_BEETLE'];

      midEnemies.forEach(enemyId => {
        it(`${enemyId} T1 = 2 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(2);
        });

        it(`${enemyId} T2 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(3);
        });

        it(`${enemyId} T3 = 4 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(4);
        });
      });
    });

    describe('STRONG enemies (base 3)', () => {
      const strongEnemies: EnemyId[] = ['TUNNEL_WARDEN', 'BURROW_AMBUSHER'];

      strongEnemies.forEach(enemyId => {
        it(`${enemyId} T1 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(3);
        });

        it(`${enemyId} T2 = 4 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(4);
        });

        it(`${enemyId} T3 = 5 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(5);
        });
      });
    });
  });

  describe('Combat Integration', () => {
    it('includes goldReward in combat state', () => {
      const combat = createCombatState({
        player: createTestPlayer(),
        enemy: createTestEnemy(),
        seed: 12345,
        enemyDefinitionId: 'TUNNEL_RAT',
        enemyTier: 2,
        playerGold: 10,
      });

      expect(combat.goldReward).toBe(2);
      expect(combat.enemyDefinitionId).toBe('TUNNEL_RAT');
      expect(combat.enemyTier).toBe(2);
    });

    it('adds gold to player on victory', () => {
      const state = createCombatState({
        /* player wins scenario */
        enemyDefinitionId: 'SHARD_BEETLE',
        enemyTier: 3,
        playerGold: 10,
      });

      const result = gameReducer(
        { ...testState, combat: state },
        { type: 'RESOLVE_COMBAT', result: 'VICTORY' }
      );

      expect(result.player.stats.gold).toBe(14); // 10 + 4
    });

    it('does not add gold on defeat', () => {
      const state = createCombatState({
        /* player loses scenario */
        enemyDefinitionId: 'TUNNEL_WARDEN',
        enemyTier: 3,
        playerGold: 10,
      });

      const result = gameReducer(
        { ...testState, combat: state },
        { type: 'RESOLVE_COMBAT', result: 'DEFEAT' }
      );

      expect(result.player.stats.gold).toBe(10); // Unchanged
    });
  });

  describe('Determinism', () => {
    it('produces same reward for same enemy/tier', () => {
      const reward1 = calculateGoldReward('CAVE_BAT', 2);
      const reward2 = calculateGoldReward('CAVE_BAT', 2);
      expect(reward1).toBe(reward2);
    });

    it('reward is independent of combat seed', () => {
      const combat1 = createCombatState({
        ...testParams,
        seed: 11111,
        enemyDefinitionId: 'SPORE_SLIME',
        enemyTier: 1,
      });

      const combat2 = createCombatState({
        ...testParams,
        seed: 99999,
        enemyDefinitionId: 'SPORE_SLIME',
        enemyTier: 1,
      });

      expect(combat1.goldReward).toBe(combat2.goldReward);
    });
  });
});
```

## Combat Log Integration

```typescript
/**
 * Combat log should include gold reward entry on victory.
 *
 * Example log ending:
 * [
 *   { type: 'ATTACK', actor: 'Player', damage: 5, targetHp: 0 },
 *   { type: 'DEATH', actor: 'Enemy' },
 *   { type: 'BATTLE_END', result: 'VICTORY' },
 *   { type: 'GOLD_REWARD', amount: 3, totalGold: 15 }
 * ]
 */
```
