# Contract: POI UI Text Simplification

**Feature**: 002-qol-balance-batch
**Component**: POI Selection UI
**Priority**: P3

## Overview

Item selection interfaces for Supply Cache, Tool Crate, Tool Oil Rack, and Geode Vault display stat bonuses prominently instead of verbose item names. Rarity remains indicated via color.

## Interface Contract

### Stat Display Formatting

```typescript
// src/utils/stat-display.ts

/**
 * Stat abbreviations used in simplified UI.
 */
export const STAT_ABBREV = {
  hp: 'HP',
  maxHp: 'HP',
  atk: 'ATK',
  arm: 'ARM',
  spd: 'SPD',
  dig: 'DIG',
} as const;

/**
 * Format stat bonuses for display.
 *
 * @param stats - Object with stat bonuses (non-zero values only)
 * @returns Formatted string like "+1 ATK +2 ARM"
 *
 * @example
 * formatStatBonuses({ atk: 1 }) // => "+1 ATK"
 * formatStatBonuses({ atk: 2, arm: 1 }) // => "+2 ATK +1 ARM"
 * formatStatBonuses({ hp: 5 }) // => "+5 HP"
 * formatStatBonuses({}) // => "" (no bonuses)
 */
export function formatStatBonuses(stats: Partial<Record<keyof typeof STAT_ABBREV, number>>): string;

/**
 * Extract stat bonuses from an item definition.
 *
 * @param item - Gear or Tool definition
 * @returns Object with non-zero stat bonuses
 */
export function extractStatBonuses(item: Gear | Tool): Partial<Record<string, number>>;
```

### Rarity Color Mapping

```typescript
// src/utils/rarity-colors.ts

import type { Rarity } from '@/game/engine/types';

/**
 * Rarity color palette.
 */
export const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: '#9ca3af',     // Gray
  UNCOMMON: '#22c55e',   // Green
  RARE: '#3b82f6',       // Blue
  EPIC: '#a855f7',       // Purple
};

/**
 * Rarity background colors (lighter variants for item cards).
 */
export const RARITY_BG_COLORS: Record<Rarity, string> = {
  COMMON: '#f3f4f6',
  UNCOMMON: '#dcfce7',
  RARE: '#dbeafe',
  EPIC: '#f3e8ff',
};
```

### POI Option Component

```typescript
// src/components/poi/SimplifiedItemOption.tsx

interface SimplifiedItemOptionProps {
  /** Formatted stat string (e.g., "+1 ATK +2 ARM") */
  statDisplay: string;
  /** Item rarity for color coding */
  rarity: Rarity;
  /** Full item name (for tooltip) */
  itemName: string;
  /** Whether option is selected */
  selected?: boolean;
  /** Whether option is disabled */
  disabled?: boolean;
  /** Selection handler */
  onSelect: () => void;
  /** Long press handler (show tooltip) */
  onLongPress: () => void;
}

/**
 * Simplified item option for POI selection.
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │ [Rarity Color] +1 ATK +1 ARM │
 * └─────────────────────────────┘
 *
 * - Left border or background shows rarity color
 * - Primary text shows stat bonuses only
 * - Long press shows tooltip with full item name
 */
export function SimplifiedItemOption(props: SimplifiedItemOptionProps): JSX.Element;
```

## UI Contract

### Affected POI Types

| POI ID | Name | Current Display | Simplified Display |
|--------|------|-----------------|-------------------|
| L2 | Supply Cache | "Miner's Gloves +1 ATK" | "+1 ATK" |
| L3 | Tool Crate | "Iron Pickaxe +2 ATK" | "+2 ATK" |
| L4 | Tool Oil Rack | "Attack Oil +1 ATK" | "+1 ATK" |
| L12 | Geode Vault | "Crystal Shard +1 ATK +1 ARM" | "+1 ATK +1 ARM" |

### Layout Changes

```typescript
// src/screens/POIInteractionScreen.tsx

/**
 * POI Interaction Screen modifications:
 *
 * Before:
 * ┌────────────────────────────────────┐
 * │ [Icon] Miner's Gloves (Common)     │
 * │        +1 ATK                      │
 * └────────────────────────────────────┘
 *
 * After:
 * ┌────────────────────────────────────┐
 * │ [Gray Border] +1 ATK               │
 * └────────────────────────────────────┘
 *
 * Changes:
 * 1. Remove item name from primary display
 * 2. Move rarity to border/background color
 * 3. Stats become primary text
 * 4. Long press reveals full item name tooltip
 */
```

### Tooltip Component

