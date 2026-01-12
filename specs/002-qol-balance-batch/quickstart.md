# Quickstart: QoL and Balance Feature Batch

**Feature**: 002-qol-balance-batch
**Date**: 2026-01-09

## Prerequisites

```bash
# Ensure you're on the feature branch
git checkout 002-qol-balance-batch

# Install dependencies
npm install

# Run type check to verify baseline
npm run typecheck

# Run existing tests
npm test
```

## Implementation Order

Implement in priority order. Each feature is independent and can be committed separately.

### P1 Features (Core UX)

#### 1. Map Overview Mode

**Files to modify:**
- `src/contexts/GameContext.tsx` - Add `overviewMode` state
- `src/components/game/TopBar.tsx` - Add map icon toggle
- `src/components/game/GameCanvas.tsx` - Add zoom/pan transforms
- `src/hooks/useInput.ts` - Block inputs during overview

**Key implementation:**
```typescript
// GameContext.tsx
const [overviewMode, setOverviewMode] = useState<OverviewModeState>({
  active: false,
  offset: { x: 0, y: 0 },
  zoom: 1.0,
});

const toggleOverviewMode = useCallback(() => {
  setOverviewMode(prev => ({
    active: !prev.active,
    offset: { x: 0, y: 0 },
    zoom: prev.active ? 1.0 : 0.5,
  }));
}, []);
```

**Test:**
```bash
npm test -- __tests__/integration/map-overview.test.ts
```

#### 2. Combat Speed Controls

**Files to modify:**
- `src/contexts/CombatContext.tsx` - Add `speed` state
- `src/components/combat/CombatScreen.tsx` - Add speed controls
- `src/components/combat/SpeedControls.tsx` - NEW component

**Key implementation:**
```typescript
// CombatContext.tsx
const [speed, setSpeed] = useState<CombatSpeed>('normal');

// Modify animation interval
const interval = speed === 'paused' ? null :
  speed === 'fast' ? 250 : 500;
```

**Test:**
```bash
npm test -- __tests__/unit/combat-determinism.test.ts
```

### P2 Features (Gameplay Depth)

#### 3. DIG Wall-Break Mechanic

**Files to create:**
- `src/game/map/wall-break.ts` - Cost calculation

**Files to modify:**
- `src/game/engine/types.ts` - Add `WallHighlightState`
- `src/game/engine/game-reducer.ts` - Add wall break actions
- `src/components/game/WallHighlight.tsx` - NEW overlay component

**Key implementation:**
```typescript
// wall-break.ts
export function calculateWallBreakCost(dig: number): number | null {
  if (dig < 1) return null;
  return Math.max(1, 4 - dig);
}

// game-reducer.ts - Add to handleMove
if (targetTile === TileType.Wall && state.wallHighlight?.direction === direction) {
  // Second tap - execute break
  return handleBreakWall(state);
} else if (targetTile === TileType.Wall && playerDig >= 1) {
  // First tap - highlight
  return handleHighlightWall(state, direction, targetPos);
}
```

**Test:**
```bash
npm test -- __tests__/unit/wall-break.test.ts
```

#### 4. Enemy Spawn Balance

**Files to create:**
- `src/game/map/spawn-zones.ts` - Zone calculation

**Files to modify:**
- `src/game/engine/constants.ts` - Add zone constants
- `src/game/map/generator.ts` - Modify `placeEnemies`

**Key implementation:**
```typescript
// spawn-zones.ts
export function getSpawnZone(pos: Position, spawn: Position): 0 | 1 | 2 {
  const dist = Math.abs(pos.x - spawn.x) + Math.abs(pos.y - spawn.y);
  if (dist <= 5) return 0;
  if (dist <= 10) return 1;
  return 2;
}

// generator.ts - Modify tier selection
const zone = getSpawnZone(position, spawnPosition);
const tier = selectTierForZone(zone, rng);
```

**Test:**
```bash
npm test -- __tests__/unit/spawn-balance.test.ts
```

#### 5. Fast Travel

**Files to modify:**
- `src/game/engine/types.ts` - Add `FastTravelState`
- `src/game/engine/game-reducer.ts` - Add fast travel actions
- `src/game/entities/pois.ts` - Add waypoint helpers
- `src/components/game/FastTravelOverlay.tsx` - NEW component

