# Plan: On-Chain-First Architecture Fix

## Problem Statement

The game currently runs an **optimistic local-first** model where the frontend game reducer handles movement, combat, wall breaking, phase transitions, and enemy removal locally, then sends on-chain transactions as a side effect. This causes:

1. **Movement works locally but not on-chain** — The local reducer advances the player position and deducts moves immediately. The on-chain `movePlayer()` call runs as fire-and-forget. If `gameStatePda` is null (common after session restore), the on-chain call silently returns `{ success: false }` and nothing is recorded.

2. **Combat resolves entirely off-chain** — When the local reducer detects the player stepping on an enemy tile, it transitions to `GamePhase.Combat` and resolves combat locally via `CombatContext`. The on-chain `move_player` instruction *also* resolves combat inline, but the frontend never reads those results.

3. **Wall breaking is local-only** — The reducer computes dig cost and breaks walls locally. The on-chain `move_player` handles this too, but the frontend doesn't wait for confirmation.

4. **Phase/time updates are local** — Day/Night/Week transitions happen in the reducer when moves are exhausted. The on-chain instruction also handles this, but the two can diverge.

5. **Enemy removal is local-only** — After combat victory, the reducer removes the enemy from the local map. On-chain, `move_player` does this via the `MapEnemies` account, but the local state doesn't sync.

## Root Cause Analysis

The on-chain `move_player` instruction is a **monolithic operation** that handles:
- Position update
- Move cost calculation (floor=1, wall=`max(2, 6-DIG)`)
- Night enemy movement (Chebyshev distance 3)
- Combat resolution (player→enemy or enemy→player collision)
- Phase advancement (day→night→boss when moves exhausted)
- Enemy removal from `MapEnemies` account
- Event emission (`PlayerMoved`, combat events)

The frontend duplicates ALL of this logic locally in `game-reducer.ts` and treats the on-chain call as optional/optimistic. The two systems diverge because:

- `gameStatePda` is often null after restore (Issue 4 from prior plan)
- `burnerWallet.keypair` may not be loaded yet
- The `movePlayer` service uses fire-and-forget with `skipPreflight: true`
- The reducer doesn't wait for or read on-chain results

## Architecture: On-Chain-First Flow

### Current (broken):
```
User presses D-pad
  → dispatch({ type: 'MOVE', direction })     [LOCAL: moves player, triggers combat, etc.]
  → movePlayer({ targetX, targetY })           [ON-CHAIN: fire-and-forget, may silently fail]
  → If on-chain fails: show error toast, maybe reverse local move
```

### Target:
```
User presses D-pad
  → Show loading/pending indicator on tile
  → movePlayer({ targetX, targetY })           [ON-CHAIN: await confirmation]
  → Fetch confirmed GameState + MapEnemies from chain
  → If combat occurred on-chain:
      → Parse combat log from confirmed state
      → Navigate to CombatScreen with on-chain combat data
  → If no combat:
      → dispatch({ type: 'SYNC_FROM_CHAIN', onChainState })  [LOCAL: update from chain]
  → If transaction failed:
      → Show error, do NOT update local state
```

---

## Implementation Plan

### Phase 1: Fix Silent Failures (Movement Must Reach Chain)

**Goal:** Ensure `movePlayer` actually sends transactions and waits for confirmation.

#### Task 1.1: Ensure gameStatePda is always set before gameplay

**Files:** `src/screens/CampaignSelectScreen.tsx`, `src/contexts/SessionContext.tsx`

The `resumeSession` flow must guarantee that `gameStatePda` is set before navigating to `GameScreen`. This was partially addressed in the prior fix (using `switchToSession`), but needs verification that `switchToSession` correctly sets up:
- `gameplayState.setGameStatePda(pda)`
- `burnerWallet.keypair` recovery
- `gameplayState.gameState` is fetched (auto-refresh on PDA change)

**Acceptance criteria:**
- After `resumeSession`, `gameplayState.gameStatePda` is non-null
- After `resumeSession`, `burnerWallet.keypair` is non-null
- Console logs confirm both are set before navigating to Game

