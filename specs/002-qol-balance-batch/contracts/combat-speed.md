# Contract: Combat Time Controls

**Feature**: 002-qol-balance-batch
**Component**: Combat Speed Controls
**Priority**: P1

## Overview

Players can control combat animation pacing with pause, normal, and fast speed options. Speed settings affect only visual playback; combat outcomes remain deterministic.

## Interface Contract

### Combat Speed State

```typescript
// src/contexts/CombatContext.tsx

/**
 * Combat animation speed setting.
 */
export type CombatSpeed = 'paused' | 'normal' | 'fast';

/**
 * Animation interval multipliers.
 */
export const COMBAT_SPEED_CONFIG = {
  paused: { multiplier: 0, interval: Infinity },
  normal: { multiplier: 1, interval: 500 },  // 500ms per step
  fast: { multiplier: 2, interval: 250 },    // 250ms per step
} as const;

/**
 * CombatContext state extension.
 */
interface CombatContextState {
  // ... existing state ...

  /** Current animation speed setting */
  speed: CombatSpeed;

  /** Set animation speed */
  setSpeed: (speed: CombatSpeed) => void;
}
```

### Animation Control Hook

```typescript
// src/hooks/useCombatAnimation.ts

interface UseCombatAnimationOptions {
  /** Combat log entries to animate through */
  entries: CombatLogEntry[];
  /** Current animation speed */
  speed: CombatSpeed;
  /** Callback when animation advances */
  onStep: (index: number) => void;
  /** Callback when animation completes */
  onComplete: () => void;
}

/**
 * Hook managing combat animation timing.
 *
 * @returns Current entry index and control methods
 *
 * Behavior:
 * - speed='paused': No automatic advancement
 * - speed='normal': Advance every 500ms
 * - speed='fast': Advance every 250ms
 * - Speed changes take effect on next interval
 */
export function useCombatAnimation(options: UseCombatAnimationOptions): {
  currentIndex: number;
  isComplete: boolean;
};
```

## UI Contract

### Speed Control Bar

```typescript
// src/components/combat/SpeedControls.tsx

interface SpeedControlsProps {
  /** Current speed setting */
  currentSpeed: CombatSpeed;
  /** Speed change handler */
  onSpeedChange: (speed: CombatSpeed) => void;
  /** Whether controls are disabled (e.g., combat not started) */
  disabled?: boolean;
}

/**
 * Three-button control bar for combat speed.
 *
 * Layout: [ ⏸ ] [ ▶ ] [ ⏩ ]
 *
 * - Pause button (⏸): Freezes animation
 * - Play button (▶): Normal speed (1x)
 * - Fast button (⏩): Fast speed (2x)
 *
 * Active button highlighted with accent color.
 */
export function SpeedControls(props: SpeedControlsProps): JSX.Element;
```

### Integration with CombatScreen

```typescript
// src/components/combat/CombatScreen.tsx

/**
 * CombatScreen modifications:
 *
 * 1. Add SpeedControls below combat log area
 * 2. Use useCombatAnimation hook for timing
 * 3. Pass speed from CombatContext
 *
 * Speed controls visible throughout combat (BattleStart to BattleEnd).
 * Controls disabled during phase transitions or when combat complete.
 */
```

## Behavior Specification

### State Machine

```
                    ┌────────────────────────────────────┐
                    │                                    │
        ┌───────────▼──────────┐    tap play    ┌───────┴───────┐
        │       PAUSED         │ ◄────────────► │    PLAYING    │
        └──────────────────────┘                └───────────────┘
                    ▲                                    │
                    │ tap pause                          │ tap fast
                    │                                    ▼
                    │                           ┌───────────────┐
                    └───────────────────────────│     FAST      │
                              tap pause         └───────────────┘
```

### Determinism Guarantee

```typescript
/**
 * CRITICAL: Speed setting MUST NOT affect combat outcomes.
 *
 * The combat system pre-resolves all turns in resolveCombat().
 * Speed only controls how fast the UI animates through the
 * pre-computed CombatLogEntry[] array.
 *
 * Test verification:
 * 1. Run same combat at speed='normal'
 * 2. Run same combat at speed='fast'
 * 3. Assert identical CombatResult
 */
```

### Edge Cases

1. **Speed change mid-combat**: Takes effect on next animation tick
2. **Pause at battle end**: Combat result still shows (not blocked)
3. **Fast through entire battle**: Same outcome as normal speed
4. **Resume from pause**: Continues from exact paused state

## Test Cases

```typescript
describe('Combat Speed Controls', () => {
  describe('Animation Timing', () => {
    it('pauses animation when speed is paused', () => {
      const { result } = renderHook(() =>
        useCombatAnimation({
          entries: mockEntries,
          speed: 'paused',
          onStep: jest.fn(),
          onComplete: jest.fn(),
        })
      );

      jest.advanceTimersByTime(2000);
      expect(result.current.currentIndex).toBe(0);
    });

    it('advances at 500ms intervals for normal speed', () => {
      const onStep = jest.fn();
      renderHook(() =>
        useCombatAnimation({
          entries: mockEntries,
          speed: 'normal',
          onStep,
          onComplete: jest.fn(),
        })
      );

      jest.advanceTimersByTime(500);
      expect(onStep).toHaveBeenCalledWith(1);

      jest.advanceTimersByTime(500);
      expect(onStep).toHaveBeenCalledWith(2);
    });

    it('advances at 250ms intervals for fast speed', () => {
      const onStep = jest.fn();
      renderHook(() =>
        useCombatAnimation({
          entries: mockEntries,
          speed: 'fast',
          onStep,
          onComplete: jest.fn(),
        })
      );

      jest.advanceTimersByTime(250);
      expect(onStep).toHaveBeenCalledWith(1);
    });
  });

  describe('Determinism', () => {
    it('produces identical outcomes regardless of speed', () => {
      const seed = 12345;
      const player = createTestPlayer();
      const enemy = createTestEnemy();

      // Run at normal speed
      const result1 = resolveCombat({ player, enemy, seed });

      // Run at fast speed (same inputs)
      const result2 = resolveCombat({ player, enemy, seed });

      expect(result1.result).toBe(result2.result);
      expect(result1.player.hp).toBe(result2.player.hp);
      expect(result1.enemy.hp).toBe(result2.enemy.hp);
    });
  });
});
```

## Performance Considerations

- Animation intervals use `setInterval` with cleanup on unmount
- Speed changes do not cause re-renders of combat log
- Fast speed (250ms) maintains 60fps capability
- Paused state uses no CPU cycles for animation
