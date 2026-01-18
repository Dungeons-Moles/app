# Data Model: Gameplay State Integration with Burner Wallet

**Branch**: `005-gameplay-burner-integration` | **Date**: 2025-01-17

## Entities

### BurnerWallet (Local Storage)

Ephemeral keypair stored securely on device for gasless gameplay transactions.

**Storage**: `expo-secure-store` key: `burner_wallet`

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| secretKey | string | Base58-encoded Keypair secret key | 64 bytes decoded |
| mainWalletAddress | string | Associated main wallet public key | Valid Solana address |
| createdAt | number | Unix timestamp of creation | > 0 |

**Lifecycle**:
- Created: When user starts a new game session
- Used: For all gameplay transactions (move_player, modify_stat)
- Cleared: After funds drained at session end

---

### GameState (On-Chain - Fetched from Solana)

Player's gameplay state from the gameplay-state program. Mirrored locally for UI display.

**PDA Seeds**: `["game_state", session_pda.as_ref()]`
**Program**: gameplay-state (002-gameplay-state-tracking)

| Field | Type | Description | Range |
|-------|------|-------------|-------|
| player | PublicKey | Session owner (burner wallet) | Valid Solana address |
| session | PublicKey | Linked GameSession PDA | Valid PDA |
| positionX | number | Current X coordinate | 0 ≤ x < mapWidth |
| positionY | number | Current Y coordinate | 0 ≤ y < mapHeight |
| mapWidth | number | Map boundary X | Immutable after init |
| mapHeight | number | Map boundary Y | Immutable after init |
| hp | number | Current health points | 0 ≤ hp ≤ maxHp |
| maxHp | number | Maximum health points | Default: 10 |
| atk | number | Attack stat | Allows negative |
| arm | number | Armor stat | Allows negative |
| spd | number | Speed stat | Allows negative |
| dig | number | Digging stat | Affects dig cost |
| gearSlots | number | Gear slot capacity | 4 → 6 → 8 |
| week | number | Current week | 1 ≤ week ≤ 3 |
| phase | Phase | Current time phase | Enum value |
| movesRemaining | number | Moves left in phase | 0-50 |
| totalMoves | number | Total moves made | Accumulates |
| bossFightReady | boolean | Boss fight triggered | Set when W3N3 complete |

---

### Phase (Enum)

Time phase enumeration. Matches on-chain Phase enum from gameplay-state program.

| Variant | Value | Move Allowance | Next Phase |
|---------|-------|---------------|------------|
| Day1 | 0 | 50 | Night1 |
| Night1 | 1 | 30 | Day2 |
| Day2 | 2 | 50 | Night2 |
| Night2 | 3 | 30 | Day3 |
| Day3 | 4 | 50 | Night3 |
| Night3 | 5 | 30 | Week end or boss |

---

### StatType (Enum)

Stat type enumeration for modify_stat instruction.

| Variant | Value | Description |
|---------|-------|-------------|
| Hp | 0 | Current health |
| MaxHp | 1 | Maximum health |
| Atk | 2 | Attack power |
| Arm | 3 | Armor |
| Spd | 4 | Speed |
| Dig | 5 | Digging efficiency |

---

### BurnerState (UI State Machine)

State machine for burner wallet lifecycle.

| State | Description | Transitions To |
|-------|-------------|----------------|
| idle | No burner exists | funding |
| funding | Awaiting main wallet signature | active, failed |
| active | Burner funded and ready | draining, failed |
| draining | Returning funds to main | idle, failed |
| failed | Error occurred | idle (retry/dismiss) |

---

### SyncStatus (UI State)

State for tracking on-chain synchronization.

| Field | Type | Description |
|-------|------|-------------|
| status | 'synced' \| 'syncing' \| 'offline' \| 'error' | Current sync state |
| lastSyncAt | number | Unix timestamp of last successful sync |
| pendingTransactions | number | Queued offline transactions |

---

### QueuedTransaction (Local Storage)

Offline transaction queue for network resilience.

**Storage**: `AsyncStorage` key: `tx_queue`

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique transaction ID |
| type | 'move' \| 'modifyStat' \| 'close' | Transaction type |
| params | object | Transaction parameters |
| timestamp | number | When transaction was queued |
| retries | number | Number of retry attempts |

