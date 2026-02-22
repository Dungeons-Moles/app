# Dungeons & Moles App

React Native + Expo frontend for Dungeons & Moles.

This client connects to the on-chain programs in `../solana-programs` and supports PvE runs plus PvP modes (Pit Draft, Duels, Gauntlet), including combat replay visualization and mode-specific history/ranking screens.

## Features

- Wallet connection and session-signer wallet session flow
- On-chain session lifecycle (start, resume, switch, abandon, cleanup)
- PvE campaign gameplay with map exploration, POIs, enemies, and boss fights
- Campaign selection and multi-session management
- Pit Draft PvP mode (queue, match, instant combat replay)
- Duels PvP mode (async queue + seed-matched run flow)
- Gauntlet PvP mode (5-week async mode with echo fights, history, ranking)
- Combat replay UI with deterministic log playback
- NFT marketplace (list, buy, cancel)
- Player profile creation and account management
- Items/inventory management with skin equipping
- Death and victory screens with run summaries
- Controller/gamepad navigation across all screens (via psg1-sim)
- Responsive compact and wide screen variants
- Mobile and web support through Expo

## Tech Stack

- React Native 0.81.5 + Expo SDK 54
- TypeScript 5.9
- React 19.1
- @coral-xyz/anchor 0.32 + @solana/web3.js 1.98
- React Navigation 7
- React Native Skia (combat/game rendering)
- React Native Reanimated (animations)
- psg1-sim (console simulator with gamepad support)
- AsyncStorage + Expo SecureStore (persistence)

## Prerequisites

- Node.js 18+
- npm
- Running Solana programs from `../solana-programs`

Optional for mobile wallet flow:

- Android/iOS device or emulator
- Solana wallet app compatible with Mobile Wallet Adapter

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:

```bash
# Solana cluster
EXPO_PUBLIC_SOLANA_CLUSTER=devnet
EXPO_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899

# MagicBlock Ephemeral Rollup endpoints
EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT=http://127.0.0.1:7799
EXPO_PUBLIC_EPHEMERAL_WS_ENDPOINT=ws://127.0.0.1:7800

# Program IDs (must match deployed programs from ../solana-programs)
EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_FIELD_ENEMIES_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_NFT_MARKETPLACE_PROGRAM_ID=<pubkey>
EXPO_PUBLIC_TREASURY_PUBKEY=<pubkey>
```

Optional:

```bash
# VRF randomness endpoint (seed/value/randomness payloads)
EXPO_PUBLIC_MAGICBLOCK_VRF_ENDPOINT=
```

Notes:

- Program IDs must match your deployed programs from `../solana-programs`.
- For local development, point `EXPO_PUBLIC_SOLANA_RPC_URL` to your local validator.
- ER endpoints default to `https://devnet.magicblock.app/` if not set.

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