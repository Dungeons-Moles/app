# Data Model: Core Gameplay Loop Integration

**Branch**: `007-core-loop-integration` | **Date**: 2026-01-22

## Entities

### On-Chain Entities (Fetched from Solana)

#### GameSession (Extended)

Game session account with multi-session support and active item pool.

**PDA Seeds**: `["session", player.as_ref(), &[campaign_level]]`
**Program**: session-manager

| Field          | Type           | Description         | Notes               |
| -------------- | -------------- | ------------------- | ------------------- |
| player         | PublicKey      | Main wallet address | Immutable           |
| sessionId      | u64            | Unique session ID   | From counter        |
| campaignLevel  | u8             | Level 1-40          | PDA seed            |
| burnerWallet   | PublicKey      | Burner for gameplay | Funded at start     |
| activeItemPool | Uint8Array[10] | 80-bit item filter  | Copied from profile |
| stateHash      | Uint8Array[32] | State commitment    | For verification    |
| createdAt      | i64            | Unix timestamp      | Immutable           |

---

#### GameState (Extended)

Gameplay state with enhanced phase tracking.

**PDA Seeds**: `["game_state", session_pda.as_ref()]`
**Program**: gameplay-state

| Field          | Type      | Description        | Range             |
| -------------- | --------- | ------------------ | ----------------- |
| player         | PublicKey | Burner wallet      | From session      |
| session        | PublicKey | Parent session PDA | Immutable         |
| positionX      | u8        | Current X          | 0-8               |
| positionY      | u8        | Current Y          | 0-8               |
| mapWidth       | u8        | Map width          | 9                 |
| mapHeight      | u8        | Map height         | 9                 |
| hp             | i16       | Current HP         | Can be negative   |
| maxHp          | i16       | Max HP             | Default 10        |
| atk            | i16       | Attack             | Allows negative   |
| arm            | i16       | Armor              | Allows negative   |
| spd            | i16       | Speed              | Allows negative   |
| dig            | i16       | Dig efficiency     | Affects wall cost |
| gearSlots      | u8        | Gear capacity      | 4 → 6 → 8         |
| week           | u8        | Current week       | 1-3               |
| phase          | Phase     | Time phase         | 0-5               |
| movesRemaining | u8        | Moves left         | 0-50              |
| totalMoves     | u32       | Total moves made   | Accumulates       |
| bossFightReady | boolean   | Boss trigger       | Set on W3N3 end   |

---

#### MapEnemies (New)

Enemy positions and state on the current map.

**PDA Seeds**: `["enemies", session_pda.as_ref()]`
**Program**: field-enemies

| Field   | Type    | Description      | Range  |
| ------- | ------- | ---------------- | ------ |
| enemies | Enemy[] | Array of enemies | Max 10 |

**Enemy Structure**:
| Field | Type | Description |
|-------|------|-------------|
| x | u8 | Position X |
| y | u8 | Position Y |
| archetype | u8 | Enemy type (0-11) |
| currentHp | i16 | Remaining HP |
| alive | boolean | Still on map |

---

#### MapPois (New)

POI positions and state on the current map.

**PDA Seeds**: `["pois", session_pda.as_ref()]`
**Program**: poi-system

| Field | Type  | Description   | Range  |
| ----- | ----- | ------------- | ------ |
| pois  | Poi[] | Array of POIs | Varies |

**Poi Structure**:
| Field | Type | Description |
|-------|------|-------------|
| x | u8 | Position X |
| y | u8 | Position Y |
| poiType | u8 | POI type enum |
| consumed | boolean | Already used |

---

#### PlayerProfile (Extended)

Player profile with run economy and item progression.

**PDA Seeds**: `["player", owner.as_ref()]`
**Program**: player-profile

| Field                | Type           | Description        | Range             |
| -------------------- | -------------- | ------------------ | ----------------- |
| owner                | PublicKey      | Wallet address     | Immutable         |
| name                 | string         | Display name       | Max 32 chars      |
| availableRuns        | u32            | Runs remaining     | 0+                |
| totalRuns            | u32            | Lifetime runs      | Accumulates       |
| highestLevelUnlocked | u8             | Max playable level | 1-40              |
| unlockedItems        | Uint8Array[10] | 80-bit unlock mask | Starter = 40 bits |
| activeItemPool       | Uint8Array[10] | 80-bit active mask | ⊆ unlockedItems   |

---

### Local Entities (Client State)

#### ActiveSession

Client-side session reference for UI display and navigation.

| Field          | Type   | Description        | Source          |
| -------------- | ------ | ------------------ | --------------- |
| sessionPda     | string | Session PDA base58 | Derived         |
| level          | number | Campaign level     | From session    |
| week           | number | Current week       | From gameState  |
| phase          | Phase  | Current phase      | From gameState  |
| positionX      | number | Player X           | From gameState  |
| positionY      | number | Player Y           | From gameState  |
| movesRemaining | number | Moves left         | From gameState  |
| lastPlayedAt   | number | Last activity      | Local timestamp |