---

## State Transitions

### Burner Wallet Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────┐      ┌─────────┐      ┌────────┐      ┌─────────┤
│ IDLE │─────>│ FUNDING │─────>│ ACTIVE │─────>│DRAINING │
└──────┘      └────┬────┘      └────┬───┘      └────┬────┘
    ▲              │                │               │
    │              │                │               │
    │         ┌────▼────┐           │               │
    └─────────│ FAILED  │<──────────┴───────────────┘
              └─────────┘
```

### Session Start Flow

```
User clicks "Start Game"
        │
        ▼
[Check for existing burner] ──yes──> [Offer Resume/Abandon]
        │                                      │
        no                                     │
        │                                      │
        ▼                                      ▼
[Create burner keypair]              [Resume: use existing]
        │                            [Abandon: drain, create new]
        ▼
[Create fund transaction]
        │
        ▼
[Main wallet signs] ←── User signature required
        │
        ▼
[Burner funded]
        │
        ▼
[Initialize GameSession on-chain]
        │
        ▼
[Initialize GameState on-chain] ←── Burner signs (automatic)
        │
        ▼
[Session active, gameplay begins]
```

### Movement Flow

```
User taps direction
        │
        ▼
[Calculate target position]
        │
        ▼
[Check if wall tile] ──yes──> [Calculate dig cost: max(2, 6-DIG)]
        │                              │
        no                             │
        │                              │
        ▼                              ▼
[Move cost = 1]            [Move cost = dig cost]
        │                              │
        └──────────┬───────────────────┘
                   │
                   ▼
[Optimistic UI update] ←── Immediate visual feedback
        │
        ▼
[Send move_player transaction] ←── Burner signs (automatic)
        │
        ├──offline──> [Queue transaction]
        │
        ▼
[Wait for confirmation]
        │
        ▼
[Fetch on-chain state]
        │
        ▼
[Reconcile local/on-chain] ←── Trust on-chain if differs
```

### Session End Flow

```
Game ends (victory/defeat/abandon)
        │
        ▼
[Close GameState on-chain] ←── Burner signs
        │
        ▼
[End GameSession on-chain] ←── Burner signs
        │
        ▼
[Update PlayerProfile] ←── Main wallet signs (single signature)
        │
        ▼
[Drain burner to main wallet] ←── Burner signs (automatic)
        │
        ▼
[Clear local burner data]
        │
        ▼
[Session complete]
```

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Wallet                             │
│                    (Mobile Wallet Adapter)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ funds (1 signature)
                             │ receives drain
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Burner Wallet                             │
│                   (Local Keypair - Ephemeral)                   │
└──────────┬────────────────┬─────────────────────────────────────┘
           │                │
           │ owns           │ signs gameplay transactions
           │                │
           ▼                ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  GameSession     │  │   GameState      │  │  PlayerProfile   │
│  (001-solana)    │  │ (002-gameplay)   │  │  (001-solana)    │
│                  │  │                  │  │                  │
│  - player        │◄─┤  - session       │  │  - totalRuns     │
│  - campaignLevel │  │  - position      │  │  - currentLevel  │
│  - stateHash     │  │  - stats         │  │                  │
└──────────────────┘  │  - phase/week    │  └──────────────────┘
                      │  - movesRemaining│
                      └──────────────────┘
```

## Validation Rules

### Burner Wallet Validation
- secretKey must decode to valid 64-byte Keypair
- mainWalletAddress must match connected wallet
- Balance must be sufficient for transactions (>5000 lamports)

### Movement Validation (Client-Side, Pre-Submission)
- Target position must be adjacent: `|target_x - x| + |target_y - y| == 1`
- Target position must be in bounds: `0 ≤ x < mapWidth`, `0 ≤ y < mapHeight`
- Sufficient moves: `movesRemaining >= moveCost`
- Not boss fight ready: `bossFightReady == false`

### State Synchronization Rules
- On-chain state is always source of truth
- Local state may differ briefly during optimistic updates
- Reconcile within 2 seconds of transaction confirmation
- If states diverge, trust on-chain and refresh local

### Transaction Queue Rules
- Maximum 3 retries per transaction
- Retry delay: 2 seconds between attempts
- Queue processed FIFO
- Failed transactions after max retries alert user
