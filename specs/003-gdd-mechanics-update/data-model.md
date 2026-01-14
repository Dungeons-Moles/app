# Data Model: GDD Mechanics Update

**Feature**: 003-gdd-mechanics-update
**Date**: 2026-01-13

## Entity Definitions

### Item (Gear/Tool)

Represents equipment that modifies player stats and provides combat effects.

```typescript
type ItemType = 'TOOL' | 'GEAR';
type ItemTag = 'STONE' | 'SCOUT' | 'GREED' | 'BLAST' | 'FROST' | 'RUST' | 'BLOOD' | 'TEMPO';
type ItemRarity = 'COMMON' | 'RARE' | 'HEROIC' | 'MYTHIC';
type ItemTier = 1 | 2 | 3;

interface ItemDefinition {
  id: ItemId;                    // e.g., "T-ST-01", "G-SC-02"
  name: string;                  // e.g., "Bulwark Shovel"
  type: ItemType;                // TOOL or GEAR
  tag: ItemTag;                  // Primary synergy tag
  rarity: ItemRarity;            // Drop rarity
  emoji: string;                 // Fallback display
  imagePath: string;             // Asset path for rendering

  // Tiered stats: [Tier I, Tier II, Tier III]
  stats: {
    atk?: [number, number, number];
    arm?: [number, number, number];
    hp?: [number, number, number];
    spd?: [number, number, number];
    dig?: [number, number, number];
  };

  // Optional effect
  effect?: {
    timing: EffectTiming;
    description: string;
    // Effect parameters vary by timing
    params?: Record<string, number | string>;
  };
}

// Effect timings from GDD
type EffectTiming =
  | 'BATTLE_START'
  | 'FIRST_TURN'
  | 'TURN_START'
  | 'EVERY_OTHER_TURN'
  | 'ON_HIT'           // Once per turn unless specified
  | 'WHEN_STRUCK'
  | 'TURN_END'
  | 'WOUNDED'          // HP < 50%
  | 'EXPOSED'          // ARM = 0
  | 'VICTORY'
  | 'DAY_START'
  | 'COUNTDOWN';       // Countdown(N) bombs
```

**Validation Rules**:
- ID must be unique across all items
- TOOL items: exactly 16 total (2 per tag)
- GEAR items: exactly 64 total (8 per tag)
- All tiered stat arrays must have exactly 3 values
- Effect timing must match GDD specification

### Enemy (Field Enemy)

Represents a field combatant with tiered stats and combat trait.

```typescript
type EnemyArchetype =
  | 'TUNNEL_RAT'
  | 'CAVE_BAT'
  | 'SPORE_SLIME'
  | 'RUST_MITE_SWARM'
  | 'COLLAPSED_MINER'
  | 'SHARD_BEETLE'
  | 'TUNNEL_WARDEN'
  | 'BURROW_AMBUSHER'
  | 'FROST_WISP'
  | 'POWDER_TICK'
  | 'COIN_SLUG'
  | 'BLOOD_MOSQUITO';

type EnemyTier = 1 | 2 | 3;

interface EnemyDefinition {
  archetype: EnemyArchetype;
  name: string;                  // e.g., "Tunnel Rat"
  emoji: string;                 // e.g., "🐀"
  imagePath: string;             // Asset path

  // Stats per tier: [T1, T2, T3]
  stats: {
    hp: [number, number, number];
    atk: [number, number, number];
    arm: [number, number, number];
    spd: [number, number, number];
    dig: [number, number, number];
  };

  // Gold reward per tier
  goldReward: [number, number, number];  // [T1=2, T2=4, T3=6]

  // Combat trait
  trait: {
    name: string;
    timing: EffectTiming;
    description: string;
    params?: Record<string, number>;
  };
}
```

**Validation Rules**:
- 12 archetypes total (no more, no less per P14)
- Each archetype has exactly 3 tiers
- Gold rewards: T1=2, T2=4, T3=6 (fixed)
- Image path must exist in assets/field-enemies/

### Boss

Represents a week-ending combatant with special abilities and weakness tags.

```typescript
type BossId = string;  // e.g., "B-A-W1-01"
type WeekNumber = 1 | 2 | 3;
type BiomeType = 'A' | 'B';

interface BossDefinition {
  id: BossId;
  name: string;                  // e.g., "The Broodmother"
  emoji: string;                 // e.g., "🕷️"
  imagePath: string;             // Asset path

  biome: BiomeType;
  week: WeekNumber;

  // Base stats (no tier scaling in this feature)
  stats: {
    hp: number;
    atk: number;
    arm: number;
    spd: number;
    dig: number;
  };

  // Weakness tags for loot weighting
  weaknessTags: [ItemTag, ItemTag];

  // Boss abilities (can have multiple)
  abilities: BossAbility[];
}

interface BossAbility {
  name: string;
  timing: EffectTiming;
  description: string;
  params?: Record<string, number | string>;
}
```

**Validation Rules**:
- Biome A: 5 Week 1, 5 Week 2, 2 Week 3 finals
- Biome B: Variants + 2 new Week 3 finals
- Each boss has exactly 2 weakness tags
- Image path must exist in assets/bosses/

### POI (Point of Interest)

Represents an interactable map location.

