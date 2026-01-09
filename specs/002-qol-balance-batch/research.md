# Research: QoL and Balance Feature Batch

**Feature**: 002-qol-balance-batch
**Date**: 2026-01-09
**Status**: Complete

## R1: Map Overview Camera Implementation

### Context
Players need to view discovered areas of the map without affecting game state. The current implementation centers the camera on the player position.

### Options Considered

1. **Camera/View Layer Pattern** (SELECTED)
   - Add `overviewMode` and `cameraOffset` to UI context (not GameState)
   - Apply Skia transform matrix for zoom/pan
   - Pros: Zero impact on deterministic game state, clean separation
   - Cons: Requires gesture handling in canvas

2. **Separate Overview Screen**
   - Navigate to dedicated screen showing full map
   - Pros: Complete isolation
   - Cons: Breaks immersion, slower access, loses current view context

3. **In-GameState Camera**
   - Add camera position to GameState
   - Pros: Simpler state management
   - Cons: Violates determinism principle (camera affects replay), bloats save state

### Decision
Option 1: Camera/View Layer Pattern. The Skia canvas already supports transforms. We'll add `overviewMode: boolean` and `cameraOffset: {x: number, y: number}` to `GameContext` (UI-only state), not `GameState`.

### Implementation Notes
- Toggle via map icon in TopBar (left of day/night bar)
- Zoom out to 0.5x scale (configurable)
- Pan via drag gestures using `react-native-gesture-handler`
- Exit on second tap or any game action attempt
- All game inputs disabled while `overviewMode === true`

---

## R2: Combat Speed Animation Multiplier

### Context
Combat in Dungeons & Moles is auto-battling. Players want to control pacing: pause to observe, speed up to reduce waiting.

### Existing Architecture Analysis
From `src/game/combat/resolver.ts`:
- `createCombatState()` initializes combat
- `stepCombat()` advances one combat step
- Combat is fully deterministic given initial state + seed
- `CombatContext` manages UI state and animates through combat log

The combat log entries are pre-generated. Animation is purely presentational.

### Options Considered

1. **Animation Timing Multiplier** (SELECTED)
   - Add `speedMultiplier: 0 | 1 | 2` to CombatContext
   - Multiply animation interval: `baseInterval / speedMultiplier`
   - `0` = paused (no interval advancement)
   - Pros: No game logic changes, trivial implementation
   - Cons: None significant

