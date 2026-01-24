# Quickstart: GDD Mechanics Update

**Feature**: 003-gdd-mechanics-update
**Branch**: `003-gdd-mechanics-update`

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator

## Setup

```bash
# Clone and checkout feature branch
git checkout 003-gdd-mechanics-update

# Install dependencies
npm install

# Start Expo dev server
npm start
```

## Development Commands

```bash
# Run on platforms
npm run android          # Android emulator
npm run ios             # iOS simulator
npm run web             # Web browser (dev only)

# Quality checks
npm run lint            # ESLint
npm run lint:fix        # Auto-fix lint issues
npm run format          # Prettier formatting
npm run typecheck       # TypeScript validation

# Testing
npm test                # All tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # Coverage report
npm test -- __tests__/unit/combat/  # Specific directory
```

## Key Files to Modify

### Data Definitions (src/data/)

| File          | Current  | Target    | Changes                        |
| ------------- | -------- | --------- | ------------------------------ |
| `gear.ts`     | 29 items | 80 items  | Add 51 items with tier scaling |
| `bosses.ts`   | 7 bosses | 16 bosses | Add Biome B bosses             |
| `pois.ts`     | 12 POIs  | 14 POIs   | Add Counter Cache, Scrap Chute |
| `itemsets.ts` | 8 sets   | 12 sets   | Add 4 new itemsets             |
| `enemies.ts`  | NEW      | 12×3      | Create field enemy definitions |

### Combat System (src/game/combat/)

| File                | Changes                              |
| ------------------- | ------------------------------------ |
| `status-effects.ts` | Add Bleed effect type and processing |
| `damage.ts`         | Integrate Bleed damage at turn end   |
| `resolver.ts`       | Add enemy traits, new item effects   |

### Map Rendering (src/components/game/)

| File              | Changes                            |
| ----------------- | ---------------------------------- |
| `MapRenderer.tsx` | Replace emoji with image rendering |

## Testing Strategy

### Unit Tests Required

```bash
# Status effects (including new Bleed)
npm test -- __tests__/unit/combat/status-effects.test.ts

# Damage calculation
npm test -- __tests__/unit/combat/damage.test.ts

# Combat resolver with new items/traits
npm test -- __tests__/unit/combat/resolver.test.ts
```

### Test Patterns

```typescript
// Use fixed seeds for determinism (P05, P11)
const rng = new SeededRNG(12345);

// Test with factory helpers
const combatant = createTestCombatant({
  statusEffects: { chill: 2, shrapnel: 0, rust: 1, bleed: 3 },
});

// Verify determinism
const result1 = resolveCombat(input, rng.clone());
const result2 = resolveCombat(input, rng.clone());
expect(result1).toEqual(result2);
```

## Image Assets

Assets are already present in:

```
assets/
├── field-enemies/     # 12 enemy images
│   ├── tunnel-rat.png
│   ├── cave-bat.png
│   └── ...
├── bosses/            # 16 boss images
│   ├── broodmother.png
│   └── ...
├── POIs/              # 14 POI images
│   ├── mole-den.png
│   └── ...
└── characters/
    └── default-mole.png
```

### Image Loading Pattern

```typescript
// Preload in component or context
import { useImage } from '@shopify/react-native-skia';

const tunnelRatImage = useImage(require('@/assets/entities/enemies/field/tunnel-rat.png'));

// Render without background square
<Image
  image={tunnelRatImage}
  x={tileX}
  y={tileY}
  width={ENTITY_SIZE}
  height={ENTITY_SIZE}
/>
```

## Constitution Compliance Checklist

Before submitting PR, verify:

- [ ] All game logic is deterministic (same seed = same result)
- [ ] No unbounded arrays or logs
- [ ] Unit tests for all new combat mechanics
- [ ] Fixed seeds used in all tests
- [ ] No new mechanics beyond GDD specification
- [ ] Performance tested on mobile device (60 FPS target)

## Common Issues

### Image not loading

- Verify asset path matches filesystem case exactly
- Check that image is imported with `require()` not string path

### Combat determinism failure

- Ensure SeededRNG is used for all random selections
- Check that effect order is consistent (sort by ID if needed)

### Itemset not activating

- Verify all required item IDs are exact matches
- Check that player.equippedGear includes all items

## GDD Reference

The Game Design Document is at `docs/gdd.md` and contains:

- Item definitions (Section 9, lines 128-249)
- Enemy archetypes (Section 11, lines 273-310)
- Boss definitions (Section 13, lines 413-500)
- POI specifications (Section 12, lines 314-409)
- Itemset definitions (Section 10, lines 252-269)
- Status effect rules (Section 8, lines 102-125)