```typescript
type POIId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' |
             'L9' | 'L10' | 'L11' | 'L12' | 'L13' | 'L14';

type POIRarity = 'FIXED' | 'COMMON' | 'UNCOMMON' | 'RARE';

type POIInteractionType =
  | 'REST'              // L1, L5: Restore HP, skip to day
  | 'ITEM_SELECTION'    // L2, L3, L12, L13: Pick 1 of N items
  | 'TOOL_MODIFY'       // L4: +1 stat to tool
  | 'REVEAL'            // L6: Reveal tiles in radius
  | 'LOCATE'            // L7: Reveal nearest POI of category
  | 'FAST_TRAVEL'       // L8: Travel between waypoints
  | 'SHOP'              // L9: Buy items with gold
  | 'UPGRADE'           // L10: Upgrade tool tier
  | 'FUSE'              // L11: Fuse 2 identical items
  | 'DESTROY';          // L14: Destroy 1 gear item

interface POIDefinition {
  id: POIId;
  name: string;                  // e.g., "Mole Den"
  emoji: string;                 // e.g., "🏠"
  imagePath: string;             // Asset path

  rarity: POIRarity;
  interaction: POIInteractionType;

  // Availability constraints
  nightOnly?: boolean;           // L1, L5
  oneTime?: boolean;             // Most POIs

  // Interaction parameters
  params?: {
    healAmount?: number;         // L1: full, L5: 10
    itemCount?: number;          // L2, L3, L12, L13: 3
    revealRadius?: number;       // L6: 13
    goldCost?: number;           // L14: varies by act
  };

  description: string;
}
```

**Validation Rules**:
- 14 POI types total (L1-L14)
- Night-only: L1, L5
- One-time: L2, L3, L5, L6, L7, L10, L11, L12, L13, L14
- Repeatable: L1, L4, L8, L9

### Itemset

Represents a bonus activated when specific items are equipped.

```typescript
type ItemsetId = string;  // e.g., "UNION_STANDARD"

interface ItemsetDefinition {
  id: ItemsetId;
  name: string;                  // e.g., "Union Standard"
  emoji: string;                 // e.g., "🧰"

  // Required items (all must be equipped)
  requiredItems: ItemId[];

  // Bonus effect
  bonus: {
    timing: EffectTiming;
    description: string;
    params?: Record<string, number | string>;
  };
}
```

**Validation Rules**:
- 12 itemsets total
- Each required item ID must exist in item definitions
- No duplicate required items within a set

### Status Effect

Represents a combat modifier with stack-based mechanics.

```typescript
type StatusEffectType = 'CHILL' | 'SHRAPNEL' | 'RUST' | 'BLEED';

interface StatusEffectDefinition {
  type: StatusEffectType;
  name: string;
  emoji: string;
  color: string;                 // CSS hex color
  description: string;

  // Mechanics
  appliesAt: 'TURN_START' | 'WHEN_STRUCK' | 'TURN_END';
  clearsAt: 'TURN_END' | 'NEVER' | 'PARTIAL';  // PARTIAL = -1 per turn
  persistent: boolean;           // Rust persists, others don't
}
```

**Status Effect Definitions**:
| Type | Emoji | Color | Applies At | Clears At | Effect |
|------|-------|-------|------------|-----------|--------|
| CHILL | ❄️ | #60a5fa | TURN_START | PARTIAL | Reduce strikes by stacks (min 1), -1 stack |
| SHRAPNEL | 💥 | #f97316 | WHEN_STRUCK | TURN_END | Deal stacks damage to attacker |
| RUST | 🟤 | #a16207 | TURN_END | NEVER | Reduce ARM by stacks |
| BLEED | 🩸 | #dc2626 | TURN_END | PARTIAL | Take stacks damage, -1 stack |

## Relationships

```
Player --equips--> 1 Tool
Player --equips--> 4-8 Gear (slot growth)
Player --owns--> Gold

Gear/Tool --has--> Tag
Gear/Tool --has--> Rarity
Gear/Tool --has--> Tier
Gear/Tool --part_of--> Itemset (optional)

Enemy --has--> Archetype
Enemy --has--> Tier
Enemy --has--> Trait

Boss --has--> Week
Boss --has--> Biome
Boss --has--> 2 Weakness Tags
Boss --has--> Abilities

POI --has--> Rarity
POI --has--> Interaction Type
POI --generates--> Items (some types)

Combat --involves--> Player
Combat --involves--> Enemy OR Boss
Combat --applies--> Status Effects
Combat --uses--> Equipped Items
Combat --activates--> Itemset Bonuses
```

## State Transitions

### Item Tier Progression
```
Tier I --[Rune Kiln: 2 identical]--> Tier II --[Rune Kiln: 2 identical]--> Tier III
```

### Inventory Slot Growth
```
Start (4 slots) --[Defeat Week 1 Boss]--> 6 slots --[Defeat Week 2 Boss]--> 8 slots
```

### Status Effect Lifecycle
```
Applied --[Turn Start: Chill reduces strikes]--> Active
Active --[When Struck: Shrapnel reflects]--> Active
Active --[Turn End: Rust/Bleed apply damage]--> Decayed/Cleared
```

### Combat Phase Flow
```
BATTLE_START → TURN_START → [PLAYER_ATTACK | ENEMY_ATTACK] (by SPD)
            → TURN_END → [repeat or BATTLE_END]
```