---

#### CombatReplay

Buffered combat events for animation playback.

| Field         | Type                    | Description           |
| ------------- | ----------------------- | --------------------- |
| signature     | string                  | Transaction signature |
| combatStarted | CombatStartedEvent      | Initial state         |
| turns         | TurnExecutedEvent[]     | Turn-by-turn data     |
| statusEffects | StatusAppliedEvent[]    | Status applications   |
| combatEnded   | CombatEndedEvent        | Final result          |
| isBoss        | boolean                 | Boss combat flag      |
| bossIntro     | BossCombatStartedEvent? | Boss intro data       |

---

#### CombatReplayState (State Machine)

Animation state for combat overlay.

| State  | Description              | Next States |
| ------ | ------------------------ | ----------- |
| idle   | No combat                | intro       |
| intro  | Show combatants          | turns       |
| turns  | Animating turns          | outro       |
| outro  | Victory/defeat animation | result      |
| result | Show summary             | idle        |

---

#### NightMovementBatch

Enemy movements during night phase.

| Field        | Type              | Description        |
| ------------ | ----------------- | ------------------ |
| movements    | EnemyMovedEvent[] | Ordered movements  |
| currentIndex | number            | Animation progress |
| complete     | boolean           | All animated       |

---

#### ItemCollection

Player's item progression display.

| Field           | Type     | Description                    |
| --------------- | -------- | ------------------------------ |
| starterItems    | number[] | Indices 0-39 (always unlocked) |
| unlockedItems   | number[] | All unlocked indices           |
| lockedItems     | number[] | Indices 40-79 still locked     |
| totalUnlocked   | number   | Count of unlocked              |
| percentComplete | number   | Progress 0-100                 |

---

#### RunEconomyState

Run purchase and display state.

| Field           | Type    | Description           |
| --------------- | ------- | --------------------- |
| availableRuns   | number  | From profile          |
| priceInLamports | number  | 1,000,000 (0.001 SOL) |
| runsPerPurchase | number  | 20                    |
| purchasing      | boolean | Transaction pending   |

---

### Event Entities (Parsed from Logs)

#### CombatStartedEvent

| Field          | Type   | Description       |
| -------------- | ------ | ----------------- |
| player         | string | Player pubkey     |
| playerHp       | number | Starting HP       |
| playerAtk      | number | Player ATK        |
| enemyArchetype | number | Enemy type        |
| enemyHp        | number | Enemy starting HP |
| enemyAtk       | number | Enemy ATK         |

---

#### TurnExecutedEvent

| Field        | Type   | Description      |
| ------------ | ------ | ---------------- |
| turn         | number | Turn number      |
| playerHp     | number | Player HP after  |
| enemyHp      | number | Enemy HP after   |
| playerDamage | number | Damage to enemy  |
| enemyDamage  | number | Damage to player |

---

#### StatusAppliedEvent

| Field      | Type                | Description         |
| ---------- | ------------------- | ------------------- |
| target     | 'player' \| 'enemy' | Who received        |
| effectType | StatusEffect        | Chill/Shrapnel/Rust |
| stacks     | number              | Stack count         |

---

#### CombatEndedEvent

| Field         | Type    | Description      |
| ------------- | ------- | ---------------- |
| player        | string  | Player pubkey    |
| playerWon     | boolean | Victory flag     |
| finalPlayerHp | number  | Player HP at end |
| finalEnemyHp  | number  | Enemy HP at end  |
| goldEarned    | number  | Gold reward      |
| turnsTaken    | number  | Total turns      |

---

#### BossCombatStartedEvent

| Field  | Type   | Description      |
| ------ | ------ | ---------------- |
| player | string | Player pubkey    |
| bossId | string | 12-char boss ID  |
| bossHp | number | Boss starting HP |
| week   | number | Week 1/2/3       |

---

#### EnemyMovedEvent

| Field      | Type   | Description       |
| ---------- | ------ | ----------------- |
| enemyIndex | number | Enemy array index |
| fromX      | number | Starting X        |
| fromY      | number | Starting Y        |
| toX        | number | Ending X          |
| toY        | number | Ending Y          |

---

#### PlayerDefeatedEvent

| Field    | Type              | Description   |
| -------- | ----------------- | ------------- |
| player   | string            | Player pubkey |
| killedBy | 'enemy' \| 'boss' | Death source  |
| finalHp  | number            | Final HP (≤0) |

---

#### LevelCompletedEvent

| Field      | Type   | Description     |
| ---------- | ------ | --------------- |
| player     | string | Player pubkey   |
| level      | number | Completed level |
| totalMoves | number | Moves used      |
| goldEarned | number | Total gold      |

---

#### ItemUnlockedEvent

| Field          | Type   | Description          |
| -------------- | ------ | -------------------- |
| owner          | string | Player pubkey        |
| itemIndex      | number | 0-79                 |
| levelCompleted | number | Level that triggered |
| timestamp      | number | Unix timestamp       |

---