#### Task 1.2: Make movePlayer await confirmation (not fire-and-forget)

**Files:** `src/services/solana/gameplayState.ts`

Change `movePlayer()` (lines 157-194) to:
1. Remove `skipPreflight: true`
2. Await transaction confirmation (`connection.confirmTransaction`)
3. Return the signature for event parsing

Currently:
```typescript
const signature = await connection.sendRawTransaction(transaction.serialize(), {
  skipPreflight: true,
});
return signature;
```

Target:
```typescript
const signature = await connection.sendRawTransaction(transaction.serialize());
await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
return signature;
```

**Acceptance criteria:**
- `movePlayer` only resolves after on-chain confirmation
- If the transaction fails, it throws (caller can catch and handle)

#### Task 1.3: Add gameStatePda/burner null guards with visible errors

**Files:** `src/hooks/useGameplayState.ts`, `src/contexts/SessionContext.tsx`

Currently `move()` returns `{ success: false }` silently when `gameStatePda` is null. Change to:
1. Log a visible console.error with the specific null field
2. Propagate the error message to the caller
3. In `GameScreen`, show the error to the user instead of silently failing

**Acceptance criteria:**
- If `gameStatePda` is null, user sees "Game state not connected to blockchain" error
- If `burnerWallet.keypair` is null, user sees "Burner wallet not available" error

---

### Phase 2: On-Chain-First Movement

**Goal:** The local reducer does NOT process movement. Movement only updates local state after on-chain confirmation.

#### Task 2.1: Remove local movement from game reducer's MOVE action

**Files:** `src/game/engine/game-reducer.ts`

The `handleMove` function currently:
1. Validates bounds/adjacency
2. Checks for walls → computes dig cost → deducts moves
3. Checks for enemies → enters `GamePhase.Combat`
4. Updates player position
5. Handles night enemy movement
6. Handles phase transitions

**Change:** The `MOVE` action should become a no-op or be replaced with a new action type. Movement logic must come from on-chain.

**New approach:** Add a `SYNC_MOVE` action that accepts the confirmed on-chain state and updates the local game state accordingly:

```typescript
case 'SYNC_MOVE': {
  // action.confirmedState: GameState from fetchGameState()
  // action.combatLog: parsed combat events (if any)
  // action.removedEnemyIds: enemies killed during this move
  return applySyncedMove(state, action);
}
```

**Acceptance criteria:**
- Pressing a D-pad direction does NOT change local game state
- Local state only updates after on-chain confirmation via `SYNC_MOVE`

#### Task 2.2: Rewrite GameScreen movement handler

**Files:** `src/screens/GameScreen.tsx`

The `handleDirection` callback currently:
1. Dispatches `MOVE` to local reducer (immediate)
2. Calls `movePlayer()` on-chain (async, fire-and-forget)
3. On failure: dispatches reverse `MOVE` to undo

**Change to:**
1. Show pending/loading indicator on the target tile
2. Call `movePlayer()` on-chain (await confirmation)
3. Fetch confirmed `GameState` from chain
4. Fetch confirmed `MapEnemies` from chain (to detect enemy removal/combat)
5. Dispatch `SYNC_MOVE` with confirmed state
6. If combat occurred (detected from on-chain state), navigate to CombatScreen
7. On failure: show error, no local state change

```typescript
const handleDirection = useCallback(async (direction: Direction) => {
  if (!state || state.phase !== GamePhase.Exploration) return;

  const delta = DIRECTION_DELTA[direction];
  const targetPos = { x: state.player.position.x + delta.x, y: state.player.position.y + delta.y };

  // Validate bounds locally (cheap check to avoid unnecessary transactions)
  if (!isInBounds(targetPos, state.map.width, state.map.height)) return;

  // Send on-chain transaction and wait for confirmation
  const result = await movePlayer({ targetX: targetPos.x, targetY: targetPos.y });

  if (!result.success) {
    showWallBreakFeedback('Movement failed');
    return;
  }

  // Update local state from confirmed on-chain state
  dispatch({ type: 'SYNC_MOVE', confirmedState: result.newState });

  // Check if combat happened (player HP decreased or enemy removed)
  if (result.newState?.isDead || detectCombatOccurred(state, result.newState)) {
    navigation.navigate('Combat');
  }
}, [state, movePlayer, dispatch, navigation]);
```