**Key implementation:**
```typescript
// pois.ts
export function getDiscoveredWaypoints(map: GameMap): MapPOI[] {
  return map.pois.filter(p => p.definitionId === 'L8' && p.discovered);
}

// game-reducer.ts
case 'CONFIRM_FAST_TRAVEL': {
  const waypoints = getDiscoveredWaypoints(state.map);
  const target = waypoints[state.fastTravel!.selectedIndex];
  return {
    ...state,
    player: { ...state.player, position: target.position },
    fastTravel: null,
  };
}
```

**Test:**
```bash
npm test -- __tests__/integration/fast-travel.test.ts
```

### P3 Features (Polish)

#### 6. POI UI Simplification

**Files to create:**
- `src/utils/stat-display.ts` - Stat formatting

**Files to modify:**
- `src/screens/POIInteractionScreen.tsx` - Update item display
- `src/components/poi/SimplifiedItemOption.tsx` - NEW component

**Key implementation:**
```typescript
// stat-display.ts
export function formatStatBonuses(stats: Record<string, number>): string {
  const order = ['hp', 'atk', 'arm', 'spd', 'dig'];
  return order
    .filter(stat => stats[stat] && stats[stat] !== 0)
    .map(stat => `+${stats[stat]} ${STAT_ABBREV[stat]}`)
    .join(' ');
}
```

#### 7. Enemy Gold Rewards

**Files to modify:**
- `src/game/entities/enemies.ts` - Add gold calculation
- `src/game/combat/resolver.ts` - Add `goldReward` to state
- `src/game/engine/game-reducer.ts` - Apply gold on victory
- `src/components/combat/CombatResult.tsx` - Display reward

**Key implementation:**
```typescript
// enemies.ts
export function calculateGoldReward(enemyId: EnemyId, tier: 1 | 2 | 3): number {
  const baseGold = ENEMY_BASE_GOLD[ENEMY_CATEGORIES[enemyId]];
  return baseGold + (tier - 1);
}

// resolver.ts - In createCombatState
goldReward: calculateGoldReward(params.enemyDefinitionId, params.enemyTier),
```

**Test:**
```bash
npm test -- __tests__/unit/gold-rewards.test.ts
```

## Running All Tests

```bash
# Run all new tests
npm test -- __tests__/unit/wall-break.test.ts \
            __tests__/unit/gold-rewards.test.ts \
            __tests__/unit/spawn-balance.test.ts \
            __tests__/unit/combat-determinism.test.ts \
            __tests__/integration/fast-travel.test.ts \
            __tests__/integration/map-overview.test.ts

# Run full test suite
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

## Manual Testing Checklist

### Map Overview
- [ ] Tap map icon → zooms out
- [ ] Pan around map with gestures
- [ ] Tap map icon again → zooms back to player
- [ ] Cannot move while in overview

### Combat Speed
- [ ] Pause button freezes combat
- [ ] Fast button speeds up animations
- [ ] Same enemy fight produces same result at all speeds

### Wall Break
- [ ] DIG 0 → shows "requires DIG" message
- [ ] DIG 1 → first tap highlights, shows "3 moves"
- [ ] DIG 3+ → first tap shows "1 move"
- [ ] Second tap same direction → breaks wall
- [ ] Different direction → cancels highlight

### Spawn Balance
- [ ] Start 10 runs → no T2/T3 within 5 tiles of start
- [ ] Enemies get harder further from spawn

### Fast Travel
- [ ] Need 2+ discovered waypoints to activate
- [ ] Cycling selects different waypoints
- [ ] Confirm teleports without time cost

### POI UI
- [ ] Supply Cache shows "+1 ATK" not item name
- [ ] Long press shows item tooltip
- [ ] Rarity colors visible

### Gold Rewards
- [ ] Defeat enemy → gold reward shown
- [ ] Gold total updates in TopBar
- [ ] T3 enemies give more than T1

## Common Issues

### Type Errors
```bash
# If types don't match, regenerate
npm run typecheck
```

### Test Failures
```bash
# Run specific test in watch mode
npm test -- --watch __tests__/unit/wall-break.test.ts
```

### Canvas Not Updating
- Ensure Skia transforms are applied correctly
- Check that zoom and offset are being passed to canvas

### State Not Persisting
- Verify state is in correct location (GameState vs UI context)
- Check reducer returns new object (immutability)
