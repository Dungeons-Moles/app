# Dungeons & Moles App

React Native + Expo frontend for Dungeons & Moles.

This client connects to the on-chain programs in `../solana-programs` and supports PvE runs plus PvP modes (Pit Draft, Duels, Gauntlet), including combat replay visualization and mode-specific history/ranking screens.

## Features

- Wallet connection and sessionSigner-wallet session flow
- On-chain session lifecycle (start, resume, switch, abandon, cleanup)
- PvE campaign gameplay with map exploration, POIs, enemies, and boss fights
- Pit Draft PvP mode (queue, match, instant combat replay)
- Duels PvP mode (async queue + seed-matched run flow)
- Gauntlet PvP mode (5-week async mode with echo fights, history, ranking)
- Combat replay UI with deterministic log playback
- Controller/gamepad navigation across all screens (via psg1-sim)
- Responsive compact and wide screen variants
- Mobile and web support through Expo

## Tech Stack

- React Native 0.81 + Expo SDK 54
- TypeScript
- @coral-xyz/anchor + @solana/web3.js
- React Navigation
- React Native Skia (combat/game rendering)
- psg1-sim (console simulator with gamepad support)

## Prerequisites

- Node.js 18+
- npm
- Running Solana programs from `../solana-programs`

Optional for mobile wallet flow:

- Android/iOS device or emulator
- Solana wallet app compatible with Mobile Wallet Adapter

## Environment Variables

Set these in your shell (or `.env`) before running the app:

```bash
EXPO_PUBLIC_SOLANA_CLUSTER=devnet
EXPO_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899

EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_FIELD_ENEMIES_PROGRAM_ID=<pubkey>

EXPO_PUBLIC_TREASURY_PUBKEY=<pubkey>
```

Notes:

- Program IDs must match your deployed programs from `../solana-programs`.
- For local development, point `EXPO_PUBLIC_SOLANA_RPC_URL` to your local validator.

## Backend Initialization Dependency

Before using PvP/PvE flows in the app, initialize accounts in `../solana-programs`:

```bash
cd ../solana-programs
anchor run init
```

If this is not done, some instructions fail with `AccountNotInitialized` errors.

## Install and Run

```bash
npm install
npm start
```

### Android

```bash
npm run android
```

### iOS

```bash
npm run ios
```

### Web

```bash
npm run web
```

## Scripts

```bash
npm run typecheck
npm run lint
npm run lint:fix
npm run format
npm test
npm run test:watch
npm run test:coverage
npm run test:ci
```

## Project Structure

```text
src/
  components/
    combat/
    game/
  contexts/
    WalletContext.tsx
    SessionContext.tsx
    CombatContext.tsx
    ProfileContext.tsx
  hooks/
    usePitDraft.ts
    useDuels.ts
    useGauntlet.ts
    useGameplayState.ts
    useSessionManager.ts
  screens/
    HubScreen.tsx
    GameScreen.tsx
    CombatScreen.tsx
    PitDraftScreen.tsx
    PitDraftHistoryScreen.tsx
    DuelsScreen.tsx
    DuelsHistoryScreen.tsx
    GauntletScreen.tsx
    GauntletHistoryScreen.tsx
    GauntletRankingScreen.tsx
  services/solana/
    gameplayState.ts
    pitDraft.ts
    duels.ts
    gauntlet.ts
    idl/
```

## Troubleshooting

- `AccountNotInitialized` / `0xbc4`:
Run `anchor run init` in `../solana-programs` and verify program IDs in env vars.

- Program account missing / `has no data`:
Confirm you deployed the latest programs and copied fresh program IDs into app env vars.

- Wallet/sessionSigner issues:
Reconnect wallet and ensure the active sessionSigner session is recoverable in-app.

- Metro cache issues:

```bash
npx expo start --clear
```
