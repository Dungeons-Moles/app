# Dungeons & Moles

A mobile-first Solana auto-battler dungeon crawler inspired by "He is Coming". Built with React Native, Expo, and the Solana Mobile Stack.

## Current Status

This is the initial scaffold with two functional screens:

### Implemented

- **Account Screen**: Wallet connection via Mobile Wallet Adapter (MWA), local profile creation
- **Hub Screen**: Main menu with game mode buttons (stubbed) and rules display
- **Wallet Integration**: Solana Mobile Wallet Adapter for devnet
- **Profile Persistence**: Local player profiles stored securely via expo-secure-store
- **Game Canvas**: Placeholder Skia canvas ready for future game rendering

### Not Yet Implemented

- Dungeon map generation
- Combat system
- Inventory/items/enemies/bosses
- Onchain transactions
- Backend services

## Tech Stack

- **React Native + Expo** (SDK 54)
- **Solana Mobile Stack** (Mobile Wallet Adapter)
- **React Native Skia** for game rendering
- **React Navigation** for screen navigation
- **TypeScript** throughout

## Getting Started

### Prerequisites

- Node.js 18+
- Android Studio with an emulator or physical Android device
- A Solana wallet app installed on your device (e.g., Phantom, Solflare)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

### Running on Android

**Option 1: Using Expo Go (limited - MWA won't work)**
```bash
npm start
# Scan QR code with Expo Go app
```

**Option 2: Development build (recommended for wallet testing)**
```bash
# Build and run on connected device/emulator
npm run android
```

For wallet connection to work, you need:
1. A development build (not Expo Go)
2. A Solana wallet app installed on the same device
3. The wallet app must support Mobile Wallet Adapter

### Running on iOS

```bash
npm run ios
```
Note: Requires macOS with Xcode. Wallet connection requires a physical device.

## Project Structure

```
app/
├── src/
│   ├── components/     # Shared UI components
│   ├── contexts/       # React contexts (Wallet, Profile)
│   ├── game/           # Game logic and Skia canvas
│   ├── navigation/     # React Navigation setup
│   ├── screens/        # Account and Hub screens
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions (storage, etc.)
│   └── polyfills.ts    # Required polyfills for web3.js
├── App.tsx             # Main app entry
├── app.json            # Expo configuration
└── package.json
```

## Game Rules (Preview)

- **Week Structure**: day → night → day → night → day → night → boss
- **Day Phase**: 50 moves
- **Night Phase**: 30 moves
- **Cycles per Week**: 3

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Format code
npm run format
```

## Troubleshooting

### Wallet connection fails
- Ensure you have a Solana wallet app installed
- Make sure you're using a development build, not Expo Go
- Check that the wallet supports Mobile Wallet Adapter

### Metro bundler issues
```bash
# Clear cache and restart
npx expo start --clear
```

### Skia rendering issues
- Ensure you're running on a device/emulator, not web
- Check that the new architecture is enabled in app.json

## License

MIT
