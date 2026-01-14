# Research: GDD Mechanics Update

**Feature**: 003-gdd-mechanics-update
**Date**: 2026-01-13
**Status**: Complete

## Research Topics

### 1. Image Loading Performance for Skia Canvas

**Decision**: Use `useImage` hook with preloading at app startup, combined with image atlas for frequently rendered entities.

**Rationale**:
- `@shopify/react-native-skia` provides `useImage` hook that returns `SkImage` for efficient rendering
- Images are cached automatically by Skia once loaded
- Preloading at startup avoids frame drops during gameplay
- Single image per entity type is sufficient (no animation frames needed)

**Alternatives Considered**:
- **Runtime loading**: Rejected due to potential frame drops when entities first appear
- **Sprite sheets**: Considered but unnecessary complexity since entities don't animate
- **React Native Image component**: Not compatible with Skia Canvas rendering

**Implementation Pattern**:
```typescript
// Preload images at app startup
const enemyImages = {
  'TUNNEL_RAT': useImage(require('@/assets/field-enemies/tunnel-rat.png')),
  // ...
};

// In render, draw directly
<Image image={enemyImages[enemy.type]} x={x} y={y} width={40} height={40} />
```

### 2. Bleed Status Effect Implementation

**Decision**: Implement Bleed following the same pattern as existing status effects (Chill, Shrapnel, Rust).