## State Transitions

### Session Lifecycle

```
                     ┌─────────────────────────────────────────────────────┐
                     │                                                     │
                     ▼                                                     │
┌──────────┐   ┌───────────┐   ┌────────┐   ┌─────────┐   ┌──────────────┤
│ NO_SESSION│──▶│ CREATING  │──▶│ ACTIVE │──▶│ ENDING  │──▶│   CLOSED     │
└──────────┘   └───────────┘   └────────┘   └─────────┘   └──────────────┘
                     │              │              │
                     │              │              │
                ┌────▼────┐   ┌────▼────┐   ┌─────▼─────┐
                │ FAILED  │   │ PAUSED  │   │ ABANDONED │
                └─────────┘   └─────────┘   └───────────┘
```

### Combat Replay Flow

```
Transaction confirmed with combat
         │
         ▼
[Parse events from logs]
         │
         ▼
[Buffer CombatReplay]
         │
         ▼
[Show CombatOverlay]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                    INTRO (500ms)                        │
│  Show player vs enemy/boss, starting HP                │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                 TURNS (300ms each)                      │
│  For each TurnExecutedEvent:                           │
│    - Show damage numbers                               │
│    - Update HP bars                                    │
│    - Show status effects if applied                    │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                    OUTRO (500ms)                        │
│  Victory flash or defeat animation                     │
└────────────────────────────────────────────────────────┘
         │
         ▼
[Dismiss overlay → Death/Victory screen if applicable]
```

### Night Movement Flow

```
Player initiates move during night phase
         │
         ▼
[Send move_with_combat transaction]
         │
         ▼
[Transaction confirmed]
         │
         ▼
[Parse EnemyMoved events]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│              ANIMATE ENEMIES (200ms each)              │
│  For each EnemyMovedEvent:                             │
│    - Animate enemy from (fromX,fromY) to (toX,toY)     │
│    - Check if combat triggered                         │
└────────────────────────────────────────────────────────┘
         │
         ▼
[Animate player movement]
         │
         ▼
[If combat events present → Combat Replay Flow]
```

### Item Unlock Flow

```
Player defeats Week 3 boss (first time on this level)
         │
         ▼
[LevelCompletedEvent emitted]
         │
         ▼
[ItemUnlockedEvent emitted]
         │
         ▼
[Parse item index from event]
         │
         ▼
[Show Victory screen with level unlock]
         │
         ▼
┌────────────────────────────────────────────────────────┐
│              ITEM UNLOCK ANIMATION                      │
│  - Item card slides in                                 │
│  - Glow effect                                         │
│  - Show name, set, preview stats                       │
│  - Duration: 2 seconds                                 │
└────────────────────────────────────────────────────────┘
         │
         ▼
[User dismisses → Return to Hub]
```

## Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MAIN WALLET                                    │
│                    (Mobile Wallet Adapter)                               │
│  Signs: session creation, run purchase, session end (profile update)   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │ funds (session start)
                                │ receives drain (session end)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          BURNER WALLET                                   │
│                    (Local Keypair - Ephemeral)                           │
│  Signs: move_with_combat, interact_poi, all gameplay transactions       │
└─────────┬───────────────────────────────────────────────────────────────┘
          │
          │ owns
          ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  GameSession    │────▶│   GameState     │     │ PlayerProfile   │
│  (per level)    │     │  (position,     │     │ (runs, items,   │
│                 │     │   stats, phase) │     │  levels)        │
│  PDA: [session, │     │                 │     │                 │
│   player, level]│     │ PDA: [game_state│     │ PDA: [player,   │
└─────────────────┘     │   session]      │     │   owner]        │
          │             └─────────────────┘     └─────────────────┘
          │
          ├─────────────────┬─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   MapEnemies    │ │    MapPois      │ │ PlayerInventory │
│  (positions,    │ │  (positions,    │ │ (equipped gear, │
│   HP, alive)    │ │   consumed)     │ │  Basic Pickaxe) │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Validation Rules

### Session Creation Validation (Client-Side)

- `availableRuns > 0`: Must have runs to start
- `campaignLevel <= highestLevelUnlocked`: Level must be unlocked
- `campaignLevel >= 1 && campaignLevel <= 40`: Valid range
- No existing session on same level: Check PDA exists

### Movement Validation (Client-Side, Pre-Submission)

- Adjacent: `|targetX - x| + |targetY - y| == 1`
- In bounds: `0 <= targetX < 9`, `0 <= targetY < 9`
- Sufficient moves: `movesRemaining >= moveCost`
- Not boss ready: `!bossFightReady`

### POI Interaction Validation (Client-Side)

- On POI tile: `poi.x == playerX && poi.y == playerY`
- Not consumed: `!poi.consumed`

### Run Purchase Validation

- Sufficient SOL: `balance >= 1,000,000 lamports`

### Item Pool Validation

- Active pool ⊆ Unlocked items: Every bit in activePool must be set in unlockedItems
- Minimum 40 items: `countBits(activePool) >= 40`