**Acceptance criteria:**
- D-pad direction → on-chain tx → confirmed → local state update
- No local state change if on-chain fails
- Movement feels responsive (< 1-2s on devnet)

#### Task 2.3: Update `useGameplayState.move()` to return rich result

**Files:** `src/hooks/useGameplayState.ts`

The `move()` function currently does an optimistic update then fetches confirmed state. Change to:
1. Skip optimistic update entirely
2. Send transaction and await confirmation
3. Fetch confirmed `GameState`
4. Also fetch `MapEnemies` to detect combat results
5. Return confirmed state + combat detection info

```typescript
return {
  success: true,
  newState: confirmedState,
  combatOccurred: confirmedState.hp < previousState.hp || confirmedState.isDead,
  signature, // for event log parsing if needed
};
```

**Acceptance criteria:**
- `move()` returns confirmed on-chain state, never optimistic
- Caller can detect if combat occurred from the result

---

### Phase 3: On-Chain-First Combat

**Goal:** Combat is resolved on-chain via `move_player`. The frontend reads combat results and displays them.

#### Task 3.1: Detect combat from on-chain state changes

**Files:** `src/hooks/useGameplayState.ts` or new utility

After a `move_player` call, compare previous and confirmed state to detect combat:
- `confirmedState.hp < previousState.hp` (player took damage)
- `confirmedState.isDead` is true (player died)
- `confirmedState.gold > previousState.gold` (gold earned from victory)
- Enemy count decreased in `MapEnemies` account

Create a utility: `detectMoveOutcome(prevState, newState, prevEnemies, newEnemies)`

Returns: `{ type: 'move' | 'combat_victory' | 'combat_defeat' | 'wall_break', details }`

**Acceptance criteria:**
- Function correctly identifies combat vs normal move vs wall break
- Works for both regular enemies and boss fights

#### Task 3.2: Parse on-chain combat log for CombatScreen

**Files:** `src/services/solana/gameplayState.ts`, `src/services/solana/types/combat_events.ts`

The on-chain `move_player` emits combat events (CombatStarted, TurnExecuted, CombatEnded) via Anchor events. These are available in the transaction logs.

After confirming a move that resulted in combat:
1. Fetch the transaction logs using the signature
2. Parse Anchor events to extract `CombatReplay` data
3. Pass to `CombatScreen` for animated replay

If event parsing fails, fall back to a minimal display using state diff (HP before/after).

**Acceptance criteria:**
- Combat replay shows turn-by-turn animation from on-chain events
- Fallback works if event parsing fails

#### Task 3.3: Update CombatScreen to work with on-chain combat data

**Files:** `src/screens/CombatScreen.tsx`, `src/contexts/CombatContext.tsx`

Currently `CombatScreen` reads from `gameState.combat` (local state) and resolves combat locally via `CombatContext`. Change to:
1. Receive combat outcome from on-chain (victory/defeat, HP changes, gold earned)
2. If replay data available, animate it
3. If not, show summary screen
4. On completion, dispatch `SYNC_COMBAT_RESULT` to update local state from chain

**Acceptance criteria:**
- CombatScreen displays on-chain combat results
- Gold, HP, enemy removal reflect on-chain truth
- No local combat resolution

#### Task 3.4: Remove local combat from game reducer

**Files:** `src/game/engine/game-reducer.ts`

Remove or gate the following behind a `guest` mode check:
- `handleEnterCombat()` — combat triggered by MOVE
- `handleResolveCombat()` — local combat resolution
- Night enemy movement combat trigger in `handleNightEnemyMovement()`

Replace with `SYNC_COMBAT_RESULT` action that applies on-chain combat outcome to local state.

**Acceptance criteria:**
- MOVE action never enters `GamePhase.Combat` locally (in non-guest mode)
- Combat phase is only entered from on-chain detection

