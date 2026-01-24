# Research: Core Gameplay Loop Integration

**Branch**: `007-core-loop-integration` | **Date**: 2026-01-22

## Research Summary

This document captures research decisions for integrating the core gameplay loop Solana programs with the React Native frontend.

---

## RD-01: Atomic Session Transaction Building

**Context**: Session creation requires bundling 5 instructions into a single transaction signed once by the main wallet.

**Decision**: Use `@solana/web3.js` Transaction class to bundle instructions, with program-derived instruction builders from Anchor.

**Rationale**:

- Anchor's `Program.methods.*.instruction()` returns raw instructions that can be bundled
- Single transaction ensures atomicity - either all 5 succeed or all fail
- Main wallet signs once, burner wallet pubkey included as account in instructions
- Transaction size must stay under 1232 bytes (Solana limit)

**Alternatives Considered**:

1. **CPI mega-instruction on-chain**: Rejected - requires complex cross-program calls, harder to debug
2. **Multiple transactions with client-side sequencing**: Rejected - no atomicity, partial state possible
3. **Versioned transactions with address lookup tables**: Not needed - 5 instructions fit in standard transaction

**Implementation Notes**:

```typescript
const tx = new Transaction();
tx.add(await sessionProgram.methods.startSession(level, lamports).accounts({...}).instruction());
tx.add(await gameplayProgram.methods.initializeGameState(9, 9, 4, 4).accounts({...}).instruction());
tx.add(await enemiesProgram.methods.spawnEnemies(level, seed).accounts({...}).instruction());
tx.add(await poisProgram.methods.spawnPois(level, seed).accounts({...}).instruction());
tx.add(await inventoryProgram.methods.initializeInventory().accounts({...}).instruction());
// Single signature from main wallet
```

---

## RD-02: Combat Event Parsing and Replay

**Context**: Combat events (CombatStarted, TurnExecuted, StatusApplied, CombatEnded) are emitted by the on-chain program and need to be displayed as animated sequences.

**Decision**: Parse events from transaction logs using Anchor's event parser, buffer them, then replay with timed animations.

**Rationale**:

- Anchor encodes events in transaction logs with base64
- `program.addEventListener()` works for subscription but not for past transactions
- For transaction result, parse logs manually using `anchor.BorshCoder`
- Buffer all events first, then animate in sequence to ensure smooth playback

**Alternatives Considered**:

1. **Real-time event subscription**: Rejected - move_with_combat returns synchronously, events are in same transaction
2. **Parse only final state**: Rejected - user wants to see each turn's damage/effects
3. **Store combat log on-chain**: Rejected - too expensive, events are sufficient

**Implementation Notes**:

```typescript
interface CombatReplay {
  combatStarted: CombatStartedEvent;
  turns: TurnExecutedEvent[];
  statusEffects: StatusAppliedEvent[];
  combatEnded: CombatEndedEvent;
}

// Parse from transaction signature
async function parseCombatEvents(signature: string): Promise<CombatReplay> {
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
  const events = program.coder.events.parse(tx.meta.logMessages);
  // Group and order events
}
```

---

## RD-03: Night Enemy Movement Animation

**Context**: During night phases, enemies within 3 tiles move toward the player. Multiple `EnemyMoved` events may be emitted per player move.

**Decision**: Collect all EnemyMoved events, animate them sequentially (200ms per enemy), then show player movement.

**Rationale**:

- Events are emitted in order (enemy movements happen before player movement resolves)
- Sequential animation provides clear visual feedback
- 200ms per enemy keeps animation snappy even with 10 enemies
- Total animation time bounded: max 10 enemies × 200ms = 2 seconds

**Alternatives Considered**:

1. **Animate all enemies simultaneously**: Rejected - harder to track, may cause visual chaos
2. **Skip animation, just show final positions**: Rejected - loses strategic feedback
3. **User-configurable animation speed**: Future enhancement, not for MVP

**Implementation Notes**:

```typescript
const animateNightMovement = async (events: EnemyMovedEvent[]) => {
  for (const event of events) {
    await animateEnemy(event.enemyIndex, event.fromX, event.fromY, event.toX, event.toY);
    await delay(200);
  }
};
```

---

## RD-04: Multi-Session PDA Derivation