2. **Replay Speed in GameState**
   - Store speed setting in GameState
   - Pros: Persists with game state
   - Cons: Violates determinism (speed shouldn't affect save state)

### Decision
Option 1: Animation Timing Multiplier in CombatContext.

### Implementation Notes
- Base animation interval: 500ms (from existing code)
- Fast speed: 250ms (2x multiplier)
- Paused: No animation advancement
- UI: Three button controls (pause ⏸, play ▶, fast ⏩)
- State machine: `paused` | `playing` | `fast`

---

## R3: Wall Break Double-Tap State Machine

### Context
Players with DIG stat want to break walls. Requires two-step confirmation to prevent accidental breaks. Cost = max(1, 4 - DIG).

### Existing Architecture Analysis
From `src/game/engine/game-reducer.ts`:
- `handleMove()` checks `TileType.Wall` and returns unchanged state
- Input flows through centralized handler (Direction enum)
- `GameState` already has typed state for various interactions

### State Machine Design

```
States: IDLE | HIGHLIGHTING
Transitions:
  IDLE + tap_toward_wall (DIG >= 1) → HIGHLIGHTING
  IDLE + tap_toward_wall (DIG == 0) → IDLE (show "DIG required" feedback)
  HIGHLIGHTING + tap_same_direction → IDLE (execute break)
  HIGHLIGHTING + tap_different_direction → IDLE (cancel)
  HIGHLIGHTING + any_other_action → IDLE (cancel)
```

### Decision
Add `WallHighlightState` to `GameState`:

```typescript
export type WallHighlightState = {
  targetPosition: Position;
  direction: Direction;
  cost: number;
} | null;
```

New actions:
- `HIGHLIGHT_WALL`: First tap toward wall
- `BREAK_WALL`: Second tap same direction
- `CANCEL_WALL_HIGHLIGHT`: Any other action

### Implementation Notes
- Wall break cost formula: `Math.max(1, 4 - playerDig)`
- DIG 0: Cannot break (show feedback, no highlight)
- DIG 1: Cost 3 moves
- DIG 2: Cost 2 moves
- DIG 3+: Cost 1 move (minimum)
- Convert `TileType.Wall` → `TileType.Floor` on break
- Deduct cost from `time.movesRemaining`
- Visual: Highlight overlay on target wall tile, cost display

---

## R4: Enemy Spawn Placement Zones

### Context
New players shouldn't face overwhelming enemies immediately. Difficulty should scale with distance from spawn.

### Existing Architecture Analysis
From `src/game/map/generator.ts`:
- `placeEnemies()` handles enemy placement
- Already has 5-tile exclusion zone from player spawn
- Enemy tiers defined in `types.ts`: `tier: 1 | 2 | 3`
- Uses seeded RNG for determinism

### Zone-Based Algorithm

```
Zone 0 (0-5 tiles from spawn): T1 enemies only, reduced count
Zone 1 (6-10 tiles): T1 and T2 enemies
Zone 2 (11+ tiles): All tiers (T1, T2, T3)
```

Manhattan distance: `|x1 - x2| + |y1 - y2|`

### Decision
Modify `placeEnemies()` to:
1. Calculate distance from spawn for candidate positions
2. Filter tier selection based on zone
3. Maintain overall enemy count targets

### Implementation Notes
- Protected radius constant: `SPAWN_PROTECTION_RADIUS = 5`
- Mid zone: `MID_ZONE_RADIUS = 10`
- Tier weights per zone (adjustable):
  - Zone 0: [1.0, 0.0, 0.0] (100% T1)
  - Zone 1: [0.6, 0.4, 0.0] (60% T1, 40% T2)
  - Zone 2: [0.3, 0.4, 0.3] (30% T1, 40% T2, 30% T3)
- Test with 100+ seeds to verify compliance

---

## R5: Fast Travel via Rail Waypoints

### Context
Players who discover multiple Rail Waypoints (L8) want to teleport between them.

### Existing Architecture Analysis
From `src/game/entities/pois.ts` and `src/game/map/types.ts`:
- `MapPOI` has `discovered: boolean` field
- `definitionId: 'L8'` identifies Rail Waypoints
- POIs tracked in `GameMap.pois[]`

### Fast Travel State

```typescript
export type FastTravelState = {
  active: boolean;
  selectedIndex: number;
} | null;
```

The discovered waypoints are derived from `map.pois.filter(p => p.definitionId === 'L8' && p.discovered)`.

### Decision
Add `fastTravel: FastTravelState` to `GameState`. New actions:
- `ACTIVATE_FAST_TRAVEL`: Enter fast travel mode (requires 2+ discovered waypoints)
- `CYCLE_FAST_TRAVEL`: Move selection to next waypoint
- `CONFIRM_FAST_TRAVEL`: Teleport to selected waypoint
- `CANCEL_FAST_TRAVEL`: Exit without teleporting

### Implementation Notes
- Only available during `GamePhase.Exploration`
- Player position updated directly (no pathfinding)
- No time cost (per spec FR-030)
- Visual: Highlight discovered waypoints on map, selection indicator
- Access via: dedicated control button OR interaction with any discovered L8

---

## R6: POI UI Text Simplification

### Context
Item selection UI shows verbose names. Mobile screens need scannable stat-focused display.

### Existing Architecture Analysis
From POI interaction screens:
- Items displayed with full names
- Rarity indicated by color
- Stats shown alongside names

### Simplified Display Format

Current: "Miner's Gloves (Common) - +1 ATK"
Simplified: "+1 ATK" with Common rarity background color

### Decision
Modify POI option rendering:
1. Primary display: Stat bonuses only ("+1 ATK", "+2 ARM +1 SPD")
2. Rarity: Background color strip or icon
3. Full name: Available on long-press tooltip

### Implementation Notes
- Affects: Supply Cache (L2), Tool Crate (L3), Tool Oil Rack (L4), Geode Vault (L12)
- Stat format: "+N STAT" for each non-zero bonus
- Multiple stats: "+1 ATK +1 ARM" (space-separated)
- Rarity colors (existing system):
  - Common: gray
  - Uncommon: green
  - Rare: blue
  - Epic: purple
- Long-press tooltip shows full item name and description

---

## R7: Enemy Gold Reward Table

### Context
Defeating enemies should award gold based on type and tier.

### Existing Architecture Analysis
From `src/game/combat/resolver.ts`:
- Combat resolves to `CombatResult: 'VICTORY' | 'DEFEAT'`
- `CombatState` tracks combatants and result
- Player gold managed in `PlayerState.stats.gold`

### Gold Reward Table (from spec)

| Enemy Type | T1 | T2 | T3 |
|------------|----|----|----|
| Tunnel Rat | 1 | 2 | 3 |
| Cave Bat | 1 | 2 | 3 |
| Spore Slime | 1 | 2 | 3 |
| Rust Mite Swarm | 1 | 2 | 3 |
| Collapsed Miner | 2 | 3 | 4 |
| Shard Beetle | 2 | 3 | 4 |
| Tunnel Warden | 3 | 4 | 5 |
| Burrow Ambusher | 3 | 4 | 5 |

### Decision
Add `goldReward` field to `CombatState`. Calculate in combat initialization based on enemy data passed to combat. Apply reward in `handleResolveCombat` on VICTORY.

### Implementation Notes
- Enemy type groups:
  - Basic (base 1): TUNNEL_RAT, CAVE_BAT, SPORE_SLIME, RUST_MITE_SWARM
  - Mid (base 2): COLLAPSED_MINER, SHARD_BEETLE
  - Strong (base 3): TUNNEL_WARDEN, BURROW_AMBUSHER
- Formula: `baseGold + (tier - 1)` where tier ∈ {1, 2, 3}
- Display in CombatResult component with gold icon

---

## Implementation Dependencies

```
Map Overview ← (none)
Combat Speed ← (none)
Wall Break ← (none)
Spawn Balance ← (none)
Fast Travel ← Rail Waypoint discovery (already exists)
POI UI ← (none)
Gold Rewards ← Enemy tier in combat (already exists)
```

All features are independent and can be implemented in parallel.

## Test Coverage Matrix

| Feature | Unit Tests | Integration Tests |
|---------|-----------|-------------------|
| Map Overview | Camera state isolation | State unchanged during overview |
| Combat Speed | Animation timing math | Outcome determinism at all speeds |
| Wall Break | Cost calculation | Double-tap flow, tile conversion |
| Spawn Balance | Zone classification | 100-seed statistical verification |
| Fast Travel | Waypoint filtering | Teleport position update |
| POI UI | Stat string formatting | Rarity color mapping |
| Gold Rewards | Reward calculation | Post-combat gold update |
