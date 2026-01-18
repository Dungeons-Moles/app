# Quickstart: Gameplay State Integration with Burner Wallet

**Feature**: 005-gameplay-burner-integration
**Date**: 2025-01-17

## Prerequisites

1. **Completed Features**:
   - 004-solana-frontend-integration (wallet connection, session management)
   - 002-gameplay-state-tracking deployed on devnet (solana-programs repo)

2. **Environment**:
   ```bash
   # Verify node and npm
   node --version  # Should be 18+
   npm --version   # Should be 9+

   # Verify Solana CLI (for IDL copying)
   solana --version
   anchor --version  # Should be 0.30+
   ```

3. **Devnet Configuration**:
   - Player profile created on devnet
   - Main wallet funded with ~0.1 SOL (for burner funding + transactions)

## Setup

### 1. Copy Gameplay-State IDL

```bash
# From app directory
mkdir -p src/services/solana/idl

# Copy IDL from solana-programs
cp ../solana-programs/target/idl/gameplay_state.json src/services/solana/idl/

# Generate TypeScript types (optional - can use manual types)
# anchor idl types -o src/services/solana/types/gameplay_state.ts ../solana-programs/target/idl/gameplay_state.json
```

### 2. Verify Program IDs

Check that program IDs in the app match deployed programs:

```typescript
// src/services/solana/constants.ts
export const GAMEPLAY_STATE_PROGRAM_ID = new PublicKey(
  'YOUR_DEPLOYED_GAMEPLAY_STATE_PROGRAM_ID'  // From solana-programs deployment
);
```

### 3. Install Dependencies (if not already)

No new dependencies required. Verify existing:
```bash
npm list @coral-xyz/anchor @solana/web3.js expo-secure-store
```

## Development Workflow

### Running the App

```bash
# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

### Testing Burner Wallet Flow

1. **Connect Main Wallet**:
   - Open app, tap "Connect Wallet"
   - Select your devnet wallet (Phantom, Solflare, etc.)

2. **Start Game Session**:
   - Navigate to campaign selection
   - Select unlocked level
   - Tap "Start Game"
   - **Observe**: Single wallet signature request for burner funding

3. **Play Without Signatures**:
   - Move player by tapping adjacent tiles
   - **Observe**: No signature prompts during gameplay
   - **Observe**: On-chain state updates within 2 seconds

4. **End Game Session**:
   - Complete the run or tap "End Game"
   - **Observe**: Single wallet signature for profile update
   - **Observe**: Burner SOL returned to main wallet

### Debugging

**Check Burner Balance**:
```typescript
// In browser console (web) or React Native Debugger
import { useConnection } from './contexts/WalletContext';
import { loadBurnerWallet } from './services/solana/burnerWallet';

const { connection } = useConnection();
const burner = await loadBurnerWallet(mainWalletAddress);
const balance = await connection.getBalance(burner.publicKey);
console.log('Burner balance:', balance / LAMPORTS_PER_SOL, 'SOL');
```

**Check On-Chain GameState**:
```typescript
import { getGameStatePda } from './services/solana/gameplayState';

const [gameStatePda] = getGameStatePda(sessionPda);
const gameState = await program.account.gameState.fetch(gameStatePda);
console.log('GameState:', gameState);
```

**View Transaction Logs**:
```bash
# Watch for gameplay-state transactions on devnet
solana logs -u devnet YOUR_GAMEPLAY_STATE_PROGRAM_ID
```

## Verification Steps

### Manual Testing Checklist

| Step | Expected Result | Pass? |
|------|-----------------|-------|
| Connect wallet | Wallet shows connected | |
| Start game | Single signature prompt, burner funded | |
| Move to floor tile | Move executes, no signature | |
| Dig through wall | Move executes with correct cost, no signature | |
| Check on-chain state | Position matches displayed position | |
| Run out of moves | Phase transitions automatically | |
| Complete week | Gear slots increase | |
| End game | Profile updated, burner drained | |
| Check main wallet | Received burner refund | |
| Close app mid-session | Reopening detects session | |
| Resume session | Gameplay continues | |
| Abandon session | Burner drained, can start new | |

### Integration Points

1. **SessionContext Integration**:
   - `startGame()` creates burner and GameState
   - `endGame()` closes GameState and drains burner

2. **GameContext Integration**:
   - Movement commands call `movePlayer` via burner
   - Stats reflect on-chain GameState

3. **ProfileContext Integration**:
   - `totalRuns` incremented after session end
   - `currentLevel` updated if level completed

## Common Issues

### "Burner wallet not found"
- Check expo-secure-store access permissions
- Verify main wallet address matches stored burner

### "Insufficient funds for transaction"
- Burner balance too low
- Top up burner or start new session with more SOL

### "Session not active"
- GameSession may have been ended
- Check session state before gameplay operations

### "Transaction timeout"
- Network congestion or RPC issues
- Transaction is queued for retry
- Check connection status indicator

## Performance Targets

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Transaction confirmation | <2 seconds | Console log timestamps |
| State sync | <2 seconds after confirm | Compare local vs on-chain |
| UI responsiveness | 60 FPS | React Native performance monitor |
| Wallet signatures per session | 2 (start + end) | Count signature prompts |

## Next Steps

After basic verification:
1. Run full test suite: `npm test`
2. Test offline scenarios (airplane mode)
3. Test low balance warnings
4. Test session recovery after app crash