**Rationale**:
- Existing `StatusEffects` interface in `status-effects.ts` already supports stack-based effects
- Turn-end processing already exists in `processStatusEffectsTurnEnd()`
- Adding Bleed requires only:
  1. Add `bleed: number` to `StatusEffects` interface
  2. Add Bleed processing to turn-end function
  3. Add visual display (emoji: 🩸, color: #dc2626 red)

**GDD Specification**:
- At end of turn: take damage equal to Bleed stacks
- Remove 1 Bleed stack at end of turn
- Bleed damage is non-weapon (ignores armor)

**Comparison with existing effects**:
| Effect | Turn Start | On Strike | Turn End |
|--------|------------|-----------|----------|
| Chill | Reduce strikes | - | -1 stack |
| Shrapnel | - | Reflect damage | Clear all |
| Rust | - | - | -ARM (persists) |
| Bleed | - | - | Take damage, -1 stack |

### 3. Item Tier Scaling Pattern

**Decision**: Use tiered numeric arrays in item definitions: `[tierI, tierII, tierIII]`.

**Rationale**:
- GDD uses `I/II/III` notation for all scaled values (e.g., `+1/2/3 ATK`)
- Single source of truth: definition includes all tier values
- Runtime resolution: `value = definition.values[tier - 1]`
- Matches existing rarity multiplier pattern in `gear.ts`

**Implementation Pattern**:
```typescript
interface ItemDefinition {
  id: ItemId;
  name: string;
  tier: 1 | 2 | 3;
  baseStats: {
    atk?: [number, number, number];  // Tier I/II/III values
    arm?: [number, number, number];
    hp?: [number, number, number];
    // ...
  };
}

// Usage
const atk = item.baseStats.atk?.[item.tier - 1] ?? 0;
```

### 4. Enemy Trait System Architecture

**Decision**: Implement enemy traits as pure functions in the combat resolver, triggered at specific combat phases.

**Rationale**:
- Matches existing boss trait implementation pattern
- Traits are deterministic (no side effects)
- Each trait specifies its trigger timing (BATTLE_START, ON_HIT, TURN_START, etc.)
- Allows for composition (enemy can have multiple trait effects)

**GDD Enemy Traits to Implement**:
| Enemy | Trait | Trigger |
|-------|-------|---------|
| Tunnel Rat | Steal 1 Gold | ON_HIT (once/turn) |
| Cave Bat | Restore 1 HP | EVERY_OTHER_TURN |
| Spore Slime | Apply 2 Chill | BATTLE_START |
| Rust Mite Swarm | Apply 1 Rust | ON_HIT (once/turn) |
| Collapsed Miner | +3 ATK when Wounded | WOUNDED_TRIGGER |
| Shard Beetle | Gain 6 Shrapnel | BATTLE_START |
| Tunnel Warden | Remove 3 Armor first strike | FIRST_STRIKE |
| Burrow Ambusher | Deal 3 true damage | BATTLE_START |
| Frost Wisp | Apply 2 Chill if acts first | FIRST_TURN |
| Powder Tick | Countdown(2): Deal 6 damage | COUNTDOWN |
| Coin Slug | Gain Armor from player gold | BATTLE_START |
| Blood Mosquito | Apply 1 Bleed | ON_HIT (once/turn) |

### 5. Boss Selection Without Campaign System

**Decision**: Use weighted random selection from boss pools, respecting week assignments.

**Rationale**:
- GDD assigns bosses to weeks (Week 1, Week 2, Week 3)
- Without campaign/act system, randomly select from the pool for each week
- Week 3 finals alternate or randomize between the two options per biome
- Store selected boss weaknesses for loot weighting

**Implementation**:
```typescript
function selectBossForWeek(week: 1 | 2 | 3, rng: SeededRNG): BossDefinition {
  const pool = BOSSES.filter(b => b.week === week);
  return pool[rng.nextInt(0, pool.length - 1)];
}
```

### 6. POI Loot Weighting by Boss Weakness

**Decision**: Implement tag weighting at item generation time using boss weakness tags.

**Rationale**:
- GDD specifies 1.4x weight for boss weakness tags vs 1.0 base
- Current week's boss weaknesses are known at POI interaction time
- Apply weighting before random selection, not after

**Implementation Pattern**:
```typescript
function generateItemOffer(
  rng: SeededRNG,
  rarityPool: ItemRarity[],
  weaknessTags: ItemTag[]
): ItemDefinition[] {
  // 1. Get all items matching rarity pool
  // 2. Calculate weighted probabilities (1.4x for weakness tags)
  // 3. Sample using weighted random selection
}
```

### 7. Removing Entity Border Squares

**Decision**: Remove fill and stroke from entity rendering, display only the image.

**Rationale**:
- Current implementation draws colored background squares behind emojis
- With images, the sprite contains all visual information
- Remove `<RoundedRect>` background elements from entity rendering
- Keep fog-of-war overlay separate (applies to tiles, not entities)

**Before**:
```typescript
<Group>
  <RoundedRect x={x} y={y} width={40} height={40} r={4} color={fillColor} />
  <Text text={emoji} x={textX} y={textY} />
</Group>
```

**After**:
```typescript
<Image image={entityImage} x={x} y={y} width={40} height={40} />
```

### 8. Itemset Detection Pattern

**Decision**: Check equipped items against itemset requirements at combat start.

**Rationale**:
- Itemsets activate when all required items are equipped
- Check once at BATTLE_START phase, cache result for combat duration
- Store active itemset IDs for effect application during combat

**Implementation**:
```typescript
function getActiveItemsets(equippedIds: ItemId[]): ItemsetId[] {
  return ITEMSETS.filter(set =>
    set.requiredItems.every(id => equippedIds.includes(id))
  ).map(set => set.id);
}
```

## Resolved Clarifications

| Topic | Resolution | Source |
|-------|------------|--------|
| Enemy tier distribution | T1: 50%, T2: 35%, T3: 15% (flat, no act progression) | Spec assumption |
| Boss selection method | Random from week pool | Design decision |
| Image asset format | PNG files already exist in assets/ | Codebase exploration |
| Existing status effects | Chill, Shrapnel, Rust implemented | Code review |
| Combat log format | Structured with turn/actor/action/result | Code review |

## Dependencies Identified

| Dependency | Version | Purpose |
|------------|---------|---------|
| @shopify/react-native-skia | 2.2.12 | Canvas rendering, image loading |
| jest | existing | Unit testing |
| typescript | 5.x | Type definitions |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Image loading performance | Medium | High | Preload at startup, measure on device |
| Combat resolver complexity | Low | Medium | Maintain existing patterns, comprehensive tests |
| Data entry errors (80 items) | Medium | Low | Automated validation tests |
| Boss balance issues | Low | Low | Out of scope (no act modifiers) |

## Next Steps

1. Create data-model.md with entity type definitions
2. Create quickstart.md with development setup
3. Proceed to /speckit.tasks for task generation
