# Quickstart: Solana Frontend Integration

**Feature**: 004-solana-frontend-integration
**Date**: 2025-01-15

## Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Android Emulator or iOS Simulator (or physical device)
- Solana wallet app (Phantom, Solflare) installed on device
- Solana CLI (for devnet interactions)

## Project Setup

### 1. Install New Dependencies

```bash
cd /home/ailton/Work/dungeons-and-moles/app
npm install @coral-xyz/anchor
```

### 2. Copy IDL Files

Copy the generated IDL files from the Solana programs to the app:

```bash
mkdir -p src/services/solana/idl

# Copy from solana-programs (after anchor build)
cp ../solana-programs/target/idl/player_profile.json src/services/solana/idl/
cp ../solana-programs/target/idl/session_manager.json src/services/solana/idl/
cp ../solana-programs/target/idl/map_generator.json src/services/solana/idl/
```

### 3. Configure Program IDs

Create `src/services/solana/config.ts`:

```typescript
import { PublicKey } from '@solana/web3.js';

export const SOLANA_CONFIG = {
  cluster: 'devnet' as const,
  rpcUrl: 'https://api.devnet.solana.com',

  // Program IDs (update after deployment)
  programs: {
    playerProfile: new PublicKey('YOUR_PLAYER_PROFILE_PROGRAM_ID'),
    sessionManager: new PublicKey('YOUR_SESSION_MANAGER_PROGRAM_ID'),
    mapGenerator: new PublicKey('YOUR_MAP_GENERATOR_PROGRAM_ID'),
  },
};
```

### 4. Generate TypeScript Types

Generate TypeScript types from IDL using Anchor:

```bash
# From solana-programs directory after build
npx anchor idl types target/idl/player_profile.json -o ../app/src/services/solana/types/player_profile.ts
npx anchor idl types target/idl/session_manager.json -o ../app/src/services/solana/types/session_manager.ts
npx anchor idl types target/idl/map_generator.json -o ../app/src/services/solana/types/map_generator.ts
```

## Development Workflow

### Start the App

```bash
# Start Expo dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

### Test Wallet Connection

1. Open the app on device/emulator
2. Tap "Connect Wallet" on AccountScreen
3. Select wallet app (Phantom/Solflare)
4. Approve connection in wallet app
5. Verify wallet address appears in app

### Fund Test Wallet

```bash
# Get devnet SOL for testing
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet
```

## Quick Verification Steps

### 1. Profile Creation Flow

```typescript
// Test profile creation in ProfileCreationScreen
const { createProfile, isLoading, error } = usePlayerProfile();

const handleCreate = async () => {
  const result = await createProfile('TestPlayer');
  if (result.success) {
    console.log('Profile created:', result.signature);
  } else {
    console.error('Failed:', result.error);
  }
};
```

**Expected behavior**:
1. User enters name "TestPlayer"
2. Wallet prompts for transaction approval
3. Transaction confirms within 5 seconds
4. User redirected to HubScreen with profile displayed

### 2. Profile Display

```typescript
// Test profile fetch in HubScreen
const { profile, isLoading, exists } = usePlayerProfile();

useEffect(() => {
  if (profile) {
    console.log('Profile:', {
      name: profile.name,
      totalRuns: profile.totalRuns,
      currentLevel: profile.currentLevel,
      unlockedTier: profile.unlockedTier,
    });
  }
}, [profile]);
```

### 3. Campaign Level Selection

```typescript
// Test campaign levels in CampaignSelectScreen
const { getCampaignLevels } = useMapGenerator();
const { profile } = usePlayerProfile();

const levels = getCampaignLevels(
  profile?.currentLevel ?? 0,
  profile?.unlockedTier ?? 0
);

// Verify first 40 levels are unlocked for new player
console.log('Unlocked levels:', levels.filter(l => l.isUnlocked).length);
```

### 4. Tier Unlock Payment

```typescript
// Test tier unlock flow
const { unlockNextTier, profile } = usePlayerProfile();

const handleUnlock = async () => {
  // Requires player at level 39 (tier boundary)
  const result = await unlockNextTier();
  if (result.success) {
    console.log('Tier unlocked:', result.signature);
    // Profile should now have unlockedTier: 1
  }
};
```

### 5. Session Management

```typescript
// Test session lifecycle
const { startSession, delegateSession, endSession, status } = useGameSession();

// Start session for level 5
await startSession(5);
// status should transition: IDLE → STARTING → DELEGATING → ACTIVE

// End session with victory
await endSession(new Uint8Array(32), true);
// status should transition: ACTIVE → ENDING → IDLE
```

### 6. Map Seed Verification

```typescript
// Test seed fetching
const { getSeed } = useMapGenerator();

const seed = await getSeed(5);
console.log('Seed for level 5:', seed?.toString());

// Verify deterministic generation
const map1 = generateMap(seed, 5);
const map2 = generateMap(seed, 5);
console.log('Maps match:', JSON.stringify(map1) === JSON.stringify(map2));
```

## Offline Mode Testing

### Test Cached Mode

1. Connect wallet and load profile
2. Enable airplane mode on device
3. Restart app
4. Verify profile displays from cache
5. Verify "Cached" indicator appears
6. Start game (uses random seed)
7. Disable airplane mode
8. Verify sync indicator appears

### Test Guest Mode

1. Clear app data
2. Enable airplane mode
3. Open app
4. Verify "Guest Mode" indicator
5. Start game (no profile required)
6. Complete run (no results saved)

## Common Issues

### "Wallet not connected" Error
- Ensure wallet app is installed
- Check devnet is selected in wallet
- Try disconnecting and reconnecting

### "Insufficient funds" Error
- Run `solana airdrop 2 YOUR_ADDRESS --url devnet`
- Wait for airdrop to confirm

### "Profile already exists" Error
- Profile already created for this wallet
- Use a different wallet or clear on-chain state

### Transaction Timeout
- Devnet can be slow; increase timeout
- Check Solana network status
- Retry transaction

## Directory Structure After Setup

```
src/
├── services/
│   └── solana/
│       ├── config.ts           # Program IDs and cluster config
│       ├── programs.ts         # Anchor program instances
│       ├── cache.ts            # Profile caching utilities
│       ├── types.ts            # Shared types
│       ├── idl/
│       │   ├── player_profile.json
│       │   ├── session_manager.json
│       │   └── map_generator.json
│       └── types/
│           ├── player_profile.ts
│           ├── session_manager.ts
│           └── map_generator.ts
├── contexts/
│   ├── WalletContext.tsx       # Extended with signAndSendTransaction
│   ├── ProfileContext.tsx      # New profile state management
│   └── GameContext.tsx         # Extended with session integration
├── hooks/
│   ├── usePlayerProfile.ts     # Profile program hook
│   ├── useGameSession.ts       # Session program hook
│   └── useMapGenerator.ts      # Map generator hook
├── screens/
│   ├── ProfileCreationScreen.tsx
│   ├── CampaignSelectScreen.tsx
│   └── HubScreen.tsx           # Modified for profile display
└── components/
    └── profile/
        ├── ProfileCard.tsx
        └── TierUnlockModal.tsx
```

## Environment Variables

Create `.env` (not committed):

```bash
# Solana cluster
EXPO_PUBLIC_SOLANA_CLUSTER=devnet
EXPO_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# Program IDs (after deployment)
EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID=
EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID=
EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID=
```

## Testing Commands

```bash
# Run all tests
npm test

# Run specific hook tests
npm test -- src/hooks/usePlayerProfile.test.ts
npm test -- src/hooks/useGameSession.test.ts
npm test -- src/hooks/useMapGenerator.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```
