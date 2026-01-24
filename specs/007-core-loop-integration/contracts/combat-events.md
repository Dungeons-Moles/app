# Contract: Combat Events

**Feature**: `007-core-loop-integration` | **Date**: 2026-01-22

## Overview

Parse and replay combat events emitted by the `gameplay-state` program during `move_with_combat` transactions.

## Event Types

### CombatStartedEvent

Emitted when combat begins (player enters enemy tile or enemy enters player tile during night).

```typescript
interface CombatStartedEvent {
  player: PublicKey;
  playerHp: number;
  playerAtk: number;
  enemyArchetype: number;
  enemyHp: number;
  enemyAtk: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct CombatStarted {
    pub player: Pubkey,
    pub player_hp: i16,
    pub player_atk: i16,
    pub enemy_archetype: u8,
    pub enemy_hp: i16,
    pub enemy_atk: i16,
}
```

---

### TurnExecutedEvent

Emitted for each combat turn.

```typescript
interface TurnExecutedEvent {
  turn: number;
  playerHp: number;
  enemyHp: number;
  playerDamage: number;
  enemyDamage: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct TurnExecuted {
    pub turn: u8,
    pub player_hp: i16,
    pub enemy_hp: i16,
    pub player_damage: i16,
    pub enemy_damage: i16,
}
```

---

### StatusAppliedEvent

Emitted when a status effect is applied.

```typescript
interface StatusAppliedEvent {
  target: 'player' | 'enemy';
  effectType: StatusEffect;
  stacks: number;
}

enum StatusEffect {
  Chill = 0,
  Shrapnel = 1,
  Rust = 2,
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct StatusApplied {
    pub target: u8, // 0 = player, 1 = enemy
    pub effect_type: u8,
    pub stacks: u8,
}
```

---

### CombatEndedEvent

Emitted when combat concludes.

```typescript
interface CombatEndedEvent {
  player: PublicKey;
  playerWon: boolean;
  finalPlayerHp: number;
  finalEnemyHp: number;
  goldEarned: number;
  turnsTaken: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct CombatEnded {
    pub player: Pubkey,
    pub player_won: bool,
    pub final_player_hp: i16,
    pub final_enemy_hp: i16,
    pub gold_earned: u16,
    pub turns_taken: u8,
}
```

---

### BossCombatStartedEvent

Emitted when boss combat begins (Week 1/2/3 boss encounter).

```typescript
interface BossCombatStartedEvent {
  player: PublicKey;
  bossId: string; // 12-char ID like "STONE_GOLEM"
  bossHp: number;
  week: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct BossCombatStarted {
    pub player: Pubkey,
    pub boss_id: [u8; 12],
    pub boss_hp: i16,
    pub week: u8,
}
```

---

### EnemyMovedEvent

Emitted during night phase when an enemy moves toward player.

```typescript
interface EnemyMovedEvent {
  enemyIndex: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct EnemyMoved {
    pub enemy_index: u8,
    pub from_x: u8,
    pub from_y: u8,
    pub to_x: u8,
    pub to_y: u8,
}
```

---

### PlayerDefeatedEvent

Emitted when player HP reaches 0.

```typescript
interface PlayerDefeatedEvent {
  player: PublicKey;
  killedBy: 'enemy' | 'boss';
  finalHp: number;
}
```

---

### LevelCompletedEvent

Emitted when Week 3 boss is defeated.

```typescript
interface LevelCompletedEvent {
  player: PublicKey;
  level: number;
  totalMoves: number;
  goldEarned: number;
}
```

---

## Event Parser

### parseCombatEvents

Parses combat-related events from a transaction.

```typescript
async function parseCombatEvents(
  connection: Connection,
  program: Program<GameplayState>,
  signature: string
): Promise<CombatReplay | null>;
```

**Returns**: `CombatReplay` if combat occurred, `null` otherwise.

**Implementation**:

```typescript
async function parseCombatEvents(
  connection: Connection,
  program: Program<GameplayState>,
  signature: string
): Promise<CombatReplay | null> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) return null;

  const events = parseEventsFromLogs(program, tx.meta.logMessages);

  const combatStarted = events.find((e) => e.name === 'CombatStarted');
  if (!combatStarted) return null;

  const bossIntro = events.find((e) => e.name === 'BossCombatStarted');

  return {
    signature,
    combatStarted: combatStarted.data as CombatStartedEvent,
    turns: events.filter((e) => e.name === 'TurnExecuted').map((e) => e.data as TurnExecutedEvent),
    statusEffects: events
      .filter((e) => e.name === 'StatusApplied')
      .map((e) => e.data as StatusAppliedEvent),
    combatEnded: events.find((e) => e.name === 'CombatEnded')?.data as CombatEndedEvent,
    isBoss: !!bossIntro,
    bossIntro: bossIntro?.data as BossCombatStartedEvent | undefined,
  };
}
```

---

### parseEventsFromLogs

Low-level log parser using Anchor's BorshCoder.

```typescript
function parseEventsFromLogs(
  program: Program<GameplayState>,
  logs: string[]
): Array<{ name: string; data: unknown }>;
```

**Implementation**:

```typescript
function parseEventsFromLogs(
  program: Program<GameplayState>,
  logs: string[]
): Array<{ name: string; data: unknown }> {
  const events: Array<{ name: string; data: unknown }> = [];

  for (const log of logs) {
    if (log.startsWith('Program data: ')) {
      const base64Data = log.replace('Program data: ', '');
      const buffer = Buffer.from(base64Data, 'base64');

      try {
        const event = program.coder.events.decode(buffer);
        if (event) {
          events.push(event);
        }
      } catch {
        // Not an event we care about
      }
    }
  }

  return events;
}
```

---

### parseNightMovement

Parses enemy movement events for night phase animation.

```typescript
async function parseNightMovement(
  connection: Connection,
  program: Program<GameplayState>,
  signature: string
): Promise<EnemyMovedEvent[]>;
```

**Returns**: Array of enemy movements in order.

---

## CombatReplay Interface

Complete combat data for replay animation.

```typescript
interface CombatReplay {
  signature: string;
  combatStarted: CombatStartedEvent;
  turns: TurnExecutedEvent[];
  statusEffects: StatusAppliedEvent[];
  combatEnded: CombatEndedEvent;
  isBoss: boolean;
  bossIntro?: BossCombatStartedEvent;
}
```

---

## Usage Example

```typescript
import { parseCombatEvents, parseNightMovement } from '@/services/solana/eventParser';

// In useCombatReplay hook
const handleMoveResult = async (signature: string) => {
  // Parse night movement first
  const nightMovements = await parseNightMovement(connection, program, signature);
  if (nightMovements.length > 0) {
    await animateNightMovement(nightMovements);
  }

  // Parse combat events
  const combat = await parseCombatEvents(connection, program, signature);
  if (combat) {
    setReplayState('intro');
    setCombatReplay(combat);
    // CombatOverlay will animate based on combatReplay
  }
};
```

---

## Animation Timing

| Phase  | Duration | Notes                         |
| ------ | -------- | ----------------------------- |
| Intro  | 500ms    | Show combatants, starting HP  |
| Turn   | 300ms    | Damage numbers, HP bar update |
| Status | 200ms    | Status effect icon appears    |
| Outro  | 500ms    | Victory/defeat flash          |

**Total for 5-turn combat**: ~2.5 seconds
**Total for 10-turn combat**: ~4 seconds