**Context**: Sessions use PDA `["session", player, level]` to allow multiple concurrent sessions on different levels.

**Decision**: Derive session PDA on client using same seeds as on-chain program.

**Rationale**:

- Client can calculate PDA without network call
- Session existence can be checked with `getAccountInfo()`
- Level byte must be passed as single-byte buffer: `Buffer.from([level])`

**Alternatives Considered**:

1. **Fetch all sessions, filter by level**: Rejected - inefficient
2. **Use different seed structure**: Rejected - must match on-chain program

**Implementation Notes**:

```typescript
const [sessionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('session'), playerPubkey.toBuffer(), Buffer.from([level])],
  SESSION_PROGRAM_ID
);
```

---

## RD-05: Session List Fetching

**Context**: Need to display all active sessions for a player to enable switching.

**Decision**: Use `getProgramAccounts` with `memcmp` filter on player pubkey to find all sessions.

**Rationale**:

- Player pubkey is stored at known offset in GameSession account
- Single RPC call returns all matching accounts
- Max 40 sessions means bounded response size

**Alternatives Considered**:

1. **Check each level 1-40 individually**: Rejected - 40 RPC calls, too slow
2. **Store session list in separate account**: Rejected - adds complexity, on-chain storage cost
3. **Local cache of session list**: Used as optimization, but getProgramAccounts is source of truth

**Implementation Notes**:

```typescript
const sessions = await connection.getProgramAccounts(SESSION_PROGRAM_ID, {
  filters: [
    { memcmp: { offset: 8, bytes: playerPubkey.toBase58() } }, // After discriminator
  ],
});
```

---

## RD-06: Combat Overlay Architecture

**Context**: Combat must be displayed as a full-screen overlay during gameplay, showing each turn's actions.

**Decision**: Use a modal overlay component that receives combat events and animates them sequentially.

**Rationale**:

- Overlay blocks further input during combat (correct behavior)
- Animation state machine: Intro → Turn[] → Outro
- Can be dismissed after combat ends to return to exploration
- Reusable for both regular enemy and boss combat

**Alternatives Considered**:

1. **Navigate to separate combat screen**: Rejected - loses exploration context
2. **Inline combat in game canvas**: Rejected - too cramped on mobile
3. **Combat log only (no animation)**: Rejected - less engaging

**State Machine**:

```
Idle → Intro → Turns → Outro → Result → Idle
         ↓       ↓       ↓
      (animate) (loop) (animate)
```

---

## RD-07: Death/Victory Screen Flow

**Context**: When combat ends in death or victory, need to show summary screen and handle profile updates.

**Decision**: Transition to dedicated screen (DeathScreen or VictoryScreen) after combat overlay dismisses.

**Rationale**:

- Clear separation of concerns: combat ends, then result handling
- Victory screen shows level unlock and item unlock animations if applicable
- Death screen shows run summary (moves, gold, level reached)
- Both screens have "Return to Hub" button that navigates to HubScreen

**Alternatives Considered**:

1. **Show result in combat overlay**: Rejected - not enough space for unlock animations
2. **Navigate directly to hub**: Rejected - user misses important information

**Flow**:

```
CombatOverlay (ends) → navigation.navigate('Death' | 'Victory', { resultData })
```

---

## RD-08: Item Bitmask Utilities

**Context**: Items are tracked using 80-bit bitmask (10 bytes). Need utilities to read/write individual bits.

**Decision**: Create bitmask utility functions that work with Uint8Array[10].

**Rationale**:

- Direct bit manipulation is fast and matches on-chain representation
- Can convert to/from array of item indices for UI display
- 80 items = indices 0-79

**Implementation Notes**:

```typescript
function isItemUnlocked(bitmask: Uint8Array, index: number): boolean {
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return (bitmask[byteIndex] & (1 << bitIndex)) !== 0;
}

function getUnlockedItems(bitmask: Uint8Array): number[] {
  const unlocked: number[] = [];
  for (let i = 0; i < 80; i++) {
    if (isItemUnlocked(bitmask, i)) unlocked.push(i);
  }
  return unlocked;
}
```

---

## RD-09: Item Unlock Animation

**Context**: When a new item is unlocked (ItemUnlocked event), show celebration animation with item details.