```typescript
// src/components/poi/ItemTooltip.tsx

interface ItemTooltipProps {
  /** Full item name */
  name: string;
  /** Item description (if any) */
  description?: string;
  /** Rarity text */
  rarity: Rarity;
  /** Position to show tooltip near */
  anchorPosition: { x: number; y: number };
  /** Dismiss handler */
  onDismiss: () => void;
}

/**
 * Tooltip showing full item details on long press.
 *
 * Layout:
 * ┌──────────────────────────┐
 * │ Miner's Gloves           │
 * │ Common                   │
 * │ Sturdy gloves for mining │
 * └──────────────────────────┘
 *
 * Auto-dismisses on tap outside or after 3 seconds.
 */
export function ItemTooltip(props: ItemTooltipProps): JSX.Element;
```

## Behavior Specification

### Display Priority

```
1. Stat bonuses (always shown, primary)
2. Rarity color (always shown, visual indicator)
3. Item name (on long press only)
4. Description (on long press only)
```

### Stat Ordering

Stats are displayed in a consistent order when multiple bonuses exist:

```
HP > ATK > ARM > SPD > DIG
```

Example: Item with +1 ARM, +2 ATK displays as "+2 ATK +1 ARM"

### Empty Stats Handling

```typescript
/**
 * Edge case: Item with no stat bonuses.
 *
 * If item has no displayable stat bonuses:
 * - Show item effect description instead
 * - Example: "Heal 5 HP" for consumables
 * - Example: "Reveal nearby enemies" for utility items
 */
```

## Test Cases

```typescript
describe('POI UI Simplification', () => {
  describe('Stat Formatting', () => {
    it('formats single stat bonus', () => {
      expect(formatStatBonuses({ atk: 1 })).toBe('+1 ATK');
    });

    it('formats multiple stat bonuses in order', () => {
      expect(formatStatBonuses({ arm: 1, atk: 2 })).toBe('+2 ATK +1 ARM');
      expect(formatStatBonuses({ dig: 1, hp: 5, atk: 1 })).toBe('+5 HP +1 ATK +1 DIG');
    });

    it('returns empty string for no bonuses', () => {
      expect(formatStatBonuses({})).toBe('');
    });

    it('ignores zero values', () => {
      expect(formatStatBonuses({ atk: 1, arm: 0 })).toBe('+1 ATK');
    });
  });

  describe('Item Extraction', () => {
    it('extracts stat bonuses from gear', () => {
      const gear = { id: 'G1', stats: { atk: 2, arm: 1, spd: 0 } };
      expect(extractStatBonuses(gear)).toEqual({ atk: 2, arm: 1 });
    });

    it('extracts stat bonuses from tool', () => {
      const tool = { id: 'T1', stats: { atk: 3, dig: 2 } };
      expect(extractStatBonuses(tool)).toEqual({ atk: 3, dig: 2 });
    });
  });

  describe('Rarity Colors', () => {
    it('returns correct colors for each rarity', () => {
      expect(RARITY_COLORS.COMMON).toBe('#9ca3af');
      expect(RARITY_COLORS.UNCOMMON).toBe('#22c55e');
      expect(RARITY_COLORS.RARE).toBe('#3b82f6');
      expect(RARITY_COLORS.EPIC).toBe('#a855f7');
    });
  });

  describe('Component Rendering', () => {
    it('displays stats as primary text', () => {
      const { getByText } = render(
        <SimplifiedItemOption
          statDisplay="+1 ATK +2 ARM"
          rarity="UNCOMMON"
          itemName="Test Item"
          onSelect={jest.fn()}
          onLongPress={jest.fn()}
        />
      );

      expect(getByText('+1 ATK +2 ARM')).toBeTruthy();
    });

    it('does not show item name in normal state', () => {
      const { queryByText } = render(
        <SimplifiedItemOption
          statDisplay="+1 ATK"
          rarity="COMMON"
          itemName="Miner's Gloves"
          onSelect={jest.fn()}
          onLongPress={jest.fn()}
        />
      );

      expect(queryByText("Miner's Gloves")).toBeNull();
    });

    it('shows tooltip on long press', async () => {
      const onLongPress = jest.fn();
      const { getByTestId } = render(
        <SimplifiedItemOption
          statDisplay="+1 ATK"
          rarity="COMMON"
          itemName="Miner's Gloves"
          onSelect={jest.fn()}
          onLongPress={onLongPress}
        />
      );

      fireEvent(getByTestId('item-option'), 'longPress');
      expect(onLongPress).toHaveBeenCalled();
    });
  });
});
```

## Accessibility Considerations

- Stat text maintains minimum readable size (14sp)
- Rarity colors have sufficient contrast with background
- Long press alternative: double-tap for tooltip on accessibility mode
- Screen readers announce: "{stat bonuses}, {rarity} rarity"