---

### Phase 4: On-Chain-First Phase Transitions

**Goal:** Day/Night/Week transitions come from on-chain state, not local computation.

#### Task 4.1: Read phase/time from confirmed on-chain state

**Files:** `src/screens/GameScreen.tsx`, `src/hooks/useGameplayState.ts`

After each confirmed move, the on-chain `GameState` contains:
- `phase` (current phase enum)
- `week` (current week)
- `movesRemaining` (moves left in phase)
- `bossFightReady` (triggers boss fight UI)
- `isDead` (triggers death screen)

Map these directly to local state via `SYNC_MOVE`:
```typescript
// In SYNC_MOVE handler:
newState.time = {
  week: confirmedState.week,
  phase: mapOnChainPhase(confirmedState.phase),
  cycle: confirmedState.cycle,
  movesRemaining: confirmedState.movesRemaining,
};
```

**Acceptance criteria:**
- Phase transitions only happen when on-chain state changes
- Moves remaining counter matches on-chain value

#### Task 4.2: Handle boss fight trigger from on-chain

**Files:** `src/screens/GameScreen.tsx`

When `confirmedState.bossFightReady` becomes true:
1. Call `triggerBossFight()` on-chain instruction
2. Wait for confirmation
3. Parse boss combat result from on-chain
4. Navigate to CombatScreen or DeathScreen/VictoryScreen

**Acceptance criteria:**
- Boss fight only triggers from on-chain `bossFightReady` flag
- Boss combat result comes from on-chain

---

### Phase 5: Guest Mode Preservation

**Goal:** Guest mode (offline play) still works with local-only logic.

#### Task 5.1: Gate on-chain requirements behind mode check

**Files:** `src/screens/GameScreen.tsx`, `src/game/engine/game-reducer.ts`

When `mode === 'guest'`:
- Use existing local reducer logic (MOVE, combat, phase transitions)
- No on-chain transactions
- This preserves the existing single-player demo experience

When `mode !== 'guest'`:
- Use on-chain-first flow as described above
- Local reducer is only updated via SYNC_* actions

**Acceptance criteria:**
- Guest mode works exactly as before (local-only)
- Non-guest mode uses on-chain-first flow

---

## Implementation Order

1. **Phase 1** (Silent failures) — Fix the plumbing so transactions actually reach the chain
2. **Phase 2** (On-chain-first movement) — Core movement flow change
3. **Phase 3** (On-chain-first combat) — Combat follows movement fix
4. **Phase 4** (Phase transitions) — Time/phase follows movement fix
5. **Phase 5** (Guest mode) — Preserve offline play

Phases 1-2 are the most critical and will fix the immediate user-facing bugs. Phases 3-5 build on top.

## Key Files Affected

| File | Changes |
|------|---------|
| `src/services/solana/gameplayState.ts` | Await confirmation, remove skipPreflight |
| `src/hooks/useGameplayState.ts` | Remove optimistic update, return rich result |
| `src/screens/GameScreen.tsx` | On-chain-first movement handler |
| `src/game/engine/game-reducer.ts` | Add SYNC_MOVE/SYNC_COMBAT, gate local logic behind guest mode |
| `src/screens/CampaignSelectScreen.tsx` | Ensure gameStatePda set before gameplay |
| `src/contexts/SessionContext.tsx` | Better error propagation for null guards |
| `src/screens/CombatScreen.tsx` | Read combat from on-chain data |
| `src/contexts/CombatContext.tsx` | Accept on-chain combat results |

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Latency: awaiting confirmation adds ~400ms per move (devnet) | Show tile loading indicator; batch moves if needed |
| Transaction failures block gameplay | Retry logic with exponential backoff; clear error messages |
| Combat event parsing may fail | Fallback to state-diff based combat summary |
| Night enemy movement happens server-side, client can't animate | Fetch MapEnemies before/after to compute enemy deltas for animation |
| Guest mode regression | Gate all on-chain logic behind mode check; keep existing reducer for guest |
