# Dungeons & Moles App

React Native + Expo frontend for Dungeons & Moles.

This client connects to the on-chain programs in `solana-programs` and supports PvE runs plus PvP modes (Pit Draft, Duels, Gauntlet), including combat replay visualization and mode-specific history/ranking screens.

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
- Running Solana programs from `solana-programs`

Optional for mobile wallet flow:

- Android/iOS device or emulator
- Solana wallet app compatible with Mobile Wallet Adapter

## Environment Files

This app uses two explicit env templates:

- `.env.localnet`
- `.env.devnet`

To switch mode, copy one of them to `.env`:

```bash
cp .env.localnet .env
# or
cp .env.devnet .env
```

Program ID values in the env file must match what you deployed from `solana-programs`.

## Localnet Setup (MagicBlock ER + local VRF flow)

From the `solana-programs` repo, start both validators in separate terminals:

```bash
mb-test-validator --reset --ledger .mb-ledger --rpc-port 8899 --faucet-port 9901
```

```bash
ephemeral-validator \
    --remotes http://127.0.0.1:8899 \
    --remotes ws://127.0.0.1:8900 \
    --listen 127.0.0.1:7799 \
    --storage /tmp/mb-er-storage \
    --reset
```

Build/deploy/init the programs:

```bash
solana config set --url http://127.0.0.1:8899
anchor build
anchor deploy --provider.cluster localnet --skip-build
anchor run init
```

Start the local VRF oracle in a separate terminal. Use the real binary path so logs are visible.

For this app's current localnet flow, the fallback VRF requests are sent on the base layer and
the client waits for fulfillment on base-layer VRF state PDAs. That means the local oracle must
watch the base validator, not the ER.

```bash
REAL=/home/ailton/.local/share/mise/installs/node/24.11.1/lib/node_modules/@magicblock-labs/ephemeral-validator/node_modules/@magicblock-labs/vrf-oracle-linux-x64/bin/vrf-oracle

RUST_LOG=info \
VRF_ORACLE_SKIP_PREFLIGHT=true \
RPC_URL=http://127.0.0.1:8899 \
WEBSOCKET_URL=ws://127.0.0.1:8999 \
"$REAL"
```

If the oracle is pointed at ER (`7799/7800`) while the app is using the base-layer localnet
fallback VRF path, fulfillment will time out because the oracle will never see those requests.

The local oracle only services its own queue PDA. In the packaged local dumps that queue is `GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb`, so `.env.localnet` pins `EXPO_PUBLIC_VRF_ORACLE_QUEUE` to that value.

Then run the app in localnet mode:

```bash
cd ../app
cp .env.localnet .env
npm start
```

## Devnet Setup (real VRF callback flow)

Build/deploy/init on devnet:

```bash
solana config set --url devnet
anchor build
anchor deploy --provider.cluster devnet
anchor run init
```

Then run the app in devnet mode:

```bash
cd ../app
cp .env.devnet .env
npm start
```

Notes:

- Localnet and devnet both use `request_*_vrf` and wait for MagicBlock VRF fulfill callbacks.
- Localnet requires the local VRF oracle/queue to be running before session start.
- If you change on-chain instruction/account layouts, re-copy fresh IDLs from `solana-programs/target/idl` into `src/services/solana/idl`.

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