**Decision**: Use a modal animation component that shows item card with glow/particle effects.

**Rationale**:

- Item unlock is a reward moment, should feel special
- Show item name, set affiliation, and preview stats
- Animation duration: ~2 seconds, then user dismisses

**Alternatives Considered**:

1. **Toast notification**: Rejected - not celebratory enough for rare event
2. **Inline in victory screen**: Combined - show unlock as part of victory flow

---

## RD-10: Run Purchase Flow

**Context**: Players can purchase 20 runs for 0.001 SOL using the main wallet.

**Decision**: Dedicated screen with clear pricing, confirmation, and success feedback.

**Rationale**:

- Main wallet signature required (not burner)
- Clear pricing prevents confusion
- Show SOL balance before and after
- Confirmation step prevents accidental purchases

**Flow**:

```
Profile (runs: 0) → RunPurchaseScreen → Confirm → Main wallet signs → Success → Profile (runs: 20)
```

---

## RD-11: POI Interaction Button State

**Context**: POI interaction is explicit (not auto-triggered). Need to show interact button only when valid.

**Decision**: Show interact button when player is on a non-consumed POI tile.

**Rationale**:

- Check player position against POI positions
- Filter out consumed POIs
- Button enabled only when valid interaction available
- Disabled state shows "Nothing here" or similar

**Implementation Notes**:

```typescript
const canInteract = pois.some((poi) => poi.x === playerX && poi.y === playerY && !poi.consumed);
```

---

## RD-12: Phase and Week Display

**Context**: UI must clearly show current phase (Day1-3, Night1-3) and week (1-3).

**Decision**: Header component showing "Week 1 - Day 2" with phase-appropriate styling.

**Rationale**:

- Players need to know when night is coming for strategic planning
- Night phases use darker color scheme
- Moves remaining shown alongside phase

**Implementation Notes**:

```typescript
const phaseLabels = {
  0: 'Day 1',
  1: 'Night 1',
  2: 'Day 2',
  3: 'Night 2',
  4: 'Day 3',
  5: 'Night 3',
};
```

---

## RD-13: Boss Combat Differentiation

**Context**: Boss combat needs distinct presentation from regular enemy combat.

**Decision**: Boss combat overlay includes intro animation showing boss name/stats, and uses larger character display.

**Rationale**:

- Bosses are climactic moments, deserve special treatment
- BossCombatStarted event contains boss_id and boss_hp
- Week number determines which boss (Week 1, 2, or 3 boss)

**Alternatives Considered**:

1. **Same display as regular combat**: Rejected - bosses should feel special
2. **Separate boss combat screen**: Rejected - overlay pattern is consistent

---

## RD-14: Session Abandonment

**Context**: Players may want to abandon a session to start fresh on that level.

**Decision**: Abandon calls end_session with victory=false, deducting a run.

**Rationale**:

- Prevents exploit of abandoning to avoid death
- Confirmation dialog warns about run loss
- Session closed on-chain, rent returned

**Flow**:

```
SessionList → Select → "Abandon" → Confirm → end_session(false) → Session removed
```

---

## Summary of Decisions

| ID    | Decision         | Approach                                      |
| ----- | ---------------- | --------------------------------------------- |
| RD-01 | Session creation | Bundle 5 instructions in single Transaction   |
| RD-02 | Combat events    | Parse from logs, buffer, animate sequentially |
| RD-03 | Night movement   | Sequential animation, 200ms per enemy         |
| RD-04 | Session PDA      | Client-side derivation with level byte        |
| RD-05 | Session list     | getProgramAccounts with memcmp filter         |
| RD-06 | Combat UI        | Modal overlay with state machine              |
| RD-07 | Death/Victory    | Dedicated screens after combat                |
| RD-08 | Item bitmask     | Uint8Array utilities for 80-bit mask          |
| RD-09 | Item unlock      | Modal animation with item details             |
| RD-10 | Run purchase     | Dedicated screen, main wallet signature       |
| RD-11 | POI button       | Show only when on valid POI tile              |
| RD-12 | Phase display    | Header component with phase/week labels       |
| RD-13 | Boss combat      | Distinct intro, larger display                |
| RD-14 | Abandon session  | Calls end_session, deducts run                |
